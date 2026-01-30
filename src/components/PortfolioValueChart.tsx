import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PortfolioChartData, PortfolioChartPeriod } from '../types';
import { getPortfolioChart, getBenchmarkCloses, BenchmarkCandle } from '../api';

interface Props {
  currentValue: number;
  dayChange: number;
  dayChangePercent: number;
  refreshTrigger: number;
  fetchFn?: (period: PortfolioChartPeriod) => Promise<PortfolioChartData>;
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

function findBenchmarkClose(candles: BenchmarkCandle[], targetMs: number): number | null {
  if (candles.length === 0) return null;
  let best = 0;
  let bestDist = Math.abs(candles[0].time - targetMs);
  for (let i = 1; i < candles.length; i++) {
    const dist = Math.abs(candles[i].time - targetMs);
    if (dist < bestDist) { best = i; bestDist = dist; }
  }
  // Only match if within 3 days
  if (bestDist > 3 * 86400000) return null;
  return candles[best].close;
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

export function PortfolioValueChart({ currentValue, dayChange, dayChangePercent, refreshTrigger, fetchFn }: Props) {
  const [chartData, setChartData] = useState<PortfolioChartData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PortfolioChartPeriod>('1D');
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fetchingRef = useRef(false);

  // ── Measurement state ──────────────────────────────────────────
  const [measureA, setMeasureA] = useState<number | null>(null); // index of first click
  const [measureB, setMeasureB] = useState<number | null>(null); // index of second click
  const [benchmarkCandles, setBenchmarkCandles] = useState<BenchmarkCandle[]>([]);
  const [showHint, setShowHint] = useState(true);

  const isMeasuring = measureA !== null;
  const hasMeasurement = measureA !== null && measureB !== null;

  // ── Data fetching ──────────────────────────────────────────────

  const fetchChart = useCallback(async (period: PortfolioChartPeriod, silent = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const fetcher = fetchFn || getPortfolioChart;
      const data = await fetcher(period);
      setChartData(data);
    } catch (e) {
      console.error('Chart fetch error:', e);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Initial load + period change
  useEffect(() => {
    fetchChart(selectedPeriod);
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

  // Fetch benchmark candles once (for measurement comparison)
  useEffect(() => {
    getBenchmarkCloses('SPY').then(setBenchmarkCandles).catch(() => {});
  }, []);

  // ── Period change clears measurement ───────────────────────────
  const handlePeriodChange = (period: PortfolioChartPeriod) => {
    if (period === selectedPeriod) return;
    setHoverIndex(null);
    setMeasureA(null);
    setMeasureB(null);
    setSelectedPeriod(period);
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
  const lineColor = isGain ? '#00C805' : '#FF3B30';

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

  // For 1D, use time-based positioning across the full 24-hour day (today)
  const is1D = selectedPeriod === '1D' && points.length > 1;
  let dayStartMs = 0, dayEndMs = 0;
  if (is1D) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    dayStartMs = d.getTime();
    dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
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
  const areaD = hasData ? pathD
    + ` L${toX(points.length - 1).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)}`
    + ` L${toX(0).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)} Z` : '';

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

  // Benchmark comparison
  const benchmarkResult = useMemo(() => {
    if (!measurement || benchmarkCandles.length === 0) return null;
    const spyStart = findBenchmarkClose(benchmarkCandles, measurement.startTime);
    const spyEnd = findBenchmarkClose(benchmarkCandles, measurement.endTime);
    if (spyStart === null || spyEnd === null || spyStart === 0) return null;
    const spyReturn = ((spyEnd - spyStart) / spyStart) * 100;
    return {
      spyReturn,
      outperformance: measurement.percentChange - spyReturn,
    };
  }, [measurement, benchmarkCandles]);

  const measureIsGain = measurement ? measurement.dollarChange >= 0 : true;
  const measureColor = measureIsGain ? '#00C805' : '#FF3B30';

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
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      {/* Hero value display */}
      {!hasMeasurement && (
        <div className="mb-2">
          <p className="text-3xl font-bold text-rh-light-text dark:text-rh-text">
            {formatCurrency(displayValue)}
          </p>
          <p className={`text-sm font-medium ${isGain ? 'text-rh-green' : 'text-rh-red'}`}>
            {formatChange(displayChange)} ({formatPct(displayChangePct)})
            {hoverIndex !== null && hoverLabel && (
              <span className="text-rh-light-muted dark:text-rh-muted ml-2">{hoverLabel}</span>
            )}
            {hoverIndex === null && selectedPeriod === '1D' && (
              <span className="text-rh-light-muted dark:text-rh-muted ml-2">Today</span>
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

      {/* Chart */}
      <div className="relative w-full" style={{ aspectRatio: `${CHART_W}/${CHART_H}` }}>
        {loading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-rh-light-muted dark:text-rh-muted text-sm">Loading chart...</div>
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className={`w-full h-full ${hasData ? 'cursor-crosshair' : 'cursor-default'}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          <defs>
            <linearGradient id="portfolio-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
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
              stroke="#6B7280" strokeWidth="0.8" strokeDasharray="4,4" opacity="0.4" />
          )}

          {/* Area fill */}
          {hasData && <path d={areaD} fill="url(#portfolio-grad)" />}

          {/* Price line */}
          {hasData && (
            <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
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
              <circle cx={lastX} cy={lastY} r="6" fill={lineColor} opacity="0.2">
                <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={lastX} cy={lastY} r="3" fill={lineColor} />
            </>
          )}

          {/* Hover crosshair (suppress when measurement complete to avoid clutter) */}
          {hasData && hoverX !== null && hoverY !== null && !hasMeasurement && (
            <>
              <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={CHART_H - PAD_BOTTOM}
                stroke="#9CA3AF" strokeWidth="0.8" opacity="0.6" />
              <circle cx={hoverX} cy={hoverY} r="4" fill={lineColor} stroke="#fff" strokeWidth="1.5" />
            </>
          )}

          {/* Time labels — non-1D only */}
          {timeLabels.map((tl, i) => (
            <text key={i} x={tl.x} y={CHART_H - 2}
              className="fill-gray-500" fontSize="10" textAnchor="middle">
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

        {/* Tooltip hint */}
        {showHint && hasData && !isMeasuring && (
          <div className="absolute left-0 bottom-0 pointer-events-none">
            <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">
              Click chart to measure gains between two dates
            </span>
          </div>
        )}
      </div>

      {/* Period selector */}
      <div className="flex gap-1 mt-3">
        {PERIODS.map(period => (
          <button
            key={period}
            onClick={() => handlePeriodChange(period)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
              selectedPeriod === period
                ? `${isGain ? 'bg-rh-green/15 text-rh-green' : 'bg-rh-red/15 text-rh-red'}`
                : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
            }`}
          >
            {period}
          </button>
        ))}
      </div>
    </div>
  );
}
