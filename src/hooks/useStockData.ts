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
  const requestIdRef = useRef(0);

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

  const fetchPriceAlerts = useCallback(async () => {
    try {
      const alerts = await getPriceAlerts(ticker);
      setPriceAlerts(alerts);
    } catch {
      setPriceAlerts([]);
    }
  }, [ticker]);

  // Fetch supplementary data (dividends, earnings, about, etc.)
  useEffect(() => {
    let stale = false;
    setTickerDividends([]);
    setTickerCredits([]);
    setEarnings(null);
    setTradeEvents([]);
    setAnalystEvents([]);
    setEtfHoldings(null);
    setAbout(null);
    setPriceAlerts([]);
    setIsFollowingStock(false);
    getDividendEvents(ticker).then(d => { if (!stale) setTickerDividends(d); }).catch(e => console.error('Dividend events fetch failed:', e));
    getDividendCredits(ticker).then(d => { if (!stale) setTickerCredits(d); }).catch(e => console.error('Dividend credits fetch failed:', e));
    getEarnings(ticker).then(d => { if (!stale) setEarnings(d); }).catch(() => { if (!stale) setEarnings(null); });
    getTickerActivity(ticker).then(d => { if (!stale) setTradeEvents(d); }).catch(() => { if (!stale) setTradeEvents([]); });
    getAnalystEvents(50, ticker).then(d => { if (!stale) setAnalystEvents(d); }).catch(() => { if (!stale) setAnalystEvents([]); });
    getETFHoldings(ticker).then(d => { if (!stale) setEtfHoldings(d); }).catch(() => { if (!stale) setEtfHoldings(null); });
    getAssetAbout(ticker).then(d => { if (!stale) setAbout(d); }).catch(() => { if (!stale) setAbout(null); });
    getPriceAlerts(ticker).then(d => { if (!stale) setPriceAlerts(d); }).catch(() => { if (!stale) setPriceAlerts([]); });
    getStockFollowStatus(ticker).then(({ following }) => { if (!stale) setIsFollowingStock(following); }).catch(() => { if (!stale) setIsFollowingStock(false); });
    return () => { stale = true; };
  }, [ticker]);

  // Fetch AI-powered events (Perplexity) — period-aware
  useEffect(() => {
    const periodDays: Record<string, number> = {
      '1D': 0, '1W': 14, '1M': 45, '3M': 100, '6M': 200, 'YTD': 365, '1Y': 730, 'MAX': 7300,
    };
    const days = periodDays[chartPeriod] || 90;
    setAiEvents(null);
    if (days === 0) { setAiEvents(null); setAiEventsLoaded(true); return; } // skip 1D
    let stale = false;
    setAiEventsLoaded(false);
    getAIEvents(ticker, days).then(r => { if (!stale) { setAiEvents(r); setAiEventsLoaded(true); } }).catch(() => { if (!stale) { setAiEvents(null); setAiEventsLoaded(true); } });
    return () => { stale = true; };
  }, [ticker, chartPeriod]);

  // Initial fetch — progressive loading: quote + chart first (fast), then full details
  const fetchInitial = useCallback(async (requestId: number) => {
    setCandlesLoaded(false);
    try {
      // PHASE 1: Quick load - only fetch what the default 1D open state needs.
      // Don't block the whole stock view on 1W/1M hourly prefetch.
      const [quoteResult, intraday] = await Promise.all([
        getFastQuote(ticker).catch(e => { console.error('Fast quote fetch failed:', e); return null; }),
        getIntradayCandles(ticker).catch(e => { console.error('Intraday candles fetch failed:', e); return []; }),
      ]);

      if (requestIdRef.current !== requestId) return;

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
        setQuickLoaded(true);

        // Seed live prices with current price
        const now = new Date().toISOString();
        setLivePrices([{ time: now, price: quoteResult.currentPrice }]);
      }

      // Prefetch hourly data in the background so period switches stay snappy,
      // but don't hold up initial stock-detail paint for it.
      Promise.all([
        getHourlyCandles(ticker, '1W').catch(e => { console.error('Hourly 1W candles fetch failed:', e); return []; }),
        getHourlyCandles(ticker, '1M').catch(e => { console.error('Hourly 1M candles fetch failed:', e); return []; }),
      ]).then(([hourly1W, hourly1M]) => {
        if (requestIdRef.current !== requestId) return;
        hourlyCache.current = { '1W': hourly1W, '1M': hourly1M };
        const currentPeriod = chartPeriodRef.current;
        if (currentPeriod === '1W') setHourlyCandles(hourly1W);
        else if (currentPeriod === '1M') setHourlyCandles(hourly1M);
      });

      // PHASE 2: Full load - profile, metrics, historical candles (slower - Finnhub queue)
      const result = await getStockDetails(ticker);
      if (requestIdRef.current !== requestId) return;

      setData(result);
      setIntradayCandles(prev => intraday.length > 0 ? intraday : prev);
      setQuickLoaded(true);
      setCandlesLoaded(true);
      setError(null);
    } catch (err) {
      if (requestIdRef.current === requestId) {
        setError(err instanceof Error ? err.message : 'Failed to load stock details');
        setQuickLoaded(true); // Show whatever we have instead of infinite skeleton
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
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
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setQuickLoaded(false);
    setError(null);
    setData(null);
    setLivePrices([]);
    setIntradayCandles([]);
    setHourlyCandles([]);
    hourlyCache.current = {};
    fetchInitial(requestId);
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
  // `data` used only as null-guard; `data?.quote.session` covers the reactive value — adding full `data` would restart poll on every quote tick
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
