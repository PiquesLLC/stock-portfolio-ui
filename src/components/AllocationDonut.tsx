import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Holding } from '../types';

interface AllocationDonutProps {
  holdings: Holding[];
  totalValue: number;
  onTickerClick?: (ticker: string) => void;
  title?: string;
  maxSlices?: number;
}

const SEGMENT_COLORS = [
  '#00c805', '#5b8def', '#a78bfa', '#f59e0b', '#14b8a6', '#f472b6',
  '#38bdf8', '#c084fc', '#fb923c', '#34d399', '#818cf8', '#fbbf24',
  '#2dd4bf', '#e879f9', '#60a5fa', '#a3e635', '#f97316', '#67e8f9',
  '#d946ef', '#4ade80', '#93c5fd', '#fcd34d', '#c4b5fd', '#fb7185',
];

interface Constituent {
  ticker: string;
  percent: number;
  value: number;
}

interface Segment {
  ticker: string;
  value: number;
  percent: number;
  color: string;
  dashArray: string;
  dashOffset: number;
  midAngle: number;
  tickers?: string[];
  constituents?: Constituent[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

/**
 * Resolve label collisions per side.
 * Uses center-anchored spreading: compute ideal center, then push apart from there.
 */
function resolveCollisions(
  labels: { index: number; x: number; y: number; isRight: boolean }[],
  minGap: number,
  minY: number,
  maxY: number,
): { index: number; x: number; y: number; isRight: boolean }[] {
  const left = labels.filter(l => !l.isRight).sort((a, b) => a.y - b.y);
  const right = labels.filter(l => l.isRight).sort((a, b) => a.y - b.y);

  function spread(group: typeof labels) {
    if (group.length === 0) return;

    // First pass: push overlapping labels down
    for (let i = 1; i < group.length; i++) {
      if (group[i].y - group[i - 1].y < minGap) {
        group[i].y = group[i - 1].y + minGap;
      }
    }

    // Center the group vertically if it overflows
    const totalSpan = group[group.length - 1].y - group[0].y;
    const centerTarget = (minY + maxY) / 2;
    const currentCenter = group[0].y + totalSpan / 2;
    const shift = centerTarget - currentCenter;

    // Only center-shift if the group would otherwise be lopsided
    if (Math.abs(shift) > 20) {
      const clampedShift = Math.max(minY - group[0].y, Math.min(maxY - group[group.length - 1].y, shift * 0.5));
      for (const l of group) l.y += clampedShift;
    }

    // Clamp bounds
    if (group[group.length - 1].y > maxY) {
      const overflow = group[group.length - 1].y - maxY;
      for (const l of group) l.y -= overflow;
    }
    if (group[0].y < minY) {
      const s = minY - group[0].y;
      for (const l of group) l.y += s;
    }

    // Final pass: re-enforce min gap after shifting
    for (let i = 1; i < group.length; i++) {
      if (group[i].y - group[i - 1].y < minGap) {
        group[i].y = group[i - 1].y + minGap;
      }
    }
  }

  spread(left);
  spread(right);
  return [...left, ...right];
}

const LABEL_THRESHOLD = 1.5;

export function AllocationDonut({ holdings, totalValue, onTickerClick, title = 'Portfolio Allocation', maxSlices = 10 }: AllocationDonutProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const touchActive = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Bigger canvas for longer leader lines with breathing room
  const svgSize = 460;
  const strokeWidth = 40;
  const donutRadius = 110;
  const circumference = 2 * Math.PI * donutRadius;
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  const sortedHoldings = useMemo(() =>
    [...holdings].filter(h => h.currentValue > 0).sort((a, b) => b.currentValue - a.currentValue),
    [holdings],
  );

  const total = totalValue > 0 ? totalValue : sortedHoldings.reduce((s, h) => s + h.currentValue, 0);

  const segments: Segment[] = useMemo(() => {
    const allWithPct = sortedHoldings.map(h => ({
      ticker: h.ticker,
      value: h.currentValue,
      percent: total > 0 ? (h.currentValue / total) * 100 : 0,
    }));

    const majorHoldings: typeof allWithPct = [];
    const minorHoldings: typeof allWithPct = [];

    allWithPct.forEach((h, i) => {
      if (i < maxSlices && h.percent >= 1.5) {
        majorHoldings.push(h);
      } else {
        minorHoldings.push(h);
      }
    });

    const segmentData: { ticker: string; value: number; percent: number; tickers?: string[]; constituents?: Constituent[] }[] = [
      ...majorHoldings,
    ];

    if (minorHoldings.length > 0) {
      segmentData.push({
        ticker: 'Other',
        value: minorHoldings.reduce((s, h) => s + h.value, 0),
        percent: minorHoldings.reduce((s, h) => s + h.percent, 0),
        tickers: minorHoldings.map(h => h.ticker),
        constituents: minorHoldings.sort((a, b) => b.value - a.value).map(h => ({
          ticker: h.ticker, percent: h.percent, value: h.value,
        })),
      });
    }

    const GAP_DEGREES = segmentData.length > 1 ? 1.5 : 0;
    const totalGapDegrees = GAP_DEGREES * segmentData.length;
    const availableDegrees = 360 - totalGapDegrees;

    let cumulative = 0;
    return segmentData.map((seg, i) => {
      const segDegrees = (seg.percent / 100) * availableDegrees;
      const segLength = (segDegrees / 360) * circumference;
      const dashArray = `${segLength} ${circumference - segLength}`;
      const startAngleLength = (cumulative / 360) * circumference;
      const dashOffset = circumference * 0.25 - startAngleLength;
      const midAngle = cumulative + segDegrees / 2;
      cumulative += segDegrees + GAP_DEGREES;

      return {
        ticker: seg.ticker, value: seg.value, percent: seg.percent,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
        dashArray, dashOffset, midAngle, tickers: seg.tickers,
        constituents: seg.constituents,
      };
    });
  }, [sortedHoldings, total, maxSlices, circumference]);

  // Leader line geometry — longer lines for breathing room
  const outerEdge = donutRadius + strokeWidth / 2;
  const elbowExtend = 30;  // longer radial extension
  const lineExtend = 24;   // longer horizontal tail

  const labelPositions = useMemo(() => {
    const eligible = segments
      .map((seg, i) => ({ seg, i }))
      .filter(({ seg }) => seg.percent >= LABEL_THRESHOLD);

    const raw = eligible.map(({ seg, i }) => {
      const angleRad = (seg.midAngle - 90) * (Math.PI / 180);
      const ox = cx + outerEdge * Math.cos(angleRad);
      const oy = cy + outerEdge * Math.sin(angleRad);
      const elbowR = outerEdge + elbowExtend;
      const ex = cx + elbowR * Math.cos(angleRad);
      const ey = cy + elbowR * Math.sin(angleRad);
      const isRight = seg.midAngle < 180;
      // Horizontal anchor extends to near the edge of the SVG
      const anchorX = isRight
        ? Math.max(ex + lineExtend, svgSize * 0.62)
        : Math.min(ex - lineExtend, svgSize * 0.38);

      return { index: i, ox, oy, ex, ey, x: anchorX, y: ey, isRight };
    });

    const resolved = resolveCollisions(
      raw.map(r => ({ index: r.index, x: r.x, y: r.y, isRight: r.isRight })),
      20,  // min 20px vertical gap between labels
      20,
      svgSize - 20,
    );

    const resolvedMap = new Map(resolved.map(r => [r.index, r]));
    return raw.map(r => {
      const res = resolvedMap.get(r.index)!;
      return { ...r, y: res.y };
    });
  }, [segments, cx, cy, outerEdge, svgSize]);

  const hoveredSegment = hoveredIndex !== null ? segments[hoveredIndex] : null;

  // Precompute segment angle ranges for touch hit-testing
  const segmentAngles = useMemo(() => {
    const GAP_DEGREES = segments.length > 1 ? 1.5 : 0;
    const totalGapDegrees = GAP_DEGREES * segments.length;
    const availableDegrees = 360 - totalGapDegrees;
    const ranges: { start: number; end: number }[] = [];
    let cum = 0;
    for (const seg of segments) {
      const deg = (seg.percent / 100) * availableDegrees;
      ranges.push({ start: cum, end: cum + deg });
      cum += deg + GAP_DEGREES;
    }
    return ranges;
  }, [segments]);

  // Convert a touch event to a segment index
  const touchToSegment = useCallback((touch: { clientX: number; clientY: number }): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    // Map touch pixel coords to SVG viewBox coords
    const scaleX = svgSize / rect.width;
    const scaleY = svgSize / rect.height;
    const sx = (touch.clientX - rect.left) * scaleX;
    const sy = (touch.clientY - rect.top) * scaleY;
    const dx = sx - cx;
    const dy = sy - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Only register if touch is near the donut ring (generous tolerance)
    const innerR = donutRadius - strokeWidth / 2 - 20;
    const outerR = donutRadius + strokeWidth / 2 + 20;
    if (dist < innerR || dist > outerR) return null;
    // Angle from 12 o'clock, clockwise, 0–360
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    for (let i = 0; i < segmentAngles.length; i++) {
      if (angle >= segmentAngles[i].start && angle < segmentAngles[i].end) return i;
    }
    return null;
  }, [svgSize, cx, cy, donutRadius, strokeWidth, segmentAngles]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const idx = touchToSegment(e.touches[0]);
    if (idx != null) {
      touchActive.current = true;
      setHoveredIndex(idx);
      e.preventDefault(); // prevent scroll while scrubbing
    }
  }, [touchToSegment]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchActive.current) return;
    e.preventDefault();
    const idx = touchToSegment(e.touches[0]);
    if (idx != null) setHoveredIndex(idx);
  }, [touchToSegment]);

  const handleTouchEnd = useCallback(() => {
    touchActive.current = false;
    setHoveredIndex(null);
  }, []);

  if (sortedHoldings.length === 0) {
    return (
      <div className="bg-white border border-gray-200/60 rounded-2xl shadow-sm dark:bg-white/[0.04] dark:backdrop-blur-sm dark:border-white/[0.06] dark:shadow-none p-6 text-center">
        <p className="text-rh-light-muted dark:text-rh-muted text-sm">No holdings to display</p>
      </div>
    );
  }

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const lineColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  const labelBoldColor = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.82)';
  const pctColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';


  return (
    <div
      ref={containerRef}
      className="relative bg-white border border-gray-200/60 rounded-2xl shadow-sm
        dark:bg-white/[0.04] dark:backdrop-blur-sm dark:border-white/[0.06] dark:shadow-none
        p-5"
    >
      {/* Header + Concentration Summary */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </h3>
        {segments.length >= 3 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Top 3 = {segments.slice(0, 3).reduce((s, seg) => s + seg.percent, 0).toFixed(1)}% of portfolio
          </span>
        )}
      </div>

      {/* Donut Chart */}
      <div className="flex justify-center">
        <div className="relative" style={{ width: isMobile ? 260 : svgSize, height: isMobile ? 260 : svgSize, maxWidth: '100%' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            width="100%"
            height="100%"
            style={{ overflow: 'visible', touchAction: 'none' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            {/* Background ring */}
            <circle
              cx={cx} cy={cy} r={donutRadius}
              fill="none" stroke="currentColor" strokeWidth={strokeWidth}
              className="text-gray-100 dark:text-white/[0.06]"
            />

            {/* Donut segments */}
            {segments.map((seg, i) => (
              <circle
                key={seg.ticker}
                cx={cx} cy={cy} r={donutRadius}
                fill="none" stroke={seg.color}
                strokeWidth={hoveredIndex === i ? strokeWidth + 6 : strokeWidth}
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="butt"
                className="cursor-pointer"
                style={{
                  transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke-width 0.15s ease, opacity 0.15s ease',
                  strokeDashoffset: mounted ? seg.dashOffset : circumference * 0.25,
                  opacity: hoveredIndex !== null && hoveredIndex !== i ? 0.3 : 1,
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => {
                  if (onTickerClick && seg.ticker !== 'Other') onTickerClick(seg.ticker);
                }}
              />
            ))}

            {/* Leader lines + external labels (desktop only) */}
            {!isMobile && labelPositions.map((lp) => {
              const seg = segments[lp.index];
              const isHovered = hoveredIndex === lp.index;
              const dimmed = hoveredIndex !== null && hoveredIndex !== lp.index;

              return (
                <g
                  key={seg.ticker}
                  style={{ opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.15s ease' }}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(lp.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => {
                    if (onTickerClick && seg.ticker !== 'Other') onTickerClick(seg.ticker);
                  }}
                >
                  {/* Leader line: donut edge → elbow → horizontal anchor */}
                  <polyline
                    points={`${lp.ox},${lp.oy} ${lp.ex},${lp.ey} ${lp.x},${lp.y}`}
                    fill="none"
                    stroke={isHovered ? seg.color : lineColor}
                    strokeWidth={isHovered ? 1.5 : 0.8}
                    style={{ transition: 'stroke 0.15s' }}
                  />
                  {/* Dot at donut edge */}
                  <circle cx={lp.ox} cy={lp.oy} r={2.5} fill={seg.color} />
                  {/* Ticker */}
                  <text
                    x={lp.isRight ? lp.x + 6 : lp.x - 6}
                    y={lp.y - 2}
                    textAnchor={lp.isRight ? 'start' : 'end'}
                    fontSize={12} fontWeight={isHovered ? 700 : 600}
                    fill={isHovered ? seg.color : labelBoldColor}
                    style={{ fontFamily: 'system-ui, -apple-system, sans-serif', transition: 'fill 0.15s' }}
                  >
                    {seg.ticker}
                  </text>
                  {/* Percentage */}
                  <text
                    x={lp.isRight ? lp.x + 6 : lp.x - 6}
                    y={lp.y + 12}
                    textAnchor={lp.isRight ? 'start' : 'end'}
                    fontSize={10} fontWeight={400}
                    fill={isHovered ? seg.color : pctColor}
                    style={{ fontFamily: 'system-ui, -apple-system, sans-serif', transition: 'fill 0.15s' }}
                  >
                    {seg.percent.toFixed(1)}%
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Center detail card — inset-0 auto-centers within the container */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          >
            {hoveredSegment ? (
              <div className="flex flex-col items-center text-center">
                <span className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-rh-light-text dark:text-rh-text leading-tight tracking-tight`}>
                  {hoveredSegment.ticker}
                </span>
                <span className={`${isMobile ? 'text-base' : 'text-2xl'} font-bold text-rh-light-text dark:text-rh-text leading-tight mt-0.5`}>
                  {hoveredSegment.percent.toFixed(1)}%
                </span>
                <div className={`${isMobile ? 'mt-0.5 text-[9px]' : 'mt-2 text-[11px]'} space-y-0.5`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-400 dark:text-gray-500">Value</span>
                    <span className="text-rh-light-text dark:text-rh-text font-medium">{formatCompact(hoveredSegment.value)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <span className={`${isMobile ? 'text-[8px]' : 'text-[10px]'} font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500`}>
                  Total
                </span>
                <span className={`${isMobile ? 'text-base' : 'text-2xl'} font-bold text-rh-light-text dark:text-rh-text leading-tight mt-0.5`}>
                  {formatCurrency(total)}
                </span>
                <span className={`${isMobile ? 'text-[9px]' : 'text-[11px]'} text-gray-400 dark:text-gray-500 mt-0.5`}>
                  {sortedHoldings.length} holding{sortedHoldings.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* "Other" breakdown panel — always mounted, animated in/out */}
      {(() => {
        const otherSeg = segments.find(s => s.ticker === 'Other');
        if (!otherSeg?.constituents) return null;
        const isVisible = hoveredSegment?.ticker === 'Other';
        const MAX_SHOW = isMobile ? 5 : 8;
        const items = otherSeg.constituents.slice(0, MAX_SHOW);
        const remaining = otherSeg.constituents.length - MAX_SHOW;
        const otherIdx = segments.findIndex(s => s.ticker === 'Other');
        return (
          <div
            className={`${isMobile ? '' : 'absolute right-5 top-1/2 -translate-y-1/2'}
              bg-white border border-gray-200/60 rounded-xl shadow-lg
              dark:bg-[#1a1a1e]/95 dark:border-white/[0.08] dark:shadow-black/40
              px-4 py-3 z-10`}
            style={{
              ...(!isMobile ? { minWidth: 160 } : {}),
              opacity: isVisible ? 1 : 0,
              transform: isVisible
                ? (isMobile ? 'translateY(0)' : 'translateY(-50%) translateX(0)')
                : (isMobile ? 'translateY(-6px)' : 'translateY(-50%) translateX(8px)'),
              pointerEvents: isVisible ? 'auto' : 'none',
              transition: 'opacity 130ms ease, transform 130ms ease',
              ...(isMobile && !isVisible ? { height: 0, overflow: 'hidden', padding: 0, margin: 0, border: 'none' } : {}),
              ...(isMobile && isVisible ? { marginTop: 12 } : {}),
            }}
            onMouseEnter={() => setHoveredIndex(otherIdx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              Other ({otherSeg.constituents.length})
            </div>
            <div className="space-y-1.5">
              {items.map(c => (
                <button
                  key={c.ticker}
                  className="flex items-center justify-between w-full text-left hover:bg-gray-50 dark:hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
                  onClick={() => onTickerClick?.(c.ticker)}
                >
                  <span className="text-xs font-medium text-rh-light-text dark:text-rh-text">
                    {c.ticker}
                  </span>
                  <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400 ml-4">
                    {c.percent.toFixed(1)}%
                  </span>
                </button>
              ))}
            </div>
            {remaining > 0 && (
              <div className="mt-2 pt-1.5 border-t border-gray-100 dark:border-white/[0.06] text-[10px] text-gray-400 dark:text-gray-500">
                +{remaining} more
              </div>
            )}
          </div>
        );
      })()}

      {/* Mobile: compact legend list below */}
      {isMobile && (
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {segments.map((seg, i) => (
            <button
              key={seg.ticker}
              className={`flex items-center gap-2 px-2 py-1 rounded-lg text-left transition-all duration-150
                ${seg.ticker !== 'Other' ? 'cursor-pointer hover:bg-gray-100/80 dark:hover:bg-white/[0.06]' : 'cursor-default'}
                ${hoveredIndex === i ? 'bg-gray-100/80 dark:bg-white/[0.06]' : ''}`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => {
                if (onTickerClick && seg.ticker !== 'Other') onTickerClick(seg.ticker);
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-xs font-medium text-rh-light-text dark:text-rh-text truncate">{seg.ticker}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-auto flex-shrink-0 tabular-nums w-10 text-right">
                {seg.percent.toFixed(1)}%
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
