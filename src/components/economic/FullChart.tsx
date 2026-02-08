import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { EconomicIndicator } from '../../types';
import { formatValue } from './IndicatorCard';

// Measurement marker type
interface MeasurePoint {
  idx: number;
  x: number;
  y: number;
  date: string;
  value: number;
}

// Full-size interactive chart — styled to match portfolio chart, with click-to-measure
export function FullChart({ indicator }: { indicator: EconomicIndicator }) {
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
      if (isAnnual) return dateStr; // "2024" -> "2024"
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

          {/* -- Measurement overlay -- */}
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

export function ChartPanel({ indicator, regionLabel, onClose }: { indicator: EconomicIndicator; regionLabel: string; onClose: () => void }) {
  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
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
