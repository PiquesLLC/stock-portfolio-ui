import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { EconomicDashboardResponse, InternationalEconomicResponse, EconomicIndicator, PortfolioMacroImpactResponse, MacroInsight, FedSentiment } from '../types';
import { getEconomicDashboard, getInternationalEconomic, getPortfolioMacroImpact } from '../api';
import { SkeletonCard } from './SkeletonCard';

// Indicator health sentiment — drives subtle card accent colors
type IndicatorSentiment = 'healthy' | 'caution' | 'concern' | 'neutral';

function getIndicatorSentiment(indicator: EconomicIndicator): IndicatorSentiment {
  const { name, latestValue, changePercent } = indicator;
  if (latestValue == null) return 'neutral';

  switch (name) {
    case 'Consumer Price Index':
      // CPI: period-over-period change indicates inflation pace
      if (changePercent != null) {
        if (changePercent < 2.5) return 'healthy';
        if (changePercent < 4) return 'caution';
        return 'concern';
      }
      return 'neutral';
    case 'Inflation Rate':
      if (latestValue <= 2.5) return 'healthy';
      if (latestValue <= 4) return 'caution';
      return 'concern';
    case 'GDP Growth':
      if (latestValue > 2) return 'healthy';
      if (latestValue > 0) return 'caution';
      return 'concern';
    case 'Unemployment Rate':
      if (latestValue < 5) return 'healthy';
      if (latestValue < 7) return 'caution';
      return 'concern';
    default:
      return 'neutral';
  }
}

const SENTIMENT_BORDER: Record<IndicatorSentiment, string> = {
  healthy: '#22c55e',  // green-500
  caution: '#f59e0b',  // amber-500
  concern: '#ef4444',  // red-500
  neutral: 'transparent',
};

// Subtle background wash per sentiment — very light so it doesn't overwhelm
const SENTIMENT_BG: Record<IndicatorSentiment, string> = {
  healthy: 'rgba(34,197,94,0.04)',   // green tint
  caution: 'rgba(245,158,11,0.05)',  // amber tint
  concern: 'rgba(239,68,68,0.05)',   // red tint
  neutral: 'transparent',
};

// Value text color per sentiment
const SENTIMENT_VALUE_CLASS: Record<IndicatorSentiment, string> = {
  healthy: 'text-green-600 dark:text-green-400',
  caution: 'text-amber-600 dark:text-amber-400',
  concern: 'text-red-500 dark:text-red-400',
  neutral: 'text-rh-light-text dark:text-rh-text',
};

// Mini sparkline SVG for cards — with area fill for visibility
function Sparkline({ data, color }: { data: { date: string; value: number }[]; color: string }) {
  if (!data || data.length < 2) return null;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 90;
  const h = 32;
  const padding = 2;

  const pts = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * (w - padding * 2),
    y: h - padding - ((v - min) / range) * (h - padding * 2),
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const fillPath = linePath + ` L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;
  const gradId = `spark-${color.replace('#', '')}`;

  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Measurement marker type
interface MeasurePoint {
  idx: number;
  x: number;
  y: number;
  date: string;
  value: number;
}

// Full-size interactive chart — styled to match portfolio chart, with click-to-measure
function FullChart({ indicator }: { indicator: EconomicIndicator }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ idx: number; x: number; y: number; date: string; value: number } | null>(null);
  const [measureA, setMeasureA] = useState<MeasurePoint | null>(null);
  const [measureB, setMeasureB] = useState<MeasurePoint | null>(null);
  const history = indicator.history;

  const values = useMemo(() => history.map(d => d.value), [history]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 800;
  const h = 280;
  const pad = { top: 32, right: 16, bottom: 40, left: 56 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const trendUp = values[values.length - 1] >= values[0];
  const lineColor = trendUp ? '#0A9E10' : '#B87872';
  const gradId = `econ-grad-${indicator.name.replace(/\s/g, '')}`;
  const glowId = `econ-glow-${indicator.name.replace(/\s/g, '')}`;
  const measureGradId = `econ-mgrad-${indicator.name.replace(/\s/g, '')}`;

  // Map data to pixel coordinates
  const points = useMemo(() => values.map((v, i) => ({
    x: pad.left + (i / (values.length - 1)) * chartW,
    y: pad.top + (1 - (v - min) / range) * chartH,
  })), [values, min, range, chartW, chartH]);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fillPath = linePath +
    ` L${points[points.length - 1].x},${pad.top + chartH}` +
    ` L${points[0].x},${pad.top + chartH} Z`;

  // Reference line at first value
  const refY = pad.top + (1 - (values[0] - min) / range) * chartH;

  // X-axis: ~6 labels (detect annual data — dates like "2024" vs "2024-01-01")
  const isAnnual = history.length > 0 && /^\d{4}$/.test(history[0].date);
  const xLabels = useMemo(() => {
    const count = Math.min(6, history.length);
    const step = Math.max(1, Math.floor((history.length - 1) / (count - 1)));
    const labels: { x: number; label: string }[] = [];
    const fmt = (dateStr: string) => {
      if (isAnnual) return dateStr; // "2024" → "2024"
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    };
    for (let i = 0; i < history.length; i += step) {
      labels.push({
        x: pad.left + (i / (history.length - 1)) * chartW,
        label: fmt(history[i].date),
      });
    }
    const lastIdx = history.length - 1;
    const lastX = pad.left + chartW;
    if (!labels.length || Math.abs(labels[labels.length - 1].x - lastX) > chartW * 0.08) {
      labels.push({ x: lastX, label: fmt(history[lastIdx].date) });
    }
    return labels;
  }, [history, chartW, isAnnual]);

  // Y-axis: 4 evenly spaced ticks
  const yTicks = useMemo(() => {
    const count = 4;
    const ticks: { y: number; value: number; label: string }[] = [];
    for (let i = 0; i <= count; i++) {
      const value = min + (i / count) * range;
      const y = pad.top + (1 - (value - min) / range) * chartH;
      let label: string;
      if (indicator.unit === 'percent') label = `${value.toFixed(1)}%`;
      else if (indicator.unit === 'index') label = value.toFixed(0);
      else if (indicator.unit.includes('billion')) {
        label = Math.abs(value) >= 1000 ? `$${(value / 1000).toFixed(1)}T` : `$${value.toFixed(0)}B`;
      } else if (indicator.unit === 'current usd') {
        if (Math.abs(value) >= 1e12) label = `$${(value / 1e12).toFixed(1)}T`;
        else if (Math.abs(value) >= 1e9) label = `$${(value / 1e9).toFixed(0)}B`;
        else label = `$${(value / 1e6).toFixed(0)}M`;
      } else {
        label = value.toFixed(1);
      }
      ticks.push({ y, value, label });
    }
    return ticks;
  }, [min, range, chartH, indicator.unit]);

  const last = points[points.length - 1];

  const findClosestIdx = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * w;
    let ci = 0;
    let cd = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - mouseX);
      if (d < cd) { cd = d; ci = i; }
    }
    return ci;
  }, [points]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const ci = findClosestIdx(e);
    setHover({ idx: ci, x: points[ci].x, y: points[ci].y, date: history[ci].date, value: history[ci].value });
  }, [history, points, findClosestIdx]);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const ci = findClosestIdx(e);
    const pt: MeasurePoint = { idx: ci, x: points[ci].x, y: points[ci].y, date: history[ci].date, value: history[ci].value };

    if (!measureA) {
      // First click — set point A
      setMeasureA(pt);
      setMeasureB(null);
    } else if (!measureB) {
      // Second click — set point B (ensure A < B order)
      if (pt.idx === measureA.idx) return; // same point, ignore
      if (pt.idx < measureA.idx) {
        setMeasureB(measureA);
        setMeasureA(pt);
      } else {
        setMeasureB(pt);
      }
    } else {
      // Third click — clear measurement
      setMeasureA(null);
      setMeasureB(null);
    }
  }, [measureA, measureB, findClosestIdx, points, history]);

  const handleMouseLeave = useCallback(() => {
    setHover(null);
  }, []);

  // Click outside chart clears measurement
  useEffect(() => {
    if (!measureA) return;
    const handler = (e: MouseEvent) => {
      if (svgRef.current && !svgRef.current.contains(e.target as Node)) {
        setMeasureA(null);
        setMeasureB(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [measureA]);

  if (!history || history.length < 2) return null;

  // Measurement calculations
  const hasMeasure = measureA && measureB;
  const measureChange = hasMeasure ? measureB!.value - measureA!.value : null;
  const measurePct = hasMeasure && measureA!.value !== 0
    ? ((measureB!.value - measureA!.value) / measureA!.value) * 100 : null;
  const measureUp = (measureChange ?? 0) >= 0;
  const measureColor = measureUp ? '#00C805' : '#E8544E';

  // Display value: measurement active shows B value, otherwise hovered or latest
  const displayValue = hasMeasure
    ? measureB!.value
    : hover ? hover.value : values[values.length - 1];
  const fmtLong = (ds: string) => isAnnual ? ds : new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const fmtShort = (ds: string) => isAnnual ? ds : new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const displayDate = hasMeasure
    ? fmtLong(measureB!.date)
    : hover ? fmtLong(hover.date) : fmtLong(history[history.length - 1].date);

  // Change line: measurement or from-start
  const changeFromStart = hover ? hover.value - values[0] : values[values.length - 1] - values[0];
  const changePctFromStart = values[0] !== 0 ? (changeFromStart / values[0]) * 100 : 0;
  const changePositive = hasMeasure ? measureUp : changeFromStart >= 0;

  const heroChange = hasMeasure ? measureChange! : changeFromStart;
  const heroPct = hasMeasure ? measurePct! : changePctFromStart;
  const heroColor = changePositive ? 'text-rh-green' : 'text-rh-red';

  return (
    <div className="w-full">
      {/* Hero value display */}
      <div className="mb-2 px-1">
        <div className="text-2xl font-bold text-rh-light-text dark:text-rh-text tabular-nums">
          {formatValue(displayValue, indicator.unit)}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-sm font-medium tabular-nums ${heroColor}`}>
            {indicator.unit === 'percent'
              ? `${heroChange >= 0 ? '+' : ''}${formatValue(heroChange, indicator.unit)} pp`
              : `${heroChange >= 0 ? '+' : ''}${formatValue(heroChange, indicator.unit)} (${heroPct >= 0 ? '+' : ''}${heroPct.toFixed(2)}%)`
            }
          </span>
          {hasMeasure ? (
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">
              {fmtShort(measureA!.date)}
              {' '}&rarr;{' '}
              {fmtShort(measureB!.date)}
            </span>
          ) : (
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">{displayDate}</span>
          )}
        </div>
      </div>

      {/* Measure hint */}
      <div className="px-1 mb-1 h-4">
        {!measureA && !hasMeasure && (
          <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">Click two points to measure</span>
        )}
        {measureA && !measureB && (
          <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">Click a second point to complete measurement</span>
        )}
        {hasMeasure && (
          <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">Click to clear measurement</span>
        )}
      </div>

      {/* Chart */}
      <div style={{ aspectRatio: '800 / 280' }} className="cursor-crosshair">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.12" />
              <stop offset="80%" stopColor={lineColor} stopOpacity="0.03" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            <radialGradient id={glowId}>
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </radialGradient>
            {hasMeasure && (
              <linearGradient id={measureGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={measureColor} stopOpacity="0.08" />
                <stop offset="100%" stopColor={measureColor} stopOpacity="0.01" />
              </linearGradient>
            )}
          </defs>

          {/* Y-axis gridlines and labels */}
          {yTicks.map((tick, i) => (
            <g key={`ytick-${i}`}>
              <line
                x1={pad.left} y1={tick.y}
                x2={w - pad.right} y2={tick.y}
                stroke="#6B7280" strokeWidth="0.3" strokeDasharray="3 4" opacity="0.2"
              />
              <text
                x={pad.left - 6} y={tick.y + 3.5}
                textAnchor="end"
                className="fill-rh-light-muted dark:fill-rh-muted"
                fontSize="9"
                fontWeight="400"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Reference line at starting value */}
          <line
            x1={pad.left} y1={refY}
            x2={w - pad.right} y2={refY}
            stroke="#6B7280" strokeWidth="0.5" strokeDasharray="4 3" opacity="0.3"
          />

          {/* Area fill */}
          <path d={fillPath} fill={`url(#${gradId})`} />

          {/* Main line */}
          <path
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth={hover ? 1.6 : 1.1}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ transition: 'stroke-width 150ms' }}
            opacity={hasMeasure ? 0.6 : 1}
          />

          {/* ── Measurement overlay ── */}
          {hasMeasure && (
            <>
              {/* Shaded region between A and B */}
              <rect
                x={measureA!.x}
                y={pad.top}
                width={measureB!.x - measureA!.x}
                height={chartH}
                fill={`url(#${measureGradId})`}
              />

              {/* Highlighted line segment between A and B */}
              {(() => {
                const segPoints = points.slice(measureA!.idx, measureB!.idx + 1);
                const segPath = segPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                return <path d={segPath} fill="none" stroke={measureColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
              })()}

              {/* Vertical dashed lines at A and B */}
              <line x1={measureA!.x} y1={pad.top} x2={measureA!.x} y2={pad.top + chartH} stroke="white" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
              <line x1={measureB!.x} y1={pad.top} x2={measureB!.x} y2={pad.top + chartH} stroke="white" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />

              {/* Connecting dashed line between dots */}
              <line
                x1={measureA!.x} y1={measureA!.y}
                x2={measureB!.x} y2={measureB!.y}
                stroke={measureColor} strokeWidth="1" strokeDasharray="3 3" opacity="0.6"
              />

              {/* Marker dots */}
              <circle cx={measureA!.x} cy={measureA!.y} r="4" fill={measureColor} stroke="white" strokeWidth="1.5" />
              <circle cx={measureB!.x} cy={measureB!.y} r="4" fill={measureColor} stroke="white" strokeWidth="1.5" />

              {/* Measurement card */}
              {(() => {
                const cardX = (measureA!.x + measureB!.x) / 2;
                const cardY = Math.min(measureA!.y, measureB!.y) - 12;
                const label = `${measureUp ? '+' : ''}${heroPct.toFixed(1)}%`;
                return (
                  <g>
                    <rect
                      x={cardX - 32} y={cardY - 18}
                      width="64" height="22"
                      rx="6"
                      fill={measureColor}
                      opacity="0.9"
                    />
                    <text
                      x={cardX} y={cardY - 4}
                      textAnchor="middle"
                      fill="white"
                      fontSize="12"
                      fontWeight="600"
                    >
                      {label}
                    </text>
                  </g>
                );
              })()}
            </>
          )}

          {/* Pulsing marker when only point A is set */}
          {measureA && !measureB && (
            <>
              <line x1={measureA.x} y1={pad.top} x2={measureA.x} y2={pad.top + chartH} stroke="white" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
              <circle cx={measureA.x} cy={measureA.y} r="4" fill={lineColor} stroke="white" strokeWidth="1.5" />
              <circle cx={measureA.x} cy={measureA.y} r="8" fill={lineColor} opacity="0.2">
                <animate attributeName="r" values="4;8;4" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.05;0.3" dur="1.5s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* X-axis labels */}
          {xLabels.map((l, i) => (
            <text
              key={i}
              x={l.x} y={h - 10}
              textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
              className="fill-rh-light-muted dark:fill-rh-muted"
              fontSize="11"
              fontWeight="400"
            >
              {l.label}
            </text>
          ))}

          {/* Breathing end-point dot (hidden during measurement) */}
          {!hover && !hasMeasure && !measureA && (
            <>
              <circle cx={last.x} cy={last.y} r="3" fill={lineColor} />
              <circle cx={last.x} cy={last.y} r="7" fill={lineColor} opacity="0.15">
                <animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.2;0.05;0.2" dur="2s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* Hover crosshair (hidden during complete measurement) */}
          {hover && !hasMeasure && (
            <>
              <line
                x1={hover.x} y1={pad.top}
                x2={hover.x} y2={pad.top + chartH}
                stroke="#6B7280" strokeWidth="0.5" strokeDasharray="4 3" opacity="0.5"
              />
              <circle cx={hover.x} cy={hover.y} r="12" fill={`url(#${glowId})`} />
              <circle cx={hover.x} cy={hover.y} r="3.5" fill={lineColor} stroke="white" strokeWidth="1.2" />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

function formatValue(value: number | null, unit: string): string {
  if (value == null) return 'N/A';
  if (unit === 'percent') return `${value.toFixed(2)}%`;
  if (unit === 'index') return value.toFixed(1);
  if (unit.includes('billion')) {
    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}T`;
    return `$${value.toFixed(1)}B`;
  }
  if (unit.includes('trillion')) return `$${value.toFixed(2)}T`;
  if (unit === 'current usd') {
    // World Bank GDP comes in raw USD (e.g. 16815152000000)
    const absVal = Math.abs(value);
    if (absVal >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (absVal >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (absVal >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toFixed(0)}`;
  }
  return value.toFixed(2);
}

function formatChange(change: number | null, changePercent: number | null, unit?: string): { text: string; positive: boolean } {
  if (change == null) return { text: '', positive: true };
  const sign = change >= 0 ? '+' : '';
  // For percent-unit indicators (GDP growth, inflation, unemployment), show "pp" instead of percent-of-percent
  if (unit === 'percent') {
    return {
      text: `${sign}${change.toFixed(2)} pp`,
      positive: change >= 0,
    };
  }
  // For current USD (World Bank GDP), show change in trillions/billions
  if (unit === 'current usd') {
    const absChange = Math.abs(change);
    let formatted: string;
    if (absChange >= 1e12) formatted = `${sign}$${(change / 1e12).toFixed(2)}T`;
    else if (absChange >= 1e9) formatted = `${sign}$${(change / 1e9).toFixed(1)}B`;
    else formatted = `${sign}$${(change / 1e6).toFixed(1)}M`;
    const pctText = changePercent != null ? ` (${sign}${changePercent.toFixed(1)}%)` : '';
    return {
      text: `${formatted}${pctText}`,
      positive: change >= 0,
    };
  }
  const pctText = changePercent != null ? ` (${sign}${changePercent.toFixed(1)}%)` : '';
  return {
    text: `${sign}${change.toFixed(2)}${pctText}`,
    positive: change >= 0,
  };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  // Annual data — just a year like "2024"
  if (/^\d{4}$/.test(dateStr)) return dateStr;
  // Monthly/quarterly — "2025-12-01" → "Dec 2025"
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Dynamic "So What?" tooltips — contextual based on actual current values
function getContextualTooltip(indicator: EconomicIndicator): string {
  const { name, latestValue } = indicator;
  if (latestValue == null) return '';
  const v = formatValue(latestValue, indicator.unit);

  switch (name) {
    case 'Consumer Price Index':
      if (indicator.changePercent != null && indicator.changePercent > 3)
        return `CPI at ${v}. Inflation is running hot — expect the Fed to hold or raise rates. This compresses P/E multiples on growth stocks and favors companies with pricing power (consumer staples, energy).`;
      if (indicator.changePercent != null && indicator.changePercent > 2)
        return `CPI at ${v}. Inflation is near the Fed's 2% target. This is the sweet spot — the Fed can hold steady, which lets the market price in earnings growth without rate headwinds.`;
      return `CPI at ${v}. Below-target inflation gives the Fed room to cut rates. Rate-sensitive sectors (tech, REITs) tend to rally on rate-cut expectations.`;

    case 'Federal Funds Rate':
      if (latestValue > 4)
        return `Fed Funds at ${v}. Higher rates generally compress P/E ratios, especially on growth stocks. Companies with strong cash positions and pricing power tend to outperform in this environment.`;
      if (latestValue > 2)
        return `Fed Funds at ${v}. A neutral-ish stance — the Fed is balancing growth and inflation. Rate-sensitive sectors (REITs, utilities) may see relief when cuts begin.`;
      return `Fed Funds at ${v}. Low rates benefit leveraged companies and growth names by reducing borrowing costs. Dividend stocks become less attractive vs. bond alternatives.`;

    case '10-Year Treasury Yield':
      if (latestValue > 4.5)
        return `10Y yield at ${v}. At this level, bonds compete directly with stock dividends for investor capital. Growth stocks with distant earnings are hit hardest as future cash flows get discounted more heavily.`;
      if (latestValue > 3)
        return `10Y yield at ${v}. A moderate yield environment — value stocks and dividend payers remain competitive. Watch for movement above 4.5% as a potential trigger for equity rotation.`;
      return `10Y yield at ${v}. Low yields push investors toward stocks for returns, creating a tailwind for equity valuations and making dividend stocks more attractive.`;

    case 'Unemployment Rate':
      if (latestValue < 4)
        return `Unemployment at ${v}. A tight labor market supports consumer spending and retail earnings, but watch for wage-driven inflation that keeps the Fed hawkish — bad for rate-sensitive holdings.`;
      if (latestValue < 6)
        return `Unemployment at ${v}. Moderate conditions — consumer discretionary names can do well here. If this starts rising quickly, defensive sectors (healthcare, utilities) tend to outperform.`;
      return `Unemployment at ${v}. Elevated unemployment signals weakening demand. The Fed typically responds with rate cuts — but earnings downgrades may offset the rate tailwind.`;

    case 'Real GDP':
      if (indicator.change != null && indicator.change > 0)
        return `Real GDP at ${v}. Economic output is growing, which supports corporate revenue and typically correlates with positive equity returns.`;
      return `Real GDP at ${v}. Slowing output may signal a cooling economy — watch for impacts on corporate earnings.`;

    case 'GDP Growth':
      if (latestValue > 2)
        return `GDP expanding at ${v}. Healthy growth signals strong corporate revenue environment and consumer confidence — generally bullish for equities.`;
      if (latestValue > 0)
        return `GDP at ${v}. Sluggish growth may indicate economic headwinds ahead. Corporate earnings growth could slow.`;
      return `GDP contracting at ${v}. Negative growth signals recession risk, historically associated with market drawdowns and risk-off sentiment.`;

    case 'Inflation Rate':
      if (latestValue > 4)
        return `Inflation at ${v}. Well above the central bank target — real returns are being eroded, and tighter monetary policy is likely, pressuring risk assets.`;
      if (latestValue > 2.5)
        return `Inflation at ${v}. Slightly elevated but manageable. Central banks may hold steady, which markets can digest.`;
      return `Inflation at ${v}. Near or below target — this creates room for monetary easing, which tends to support equity and bond markets.`;

    case 'GDP':
      return `GDP at ${v}. Total economic output in current USD — useful for comparing the relative scale of economies across regions.`;

    default:
      return '';
  }
}

function IndicatorCard({ indicator, isSelected, onClick }: { indicator: EconomicIndicator; isSelected: boolean; onClick: () => void }) {
  const { text: changeText, positive } = formatChange(indicator.change, indicator.changePercent, indicator.unit);
  const sentiment = getIndicatorSentiment(indicator);
  const accentColor = SENTIMENT_BORDER[sentiment];
  const bgColor = SENTIMENT_BG[sentiment];
  const valueClass = SENTIMENT_VALUE_CLASS[sentiment];
  const tooltip = getContextualTooltip(indicator);

  // Sparkline color follows sentiment when available, otherwise trend direction
  const sparkColor = sentiment === 'concern' ? '#ef4444'
    : sentiment === 'caution' ? '#f59e0b'
    : sentiment === 'healthy' ? '#22c55e'
    : positive ? '#00c805' : '#ff5252';

  // Derive recent trend from last 3 data points (if available)
  const history = indicator.history;
  const recentTrend = history.length >= 3
    ? history[history.length - 1].value - history[history.length - 3].value
    : null;
  const trendArrow = recentTrend != null
    ? recentTrend > 0 ? '\u2197' : recentTrend < 0 ? '\u2198' : '\u2192'
    : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-lg p-4 transition-all cursor-pointer
        ${isSelected
          ? 'border-rh-green ring-1 ring-rh-green/30'
          : 'border-white/[0.06] hover:border-white/[0.12]'
        }`}
      style={{
        borderLeftWidth: sentiment !== 'neutral' ? '3px' : undefined,
        borderLeftColor: sentiment !== 'neutral' ? accentColor : undefined,
        backgroundColor: bgColor,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-medium text-rh-light-muted dark:text-rh-muted uppercase tracking-wide truncate">
              {indicator.name}
            </h4>
            {tooltip && (
              <span className="group relative flex-shrink-0">
                <svg className="w-3 h-3 text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-muted dark:hover:text-rh-muted transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-white/[0.08] dark:bg-white/[0.08] backdrop-blur-md border border-white/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-rh-light-text dark:text-rh-text shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
                  {tooltip}
                </span>
              </span>
            )}
          </div>
          <div className={`text-xl font-semibold mt-1 ${valueClass}`}>
            {formatValue(indicator.latestValue, indicator.unit)}
          </div>
        </div>
        <Sparkline data={indicator.history} color={sparkColor} />
      </div>

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          {changeText && (
            <span className={`text-xs font-medium ${positive ? 'text-rh-green' : 'text-rh-red'}`}>
              {changeText}
            </span>
          )}
          {trendArrow && (
            <span className={`text-xs ${
              sentiment === 'concern' ? 'text-red-400'
              : sentiment === 'caution' ? 'text-amber-400'
              : sentiment === 'healthy' ? 'text-green-400'
              : 'text-rh-light-muted/40 dark:text-rh-muted/40'
            }`}>
              {trendArrow}
            </span>
          )}
        </div>
        {indicator.latestDate && (
          <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
            {formatDate(indicator.latestDate)}
          </span>
        )}
      </div>
    </button>
  );
}

// Selection key: region + index to track which card is selected across all sections
interface SelectedCard {
  region: 'us' | 'eu' | 'japan';
  idx: number;
}

// ─── Portfolio Impact Card (top of Macro tab) ─────────────────────────────────

function InsightPill({ insight }: { insight: MacroInsight }) {
  const borderColor = SENTIMENT_BORDER[insight.sentiment];
  const bgColor = SENTIMENT_BG[insight.sentiment];

  return (
    <div
      className="group relative rounded-md px-3 py-2 text-left border border-transparent"
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: borderColor,
        backgroundColor: bgColor,
      }}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm flex-shrink-0 mt-0.5">{insight.icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-rh-light-text dark:text-rh-text leading-snug">
            {insight.headline}
          </p>
        </div>
      </div>
      {/* Tooltip overlay — doesn't affect layout */}
      {insight.detail && (
        <div className="pointer-events-none absolute left-0 right-0 bottom-full mb-1.5 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="mx-2 rounded-lg bg-white/[0.08] dark:bg-white/[0.08] backdrop-blur-md border border-white/[0.06] px-3 py-2 shadow-lg">
            <p className="text-[11px] leading-relaxed text-rh-light-text dark:text-rh-text">
              {insight.detail}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Semicircular needle gauge for Fed hawkish/dovish sentiment
function FedSentimentGauge({ sentiment }: { sentiment: FedSentiment }) {
  // score: -100 (dovish) to +100 (hawkish)
  // Map to angle: -90deg (left/dovish) to +90deg (right/hawkish)
  const angle = (sentiment.score / 100) * 90; // -90 to +90
  const needleAngle = angle - 90; // SVG rotation: -180 (left) to 0 (right)

  // Colors for the arc segments
  const arcColors = [
    { color: '#22c55e', label: 'Dovish' },     // green (left)
    { color: '#86efac', label: '' },
    { color: '#fbbf24', label: 'Neutral' },     // amber (center)
    { color: '#fb923c', label: '' },
    { color: '#ef4444', label: 'Hawkish' },     // red (right)
  ];

  const cx = 60;
  const cy = 52;
  const r = 40;

  // Build 5 arc segments across 180 degrees
  const arcs = arcColors.map((seg, i) => {
    const startAngle = Math.PI + (i / 5) * Math.PI;     // PI to 2*PI
    const endAngle = Math.PI + ((i + 1) / 5) * Math.PI;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return (
      <path
        key={i}
        d={`M${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2}`}
        fill="none"
        stroke={seg.color}
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.7"
      />
    );
  });

  // Needle
  const needleLen = r - 8;
  const needleRad = (needleAngle * Math.PI) / 180;
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy + needleLen * Math.sin(needleRad);

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="68" viewBox="0 0 120 68">
        {arcs}
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={nx} y2={ny}
          stroke="currentColor"
          className="text-rh-light-text dark:text-rh-text"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r="3" className="fill-rh-light-text dark:fill-rh-text" />
        {/* Labels */}
        <text x="12" y="56" fontSize="7" className="fill-rh-light-muted dark:fill-rh-muted" textAnchor="start">Dovish</text>
        <text x="108" y="56" fontSize="7" className="fill-rh-light-muted dark:fill-rh-muted" textAnchor="end">Hawkish</text>
      </svg>
      <div className="text-center -mt-1">
        <span className="text-xs font-medium text-rh-light-text dark:text-rh-text">{sentiment.label}</span>
        <p className="text-[9px] text-rh-light-muted dark:text-rh-muted mt-0.5">{sentiment.rationale}</p>
      </div>
    </div>
  );
}

function PortfolioImpactSkeleton() {
  return (
    <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-4 mb-6 animate-pulse">
      <div className="h-3 bg-gray-200 dark:bg-rh-border rounded w-24 mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 bg-gray-200 dark:bg-rh-border rounded-md" />
        ))}
      </div>
    </div>
  );
}

let macroImpactCache: PortfolioMacroImpactResponse | null = null;
let macroImpactCacheTime: number | null = null;
const MACRO_IMPACT_CACHE_TTL = 10 * 60 * 1000; // 10 min UI-side

function PortfolioImpactCard() {
  const [data, setData] = useState<PortfolioMacroImpactResponse | null>(macroImpactCache);
  const [loading, setLoading] = useState(!macroImpactCache);

  useEffect(() => {
    const cacheAge = macroImpactCacheTime ? Date.now() - macroImpactCacheTime : Infinity;
    if (macroImpactCache && cacheAge < MACRO_IMPACT_CACHE_TTL) {
      setData(macroImpactCache);
      setLoading(false);
      return;
    }

    setLoading(!macroImpactCache);
    getPortfolioMacroImpact()
      .then(resp => {
        macroImpactCache = resp;
        macroImpactCacheTime = Date.now();
        setData(resp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <PortfolioImpactSkeleton />;
  if (!data || data.insights.length === 0) return null;

  return (
    <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-4 mb-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-rh-light-muted dark:text-rh-muted uppercase tracking-wide">
          Portfolio Impact
        </h3>
        {data.projectedQuarter && (
          <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">
            Outlook through {data.projectedQuarter}
          </span>
        )}
      </div>
      <div className="flex gap-4">
        {/* Insight pills — 2x2 grid */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.insights.map(insight => (
            <InsightPill key={insight.id} insight={insight} />
          ))}
        </div>
        {/* Fed Sentiment Gauge — right side */}
        {data.fedSentiment && (
          <div className="hidden md:flex flex-shrink-0 items-center border-l border-white/[0.06] pl-4">
            <FedSentimentGauge sentiment={data.fedSentiment} />
          </div>
        )}
      </div>
    </div>
  );
}

// Cache for economic data
let economicCache: EconomicDashboardResponse | null = null;
let cacheTime: number | null = null;
let intlCache: InternationalEconomicResponse | null = null;
let intlCacheTime: number | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function EconomicIndicators() {
  const [data, setData] = useState<EconomicDashboardResponse | null>(economicCache);
  const [intlData, setIntlData] = useState<InternationalEconomicResponse | null>(intlCache);
  const [loading, setLoading] = useState(!economicCache);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedCard | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Fetch US data
    const usCacheAge = cacheTime ? Date.now() - cacheTime : Infinity;
    if (economicCache && usCacheAge < CACHE_TTL) {
      setData(economicCache);
      setLoading(false);
    } else {
      setLoading(!economicCache);
      getEconomicDashboard()
        .then(resp => {
          if (mountedRef.current) {
            setData(resp);
            economicCache = resp;
            cacheTime = Date.now();
            setLoading(false);
          }
        })
        .catch(err => {
          if (mountedRef.current) {
            setError(err.message);
            setLoading(false);
          }
        });
    }

    // Fetch international data (independent — doesn't block US)
    const intlCacheAge = intlCacheTime ? Date.now() - intlCacheTime : Infinity;
    if (!intlCache || intlCacheAge >= CACHE_TTL) {
      getInternationalEconomic()
        .then(resp => {
          if (mountedRef.current) {
            setIntlData(resp);
            intlCache = resp;
            intlCacheTime = Date.now();
          }
        })
        .catch(err => {
          console.error('International economic data error:', err.message);
        });
    }

    return () => { mountedRef.current = false; };
  }, []);

  // Convert US indicators object to array — must be before any early returns
  // Merges Alpha Vantage US data with World Bank US GDP Growth for cross-region comparison
  const usIndicatorList = useMemo(() => {
    if (!data) return [];
    const { indicators } = data;
    const usGdpGrowth = intlData?.regions?.us?.indicators?.gdpGrowth ?? null;
    return [
      indicators.cpi,
      indicators.fedFundsRate,
      indicators.treasuryYield10Y,
      indicators.unemployment,
      indicators.gdp,
      usGdpGrowth,
    ].filter((ind): ind is EconomicIndicator => ind != null);
  }, [data, intlData]);

  // Convert EU indicators to array
  const euIndicatorList = useMemo(() => {
    if (!intlData?.regions?.eu?.indicators) return [];
    const { gdpGrowth, inflation, unemployment, gdp } = intlData.regions.eu.indicators;
    return [gdp, gdpGrowth, inflation, unemployment].filter((ind): ind is EconomicIndicator => ind != null);
  }, [intlData]);

  // Convert Japan indicators to array
  const jpnIndicatorList = useMemo(() => {
    if (!intlData?.regions?.japan?.indicators) return [];
    const { gdpGrowth, inflation, unemployment, gdp } = intlData.regions.japan.indicators;
    return [gdp, gdpGrowth, inflation, unemployment].filter((ind): ind is EconomicIndicator => ind != null);
  }, [intlData]);

  // Find the currently selected indicator across all regions
  const selectedIndicator = useMemo(() => {
    if (!selected) return null;
    if (selected.region === 'us') return usIndicatorList[selected.idx] ?? null;
    if (selected.region === 'eu') return euIndicatorList[selected.idx] ?? null;
    if (selected.region === 'japan') return jpnIndicatorList[selected.idx] ?? null;
    return null;
  }, [selected, usIndicatorList, euIndicatorList, jpnIndicatorList]);

  const selectedRegionLabel = selected?.region === 'eu' ? 'European Union'
    : selected?.region === 'japan' ? 'Japan'
    : 'United States';

  const handleCardClick = (region: 'us' | 'eu' | 'japan', idx: number) => {
    if (selected?.region === region && selected?.idx === idx) {
      setSelected(null); // deselect
    } else {
      setSelected({ region, idx });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text">Economic Indicators</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} lines={2} height="100px" />)}
        </div>
      </div>
    );
  }

  if (error || !data || usIndicatorList.length === 0) {
    return (
      <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-8 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          {error || 'Economic indicators data not yet available. Data refreshes daily.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Portfolio Impact Card ── */}
      <PortfolioImpactCard />

      {/* ── United States ── */}
      <div id="macro-region-us" className="space-y-3 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-y-1">
          <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text flex items-center gap-2">
            <span className="text-base">$</span> United States
            <span className="text-[10px] font-normal text-rh-light-muted/50 dark:text-rh-muted/50 hidden sm:inline">Monthly / Quarterly</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 italic hidden sm:inline">Dates show latest available</span>
            {data.lastUpdated && (
              <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
                {data.dataAge === 'stale' ? 'Data may be stale' : `Updated ${new Date(data.lastUpdated).toLocaleDateString()}`}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {usIndicatorList.map((ind, i) => (
            <IndicatorCard
              key={`us-${ind.name}`}
              indicator={ind}
              isSelected={selected?.region === 'us' && selected?.idx === i}
              onClick={() => handleCardClick('us', i)}
            />
          ))}
        </div>
      </div>

      {/* Expanded chart (shows after the region that owns it, or at bottom) */}
      {selectedIndicator && selected?.region === 'us' && (
        <ChartPanel
          indicator={selectedIndicator}
          regionLabel={selectedRegionLabel}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Divider */}
      {euIndicatorList.length > 0 && (
        <div className="border-t border-white/[0.06]" />
      )}

      {/* ── European Union ── */}
      {euIndicatorList.length > 0 && (
        <div id="macro-region-eu" className="space-y-3 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-y-1">
            <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text flex items-center gap-2">
              <span className="text-base">&#8364;</span> European Union
              <span className="text-[10px] font-normal text-rh-light-muted/50 dark:text-rh-muted/50 hidden sm:inline">Annual</span>
            </h3>
            {intlData?.lastUpdated && (
              <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
                {intlData.dataAge === 'stale' ? 'Data may be stale' : `Updated ${new Date(intlData.lastUpdated).toLocaleDateString()}`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {euIndicatorList.map((ind, i) => (
              <IndicatorCard
                key={`eu-${ind.name}`}
                indicator={ind}
                isSelected={selected?.region === 'eu' && selected?.idx === i}
                onClick={() => handleCardClick('eu', i)}
              />
            ))}
          </div>
        </div>
      )}

      {selectedIndicator && selected?.region === 'eu' && (
        <ChartPanel
          indicator={selectedIndicator}
          regionLabel={selectedRegionLabel}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Divider */}
      {jpnIndicatorList.length > 0 && (
        <div className="border-t border-white/[0.06]" />
      )}

      {/* ── Japan ── */}
      {jpnIndicatorList.length > 0 && (
        <div id="macro-region-japan" className="space-y-3 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-y-1">
            <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text flex items-center gap-2">
              <span className="text-base">&#165;</span> Japan
              <span className="text-[10px] font-normal text-rh-light-muted/50 dark:text-rh-muted/50 hidden sm:inline">Annual</span>
            </h3>
            {intlData?.lastUpdated && (
              <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
                {intlData.dataAge === 'stale' ? 'Data may be stale' : `Updated ${new Date(intlData.lastUpdated).toLocaleDateString()}`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {jpnIndicatorList.map((ind, i) => (
              <IndicatorCard
                key={`jpn-${ind.name}`}
                indicator={ind}
                isSelected={selected?.region === 'japan' && selected?.idx === i}
                onClick={() => handleCardClick('japan', i)}
              />
            ))}
          </div>
        </div>
      )}

      {selectedIndicator && selected?.region === 'japan' && (
        <ChartPanel
          indicator={selectedIndicator}
          regionLabel={selectedRegionLabel}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Loading skeleton for international data if not yet loaded */}
      {!intlData && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text opacity-50">Loading international data...</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} height="100px" />)}
          </div>
        </div>
      )}

      {/* ── Last Sync Footer ── */}
      <div className="border-t border-white/[0.04] pt-4 mt-2">
        <div className="flex items-center justify-between text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Data current as of{' '}
              {data.lastUpdated
                ? new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : 'unknown'}
            </span>
          </div>
          <span>
            US via Alpha Vantage &middot; EU &amp; Japan via World Bank
          </span>
        </div>
      </div>
    </div>
  );
}

function ChartPanel({ indicator, regionLabel, onClose }: { indicator: EconomicIndicator; regionLabel: string; onClose: () => void }) {
  return (
    <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs text-rh-light-muted dark:text-rh-muted mb-1 uppercase tracking-wide font-medium">
          {regionLabel} &middot; {indicator.name}
          <span className="ml-2 normal-case font-normal opacity-60">
            ({indicator.unit === 'percent' ? '% change' : indicator.unit === 'index' ? 'index value' : indicator.unit === 'current usd' ? 'USD' : indicator.unit})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 -mt-1 -mr-1 rounded text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <FullChart indicator={indicator} />
    </div>
  );
}
