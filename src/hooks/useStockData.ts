import { useState, useEffect, useCallback, useRef } from 'react';
import { StockDetailsResponse, MarketSession, ETFHoldingsData, AssetAbout, PriceAlert, EarningsResponse, ActivityEvent, AnalystEvent } from '../types';
import { DividendEvent, DividendCredit } from '../types';
import {
  getStockDetails,
  getStockQuote,
  getFastQuote,
  getIntradayCandles,
  getHourlyCandles,
  IntradayCandle,
  getDividendEvents,
  getDividendCredits,
  getETFHoldings,
  getAssetAbout,
  getPriceAlerts,
  getEarnings,
  getTickerActivity,
  getAnalystEvents,
  AIEventsResponse,
  getAIEvents,
  getStockFollowStatus,
} from '../api';

/**
 * Hook that manages all stock data fetching: quote, candles, dividends,
 * earnings, about, ETF holdings, price alerts, follow status, and AI events.
 *
 * @param ticker - Stock ticker symbol
 * @param chartPeriod - Current chart period (used for AI events and hourly candle selection)
 */
export function useStockData(ticker: string, chartPeriod: string) {
  const [data, setData] = useState<StockDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickLoaded, setQuickLoaded] = useState(false);
  const [candlesLoaded, setCandlesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchStaleRef = useRef(false);

  // Intraday candles for 1D chart (from Yahoo Finance via API)
  const [intradayCandles, setIntradayCandles] = useState<IntradayCandle[]>([]);

  // Hourly candles for 1W/1M (finer-grained than daily)
  const [hourlyCandles, setHourlyCandles] = useState<IntradayCandle[]>([]);

  // Legacy live prices kept as fallback
  const [livePrices, setLivePrices] = useState<{ time: string; price: number }[]>([]);

  // Cache for prefetched hourly data
  const hourlyCache = useRef<Record<string, IntradayCandle[]>>({});

  // Track current chart period via ref so async fetch reads the latest value
  const chartPeriodRef = useRef(chartPeriod);
  chartPeriodRef.current = chartPeriod;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dividend data for this ticker
  const [tickerDividends, setTickerDividends] = useState<DividendEvent[]>([]);
  const [tickerCredits, setTickerCredits] = useState<DividendCredit[]>([]);

  // ETF holdings data
  const [etfHoldings, setEtfHoldings] = useState<ETFHoldingsData | null>(null);

  // About data (description, category, etc.)
  const [about, setAbout] = useState<AssetAbout | null>(null);

  // Earnings data for chart events
  const [earnings, setEarnings] = useState<EarningsResponse | null>(null);

  // Trade events for chart events
  const [tradeEvents, setTradeEvents] = useState<ActivityEvent[]>([]);

  // News and analyst events for chart events
  const [analystEvents, setAnalystEvents] = useState<AnalystEvent[]>([]);

  // AI-powered events from Perplexity
  const [aiEvents, setAiEvents] = useState<AIEventsResponse | null>(null);
  const [aiEventsLoaded, setAiEventsLoaded] = useState(false);

  // Stock follow
  const [isFollowingStock, setIsFollowingStock] = useState(false);

  // Price alerts
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);

  const fetchPriceAlerts = useCallback(() => {
    getPriceAlerts(ticker).then(setPriceAlerts).catch(() => setPriceAlerts([]));
  }, [ticker]);

  // Fetch supplementary data (dividends, earnings, about, etc.)
  useEffect(() => {
    let stale = false;
    getDividendEvents(ticker).then(d => { if (!stale) setTickerDividends(d); }).catch(e => console.error('Dividend events fetch failed:', e));
    getDividendCredits(ticker).then(d => { if (!stale) setTickerCredits(d); }).catch(e => console.error('Dividend credits fetch failed:', e));
    getEarnings(ticker).then(d => { if (!stale) setEarnings(d); }).catch(() => { if (!stale) setEarnings(null); });
    getTickerActivity(ticker).then(d => { if (!stale) setTradeEvents(d); }).catch(() => { if (!stale) setTradeEvents([]); });
    getAnalystEvents(50, ticker).then(d => { if (!stale) setAnalystEvents(d); }).catch(() => { if (!stale) setAnalystEvents([]); });
    getETFHoldings(ticker).then(d => { if (!stale) setEtfHoldings(d); }).catch(() => { if (!stale) setEtfHoldings(null); });
    getAssetAbout(ticker).then(d => { if (!stale) setAbout(d); }).catch(() => { if (!stale) setAbout(null); });
    fetchPriceAlerts();
    getStockFollowStatus(ticker).then(({ following }) => { if (!stale) setIsFollowingStock(following); }).catch(() => { if (!stale) setIsFollowingStock(false); });
    return () => { stale = true; };
  }, [ticker, fetchPriceAlerts]);

  // Fetch AI-powered events (Perplexity) — period-aware
  useEffect(() => {
    const periodDays: Record<string, number> = {
      '1D': 0, '1W': 14, '1M': 45, '3M': 100, 'YTD': 365, '1Y': 730, 'MAX': 7300,
    };
    const days = periodDays[chartPeriod] || 90;
    if (days === 0) { setAiEvents(null); setAiEventsLoaded(true); return; } // skip 1D
    let stale = false;
    setAiEventsLoaded(false);
    getAIEvents(ticker, days).then(r => { if (!stale) { setAiEvents(r); setAiEventsLoaded(true); } }).catch(() => { if (!stale) { setAiEvents(null); setAiEventsLoaded(true); } });
    return () => { stale = true; };
  }, [ticker, chartPeriod]);

  // Initial fetch — progressive loading: quote + chart first (fast), then full details
  const fetchInitial = useCallback(async () => {
    setCandlesLoaded(false);
    try {
      // PHASE 1: Quick load - quote + chart candles via Yahoo Finance (all fast, no queue)
      const [quoteResult, intraday, hourly1W, hourly1M] = await Promise.all([
        getFastQuote(ticker).catch(e => { console.error('Fast quote fetch failed:', e); return null; }),
        getIntradayCandles(ticker).catch(e => { console.error('Intraday candles fetch failed:', e); return []; }),
        getHourlyCandles(ticker, '1W').catch(e => { console.error('Hourly 1W candles fetch failed:', e); return []; }),
        getHourlyCandles(ticker, '1M').catch(e => { console.error('Hourly 1M candles fetch failed:', e); return []; }),
      ]);

      if (fetchStaleRef.current) return;

      // If fast quote succeeded, show it immediately
      if (quoteResult) {
        setData({
          ticker,
          quote: quoteResult,
          profile: null,
          metrics: null,
          candles: null,
        });
        setIntradayCandles(intraday);
        hourlyCache.current = { '1W': hourly1W, '1M': hourly1M };
        const currentPeriod = chartPeriodRef.current;
        if (currentPeriod === '1W') setHourlyCandles(hourly1W);
        else if (currentPeriod === '1M') setHourlyCandles(hourly1M);
        setQuickLoaded(true);

        // Seed live prices with current price
        const now = new Date().toISOString();
        setLivePrices([{ time: now, price: quoteResult.currentPrice }]);
      }

      // PHASE 2: Full load - profile, metrics, historical candles (slower - Finnhub queue)
      const result = await getStockDetails(ticker);
      if (fetchStaleRef.current) return;

      setData(result);
      setIntradayCandles(prev => intraday.length > 0 ? intraday : prev);
      setQuickLoaded(true);
      setCandlesLoaded(true);
      setError(null);
    } catch (err) {
      if (!fetchStaleRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load stock details');
        setQuickLoaded(true); // Show whatever we have instead of infinite skeleton
      }
    } finally {
      if (!fetchStaleRef.current) setLoading(false);
    }
  }, [ticker]);

  // Poll — refresh quote + intraday candles
  const pollQuote = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [quote, intraday] = await Promise.all([
        getStockQuote(ticker),
        getIntradayCandles(ticker).catch(e => { console.error('Intraday candles poll failed:', e); return null; }),
      ]);
      setData(prev => {
        if (!prev) return prev;
        // Preserve the best high/low/open across poll updates (Yahoo initial + Finnhub polls)
        const high = Math.max(quote.high || 0, prev.quote.high || 0) || quote.high;
        const low = (quote.low > 0 && prev.quote.low > 0) ? Math.min(quote.low, prev.quote.low) : (quote.low || prev.quote.low);
        const open = quote.open > 0 ? quote.open : prev.quote.open;
        return { ...prev, quote: { ...quote, high, low, open } };
      });
      if (intraday && intraday.length > 0) {
        setIntradayCandles(intraday);
      }
      // Append to live prices as fallback (use extended price if available)
      const now = new Date().toISOString();
      const livePrice = quote.extendedPrice ?? quote.currentPrice;
      setLivePrices(prev => {
        const next = [...prev, { time: now, price: livePrice }];
        return next.length > 500 ? next.slice(-500) : next;
      });
    } catch (e) {
      console.error('Quote poll failed:', e);
    }
  }, [ticker]);

  // Reset + fetch on ticker change
  useEffect(() => {
    setLoading(true);
    setQuickLoaded(false);
    setError(null);
    setData(null);
    setLivePrices([]);
    setIntradayCandles([]);
    fetchStaleRef.current = false;
    fetchInitial();
    return () => { fetchStaleRef.current = true; };
  }, [fetchInitial]);

  // Polling interval — adaptive based on market session
  useEffect(() => {
    if (!data) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    const session = data.quote.session as MarketSession | undefined;
    const isActive = session === 'REG' || session === 'PRE' || session === 'POST';
    const pollMs = isActive ? 10000 : 30000;

    intervalRef.current = setInterval(pollQuote, pollMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data?.quote.session, pollQuote]);

  return {
    data,
    setData,
    loading,
    quickLoaded,
    candlesLoaded,
    setCandlesLoaded,
    error,
    tickerDividends,
    tickerCredits,
    etfHoldings,
    about,
    earnings,
    tradeEvents,
    analystEvents,
    aiEvents,
    aiEventsLoaded,
    priceAlerts,
    isFollowingStock,
    setIsFollowingStock,
    fetchPriceAlerts,
    intradayCandles,
    setIntradayCandles,
    livePrices,
    setLivePrices,
    hourlyCandles,
    setHourlyCandles,
    hourlyCache,
  };
}
