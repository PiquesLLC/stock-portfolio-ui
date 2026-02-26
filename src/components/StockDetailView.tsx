import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Holding, ChartPeriod, StockDetailsResponse, MarketSession, ETFHoldingsData, AssetAbout, PriceAlert, EarningsResponse, ActivityEvent, AnalystEvent } from '../types';
import { Acronym, getAcronymTitle } from './Acronym';
import { getStockDetails, getStockQuote, getFastQuote, getIntradayCandles, getHourlyCandles, IntradayCandle, getDividendEvents, getDividendCredits, getETFHoldings, getAssetAbout, getPriceAlerts, getEarnings, getTickerActivity, getTickerNews, getAnalystEvents, getAIEvents, AIEventsResponse, MarketNewsItem, followStock, unfollowStock, getStockFollowStatus } from '../api';
import { DividendEvent, DividendCredit } from '../types';
import { StockPriceChart } from './StockPriceChart';
import { WarningPanel } from './WarningPanel';
import { ETFDetailsPanel } from './ETFDetailsPanel';
import { CreatePriceAlertModal } from './CreatePriceAlertModal';
import { PriceAlertsList } from './PriceAlertsList';
import { FundamentalsSection } from './FundamentalsSection';
import { EarningsSection } from './EarningsSection';
import StockQAPanel from './StockQAPanel';
import EventFeed from './EventFeed';
import { formatCurrency, formatLargeNumber, formatVolume, formatPercent, inferExchangeLabel } from '../utils/stock-detail';
import { AddHoldingModal } from './AddHoldingModal';
import { AddToWatchlistModal } from './AddToWatchlistModal';
import { CreateWatchlistModal } from './CreateWatchlistModal';
import { createWatchlist } from '../api';
import { Term } from './Term';
import { StockLogo } from './StockLogo';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';
import { NalaScore } from './NalaScore';

interface Props {
  ticker: string;
  holding: Holding | null;
  portfolioTotal: number;
  onBack: () => void;
  onHoldingAdded?: () => void;
}

function StatItem({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-rh-light-muted/60 dark:text-rh-muted/60">{label}</span>
      <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{value}</span>
    </div>
  );
}

function PositionCard({ label, value, valueColor, sub }: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/60 mb-1">{label}</div>
      <div className={`text-lg font-bold ${valueColor ?? 'text-rh-light-text dark:text-rh-text'}`}>{value}</div>
      {sub && (
        <div className={`text-xs mt-0.5 ${valueColor ?? 'text-rh-light-muted/60 dark:text-rh-muted/60'}`}>{sub}</div>
      )}
    </div>
  );
}

export function StockDetailView({ ticker, holding, portfolioTotal, onBack, onHoldingAdded }: Props) {
  const [data, setData] = useState<StockDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickLoaded, setQuickLoaded] = useState(false); // Price loaded, details pending
  const [error, setError] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>(() => {
    const saved = localStorage.getItem('stockChartPeriod');
    return (saved as ChartPeriod) || '1D';
  });
  const handlePeriodChange = useCallback((period: ChartPeriod) => {
    setChartPeriod(period);
    localStorage.setItem('stockChartPeriod', period);
    // Synchronously set hourly candles to avoid a blank-frame flash
    // when auto-zoom-switch changes to 1W/1M before the useEffect runs
    if (period === '1W' || period === '1M') {
      setHourlyCandles(hourlyCache.current[period] || []);
    } else {
      setHourlyCandles([]);
    }
  }, []);

  // Intraday candles for 1D chart (from Yahoo Finance via API)
  const [intradayCandles, setIntradayCandles] = useState<IntradayCandle[]>([]);

  // Zoom data resolution state
  const [zoomData, setZoomData] = useState<{ time: number; label: string; price: number; volume?: number }[]>([]);

  const handleResolutionRequest = useCallback((level: 'daily' | 'hourly' | 'intraday', rangeStart: number, rangeEnd: number) => {
    if (level === 'daily') { setZoomData([]); return; }
    if (level === 'hourly') {
      const all = [...(hourlyCache.current['1W'] || []), ...(hourlyCache.current['1M'] || [])];
      const seen = new Set<number>();
      const filtered = all.filter(c => {
        const t = new Date(c.time).getTime();
        if (seen.has(t) || t < rangeStart || t > rangeEnd) return false;
        seen.add(t); return true;
      }).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      if (filtered.length > 0) {
        setZoomData(filtered.map(c => {
          const d = new Date(c.time);
          return { time: d.getTime(), label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), price: c.close, volume: c.volume };
        }));
      }
      return;
    }
    if (level === 'intraday' && intradayCandles.length > 0) {
      const filtered = intradayCandles.filter(c => {
        const t = new Date(c.time).getTime();
        return t >= rangeStart && t <= rangeEnd;
      });
      if (filtered.length > 0) {
        setZoomData(filtered.map(c => {
          const d = new Date(c.time);
          return { time: d.getTime(), label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), price: c.close, volume: c.volume };
        }));
      }
    }
  }, [intradayCandles]);
  // Hourly candles for 1W/1M (finer-grained than daily)
  const [hourlyCandles, setHourlyCandles] = useState<IntradayCandle[]>([]);
  // Legacy live prices kept as fallback
  const [livePrices, setLivePrices] = useState<{ time: string; price: number }[]>([]);
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
  const [, setNewsEvents] = useState<MarketNewsItem[]>([]);
  const [analystEvents, setAnalystEvents] = useState<AnalystEvent[]>([]);

  // AI-powered events from Perplexity
  const [aiEvents, setAiEvents] = useState<AIEventsResponse | null>(null);
  const [aiEventsLoaded, setAiEventsLoaded] = useState(false);



  // Comparison overlay
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [compareInput, setCompareInput] = useState('');
  const [showCompareInput, setShowCompareInput] = useState(false);
  const [compareData, setCompareData] = useState<{ ticker: string; color: string; points: { time: number; price: number; rawPrice: number }[] }[]>([]);

  const COMPARE_COLORS = ['#FFFFFF', '#F59E0B', '#EC4899', '#06B6D4']; // white, amber, pink, cyan

  // Fetch comparison data whenever compareTickers or chartPeriod changes
  useEffect(() => {
    if (compareTickers.length === 0) { setCompareData([]); return; }

    const fetchComps = async () => {
      // Determine main ticker's reference price for normalization
      // For daily-candle periods (3M/YTD/1Y), use the price at the period start, not first candle ever
      let mainRefPrice = data?.quote?.currentPrice ?? 0;
      if (chartPeriod === '1D' && intradayCandles.length > 0) {
        mainRefPrice = intradayCandles[0].close;
      } else if ((chartPeriod === '1W' || chartPeriod === '1M') && hourlyCandles.length > 0) {
        mainRefPrice = hourlyCandles[0].close;
      } else if (data?.candles && data.candles.closes.length > 0) {
        // For daily candle periods, find the candle at the period start date
        const cc = data.candles;
        const now = Date.now();
        let periodStartMs: number;
        switch (chartPeriod) {
          case '3M': periodStartMs = now - 90 * 86400000; break;
          case 'YTD': periodStartMs = new Date(new Date().getFullYear(), 0, 1).getTime(); break;
          case '1Y': periodStartMs = now - 365 * 86400000; break;
          default: periodStartMs = 0; break; // MAX: use first candle
        }
        // Find first candle on or after the period start
        let refIdx = 0;
        for (let i = 0; i < cc.dates.length; i++) {
          if (new Date(cc.dates[i] + 'T12:00:00').getTime() >= periodStartMs) { refIdx = i; break; }
        }
        mainRefPrice = cc.closes[refIdx];
      }
      if (!mainRefPrice) return; // no reference yet

      const results: typeof compareData = [];
      for (let ci = 0; ci < compareTickers.length; ci++) {
        const ct = compareTickers[ci];
        try {
          let points: { time: number; price: number; rawPrice: number }[] = [];

          if (chartPeriod === '1D') {
            const compCandles = await getIntradayCandles(ct);
            if (compCandles.length >= 2) {
              const compStart = compCandles[0].close;
              points = compCandles.map(c => ({
                time: new Date(c.time).getTime(),
                price: mainRefPrice * (1 + (c.close - compStart) / compStart),
                rawPrice: c.close,
              }));
            }
          } else if (chartPeriod === '1W' || chartPeriod === '1M') {
            const compCandles = await getHourlyCandles(ct, chartPeriod);
            if (compCandles.length >= 2) {
              const compStart = compCandles[0].close;
              points = compCandles.map(c => ({
                time: new Date(c.time).getTime(),
                price: mainRefPrice * (1 + (c.close - compStart) / compStart),
                rawPrice: c.close,
              }));
            }
          } else {
            // 3M, YTD, 1Y, MAX — use daily candles with period-aware normalization
            const compDetails = await getStockDetails(ct);
            if (compDetails.candles && compDetails.candles.closes.length >= 2) {
              const cc = compDetails.candles;
              // Find comparison start price at the same period start date
              const now = Date.now();
              let periodStartMs: number;
              switch (chartPeriod) {
                case '3M': periodStartMs = now - 90 * 86400000; break;
                case 'YTD': periodStartMs = new Date(new Date().getFullYear(), 0, 1).getTime(); break;
                case '1Y': periodStartMs = now - 365 * 86400000; break;
                default: periodStartMs = 0; break; // MAX
              }
              let compRefIdx = 0;
              for (let i = 0; i < cc.dates.length; i++) {
                if (new Date(cc.dates[i] + 'T12:00:00').getTime() >= periodStartMs) { compRefIdx = i; break; }
              }
              const compStart = cc.closes[compRefIdx];
              points = cc.dates.map((date, i) => ({
                time: new Date(date + 'T12:00:00').getTime(),
                price: mainRefPrice * (1 + (cc.closes[i] - compStart) / compStart),
                rawPrice: cc.closes[i],
              }));
            }
          }

          if (points.length >= 2) {
            results.push({
              ticker: ct,
              color: COMPARE_COLORS[ci % COMPARE_COLORS.length],
              points,
            });
          }
        } catch { /* skip failed tickers */ }
      }
      setCompareData(results);
    };

    fetchComps();
  }, [compareTickers, chartPeriod, data?.candles, data?.quote?.currentPrice, intradayCandles, hourlyCandles]);

  const addCompareTicker = (t: string) => {
    const upper = t.trim().toUpperCase();
    if (!upper || upper === ticker || compareTickers.includes(upper) || compareTickers.length >= 4) return;
    setCompareTickers(prev => [...prev, upper]);
    setCompareInput('');
    setShowCompareInput(false);
  };

  const removeCompareTicker = (t: string) => {
    setCompareTickers(prev => prev.filter(ct => ct !== t));
  };

  // Stock follow
  const [isFollowingStock, setIsFollowingStock] = useState(false);

  // Price alerts
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [showWatchlistModal, setShowWatchlistModal] = useState(false);
  const [showCreateWatchlist, setShowCreateWatchlist] = useState(false);
  const [showIntelFeed, setShowIntelFeed] = useState<boolean>(() => {
    try { const v = localStorage.getItem('stockIntelFeed'); return v !== null ? JSON.parse(v) : true; } catch { return true; }
  });
  const [intelCollapsed, setIntelCollapsed] = useState(false);
  const toggleIntelFeed = () => {
    if (showIntelFeed) {
      // If enabled, toggle collapsed state instead of hiding
      setIntelCollapsed(prev => !prev);
    } else {
      // If disabled, enable it and uncollapse
      setShowIntelFeed(true);
      setIntelCollapsed(false);
      localStorage.setItem('stockIntelFeed', 'true');
    }
  };

  const fetchPriceAlerts = useCallback(() => {
    getPriceAlerts(ticker).then(setPriceAlerts).catch(() => setPriceAlerts([]));
  }, [ticker]);

  useEffect(() => {
    getDividendEvents(ticker).then(setTickerDividends).catch(() => {});
    getDividendCredits(ticker).then(setTickerCredits).catch(() => {});
    // Fetch earnings for chart events
    getEarnings(ticker).then(setEarnings).catch(() => setEarnings(null));
    // Fetch trade events for chart events
    getTickerActivity(ticker).then(setTradeEvents).catch(() => setTradeEvents([]));
    // Fetch news and analyst events for chart events
    getTickerNews(ticker).then(setNewsEvents).catch(() => setNewsEvents([]));
    getAnalystEvents(50, ticker).then(setAnalystEvents).catch(() => setAnalystEvents([]));
    // Fetch ETF holdings
    getETFHoldings(ticker)
      .then(data => setEtfHoldings(data))
      .catch(() => setEtfHoldings(null));
    // Fetch about data
    getAssetAbout(ticker)
      .then(data => setAbout(data))
      .catch(() => setAbout(null));
    // Fetch price alerts
    fetchPriceAlerts();
    // Fetch stock follow status
    getStockFollowStatus(ticker)
      .then(({ following }) => setIsFollowingStock(following))
      .catch(() => setIsFollowingStock(false));
  }, [ticker, fetchPriceAlerts]);

  // Fetch AI-powered events (Perplexity) — period-aware
  useEffect(() => {
    const periodDays: Record<string, number> = {
      '1D': 0, '1W': 14, '1M': 45, '3M': 100, 'YTD': 365, '1Y': 730, 'MAX': 7300,
    };
    const days = periodDays[chartPeriod] || 90;
    if (days === 0) { setAiEvents(null); setAiEventsLoaded(true); return; } // skip 1D
    setAiEventsLoaded(false);
    getAIEvents(ticker, days).then(r => { setAiEvents(r); setAiEventsLoaded(true); }).catch(() => { setAiEvents(null); setAiEventsLoaded(true); });
  }, [ticker, chartPeriod]);

  // Cache for prefetched hourly data
  const hourlyCache = useRef<Record<string, IntradayCandle[]>>({});

  // Initial fetch — progressive loading: quote + chart first (fast), then full details
  const fetchInitial = useCallback(async () => {
    try {
      // PHASE 1: Quick load - quote + chart candles via Yahoo Finance (all fast, no queue)
      const [quoteResult, intraday, hourly1W, hourly1M] = await Promise.all([
        getFastQuote(ticker).catch(() => null),
        getIntradayCandles(ticker).catch(() => []),
        getHourlyCandles(ticker, '1W').catch(() => []),
        getHourlyCandles(ticker, '1M').catch(() => []),
      ]);

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
        if (chartPeriod === '1W') setHourlyCandles(hourly1W);
        else if (chartPeriod === '1M') setHourlyCandles(hourly1M);
        setQuickLoaded(true);

        // Seed live prices with current price
        const now = new Date().toISOString();
        setLivePrices([{ time: now, price: quoteResult.currentPrice }]);
      }

      // PHASE 2: Full load - profile, metrics, historical candles (slower - Finnhub queue)
      const result = await getStockDetails(ticker);

      setData(result);
      setIntradayCandles(intraday.length > 0 ? intraday : intradayCandles);
      setQuickLoaded(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock details');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  // Poll — refresh quote + intraday candles
  const pollQuote = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [quote, intraday] = await Promise.all([
        getStockQuote(ticker),
        getIntradayCandles(ticker).catch(() => null),
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
    } catch {
      // Silently fail on poll — keep existing data
    }
  }, [ticker]);

  useEffect(() => {
    setLoading(true);
    setQuickLoaded(false);
    setData(null);
    setLivePrices([]);
    setIntradayCandles([]);
    fetchInitial();
  }, [fetchInitial]);

  // Set hourly candles from prefetched cache — instant switch
  useEffect(() => {
    if (chartPeriod === '1W' || chartPeriod === '1M') {
      setHourlyCandles(hourlyCache.current[chartPeriod] || []);
    } else {
      setHourlyCandles([]);
    }
  }, [chartPeriod]);

  // Polling interval — 12s during market, 60s when closed
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

  // ESC key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onBack]);

  // Hover state for chart crosshair (must be before ALL conditional returns — Rules of Hooks)
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [hoverRefPrice, setHoverRefPrice] = useState<number | null>(null);
  const handleHoverPrice = useCallback((price: number | null, label: string | null, refPrice?: number) => {
    setHoverPrice(price);
    setHoverLabel(label);
    setHoverRefPrice(refPrice ?? null);
  }, []);

  // Compute period-specific change (must be before ALL conditional returns — Rules of Hooks)
  const periodChange = useMemo(() => {
    if (!data) return { change: 0, changePct: 0, label: 'Today' };
    const quote = data.quote;
    if (chartPeriod === '1D') {
      return { change: quote.change, changePct: quote.changePercent, label: 'Today' };
    }
    const candles = data.candles;
    if (!candles || candles.closes.length === 0) {
      return { change: quote.change, changePct: quote.changePercent, label: 'Today' };
    }
    const now = new Date();
    let cutoff: Date;
    switch (chartPeriod) {
      case '1W': cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7); break;
      case '1M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); break;
      case '3M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); break;
      case 'YTD': cutoff = new Date(now.getFullYear(), 0, 1); break;
      case '1Y': cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
      case 'MAX': cutoff = new Date(1970, 0, 1); break;
      default: cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    }
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    let startPrice = candles.closes[0];
    for (let i = 0; i < candles.dates.length; i++) {
      if (candles.dates[i] >= cutoffStr) {
        startPrice = candles.closes[i];
        break;
      }
    }
    // Use the most recent price (extended/after-hours if available) for period change
    const latestPrice = quote.extendedPrice ?? quote.currentPrice;
    const change = latestPrice - startPrice;
    const changePct = startPrice !== 0 ? (change / startPrice) * 100 : 0;
    const labels: Record<string, string> = { '1W': 'Past Week', '1M': 'Past Month', '3M': 'Past 3 Months', 'YTD': 'Year to Date', '1Y': 'Past Year', 'MAX': 'All Time' };
    return { change, changePct, label: labels[chartPeriod] || chartPeriod };
  }, [chartPeriod, data]);

  // Golden Cross detection: only show badge if a cross EVENT occurs within the visible timeframe
  const goldenCrossInfo = useMemo<{ active: false } | { active: true; date: string; dateFormatted: string; ma100: number; ma200: number }>(() => {
    const candles = data?.candles;
    if (!candles || candles.closes.length < 200) return { active: false };
    const closes = candles.closes;
    const dates = candles.dates;
    const n = closes.length;

    const now = new Date();
    let cutoff: Date;
    switch (chartPeriod) {
      case '1D': case '1W': return { active: false };
      case '1M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); break;
      case '3M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); break;
      case 'YTD': cutoff = new Date(now.getFullYear(), 0, 1); break;
      case '1Y': cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
      case 'MAX': cutoff = new Date(1970, 0, 1); break;
      default: cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    }
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let windowStart = 0;
    for (let i = 0; i < n; i++) {
      if (dates[i] >= cutoffStr) { windowStart = i; break; }
    }
    const scanStart = Math.max(windowStart, 200);

    let lastCrossDate: string | null = null;
    let lastMa100 = 0, lastMa200 = 0;
    for (let i = scanStart; i < n; i++) {
      let s100 = 0, s100prev = 0, s200 = 0, s200prev = 0;
      for (let j = i - 100; j < i; j++) s100 += closes[j];
      for (let j = i - 101; j < i - 1; j++) s100prev += closes[j];
      for (let j = i - 200; j < i; j++) s200 += closes[j];
      for (let j = i - 201; j < i - 1; j++) s200prev += closes[j];
      const ma100 = s100 / 100;
      const ma100prev = s100prev / 100;
      const ma200 = s200 / 200;
      const ma200prev = s200prev / 200;

      if ((ma100prev - ma200prev) <= 0 && (ma100 - ma200) > 0 && dates[i] >= cutoffStr) {
        lastCrossDate = dates[i];
        lastMa100 = ma100;
        lastMa200 = ma200;
      }
    }

    if (lastCrossDate) {
      const d = new Date(lastCrossDate + 'T00:00:00');
      const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { active: true, date: lastCrossDate, dateFormatted, ma100: lastMa100, ma200: lastMa200 };
    }
    return { active: false };
  }, [data?.candles, chartPeriod]);

  // Full skeleton only when we don't even have the quick quote yet
  if (!quickLoaded) {
    return (
      <div className="py-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-6 transition-colors">
          <span>&larr;</span> Back
        </button>
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-gray-200/30 dark:bg-white/[0.04] rounded-lg" />
          <div className="h-12 w-32 bg-gray-200/30 dark:bg-white/[0.04] rounded-lg" />
          <div className="h-[300px] bg-gray-200/30 dark:bg-white/[0.04] rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200/30 dark:bg-white/[0.04] rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-6 transition-colors">
          <span>&larr;</span> Back
        </button>
        <div className="text-rh-red text-sm">{error || 'Failed to load'}</div>
      </div>
    );
  }

  const { quote, profile, metrics } = data;

  // Extended hours pricing from Yahoo Finance (returned by API)
  // Always show the most recent price (extended if available) on all timeframes
  const hasExtended = quote.extendedPrice != null && quote.extendedPrice !== quote.currentPrice;
  const showExtendedLine = hasExtended && chartPeriod === '1D'; // sub-line only on 1D
  const basePrice = hasExtended ? quote.extendedPrice! : quote.currentPrice;
  const displayPrice = hoverPrice ?? basePrice;
  const isHovering = hoverPrice !== null;

  // When hovering, compute change from the chart's reference price (first visible point)
  // This ensures correct change when zoomed into historical data
  const periodStartPrice = basePrice - periodChange.change;
  const hoverRef = isHovering && hoverRefPrice !== null ? hoverRefPrice : periodStartPrice;
  const activeChange = isHovering ? displayPrice - hoverRef : periodChange.change;
  const activeChangePct = isHovering
    ? (hoverRef !== 0 ? (activeChange / hoverRef) * 100 : 0)
    : periodChange.changePct;

  const isGain = activeChange >= 0;
  const changeColor = isGain ? 'text-rh-green' : 'text-rh-red';

  // Infer exchange label from ticker suffix or profile
  const exchangeLabel = profile?.exchange || inferExchangeLabel(ticker);

  return (
    <div className="pt-2 pb-6">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-4 transition-colors">
        <span>&larr;</span> Back
      </button>

      {/* Two-column layout: main content + sticky intelligence sidebar */}
      <div className="lg:flex lg:gap-6 lg:items-start">
        {/* Left / Main column — scrolls with the page */}
        <div className="lg:flex-1 lg:min-w-0">

      {/* Header: Company name + ticker + actions */}
      <div className="mb-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
          <StockLogo ticker={ticker} size="lg" />
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-rh-light-text dark:text-rh-text">
            {profile?.name || ticker}
          </h1>
          {profile?.name && (
            <span className="text-sm font-medium text-rh-light-muted dark:text-rh-muted">{ticker}</span>
          )}
          {exchangeLabel && (
            <span className="hidden sm:inline text-[10px] font-mono px-2 py-0.5 rounded-lg bg-gray-50/60 dark:bg-white/[0.04] border border-gray-200/40 dark:border-white/[0.06] text-rh-light-muted/60 dark:text-white/25">
              {exchangeLabel}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowAddHolding(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-rh-green/25 text-rh-green hover:bg-rh-green/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              {holding ? 'Edit' : 'Add'}
            </button>
            <button
              onClick={() => setShowWatchlistModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-amber-500/25 text-amber-400 hover:bg-amber-500/10 transition-colors"
              title="Add to watchlist"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Watch
            </button>
            <button
              onClick={async () => {
                const wasFollowing = isFollowingStock;
                setIsFollowingStock(!wasFollowing);
                try {
                  if (wasFollowing) await unfollowStock(ticker);
                  else await followStock(ticker);
                } catch {
                  setIsFollowingStock(wasFollowing);
                }
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                isFollowingStock
                  ? 'border-purple-500/25 text-purple-400 hover:bg-purple-500/10'
                  : 'border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted/70 dark:text-white/30 hover:text-rh-light-text dark:hover:text-white/70 hover:border-gray-300/60 dark:hover:border-white/[0.15]'
              }`}
              title={isFollowingStock ? 'Unfollow stock' : 'Follow stock'}
            >
              <svg className="w-3.5 h-3.5" fill={isFollowingStock ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {isFollowingStock ? 'Following' : 'Follow'}
            </button>
            <button
              onClick={() => setShowAlertModal(true)}
              className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted/70 dark:text-white/30 hover:text-rh-light-text dark:hover:text-white/70 hover:border-gray-300/60 dark:hover:border-white/[0.15] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Alert
              {priceAlerts.filter(a => a.enabled && !a.triggered).length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-rh-green" />
              )}
            </button>
            {/* Intelligence feed toggle — desktop only */}
            <button
              onClick={toggleIntelFeed}
              onDoubleClick={() => { setShowIntelFeed(false); localStorage.setItem('stockIntelFeed', 'false'); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                showIntelFeed && !intelCollapsed
                  ? 'border-blue-500/25 text-blue-400 hover:bg-blue-500/10'
                  : showIntelFeed && intelCollapsed
                    ? 'border-blue-500/15 text-blue-400/50 hover:bg-blue-500/10'
                    : 'border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted/50 dark:text-white/25 hover:text-rh-light-text dark:hover:text-white/60'
              }`}
              title={!showIntelFeed ? 'Show intelligence feed' : intelCollapsed ? 'Expand intelligence feed (double-click to hide)' : 'Collapse intelligence feed (double-click to hide)'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V9a2 2 0 012-2h2a2 2 0 012 2v9a2 2 0 01-2 2h-2z" />
              </svg>
              Intel
              {showIntelFeed && (
                <svg className={`w-2.5 h-2.5 transition-transform ${intelCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <div style={{ minHeight: '22px' }}>
          {goldenCrossInfo.active && (
            <span className="inline-block text-[10px] px-2 py-0.5 rounded-lg font-semibold tracking-wider" style={{ backgroundColor: 'rgba(255, 215, 0, 0.1)', color: '#FFD700', border: '1px solid rgba(255, 215, 0, 0.15)' }}
              title={`Golden Cross on ${goldenCrossInfo.date} — MA100: $${goldenCrossInfo.ma100.toFixed(2)}, MA200: $${goldenCrossInfo.ma200.toFixed(2)}. Signal only — not financial advice.`}>
              ✦ GOLDEN CROSS · {goldenCrossInfo.dateFormatted}
            </span>
          )}
        </div>
      </div>

      {/* Price hero */}
      <div className="mb-4" style={{ minHeight: showExtendedLine ? '110px' : '85px' }}>
        <div className="text-3xl sm:text-4xl font-bold text-rh-light-text dark:text-rh-text tabular-nums">
          {formatCurrency(displayPrice)}
        </div>
        <div className={`flex items-center gap-2 mt-1 ${changeColor}`}>
          <span className="text-lg font-semibold tabular-nums">
            {activeChange >= 0 ? '+' : ''}{formatCurrency(activeChange).replace('$', '').replace('-$', '-$')}
          </span>
          <span className="text-sm tabular-nums">
            ({formatPercent(activeChangePct)})
          </span>
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">
            {isHovering ? hoverLabel : periodChange.label}
          </span>
        </div>
        {showExtendedLine && (
          <div className={`flex items-center gap-2 mt-1 h-[20px] transition-opacity duration-100 ${
            isHovering ? 'opacity-0' : (quote.extendedChange! >= 0 ? 'text-rh-green' : 'text-rh-red')
          }`}>
            <span className="text-xs font-medium tabular-nums">
              {quote.extendedChange! >= 0 ? '+' : ''}{formatCurrency(quote.extendedChange!).replace('$', '').replace('-$', '-$')}
            </span>
            <span className="text-xs tabular-nums">
              ({formatPercent(quote.extendedChangePercent!)})
            </span>
            <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
              {quote.session === 'PRE' ? 'Pre-Market' : 'After Hours'}
            </span>
          </div>
        )}
        {quote.session && quote.session !== 'REG' && (
          <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-lg uppercase tracking-wider ${
            quote.session === 'CLOSED' ? 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted border border-rh-light-border dark:border-rh-border' :
            quote.session === 'PRE' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' :
            'bg-purple-400/10 text-purple-400 border border-purple-400/20'
          }`} title={getAcronymTitle(quote.session === 'PRE' ? 'PRE' : quote.session === 'POST' ? 'POST' : 'CLOSED') || ''}>
            {quote.session === 'PRE' ? 'Pre-Market' : quote.session === 'POST' ? 'After Hours' : 'Closed'}
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="mb-8">
        <StockPriceChart
          ticker={ticker}
          candles={data.candles}
          intradayCandles={intradayCandles}
          hourlyCandles={hourlyCandles}
          livePrices={livePrices}
          selectedPeriod={chartPeriod}
          onPeriodChange={handlePeriodChange}
          currentPrice={quote.currentPrice}
          previousClose={quote.previousClose}
          regularClose={quote.regularClose}
          onHoverPrice={handleHoverPrice}
          goldenCrossDate={goldenCrossInfo.active ? goldenCrossInfo.date : null}
          session={quote.session}
          earnings={earnings?.quarterly}
          dividendEvents={tickerDividends}
          dividendCredits={tickerCredits}
          tradeEvents={tradeEvents}
          analystEvents={analystEvents}
          aiEvents={aiEvents?.events}
          onRequestResolution={handleResolutionRequest}
          zoomData={zoomData}
          comparisons={compareData.length > 0 ? compareData : undefined}
        />

        {/* Compare tickers UI */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {compareTickers.map((ct, i) => (
            <span
              key={ct}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border"
              style={{ borderColor: COMPARE_COLORS[i % COMPARE_COLORS.length] + '40', color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length], display: 'inline-block' }} />
              {ct}
              <button onClick={() => removeCompareTicker(ct)} className="ml-0.5 opacity-60 hover:opacity-100">&times;</button>
            </span>
          ))}
          {compareTickers.length < 4 && (
            showCompareInput ? (
              <div className="inline-flex items-center relative" style={{ width: '120px' }}>
                <TickerAutocompleteInput
                  value={compareInput}
                  onChange={(v) => setCompareInput(v)}
                  onSelect={(result) => { addCompareTicker(result.symbol); setShowCompareInput(false); }}
                  placeholder="TICKER"
                  autoFocus
                  className="!w-full !px-1.5 !py-0.5 !text-[11px] !font-semibold !bg-transparent !border-gray-300/60 dark:!border-white/[0.12] !rounded !text-rh-light-text dark:!text-rh-text"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowCompareInput(true)}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium text-rh-light-muted dark:text-rh-muted/60 hover:text-rh-light-text dark:hover:text-rh-text border border-rh-light-border/30 dark:border-white/[0.08] hover:border-rh-green/30 transition-all"
                title="Compare with another ticker"
              >
                + Compare
              </button>
            )
          )}
          {compareTickers.length >= 1 && (
            <button
              onClick={() => {
                const all = [ticker, ...compareTickers];
                window.location.hash = new URLSearchParams({ tab: 'compare', stocks: all.join(',') }).toString();
              }}
              className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold text-rh-green border border-rh-green/30 hover:bg-rh-green/10 transition-all"
            >
              Full Compare →
            </button>
          )}
        </div>
      </div>

      {/* Warning Panel */}
      {!loading && <WarningPanel candles={data.candles} currentPrice={quote.currentPrice} />}

      {/* Section Nav */}
      {!loading && (
        <div className="sticky top-[calc(env(safe-area-inset-top)+88px)] sm:top-[calc(env(safe-area-inset-top)+52px)] z-20 -mx-3 sm:-mx-0 px-3 sm:px-0 py-2 bg-rh-light-bg/95 dark:bg-rh-black/95 backdrop-blur-md mb-4">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {[
              ...(holding ? [{ id: 'section-position', label: 'Position' }] : []),
              { id: 'section-about', label: 'About' },
              { id: 'section-stats', label: 'Stats' },
              { id: 'section-earnings', label: 'Earnings' },
              { id: 'section-financials', label: 'Financials' },
              { id: 'section-qa', label: 'Q&A' },
              ...(etfHoldings?.isETF ? [{ id: 'section-etf', label: 'ETF Details' }] : []),
              ...(priceAlerts.length > 0 ? [{ id: 'section-alerts', label: 'Alerts' }] : []),
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => document.getElementById(tab.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border border-rh-light-border/40 dark:border-rh-border/40 text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:border-rh-green/40 hover:bg-rh-green/5 transition-colors"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Your Position */}
      {holding && (
        <div id="section-position" className="mb-8 scroll-mt-32">
          <h2 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white mb-4">Your Position</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <PositionCard label="Market Value" value={formatCurrency(holding.currentValue)} />
            <PositionCard label="Average Cost" value={formatCurrency(holding.averageCost)} />
            <PositionCard
              label="Today's Return"
              value={`${holding.dayChange >= 0 ? '+' : ''}${formatCurrency(holding.dayChange)}`}
              valueColor={holding.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red'}
              sub={formatPercent(holding.dayChangePercent)}
            />
            <PositionCard
              label="Total Return"
              value={`${holding.profitLoss >= 0 ? '+' : ''}${formatCurrency(holding.profitLoss)}`}
              valueColor={holding.profitLoss >= 0 ? 'text-rh-green' : 'text-rh-red'}
              sub={formatPercent(holding.profitLossPercent)}
            />
            <PositionCard label="Shares" value={holding.shares.toLocaleString()} />
            <PositionCard
              label="Portfolio Diversity"
              value={portfolioTotal > 0 ? `${((holding.currentValue / portfolioTotal) * 100).toFixed(1)}%` : 'N/A'}
            />
          </div>
        </div>
      )}

      {/* Nala Score */}
      <NalaScore ticker={ticker} />

      {/* About Section */}
      {(about?.description || profile?.name) && (
        <div id="section-about" className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-5 mb-6 scroll-mt-32">
          <h2 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white mb-3">About</h2>

          {/* Description */}
          {about?.description && (
            <p className="text-[12px] leading-[1.6] text-rh-light-text/80 dark:text-white/50 mb-4">
              {about.description}
            </p>
          )}

          {/* Horizontal divider */}
          {about?.description && (about?.category || about?.numberOfHoldings || about?.inceptionDate || about?.fundFamily || profile?.industry || about?.headquarters) && (
            <div className="border-t border-gray-200/20 dark:border-white/[0.03] mb-4" />
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4 text-sm">
            {/* ETF-specific fields first */}
            {about?.category && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Category</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{about.category}</div>
              </div>
            )}
            {about?.numberOfHoldings && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Number of Holdings</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{about.numberOfHoldings.toLocaleString()}</div>
              </div>
            )}
            {about?.inceptionDate && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Inception Date</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{about.inceptionDate}</div>
              </div>
            )}
            {about?.fundFamily && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Fund Family</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{about.fundFamily}</div>
              </div>
            )}

            {/* Stock-specific fields */}
            {!about?.category && (about?.sector || profile?.industry) && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Industry</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{about?.industry || profile?.industry}</div>
              </div>
            )}
            {about?.headquarters && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Headquarters</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{about.headquarters}</div>
              </div>
            )}
            {about?.fullTimeEmployees && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Employees</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{about.fullTimeEmployees.toLocaleString()}</div>
              </div>
            )}

            {/* Common fields */}
            {profile?.country && !about?.headquarters && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Country</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{profile.country}</div>
              </div>
            )}
            {profile?.exchange && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Exchange</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{profile.exchange}</div>
              </div>
            )}
            {!about?.inceptionDate && profile?.ipoDate && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5"><Acronym label="IPO" /> Date</div>
                <div className="text-rh-light-text dark:text-white/85 font-medium">{profile.ipoDate}</div>
              </div>
            )}
            {profile?.weburl && (
              <div className="col-span-2 md:col-span-1">
                <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Website</div>
                <a
                  href={profile.weburl.startsWith('http') ? profile.weburl : `https://${profile.weburl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-rh-green hover:underline font-medium truncate block"
                >
                  {profile.weburl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Statistics */}
      {!loading && (metrics || quote) && (
        <div id="section-stats" className="scroll-mt-32 bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-5 mb-6">
          <h2 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white mb-4">Key Statistics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-4">
            {profile && profile.marketCapM > 0 && (
              <StatItem label={<Term beginner="Company Size" advanced="Mkt Cap" />} value={formatLargeNumber(profile.marketCapM)} />
            )}
            {metrics?.peRatio != null && (
              <StatItem label={<Term beginner="Price vs Earnings" advanced="P/E" />} value={metrics.peRatio.toFixed(2)} />
            )}
            {metrics?.dividendYield != null && (
              <StatItem label={<Term beginner="Cash Payback %" advanced="Div Yield" />} value={`${metrics.dividendYield.toFixed(2)}%`} />
            )}
            {metrics?.avgVolume10D != null && (
              <StatItem label="Vol (10D)" value={formatVolume(metrics.avgVolume10D)} />
            )}
            <StatItem label="Open" value={quote.open > 0 ? formatCurrency(quote.open) : '—'} />
            <StatItem label="High" value={quote.high > 0 ? formatCurrency(quote.high) : '—'} />
            <StatItem label="Low" value={quote.low > 0 ? formatCurrency(quote.low) : '—'} />
            <StatItem label="Prev Close" value={formatCurrency(quote.previousClose)} />
            {metrics?.week52High != null && (
              <StatItem label={<Term beginner="Year High" advanced="52W High" />} value={formatCurrency(metrics.week52High)} />
            )}
            {metrics?.week52Low != null && (
              <StatItem label={<Term beginner="Year Low" advanced="52W Low" />} value={formatCurrency(metrics.week52Low)} />
            )}
            {metrics?.beta != null && (
              <StatItem label={<Term beginner="Volatility" advanced="Beta" />} value={metrics.beta.toFixed(2)} />
            )}
            {metrics?.eps !== undefined && metrics.eps !== null && (
              <StatItem label={<Term beginner="Earnings/Share" advanced="EPS" />} value={`$${metrics.eps.toFixed(2)}`} />
            )}
            {metrics?.aumB != null && (
              <StatItem label={<><Acronym label="AUM" /></>} value={`$${metrics.aumB.toFixed(0)}B`} />
            )}
            {metrics?.expenseRatio != null && (
              <StatItem label="Expense Ratio" value={`${metrics.expenseRatio.toFixed(2)}%`} />
            )}
          </div>
        </div>
      )}

      {/* Intelligence Feed - mobile only (desktop shows in right column) */}
      <div className="lg:hidden">
        {showIntelFeed && !intelCollapsed && (
          <div className="mb-6">
            {aiEvents?.events && aiEvents.events.length > 0 ? (
              <EventFeed events={aiEvents.events} ticker={ticker} />
            ) : (
              <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl p-5">
                <div className="flex items-center gap-2 text-xs text-rh-light-muted/60 dark:text-white/25">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V9a2 2 0 012-2h2a2 2 0 012 2v9a2 2 0 01-2 2h-2z" />
                  </svg>
                  {chartPeriod === '1D' ? 'Switch to a longer period to see intelligence events' : aiEventsLoaded ? 'No intelligence events found' : 'Loading intelligence events...'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Financials & Earnings */}
      <div id="section-earnings" className="scroll-mt-32">
        <EarningsSection ticker={ticker} />
      </div>
      <div id="section-financials" className="scroll-mt-32">
        <FundamentalsSection ticker={ticker} />
      </div>

      {/* AI Research Q&A */}
      <div id="section-qa" className="scroll-mt-32 mb-6">
        <StockQAPanel ticker={ticker} />
      </div>

      {/* ETF Details Panel - consolidated dividends + holdings for ETFs */}
      {etfHoldings?.isETF ? (
        <div id="section-etf" className="scroll-mt-32">
        <ETFDetailsPanel
          ticker={ticker}
          dividendEvents={tickerDividends}
          dividendCredits={tickerCredits}
          etfHoldings={etfHoldings}
          holding={holding}
          onTickerClick={(t) => {
            window.location.hash = `#stock/${t}`;
          }}
        />
        </div>
      ) : null}

      {/* Price Alerts */}
      {priceAlerts.length > 0 && (
        <div id="section-alerts" className="scroll-mt-32 bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white">Price Alerts</h2>
            <button
              onClick={() => setShowAlertModal(true)}
              className="text-xs font-medium text-rh-green hover:text-rh-green/80 transition-colors"
            >
              + Add Alert
            </button>
          </div>
          <PriceAlertsList alerts={priceAlerts} onRefresh={fetchPriceAlerts} />
        </div>
      )}

        </div>{/* end left column */}

        {/* Right Column - Intelligence Feed (desktop only, sticky sidebar) */}
        {showIntelFeed && !intelCollapsed && (
          <div className="hidden lg:block lg:w-[360px] lg:shrink-0 lg:self-start lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto no-scrollbar">
            {aiEvents?.events && aiEvents.events.length > 0 ? (
              <EventFeed events={aiEvents.events} ticker={ticker} />
            ) : (
              <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl p-5">
                <div className="flex items-center gap-2 text-xs text-rh-light-muted/60 dark:text-white/25">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V9a2 2 0 012-2h2a2 2 0 012 2v9a2 2 0 01-2 2h-2z" />
                  </svg>
                  {chartPeriod === '1D' ? 'Switch to a longer period to see intelligence events' : aiEventsLoaded ? 'No intelligence events found' : 'Loading intelligence events...'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>{/* end two-column wrapper */}

      {/* Add / Update Holding Modal */}
      {showAddHolding && (
        <AddHoldingModal
          ticker={ticker}
          currentPrice={quote.currentPrice}
          onAdded={onHoldingAdded}
          holding={holding}
          onClose={() => setShowAddHolding(false)}
        />
      )}

      {/* Create Price Alert Modal */}
      {showAlertModal && (
        <CreatePriceAlertModal
          ticker={ticker}
          currentPrice={quote.currentPrice}
          openPrice={quote.open > 0 ? quote.open : undefined}
          averageCost={holding?.averageCost}
          onClose={() => setShowAlertModal(false)}
          onCreated={fetchPriceAlerts}
        />
      )}

      {/* Add to Watchlist Modal */}
      {showWatchlistModal && (
        <AddToWatchlistModal
          ticker={ticker}
          currentPrice={quote.currentPrice}
          onClose={() => setShowWatchlistModal(false)}
          onCreateNew={() => setShowCreateWatchlist(true)}
        />
      )}

      {/* Create Watchlist Modal (from Watch button flow) */}
      {showCreateWatchlist && (
        <CreateWatchlistModal
          onClose={() => setShowCreateWatchlist(false)}
          onSave={async (data) => {
            await createWatchlist(data);
            setShowCreateWatchlist(false);
            setShowWatchlistModal(true);
          }}
        />
      )}
    </div>
  );
}
