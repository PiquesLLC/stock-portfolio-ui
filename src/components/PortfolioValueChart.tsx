import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PortfolioChartData, PortfolioChartPeriod } from '../types';
import { getPortfolioChart, getBenchmarkCloses, getIntradayCandles, getHourlyCandles, BenchmarkCandle, IntradayCandle } from '../api';

interface Props {
  currentValue: number;
  dayChange: number;
  dayChangePercent: number;
  refreshTrigger: number;
  fetchFn?: (period: PortfolioChartPeriod) => Promise<PortfolioChartData>;
  onPeriodChange?: (period: PortfolioChartPeriod) => void;
}

const PERIODS: PortfolioChartPeriod[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'];

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

export function PortfolioValueChart({ currentValue, dayChange, dayChangePercent, refreshTrigger, fetchFn, onPeriodChange }: Props) {
  const [chartData, setChartData] = useState<PortfolioChartData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PortfolioChartPeriod>('1D');
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  const isGain = displayChange >= 0;
  // Chart line colors — muted. Full-bright reserved for hero number only.
  const lineColor = isGain ? '#0A9E10' : '#B87872';

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

  return (
    <div className={`relative px-6 pt-8 pb-3 ${
      isGain ? 'hero-ambient-green' : displayChange === 0 ? 'hero-ambient-neutral' : 'hero-ambient-red'
    }`}>
      {/* Hero value display — FOREGROUND: highest visual weight */}
      {!hasMeasurement && (
        <div className="mb-5 relative z-10">
          <p className={`text-5xl md:text-6xl font-black tracking-tighter text-rh-light-text dark:text-rh-text transition-colors duration-150 ${
            isGain ? 'hero-glow-green' : displayChange === 0 ? 'hero-glow-neutral' : 'hero-glow-red'
          }`}>
            {formatCurrency(displayValue)}
          </p>
          <p className={`text-sm mt-1.5 font-semibold ${isGain ? 'text-rh-green' : 'text-rh-red'}`}>
            {formatChange(displayChange)} ({formatPct(displayChangePct)})
            {hoverIndex !== null && hoverLabel && (
              <span className="text-rh-light-muted/60 dark:text-rh-muted/60 font-normal text-xs ml-2">{hoverLabel}</span>
            )}
            {hoverIndex === null && selectedPeriod === '1D' && (
              <span className="text-rh-light-muted/40 dark:text-rh-muted/40 font-normal text-xs ml-2">Today</span>
            )}
          </p>
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
            {/* Stroke brightness gradient — dimmer at left history, brighter at latest */}
            <linearGradient id="stroke-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0" />
              <stop offset="4%" stopColor={lineColor} stopOpacity="0.45" />
              <stop offset="50%" stopColor={lineColor} stopOpacity="0.7" />
              <stop offset="96%" stopColor={lineColor} stopOpacity="1" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            {/* Hover dot glow */}
            <radialGradient id="dot-glow">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </radialGradient>
            {/* Area fill gradient under line — extremely subtle */}
            <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.06" />
              <stop offset="80%" stopColor={lineColor} stopOpacity="0.01" />
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

          {/* Subtle area fill — barely visible gradient under line */}
          {hasData && (
            <path
              d={`${pathD} L${toX(points.length - 1).toFixed(1)},${(CHART_H - PAD_BOTTOM)} L${toX(0).toFixed(1)},${(CHART_H - PAD_BOTTOM)} Z`}
              fill="url(#area-fill)"
            />
          )}

          {/* Price line — gradient stroke, thinner */}
          {hasData && (
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

          {/* Live dot */}
          {hasData && selectedPeriod === '1D' && hoverIndex === null && !isMeasuring && (
            <>
              {/* Soft glow halo — no size change */}
              <circle cx={lastX} cy={lastY} r="7" fill={lineColor} opacity="0.12">
                <animate attributeName="opacity" values="0.08;0.18;0.08" dur="2.5s" repeatCount="indefinite" />
              </circle>
              {/* Solid dot */}
              <circle cx={lastX} cy={lastY} r="3" fill={lineColor}>
                <animate attributeName="opacity" values="0.7;1;0.7" dur="2.5s" repeatCount="indefinite" />
              </circle>
            </>
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

        {/* Live badge */}
        {selectedPeriod === '1D' && hasData && (
          <div className="absolute right-0 top-0">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rh-green opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rh-green" />
              </span>
              Live
            </span>
          </div>
        )}

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
