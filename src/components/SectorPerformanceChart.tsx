import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getSectorPerformance, SectorPerformanceResponse } from '../api';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CHART_W = 700;
const CHART_H = 320;
const PAD = { top: 12, right: 6, bottom: 24, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

type Period = '1D' | '1W' | '1M';

// 1D window: 4 AM – 8 PM ET (16 hours) in minutes from midnight ET
const DAY_START_MIN = 4 * 60;
const DAY_END_MIN = 20 * 60;
const DAY_RANGE_MIN = DAY_END_MIN - DAY_START_MIN;
const MARKET_OPEN_MIN = 9 * 60 + 30;

/* ─── Time helpers ───────────────────────────────────────────────────────── */

function toMinutesET(iso: string): number {
  const d = new Date(iso);
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return et.getHours() * 60 + et.getMinutes();
}

/* ─── Color helpers ──────────────────────────────────────────────────────── */

// Bloomberg-style: gold/yellow for top performers, greens for mid-positive,
// reds for negative, dark/black for worst
function getLineColor(rank: number, total: number, changePercent: number): string {
  // Split into positive/neutral/negative groups based on actual change
  if (changePercent > 0.1) {
    // Positive: gold → green spectrum
    if (rank === 0) return '#e8b230';
    if (rank === 1) return '#c9a028';
    return rank <= 3 ? '#22c55e' : '#15803d';
  }
  if (changePercent < -0.1) {
    // Negative: red → dark spectrum
    const negRank = rank - total; // distance from bottom
    if (negRank >= -1) return '#1c1917'; // worst = black
    if (negRank >= -2) return '#292524';
    if (negRank >= -3) return '#7f1d1d';
    return rank >= total - 5 ? '#991b1b' : '#dc2626';
  }
  // Near zero
  return 'rgba(120,120,120,0.5)';
}

function getLeaderboardBg(changePercent: number): string {
  if (changePercent >= 1.5) return 'rgba(0,180,5,0.35)';
  if (changePercent >= 0.5) return 'rgba(0,180,5,0.22)';
  if (changePercent > 0.05) return 'rgba(0,180,5,0.12)';
  if (changePercent > -0.05) return 'rgba(100,100,100,0.08)';
  if (changePercent > -0.5) return 'rgba(220,38,38,0.12)';
  if (changePercent > -1.5) return 'rgba(220,38,38,0.22)';
  return 'rgba(220,38,38,0.35)';
}

function changeColor(pct: number): string {
  return pct > 0.01 ? '#00c805' : pct < -0.01 ? '#ff3b30' : '#999';
}

/* ─── SVG path builders ──────────────────────────────────────────────────── */

function buildTimePath(sparkline: number[], timestamps: string[], yMin: number, yRange: number): string {
  if (sparkline.length === 0 || timestamps.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < sparkline.length; i++) {
    const min = toMinutesET(timestamps[i]);
    const xFrac = (min - DAY_START_MIN) / DAY_RANGE_MIN;
    if (xFrac < 0 || xFrac > 1) continue;
    const x = PAD.left + xFrac * PLOT_W;
    const y = PAD.top + PLOT_H - ((sparkline[i] - yMin) / (yRange || 1)) * PLOT_H;
    parts.push(`${parts.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return parts.join('');
}

/** Non-1D: index-based x-axis — evenly spaced points, no gaps for weekends */
function buildIndexPath(sparkline: number[], yMin: number, yRange: number): string {
  if (sparkline.length === 0) return '';
  const parts: string[] = [];
  const count = sparkline.length;
  for (let i = 0; i < count; i++) {
    const xFrac = count > 1 ? i / (count - 1) : 0.5;
    const x = PAD.left + xFrac * PLOT_W;
    const y = PAD.top + PLOT_H - ((sparkline[i] - yMin) / (yRange || 1)) * PLOT_H;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return parts.join('');
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

interface Props {
  onTickerClick?: (ticker: string) => void;
}

export function SectorPerformanceChart({ onTickerClick }: Props) {
  const [data, setData] = useState<SectorPerformanceResponse | null>(null);
  const [period, setPeriod] = useState<Period>('1D');
  const [loading, setLoading] = useState(true);
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const resp = await getSectorPerformance(p);
      setData(resp);
    } catch (e) {
      console.error('Sector performance fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
    const interval = setInterval(() => fetchData(period), period === '1D' ? 60_000 : 300_000);
    return () => clearInterval(interval);
  }, [period, fetchData]);

  // Y-axis: only compute range + the 0% line position
  const { yMin, yRange } = useMemo((): { yMin: number; yRange: number } => {
    if (!data) return { yMin: -3, yRange: 6 };
    const allValues = [
      ...data.sectors.flatMap(s => s.sparkline),
      ...data.benchmark.sparkline,
      0,
    ];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max((max - min) * 0.15, 0.3);
    const computedMin = min - padding;
    const computedMax = max + padding;
    return { yMin: computedMin, yRange: computedMax - computedMin };
  }, [data]);

  // Y-axis labels: just a few key values (top, 0%, bottom)
  const yLabels = useMemo(() => {
    const labels: { value: number; y: number }[] = [];
    const step = yRange > 8 ? 2 : yRange > 4 ? 1 : 0.5;
    for (let v = Math.ceil(yMin / step) * step; v <= yMin + yRange; v += step) {
      const rounded = Math.round(v * 100) / 100;
      const y = PAD.top + PLOT_H - ((rounded - yMin) / (yRange || 1)) * PLOT_H;
      labels.push({ value: rounded, y });
    }
    return labels;
  }, [yMin, yRange]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * CHART_W;
      if (svgX < PAD.left || svgX > CHART_W - PAD.right) { setHoverX(null); return; }
      setHoverX(svgX);
    },
    [],
  );

  if (loading && !data) {
    return (
      <div className="rounded-xl bg-gray-50/50 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.06] p-4 animate-pulse h-[360px]" />
    );
  }

  if (!data || data.sectors.length === 0) return null;

  // Merge sectors + benchmark into one sorted list for leaderboard
  const allItems = [
    ...data.sectors.map(s => ({ ticker: s.ticker, changePercent: s.changePercent, sparkline: s.sparkline, timestamps: s.timestamps, isBenchmark: false })),
    { ticker: 'SPY', changePercent: data.benchmark.changePercent, sparkline: data.benchmark.sparkline, timestamps: data.benchmark.timestamps, isBenchmark: true },
  ].sort((a, b) => b.changePercent - a.changePercent);

  const pathFor = (sparkline: number[], timestamps: string[]) =>
    period === '1D'
      ? buildTimePath(sparkline, timestamps, yMin, yRange)
      : buildIndexPath(sparkline, yMin, yRange);

  // 0% line y position
  const zeroY = PAD.top + PLOT_H - ((0 - yMin) / (yRange || 1)) * PLOT_H;

  const timeLabels1D = [
    { min: 4 * 60, label: '4 AM' },
    { min: 6 * 60, label: '6 AM' },
    { min: 8 * 60, label: '8 AM' },
    { min: 9 * 60 + 30, label: '9:30' },
    { min: 11 * 60, label: '11 AM' },
    { min: 13 * 60, label: '1 PM' },
    { min: 15 * 60, label: '3 PM' },
    { min: 16 * 60, label: '4 PM' },
    { min: 18 * 60, label: '6 PM' },
    { min: 20 * 60, label: '8 PM' },
  ];

  return (
    <div className="rounded-xl bg-gray-50/50 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Sector Performance</h3>
          <span className="text-[10px] text-gray-400 dark:text-white/30 font-medium">
            {period === '1D' ? 'Today' : period === '1W' ? 'Past Week' : 'Past Month'}
          </span>
        </div>
        <div className="flex gap-0.5 bg-gray-100/60 dark:bg-white/[0.04] rounded-md p-0.5">
          {(['1D', '1W', '1M'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-0.5 text-[10px] font-semibold rounded transition-all ${
                period === p
                  ? 'bg-white dark:bg-white/[0.1] text-rh-green shadow-sm'
                  : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* Chart */}
        <div className="flex-1 min-w-0 px-2 pb-1">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => { setHoverX(null); setHoveredTicker(null); }}
          >
            {/* Only the 0% baseline — no grid clutter */}
            {zeroY >= PAD.top && zeroY <= PAD.top + PLOT_H && (
              <line
                x1={PAD.left} x2={CHART_W - PAD.right}
                y1={zeroY} y2={zeroY}
                stroke="rgba(150,150,150,0.25)"
                strokeWidth={0.6}
                strokeDasharray="4,4"
              />
            )}

            {/* Y-axis labels only */}
            {yLabels.map(({ value, y }) => (
              <text
                key={value}
                x={PAD.left - 4} y={y + 3}
                textAnchor="end"
                className="fill-gray-400 dark:fill-white/25"
                fontSize="8"
                fontFamily="system-ui"
              >
                {value > 0 ? '+' : ''}{value.toFixed(1)}%
              </text>
            ))}

            {/* 1D: Market open line at 9:30 AM */}
            {period === '1D' && (() => {
              const x = PAD.left + ((MARKET_OPEN_MIN - DAY_START_MIN) / DAY_RANGE_MIN) * PLOT_W;
              return (
                <line
                  x1={x} x2={x}
                  y1={PAD.top} y2={PAD.top + PLOT_H}
                  stroke="rgba(0,200,5,0.12)"
                  strokeWidth={0.5}
                  strokeDasharray="3,3"
                />
              );
            })()}

            {/* Sector + benchmark lines */}
            {allItems.map((item, i) => {
              const isHovered = hoveredTicker === item.ticker;
              const anyHovered = hoveredTicker !== null;
              const color = item.isBenchmark
                ? 'rgba(255,255,255,0.5)'
                : getLineColor(i, allItems.length, item.changePercent);
              const opacity = anyHovered ? (isHovered ? 1 : 0.1) : 0.85;
              return (
                <path
                  key={item.ticker}
                  d={pathFor(item.sparkline, item.timestamps)}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHovered ? 2.5 : item.isBenchmark ? 1 : 1.4}
                  opacity={opacity}
                  strokeLinejoin="round"
                  strokeDasharray={item.isBenchmark ? '5,3' : undefined}
                  style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}
                />
              );
            })}

            {/* Hover crosshair */}
            {hoverX !== null && (
              <line
                x1={hoverX} x2={hoverX}
                y1={PAD.top} y2={PAD.top + PLOT_H}
                stroke="rgba(150,150,150,0.25)"
                strokeWidth={0.5}
              />
            )}

            {/* Time labels */}
            {period === '1D' ? (
              timeLabels1D.map(({ min, label }) => {
                const x = PAD.left + ((min - DAY_START_MIN) / DAY_RANGE_MIN) * PLOT_W;
                return (
                  <text
                    key={label}
                    x={x} y={CHART_H - 5}
                    textAnchor="middle"
                    className="fill-gray-400 dark:fill-white/20"
                    fontSize="7"
                    fontFamily="system-ui"
                  >
                    {label}
                  </text>
                );
              })
            ) : (() => {
              // Use the longest sector's timestamps for label positioning (index-based)
              const longestTs = [data.benchmark, ...data.sectors]
                .reduce((a, b) => a.timestamps.length >= b.timestamps.length ? a : b)
                .timestamps;
              if (longestTs.length === 0) return null;
              const count = longestTs.length;
              const indices = [0, Math.floor(count / 4), Math.floor(count / 2), Math.floor(count * 3 / 4), count - 1];
              return indices.map(idx => {
                const xFrac = count > 1 ? idx / (count - 1) : 0.5;
                const x = PAD.left + xFrac * PLOT_W;
                const d = new Date(longestTs[idx]);
                const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <text
                    key={idx}
                    x={x} y={CHART_H - 5}
                    textAnchor="middle"
                    className="fill-gray-400 dark:fill-white/20"
                    fontSize="7"
                    fontFamily="system-ui"
                  >
                    {label}
                  </text>
                );
              });
            })()}
          </svg>
        </div>

        {/* Leaderboard — no scroll, all items visible */}
        <div className="w-[170px] shrink-0 border-l border-gray-200/30 dark:border-white/[0.06] flex flex-col">
          {allItems.map(item => (
            <button
              key={item.ticker}
              className="w-full flex items-center justify-between px-3 flex-1 min-h-0 hover:brightness-125 transition-all cursor-pointer"
              style={{
                background: hoveredTicker === item.ticker
                  ? 'rgba(255,255,255,0.08)'
                  : getLeaderboardBg(item.changePercent),
              }}
              onMouseEnter={() => setHoveredTicker(item.ticker)}
              onMouseLeave={() => setHoveredTicker(null)}
              onClick={() => onTickerClick?.(item.ticker)}
            >
              <span className={`text-[11px] font-bold ${item.isBenchmark ? 'text-gray-300 dark:text-white/40' : 'text-gray-700 dark:text-white/70'}`}>
                {item.ticker}
              </span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: changeColor(item.changePercent) }}>
                {item.changePercent > 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
