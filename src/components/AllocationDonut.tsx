import { useState, useEffect, useRef, useCallback } from 'react';
import { Holding } from '../types';

interface AllocationDonutProps {
  holdings: Holding[];
  totalValue: number;
  onTickerClick?: (ticker: string) => void;
}

// 24 distinct colors that work well on dark backgrounds, avoiding pure red/green for accessibility
const SEGMENT_COLORS = [
  '#00c805', // rh-green (primary)
  '#5b8def', // cornflower blue
  '#a78bfa', // soft violet
  '#f59e0b', // amber
  '#14b8a6', // teal
  '#f472b6', // pink
  '#38bdf8', // sky blue
  '#c084fc', // purple
  '#fb923c', // orange
  '#34d399', // emerald
  '#818cf8', // indigo
  '#fbbf24', // yellow gold
  '#2dd4bf', // turquoise
  '#e879f9', // fuchsia
  '#60a5fa', // blue
  '#a3e635', // lime
  '#f97316', // deep orange
  '#67e8f9', // cyan
  '#d946ef', // magenta
  '#4ade80', // green mint
  '#93c5fd', // light blue
  '#fcd34d', // sunflower
  '#c4b5fd', // lavender
  '#fb7185', // rose
];

interface Segment {
  ticker: string;
  value: number;
  percent: number;
  color: string;
  dashArray: string;
  dashOffset: number;
  tickers?: string[]; // for "Other" grouping
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyPrecise(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function AllocationDonut({ holdings, totalValue, onTickerClick }: AllocationDonutProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // SVG donut parameters
  const size = 220;
  const strokeWidth = 32;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Build segments: sort by value descending, group <2% into "Other"
  const sortedHoldings = [...holdings]
    .filter(h => h.currentValue > 0)
    .sort((a, b) => b.currentValue - a.currentValue);

  const total = totalValue > 0 ? totalValue : sortedHoldings.reduce((s, h) => s + h.currentValue, 0);

  const majorHoldings: { ticker: string; value: number; percent: number }[] = [];
  const minorHoldings: { ticker: string; value: number; percent: number }[] = [];

  sortedHoldings.forEach(h => {
    const pct = total > 0 ? (h.currentValue / total) * 100 : 0;
    if (pct >= 2) {
      majorHoldings.push({ ticker: h.ticker, value: h.currentValue, percent: pct });
    } else {
      minorHoldings.push({ ticker: h.ticker, value: h.currentValue, percent: pct });
    }
  });

  // Build final segment list
  const segmentData: { ticker: string; value: number; percent: number; tickers?: string[] }[] = [
    ...majorHoldings,
  ];

  if (minorHoldings.length > 0) {
    const otherValue = minorHoldings.reduce((s, h) => s + h.value, 0);
    const otherPct = minorHoldings.reduce((s, h) => s + h.percent, 0);
    segmentData.push({
      ticker: 'Other',
      value: otherValue,
      percent: otherPct,
      tickers: minorHoldings.map(h => h.ticker),
    });
  }

  // Calculate SVG segments using stroke-dasharray/dashoffset
  const GAP_DEGREES = segmentData.length > 1 ? 1.5 : 0; // gap between segments in degrees
  const totalGapDegrees = GAP_DEGREES * segmentData.length;
  const availableDegrees = 360 - totalGapDegrees;

  let cumulativeOffset = 0;
  const segments: Segment[] = segmentData.map((seg, i) => {
    const segDegrees = (seg.percent / 100) * availableDegrees;
    const segLength = (segDegrees / 360) * circumference;

    const dashArray = `${segLength} ${circumference - segLength}`;
    // Offset: start from top (-90 degrees), then accumulate
    const startAngleLength = (cumulativeOffset / 360) * circumference;
    const dashOffset = circumference * 0.25 - startAngleLength; // 0.25 = 90 degrees rotation to start at top

    cumulativeOffset += segDegrees + GAP_DEGREES;

    return {
      ticker: seg.ticker,
      value: seg.value,
      percent: seg.percent,
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
      dashArray,
      dashOffset,
      tickers: seg.tickers,
    };
  });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const hoveredSegment = hoveredIndex !== null ? segments[hoveredIndex] : null;

  if (sortedHoldings.length === 0) {
    return (
      <div className="bg-white border border-gray-200/60 rounded-2xl shadow-sm dark:bg-white/[0.04] dark:backdrop-blur-sm dark:border-white/[0.06] dark:shadow-none p-6 text-center">
        <p className="text-rh-light-muted dark:text-rh-muted text-sm">No holdings to display</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative bg-white border border-gray-200/60 rounded-2xl shadow-sm
        dark:bg-white/[0.04] dark:backdrop-blur-sm dark:border-white/[0.06] dark:shadow-none
        p-5"
      onMouseMove={handleMouseMove}
    >
      {/* Header + Concentration Summary */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted/70">
          Portfolio Allocation
        </h3>
        {segments.length >= 3 && (
          <span className="text-[10px] text-rh-light-muted dark:text-rh-muted/60">
            Top 3 = {segments.slice(0, 3).reduce((s, seg) => s + seg.percent, 0).toFixed(1)}% of portfolio
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-4">
        {/* Donut Chart */}
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            className="transform -rotate-0"
          >
            {/* Background ring */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-gray-100 dark:text-white/[0.06]"
            />

            {/* Segments */}
            {segments.map((seg, i) => (
              <circle
                key={seg.ticker}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={hoveredIndex === i ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="butt"
                className="cursor-pointer"
                style={{
                  transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke-width 0.15s ease, opacity 0.15s ease',
                  strokeDashoffset: mounted ? seg.dashOffset : circumference * 0.25,
                  opacity: hoveredIndex !== null && hoveredIndex !== i ? 0.4 : 1,
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => {
                  if (onTickerClick && seg.ticker !== 'Other') {
                    onTickerClick(seg.ticker);
                  }
                }}
              />
            ))}
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {hoveredSegment ? (
              <>
                <span className="text-sm font-bold text-rh-light-text dark:text-rh-text leading-tight">
                  {hoveredSegment.ticker}
                </span>
                <span className="text-lg font-bold text-rh-light-text dark:text-rh-text leading-tight mt-0.5">
                  {formatCurrencyPrecise(hoveredSegment.value)}
                </span>
                <span className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">
                  {hoveredSegment.percent.toFixed(1)}%
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted/60">
                  Total
                </span>
                <span className="text-lg font-bold text-rh-light-text dark:text-rh-text leading-tight mt-0.5">
                  {formatCurrency(total)}
                </span>
                <span className="text-[10px] text-rh-light-muted dark:text-rh-muted/50 mt-0.5">
                  {sortedHoldings.length} holding{sortedHoldings.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="w-full">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {segments.map((seg, i) => (
              <button
                key={seg.ticker}
                className={`flex items-center gap-2 px-2 py-1 rounded-lg text-left transition-all duration-150
                  ${seg.ticker !== 'Other' ? 'cursor-pointer hover:bg-gray-100/80 dark:hover:bg-white/[0.06]' : 'cursor-default'}
                  ${hoveredIndex === i ? 'bg-gray-100/80 dark:bg-white/[0.06]' : ''}`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => {
                  if (onTickerClick && seg.ticker !== 'Other') {
                    onTickerClick(seg.ticker);
                  }
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-xs font-medium text-rh-light-text dark:text-rh-text truncate">
                  {seg.ticker}
                </span>
                <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40 ml-auto flex-shrink-0 tabular-nums">
                  {formatCurrency(seg.value)}
                </span>
                <span className="text-[10px] text-rh-light-muted dark:text-rh-muted flex-shrink-0 tabular-nums w-10 text-right">
                  {seg.percent.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating tooltip */}
      {hoveredSegment && tooltipPos && (
        <div
          className="absolute z-50 pointer-events-none px-3 py-2 rounded-lg shadow-lg
            bg-gray-900/95 dark:bg-black/90 border border-white/10 backdrop-blur-sm"
          style={{
            left: Math.min(tooltipPos.x + 12, (containerRef.current?.clientWidth || 300) - 160),
            top: tooltipPos.y - 60,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: hoveredSegment.color }}
            />
            <span className="text-xs font-bold text-white">
              {hoveredSegment.ticker}
            </span>
          </div>
          <div className="text-xs text-gray-300">
            {formatCurrencyPrecise(hoveredSegment.value)}
          </div>
          <div className="text-[10px] text-gray-400">
            {hoveredSegment.percent.toFixed(2)}% of portfolio
          </div>
          {hoveredSegment.tickers && (
            <div className="text-[10px] text-gray-500 mt-1 max-w-[140px] truncate">
              {hoveredSegment.tickers.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
