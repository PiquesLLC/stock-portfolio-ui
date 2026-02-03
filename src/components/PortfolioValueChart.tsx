import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PortfolioChartData, PortfolioChartPeriod } from '../types';
import { getPortfolioChart, getBenchmarkCloses, getIntradayCandles, getHourlyCandles, BenchmarkCandle, IntradayCandle } from '../api';

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
}

const PERIODS: PortfolioChartPeriod[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'];

// ── Market status (US equities, America/New_York) ────────────────
function getMarketStatus(): { isOpen: boolean } {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return { isOpen: false };
  const mins = et.getHours() * 60 + et.getMinutes();
  // 9:30 AM = 570, 4:00 PM = 960
  return { isOpen: mins >= 570 && mins < 960 };
}

const CHART_W = 800;
const CHART_H = 260;
const PAD_TOP = 16;
const PAD_BOTTOM = 12;
const PAD_LEFT = 0;
const PAD_RIGHT = 0;

// ── Formatting helpers ─────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatShortDate(ms: number, is1D: boolean): string {
  const d = new Date(ms);
  if (is1D) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Measurement math (pure, deterministic) ─────────────────────────

interface MeasurementResult {
  startValue: number;
  endValue: number;
  startTime: number;
  endTime: number;
  dollarChange: number;
  percentChange: number;
  daysBetween: number;
}

function computeMeasurement(
  startValue: number, endValue: number,
  startTime: number, endTime: number,
): MeasurementResult | null {
  if (startValue === 0) return null;
  return {
    startValue,
    endValue,
    startTime,
    endTime,
    dollarChange: endValue - startValue,
    percentChange: ((endValue - startValue) / startValue) * 100,
    daysBetween: Math.round(Math.abs(endTime - startTime) / 86400000),
  };
}

// ── Benchmark lookup ───────────────────────────────────────────────

/** Find the index of the nearest candle to a given timestamp */
function findBenchmarkIndex(candles: BenchmarkCandle[], targetMs: number): number | null {
  if (candles.length === 0) return null;
  let best = 0;
  let bestDist = Math.abs(candles[0].time - targetMs);
  for (let i = 1; i < candles.length; i++) {
    const dist = Math.abs(candles[i].time - targetMs);
    if (dist < bestDist) { best = i; bestDist = dist; }
  }
  // Only match if within 3 days
  if (bestDist > 3 * 86400000) return null;
  return best;
}

/**
 * Compute benchmark (SPY) return between two timestamps.
 * Uses the previous trading day's close as the baseline for the start date,
 * matching how brokerages calculate daily returns. This avoids the bug where
 * same-day or adjacent-day measurements both snap to the same daily candle
 * and produce 0% return.
 */
function computeBenchmarkReturn(
  candles: BenchmarkCandle[],
  startMs: number,
  endMs: number,
): { spyReturn: number } | null {
  const startIdx = findBenchmarkIndex(candles, startMs);
  const endIdx = findBenchmarkIndex(candles, endMs);
  if (startIdx === null || endIdx === null) return null;

  // Use the close BEFORE the start date as baseline (previous trading day)
  const baseIdx = startIdx > 0 ? startIdx - 1 : startIdx;
  const baseClose = candles[baseIdx].close;
  const endClose = candles[endIdx].close;
  if (baseClose === 0) return null;

  // If start and end resolve to the same candle, use prev close → that close
  // This gives the actual daily return for that trading day
  return { spyReturn: ((endClose - baseClose) / baseClose) * 100 };
}

// ── Snap-to-nearest helper ─────────────────────────────────────────

function snapToNearest(
  mouseX: number,
  points: { time: number; value: number }[],
  toXFn: (i: number) => number,
): number {
  let best = 0;
  let bestDist = Math.abs(toXFn(0) - mouseX);
  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(toXFn(i) - mouseX);
    if (dist < bestDist) { best = i; bestDist = dist; }
  }
  return best;
}

// ════════════════════════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════════════════════════

export function PortfolioValueChart({ currentValue, dayChange, dayChangePercent, regularDayChange, regularDayChangePercent, afterHoursChange, afterHoursChangePercent, refreshTrigger, fetchFn, onPeriodChange, onReturnChange }: Props) {
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

  const isMeasuring = measureA !== null;
  const hasMeasurement = measureA !== null && measureB !== null;

  // ── Data fetching ──────────────────────────────────────────────

  const fetchIdRef = useRef(0);
  const fetchChart = useCallback(async (period: PortfolioChartPeriod, silent = false) => {
    const id = ++fetchIdRef.current;
    if (!silent) setLoading(true);
    try {
      const fetcher = fetchFn || getPortfolioChart;
      const data = await fetcher(period);
      // Only apply if this is still the latest request (ignore stale responses)
      if (id === fetchIdRef.current) {
        setChartData(data);
        chartCacheRef.current.set(period, data);
      }
    } catch (e) {
      console.error('Chart fetch error:', e);
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false);
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

  // ── Chart data ─────────────────────────────────────────────────

  const points = chartData?.points ?? [];
  const periodStartValue = chartData?.periodStartValue ?? currentValue;

  // Compute hero display values
  const hoverValue = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex].value : null;
  const displayValue = hoverValue ?? currentValue;
  const changeVsPeriodStart = displayValue - periodStartValue;
  const changePctVsPeriodStart = periodStartValue > 0 ? (changeVsPeriodStart / periodStartValue) * 100 : 0;

  const showDayChange = selectedPeriod === '1D' && hoverIndex === null;
  const displayChange = showDayChange ? dayChange : changeVsPeriodStart;
  const displayChangePct = showDayChange ? dayChangePercent : changePctVsPeriodStart;

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
    // Use the first data point's date to determine which trading day this is
    const refDate = new Date(points[0].time);
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

  // Session split indices: market open (9:30 AM ET) and close (4:00 PM ET)
  const { sessionSplitIdx, sessionCloseIdx } = useMemo(() => {
    if (!hasData || !is1D) return { sessionSplitIdx: null, sessionCloseIdx: null };

    // Derive trading day from data points (works after hours / weekends)
    const refDate = new Date(points[0].time);
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

  // Time labels — only for non-1D periods
  const timeLabels: { label: string; x: number }[] = [];
  if (hasData && selectedPeriod !== '1D') {
    const maxLabels = 5;
    const step = Math.max(1, Math.floor(points.length / maxLabels));
    for (let i = 0; i < points.length; i += step) {
      const d = new Date(points[i].time);
      const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      timeLabels.push({ label, x: toX(i) });
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

  // ── Click handler (measurement) ────────────────────────────────

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
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
    <div className={`relative px-6 pt-8 pb-3 ${
      isGain ? 'hero-ambient-green' : displayChange === 0 ? 'hero-ambient-neutral' : 'hero-ambient-red'
    }`}>
      {/* Hero value display — FOREGROUND: highest visual weight */}
      {!hasMeasurement && (
        <div className="mb-5 relative z-10" style={{ minHeight: '120px' }}>
          <p className={`text-5xl md:text-6xl font-black tracking-tighter text-rh-light-text dark:text-rh-text transition-colors duration-150 ${
            isGain ? 'hero-glow-green' : displayChange === 0 ? 'hero-glow-neutral' : 'hero-glow-red'
          }`}>
            {formatCurrency(displayValue)}
          </p>
          {/* Show separate regular + after-hours lines when applicable */}
          {showDayChange && hoverIndex === null && afterHoursChange != null && Math.abs(afterHoursChange) > 0.005 ? (
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
            <p className={`text-sm mt-1.5 font-semibold ${isGain ? 'text-rh-green' : 'text-rh-red'}`}>
              {formatChange(displayChange)} ({formatPct(displayChangePct)})
              {hoverIndex !== null && hoverLabel && (
                <span className="text-rh-light-muted/60 dark:text-rh-muted/60 font-normal text-xs ml-2">{hoverLabel}</span>
              )}
              {hoverIndex === null && selectedPeriod === '1D' && (
                <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-xs ml-2">Today</span>
              )}
            </p>
          )}
        </div>
      )}

      {/* ── Measurement Card ─────────────────────────────────── */}
      {hasMeasurement && measurement && (
        <div
          className="mb-2 animate-in fade-in slide-in-from-top-1 duration-200"
        >
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
              <div className="flex items-center gap-3 text-xs mt-0.5">
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
              Click chart to remeasure · ESC to clear
            </div>
          </div>
        </div>
      )}

      {/* Single-point selected indicator */}
      {isMeasuring && !hasMeasurement && measureA !== null && points[measureA] && (
        <div className="mb-2 animate-in fade-in duration-150">
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
              <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={CHART_H - PAD_BOTTOM}
                stroke="#9CA3AF" strokeWidth="1" strokeDasharray="4,3" opacity="0.3" />
              {/* Glow under hover dot */}
              <circle cx={hoverX} cy={hoverY} r="12" fill="url(#dot-glow)" />
              <circle cx={hoverX} cy={hoverY} r="3.5" fill={lineColor} stroke="#fff" strokeWidth="1.2" />
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
      <div className="flex items-center gap-3 mt-2">
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
        {showHint && hasData && !isMeasuring && (
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 ml-auto">
            Click chart to measure gains between two dates
          </span>
        )}
      </div>
    </div>
  );
}
