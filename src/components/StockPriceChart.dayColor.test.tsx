import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import type { IntradayCandle } from '../api';

// A regular session that closed UP: 100 -> 101 against a previousClose of 100.
const regularSession: IntradayCandle[] = Array.from({ length: 10 }, (_, i) => ({
  time: new Date(2026, 3, 22, 9, 30 + i).toISOString(),
  open: 100, high: 101.5, low: 99.5, close: 100 + i * 0.1, volume: 1000,
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, getCandleData: vi.fn(() => new Promise<IntradayCandle[]>(() => {})) };
});

// Line mode, not candles. Setter identity must be stable — see the sibling
// candleFlicker test for what an unstable one does to this component.
vi.mock('../hooks/useLocalStorage', () => {
  const setters = new Map<string, () => void>();
  const setterFor = (key: string) => {
    if (!setters.has(key)) setters.set(key, vi.fn());
    return setters.get(key)!;
  };
  return {
    useLocalStorage: (key: string, initial: unknown) => {
      if (key === 'stockChartMode') return ['line', setterFor(key)];
      return [initial, setterFor(key)];
    },
  };
});

import { StockPriceChart } from './StockPriceChart';

const GREEN = '#0A9E10';
const RED = '#B87872';

const baseProps = {
  ticker: 'AAPL',
  candles: null,
  candlesLoaded: true,
  intradayCandles: regularSession,
  hourlyCandles: [],
  livePrices: [],
  selectedPeriod: '1D',
  previousClose: 100,
  currentPrice: 101,   // the 4 PM close: +1% on the day
  // CLOSED is the only session where the API leaves currentPrice at the 4 PM
  // close and puts the extended print in extendedPrice alone; in PRE/POST every
  // writer sets both to the same value. So this is the shape worth pinning.
  session: 'CLOSED',
  onPeriodChange: () => {},
} as const;

// The fixture's candles are dated in the past, so buildPoints takes its stale-session
// branch and never appends the live quote: the last DRAWN point is the final candle
// close, 100.9 — above previousClose, i.e. green if you color off the drawn tail.
const LAST_DRAWN = 100.9;

const strokes = (c: HTMLElement) =>
  new Set(Array.from(c.querySelectorAll('path[stroke]')).map(p => p.getAttribute('stroke')));

describe('1D chart color follows the whole day, extended hours included', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('stays GREEN when after hours gives back only part of the gain', () => {
    // Jon 2026-08-11: +1% on the day, then -0.85% after the bell, is still a
    // green day -- 100 -> 101 -> 100.14 ends above previousClose.
    const { container } = render(
      <StockPriceChart {...(baseProps as any)} extendedPrice={100.14} />
    );
    expect(strokes(container).has(GREEN)).toBe(true);
    expect(strokes(container).has(RED)).toBe(false);
  });

  it('turns RED when after hours erases the whole gain', () => {
    // The discriminating case: the drawn tail ends at LAST_DRAWN (green), so a
    // chart colored off the tail reads green while the day is actually -1.5%.
    const { container } = render(
      <StockPriceChart {...(baseProps as any)} extendedPrice={98.5} />
    );
    expect(LAST_DRAWN).toBeGreaterThan(baseProps.previousClose); // the tail says green
    expect(strokes(container).has(RED)).toBe(true);
    expect(strokes(container).has(GREEN)).toBe(false);
  });

  it('still colors off the live quote when there is no extended print', () => {
    // No extended print and the quote has slipped below previousClose, while the
    // drawn tail is still above it. The day is red — the tail must not win.
    const { container } = render(
      <StockPriceChart {...(baseProps as any)} currentPrice={99} extendedPrice={undefined} />
    );
    expect(strokes(container).has(RED)).toBe(true);
    expect(strokes(container).has(GREEN)).toBe(false);
  });

  it('ignores a zero/missing quote rather than painting the day red', () => {
    // Compare passes `currentPrice ?? 0`; a zero must not read as a -100% day.
    // It falls back to the drawn tail, which is above previousClose.
    const { container } = render(
      <StockPriceChart {...(baseProps as any)} currentPrice={0} extendedPrice={undefined} />
    );
    expect(strokes(container).has(GREEN)).toBe(true); // rendered, and green
    expect(strokes(container).has(RED)).toBe(false);
  });
});
