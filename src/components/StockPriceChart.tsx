import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ChartPeriod, StockCandles } from '../types';
import { IntradayCandle } from '../api';

interface Props {
  candles: StockCandles | null;
  intradayCandles?: IntradayCandle[];
  hourlyCandles?: IntradayCandle[];
  livePrices: { time: string; price: number }[];
  selectedPeriod: ChartPeriod;
  onPeriodChange: (period: ChartPeriod) => void;
  currentPrice: number;
  previousClose: number;
  onHoverPrice?: (price: number | null, label: string | null) => void;
}

const PERIODS: ChartPeriod[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y'];

interface DataPoint {
  time: number; // ms timestamp
  label: string;
  price: number;
}

function buildPoints(
  candles: StockCandles | null,
  intradayCandles: IntradayCandle[] | undefined,
  hourlyCandles: IntradayCandle[] | undefined,
  livePrices: { time: string; price: number }[],
  period: ChartPeriod,
  currentPrice: number,
  previousClose: number,
): DataPoint[] {
  if (period === '1D') {
    if (intradayCandles && intradayCandles.length > 0) {
      const pts = intradayCandles.map(c => {
        const d = new Date(c.time);
        return {
          time: d.getTime(),
          label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          price: c.close,
        };
      });
      // Prepend a point at previous close just before the first candle
      // so the chart starts with a flat line from the open
      if (pts.length > 0) {
        pts.unshift({
          time: pts[0].time - 1000,
          label: pts[0].label,
          price: previousClose,
        });
      }
      return pts;
    }
    const pts: DataPoint[] = livePrices.map(p => ({
      time: new Date(p.time).getTime(),
      label: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      price: p.price,
    }));
    if (pts.length <= 1) {
      const now = Date.now();
      const start = now - 5 * 60000;
      return [
        { time: start, label: '', price: previousClose },
        { time: now, label: 'Now', price: currentPrice },
      ];
    }
    return pts;
  }

  // Use hourly candles for 1W/1M if available; return empty while waiting to avoid flash
  if (period === '1W' || period === '1M') {
    if (hourlyCandles && hourlyCandles.length > 0) {
      return hourlyCandles.map(c => {
        const d = new Date(c.time);
        return {
          time: d.getTime(),
          label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
          price: c.close,
        };
      });
    }
    return []; // Don't fall through to daily data
  }

  if (!candles || candles.closes.length === 0) return [];

  const now = new Date();
  let cutoff: Date;
  switch (period) {
    case '1W': cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7); break;
    case '1M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); break;
    case '3M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); break;
    case 'YTD': cutoff = new Date(now.getFullYear(), 0, 1); break;
    case '1Y': default: cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
  }
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

  const pts: DataPoint[] = [];
  for (let i = 0; i < candles.dates.length; i++) {
    if (candles.dates[i] >= cutoffStr) {
      // Parse as local noon to avoid UTC date-shift in western timezones
      const d = new Date(candles.dates[i] + 'T12:00:00');
      pts.push({
        time: d.getTime(),
        label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        price: candles.closes[i],
      });
    }
  }
  return pts;
}

// ── SMA calculation ──────────────────────────────────────────────
const MA_PERIODS = [5, 10, 50, 100, 200] as const;
type MAPeriod = typeof MA_PERIODS[number];

const MA_COLORS: Record<MAPeriod, string> = {
  5: '#F59E0B',   // amber
  10: '#8B5CF6',  // violet
  50: '#3B82F6',  // blue
  100: '#EC4899', // pink
  200: '#10B981', // emerald
};

function calcSMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    result.push(i >= period - 1 ? sum / period : null);
  }
  return result;
}

// ── MA Breach Signal Detection ────────────────────────────────────

interface BreachEvent {
  index: number;
  maPeriods: MAPeriod[];       // which MAs were breached on this candle
  price: number;
  maValues: Partial<Record<MAPeriod, number>>; // MA values at breach point
}

function detectAllBreaches(
  prices: number[],
  maData: { period: MAPeriod; values: (number | null)[] }[],
): BreachEvent[] {
  const wasAbove = new Map<MAPeriod, boolean>();
  for (const ma of maData) wasAbove.set(ma.period, true);

  const events: BreachEvent[] = [];
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    const breached: MAPeriod[] = [];
    const vals: Partial<Record<MAPeriod, number>> = {};

    for (const ma of maData) {
      const v = ma.values[i] ?? null;
      if (v === null) continue;
      vals[ma.period] = v;
      const isAbove = p >= v;
      if (!isAbove && wasAbove.get(ma.period)) breached.push(ma.period);
      wasAbove.set(ma.period, isAbove);
    }

    if (breached.length > 0) {
      events.push({ index: i, maPeriods: breached, price: p, maValues: vals });
    }
  }
  return events;
}

// Only these MAs generate signals (short MAs are too noisy)
const SIGNAL_MA_PERIODS: MAPeriod[] = [50, 100, 200];

interface BreachCluster {
  index: number;          // representative index (first event in cluster)
  events: BreachEvent[];  // all events in this cluster
  price: number;
}

function clusterBreaches(events: BreachEvent[], minGap: number): BreachCluster[] {
  if (events.length === 0) return [];
  const clusters: BreachCluster[] = [];
  let current: BreachCluster = { index: events[0].index, events: [events[0]], price: events[0].price };
  for (let i = 1; i < events.length; i++) {
    if (events[i].index - current.events[current.events.length - 1].index <= minGap) {
      current.events.push(events[i]);
    } else {
      clusters.push(current);
      current = { index: events[i].index, events: [events[i]], price: events[i].price };
    }
  }
  clusters.push(current);
  return clusters;
}

function clusterColor(cluster: BreachCluster): string {
  // Use highest-priority MA color (200 > 100 > 50)
  const allPeriods = new Set(cluster.events.flatMap(e => e.maPeriods));
  if (allPeriods.has(200)) return MA_COLORS[200];
  if (allPeriods.has(100)) return MA_COLORS[100];
  if (allPeriods.has(50)) return MA_COLORS[50];
  const first = allPeriods.values().next().value;
  return first ? MA_COLORS[first] : '#F59E0B';
}

// Signal hierarchy: MA200 > MA100 > MA50
function clusterPillSize(cluster: BreachCluster): number {
  const allPeriods = new Set(cluster.events.flatMap(e => e.maPeriods));
  if (allPeriods.has(200)) return 18;
  if (allPeriods.has(100)) return 15;
  return 13;
}

function clusterGlowOpacity(cluster: BreachCluster): number {
  const allPeriods = new Set(cluster.events.flatMap(e => e.maPeriods));
  if (allPeriods.has(200)) return 0.25;
  if (allPeriods.has(100)) return 0.18;
  return 0.12;
}


const CHART_W = 800;
const CHART_H = 280;
const PAD_TOP = 20;
const PAD_BOTTOM = 30;
const PAD_LEFT = 0;
const PAD_RIGHT = 0;

export function StockPriceChart({ candles, intradayCandles, hourlyCandles, livePrices, selectedPeriod, onPeriodChange, currentPrice, previousClose, onHoverPrice }: Props) {
  const points = useMemo(
    () => buildPoints(candles, intradayCandles, hourlyCandles, livePrices, selectedPeriod, currentPrice, previousClose),
    [candles, intradayCandles, hourlyCandles, livePrices, selectedPeriod, currentPrice, previousClose],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [enabledMAs, setEnabledMAs] = useState<Set<MAPeriod>>(() => {
    try {
      const saved = localStorage.getItem('stockChartMAs');
      if (saved) return new Set(JSON.parse(saved) as MAPeriod[]);
    } catch { /* ignore */ }
    return new Set();
  });
  const [signalsEnabled, setSignalsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stockChartSignals');
      if (saved !== null) return JSON.parse(saved);
    } catch { /* ignore */ }
    return true;
  });
  const toggleSignals = useCallback(() => {
    setSignalsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('stockChartSignals', JSON.stringify(next));
      return next;
    });
  }, []);
  const [hoveredBreachIndex, setHoveredBreachIndex] = useState<number | null>(null);
  const [measureA, setMeasureA] = useState<number | null>(null);
  const [measureB, setMeasureB] = useState<number | null>(null);
  const [showMeasureHint, setShowMeasureHint] = useState(true);
  const [cardDragPos, setCardDragPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [signalDragPos, setSignalDragPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingSignal, setIsDraggingSignal] = useState(false);
  const isMeasuring = measureA !== null;
  const hasMeasurement = measureA !== null && measureB !== null;
  const svgRef = useRef<SVGSVGElement>(null);
  const yRangeRef = useRef<{ min: number; max: number; period: string } | null>(null);
  const measureCardPos = useRef<{ bottomPct: number; leftPct: number } | null>(null);

  const toggleMA = useCallback((period: MAPeriod) => {
    setEnabledMAs(prev => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      localStorage.setItem('stockChartMAs', JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Clear state when period or data changes
  useEffect(() => { setHoveredBreachIndex(null); setMeasureA(null); setMeasureB(null); }, [selectedPeriod, points.length]);

  // ESC clears measurement
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMeasureA(null); setMeasureB(null); setCardDragPos(null); setIsDraggingCard(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Click outside chart clears measurement
  const chartContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMeasuring) return;
    const handler = (e: MouseEvent) => {
      if (chartContainerRef.current && !chartContainerRef.current.contains(e.target as Node)) {
        setMeasureA(null);
        setMeasureB(null);
        setCardDragPos(null);
        setIsDraggingCard(false);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [isMeasuring]);

  // Track mouse for card dragging (hold-and-drag)
  useEffect(() => {
    const active = isDraggingCard || isDraggingSignal;
    if (!active || !chartContainerRef.current) return;
    const container = chartContainerRef.current;
    const moveHandler = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (isDraggingCard) setCardDragPos(pos);
      if (isDraggingSignal) setSignalDragPos(pos);
    };
    const upHandler = () => {
      if (isDraggingCard) setIsDraggingCard(false);
      if (isDraggingSignal) setIsDraggingSignal(false);
    };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
    return () => {
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    };
  }, [isDraggingCard, isDraggingSignal]);

  const referencePrice = selectedPeriod === '1D' ? previousClose : (points.length > 0 ? points[0].price : currentPrice);
  const hoverPrice = hoverIndex !== null ? points[hoverIndex]?.price : null;
  const effectivePrice = hoverPrice ?? currentPrice;
  const isGain = effectivePrice >= referencePrice;
  const lineColor = isGain ? '#00C805' : '#FF3B30';

  // Pre-compute visible MA values — computed on the ACTUAL displayed candles per timeframe
  const visibleMaData = useMemo(() => {
    const result: { period: MAPeriod; values: (number | null)[] }[] = [];

    if (selectedPeriod === '1D') {
      // Short MAs (5, 10): compute on intraday candles for a flowing line
      // Long MAs (50, 100, 200): use daily history → flat horizontal line (like Robinhood)
      const hasIntraday = intradayCandles && intradayCandles.length > 0;
      const hasDaily = candles && candles.closes.length > 0;

      for (const ma of MA_PERIODS) {
        if (ma <= 10 && hasIntraday) {
          const prices = intradayCandles!.map(c => c.close);
          const sma = calcSMA(prices, ma);
          result.push({ period: ma, values: [null, ...sma] });
        } else if (hasDaily) {
          // Flat line from latest daily SMA value
          const sma = calcSMA(candles!.closes, ma);
          let latest: number | null = null;
          for (let i = sma.length - 1; i >= 0; i--) {
            if (sma[i] !== null) { latest = sma[i]; break; }
          }
          result.push({ period: ma, values: points.map(() => latest) });
        } else {
          result.push({ period: ma, values: points.map(() => null) });
        }
      }
      return result;
    }

    // For all non-1D timeframes: compute MA on full daily candle history,
    // then map each visible point to its daily MA value by date.
    // This ensures MA50/100/200 start from the left edge (years of history behind them).
    if (!candles || candles.closes.length === 0) return [];
    const dateToFullIdx = new Map<string, number>();
    for (let i = 0; i < candles.dates.length; i++) {
      dateToFullIdx.set(candles.dates[i], i);
    }
    const pointFullIndices = points.map(p => {
      const d = new Date(p.time);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateToFullIdx.get(dateStr);
    });
    for (const ma of MA_PERIODS) {
      const sma = calcSMA(candles.closes, ma);
      const values: (number | null)[] = pointFullIndices.map(fullIdx =>
        fullIdx !== undefined ? sma[fullIdx] : null
      );
      result.push({ period: ma, values });
    }
    return result;
  }, [candles, intradayCandles, hourlyCandles, points, selectedPeriod]);

  // Compute stable Y-axis range (includes enabled MA values)
  const { paddedMin, paddedMax } = useMemo(() => {
    const prices = points.map(p => p.price);
    let minP = Math.min(...prices, referencePrice);
    let maxP = Math.max(...prices, referencePrice);

    // Include enabled MA values in Y range so MA lines are visible
    if (enabledMAs.size > 0) {
      for (const ma of visibleMaData) {
        if (!enabledMAs.has(ma.period)) continue;
        for (const val of ma.values) {
          if (val !== null) { minP = Math.min(minP, val); maxP = Math.max(maxP, val); }
        }
      }
    }

    if (maxP === minP) { maxP += 1; minP -= 1; }

    if (selectedPeriod === '1D') {
      // Minimum 0.5% range to prevent flat-line appearance, but tight enough for dramatic moves
      const minRange = referencePrice * 0.005;
      if (maxP - minP < minRange) {
        const mid = (maxP + minP) / 2;
        minP = mid - minRange / 2;
        maxP = mid + minRange / 2;
      }
      yRangeRef.current = { min: minP, max: maxP, period: '1D' };
    } else {
      yRangeRef.current = { min: minP, max: maxP, period: selectedPeriod };
    }
    const range = maxP - minP;
    return { paddedMin: minP - range * 0.08, paddedMax: maxP + range * 0.08 };
  }, [points, referencePrice, selectedPeriod, visibleMaData, enabledMAs]);

  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

  // For 1D, use time-based x positioning from pre-market open (4 AM ET) to AH close (8 PM ET)
  const is1D = selectedPeriod === '1D' && points.length > 1;
  let dayStartMs = 0;
  let dayEndMs = 0;
  if (is1D) {
    // Get the date in ET timezone (YYYY-MM-DD)
    const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
      .format(new Date(points[0].time));
    // Create dates at the ET times we want, using America/New_York
    // Pre-market opens at 4:00 AM ET = 09:00 UTC (EST) or 08:00 UTC (EDT)
    // AH closes at 8:00 PM ET = 01:00+1 UTC (EST) or 00:00+1 UTC (EDT)
    // We can compute this by creating a UTC noon date and measuring the ET offset
    const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
    const noonEtStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    }).format(noonUtc);
    const noonEtH = parseInt(noonEtStr.split(':')[0]);
    // ET offset from UTC in ms: if noonEtH=7, offset is -5h (EST); if 8, offset is -4h (EDT)
    const etOffsetMs = (noonEtH - 12) * 3600000;
    // 4 AM ET in UTC: etDateStr 04:00 ET = etDateStr 04:00 - etOffsetMs (etOffset is negative, so subtracting adds)
    dayStartMs = new Date(`${etDateStr}T04:00:00Z`).getTime() - etOffsetMs;
    dayEndMs = new Date(`${etDateStr}T20:00:00Z`).getTime() - etOffsetMs;
  }
  const dayRangeMs = dayEndMs - dayStartMs;
  const toX = (i: number) => {
    if (is1D && dayRangeMs > 0) {
      return PAD_LEFT + ((points[i].time - dayStartMs) / dayRangeMs) * plotW;
    }
    return PAD_LEFT + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  };
  const toY = (price: number) => PAD_TOP + plotH - ((price - paddedMin) / (paddedMax - paddedMin)) * plotH;

  // Build SVG path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.price).toFixed(1)}`).join(' ');

  // Gradient fill path (area under line to bottom)
  const areaD = pathD
    + ` L${toX(points.length - 1).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)}`
    + ` L${toX(0).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)} Z`;

  // Monotone cubic interpolation (Fritsch–Carlson) — handles non-uniform x-spacing,
  // never overshoots, never pulls back at endpoints, always passes through every point.
  const monotonePath = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    if (pts.length === 2) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;

    const n = pts.length;
    // Step 1: compute secants (deltas)
    const dx: number[] = [];
    const dy: number[] = [];
    const m: number[] = []; // slopes of secant lines
    for (let i = 0; i < n - 1; i++) {
      dx.push(pts[i + 1].x - pts[i].x);
      dy.push(pts[i + 1].y - pts[i].y);
      m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
    }

    // Step 2: compute tangent slopes using Fritsch–Carlson
    const tangent: number[] = new Array(n);
    tangent[0] = m[0];
    tangent[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) {
        tangent[i] = 0; // sign change → flat tangent (monotone constraint)
      } else {
        tangent[i] = (m[i - 1] + m[i]) / 2;
      }
    }

    // Step 3: enforce monotonicity (Fritsch–Carlson §4)
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) {
        tangent[i] = 0;
        tangent[i + 1] = 0;
      } else {
        const alpha = tangent[i] / m[i];
        const beta = tangent[i + 1] / m[i];
        // Restrict to circle of radius 3 to prevent overshoot
        const s = alpha * alpha + beta * beta;
        if (s > 9) {
          const tau = 3 / Math.sqrt(s);
          tangent[i] = tau * alpha * m[i];
          tangent[i + 1] = tau * beta * m[i];
        }
      }
    }

    // Step 4: build cubic bezier path
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const seg = dx[i] / 3;
      const cp1x = pts[i].x + seg;
      const cp1y = pts[i].y + tangent[i] * seg;
      const cp2x = pts[i + 1].x - seg;
      const cp2y = pts[i + 1].y - tangent[i + 1] * seg;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
    }
    return d;
  };

  // For hourly views, build interpolated MA values so the line transitions smoothly between days
  const useHourly = (selectedPeriod === '1W' || selectedPeriod === '1M') && hourlyCandles && hourlyCandles.length > 0;

  const interpolatedMaData = useMemo(() => {
    if (!useHourly || visibleMaData.length === 0) return null;
    // Build day boundaries: for each day, find first/last point index and the daily MA value
    const dayInfos: { key: string; first: number; last: number; maVal: (number | null) }[][] = [];
    for (const ma of visibleMaData) {
      const days: { key: string; first: number; last: number; maVal: number | null }[] = [];
      const dayMap = new Map<string, { first: number; last: number; val: number | null }>();
      for (let i = 0; i < ma.values.length; i++) {
        const d = new Date(points[i].time);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const existing = dayMap.get(key);
        if (!existing) {
          dayMap.set(key, { first: i, last: i, val: ma.values[i] });
        } else {
          existing.last = i;
        }
      }
      for (const [key, info] of dayMap) {
        days.push({ key, first: info.first, last: info.last, maVal: info.val });
      }
      dayInfos.push(days);
    }

    // For each MA, interpolate values across hourly points
    return visibleMaData.map((ma, maIdx) => {
      const days = dayInfos[maIdx];
      const interp = new Array<number | null>(ma.values.length).fill(null);
      for (let di = 0; di < days.length; di++) {
        const day = days[di];
        if (day.maVal === null) continue;
        const prevVal = di > 0 && days[di - 1].maVal !== null ? days[di - 1].maVal! : day.maVal;
        const nextVal = di < days.length - 1 && days[di + 1].maVal !== null ? days[di + 1].maVal! : day.maVal;
        // Interpolate from prevVal→thisVal over first half, thisVal→nextVal over second half
        for (let i = day.first; i <= day.last; i++) {
          const t = day.last > day.first ? (i - day.first) / (day.last - day.first) : 0.5;
          // Smooth blend: first half transitions from previous day's value, second half toward next
          if (t <= 0.5) {
            const blend = t * 2; // 0→1 over first half
            interp[i] = prevVal + (day.maVal - prevVal) * (0.5 + blend * 0.5);
          } else {
            const blend = (t - 0.5) * 2; // 0→1 over second half
            interp[i] = day.maVal + (nextVal - day.maVal) * blend * 0.5;
          }
        }
      }
      return { period: ma.period, values: interp };
    });
  }, [useHourly, visibleMaData, points]);

  // MA SVG paths — monotone cubic interpolation for all timeframes
  const maPaths = useMemo(() => {
    const result: { period: MAPeriod; d: string; lastPt?: { x: number; y: number } }[] = [];
    const maSource = useHourly && interpolatedMaData ? interpolatedMaData : visibleMaData;
    for (const ma of maSource) {
      if (!enabledMAs.has(ma.period)) continue;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < ma.values.length; i++) {
        const val = ma.values[i];
        if (val === null) continue;
        pts.push({ x: toX(i), y: toY(val) });
      }
      const d = monotonePath(pts);
      const lastPt = pts.length > 0 ? pts[pts.length - 1] : undefined;
      if (d) result.push({ period: ma.period, d, lastPt });
    }
    return result;
  }, [visibleMaData, interpolatedMaData, enabledMAs, points, selectedPeriod, useHourly]);

  // ── Breach signal events ──────────────────────────────────────────
  const breachClusters = useMemo<BreachCluster[]>(() => {
    if (!signalsEnabled || points.length === 0 || enabledMAs.size === 0) return [];

    const maSource = useHourly && interpolatedMaData ? interpolatedMaData : visibleMaData;
    const prices = points.map(p => p.price);

    const pad = (arr: (number | null)[]) => {
      if (arr.length >= prices.length) return arr;
      return [...arr, ...new Array(prices.length - arr.length).fill(null)];
    };

    // Only detect for MA50/100/200 — short MAs are too noisy
    const signalMaData = maSource
      .filter(m => enabledMAs.has(m.period) && SIGNAL_MA_PERIODS.includes(m.period))
      .map(m => ({ period: m.period, values: pad(m.values) }));

    if (signalMaData.length === 0) return [];
    const events = detectAllBreaches(prices, signalMaData);
    // Cluster events within 5 candles of each other
    return clusterBreaches(events, 5);
  }, [signalsEnabled, points, enabledMAs, visibleMaData, interpolatedMaData, useHourly]);

  // Reference line (previous close for 1D, first price for others)
  const refY = toY(referencePrice);

  // Time labels
  const timeLabels: { label: string; x: number }[] = [];
  if (points.length > 1) {
    if (selectedPeriod === '1D') {
      // Session boundaries in ET, positioned using dayStartMs/dayEndMs
      const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
        .format(new Date(points[0].time));
      const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
      const noonEtStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
      }).format(noonUtc);
      const noonEtH = parseInt(noonEtStr.split(':')[0]);
      const etOffsetMs = (noonEtH - 12) * 3600000;

      const etSessions = [
        { etH: 4, etM: 0 },   // Pre-market opens
        { etH: 9, etM: 30 },  // Market opens
        { etH: 16, etM: 0 },  // Market closes
        { etH: 20, etM: 0 },  // After-hours closes
      ];
      for (const s of etSessions) {
        const ms = new Date(`${etDateStr}T${String(s.etH).padStart(2, '0')}:${String(s.etM).padStart(2, '0')}:00Z`).getTime() - etOffsetMs;
        const ratio = (ms - dayStartMs) / dayRangeMs;
        const x = PAD_LEFT + ratio * plotW;
        const label = new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        timeLabels.push({ label, x });
      }
    } else {
      const maxTimeLabels = 5;
      const step = Math.max(1, Math.floor(points.length / maxTimeLabels));
      for (let i = 0; i < points.length; i += step) {
        timeLabels.push({ label: points[i].label, x: toX(i) });
      }
    }
  }

  // Current price dot
  const lastX = points.length > 0 ? toX(points.length - 1) : CHART_W / 2;
  const lastY = points.length > 0 ? toY(points[points.length - 1].price) : toY(currentPrice);

  const hasData = points.length >= 2;

  // Hover handler — find nearest data point to mouse X position
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    if (is1D && dayRangeMs > 0) {
      // Time-based: convert mouseX to timestamp, find nearest point
      const ratio = (mouseX - PAD_LEFT) / plotW;
      const mouseTime = dayStartMs + ratio * dayRangeMs;
      let best = 0;
      let bestDist = Math.abs(points[0].time - mouseTime);
      for (let i = 1; i < points.length; i++) {
        const dist = Math.abs(points[i].time - mouseTime);
        if (dist < bestDist) { best = i; bestDist = dist; }
      }
      setHoverIndex(best);
      onHoverPrice?.(points[best].price, points[best].label);
    } else {
      const ratio = (mouseX - PAD_LEFT) / plotW;
      const idx = Math.round(ratio * (points.length - 1));
      const clamped = Math.max(0, Math.min(points.length - 1, idx));
      setHoverIndex(clamped);
      onHoverPrice?.(points[clamped].price, points[clamped].label);
    }
  }, [points, plotW, onHoverPrice, is1D, dayStartMs, dayRangeMs]);

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
    onHoverPrice?.(null, null);
  }, [onHoverPrice]);

  // Find nearest index from SVG x coordinate
  const findNearestIndex = useCallback((svgX: number): number => {
    if (is1D && dayRangeMs > 0) {
      const ratio = (svgX - PAD_LEFT) / plotW;
      const mouseTime = dayStartMs + ratio * dayRangeMs;
      let best = 0;
      let bestDist = Math.abs(points[0].time - mouseTime);
      for (let i = 1; i < points.length; i++) {
        const dist = Math.abs(points[i].time - mouseTime);
        if (dist < bestDist) { best = i; bestDist = dist; }
      }
      return best;
    }
    const ratio = (svgX - PAD_LEFT) / plotW;
    return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
  }, [points, plotW, is1D, dayStartMs, dayRangeMs]);

  // Click handler for measurement — on container div so clicks above/below chart register
  const handleChartClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current || points.length < 2) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relXRatio = relX / rect.width;

    // Ignore clicks to the left or right of the plot area
    const leftRatio = PAD_LEFT / CHART_W;
    const rightRatio = (CHART_W - PAD_RIGHT) / CHART_W;
    if (relXRatio < leftRatio - 0.02 || relXRatio > rightRatio + 0.02) return;

    const svgX = relXRatio * CHART_W;
    const idx = findNearestIndex(svgX);

    setShowMeasureHint(false);

    if (hasMeasurement) {
      setMeasureA(null);
      setMeasureB(null);
      setCardDragPos(null);
      setIsDraggingCard(false);
      return;
    } else if (measureA === null) {
      setMeasureA(idx);
    } else {
      setMeasureB(idx);
    }
  }, [points, findNearestIndex, measureA, hasMeasurement]);

  // Measurement computation
  const measurement = useMemo(() => {
    if (measureA === null || measureB === null) return null;
    const a = Math.min(measureA, measureB);
    const b = Math.max(measureA, measureB);
    if (!points[a] || !points[b]) return null;
    const startPrice = points[a].price;
    const endPrice = points[b].price;
    if (startPrice === 0) return null;
    return {
      startPrice,
      endPrice,
      startTime: points[a].time,
      endTime: points[b].time,
      startLabel: points[a].label,
      endLabel: points[b].label,
      dollarChange: endPrice - startPrice,
      percentChange: ((endPrice - startPrice) / startPrice) * 100,
      daysBetween: Math.round(Math.abs(points[b].time - points[a].time) / 86400000),
    };
  }, [measureA, measureB, points]);

  const measureIsGain = measurement ? measurement.dollarChange >= 0 : true;
  const measureColor = measureIsGain ? '#00C805' : '#E8544E';

  // SVG coordinates for measurement markers
  const mAx = measureA !== null ? toX(measureA) : null;
  const mAy = measureA !== null && points[measureA] ? toY(points[measureA].price) : null;
  const mBx = measureB !== null ? toX(measureB) : null;
  const mBy = measureB !== null && points[measureB] ? toY(points[measureB].price) : null;

  // Shaded region between A and B
  const shadedPath = useMemo(() => {
    if (measureA === null || measureB === null) return '';
    const lo = Math.min(measureA, measureB);
    const hi = Math.max(measureA, measureB);
    const pts = [];
    for (let i = lo; i <= hi; i++) {
      pts.push(`${i === lo ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(points[i].price).toFixed(1)}`);
    }
    pts.push(`L${toX(hi).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)}`);
    pts.push(`L${toX(lo).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)} Z`);
    return pts.join(' ');
  }, [measureA, measureB, points]);

  // Hover crosshair data
  const hoverX = hoverIndex !== null ? toX(hoverIndex) : null;
  const hoverY = hoverIndex !== null ? toY(points[hoverIndex].price) : null;
  const hoverLabel = hoverIndex !== null ? points[hoverIndex].label : null;

  // MA values at hovered point
  const hoverMaValues = useMemo(() => {
    if (hoverIndex === null || enabledMAs.size === 0) return [];
    const result: { period: MAPeriod; value: number; color: string }[] = [];
    for (const ma of visibleMaData) {
      if (!enabledMAs.has(ma.period)) continue;
      const val = ma.values[hoverIndex];
      if (val !== null) {
        result.push({ period: ma.period, value: val, color: MA_COLORS[ma.period] });
      }
    }
    return result;
  }, [hoverIndex, enabledMAs, visibleMaData]);

  // HUD data for hovered breach
  const hoveredCluster = hoveredBreachIndex !== null
    ? breachClusters.find(c => c.index === hoveredBreachIndex) ?? null
    : null;

  const hudData = hoveredCluster ? (() => {
    const color = clusterColor(hoveredCluster);
    const allPeriods = [...new Set(hoveredCluster.events.flatMap(e => e.maPeriods))].sort((a, b) => a - b);
    const firstEvt = hoveredCluster.events[0];
    const lastEvt = hoveredCluster.events[hoveredCluster.events.length - 1];
    const dateLabel = hoveredCluster.events.length === 1
      ? points[firstEvt.index]?.label
      : `${points[firstEvt.index]?.label} – ${points[lastEvt.index]?.label}`;
    // Distance % from each breached MA
    const distances = allPeriods.map(mp => {
      const maVal = firstEvt.maValues[mp];
      const dist = maVal ? ((firstEvt.price - maVal) / maVal) * 100 : null;
      return { period: mp, dist };
    });
    return { color, allPeriods, firstEvt, dateLabel, distances };
  })() : null;

  return (
    <div>
      {/* MA values bar — fixed height so chart never shifts */}
      <div className="h-[20px] mb-1">
        {hoverIndex !== null && hoverMaValues.length > 0 && !hasMeasurement && (
          <div className="flex items-center gap-4 h-full">
            <span className="text-[11px] font-semibold text-rh-light-text dark:text-rh-text" style={{ fontVariantNumeric: 'tabular-nums' }}>
              ${points[hoverIndex].price.toFixed(2)}
            </span>
            {hoverMaValues.map(ma => (
              <span key={ma.period} className="flex items-center gap-1 text-[11px]">
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ma.color }} />
                <span className="text-rh-light-muted dark:text-rh-muted">MA{ma.period}</span>
                <span className="font-medium text-rh-light-text dark:text-rh-text" style={{ fontVariantNumeric: 'tabular-nums' }}>${ma.value.toFixed(2)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div ref={chartContainerRef} className="relative w-full" style={{ aspectRatio: `${CHART_W}/${CHART_H}` }} onClick={handleChartClick}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={`grad-${selectedPeriod}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="measure-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={measureColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={measureColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <style>{`
            .breach-pill { cursor: default; }
            .breach-pill:hover .breach-pill-glow { opacity: 0.4; }
          `}</style>

          {/* Reference line */}
          {hasData && (
            <line x1={PAD_LEFT} y1={refY} x2={CHART_W - PAD_RIGHT} y2={refY}
              stroke="#6B7280" strokeWidth="0.8" strokeDasharray="4,4" opacity="0.5" />
          )}

          {/* Session dividers for 1D */}
          {hasData && is1D && timeLabels.map((tl, i) => (
            <line key={`session-${i}`} x1={tl.x} y1={PAD_TOP} x2={tl.x} y2={CHART_H - PAD_BOTTOM}
              stroke="#6B7280" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4" />
          ))}

          {/* Area fill */}
          {hasData && <path d={areaD} fill={`url(#grad-${selectedPeriod})`} />}

          {/* Price line */}
          {hasData && (
            <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Moving average lines */}
          {maPaths.map(({ period, d }) => (
            <path key={`ma-${period}`} d={d} fill="none" stroke={MA_COLORS[period]}
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
          ))}

          {/* MA Breach signal markers — hover only, no click */}
          {breachClusters.map((cluster) => {
            const cx = toX(cluster.index);
            const cy = toY(cluster.price);
            const isActive = hoveredBreachIndex === cluster.index;
            const color = clusterColor(cluster);
            const count = cluster.events.length;
            const size = clusterPillSize(cluster);
            const baseGlow = clusterGlowOpacity(cluster);
            const label = count > 1 ? `B\u00d7${count}` : 'B';
            const pillW = count > 1 ? size + 12 : size;
            const pillH = size;
            const pillY = cy - size - 4;
            const fontSize = size >= 18 ? 10 : size >= 15 ? 9 : 8;
            return (
              <g
                key={`breach-${cluster.index}`}
                className="breach-pill"
                onMouseEnter={() => { setHoveredBreachIndex(cluster.index); setSignalDragPos(null); setIsDraggingSignal(false); }}
                onMouseLeave={() => { if (!isDraggingSignal && !signalDragPos) setHoveredBreachIndex(null); }}
              >
                <rect
                  className="breach-pill-glow"
                  x={cx - pillW / 2 - 2} y={pillY - pillH / 2 - 2}
                  width={pillW + 4} height={pillH + 4}
                  rx={pillH / 2 + 2} fill={color}
                  opacity={isActive ? baseGlow + 0.2 : baseGlow}
                  style={{ transition: 'opacity 180ms ease' }}
                />
                <rect
                  x={cx - pillW / 2} y={pillY - pillH / 2}
                  width={pillW} height={pillH} rx={pillH / 2}
                  fill={color}
                />
                <text
                  x={cx} y={pillY + fontSize * 0.35}
                  textAnchor="middle"
                  fontSize={fontSize} fontWeight="700" fill="#fff"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >{label}</text>
                <rect
                  x={cx - 22} y={pillY - 22}
                  width="44" height="44"
                  fill="transparent"
                />
              </g>
            );
          })}

          {/* Disclaimer badge */}
          {signalsEnabled && enabledMAs.size > 0 && (
            <text x={8} y={CHART_H - 6} fontSize="9" fill="rgba(255,255,255,0.2)" fontWeight="400">
              Signal only — Not financial advice
            </text>
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
            <line x1={mAx} y1={PAD_TOP} x2={mAx} y2={CHART_H - PAD_BOTTOM}
              stroke="white" strokeWidth="1" strokeDasharray="4,3" opacity="0.5">
              <animate attributeName="opacity" from="0" to="0.5" dur="0.2s" fill="freeze" />
            </line>
          )}

          {/* Vertical dashed line B */}
          {mBx !== null && (
            <line x1={mBx} y1={PAD_TOP} x2={mBx} y2={CHART_H - PAD_BOTTOM}
              stroke="white" strokeWidth="1" strokeDasharray="4,3" opacity="0.5">
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
            <line x1={mAx} y1={mAy} x2={mBx} y2={mBy}
              stroke={measureColor} strokeWidth="1" strokeDasharray="3,3" opacity="0.6">
              <animate attributeName="opacity" from="0" to="0.6" dur="0.3s" fill="freeze" />
            </line>
          )}

          {/* ── End measurement overlays ───────────────────── */}

          {/* Current price dot with pulse */}
          {hasData && selectedPeriod === '1D' && hoverIndex === null && !isMeasuring && (
            <>
              <circle cx={lastX} cy={lastY} r="6" fill={lineColor} opacity="0.2">
                <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={lastX} cy={lastY} r="3" fill={lineColor} />
            </>
          )}

          {/* Hover crosshair (suppress when measurement complete) */}
          {hasData && hoverX !== null && hoverY !== null && !hasMeasurement && (
            <>
              <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={CHART_H - PAD_BOTTOM}
                stroke="#9CA3AF" strokeWidth="0.8" opacity="0.6" />
              <circle cx={hoverX} cy={hoverY} r="4" fill={lineColor} stroke="#fff" strokeWidth="1.5" />
              <text x={hoverX} y={PAD_TOP - 6} textAnchor="middle" className="fill-gray-400" fontSize="11" fontWeight="600">
                {hoverLabel}
              </text>
            </>
          )}

          {/* Time labels */}
          {timeLabels.map((tl, i) => {
            const anchor = i === 0 ? 'start' : i === timeLabels.length - 1 ? 'end' : 'middle';
            return (
              <text key={i} x={tl.x} y={CHART_H - 8} className="fill-gray-500" fontSize="10" textAnchor={anchor}>
                {tl.label}
              </text>
            );
          })}
        </svg>

        {/* Measurement HUD — positioned in empty space above price action */}
        {hasMeasurement && measurement && mAx !== null && mBx !== null && mAy !== null && mBy !== null && (() => {
          // Center horizontally between A and B
          const midXPct = ((Math.min(mAx, mBx) + Math.max(mAx, mBx)) / 2 / CHART_W) * 100;
          // Find the highest price point in the selected range to place card above it
          const lo = Math.min(measureA!, measureB!);
          const hi = Math.max(measureA!, measureB!);
          let minYInRange = CHART_H;
          for (let i = lo; i <= hi; i++) {
            const y = toY(points[i].price);
            if (y < minYInRange) minYInRange = y;
          }
          // Also check enabled MA values in the range for the true visual top
          for (const ma of visibleMaData) {
            if (!enabledMAs.has(ma.period)) continue;
            for (let i = lo; i <= hi; i++) {
              const v = ma.values[i];
              if (v !== null) {
                const y = toY(v);
                if (y < minYInRange) minYInRange = y;
              }
            }
          }
          // Position card so its BOTTOM edge is above the highest visible point
          const highestPointFromBottomPct = 100 - (minYInRange / CHART_H) * 100;
          const bottomPct = highestPointFromBottomPct + 8;
          // Measurement card sits right of center — signal card will go to its left
          const leftPct = Math.max(30, Math.min(60, midXPct - 12));
          // Store position for signal card alignment
          measureCardPos.current = { bottomPct, leftPct };
          const posStyle = cardDragPos
            ? { top: cardDragPos.y, left: cardDragPos.x, transform: 'translate(-50%, -50%)' }
            : { bottom: `${bottomPct}%`, left: `${leftPct}%` };
          return (
            <div
              className={`absolute z-10 rounded-xl border border-white/[0.08] px-3.5 py-2.5 ${isDraggingCard ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{
                ...posStyle,
                background: 'rgba(15, 15, 20, 0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                pointerEvents: 'auto',
                userSelect: 'none',
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const rect = chartContainerRef.current?.getBoundingClientRect();
                if (rect) {
                  setCardDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }
                setIsDraggingCard(true);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inline-flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span>{measurement.startLabel}</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span>{measurement.endLabel}</span>
                  {measurement.daysBetween > 0 && (
                    <span className="text-white/30">· {measurement.daysBetween}d</span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-white/90" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${measurement.startPrice.toFixed(2)}
                  </span>
                  <svg className="w-3 h-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span className="text-lg font-bold text-white/90" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${measurement.endPrice.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-bold ${measureIsGain ? 'text-rh-green' : 'text-rh-red'}`}>
                    {measurement.percentChange >= 0 ? '+' : ''}{measurement.percentChange.toFixed(2)}%
                  </span>
                  <span className={`text-sm font-medium ${measureIsGain ? 'text-rh-green' : 'text-rh-red'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {measurement.dollarChange >= 0 ? '+' : ''}${measurement.dollarChange.toFixed(2)}
                  </span>
                </div>
                <div className="text-[9px] text-white/25 mt-0.5">
                  Hold to drag · Click chart to remeasure · ESC to clear
                </div>
              </div>
            </div>
          );
        })()}

        {/* Single-point indicator — above the selected point */}
        {isMeasuring && !hasMeasurement && measureA !== null && points[measureA] && mAx !== null && mAy !== null && (() => {
          const leftPct = Math.max(2, Math.min(70, (mAx / CHART_W) * 100 - 5));
          const topPct = Math.max(0, (mAy / CHART_H) * 100 - 14);
          return (
            <div
              className="absolute pointer-events-none z-10 rounded-lg border border-white/[0.08] px-3 py-1.5"
              style={{
                top: `${topPct}%`,
                left: `${leftPct}%`,
                background: 'rgba(15, 15, 20, 0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
                <span className="text-xs text-white/70">
                  {points[measureA].label} · ${points[measureA].price.toFixed(2)}
                </span>
                <span className="text-[10px] text-white/30">
                  — click another point
                </span>
              </div>
            </div>
          );
        })()}

        {/* Signal HUD — positioned above chart lines, to the left of measurement card when both visible */}
        {hudData && hoveredCluster && (() => {
          const breachX = toX(hoveredCluster.index);
          const breachY = toY(hoveredCluster.price);

          let signalBottomPct: number;
          let signalLeftPct: number;

          if (hasMeasurement && measureCardPos.current && !cardDragPos) {
            // Both visible: same row as measurement card
            signalBottomPct = measureCardPos.current.bottomPct;
            const leftOfCard = measureCardPos.current.leftPct - 30;
            if (leftOfCard < 1) {
              // Not enough room on the left — place to the right instead
              signalLeftPct = measureCardPos.current.leftPct + 32;
            } else {
              signalLeftPct = leftOfCard;
            }
          } else {
            // Solo: position above the breach point
            const breachFromBottomPct = 100 - (breachY / CHART_H) * 100;
            signalBottomPct = breachFromBottomPct + 12;
            signalLeftPct = Math.max(1, Math.min(70, (breachX / CHART_W) * 100 - 12));
          }

          const signalPosStyle = signalDragPos
            ? { top: signalDragPos.y, left: signalDragPos.x, transform: 'translate(-50%, -50%)' } as React.CSSProperties
            : { bottom: `${signalBottomPct}%`, left: `${signalLeftPct}%` } as React.CSSProperties;

          return (
            <div
              className={`absolute z-10 rounded-xl border border-white/[0.08] px-3.5 py-2.5 min-w-[180px] max-w-[220px] ${isDraggingSignal ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{
                ...signalPosStyle,
                background: 'rgba(15, 15, 20, 0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                pointerEvents: 'auto',
                userSelect: 'none',
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const rect = chartContainerRef.current?.getBoundingClientRect();
                if (rect) {
                  setSignalDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }
                setIsDraggingSignal(true);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-md text-[8px] font-bold text-white"
                  style={{ backgroundColor: hudData.color }}
                >B</span>
                <span className="text-[11px] font-semibold text-white/90 tracking-wide">MA Breach Signal</span>
              </div>

              {/* Body stats */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-[9px] text-white/40 uppercase tracking-widest">Date</span>
                  <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{hudData.dateLabel}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[9px] text-white/40 uppercase tracking-widest">Price</span>
                  <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>${hudData.firstEvt.price.toFixed(2)}</span>
                </div>
                {hudData.distances.map(({ period: mp, dist }) => {
                  const maVal = hudData.firstEvt.maValues[mp];
                  return maVal != null ? (
                    <div key={mp} className="flex justify-between items-baseline">
                      <span className="text-[9px] uppercase tracking-widest" style={{ color: MA_COLORS[mp] }}>MA{mp}</span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>${maVal.toFixed(2)}</span>
                        {dist !== null && (
                          <span className={`text-[9px] font-semibold ${dist < 0 ? 'text-rh-red' : 'text-rh-green'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {dist > 0 ? '+' : ''}{dist.toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </div>
                  ) : null;
                })}
              </div>

              {/* Footer */}
              <div className="mt-2 pt-1.5 border-t border-white/[0.06]">
                <span className="text-[8px] text-white/25 italic">Hold to drag · Signal only — not financial advice.</span>
              </div>
            </div>
          );
        })()}

        {/* No data overlay */}
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-rh-light-muted dark:text-rh-muted text-sm">
                {selectedPeriod === '1D' ? 'Collecting live data...' : 'Chart data loading...'}
              </div>
              {selectedPeriod === '1D' && (
                <div className="text-[11px] text-rh-light-muted dark:text-rh-muted mt-1 opacity-60">
                  Price updates every 10s during market hours
                </div>
              )}
            </div>
          </div>
        )}

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

      {/* Period selector + MA toggles */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-1">
          {PERIODS.map(period => {
            const disabled = period !== '1D' && (!candles || candles.closes.length === 0);
            return (
              <button
                key={period}
                onClick={() => !disabled && onPeriodChange(period)}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                  selectedPeriod === period
                    ? `${isGain ? 'bg-rh-green/15 text-rh-green' : 'bg-rh-red/15 text-rh-red'}`
                    : disabled
                      ? 'text-rh-light-muted/30 dark:text-rh-muted/30 cursor-not-allowed'
                      : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
              >
                {period}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1.5">
          {MA_PERIODS.map(ma => {
            const active = enabledMAs.has(ma);
            return (
              <button
                key={ma}
                onClick={() => toggleMA(ma)}
                className={`px-2 py-1 rounded text-[10px] font-semibold tracking-wide transition-all border ${
                  active
                    ? 'text-white border-transparent'
                    : 'text-rh-light-muted dark:text-rh-muted border-rh-light-border dark:border-rh-border hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
                style={active ? { backgroundColor: MA_COLORS[ma], borderColor: MA_COLORS[ma] } : undefined}
              >
                MA{ma}
              </button>
            );
          })}
          <span className="w-px bg-rh-light-border dark:bg-rh-border mx-0.5" />
          <button
            onClick={toggleSignals}
            className={`px-2 py-1 rounded text-[10px] font-semibold tracking-wide transition-all border ${
              signalsEnabled
                ? 'text-white border-transparent'
                : 'text-rh-light-muted dark:text-rh-muted border-rh-light-border dark:border-rh-border hover:text-rh-light-text dark:hover:text-rh-text'
            }`}
            style={signalsEnabled ? { backgroundColor: '#F59E0B', borderColor: '#F59E0B' } : undefined}
          >
            Signals
          </button>
        </div>
      </div>

      {/* Micro legend + measure hint */}
      <div className="flex items-center justify-between mt-1.5">
        {signalsEnabled && enabledMAs.size > 0 && breachClusters.length > 0 ? (
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">
            B = MA breach signal
          </span>
        ) : <span />}
        {showMeasureHint && hasData && !isMeasuring && (
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">
            Click chart to measure gains between two dates
          </span>
        )}
      </div>
    </div>
  );
}
