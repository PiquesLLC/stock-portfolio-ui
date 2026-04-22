import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { IntradayCandle } from '../api';

const oneDayCandles: IntradayCandle[] = Array.from({ length: 10 }, (_, i) => ({
  time: new Date(2026, 3, 22, 9, 30 + i).toISOString(),
  open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000,
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getCandleData: vi.fn((_ticker: string, period: string) => {
      if (period === '1D') return Promise.resolve(oneDayCandles);
      // 1W never resolves during this test
      return new Promise<IntradayCandle[]>(() => {});
    }),
  };
});

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key: string, initial: unknown) => {
    if (key === 'stockChartMode') return ['candle', vi.fn()];
    if (key === 'stockCandleInterval') return ['5m', vi.fn()];
    return [initial, vi.fn()];
  },
}));

// Spy CandlestickRenderer: capture every invocation with props
const rendererCalls: { period: string; candleCount: number }[] = [];
let currentPeriod = '1D';
vi.mock('./CandlestickRenderer', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    CandlestickRenderer: (props: { candles: unknown[] }) => {
      rendererCalls.push({ period: currentPeriod, candleCount: props.candles.length });
      return React.createElement('g', { className: 'candlesticks-mock' });
    },
  };
});

import { StockPriceChart } from './StockPriceChart';

const baseProps = {
  ticker: 'AAPL',
  candles: null,
  candlesLoaded: true,
  intradayCandles: [],
  hourlyCandles: [],
  livePrices: [],
  currentPrice: 100,
  previousClose: 99,
  session: 'REG',
  onPeriodChange: () => {},
} as const;

describe('StockPriceChart candle period-switch atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rendererCalls.length = 0;
    currentPeriod = '1D';
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('does not render stale 1D candles during the render frame where selectedPeriod is 1W', async () => {
    const { rerender } = render(
      <StockPriceChart {...(baseProps as any)} selectedPeriod="1D" />
    );
    // Wait for 1D fetch to populate candles
    await waitFor(() => {
      const hadCandles = rendererCalls.some(c => c.period === '1D' && c.candleCount > 0);
      expect(hadCandles).toBe(true);
    });
    // Switch period to 1W. From THIS frame forward, any CandlestickRenderer
    // call must see 0 candles — otherwise the component is rendering 1D data
    // with a 1W axis context (the flicker).
    rendererCalls.length = 0;
    currentPeriod = '1W';
    rerender(<StockPriceChart {...(baseProps as any)} selectedPeriod="1W" />);
    // Give microtasks a chance so effects can run, but don't resolve the pending 1W fetch
    await Promise.resolve();
    await Promise.resolve();
    // Every render captured under currentPeriod=1W must have 0 candles.
    // Under the bug, the first render frame after rerender carries the old 10 candles.
    const framesWithStaleData = rendererCalls.filter(c => c.period === '1W' && c.candleCount > 0);
    expect(framesWithStaleData).toEqual([]);
  });
});
