import { useMemo, useState, useCallback, useRef } from 'react';
import { ChartPeriod, StockCandles } from '../types';
import { IntradayCandle } from '../api';

interface Props {
  candles: StockCandles | null;
  intradayCandles?: IntradayCandle[];
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
      // Prepend midnight point using previous close so chart starts at 12:00 AM
      if (pts.length > 0) {
        const midnight = new Date(pts[0].time);
        midnight.setHours(0, 0, 0, 0);
        const midnightMs = midnight.getTime();
        if (pts[0].time - midnightMs > 60000) {
          pts.unshift({
            time: midnightMs,
            label: '12:00 AM',
            price: previousClose,
          });
        }
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
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const pts: DataPoint[] = [];
  for (let i = 0; i < candles.dates.length; i++) {
    if (candles.dates[i] >= cutoffStr) {
      const d = new Date(candles.dates[i]);
      pts.push({
        time: d.getTime(),
        label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        price: candles.closes[i],
      });
    }
  }
  return pts;
}

const CHART_W = 800;
const CHART_H = 280;
const PAD_TOP = 20;
const PAD_BOTTOM = 30;
const PAD_LEFT = 40;
const PAD_RIGHT = 10;

export function StockPriceChart({ candles, intradayCandles, livePrices, selectedPeriod, onPeriodChange, currentPrice, previousClose, onHoverPrice }: Props) {
  const points = useMemo(
    () => buildPoints(candles, intradayCandles, livePrices, selectedPeriod, currentPrice, previousClose),
    [candles, intradayCandles, livePrices, selectedPeriod, currentPrice, previousClose],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const yRangeRef = useRef<{ min: number; max: number; period: string } | null>(null);

  const referencePrice = selectedPeriod === '1D' ? previousClose : (points.length > 0 ? points[0].price : currentPrice);
  const hoverPrice = hoverIndex !== null ? points[hoverIndex]?.price : null;
  const effectivePrice = hoverPrice ?? currentPrice;
  const isGain = effectivePrice >= referencePrice;
  const lineColor = isGain ? '#00C805' : '#FF3B30';

  // Compute stable Y-axis range
  const { paddedMin, paddedMax } = useMemo(() => {
    const prices = points.map(p => p.price);
    let minP = Math.min(...prices, referencePrice);
    let maxP = Math.max(...prices, referencePrice);
    if (maxP === minP) { maxP += 1; minP -= 1; }

    if (selectedPeriod === '1D') {
      // Minimum 3% range around reference to prevent tiny moves from rescaling
      const minRange = referencePrice * 0.03;
      if (maxP - minP < minRange) {
        const mid = (maxP + minP) / 2;
        minP = mid - minRange / 2;
        maxP = mid + minRange / 2;
      }
      // Only expand Y range, never shrink within session
      if (yRangeRef.current?.period === '1D') {
        minP = Math.min(minP, yRangeRef.current.min);
        maxP = Math.max(maxP, yRangeRef.current.max);
      }
      yRangeRef.current = { min: minP, max: maxP, period: '1D' };
    } else {
      yRangeRef.current = { min: minP, max: maxP, period: selectedPeriod };
    }
    const range = maxP - minP;
    return { paddedMin: minP - range * 0.08, paddedMax: maxP + range * 0.08 };
  }, [points, referencePrice, selectedPeriod]);

  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

  // For 1D, use time-based x positioning anchored to midnight-to-midnight
  const is1D = selectedPeriod === '1D' && points.length > 1;
  let dayStartMs = 0;
  let dayEndMs = 0;
  if (is1D) {
    const d = new Date(points[0].time);
    d.setHours(0, 0, 0, 0);
    dayStartMs = d.getTime();
    dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
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

  // Reference line (previous close for 1D, first price for others)
  const refY = toY(referencePrice);

  // Time labels
  const timeLabels: { label: string; x: number }[] = [];
  if (points.length > 1) {
    if (selectedPeriod === '1D') {
      // Fixed time markers for 1D chart (midnight-to-midnight)
      const fixedHours = [
        { h: 4, m: 0, label: '4 AM' },
        { h: 9, m: 30, label: '9:30 AM' },
        { h: 12, m: 0, label: '12 PM' },
        { h: 16, m: 0, label: '4 PM' },
        { h: 20, m: 0, label: '8 PM' },
      ];
      for (const fh of fixedHours) {
        const ratio = (fh.h * 60 + fh.m) / (24 * 60);
        const x = PAD_LEFT + ratio * plotW;
        timeLabels.push({ label: fh.label, x });
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

  // Hover crosshair data
  const hoverX = hoverIndex !== null ? toX(hoverIndex) : null;
  const hoverY = hoverIndex !== null ? toY(points[hoverIndex].price) : null;
  const hoverLabel = hoverIndex !== null ? points[hoverIndex].label : null;

  return (
    <div>
      <div className="relative w-full" style={{ aspectRatio: `${CHART_W}/${CHART_H}` }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full h-full cursor-crosshair"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={`grad-${selectedPeriod}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Reference line (previous close / first price) */}
          {hasData && (
            <line x1={PAD_LEFT} y1={refY} x2={CHART_W - PAD_RIGHT} y2={refY}
              stroke="#6B7280" strokeWidth="0.8" strokeDasharray="4,4" opacity="0.5" />
          )}

          {/* Market open/close session dividers for 1D */}
          {hasData && is1D && [
            { h: 9, m: 30 }, // Market open
            { h: 16, m: 0 }, // Market close
          ].map(({ h, m }) => {
            const x = PAD_LEFT + ((h * 60 + m) / (24 * 60)) * plotW;
            return (
              <line key={`session-${h}`} x1={x} y1={PAD_TOP} x2={x} y2={CHART_H - PAD_BOTTOM}
                stroke="#6B7280" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4" />
            );
          })}

          {/* Area fill */}
          {hasData && (
            <path d={areaD} fill={`url(#grad-${selectedPeriod})`} />
          )}

          {/* Price line */}
          {hasData && (
            <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Current price dot with pulse (only when not hovering) */}
          {hasData && selectedPeriod === '1D' && hoverIndex === null && (
            <>
              <circle cx={lastX} cy={lastY} r="6" fill={lineColor} opacity="0.2">
                <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={lastX} cy={lastY} r="3" fill={lineColor} />
            </>
          )}

          {/* Hover crosshair */}
          {hasData && hoverX !== null && hoverY !== null && (
            <>
              {/* Vertical line */}
              <line
                x1={hoverX} y1={PAD_TOP}
                x2={hoverX} y2={CHART_H - PAD_BOTTOM}
                stroke="#9CA3AF" strokeWidth="0.8" opacity="0.6"
              />
              {/* Dot on the line */}
              <circle cx={hoverX} cy={hoverY} r="4" fill={lineColor} stroke="#fff" strokeWidth="1.5" />
              {/* Time label above */}
              <text
                x={hoverX}
                y={PAD_TOP - 6}
                textAnchor="middle"
                className="fill-gray-400"
                fontSize="11"
                fontWeight="600"
              >
                {hoverLabel}
              </text>
            </>
          )}

          {/* Time labels on bottom */}
          {timeLabels.map((tl, i) => (
            <text key={i} x={tl.x} y={CHART_H - 8}
              className="fill-gray-500" fontSize="10" textAnchor="middle">
              {tl.label}
            </text>
          ))}
        </svg>

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

      {/* Period selector */}
      <div className="flex gap-1 mt-3">
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
    </div>
  );
}
