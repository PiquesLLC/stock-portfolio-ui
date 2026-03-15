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
