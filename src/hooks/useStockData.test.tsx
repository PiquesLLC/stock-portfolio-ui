import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStockData } from './useStockData';
import * as api from '../api';

vi.mock('../api', () => ({
  getStockDetails: vi.fn(),
  getStockQuote: vi.fn(),
  getFastQuote: vi.fn(),
  getIntradayCandles: vi.fn(),
  getHourlyCandles: vi.fn(),
  getDividendEvents: vi.fn(),
  getDividendCredits: vi.fn(),
  getETFHoldings: vi.fn(),
  getAssetAbout: vi.fn(),
  getPriceAlerts: vi.fn(),
  getEarnings: vi.fn(),
  getTickerActivity: vi.fn(),
  getAnalystEvents: vi.fn(),
  getAIEvents: vi.fn(),
  getStockFollowStatus: vi.fn(),
}));

const mockGetStockDetails = vi.mocked(api.getStockDetails);
const mockGetStockQuote = vi.mocked(api.getStockQuote);
const mockGetFastQuote = vi.mocked(api.getFastQuote);
const mockGetIntradayCandles = vi.mocked(api.getIntradayCandles);
const mockGetHourlyCandles = vi.mocked(api.getHourlyCandles);
const mockGetDividendEvents = vi.mocked(api.getDividendEvents);
const mockGetDividendCredits = vi.mocked(api.getDividendCredits);
const mockGetETFHoldings = vi.mocked(api.getETFHoldings);
const mockGetAssetAbout = vi.mocked(api.getAssetAbout);
const mockGetPriceAlerts = vi.mocked(api.getPriceAlerts);
const mockGetEarnings = vi.mocked(api.getEarnings);
const mockGetTickerActivity = vi.mocked(api.getTickerActivity);
const mockGetAnalystEvents = vi.mocked(api.getAnalystEvents);
const mockGetAIEvents = vi.mocked(api.getAIEvents);
const mockGetStockFollowStatus = vi.mocked(api.getStockFollowStatus);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fastQuote = {
  ticker: 'AAPL',
  currentPrice: 100,
  change: 1,
  percentChange: 1,
  high: 101,
  low: 99,
  open: 100,
  previousClose: 99,
  timestamp: 1,
  updatedAt: Date.now(),
  isStale: false,
  isRepricing: false,
  quoteAgeSeconds: 0,
  session: 'REG',
};

const stockDetails = {
  ticker: 'AAPL',
  quote: fastQuote,
  profile: null,
  metrics: null,
  candles: [],
};

describe('useStockData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFastQuote.mockResolvedValue(fastQuote as any);
    mockGetStockQuote.mockResolvedValue(fastQuote as any);
    mockGetStockDetails.mockResolvedValue(stockDetails as any);
    mockGetIntradayCandles.mockResolvedValue([]);
    mockGetDividendEvents.mockResolvedValue([]);
    mockGetDividendCredits.mockResolvedValue([]);
    mockGetETFHoldings.mockResolvedValue(null as any);
    mockGetAssetAbout.mockResolvedValue(null as any);
    mockGetEarnings.mockResolvedValue(null as any);
    mockGetTickerActivity.mockResolvedValue([]);
    mockGetAnalystEvents.mockResolvedValue([]);
    mockGetAIEvents.mockResolvedValue(null as any);
    mockGetStockFollowStatus.mockResolvedValue({ following: false, followerCount: 0 });
  });

  it('clears hourly chart data immediately when the ticker changes', async () => {
    const aapl1W = [{ close: 101, time: 'aapl-1w' }];
    const aapl1M = [{ close: 102, time: 'aapl-1m' }];
    const msft1W = deferred<any[]>();
    const msft1M = deferred<any[]>();

    mockGetHourlyCandles.mockImplementation((ticker, period) => {
      if (ticker === 'AAPL' && period === '1W') return Promise.resolve(aapl1W as any);
      if (ticker === 'AAPL' && period === '1M') return Promise.resolve(aapl1M as any);
      if (ticker === 'MSFT' && period === '1W') return msft1W.promise as Promise<any>;
      if (ticker === 'MSFT' && period === '1M') return msft1M.promise as Promise<any>;
      return Promise.resolve([] as any);
    });
    mockGetPriceAlerts.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ ticker, chartPeriod }) => useStockData(ticker, chartPeriod),
      { initialProps: { ticker: 'AAPL', chartPeriod: '1W' } },
    );

    await waitFor(() => {
      expect(result.current.hourlyCandles).toEqual(aapl1W);
    });

    rerender({ ticker: 'MSFT', chartPeriod: '1W' });

    await waitFor(() => {
      expect(result.current.hourlyCandles).toEqual([]);
    });
  });

  // Regression: the "Robinhood chart goes weird on revisit" bug class.
  // A slow getStockQuote response for the previous ticker must not merge
  // into the new ticker's `data` via pollQuote's setData(prev => ...).
  it('rejects stale pollQuote responses from the previous ticker', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setInterval', 'clearInterval'] });
    try {
      const aaplPollQuote = deferred<any>();
      let stockQuoteCallCount = 0;
      mockGetStockQuote.mockImplementation((ticker: string) => {
        stockQuoteCallCount += 1;
        if (ticker === 'AAPL' && stockQuoteCallCount === 1) return aaplPollQuote.promise as Promise<any>;
        return Promise.resolve({ ...fastQuote, ticker, currentPrice: 200 } as any);
      });
      mockGetHourlyCandles.mockResolvedValue([]);
      mockGetPriceAlerts.mockResolvedValue([]);
      mockGetFastQuote.mockImplementation((ticker: string) =>
        Promise.resolve({ ...fastQuote, ticker, currentPrice: ticker === 'AAPL' ? 100 : 300 } as any),
      );
      mockGetStockDetails.mockImplementation((ticker: string) =>
        Promise.resolve({ ...stockDetails, ticker, quote: { ...fastQuote, ticker, currentPrice: ticker === 'AAPL' ? 100 : 300 } } as any),
      );

      const { result, rerender } = renderHook(
        ({ ticker }) => useStockData(ticker, '1D'),
        { initialProps: { ticker: 'AAPL' } },
      );

      // Wait for AAPL initial load — this also kicks off the polling interval.
      await waitFor(() => {
        expect(result.current.data?.quote.ticker).toBe('AAPL');
      });

      // Fire the next poll tick (REG-session cadence is 10s). The mock returns
      // a deferred for the first AAPL poll, so the response is suspended.
      vi.advanceTimersByTime(10_000);

      // User swipes to MSFT before the AAPL poll resolves.
      rerender({ ticker: 'MSFT' });
      await waitFor(() => {
        expect(result.current.data?.quote.ticker).toBe('MSFT');
      });

      // Now resolve the stale AAPL poll with obviously-wrong values across
      // every field the poll merge touches. If the requestId guard is broken,
      // pollQuote's setData(prev => ...) at useStockData.ts:207-209 preserves
      // high/low/open via merge logic, so a leak could manifest in any of those
      // fields — not just currentPrice. Assert on all of them.
      aaplPollQuote.resolve({
        ...fastQuote,
        ticker: 'AAPL',
        currentPrice: 99999,
        high: 99999,
        low: 99999,
        open: 99999,
      });

      // Give the microtask queue a chance to apply (it shouldn't).
      await Promise.resolve();
      await Promise.resolve();

      expect(result.current.data?.quote.ticker).toBe('MSFT');
      expect(result.current.data?.quote.currentPrice).not.toBe(99999);
      expect(result.current.data?.quote.high).not.toBe(99999);
      expect(result.current.data?.quote.low).not.toBe(99999);
      expect(result.current.data?.quote.open).not.toBe(99999);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores late price-alert responses from the previous ticker', async () => {
    const aaplAlerts = deferred<any[]>();
    mockGetHourlyCandles.mockResolvedValue([]);
    mockGetPriceAlerts.mockImplementation((ticker) => {
      if (ticker === 'AAPL') return aaplAlerts.promise as Promise<any>;
      if (ticker === 'MSFT') {
        return Promise.resolve([
          { id: 'msft-alert', ticker: 'MSFT', type: 'above', targetPrice: 500 },
        ] as any);
      }
      return Promise.resolve([]);
    });

    const { result, rerender } = renderHook(
      ({ ticker, chartPeriod }) => useStockData(ticker, chartPeriod),
      { initialProps: { ticker: 'AAPL', chartPeriod: '1D' } },
    );

    rerender({ ticker: 'MSFT', chartPeriod: '1D' });

    await waitFor(() => {
      expect(result.current.priceAlerts).toEqual([
        expect.objectContaining({ id: 'msft-alert', ticker: 'MSFT' }),
      ]);
    });

    aaplAlerts.resolve([
      { id: 'aapl-alert', ticker: 'AAPL', type: 'above', targetPrice: 250 },
    ] as any);

    await waitFor(() => {
      expect(result.current.priceAlerts).toEqual([
        expect.objectContaining({ id: 'msft-alert', ticker: 'MSFT' }),
      ]);
      expect(result.current.priceAlerts).not.toEqual([
        expect.objectContaining({ id: 'aapl-alert', ticker: 'AAPL' }),
      ]);
    });
  });
});
