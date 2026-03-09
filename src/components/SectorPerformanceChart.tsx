import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getSectorPerformance, SectorPerformanceResponse } from '../api';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CHART_W = 600;
const CHART_H = 200;
const PAD = { top: 8, right: 8, bottom: 20, left: 42 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

type Period = '1D' | '1W' | '1M';

/* ─── Color helpers ──────────────────────────────────────────────────────── */

/** Assign line colors: top 3 green shades, bottom 3 red shades, middle gray, benchmark dashed */
function getLineColor(index: number, total: number, changePercent: number): string {
  if (changePercent > 0.5) return index === 0 ? '#00c805' : index === 1 ? '#34d058' : '#6fdd8b';
  if (changePercent < -0.5) {
    const fromBottom = total - 1 - index;
    if (fromBottom === 0) return '#ff3b30';
    if (fromBottom === 1) return '#ff6b6b';
    if (fromBottom === 2) return '#ff9999';
  }
  return 'rgba(150,150,150,0.5)';
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

/* ─── SVG path builder ───────────────────────────────────────────────────── */

function buildPath(sparkline: number[], yMin: number, yRange: number): string {
  if (sparkline.length === 0) return '';
  const xStep = PLOT_W / Math.max(sparkline.length - 1, 1);
  return sparkline
    .map((val, i) => {
      const x = PAD.left + i * xStep;
      const y = PAD.top + PLOT_H - ((val - yMin) / (yRange || 1)) * PLOT_H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join('');
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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
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

  // Compute Y-axis range from all sparklines
  const { yMin, yRange, gridLines } = useMemo((): { yMin: number; yRange: number; gridLines: number[] } => {
    if (!data) return { yMin: -3, yRange: 6, gridLines: [] };
    const allValues = [
      ...data.sectors.flatMap(s => s.sparkline),
      ...data.benchmark.sparkline,
      0,
    ];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max((max - min) * 0.1, 0.5);
    const computedMin = min - padding;
    const computedMax = max + padding;
    const range = computedMax - computedMin;

    // Grid lines at nice intervals
    const step = range > 6 ? 2 : range > 3 ? 1 : 0.5;
    const lines: number[] = [];
    for (let v = Math.ceil(computedMin / step) * step; v <= computedMax; v += step) {
      lines.push(Math.round(v * 100) / 100);
    }
    return { yMin: computedMin, yRange: range, gridLines: lines };
  }, [data]);

  // Hover handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!data || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const relX = x - PAD.left;
      if (relX < 0 || relX > PLOT_W) { setHoverIndex(null); return; }
      const maxLen = Math.max(...data.sectors.map(s => s.sparkline.length), data.benchmark.sparkline.length);
      const idx = Math.round((relX / PLOT_W) * (maxLen - 1));
      setHoverIndex(Math.max(0, Math.min(idx, maxLen - 1)));
    },
    [data],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
    setHoveredTicker(null);
  }, []);

  if (loading && !data) {
    return (
      <div className="rounded-xl bg-gray-50/50 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.06] p-4 animate-pulse h-[260px]" />
    );
  }

  if (!data || data.sectors.length === 0) return null;

  const allSectors = data.sectors;
  const benchmark = data.benchmark;

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
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-all ${
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
        <div className="flex-1 min-w-0 px-2 pb-2">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Grid lines */}
            {gridLines.map(v => {
              const y = PAD.top + PLOT_H - ((v - yMin) / yRange) * PLOT_H;
              return (
                <g key={v}>
                  <line
                    x1={PAD.left} x2={CHART_W - PAD.right}
                    y1={y} y2={y}
                    stroke={v === 0 ? 'rgba(150,150,150,0.3)' : 'rgba(150,150,150,0.1)'}
                    strokeWidth={v === 0 ? 0.8 : 0.5}
                    strokeDasharray={v === 0 ? undefined : '2,3'}
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

            {/* Sector lines */}
            {allSectors.map((sector, i) => {
              const isHovered = hoveredTicker === sector.ticker;
              const anyHovered = hoveredTicker !== null;
              const color = getLineColor(i, allSectors.length, sector.changePercent);
              const opacity = anyHovered ? (isHovered ? 1 : 0.15) : 0.7;
              return (
                <path
                  key={sector.ticker}
                  d={buildPath(sector.sparkline, yMin, yRange)}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHovered ? 2 : 1.2}
                  opacity={opacity}
                  style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}
                />
              );
            })}

            {/* Benchmark line (dashed) */}
            <path
              d={buildPath(benchmark.sparkline, yMin, yRange)}
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1}
              strokeDasharray="4,3"
              opacity={hoveredTicker ? 0.15 : 0.5}
            />

            {/* Hover crosshair */}
            {hoverIndex !== null && (() => {
              const maxLen = Math.max(...allSectors.map(s => s.sparkline.length), benchmark.sparkline.length);
              const x = PAD.left + (hoverIndex / Math.max(maxLen - 1, 1)) * PLOT_W;
              return (
                <line
                  x1={x} x2={x}
                  y1={PAD.top} y2={PAD.top + PLOT_H}
                  stroke="rgba(150,150,150,0.3)"
                  strokeWidth={0.5}
                />
              );
            })()}

            {/* Time labels */}
            {benchmark.timestamps.length > 0 && (() => {
              const ts = benchmark.timestamps;
              const indices = [0, Math.floor(ts.length / 4), Math.floor(ts.length / 2), Math.floor(ts.length * 3 / 4), ts.length - 1];
              return indices.map(idx => {
                const x = PAD.left + (idx / Math.max(ts.length - 1, 1)) * PLOT_W;
                const d = new Date(ts[idx]);
                const label = period === '1D'
                  ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })
                  : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <text
                    key={idx}
                    x={x} y={CHART_H - 4}
                    textAnchor="middle"
                    className="fill-gray-400 dark:fill-white/25"
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
        <div className="w-[160px] shrink-0 border-l border-gray-200/30 dark:border-white/[0.06] py-1 overflow-y-auto max-h-[220px]">
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
