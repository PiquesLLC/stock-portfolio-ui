import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PortfolioChartData, PortfolioChartPeriod } from '../types';
import { getPortfolioChart, getBenchmarkCloses, getIntradayCandles, getHourlyCandles, BenchmarkCandle, IntradayCandle } from '../api';
import {
  MarketSessionProp,
  getMarketStatus,
  CHART_W, CHART_H, PAD_TOP, PAD_BOTTOM, PAD_LEFT, PAD_RIGHT,
  formatCurrency, formatChange, formatPct, formatShortDate,
  MeasurementResult, computeMeasurement,
  findBenchmarkIndex, computeBenchmarkReturn,
  snapToNearest,
} from '../utils/portfolio-chart';

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
}

const PERIODS: PortfolioChartPeriod[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'];

export function PortfolioValueChart({ currentValue, regularDayChange, regularDayChangePercent, afterHoursChange, afterHoursChangePercent, refreshTrigger, fetchFn, onPeriodChange, onReturnChange, onMeasurementChange, session }: Props) {
  const [chartData, setChartData] = useState<PortfolioChartData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PortfolioChartPeriod>('1D');
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Idle animation state ─────────────────────────────────────────
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IDLE_TIMEOUT = 600000; // 10 minutes
  const [rippleKey, setRippleKey] = useState(0);
  const [showRipple, setShowRipple] = useState(false);
  const [idleDotPos, setIdleDotPos] = useState<{ x: number; y: number } | null>(null);
  const idlePathRef = useRef<SVGPathElement | null>(null);
  const rippleCooldownRef = useRef(false);

  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    setIdleDotPos(null);
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
  const [showHint, setShowHint] = useState(true);
  const [showBenchmark, setShowBenchmark] = useState(false);

  const isMeasuring = measureA !== null;
  const hasMeasurement = measureA !== null && measureB !== null;

  // ── Data fetching (debounced: one in-flight at a time, queue latest) ──

  const isFetchingRef = useRef(false);
  const pendingFetchRef = useRef<{ period: PortfolioChartPeriod; silent: boolean } | null>(null);

  const fetchChart = useCallback(async (period: PortfolioChartPeriod, silent = false) => {
    // If already fetching, queue this request for after completion
    if (isFetchingRef.current) {
      pendingFetchRef.current = { period, silent: true };
      return;
    }
    isFetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const fetcher = fetchFn || getPortfolioChart;
      const data = await fetcher(period);
      setChartData(data);
      chartCacheRef.current.set(period, data);
    } catch (e) {
      console.error('Chart fetch error:', e);
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
      fetchChart(selectedPeriod);
    }
  }, [selectedPeriod, fetchChart]);

  // Silent refresh when portfolio updates
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchChart(selectedPeriod, true);
    }
  }, [refreshTrigger, selectedPeriod, fetchChart]);

  // Auto-refresh for 1D
  useEffect(() => {
    if (selectedPeriod !== '1D') return;
    const interval = setInterval(() => fetchChart('1D', true), 15000);
    return () => clearInterval(interval);
  }, [selectedPeriod, fetchChart]);

  // Fetch daily benchmark candles once (for longer periods)
  useEffect(() => {
    getBenchmarkCloses('SPY').then(setBenchmarkCandles).catch(() => {});
  }, []);

  // Fetch intraday benchmark candles matching the chart period
  useEffect(() => {
    const fetchIntraday = async () => {
      try {
        let candles: IntradayCandle[];
        if (selectedPeriod === '1D') {
          candles = await getIntradayCandles('SPY');
        } else if (selectedPeriod === '1W' || selectedPeriod === '1M') {
          candles = await getHourlyCandles('SPY', selectedPeriod);
        } else {
          setIntradayBenchmark([]);
          return;
        }
        setIntradayBenchmark(candles.map(c => ({
          date: c.time.slice(0, 10),
          time: new Date(c.time).getTime(),
          close: c.close,
        })));
      } catch {
        setIntradayBenchmark([]);
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

  // ── Click outside chart clears measurement ────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (svgRef.current && !svgRef.current.contains(e.target as Node)) {
        setMeasureA(null);
        setMeasureB(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Chart data ─────────────────────────────────────────────────

  // Extend chart to current time using the live portfolio value from props.
  // Yahoo candles are ~15 min delayed; this bridges the gap so the line
  // always reaches "now" and the user can hover to the latest value.
  const points = useMemo(() => {
    const raw = chartData?.points ?? [];
    if (raw.length === 0) return raw;
    if (selectedPeriod === '1D') {
      // Find the last weekday point as reference date.
      // On weekends the last raw point is a live-appended Sat/Sun timestamp
      // which would set the cutoff to Saturday 4 AM, filtering out all Friday data.
      let refDate: Date = new Date(raw[raw.length - 1].time);
      const etDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
      for (let i = raw.length - 1; i >= 0; i--) {
        const wd = etDayFmt.format(new Date(raw[i].time));
        if (wd !== 'Sat' && wd !== 'Sun') { refDate = new Date(raw[i].time); break; }
      }
      const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(refDate);
      const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
      const noonEtH = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
      }).format(noonUtc).split(':')[0]);
      const etOffsetMs = (noonEtH - 12) * 3600000;
      const preMarketOpenMs = new Date(`${etDateStr}T04:00:00Z`).getTime() - etOffsetMs;
      const afterHoursCloseMs = new Date(`${etDateStr}T20:00:00Z`).getTime() - etOffsetMs;
      const pts = raw.filter(p => p.time >= preMarketOpenMs && p.time <= afterHoursCloseMs);

      const now = Date.now();
      const last = pts[pts.length - 1];
      if (pts.length > 0 && now - last.time > 10000 && now <= afterHoursCloseMs) {
        return [...pts, { time: now, value: currentValue }];
      }
      return pts.length >= 2 ? pts : raw;
    }
    // For 1W/1M: filter to active trading sessions only.
    // The API returns 24h data including dead overnight periods and weekends
    // that create flat horizontal lines on the chart.
    // Robinhood-style: only show weekday 4 AM–8 PM ET data, index-based positioning.
    if (selectedPeriod === '1W' || selectedPeriod === '1M') {
      const etHourFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
      });
      const etDayFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', weekday: 'short',
      });
      const filtered = raw.filter(p => {
        const d = new Date(p.time);
        const wd = etDayFmt.format(d);
        if (wd === 'Sat' || wd === 'Sun') return false;
        const hm = etHourFmt.format(d);
        const h = parseInt(hm.split(':')[0]);
        return h >= 4 && h < 20; // 4 AM – 8 PM ET
      });
      return filtered.length >= 2 ? filtered : raw;
    }
    return raw;
  }, [chartData, selectedPeriod, currentValue]);
  const periodStartValue = chartData?.periodStartValue ?? currentValue;

  // ── Normalized benchmark data for overlay ──────────────────────
  const benchmarkNormalized = useMemo(() => {
    if (!showBenchmark || points.length < 2) return null;

    // Choose the right candle set based on period
    const candles = (selectedPeriod === '1D' || selectedPeriod === '1W' || selectedPeriod === '1M')
      ? (intradayBenchmark.length > 0 ? intradayBenchmark : benchmarkCandles)
      : benchmarkCandles;
    if (candles.length === 0) return null;

    const chartStart = points[0].time;

    // Find SPY close at chart start
    const startIdx = findBenchmarkIndex(candles, chartStart);
    if (startIdx === null) return null;
    const spyStartClose = candles[startIdx].close;
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
  }, [showBenchmark, points, selectedPeriod, benchmarkCandles, intradayBenchmark, periodStartValue]);

  // Compute hero display values
  const hoverValue = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex].value : null;
  const displayValue = hoverValue ?? currentValue;

  // Single formula for all periods — no switching between API values and calculated values.
  // This guarantees hovering at the latest point shows the exact same numbers as the header.
  const displayChange = displayValue - periodStartValue;
  const displayChangePct = periodStartValue > 0 ? (displayChange / periodStartValue) * 100 : 0;

  // Emit period return to parent (for benchmark widget consistency)
  const periodReturnPct = periodStartValue > 0
    ? ((currentValue - periodStartValue) / periodStartValue) * 100
    : null;
  useEffect(() => {
    onReturnChange?.(periodReturnPct != null ? Math.round(periodReturnPct * 100) / 100 : null);
  }, [periodReturnPct, onReturnChange]);

  const isGain = displayChange >= 0;
  // Chart line colors — muted. Full-bright reserved for hero number only.
  const lineColor = isGain ? '#0A9E10' : '#B87872';

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
    const values = points.map(p => p.value);
    let minV = Math.min(...values, periodStartValue);
    let maxV = Math.max(...values, periodStartValue);
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
    const refDate = new Date(points[points.length - 1].time);
    const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
      .format(refDate);
    const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
    const noonEtStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    }).format(noonUtc);
    const noonEtH = parseInt(noonEtStr.split(':')[0]);
    const etOffsetMs = (noonEtH - 12) * 3600000;
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
  const toY = (value: number) => PAD_TOP + plotH - ((value - paddedMin) / (paddedMax - paddedMin)) * plotH;

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
    const refDate = new Date(points[points.length - 1].time);
    const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(refDate);
    const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
    const noonEtH = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    }).format(noonUtc).split(':')[0]);
    const etOffsetMs = (noonEtH - 12) * 3600000;
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
  }, [points, plotW, is1D, dayStartMs, dayRangeMs]);

  // ── Hover handler ──────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return;
    const svgX = mouseToSvgX(e);
    const idx = findNearestIndex(svgX);
    setHoverIndex(idx);
  }, [points, mouseToSvgX, findNearestIndex]);

  const handleMouseLeave = useCallback(() => setHoverIndex(null), []);

  // ── Touch hover (Robinhood-style press-drag crosshair) ────────
  const isTouchHoveringRef = useRef(false);
  const wasTouchRef = useRef(false);
  const isTwoFingerRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    wasTouchRef.current = true;

    if (e.touches.length === 2 && svgRef.current && points.length >= 2) {
      e.preventDefault();
      isTwoFingerRef.current = true;
      // Clear single-finger hover
      isTouchHoveringRef.current = false;
      setHoverIndex(null);
      // Map both touch positions to data indices
      const rect = svgRef.current.getBoundingClientRect();
      const svgX0 = ((e.touches[0].clientX - rect.left) / rect.width) * CHART_W;
      const svgX1 = ((e.touches[1].clientX - rect.left) / rect.width) * CHART_W;
      setMeasureA(findNearestIndex(svgX0));
      setMeasureB(findNearestIndex(svgX1));
      setShowHint(false);
    } else if (e.touches.length === 1 && !isTwoFingerRef.current) {
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
      if (e.touches.length === 0) {
        // Both fingers lifted — keep measurement visible, exit two-finger mode
        isTwoFingerRef.current = false;
      }
      // One finger still down — wait for both to lift
      return;
    }
    // Original single-finger behavior
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
    const pts = [];
    for (let i = lo; i <= hi; i++) {
      pts.push(`${i === lo ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(points[i].value).toFixed(1)}`);
    }
    pts.push(`L${toX(hi).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)}`);
    pts.push(`L${toX(lo).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)} Z`);
    return pts.join(' ');
  }, [measureA, measureB, points]);

  // Hover display
  const hoverX = hoverIndex !== null ? toX(hoverIndex) : null;
  const hoverY = hoverIndex !== null ? toY(points[hoverIndex].value) : null;
  const hoverLabel = hoverIndex !== null ? (
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

      setIdleDotPos({ x: pt.x, y: pt.y });

      // Collision check against end-of-day dot
      const dx = pt.x - lastXRef.current;
      const dy = pt.y - lastYRef.current;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 12 && !rippleCooldownRef.current) {
        rippleCooldownRef.current = true;
        setShowRipple(true);
        setRippleKey(k => k + 1);
        setTimeout(() => setShowRipple(false), 3200);
        setTimeout(() => { rippleCooldownRef.current = false; }, 2000);
      }

      idleRafRef.current = requestAnimationFrame(tick);
    };

    idleRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (idleRafRef.current) cancelAnimationFrame(idleRafRef.current);
    };
  }, [isIdle]); // Removed pathD dependency - animation persists through data updates

  return (
    <div className={`relative pt-8 pb-3 ${
      isGain ? 'hero-ambient-green' : displayChange === 0 ? 'hero-ambient-neutral' : 'hero-ambient-red'
    }`}>
      {/* Fixed-height header area — prevents chart from shifting when measurement state changes */}
      <div className="mb-5 relative z-10 px-3 sm:px-6" style={{ height: '140px' }}>
        {/* Hero value display — FOREGROUND: highest visual weight */}
        {!hasMeasurement && (
          <div>
            <p className={`text-3xl sm:text-5xl md:text-6xl font-black tracking-tighter text-rh-light-text dark:text-rh-text transition-colors duration-150 ${
              isGain ? 'hero-glow-green' : displayChange === 0 ? 'hero-glow-neutral' : 'hero-glow-red'
            }`}>
              {formatCurrency(displayValue)}
            </p>
            {/* Show separate regular + after-hours lines when applicable */}
            {selectedPeriod === '1D' && hoverIndex === null && afterHoursChange != null && Math.abs(afterHoursChange) > 0.005 && session === 'POST' ? (
              <>
                <p className={`text-sm mt-1.5 font-semibold ${(regularDayChange ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {formatChange(regularDayChange ?? 0)} ({formatPct(regularDayChangePercent ?? 0)})
                  <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-xs ml-2">Today</span>
                </p>
                <p className={`text-xs mt-0.5 font-medium ${afterHoursChange >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                  {formatChange(afterHoursChange)} ({formatPct(afterHoursChangePercent ?? 0)})
                  <span className="text-rh-light-muted/30 dark:text-rh-muted/30 font-normal text-[10px] ml-1.5">After hours</span>
                </p>
              </>
            ) : (
              <>
                <p className={`text-sm mt-1.5 font-semibold ${isGain ? 'text-rh-green' : 'text-rh-red'}`}>
                  {formatChange(displayChange)} ({formatPct(displayChangePct)})
                  {hoverIndex !== null && hoverLabel && (
                    <span className="text-rh-light-muted/60 dark:text-rh-muted/60 font-normal text-xs ml-2">{hoverLabel}</span>
                  )}
                  {hoverIndex === null && selectedPeriod === '1D' && (
                    <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-xs ml-2">Today</span>
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
            )}

            {/* Single-point selected indicator */}
            {isMeasuring && measureA !== null && points[measureA] && (
              <div className="mt-3 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
                  <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                    {formatShortDate(points[measureA].time, is1D)} · {formatCurrency(points[measureA].value)}
                  </span>
                  <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">
                    — click another point to measure
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Measurement Card ─────────────────────────────────── */}
        {hasMeasurement && measurement && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="inline-flex flex-col gap-0.5">
              {/* Date range */}
              <div className="flex items-center gap-2 text-xs text-rh-light-muted dark:text-rh-muted">
                <span>{formatShortDate(measurement.startTime, is1D)}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <span>{formatShortDate(measurement.endTime, is1D)}</span>
                <span className="text-rh-light-muted/60 dark:text-rh-muted/60">
                  · {measurement.daysBetween}d
                </span>
              </div>

              {/* Values */}
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-rh-light-text dark:text-rh-text">
                  {formatCurrency(measurement.startValue)}
                </span>
                <svg className="w-3 h-3 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <span className="text-lg font-bold text-rh-light-text dark:text-rh-text">
                  {formatCurrency(measurement.endValue)}
                </span>
              </div>

              {/* Change stats */}
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-bold ${measureIsGain ? 'text-rh-green' : 'text-rh-red'}`}>
                  {formatPct(measurement.percentChange)}
                </span>
                <span className={`text-sm font-medium ${measureIsGain ? 'text-rh-green' : 'text-rh-red'}`}>
                  {formatChange(measurement.dollarChange)}
                </span>
              </div>

              {/* Benchmark comparison */}
              {benchmarkResult && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs mt-0.5">
                  <span className="text-rh-light-muted dark:text-rh-muted">
                    You: <span className={measureIsGain ? 'text-rh-green' : 'text-rh-red'}>{formatPct(measurement.percentChange)}</span>
                  </span>
                  <span className="text-rh-light-muted dark:text-rh-muted">
                    SPY: <span className={benchmarkResult.spyReturn >= 0 ? 'text-rh-green' : 'text-rh-red'}>{formatPct(benchmarkResult.spyReturn)}</span>
                  </span>
                  <span className={`font-semibold ${benchmarkResult.outperformance >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {benchmarkResult.outperformance >= 0 ? 'Outperformance' : 'Underperformance'}: {formatPct(benchmarkResult.outperformance)}
                  </span>
                </div>
              )}

              {/* Clear hint */}
              <div className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50 mt-0.5">
                Click chart to remeasure · Click outside to clear
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart — MIDGROUND: recessed, context only */}
      <div className="relative w-full chart-layer chart-fade-in" style={{ aspectRatio: `${CHART_W}/${CHART_H}` }}>
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
          style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        >
          <defs>
            {/* Stroke brightness gradient — boosted when market open */}
            <linearGradient id="stroke-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0" />
              <stop offset="4%" stopColor={lineColor} stopOpacity={isMarketOpen ? 0.6 : 0.45} />
              <stop offset="50%" stopColor={lineColor} stopOpacity={isMarketOpen ? 0.85 : 0.7} />
              <stop offset="96%" stopColor={lineColor} stopOpacity={isMarketOpen ? 1 : 1} />
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
            {/* Area fill gradient under line — slightly stronger when market open */}
            <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={isMarketOpen ? 0.12 : 0.06} />
              <stop offset="80%" stopColor={lineColor} stopOpacity={isMarketOpen ? 0.03 : 0.01} />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            {/* Measurement shading gradient */}
            <linearGradient id="measure-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={measureColor} stopOpacity="0.20" />
              <stop offset="100%" stopColor={measureColor} stopOpacity="0.03" />
            </linearGradient>
            {/* Clip benchmark — generous top overflow, clipped at bottom to avoid bleeding into labels */}
            <clipPath id="chart-clip">
              <rect x={PAD_LEFT} y={-200} width={CHART_W - PAD_LEFT - PAD_RIGHT} height={CHART_H - PAD_BOTTOM + 200} />
            </clipPath>
          </defs>

          {/* Reference line */}
          {hasData && (
            <line x1={PAD_LEFT} y1={refY} x2={CHART_W - PAD_RIGHT} y2={refY}
              stroke="#6B7280" strokeWidth="0.6" strokeDasharray="5,5" opacity="0.25" />
          )}

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
                    <path d={buildFill(0, sessionSplitIdx)} fill={lineColor} opacity="0.04" />
                    {/* Market hours — stronger */}
                    <path d={buildFill(sessionSplitIdx, closeIdx)} fill={lineColor} opacity="0.11" />
                    {/* After hours — muted */}
                    {hasAH && (
                      <path d={buildFill(closeIdx, points.length - 1)} fill={lineColor} opacity="0.04" />
                    )}
                  </>
                );
              })()}
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
            const dimWidth = 1.1;
            const activeWidth = 1.6;

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
          })() : hasData && (
            <path d={pathD} fill="none" stroke="url(#stroke-fade)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
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
              stroke="white" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"
            >
              <animate attributeName="opacity" from="0" to="0.5" dur="0.2s" fill="freeze" />
            </line>
          )}

          {/* Vertical dashed line B */}
          {mBx !== null && (
            <line
              x1={mBx} y1={PAD_TOP} x2={mBx} y2={CHART_H - PAD_BOTTOM}
              stroke="white" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"
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
              <circle cx={mAx} cy={mAy} r="3.5" fill={measureColor} stroke="white" strokeWidth="1.5" />
            </>
          )}

          {/* Dot marker B */}
          {mBx !== null && mBy !== null && (
            <>
              <circle cx={mBx} cy={mBy} r="5" fill={measureColor} opacity="0.25" />
              <circle cx={mBx} cy={mBy} r="3.5" fill={measureColor} stroke="white" strokeWidth="1.5" />
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

          {/* Idle animation — dot manually positioned along the path */}
          {isIdle && idleDotPos && (
            <>
              <circle cx={idleDotPos.x} cy={idleDotPos.y} r="12" fill="url(#dot-glow)" />
              <circle cx={idleDotPos.x} cy={idleDotPos.y} r="3.5" fill={lineColor} stroke="#fff" strokeWidth="1.2" />
            </>
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
              {hoverLabel && (
                <text
                  x={hoverX}
                  y={PAD_TOP - 4}
                  textAnchor="middle"
                  className="fill-rh-light-muted dark:fill-rh-muted"
                  fontSize="11"
                  fontWeight="500"
                >
                  {hoverLabel}
                </text>
              )}
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

      {/* Hint + Period selector */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mt-2 px-3 sm:px-6">
        <div className="flex gap-0.5">
        {PERIODS.map(period => (
          <button
            key={period}
            onClick={() => handlePeriodChange(period)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 ${
              selectedPeriod === period
                ? `${isGain ? 'bg-rh-green/10 text-rh-green' : 'bg-rh-red/10 text-rh-red'}`
                : 'text-rh-light-muted/45 dark:text-rh-muted/45 hover:text-rh-light-muted dark:hover:text-rh-muted hover:bg-gray-100/50 dark:hover:bg-white/[0.02]'
            }`}
          >
            {period}
          </button>
        ))}
        </div>
        {/* SPY benchmark toggle */}
        <button
          onClick={() => setShowBenchmark(prev => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-150 border ${
            showBenchmark
              ? 'bg-gray-100/60 dark:bg-white/[0.08] text-rh-light-text dark:text-white border-gray-200 dark:border-white/[0.15]'
              : 'text-rh-light-muted/40 dark:text-rh-muted/50 border-transparent hover:text-rh-light-muted dark:hover:text-rh-muted'
          }`}
        >
          <span className="text-rh-light-muted/30 dark:text-rh-muted/30 font-normal">Compare:</span> SPY
        </button>
        {showHint && hasData && !isMeasuring && (
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 ml-auto">
            Tap chart or use two fingers to measure gains
          </span>
        )}
      </div>
    </div>
  );
}
