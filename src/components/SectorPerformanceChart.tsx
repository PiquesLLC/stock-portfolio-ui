import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getSectorPerformance, SectorPerformanceResponse } from '../api';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CHART_W = 700;
const CHART_H = 260;
const PAD = { top: 10, right: 10, bottom: 22, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

type Period = '1D' | '1W' | '1M';

// 1D window: 4 AM – 8 PM ET (16 hours) in minutes from midnight ET
const DAY_START_MIN = 4 * 60;   // 4:00 AM ET
const DAY_END_MIN = 20 * 60;    // 8:00 PM ET
const DAY_RANGE_MIN = DAY_END_MIN - DAY_START_MIN; // 960 minutes
const MARKET_OPEN_MIN = 9 * 60 + 30; // 9:30 AM ET

/* ─── Time helpers ───────────────────────────────────────────────────────── */

/** Convert ISO timestamp to minutes since midnight ET */
function toMinutesET(iso: string): number {
  const d = new Date(iso);
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return et.getHours() * 60 + et.getMinutes();
}

/** Convert ISO timestamp to ms epoch */
function toMs(iso: string): number {
  return new Date(iso).getTime();
}

/* ─── Color helpers ──────────────────────────────────────────────────────── */

function getLineColor(index: number, _total: number, changePercent: number): string {
  if (changePercent > 0.3) return index === 0 ? '#00c805' : index === 1 ? '#34d058' : '#6fdd8b';
  if (changePercent < -0.3) {
    if (index >= _total - 1) return '#ff3b30';
    if (index >= _total - 2) return '#ff6b6b';
    if (index >= _total - 3) return '#ff9999';
  }
  return 'rgba(150,150,150,0.45)';
}

function getLeaderboardBg(changePercent: number): string {
  if (changePercent >= 1.5) return 'rgba(0,200,5,0.25)';
  if (changePercent >= 0.5) return 'rgba(0,200,5,0.15)';
  if (changePercent > 0) return 'rgba(0,200,5,0.07)';
  if (changePercent > -0.5) return 'rgba(255,59,48,0.07)';
  if (changePercent > -1.5) return 'rgba(255,59,48,0.15)';
  return 'rgba(255,59,48,0.25)';
}

function changeColor(pct: number): string {
  return pct > 0 ? '#00c805' : pct < 0 ? '#ff3b30' : '#999';
}

/* ─── SVG path builders ──────────────────────────────────────────────────── */

/** 1D: time-based x-axis mapped to 4 AM – 8 PM ET window */
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

/** Non-1D: epoch-based x-axis (min/max from all timestamps) */
function buildEpochPath(sparkline: number[], timestamps: string[], epochMin: number, epochRange: number, yMin: number, yRange: number): string {
  if (sparkline.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < sparkline.length; i++) {
    const ms = toMs(timestamps[i]);
    const xFrac = epochRange > 0 ? (ms - epochMin) / epochRange : 0;
    const x = PAD.left + Math.max(0, Math.min(1, xFrac)) * PLOT_W;
    const y = PAD.top + PLOT_H - ((sparkline[i] - yMin) / (yRange || 1)) * PLOT_H;
    parts.push(`${parts.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
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

  // Y-axis range
  const { yMin, yRange, gridLines } = useMemo((): { yMin: number; yRange: number; gridLines: number[] } => {
    if (!data) return { yMin: -3, yRange: 6, gridLines: [] };
    const allValues = [
      ...data.sectors.flatMap(s => s.sparkline),
      ...data.benchmark.sparkline,
      0,
    ];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max((max - min) * 0.12, 0.3);
    const computedMin = min - padding;
    const computedMax = max + padding;
    const range = computedMax - computedMin;
    const step = range > 8 ? 2 : range > 4 ? 1 : 0.5;
    const lines: number[] = [];
    for (let v = Math.ceil(computedMin / step) * step; v <= computedMax; v += step) {
      lines.push(Math.round(v * 100) / 100);
    }
    return { yMin: computedMin, yRange: range, gridLines: lines };
  }, [data]);

  // Epoch range for non-1D
  const { epochMin, epochRange } = useMemo(() => {
    if (!data || period === '1D') return { epochMin: 0, epochRange: 1 };
    const allTs = [
      ...data.sectors.flatMap(s => s.timestamps),
      ...data.benchmark.timestamps,
    ].map(toMs).filter(Number.isFinite);
    if (allTs.length === 0) return { epochMin: 0, epochRange: 1 };
    const mn = Math.min(...allTs);
    const mx = Math.max(...allTs);
    return { epochMin: mn, epochRange: Math.max(mx - mn, 1) };
  }, [data, period]);

  // Hover
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
      <div className="rounded-xl bg-gray-50/50 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.06] p-4 animate-pulse h-[300px]" />
    );
  }

  if (!data || data.sectors.length === 0) return null;

  const allSectors = data.sectors;
  const benchmark = data.benchmark;

  // Build path function based on period
  const pathFor = (sparkline: number[], timestamps: string[]) =>
    period === '1D'
      ? buildTimePath(sparkline, timestamps, yMin, yRange)
      : buildEpochPath(sparkline, timestamps, epochMin, epochRange, yMin, yRange);

  // 1D time labels: fixed positions across the 4 AM – 8 PM window
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
            {/* Grid lines */}
            {gridLines.map(v => {
              const y = PAD.top + PLOT_H - ((v - yMin) / yRange) * PLOT_H;
              return (
                <g key={v}>
                  <line
                    x1={PAD.left} x2={CHART_W - PAD.right}
                    y1={y} y2={y}
                    stroke={v === 0 ? 'rgba(150,150,150,0.35)' : 'rgba(150,150,150,0.08)'}
                    strokeWidth={v === 0 ? 0.8 : 0.5}
                    strokeDasharray={v === 0 ? undefined : '3,4'}
                  />
                  <text
                    x={PAD.left - 4} y={y + 3}
                    textAnchor="end"
                    className="fill-gray-400 dark:fill-white/25"
                    fontSize="8"
                    fontFamily="system-ui"
                  >
                    {v > 0 ? '+' : ''}{v.toFixed(1)}%
                  </text>
                </g>
              );
            })}

            {/* 1D: Market open line at 9:30 AM */}
            {period === '1D' && (() => {
              const x = PAD.left + ((MARKET_OPEN_MIN - DAY_START_MIN) / DAY_RANGE_MIN) * PLOT_W;
              return (
                <line
                  x1={x} x2={x}
                  y1={PAD.top} y2={PAD.top + PLOT_H}
                  stroke="rgba(0,200,5,0.15)"
                  strokeWidth={0.5}
                  strokeDasharray="3,3"
                />
              );
            })()}

            {/* Sector lines */}
            {allSectors.map((sector, i) => {
              const isHovered = hoveredTicker === sector.ticker;
              const anyHovered = hoveredTicker !== null;
              const color = getLineColor(i, allSectors.length, sector.changePercent);
              const opacity = anyHovered ? (isHovered ? 1 : 0.12) : 0.75;
              return (
                <path
                  key={sector.ticker}
                  d={pathFor(sector.sparkline, sector.timestamps)}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHovered ? 2.2 : 1.2}
                  opacity={opacity}
                  strokeLinejoin="round"
                  style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}
                />
              );
            })}

            {/* Benchmark line (dashed white) */}
            <path
              d={pathFor(benchmark.sparkline, benchmark.timestamps)}
              fill="none"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={1.2}
              strokeDasharray="5,3"
              opacity={hoveredTicker ? 0.12 : 0.55}
              strokeLinejoin="round"
            />

            {/* Hover crosshair */}
            {hoverX !== null && (
              <line
                x1={hoverX} x2={hoverX}
                y1={PAD.top} y2={PAD.top + PLOT_H}
                stroke="rgba(150,150,150,0.3)"
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
              // Non-1D: pick 5 evenly spaced labels from all timestamps
              const allTs = [...new Set([...data.sectors.flatMap(s => s.timestamps), ...benchmark.timestamps])].sort();
              if (allTs.length === 0) return null;
              const indices = [0, Math.floor(allTs.length / 4), Math.floor(allTs.length / 2), Math.floor(allTs.length * 3 / 4), allTs.length - 1];
              return indices.map(idx => {
                const ms = toMs(allTs[idx]);
                const xFrac = (ms - epochMin) / epochRange;
                const x = PAD.left + xFrac * PLOT_W;
                const d = new Date(allTs[idx]);
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

        {/* Leaderboard */}
        <div className="w-[150px] shrink-0 border-l border-gray-200/30 dark:border-white/[0.06] py-0.5 overflow-y-auto max-h-[270px]">
          {/* Benchmark row */}
          <button
            className="w-full flex items-center justify-between px-2.5 py-[3px] text-[10px] font-semibold border-b border-gray-200/20 dark:border-white/[0.04] hover:bg-gray-100/50 dark:hover:bg-white/[0.03] transition-colors"
            style={{ background: getLeaderboardBg(benchmark.changePercent) }}
            onMouseEnter={() => setHoveredTicker('SPY')}
            onMouseLeave={() => setHoveredTicker(null)}
            onClick={() => onTickerClick?.('SPY')}
          >
            <span className="text-gray-500 dark:text-white/50">SPY</span>
            <span style={{ color: changeColor(benchmark.changePercent) }}>
              {benchmark.changePercent > 0 ? '+' : ''}{benchmark.changePercent.toFixed(2)}%
            </span>
          </button>

          {/* Sector rows */}
          {allSectors.map(sector => (
            <button
              key={sector.ticker}
              className="w-full flex items-center justify-between px-2.5 py-[3px] text-[10px] hover:bg-gray-100/50 dark:hover:bg-white/[0.03] transition-colors"
              style={{ background: hoveredTicker === sector.ticker ? 'rgba(255,255,255,0.06)' : getLeaderboardBg(sector.changePercent) }}
              onMouseEnter={() => setHoveredTicker(sector.ticker)}
              onMouseLeave={() => setHoveredTicker(null)}
              onClick={() => onTickerClick?.(sector.ticker)}
            >
              <span className="text-gray-600 dark:text-white/60 font-semibold truncate mr-1">{sector.ticker}</span>
              <span className="font-bold tabular-nums whitespace-nowrap" style={{ color: changeColor(sector.changePercent) }}>
                {sector.changePercent > 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
