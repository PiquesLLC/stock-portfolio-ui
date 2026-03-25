import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PortfolioChartData, PortfolioChartPeriod } from '../types';
import { getPortfolioChart, getBenchmarkCloses, getIntradayCandlesWithPrevClose, getHourlyCandles, BenchmarkCandle, IntradayCandle } from '../api';
import {
  MarketSessionProp,
  getMarketStatus,
  CHART_W, CHART_H, PAD_TOP, PAD_BOTTOM, PAD_LEFT, PAD_RIGHT,
  formatCurrency, formatChange, formatPct, formatShortDate,
  MeasurementResult, computeMeasurement,
  findBenchmarkIndex, computeBenchmarkReturn,
  snapToNearest,
} from '../utils/portfolio-chart';
import { computeChartGroups } from '../utils/chart-groups';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { navigateToPricing } from '../utils/navigate-to-pricing';

/** Compute the ET date string and UTC→ET offset for a given date using the "noon trick". */
function getEtOffset(refDate: Date): { etDateStr: string; etOffsetMs: number } {
  const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(refDate);
  const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
  const noonEtH = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
  }).format(noonUtc).split(':')[0]);
  return { etDateStr, etOffsetMs: (noonEtH - 12) * 3600000 };
}

export interface ChartMeasurement {
  startTime: number;
  endTime: number;
  startValue: number;
  endValue: number;
  dollarChange: number;
  percentChange: number;
  daysBetween: number;
  benchmarkReturn: number | null;
  outperformance: number | null;
}

interface Props {
  currentValue: number;
  dayChange: number;
  dayChangePercent: number;
  regularDayChange?: number;
  regularDayChangePercent?: number;
  afterHoursChange?: number;
  afterHoursChangePercent?: number;
  refreshTrigger: number;
  fetchFn?: (period: PortfolioChartPeriod) => Promise<PortfolioChartData>;
  onPeriodChange?: (period: PortfolioChartPeriod) => void;
  onReturnChange?: (returnPct: number | null) => void;
  onMeasurementChange?: (measurement: ChartMeasurement | null) => void;
  session?: MarketSessionProp;
  /** When true, quote data is degraded (repricing/stale/unavailable) — suppress live point */
  quotesStale?: boolean;
  mobileTopPadding?: 'tight' | 'normal';
  /** Optional element rendered above the hero value (e.g. portfolio selector) */
  headerLabel?: React.ReactNode;
  /** Portfolio breakdown for info tooltip beside hero value */
  portfolioBreakdown?: {
    totalAssets: number;
    netEquity: number;
    cashBalance: number;
    marginDebt: number;
  };
  /** Optional toolbar rendered in the compare row (right side) */
  chartToolbar?: React.ReactNode;
}

export function shouldShowEstimatedBadge(
  period: PortfolioChartPeriod,
  points: Array<{ confidence?: number; estimated?: boolean }>,
  chartEstimated?: boolean,
  confidenceThreshold = 80,
): boolean {
  if (period === '1D') return false;
  if (chartEstimated === true) return true;
  return points.some(p => p.estimated === true || (typeof p.confidence === 'number' && p.confidence < confidenceThreshold));
}

const PERIODS: PortfolioChartPeriod[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'];
const HERO_VALUE_ANIMATIONS = [
  'hero-value-anim-pop',
  'hero-value-anim-swing',
  'hero-value-anim-flip',
  'hero-value-anim-glitch',
] as const;

// Periods available on the free plan
// All periods available to all users — no plan gating on chart periods
const FREE_PERIODS: Set<PortfolioChartPeriod> = new Set(['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL']);

export function PortfolioValueChart({
  currentValue,
  dayChange,
  dayChangePercent,
  regularDayChange,
  regularDayChangePercent,
  afterHoursChange,
  afterHoursChangePercent,
  refreshTrigger,
  fetchFn,
  onPeriodChange,
  onReturnChange,
  onMeasurementChange,
  session,
  quotesStale,
  mobileTopPadding = 'normal',
  headerLabel,
  portfolioBreakdown,
  chartToolbar,
}: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const userPlan = user?.plan || 'free';
  const [chartData, setChartData] = useState<PortfolioChartData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PortfolioChartPeriod>('1D');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Guard 2: After-hours spike smoothing — require 2 consecutive polls confirming
  // a large value jump before accepting it as the live point. Prevents single-tick
  // quote glitches from spiking the chart.
  const confirmedValueRef = useRef(currentValue);
  const pendingValueRef = useRef<number | null>(null);
  // Synchronous computation — must stay in useMemo (not useEffect) so liveValue
  // updates in the same render as currentValue. An async useEffect would cause
  // a 1-frame delay where the hero shows the new value but the chart line hasn't caught up.
  const liveValue = useMemo(() => {
    const prev = confirmedValueRef.current;
    const jumpPct = prev > 0 ? Math.abs(currentValue - prev) / prev : 0;
    const isAfterHours = session === 'POST' || session === 'PRE';
    if (isAfterHours && jumpPct > 0.003) {
      if (pendingValueRef.current !== null && Math.abs(currentValue - pendingValueRef.current) / currentValue < 0.001) {
        confirmedValueRef.current = currentValue;
        pendingValueRef.current = null;
        return currentValue;
      }
      pendingValueRef.current = currentValue;
      return prev;
    }
    confirmedValueRef.current = currentValue;
    pendingValueRef.current = null;
    return currentValue;
  }, [currentValue, session]);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Idle animation state ─────────────────────────────────────────
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IDLE_TIMEOUT = 600000; // 10 minutes
  const [rippleKey, setRippleKey] = useState(0);
  const [showRipple, setShowRipple] = useState(false);
  const idleDotGlowRef = useRef<SVGCircleElement | null>(null);
  const idleDotRef = useRef<SVGCircleElement | null>(null);
  const idleDotGroupRef = useRef<SVGGElement | null>(null);
  const idlePathRef = useRef<SVGPathElement | null>(null);
  const rippleCooldownRef = useRef(false);

  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    if (idleDotGroupRef.current) idleDotGroupRef.current.style.display = 'none';
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsIdle(true), IDLE_TIMEOUT);
  }, []);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetIdleTimer));
    idleTimerRef.current = setTimeout(() => setIsIdle(true), IDLE_TIMEOUT);
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  // ── Per-period cache for instant switching ──────────────────────
  const chartCacheRef = useRef<Map<PortfolioChartPeriod, PortfolioChartData>>(new Map());

  // ── Measurement state ──────────────────────────────────────────
  const [measureA, setMeasureA] = useState<number | null>(null); // index of first click
  const [measureB, setMeasureB] = useState<number | null>(null); // index of second click
  const [benchmarkCandles, setBenchmarkCandles] = useState<BenchmarkCandle[]>([]);
  const [intradayBenchmark, setIntradayBenchmark] = useState<BenchmarkCandle[]>([]);
  const [spyPreviousClose, setSpyPreviousClose] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [heroAnimationIndex, setHeroAnimationIndex] = useState(0);
  const [heroAnimationRunId, setHeroAnimationRunId] = useState(0);

  const isMeasuring = measureA !== null;
  const hasMeasurement = measureA !== null && measureB !== null;

  const handleHeroValueClick = () => {
    setHeroAnimationIndex(prev => (prev + 1) % HERO_VALUE_ANIMATIONS.length);
    setHeroAnimationRunId(prev => prev + 1);
  };

  // ── Data fetching (debounced: one in-flight at a time, queue latest) ──

  const isFetchingRef = useRef(false);
  const pendingFetchRef = useRef<{ period: PortfolioChartPeriod; silent: boolean } | null>(null);
  // Track current period so in-flight fetches for stale periods don't overwrite chartData
  const selectedPeriodRef = useRef(selectedPeriod);
  useEffect(() => { selectedPeriodRef.current = selectedPeriod; }, [selectedPeriod]);

  const fetchFnRef = useRef(fetchFn);
  useEffect(() => { fetchFnRef.current = fetchFn; }, [fetchFn]);

  const fetchChart = useCallback(async (period: PortfolioChartPeriod, silent = false) => {
    // If already fetching, queue this request for after completion
    if (isFetchingRef.current) {
      pendingFetchRef.current = { period, silent: true };
      return;
    }
    isFetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const fetcher = fetchFnRef.current || getPortfolioChart;
      const data = await fetcher(period);
      // Only update displayed data if this period is still selected.
      // Prevents stale 1D auto-refresh from overwriting 1W/1M data
      // when the user switches periods mid-fetch.
      if (period === selectedPeriodRef.current) {
        setChartData(data);
        setFetchError(false);
      }
      chartCacheRef.current.set(period, data);
    } catch (e) {
      console.error('Chart fetch error:', e);
      if (!silent) setFetchError(true);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
      // Process queued request (picks up latest data after current fetch completes)
      const pending = pendingFetchRef.current;
      if (pending) {
        pendingFetchRef.current = null;
        fetchChart(pending.period, pending.silent);
      }
    }
  }, []);

  // Initial load + period change — use cache if available for instant switch
  useEffect(() => {
    const cached = chartCacheRef.current.get(selectedPeriod);
    if (cached) {
      setChartData(cached);
      setLoading(false);
      // Still fetch fresh data in background
      fetchChart(selectedPeriod, true);
    } else {
      // Clear stale data from previous period to prevent mismatched filtering
      setChartData(null);
      fetchChart(selectedPeriod);
    }
  }, [selectedPeriod, fetchChart]);

  // Silent refresh when portfolio updates
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchChart(selectedPeriod, true);
    }
  }, [refreshTrigger, selectedPeriod, fetchChart]);

  // Auto-refresh for 1D (only during market hours to prevent chart jitter from after-hours quote fluctuations)
  useEffect(() => {
    if (selectedPeriod !== '1D') return;
    const interval = setInterval(() => {
      if (getMarketStatus().isOpen) fetchChart('1D', true);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedPeriod, fetchChart]);

  // Fetch daily benchmark candles once (for longer periods)
  useEffect(() => {
    getBenchmarkCloses('SPY').then(setBenchmarkCandles).catch(e => console.error('Benchmark candles fetch failed:', e));
  }, []);

  // Fetch intraday benchmark candles matching the chart period
  useEffect(() => {
    const fetchIntraday = async () => {
      try {
        let candles: IntradayCandle[];
        if (selectedPeriod === '1D') {
          const result = await getIntradayCandlesWithPrevClose('SPY');
          candles = result.candles;
          setSpyPreviousClose(result.previousClose);
        } else if (selectedPeriod === '1W' || selectedPeriod === '1M' || selectedPeriod === 'YTD') {
          candles = await getHourlyCandles('SPY', selectedPeriod);
          setSpyPreviousClose(null);
        } else {
          setIntradayBenchmark([]);
          setSpyPreviousClose(null);
          return;
        }
        setIntradayBenchmark(candles.map(c => ({
          date: c.time.slice(0, 10),
          time: new Date(c.time).getTime(),
          close: c.close,
        })));
      } catch {
        setIntradayBenchmark([]);
        setSpyPreviousClose(null);
      }
    };
    fetchIntraday();
  }, [selectedPeriod]);

  // ── Period change clears measurement ───────────────────────────
  const handlePeriodChange = (period: PortfolioChartPeriod) => {
    if (period === selectedPeriod) return;
    setHoverIndex(null);
    setMeasureA(null);
    setMeasureB(null);
    setSelectedPeriod(period);
    onPeriodChange?.(period);
  };

  // ── ESC clears measurement ─────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMeasureA(null);
        setMeasureB(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ── Click/tap outside chart clears measurement ────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (svgRef.current && !svgRef.current.contains(e.target as Node)) {
        setMeasureA(null);
        setMeasureB(null);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // ── Clear stale measurement if points array shrinks (data refresh during gesture)
  useEffect(() => {
    if (measureA !== null && measureA >= (chartData?.points?.length ?? 0)) {
      setMeasureA(null);
      setMeasureB(null);
    }
  }, [chartData?.points?.length, measureA]);

  // ── Chart data ─────────────────────────────────────────────────

  // Extend chart to current time using the live portfolio value from props.
  // Yahoo candles are ~15 min delayed; this bridges the gap so the line
  // always reaches "now" and the user can hover to the latest value.
  const points = useMemo(() => {
    const raw = chartData?.points ?? [];
    if (raw.length === 0) return raw;
    if (selectedPeriod === '1D') {
      // Find the last point during actual trading hours (weekday 4 AM–8 PM ET).
      // Must check BOTH day-of-week AND hour — weekend polling can spill past midnight
      // into Monday, and holidays (e.g. Presidents' Day) are weekdays with no trading.
      let refDate: Date = new Date(raw[raw.length - 1].time);
      const etDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
      const etHourFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
      });
      for (let i = raw.length - 1; i >= 0; i--) {
        const d = new Date(raw[i].time);
        const wd = etDayFmt.format(d);
        if (wd === 'Sat' || wd === 'Sun') continue;
        const h = parseInt(etHourFmt.format(d).split(':')[0]);
        if (h >= 4 && h < 20) { refDate = d; break; }
      }
      const { etDateStr, etOffsetMs } = getEtOffset(refDate);
      const preMarketOpenMs = new Date(`${etDateStr}T04:00:00Z`).getTime() - etOffsetMs;
      const afterHoursCloseMs = new Date(`${etDateStr}T20:00:00Z`).getTime() - etOffsetMs;
      const pts = raw.filter(p => p.time >= preMarketOpenMs && p.time <= afterHoursCloseMs);

      const now = Date.now();
      const last = pts[pts.length - 1];
      // Guard 1: Don't append live point when quotes are degraded (repricing/stale/unavailable)
      // Guard 2: Use smoothed liveValue (requires 2 consecutive polls to confirm after-hours jumps)
      if (!quotesStale && pts.length > 0 && now - last.time > 10000 && now <= afterHoursCloseMs) {
        return [...pts, { time: now, value: liveValue }];
      }
      return pts.length >= 2 ? pts : raw;
    }
    // For ALL non-1D periods: filter to active trading sessions only.
    // The API returns 24h hourly data including dead overnight periods and weekends
    // that create flat horizontal lines on the chart.
    // Only show weekday 4 AM–8 PM ET data, index-based positioning.
    // IMPORTANT: This must cover ALL periods (1W, 1M, 3M, YTD, 1Y, ALL) — not just some.
    // Previously only 1W/1M/YTD were filtered, leaving 3M/1Y/ALL with ugly flat lines.
    {
      const etHourFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
      });
      const etDayFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', weekday: 'short',
      });
      const etDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

      // Detect if data is daily-resolution (snapshot data: ~1 point per day).
      // Daily data has timestamps at arbitrary times, so time-of-day filtering
      // would randomly remove entire days. Only filter weekends for daily data.
      const isDailyResolution = raw.length >= 2 && (() => {
        const gaps: number[] = [];
        for (let i = 1; i < Math.min(raw.length, 10); i++) {
          gaps.push(raw[i].time - raw[i - 1].time);
        }
        const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
        return medianGap > 12 * 3600000; // >12h between points = daily data
      })();

      // Step 1: Filter weekends (always) and outside-hours (only for intraday data)
      const filtered = raw.filter(p => {
        const d = new Date(p.time);
        const wd = etDayFmt.format(d);
        if (wd === 'Sat' || wd === 'Sun') return false;
        // Skip time-of-day filter for daily-resolution data (snapshot points).
        // Snapshot timestamps can fall at any hour; filtering to 4AM-8PM
        // would randomly drop entire days worth of data.
        if (isDailyResolution) return true;
        const hm = etHourFmt.format(d);
        const h = parseInt(hm.split(':')[0]);
        return h >= 4 && h < 20; // 4 AM – 8 PM ET
      });

      // Step 2: Remove holiday/no-trading days (data-driven detection).
      // Only applies to intraday data where multiple points per day exist.
      // On market holidays the API still polls but values are flat.
      // Skip for daily-resolution data — with 1 point per day there's no
      // intra-day range to detect holidays.
      if (!isDailyResolution) {
        const dayMap = new Map<string, number[]>();
        for (let i = 0; i < filtered.length; i++) {
          const dateStr = etDateFmt.format(new Date(filtered[i].time));
          if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
          dayMap.get(dateStr)!.push(i);
        }

        // Find the latest date so we never remove today (always partial data)
        const allDateKeys = [...dayMap.keys()].sort();
        const latestDate = allDateKeys[allDateKeys.length - 1];

        const skipIndices = new Set<number>();
        for (const [dateStr, indices] of dayMap) {
          // Never remove the latest day — it's always partial (especially
          // outside market hours) and looks like a holiday to the detector.
          if (dateStr === latestDate) continue;
          // Need enough points to distinguish a real holiday from a partial
          // day at chart edges. A real trading day at 15-min resolution has
          // ~64 points (16 hours × 4/hr). Require 20+ to run detection.
          if (indices.length < 20) continue;
          const vals = indices.map(idx => filtered[idx].value);
          const range = Math.max(...vals) - Math.min(...vals);
          const avgValue = vals.reduce((a, b) => a + b, 0) / vals.length;
          // Use relative threshold: if day's range < 0.1% of portfolio value,
          // it's a market holiday. Real trading days move 0.5%+ typically.
          if (avgValue > 0 && (range / avgValue) < 0.001) {
            indices.forEach(idx => skipIndices.add(idx));
          }
        }

        if (skipIndices.size > 0) {
          const result = filtered.filter((_, i) => !skipIndices.has(i));
          return result.length >= 2 ? result : raw;
        }
      }

      return filtered.length >= 2 ? filtered : raw;
    }
  }, [chartData, selectedPeriod, liveValue, quotesStale]);


  // ── Chart groups for multi-period highlighting (1W=day, 1M=week, etc.) ──
  const chartGroups = useMemo(
    () => computeChartGroups(points, selectedPeriod),
    [points, selectedPeriod],
  );

  const periodStartValue = chartData?.periodStartValue ?? currentValue;

  // ── Normalized benchmark data for overlay ──────────────────────
  const benchmarkNormalized = useMemo(() => {
    if (!showBenchmark || points.length < 2) return null;

    // Choose the right candle set based on period
    const candles = (selectedPeriod === '1D' || selectedPeriod === '1W' || selectedPeriod === '1M' || selectedPeriod === 'YTD')
      ? (intradayBenchmark.length > 0 ? intradayBenchmark : benchmarkCandles)
      : benchmarkCandles;
    if (candles.length === 0) return null;

    // For 1D: use SPY's previousClose as baseline so the overlay measures from
    // yesterday's close (matching the portfolio's periodStartValue baseline),
    // not from the first candle which may be today's pre-market open.
    let spyStartClose: number;
    if (selectedPeriod === '1D' && spyPreviousClose && spyPreviousClose > 0) {
      spyStartClose = spyPreviousClose;
    } else {
      const chartStart = points[0].time;
      const startIdx = findBenchmarkIndex(candles, chartStart);
      if (startIdx === null) return null;
      spyStartClose = candles[startIdx].close;
    }
    if (spyStartClose === 0) return null;

    const portfolioStartVal = periodStartValue;

    // Build normalized points aligned to portfolio x-axis
    // For each portfolio point, find nearest benchmark candle and normalize
    // Carry forward last known value to avoid gaps (e.g., SPY has no pre-market data)
    const normalized: { index: number; value: number }[] = [];
    let lastNormalizedValue = portfolioStartVal;
    for (let i = 0; i < points.length; i++) {
      const t = points[i].time;
      const bIdx = findBenchmarkIndex(candles, t);
      if (bIdx !== null) {
        const spyClose = candles[bIdx].close;
        lastNormalizedValue = (spyClose / spyStartClose) * portfolioStartVal;
      }
      normalized.push({ index: i, value: lastNormalizedValue });
    }

    if (normalized.length < 2) return null;
    return normalized;
  }, [showBenchmark, points, selectedPeriod, benchmarkCandles, intradayBenchmark, periodStartValue, spyPreviousClose]);

  // Compute hero display values
  const hoverValue = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex].value : null;
  const displayValue = hoverValue ?? currentValue;

  // For 1D non-hover (or hovering on the very last point): use API dayChange props
  // directly — these are purely price-based and immune to margin debt timing mismatches.
  // For hover on earlier points or non-1D: compute from chart data as before.
  const isLastPoint = hoverIndex !== null && hoverIndex === points.length - 1;
  const is1DLive = selectedPeriod === '1D' && (hoverIndex === null || isLastPoint);
  const displayChange = is1DLive ? dayChange : displayValue - periodStartValue;
  const displayChangePct = is1DLive ? dayChangePercent : (periodStartValue > 0 ? (displayChange / periodStartValue) * 100 : 0);
  const confidenceThreshold = chartData?.confidenceThreshold ?? 80;
  const hasEstimatedData = shouldShowEstimatedBadge(
    selectedPeriod,
    points,
    chartData?.estimated,
    confidenceThreshold,
  );

  // Emit period return to parent (for benchmark widget consistency)
  // When data is insufficient, emit null so benchmark widget shows dashes
  // For 1D: use API dayChangePercent (immune to margin timing)
  const periodReturnPct = chartData?.insufficientData ? null : (
    selectedPeriod === '1D'
      ? dayChangePercent
      : (periodStartValue > 0
        ? ((currentValue - periodStartValue) / periodStartValue) * 100
        : null)
  );
  useEffect(() => {
    onReturnChange?.(periodReturnPct != null ? Math.round(periodReturnPct * 100) / 100 : null);
  }, [periodReturnPct, onReturnChange]);

  const isGain = displayChange >= 0;
  // Chart line colors — muted. Full-bright reserved for hero number only.
  const lineColor = isGain ? '#0A9E10' : '#D4534B';

  // Market open status — refresh every 30s
  const [isMarketOpen, setIsMarketOpen] = useState(() => getMarketStatus().isOpen);
  useEffect(() => {
    const id = setInterval(() => setIsMarketOpen(getMarketStatus().isOpen), 30000);
    return () => clearInterval(id);
  }, []);

  // Chart geometry
  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

  const { paddedMin, paddedMax } = useMemo(() => {
    if (points.length < 2) return { paddedMin: 0, paddedMax: 1 };
    // Filter out NaN/Infinity values that would corrupt the entire Y-axis
    const values = points.map(p => p.value).filter(v => Number.isFinite(v));
    if (values.length === 0) return { paddedMin: 0, paddedMax: 1 };
    // Y-axis bounds based on portfolio only — benchmark is clipped via SVG clipPath
    // so toggling SPY never shifts the portfolio chart
    const startVal = Number.isFinite(periodStartValue) ? periodStartValue : values[0];
    let minV = Math.min(...values, startVal);
    let maxV = Math.max(...values, startVal);
    if (maxV === minV) { maxV += 1; minV -= 1; }
    const range = maxV - minV;
    return { paddedMin: minV - range * 0.08, paddedMax: maxV + range * 0.08 };
  }, [points, periodStartValue]);

  // For 1D, use time-based positioning from pre-market open (4 AM ET) to AH close (8 PM ET)
  // Derive the trading day from the data points (not "today") so it works after hours / weekends
  const is1D = selectedPeriod === '1D' && points.length > 1;
  let dayStartMs = 0, dayEndMs = 0;
  if (is1D) {
    // Use the last data point's date to determine which trading day this is
    // (1D data spans ~24h, so the first point may be from the previous ET day)
    const { etDateStr, etOffsetMs } = getEtOffset(new Date(points[points.length - 1].time));
    dayStartMs = new Date(`${etDateStr}T04:00:00Z`).getTime() - etOffsetMs;
    dayEndMs = new Date(`${etDateStr}T20:00:00Z`).getTime() - etOffsetMs;
  }
  const dayRangeMs = dayEndMs - dayStartMs;

  const toX = (i: number) => {
    if (is1D && dayRangeMs > 0) {
      const ratio = Math.max(0, Math.min(1, (points[i].time - dayStartMs) / dayRangeMs));
      return PAD_LEFT + ratio * plotW;
    }
    return PAD_LEFT + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  };
  const toY = (value: number) => {
    if (!Number.isFinite(value)) return CHART_H - PAD_BOTTOM; // NaN/Infinity → bottom
    const y = PAD_TOP + plotH - ((value - paddedMin) / (paddedMax - paddedMin)) * plotH;
    return Math.max(PAD_TOP, Math.min(y, CHART_H - PAD_BOTTOM));
  };

  const hasData = points.length >= 2;

  // Build SVG path
  const pathD = hasData ? points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ') : '';

  // Lightly smoothed benchmark values (3-point weighted average, ~8% smoothing)
  const benchmarkSmoothed = useMemo(() => {
    if (!benchmarkNormalized || benchmarkNormalized.length < 2) return null;
    return benchmarkNormalized.map((bp, i, arr) => {
      if (i === 0 || i === arr.length - 1) return bp;
      const smoothed = arr[i - 1].value * 0.15 + bp.value * 0.70 + arr[i + 1].value * 0.15;
      return { ...bp, value: smoothed };
    });
  }, [benchmarkNormalized]);

  // Build benchmark SVG path from smoothed values
  const benchmarkPathD = useMemo(() => {
    if (!benchmarkSmoothed || benchmarkSmoothed.length < 2) return '';
    return benchmarkSmoothed
      .map((bp, j) => `${j === 0 ? 'M' : 'L'}${toX(bp.index).toFixed(1)},${toY(bp.value).toFixed(1)}`)
      .join(' ');
  // toX/toY are inline functions — their underlying deps (points, paddedMin, paddedMax) are already listed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkSmoothed, points, paddedMin, paddedMax]);


  // Benchmark value at hover index (for tooltip)
  const hoverBenchmarkValue = useMemo(() => {
    if (!showBenchmark || !benchmarkNormalized || hoverIndex === null) return null;
    const match = benchmarkNormalized.find(bp => bp.index === hoverIndex);
    return match?.value ?? null;
  }, [showBenchmark, benchmarkNormalized, hoverIndex]);

  // Session split indices: market open (9:30 AM ET) and close (4:00 PM ET)
  const { sessionSplitIdx, sessionCloseIdx } = useMemo(() => {
    if (!hasData || !is1D) return { sessionSplitIdx: null, sessionCloseIdx: null };

    // Derive trading day from last data point (works after hours / weekends)
    const { etDateStr, etOffsetMs } = getEtOffset(new Date(points[points.length - 1].time));
    const openMs = new Date(`${etDateStr}T09:30:00Z`).getTime() - etOffsetMs;
    const closeMs = new Date(`${etDateStr}T16:00:00Z`).getTime() - etOffsetMs;

    const oIdx = points.findIndex(p => p.time >= openMs);
    const cIdx = points.findIndex(p => p.time >= closeMs);

    return {
      sessionSplitIdx: (oIdx > 0 && oIdx < points.length) ? oIdx : null,
      sessionCloseIdx: (cIdx > 0 && cIdx < points.length) ? cIdx : null,
    };
  }, [hasData, is1D, points]);

  const refY = hasData ? toY(periodStartValue) : 0;

  // Time labels — only for non-1D periods.
  // Place one label per unique calendar day to avoid duplicates.
  const timeLabels: { label: string; x: number }[] = [];
  if (hasData && selectedPeriod !== '1D') {
    const dayBounds: { label: string; midIdx: number }[] = [];
    let prevLabel = '', startIdx = 0;
    for (let i = 0; i <= points.length; i++) {
      const label = i < points.length
        ? new Date(points[i].time).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })
        : '';
      if (label !== prevLabel) {
        if (prevLabel) dayBounds.push({ label: prevLabel, midIdx: Math.floor((startIdx + i - 1) / 2) });
        startIdx = i;
        prevLabel = label;
      }
    }
    const maxLabels = 6;
    const step = Math.max(1, Math.ceil(dayBounds.length / maxLabels));
    for (let g = 0; g < dayBounds.length; g += step) {
      timeLabels.push({ label: dayBounds[g].label, x: toX(dayBounds[g].midIdx) });
    }
    // Always include today (last date) so the chart's right edge is labeled.
    // If it's too close to the previous label, replace it to avoid cramping.
    const lastDay = dayBounds[dayBounds.length - 1];
    if (lastDay && timeLabels[timeLabels.length - 1]?.label !== lastDay.label) {
      const lastLabel = { label: lastDay.label, x: toX(lastDay.midIdx) };
      const prev = timeLabels[timeLabels.length - 1];
      if (prev && lastLabel.x - prev.x < plotW * 0.12) {
        timeLabels[timeLabels.length - 1] = lastLabel; // replace cramped label
      } else {
        timeLabels.push(lastLabel);
      }
    }
  }


  // ── Mouse → SVG X coordinate ───────────────────────────────────

  const mouseToSvgX = useCallback((e: React.MouseEvent<SVGSVGElement>): number => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * CHART_W;
  }, []);

  const findNearestIndex = useCallback((svgX: number): number => {
    if (is1D && dayRangeMs > 0) {
      const ratio = (svgX - PAD_LEFT) / plotW;
      const mouseTime = dayStartMs + ratio * dayRangeMs;
      let best = 0, bestDist = Math.abs(points[0].time - mouseTime);
      for (let i = 1; i < points.length; i++) {
        const dist = Math.abs(points[i].time - mouseTime);
        if (dist < bestDist) { best = i; bestDist = dist; }
      }
      return best;
    }
    return snapToNearest(svgX, points, toX);
  // toX is an inline function — its underlying deps (points, plotW, is1D, dayStartMs, dayRangeMs) are already listed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, plotW, is1D, dayStartMs, dayRangeMs]);

  // ── Hover handler ──────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return;
    const svgX = mouseToSvgX(e);
    const idx = findNearestIndex(svgX);
    setHoverIndex(idx);
  }, [points, mouseToSvgX, findNearestIndex]);

  const handleMouseLeave = useCallback(() => setHoverIndex(null), []);

  // ── Touch hover (press-drag crosshair) ────────
  const isTouchHoveringRef = useRef(false);
  const wasTouchRef = useRef(false);
  const isTwoFingerRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    wasTouchRef.current = true;

    if (e.touches.length === 2 && svgRef.current && points.length >= 2) {
      e.preventDefault();
      isTwoFingerRef.current = true;
      // Clear single-finger hover
      isTouchHoveringRef.current = false;
      touchStartPosRef.current = null;
      setHoverIndex(null);
      // Map both touch positions to data indices
      const rect = svgRef.current.getBoundingClientRect();
      const svgX0 = ((e.touches[0].clientX - rect.left) / rect.width) * CHART_W;
      const svgX1 = ((e.touches[1].clientX - rect.left) / rect.width) * CHART_W;
      setMeasureA(findNearestIndex(svgX0));
      setMeasureB(findNearestIndex(svgX1));
      setShowHint(false);
    } else if (e.touches.length === 1 && !isTwoFingerRef.current) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (svgRef.current && points.length >= 2) {
        isTouchHoveringRef.current = true;
        const rect = svgRef.current.getBoundingClientRect();
        const svgX = ((e.touches[0].clientX - rect.left) / rect.width) * CHART_W;
        setHoverIndex(findNearestIndex(svgX));
      }
    }
  }, [points, findNearestIndex]);

  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2 && isTwoFingerRef.current && svgRef.current) {
      e.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const svgX0 = ((e.touches[0].clientX - rect.left) / rect.width) * CHART_W;
      const svgX1 = ((e.touches[1].clientX - rect.left) / rect.width) * CHART_W;
      setMeasureA(findNearestIndex(svgX0));
      setMeasureB(findNearestIndex(svgX1));
    } else if (e.touches.length === 1 && !isTwoFingerRef.current && isTouchHoveringRef.current && svgRef.current) {
      e.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((e.touches[0].clientX - rect.left) / rect.width) * CHART_W;
      setHoverIndex(findNearestIndex(svgX));
    }
  }, [findNearestIndex]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (isTwoFingerRef.current) {
      // Prevent synthetic click events from firing after two-finger gesture
      e.preventDefault();
      if (e.touches.length === 0) {
        // Both fingers lifted — clear measurement and exit two-finger mode
        isTwoFingerRef.current = false;
        setMeasureA(null);
        setMeasureB(null);
      }
      // One finger still down — keep measurement visible until both lift
      return;
    }
    // Detect tap vs drag: if finger barely moved, allow click handler to fire for measurement
    if (e.touches.length === 0 && touchStartPosRef.current && e.changedTouches.length > 0) {
      const endTouch = e.changedTouches[0];
      const dx = Math.abs(endTouch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(endTouch.clientY - touchStartPosRef.current.y);
      if (dx < 10 && dy < 10) {
        wasTouchRef.current = false; // allow synthetic click → places measurement point
      }
    }
    touchStartPosRef.current = null;
    // Clear single-finger hover
    if (isTouchHoveringRef.current) {
      isTouchHoveringRef.current = false;
      setHoverIndex(null);
    }
  }, []);

  // ── Click handler (measurement — desktop only) ────────────────

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (wasTouchRef.current) { wasTouchRef.current = false; return; }
    if (!hasData || points.length < 2) return;
    const svgX = mouseToSvgX(e);
    const idx = findNearestIndex(svgX);

    setShowHint(false);

    if (hasMeasurement) {
      // Third click: clear and start new
      setMeasureA(idx);
      setMeasureB(null);
    } else if (measureA === null) {
      // First click
      setMeasureA(idx);
    } else {
      // Second click
      setMeasureB(idx);
    }
  }, [hasData, points, mouseToSvgX, findNearestIndex, measureA, hasMeasurement]);

  // ── Measurement computation ────────────────────────────────────

  const measurement = useMemo<MeasurementResult | null>(() => {
    if (measureA === null || measureB === null) return null;
    const a = Math.min(measureA, measureB);
    const b = Math.max(measureA, measureB);
    if (!points[a] || !points[b]) return null;
    return computeMeasurement(
      points[a].value, points[b].value,
      points[a].time, points[b].time,
    );
  }, [measureA, measureB, points]);

  // Benchmark comparison — use intraday candles when available for precise matching
  const activeBenchmarkCandles = intradayBenchmark.length > 0 ? intradayBenchmark : benchmarkCandles;
  const benchmarkResult = useMemo(() => {
    if (!measurement || activeBenchmarkCandles.length === 0) return null;
    // With intraday data, use direct start/end matching (no previous-day baseline needed)
    const useIntraday = intradayBenchmark.length > 0;
    if (useIntraday) {
      const startIdx = findBenchmarkIndex(activeBenchmarkCandles, measurement.startTime);
      const endIdx = findBenchmarkIndex(activeBenchmarkCandles, measurement.endTime);
      if (startIdx === null || endIdx === null) return null;
      const startClose = activeBenchmarkCandles[startIdx].close;
      const endClose = activeBenchmarkCandles[endIdx].close;
      if (startClose === 0) return null;
      const spyReturn = ((endClose - startClose) / startClose) * 100;
      return { spyReturn, outperformance: measurement.percentChange - spyReturn };
    }
    // Fall back to daily candles with previous-day baseline
    const result = computeBenchmarkReturn(activeBenchmarkCandles, measurement.startTime, measurement.endTime);
    if (!result) return null;
    return { spyReturn: result.spyReturn, outperformance: measurement.percentChange - result.spyReturn };
  }, [measurement, activeBenchmarkCandles, intradayBenchmark.length]);

  const measureIsGain = measurement ? measurement.dollarChange >= 0 : true;
  const measureColor = measureIsGain ? '#00C805' : '#E8544E';

  // ── Notify parent of measurement changes ───────────────────────
  useEffect(() => {
    if (!onMeasurementChange) return;
    if (!measurement) {
      onMeasurementChange(null);
    } else {
      onMeasurementChange({
        startTime: measurement.startTime,
        endTime: measurement.endTime,
        startValue: measurement.startValue,
        endValue: measurement.endValue,
        dollarChange: measurement.dollarChange,
        percentChange: measurement.percentChange,
        daysBetween: measurement.daysBetween,
        benchmarkReturn: benchmarkResult?.spyReturn ?? null,
        outperformance: benchmarkResult?.outperformance ?? null,
      });
    }
  }, [measurement, benchmarkResult, onMeasurementChange]);

  // ── SVG coordinates for measurement markers ────────────────────

  const mAx = measureA !== null ? toX(measureA) : null;
  const mAy = measureA !== null && points[measureA] ? toY(points[measureA].value) : null;
  const mBx = measureB !== null ? toX(measureB) : null;
  const mBy = measureB !== null && points[measureB] ? toY(points[measureB].value) : null;

  // Shaded region path between A and B
  const shadedPath = useMemo(() => {
    if (measureA === null || measureB === null) return '';
    const lo = Math.min(measureA, measureB);
    const hi = Math.max(measureA, measureB);
    if (lo < 0 || hi >= points.length) return ''; // guard stale indices after data refresh
    const pts = [];
    for (let i = lo; i <= hi; i++) {
      if (!points[i]) break;
      pts.push(`${i === lo ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(points[i].value).toFixed(1)}`);
    }
    if (pts.length < 2) return '';
    pts.push(`L${toX(hi).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)}`);
    pts.push(`L${toX(lo).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)} Z`);
    return pts.join(' ');
    // toX/toY are inline functions — their real deps (points, paddedMin, paddedMax) are already covered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureA, measureB, points]);

  // Hover display
  const hoverX = hoverIndex !== null && points[hoverIndex] ? toX(hoverIndex) : null;
  const hoverY = hoverIndex !== null && points[hoverIndex] ? toY(points[hoverIndex].value) : null;
  const hoverLabel = hoverIndex !== null && points[hoverIndex] ? (
    selectedPeriod === '1D'
      ? new Date(points[hoverIndex].time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : new Date(points[hoverIndex].time).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  ) : null;

  const lastX = points.length > 0 ? toX(points.length - 1) : CHART_W / 2;
  const lastY = points.length > 0 ? toY(points[points.length - 1].value) : CHART_H / 2;

  // ── Manual idle dot animation + collision detection ──────────────
  // Uses getPointAtLength() on a hidden <path> to know exact dot position
  // every frame. When the dot is close to (lastX, lastY), trigger ripple.
  const lastXRef = useRef(lastX);
  const lastYRef = useRef(lastY);
  lastXRef.current = lastX;
  lastYRef.current = lastY;

  // Persistent animation start time - survives pathD changes
  const idleAnimStartRef = useRef<number | null>(null);
  const idleRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isIdle) {
      // Reset start time when exiting idle so next idle starts fresh
      idleAnimStartRef.current = null;
      if (idleRafRef.current) {
        cancelAnimationFrame(idleRafRef.current);
        idleRafRef.current = null;
      }
      return;
    }

    if (!idlePathRef.current) return;
    const path = idlePathRef.current;
    const totalLen = path.getTotalLength();
    if (totalLen === 0) return;

    // Scale duration to path length so dot speed is consistent across all timeframes
    // ~7px per second feels smooth; clamp between 8s and 18s
    const IDLE_CYCLE_MS = Math.max(8000, Math.min(18000, totalLen * 7));

    const tick = (now: number) => {
      // Use persistent start time so animation doesn't reset on data updates
      if (idleAnimStartRef.current === null) idleAnimStartRef.current = now;

      // Re-get path in case it changed
      const currentPath = idlePathRef.current;
      if (!currentPath) return;
      const currentLen = currentPath.getTotalLength();
      if (currentLen === 0) return;

      const elapsed = (now - idleAnimStartRef.current) % IDLE_CYCLE_MS;
      const progress = elapsed / IDLE_CYCLE_MS; // 0→1
      const len = progress * currentLen;
      const pt = currentPath.getPointAtLength(len);

      // Direct DOM mutation — avoids 60 setState calls per second
      if (idleDotGlowRef.current) {
        idleDotGlowRef.current.setAttribute('cx', String(pt.x));
        idleDotGlowRef.current.setAttribute('cy', String(pt.y));
      }
      if (idleDotRef.current) {
        idleDotRef.current.setAttribute('cx', String(pt.x));
        idleDotRef.current.setAttribute('cy', String(pt.y));
      }
      if (idleDotGroupRef.current) idleDotGroupRef.current.style.display = '';

      // Collision check against end-of-day dot
      const dx = pt.x - lastXRef.current;
      const dy = pt.y - lastYRef.current;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 12 && !rippleCooldownRef.current) {
        rippleCooldownRef.current = true;
        setShowRipple(true);
        setRippleKey(k => k + 1);
        rippleTimers.push(setTimeout(() => setShowRipple(false), 3200));
        rippleTimers.push(setTimeout(() => { rippleCooldownRef.current = false; }, 2000));
      }

      idleRafRef.current = requestAnimationFrame(tick);
    };

    const rippleTimers: ReturnType<typeof setTimeout>[] = [];
    idleRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (idleRafRef.current) cancelAnimationFrame(idleRafRef.current);
      rippleTimers.forEach(t => clearTimeout(t));
    };
  }, [isIdle]); // Removed pathD dependency - animation persists through data updates

  return (
    <div className={`relative ${mobileTopPadding === 'tight' ? 'pt-0 sm:pt-5' : 'pt-5'} pb-3`} data-capture-id="portfolio-chart">
      {/* Nala branding — hidden normally, visible only in html2canvas captures */}
      <img
        src="/north-signal-logo-transparent.png"
        alt=""
        className="absolute bottom-3 right-3 sm:right-6 w-10 h-10 sm:w-12 sm:h-12 opacity-0 z-10 pointer-events-none"
        data-capture-brand="true"
      />
      {/* Fixed-height header area — prevents chart from shifting when measurement state changes */}
      <div className="mb-5 relative z-10 px-3 sm:px-6" style={{ minHeight: '150px' }} data-capture-hero="true">
        {/* Hero value display — always visible */}
        <div>
            {headerLabel && <div className="mb-0.5">{headerLabel}</div>}
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={handleHeroValueClick}
                className="text-left cursor-pointer group"
                aria-label="Animate portfolio value"
                title="Click to cycle value animation"
              >
                <span
                  key={`hero-value-${heroAnimationRunId}`}
                  className={`block text-[40px] sm:text-[clamp(48px,3.5vw,64px)] font-black tracking-tighter leading-none text-rh-light-text dark:text-rh-text transition-colors duration-150 ${
                    isGain ? 'hero-glow-green' : displayChange === 0 ? 'hero-glow-neutral' : 'hero-glow-red'
                  } ${heroAnimationRunId > 0 ? HERO_VALUE_ANIMATIONS[heroAnimationIndex] : ''}`}
                >
                  {formatCurrency(displayValue)}
                </span>
              </button>
              {portfolioBreakdown && (
                <div className="relative mt-2 sm:mt-3">
                  <button
                    onClick={() => setShowBreakdown(v => !v)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-medium text-transparent hover:border hover:border-rh-light-muted/40 dark:hover:border-white/25 hover:text-rh-light-muted/60 dark:hover:text-white/35 transition-colors"
                  >
                    i
                  </button>
                  {showBreakdown && (
                    <div className="absolute top-1/2 -translate-y-1/2 left-full ml-2 px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-xl border border-gray-200/60 dark:border-white/[0.08] shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] whitespace-nowrap z-20 animate-in fade-in duration-150">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-6">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-white/40">Assets</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-rh-text">${portfolioBreakdown.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-white/40">Equity</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-rh-text">${portfolioBreakdown.netEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {portfolioBreakdown.cashBalance > 0 && (
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-rh-green/60">Cash</span>
                            <span className="text-xs font-bold text-rh-green">${portfolioBreakdown.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {portfolioBreakdown.marginDebt > 0 && (
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-rh-red/60">Margin</span>
                            <span className="text-xs font-bold text-rh-red">-${portfolioBreakdown.marginDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Session-aware change lines for 1D pre-market/after-hours */}
            {(() => {
              // Determine which session the hover is in (1D only)
              let hoverSession: 'pre' | 'market' | 'after' | null = null;
              if (selectedPeriod === '1D' && hoverIndex !== null && sessionSplitIdx !== null) {
                const closeIdx = sessionCloseIdx ?? points.length - 1;
                if (hoverIndex < sessionSplitIdx) hoverSession = 'pre';
                else if (hoverIndex <= closeIdx) hoverSession = 'market';
                else hoverSession = 'after';
              }

              // Pre-market hover: show pre-market change at hovered point.
              // If regular session has started (POST/REG), also show "Today" for comparison.
              if (hoverSession === 'pre' && hoverIndex !== null) {
                if (session !== 'PRE') {
                  // Market has opened — show both Today and Pre-market for comparison
                  const regChange = regularDayChange ?? dayChange;
                  const regChangePct = regularDayChangePercent ?? dayChangePercent;
                  return (
                    <>
                      <p className={`text-sm sm:text-base mt-1.5 font-semibold ${regChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                        {formatChange(regChange)} ({formatPct(regChangePct)})
                        <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-sm ml-2">Today</span>
                      </p>
                      <p className={`text-sm mt-0.5 font-medium ${displayChange >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                        {formatChange(displayChange)} ({formatPct(displayChangePct)})
                        <span className="text-rh-light-muted/30 dark:text-rh-muted/30 font-normal text-xs ml-1.5">Pre-market</span>
                        {hoverLabel && <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-xs ml-1.5">{hoverLabel}</span>}
                      </p>
                    </>
                  );
                }
                // Still in pre-market — single line
                return (
                  <p className={`text-sm sm:text-base mt-1.5 font-semibold ${displayChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {formatChange(displayChange)} ({formatPct(displayChangePct)})
                    <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-sm ml-2">Pre-market</span>
                    {hoverLabel && <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-xs ml-1.5">{hoverLabel}</span>}
                  </p>
                );
              }

              // After-hours hover: "Today" (regular session) + "After hours" (separate movement)
              if (hoverSession === 'after' && hoverIndex !== null) {
                const regChange = regularDayChange ?? dayChange;
                const regChangePct = regularDayChangePercent ?? dayChangePercent;
                const regularCloseVal = periodStartValue + (regularDayChange ?? dayChange);
                const ahChange = displayValue - regularCloseVal;
                const ahChangePct = regularCloseVal > 0 ? (ahChange / regularCloseVal) * 100 : 0;
                return (
                  <>
                    <p className={`text-sm sm:text-base mt-1.5 font-semibold ${regChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                      {formatChange(regChange)} ({formatPct(regChangePct)})
                      <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-sm ml-2">Today</span>
                    </p>
                    <p className={`text-sm mt-0.5 font-medium ${ahChange >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                      {formatChange(ahChange)} ({formatPct(ahChangePct)})
                      <span className="text-rh-light-muted/30 dark:text-rh-muted/30 font-normal text-xs ml-1.5">After hours</span>
                      {hoverLabel && <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-xs ml-1.5">{hoverLabel}</span>}
                    </p>
                  </>
                );
              }

              // Not hovering + pre-market: single line labeled "Pre-market" (no regular session yet today)
              if (selectedPeriod === '1D' && hoverIndex === null && session === 'PRE') {
                return (
                  <p className={`text-sm sm:text-base mt-1.5 font-semibold ${displayChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {formatChange(displayChange)} ({formatPct(displayChangePct)})
                    <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-sm ml-2">Pre-market</span>
                  </p>
                );
              }

              // Not hovering + after hours: two-line "Today" + "After hours"
              if (selectedPeriod === '1D' && hoverIndex === null && afterHoursChange != null && Math.abs(afterHoursChange) > 0.005 && session === 'POST') {
                return (
                  <div className="mb-1">
                    <p className={`text-sm mt-1.5 font-semibold ${(regularDayChange ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                      {formatChange(regularDayChange ?? 0)} ({formatPct(regularDayChangePercent ?? 0)})
                      <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-xs ml-2">Today</span>
                    </p>
                    <p className={`text-xs mt-0.5 font-medium ${afterHoursChange >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                      {formatChange(afterHoursChange)} ({formatPct(afterHoursChangePercent ?? 0)})
                      <span className="text-rh-light-muted/30 dark:text-rh-muted/30 font-normal text-[10px] ml-1.5">After hours</span>
                    </p>
                  </div>
                );
              }

              // Default: single line (regular hours hover, non-1D, etc.)
              return (
                <>
                  <p className={`text-sm sm:text-base mt-1.5 font-semibold ${isGain ? 'text-rh-green' : 'text-rh-red'}`}>
                    {formatChange(displayChange)} ({formatPct(displayChangePct)})
                    {hoverIndex !== null && hoverLabel && (
                      <span className="text-rh-light-muted/60 dark:text-rh-muted/60 font-normal text-sm ml-2">{hoverLabel}</span>
                    )}
                    {hoverIndex === null && selectedPeriod === '1D' && (
                      <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-sm ml-2">Today</span>
                    )}
                  </p>
                  {/* Benchmark comparison on hover */}
                  {showBenchmark && hoverBenchmarkValue !== null && hoverIndex !== null && (
                    (() => {
                      const spyChange = hoverBenchmarkValue - periodStartValue;
                      const spyChangePct = periodStartValue > 0 ? (spyChange / periodStartValue) * 100 : 0;
                      const outperformPct = displayChangePct - spyChangePct;
                      return (
                        <p className="text-xs mt-0.5 text-rh-light-muted dark:text-rh-muted">
                          <span className="opacity-60">SPY: </span>
                          <span className={spyChangePct >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}>
                            {formatPct(spyChangePct)}
                          </span>
                          <span className="mx-1.5 opacity-40">·</span>
                          <span className={`font-semibold ${outperformPct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                            {formatPct(outperformPct)} vs SPY
                          </span>
                        </p>
                      );
                    })()
                  )}
                </>
              );
            })()}

            {hasEstimatedData && (
              <div className="mt-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  Estimated
                </span>
              </div>
            )}

            {/* Single-point selected indicator */}
            {isMeasuring && measureA !== null && points[measureA] && (
              <div className="mt-3 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
                  <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                    {formatShortDate(points[measureA].time, is1D)}
                  </span>
                  <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">
                    — click another point to measure
                  </span>
                </div>
              </div>
            )}
          </div>

        {/* Measurement hint — details shown in stats section below chart */}
        {hasMeasurement && measurement && (
          <div className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50 mt-1">
            {'ontouchstart' in window ? 'Tap chart to remeasure · Tap outside to clear' : 'Click chart to remeasure · Click outside to clear'}
          </div>
        )}
      </div>

      {/* Chart — MIDGROUND: recessed, context only */}
      <div className="relative w-full chart-layer chart-fade-in" style={{ aspectRatio: `${CHART_W}/${CHART_H}`, maxHeight: 'min(50vh, 480px)' }}>
        {/* Fetch error state — shown when chart fails to load */}
        {!loading && fetchError && !hasData && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-gray-300 dark:text-white/20 mb-2">
              <path d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-gray-400 dark:text-white/30 mb-2">Chart unavailable</p>
            <button
              onClick={() => { setFetchError(false); fetchChart(selectedPeriod); }}
              className="text-xs text-rh-green hover:underline"
            >
              Tap to retry
            </button>
          </div>
        )}
        {/* Insufficient data state — shown when API returns insufficientData for non-1D periods */}
        {!loading && chartData?.insufficientData && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-gray-300 dark:text-white/20 mb-3">
              <path d="M3 17L9 11L13 15L21 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17 7H21V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm font-medium text-gray-400 dark:text-white/30">Not enough data for this period yet</p>
            <p className="text-xs text-gray-300 dark:text-white/15 mt-1">Your chart will build automatically over time</p>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 z-10">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.06" />
                  <stop offset="40%" stopColor="currentColor" stopOpacity="0.12" />
                  <stop offset="50%" stopColor="currentColor" stopOpacity="0.18" />
                  <stop offset="60%" stopColor="currentColor" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
                  <animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="2 0" dur="1.8s" repeatCount="indefinite" />
                </linearGradient>
              </defs>
              {/* Skeleton wave path — smooth sine-like curve */}
              <path
                d={`M0,${CHART_H * 0.5} C${CHART_W * 0.08},${CHART_H * 0.35} ${CHART_W * 0.15},${CHART_H * 0.6} ${CHART_W * 0.22},${CHART_H * 0.45} C${CHART_W * 0.29},${CHART_H * 0.3} ${CHART_W * 0.35},${CHART_H * 0.55} ${CHART_W * 0.42},${CHART_H * 0.38} C${CHART_W * 0.5},${CHART_H * 0.2} ${CHART_W * 0.58},${CHART_H * 0.5} ${CHART_W * 0.65},${CHART_H * 0.35} C${CHART_W * 0.72},${CHART_H * 0.2} ${CHART_W * 0.8},${CHART_H * 0.55} ${CHART_W * 0.88},${CHART_H * 0.4} C${CHART_W * 0.94},${CHART_H * 0.3} ${CHART_W * 0.97},${CHART_H * 0.45} ${CHART_W},${CHART_H * 0.42} L${CHART_W},${CHART_H} L0,${CHART_H} Z`}
                fill="url(#shimmer)"
                className="text-gray-400 dark:text-gray-500"
              />
              <path
                d={`M0,${CHART_H * 0.5} C${CHART_W * 0.08},${CHART_H * 0.35} ${CHART_W * 0.15},${CHART_H * 0.6} ${CHART_W * 0.22},${CHART_H * 0.45} C${CHART_W * 0.29},${CHART_H * 0.3} ${CHART_W * 0.35},${CHART_H * 0.55} ${CHART_W * 0.42},${CHART_H * 0.38} C${CHART_W * 0.5},${CHART_H * 0.2} ${CHART_W * 0.58},${CHART_H * 0.5} ${CHART_W * 0.65},${CHART_H * 0.35} C${CHART_W * 0.72},${CHART_H * 0.2} ${CHART_W * 0.8},${CHART_H * 0.55} ${CHART_W * 0.88},${CHART_H * 0.4} C${CHART_W * 0.94},${CHART_H * 0.3} ${CHART_W * 0.97},${CHART_H * 0.45} ${CHART_W},${CHART_H * 0.42}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-gray-400/30 dark:text-gray-600/40"
              />
            </svg>
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className={`w-full h-full overflow-visible transition-opacity duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          data-no-tab-swipe
          style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        >
          <defs>
            {/* Stroke brightness gradient — boosted when market open */}
            <linearGradient id="stroke-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0" />
              <stop offset="3%" stopColor={lineColor} stopOpacity={isMarketOpen ? 0.7 : 0.5} />
              <stop offset="40%" stopColor={lineColor} stopOpacity={isMarketOpen ? 0.95 : 0.8} />
              <stop offset="97%" stopColor={lineColor} stopOpacity="1" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            {/* Water ripple distortion filter */}
            <filter id="ripple-warp" x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence type="turbulence" baseFrequency="0.03 0.06" numOctaves="3" seed="2" result="turb" />
              <feDisplacementMap in="SourceGraphic" in2="turb" scale="8" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            {/* Hover dot glow */}
            <radialGradient id="dot-glow">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </radialGradient>
            {/* Area fill gradient under line — richer gradient for more visual weight */}
            <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={isMarketOpen ? 0.12 : 0.06} />
              <stop offset="50%" stopColor={lineColor} stopOpacity={isMarketOpen ? 0.04 : 0.02} />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            {/* Measurement shading gradient */}
            <linearGradient id="measure-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={measureColor} stopOpacity="0.20" />
              <stop offset="100%" stopColor={measureColor} stopOpacity="0.03" />
            </linearGradient>
            {/* Clip benchmark to plot area so SPY doesn't bleed outside chart bounds.
                Extra 30px on right for "SPY" label, extra 10px top/bottom for stroke width. */}
            <clipPath id="chart-clip">
              <rect x={PAD_LEFT} y={PAD_TOP - 10} width={CHART_W - PAD_LEFT - PAD_RIGHT + 30} height={plotH + 20} />
            </clipPath>
          </defs>

          {/* Reference line — session-colored for 1D */}
          {hasData && sessionSplitIdx !== null ? (() => {
            const closeIdx = sessionCloseIdx ?? points.length - 1;
            const x0 = PAD_LEFT;
            const xOpen = toX(sessionSplitIdx);
            const xClose = toX(closeIdx);
            const xEnd = CHART_W - PAD_RIGHT;
            return (
              <>
                {/* Pre-market */}
                <line x1={x0} y1={refY} x2={xOpen} y2={refY}
                  stroke={lineColor} strokeWidth="0.6" strokeDasharray="5,5" opacity="0.25" />
                {/* Regular hours */}
                <line x1={xOpen} y1={refY} x2={xClose} y2={refY}
                  stroke="#ffffff" strokeWidth="0.6" strokeDasharray="5,5" opacity="0.35" />
                {/* After-hours */}
                <line x1={xClose} y1={refY} x2={xEnd} y2={refY}
                  stroke={lineColor} strokeWidth="0.6" strokeDasharray="5,5" opacity="0.25" />
              </>
            );
          })() : hasData ? (
            <line x1={PAD_LEFT} y1={refY} x2={CHART_W - PAD_RIGHT} y2={refY}
              stroke="#6B7280" strokeWidth="0.6" strokeDasharray="5,5" opacity="0.25" />
          ) : null}

          {/* Area fill — split at market open when applicable */}
          {hasData && sessionSplitIdx !== null ? (
            <>
              {/* Area fills split into pre-market / market hours / after-hours */}
              {(() => {
                const bottom = CHART_H - PAD_BOTTOM;
                const closeIdx = sessionCloseIdx ?? points.length - 1;
                const hasAH = sessionCloseIdx !== null && sessionCloseIdx < points.length - 1;

                const buildFill = (from: number, to: number) => {
                  const seg = points.slice(from, to + 1)
                    .map((p, j) => {
                      const idx = from + j;
                      return `${j === 0 ? 'M' : 'L'}${toX(idx).toFixed(1)},${toY(p.value).toFixed(1)}`;
                    }).join(' ');
                  return `${seg} L${toX(to).toFixed(1)},${bottom} L${toX(from).toFixed(1)},${bottom} Z`;
                };

                return (
                  <>
                    {/* Pre-open — muted */}
                    <path d={buildFill(0, sessionSplitIdx)} fill={lineColor} opacity="0.02" />
                    {/* Market hours — stronger */}
                    <path d={buildFill(sessionSplitIdx, closeIdx)} fill={lineColor} opacity="0.06" />
                    {/* After hours — muted */}
                    {hasAH && (
                      <path d={buildFill(closeIdx, points.length - 1)} fill={lineColor} opacity="0.02" />
                    )}
                  </>
                );
              })()}
            </>
          ) : hasData && chartGroups.length > 1 ? (
            /* Multi-group: single continuous area fill */
            <>
              <path
                d={`${pathD} L${toX(points.length - 1).toFixed(1)},${(CHART_H - PAD_BOTTOM)} L${toX(0).toFixed(1)},${(CHART_H - PAD_BOTTOM)} Z`}
                fill="url(#area-fill)"
              />
            </>
          ) : hasData && (
            <path
              d={`${pathD} L${toX(points.length - 1).toFixed(1)},${(CHART_H - PAD_BOTTOM)} L${toX(0).toFixed(1)},${(CHART_H - PAD_BOTTOM)} Z`}
              fill="url(#area-fill)"
            />
          )}

          {/* Session veils — soft vertical gradients at market open and close */}
          {hasData && [
            { idx: sessionSplitIdx, id: 'session-veil-open' },
            { idx: sessionCloseIdx, id: 'session-veil-close' },
          ].map(({ idx, id }) => idx !== null && (() => {
            const veilX = toX(idx);
            const veilW = 3;
            const priceY = toY(points[idx].value);
            const frac = (priceY - PAD_TOP) / plotH;
            return (
              <g key={id}>
                <defs>
                  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity="0" />
                    <stop offset={`${Math.max(5, frac * 100 - 12)}%`} stopColor={lineColor} stopOpacity="0.04" />
                    <stop offset={`${frac * 100}%`} stopColor={lineColor} stopOpacity="0.14" />
                    <stop offset={`${Math.min(95, frac * 100 + 12)}%`} stopColor={lineColor} stopOpacity="0.04" />
                    <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <rect
                  x={veilX - veilW / 2}
                  y={PAD_TOP}
                  width={veilW}
                  height={plotH}
                  fill={`url(#${id})`}
                />
              </g>
            );
          })())}


          {/* Price line — on 1D with session splits, render 3 segments with hover highlighting */}
          {hasData && sessionSplitIdx !== null ? (() => {
            const closeIdx = sessionCloseIdx ?? points.length - 1;
            const hasAH = sessionCloseIdx !== null && sessionCloseIdx < points.length - 1;

            // Determine which session the hover is in
            let hoveredSession: 'pre' | 'market' | 'after' | null = null;
            if (hoverIndex !== null) {
              if (hoverIndex < sessionSplitIdx) hoveredSession = 'pre';
              else if (hoverIndex < closeIdx) hoveredSession = 'market';
              else hoveredSession = 'after';
            }

            const buildSeg = (from: number, to: number) =>
              points.slice(from, to + 1).map((p, j) => {
                const idx = from + j;
                return `${j === 0 ? 'M' : 'L'}${toX(idx).toFixed(1)},${toY(p.value).toFixed(1)}`;
              }).join(' ');

            const dimOpacity = hoveredSession !== null ? 0.25 : 0.45;
            const activeOpacity = 1;
            const dimWidth = 1.5;
            const activeWidth = 2;

            return (
              <>
                <path d={buildSeg(0, sessionSplitIdx)} fill="none" stroke={lineColor}
                  strokeWidth={hoveredSession === 'pre' ? activeWidth : dimWidth}
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity={hoveredSession === 'pre' ? activeOpacity : dimOpacity}
                  style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }} />
                <path d={buildSeg(sessionSplitIdx, closeIdx)} fill="none" stroke={lineColor}
                  strokeWidth={hoveredSession === 'market' ? activeWidth : dimWidth}
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity={hoveredSession === 'market' ? activeOpacity : (hoveredSession === null ? 0.7 : dimOpacity)}
                  style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }} />
                {hasAH && (
                  <path d={buildSeg(closeIdx, points.length - 1)} fill="none" stroke={lineColor}
                    strokeWidth={hoveredSession === 'after' ? activeWidth : dimWidth}
                    strokeLinecap="round" strokeLinejoin="round"
                    opacity={hoveredSession === 'after' ? activeOpacity : dimOpacity}
                    style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }} />
                )}
              </>
            );
          })() : hasData && chartGroups.length > 1 ? (
            /* Multi-group: single continuous stroke with hover segment highlight */
            <>
              <path d={pathD} fill="none" stroke="url(#stroke-fade)"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                opacity={hoverIndex !== null ? 0.35 : 1}
                style={{ transition: 'opacity 0.15s' }} />
              {hoverIndex !== null && (() => {
                const hg = chartGroups.find(g => hoverIndex >= g.startIdx && hoverIndex <= g.endIdx);
                if (!hg) return null;
                const from = Math.max(0, hg.startIdx - 1);
                const to = Math.min(points.length - 1, hg.endIdx + 1);
                const seg = points.slice(from, to + 1).map((p, j) => {
                  const idx = from + j;
                  return `${j === 0 ? 'M' : 'L'}${toX(idx).toFixed(1)},${toY(p.value).toFixed(1)}`;
                }).join(' ');
                return (
                  <path d={seg} fill="none" stroke={lineColor} strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                );
              })()}
            </>
          ) : hasData && (
            <path d={pathD} fill="none" stroke="url(#stroke-fade)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* ── Benchmark (SPY) overlay line — clipped to chart area ── */}
          <g clipPath="url(#chart-clip)">
          {showBenchmark && benchmarkNormalized && benchmarkNormalized.length >= 2 && (() => {
            // Determine hovered session (same logic as portfolio line)
            let hoveredSession: 'pre' | 'market' | 'after' | null = null;
            if (is1D && sessionSplitIdx !== null && hoverIndex !== null) {
              const closeIdx = sessionCloseIdx ?? points.length - 1;
              if (hoverIndex < sessionSplitIdx) hoveredSession = 'pre';
              else if (hoverIndex < closeIdx) hoveredSession = 'market';
              else hoveredSession = 'after';
            }

            const smoothed = benchmarkSmoothed!;
            const buildBenchSeg = (fromIdx: number, toIdx: number) => {
              const seg = smoothed.filter(bp => bp.index >= fromIdx && bp.index <= toIdx);
              if (seg.length < 2) return '';
              return seg.map((bp, j) => `${j === 0 ? 'M' : 'L'}${toX(bp.index).toFixed(1)},${toY(bp.value).toFixed(1)}`).join(' ');
            };

            const dimOpacity = hoveredSession !== null ? 0.10 : 0.22;
            const activeOpacity = 1;
            const dimWidth = 0.8;
            const activeWidth = 1.2;
            const transition = 'opacity 0.15s, stroke-width 0.15s, stroke-dasharray 0.3s';

            // Split into session segments on 1D, single line otherwise
            if (is1D && sessionSplitIdx !== null) {
              const closeIdx = sessionCloseIdx ?? points.length - 1;
              const hasAH = sessionCloseIdx !== null && sessionCloseIdx < points.length - 1;
              const activePath = hoveredSession === 'pre' ? buildBenchSeg(0, sessionSplitIdx)
                : hoveredSession === 'market' ? buildBenchSeg(sessionSplitIdx, closeIdx)
                : hoveredSession === 'after' && hasAH ? buildBenchSeg(closeIdx, points.length - 1)
                : '';

              return (
                <>
                  {/* Base: full line at dim opacity — no gaps */}
                  <path d={benchmarkPathD} fill="none" className="stroke-black/70 dark:stroke-white/70"
                    strokeWidth={dimWidth} strokeDasharray="6,4"
                    strokeLinecap="round" strokeLinejoin="round"
                    opacity={hoveredSession !== null ? dimOpacity : 0.22}
                    style={{ transition }} />
                  {/* Active session overlay — solid and bright */}
                  {activePath && <path d={activePath} fill="none" className="stroke-black/70 dark:stroke-white/70"
                    strokeWidth={activeWidth} strokeDasharray="none"
                    strokeLinecap="round" strokeLinejoin="round"
                    opacity={activeOpacity}
                    style={{ transition }} />}
                  {/* SPY label at end */}
                  {(() => {
                    const lastBp = smoothed[smoothed.length - 1];
                    return (
                      <text x={toX(lastBp.index) + 6} y={toY(lastBp.value) + 3}
                        fontSize="9" fontWeight="600" className="fill-black/50 dark:fill-white/30">
                        SPY
                      </text>
                    );
                  })()}
                </>
              );
            }

            // Non-1D: single line with hover solidify
            return (
              <>
                <path
                  d={benchmarkPathD}
                  fill="none"
                  className={hoverIndex !== null
                    ? 'stroke-black/70 dark:stroke-white/50'
                    : 'stroke-black/50 dark:stroke-white/25'
                  }
                  strokeWidth={hoverIndex !== null ? 1.1 : 0.9}
                  strokeDasharray={hoverIndex !== null ? 'none' : '6,4'}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: 'stroke 0.3s ease, stroke-width 0.3s ease, stroke-dasharray 0.3s ease' }}
                />
                {(() => {
                  const lastBp = benchmarkSmoothed![benchmarkSmoothed!.length - 1];
                  return (
                    <text x={toX(lastBp.index) + 6} y={toY(lastBp.value) + 3}
                      fontSize="9" fontWeight="600" className="fill-black/50 dark:fill-white/30">
                      SPY
                    </text>
                  );
                })()}
              </>
            );
          })()}
          </g>

          {/* ── Measurement overlays ───────────────────────── */}

          {/* Shaded region between A and B */}
          {hasMeasurement && shadedPath && (
            <path d={shadedPath} fill="url(#measure-grad)">
              <animate attributeName="opacity" from="0" to="1" dur="0.3s" fill="freeze" />
            </path>
          )}

          {/* Vertical dashed line A */}
          {mAx !== null && (
            <line
              x1={mAx} y1={PAD_TOP} x2={mAx} y2={CHART_H - PAD_BOTTOM}
              className="stroke-gray-800 dark:stroke-white" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"
            >
              <animate attributeName="opacity" from="0" to="0.5" dur="0.2s" fill="freeze" />
            </line>
          )}

          {/* Vertical dashed line B */}
          {mBx !== null && (
            <line
              x1={mBx} y1={PAD_TOP} x2={mBx} y2={CHART_H - PAD_BOTTOM}
              className="stroke-gray-800 dark:stroke-white" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"
            >
              <animate attributeName="opacity" from="0" to="0.5" dur="0.2s" fill="freeze" />
            </line>
          )}

          {/* Dot marker A */}
          {mAx !== null && mAy !== null && (
            <>
              <circle cx={mAx} cy={mAy} r="5" fill={measureColor} opacity="0.25">
                {!hasMeasurement && (
                  <animate attributeName="r" values="4;7;4" dur="1.5s" repeatCount="indefinite" />
                )}
              </circle>
              <circle cx={mAx} cy={mAy} r="3.5" fill={measureColor} className="stroke-gray-400 dark:stroke-white" strokeWidth="1.5" />
            </>
          )}

          {/* Dot marker B */}
          {mBx !== null && mBy !== null && (
            <>
              <circle cx={mBx} cy={mBy} r="5" fill={measureColor} opacity="0.25" />
              <circle cx={mBx} cy={mBy} r="3.5" fill={measureColor} className="stroke-gray-400 dark:stroke-white" strokeWidth="1.5" />
            </>
          )}

          {/* Connecting line between dots */}
          {hasMeasurement && mAx !== null && mAy !== null && mBx !== null && mBy !== null && (
            <line
              x1={mAx} y1={mAy} x2={mBx} y2={mBy}
              stroke={measureColor} strokeWidth="1" strokeDasharray="3,3" opacity="0.6"
            >
              <animate attributeName="opacity" from="0" to="0.6" dur="0.3s" fill="freeze" />
            </line>
          )}

          {/* ── End measurement overlays ───────────────────── */}

          {/* Live dot — breathing when market open, static when closed */}
          {hasData && hoverIndex === null && !isMeasuring && (
            <>
              {isMarketOpen ? (
                <>
                  {/* Outer glow — breathing */}
                  <circle cx={lastX} cy={lastY} r="10" fill={lineColor} opacity="0.08">
                    <animate attributeName="opacity" values="0.05;0.16;0.05" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="r" values="8;11;8" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  {/* Inner glow halo */}
                  <circle cx={lastX} cy={lastY} r="5.5" fill={lineColor} opacity="0.15">
                    <animate attributeName="opacity" values="0.1;0.22;0.1" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  {/* Solid dot */}
                  <circle cx={lastX} cy={lastY} r="3" fill={lineColor}>
                    <animate attributeName="opacity" values="0.85;1;0.85" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                </>
              ) : (
                <>
                  {/* Closed — subtle static dot */}
                  <circle cx={lastX} cy={lastY} r="7" fill={lineColor} opacity="0.12" />
                  <circle cx={lastX} cy={lastY} r="3" fill={lineColor} opacity="0.7" />
                </>
              )}
            </>
          )}

          {/* Hidden path for getPointAtLength() — idle dot animation */}
          {hasData && pathD && (
            <path ref={idlePathRef} d={pathD} fill="none" stroke="none" />
          )}

          {/* Idle animation — dot positioned via direct DOM mutation (avoids 60 re-renders/sec) */}
          {isIdle && (
            <g ref={idleDotGroupRef} style={{ display: 'none' }}>
              <circle ref={idleDotGlowRef} r="12" fill="url(#dot-glow)" />
              <circle ref={idleDotRef} r="3.5" fill={lineColor} stroke="#fff" strokeWidth="1.2" />
            </g>
          )}

          {/* Water ripple effect when idle dot hits end-of-day dot */}
          {showRipple && (
            <foreignObject key={rippleKey} x={lastX - 120} y={lastY - 120} width="240" height="240"
              style={{ pointerEvents: 'none', overflow: 'visible' }}>
              <div style={{ position: 'relative', width: 240, height: 240 }}>
                {[
                  { delay: '0s',    dur: '1.2s', peak: '0.35', scale: '4',  border: 1.2 },
                  { delay: '0.15s', dur: '1.4s', peak: '0.25', scale: '7',  border: 1.0 },
                  { delay: '0.3s',  dur: '1.6s', peak: '0.18', scale: '11', border: 0.8 },
                  { delay: '0.5s',  dur: '1.9s', peak: '0.10', scale: '16', border: 0.6 },
                  { delay: '0.7s',  dur: '2.2s', peak: '0.05', scale: '22', border: 0.5 },
                ].map((r, i) => (
                  <div key={i} style={{
                    position: 'absolute', top: '50%', left: '50%',
                    width: 6, height: 6, marginLeft: -3, marginTop: -3,
                    borderRadius: '50%',
                    border: `${r.border}px solid ${lineColor}`,
                    opacity: 0,
                    '--ripple-peak': r.peak,
                    '--ripple-scale': r.scale,
                    animation: `ripple-ring ${r.dur} ease-out ${r.delay} forwards`,
                  } as React.CSSProperties} />
                ))}
              </div>
            </foreignObject>
          )}

          {/* Hover crosshair with glow (suppress when measurement complete) */}
          {hasData && hoverX !== null && hoverY !== null && !hasMeasurement && (
            <>
              {/* Time label above crosshair */}
              {hoverLabel && (() => {
                // Clamp label position to prevent text from being cut off at SVG edges
                const halfTextW = 30;
                let labelX = hoverX!;
                let anchor: 'start' | 'middle' | 'end' = 'middle';
                if (hoverX! + halfTextW > CHART_W) {
                  labelX = CHART_W - 3;
                  anchor = 'end';
                } else if (hoverX! - halfTextW < 0) {
                  labelX = 3;
                  anchor = 'start';
                }
                return (
                  <text
                    x={labelX}
                    y={PAD_TOP - 4}
                    textAnchor={anchor}
                    className="fill-rh-light-muted dark:fill-rh-muted"
                    fontSize="11"
                    fontWeight="500"
                  >
                    {hoverLabel}
                  </text>
                );
              })()}
              <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={CHART_H - PAD_BOTTOM}
                stroke="#9CA3AF" strokeWidth="1" strokeDasharray="4,3" opacity="0.3" />
              {/* Glow under hover dot */}
              <circle cx={hoverX} cy={hoverY} r="12" fill="url(#dot-glow)" />
              <circle cx={hoverX} cy={hoverY} r="3.5" fill={lineColor} stroke="#fff" strokeWidth="1.2" />
              {/* Benchmark dot on hover */}
              {showBenchmark && hoverBenchmarkValue !== null && hoverX !== null && (
                <circle
                  cx={hoverX}
                  cy={toY(hoverBenchmarkValue)}
                  r="2.5"
                  className="fill-black/20 dark:fill-white/30 stroke-black/10 dark:stroke-white/20"
                  strokeWidth="1"
                />
              )}
            </>
          )}

          {/* Time labels — non-1D only */}
          {timeLabels.map((tl, i) => (
            <text key={i} x={tl.x} y={CHART_H - 2}
              className="fill-gray-500" fontSize="10"
              textAnchor={i === 0 ? 'start' : i === timeLabels.length - 1 ? 'end' : 'middle'}>
              {tl.label}
            </text>
          ))}

        </svg>


      </div>

      {/* Period selector — left-aligned, compact; -ml-3 offsets first button's px-3 so text aligns with $ heading */}
      <div className="flex items-center gap-0 mt-2 px-3 sm:px-6 -ml-1">
        {PERIODS.map(period => {
          const isLocked = userPlan === 'free' && !FREE_PERIODS.has(period);
          const isActive = selectedPeriod === period;
          return (
            <button
              key={period}
              onClick={() => {
                if (isLocked) {
                  showToast('Upgrade to Pro for all chart periods', 'info');
                  navigateToPricing();
                  return;
                }
                handlePeriodChange(period);
              }}
              className={`relative px-2.5 py-2 text-[13px] font-semibold transition-all duration-150 flex items-center gap-1 ${
                isActive
                  ? `${isGain ? 'text-rh-green' : 'text-rh-red'}`
                  : isLocked
                    ? 'text-rh-light-muted/25 dark:text-rh-muted/25 cursor-default'
                    : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-white/60'
              }`}
            >
              {period}
              {isActive && (
                <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full ${isGain ? 'bg-rh-green' : 'bg-rh-red'}`} />
              )}
              {isLocked && (
                <svg className="w-3 h-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      {/* Compare + hint — subtle secondary row; -ml-2.5 offsets button's px-2.5 */}
      <div className="flex items-center justify-between mt-1 px-3 sm:px-6 -ml-2.5" data-capture-skip="true">
        <button
          onClick={() => setShowBenchmark(prev => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all duration-150 border ${
            showBenchmark
              ? 'bg-gray-100/60 dark:bg-white/[0.08] text-rh-light-text dark:text-white border-gray-200 dark:border-white/[0.15]'
              : 'text-rh-light-muted/40 dark:text-rh-muted/50 border-transparent hover:text-rh-light-muted dark:hover:text-rh-muted'
          }`}
        >
          <span className="text-rh-light-muted/30 dark:text-rh-muted/30 font-normal">Compare:</span> SPY
        </button>
        <div className="flex items-center gap-2">
          {showHint && hasData && !isMeasuring && (
            <span className="text-[10px] text-rh-light-muted/30 dark:text-rh-muted/30 hidden sm:inline">
              Click chart to measure gains between two dates
            </span>
          )}
          {chartToolbar}
        </div>
      </div>
    </div>
  );
}
