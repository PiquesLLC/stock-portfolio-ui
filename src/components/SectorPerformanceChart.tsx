import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getSectorPerformance, SectorPerformanceResponse } from '../api';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CHART_W = 700;
const CHART_H = 440;
const PAD = { top: 12, right: 6, bottom: 24, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

type Period = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y';

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

function formatTimestampET(iso: string, showDate: boolean): string {
  const d = new Date(iso);
  if (showDate) {
    return d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit',
  });
}

/* ─── Color helpers ──────────────────────────────────────────────────────── */

const GREEN = '#00c805';
const RED = '#ff3b30';

function lineColor(pct: number): string {
  return pct >= 0 ? GREEN : RED;
}

function lineShade(pct: number, rank: number, total: number): string {
  // Brighter for extreme performers, slightly muted for middle
  if (pct >= 0) {
    const t = total > 1 ? rank / (total - 1) : 0;
    // rank 0 = best positive → brightest green, higher rank → dimmer
    const alpha = 1 - t * 0.4;
    return `rgba(0,200,5,${alpha.toFixed(2)})`;
  }
  // Negative: rank closer to total-1 = worst → brightest red
  const t = total > 1 ? (total - 1 - rank) / (total - 1) : 0;
  const alpha = 1 - t * 0.4;
  return `rgba(255,59,48,${alpha.toFixed(2)})`;
}


/* ─── SVG path builders ──────────────────────────────────────────────────── */

function buildTimePathFromMinutes(sparkline: number[], minutes: number[], yMin: number, yRange: number): string {
  if (sparkline.length === 0 || minutes.length === 0) return '';
  const parts: string[] = [];
  let started = false;
  for (let i = 0; i < sparkline.length; i++) {
    const min = minutes[i];
    const xFrac = (min - DAY_START_MIN) / DAY_RANGE_MIN;
    if (xFrac < 0 || xFrac > 1) continue;
    const x = PAD.left + xFrac * PLOT_W;
    const y = PAD.top + PLOT_H - ((sparkline[i] - yMin) / (yRange || 1)) * PLOT_H;
    parts.push(`${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    started = true;
  }
  return parts.join('');
}

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

/* ─── Hover helpers ──────────────────────────────────────────────────────── */

interface HoverInfo {
  ticker: string;
  value: number;
  timestamp: string;
  color: string;
  y: number;
}

function getHoverIndex1D(minutes: number[], svgX: number): number {
  const targetMin = DAY_START_MIN + ((svgX - PAD.left) / PLOT_W) * DAY_RANGE_MIN;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < minutes.length; i++) {
    const dist = Math.abs(minutes[i] - targetMin);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

function getHoverIndexByPosition(count: number, svgX: number): number {
  const frac = (svgX - PAD.left) / PLOT_W;
  return Math.max(0, Math.min(count - 1, Math.round(frac * (count - 1))));
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
  const [hoverInfos, setHoverInfos] = useState<HoverInfo[]>([]);
  const [hoverTime, setHoverTime] = useState<string>('');
  const svgRef = useRef<SVGSVGElement>(null);
  const isTouchingRef = useRef(false);
  // Track locked sector + accumulated vertical movement for cycling
  const lockedTickerRef = useRef<string | null>(null);
  const lastXRef = useRef<number>(0);
  const lastYRef = useRef<number>(0);
  const vertAccumRef = useRef<number>(0);
  // Touch-to-navigate: first tap highlights, second tap on same ticker navigates
  const touchTriggeredRef = useRef(false);
  const hoveredAtTouchStartRef = useRef<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setData(null); // Clear old data immediately to prevent flash of stale chart
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

  // Clean sparklines and build sorted items list
  const allItems = useMemo(() => {
    if (!data) return [];
    const items = [
      ...data.sectors.map(s => ({
        ticker: s.ticker,
        name: s.name,
        changePercent: s.changePercent,
        sparkline: s.sparkline,
        timestamps: s.timestamps,
      })),
      {
        ticker: 'SPY',
        name: 'S&P 500',
        changePercent: data.benchmark.changePercent,
        sparkline: data.benchmark.sparkline,
        timestamps: data.benchmark.timestamps,
      },
    ];
    return items.sort((a, b) => b.changePercent - a.changePercent);
  }, [data]);

  // Pre-compute ET minutes for 1D (avoids expensive toLocaleString on hover AND render)
  const minutesMap = useMemo(() => {
    if (period !== '1D') return null;
    const map = new Map<string, number[]>();
    for (const item of allItems) {
      map.set(item.ticker, item.timestamps.map(toMinutesET));
    }
    return map;
  }, [allItems, period]);

  // Y-axis range
  const { yMin, yRange } = useMemo((): { yMin: number; yRange: number } => {
    if (allItems.length === 0) return { yMin: -3, yRange: 6 };
    const allValues = [...allItems.flatMap(s => s.sparkline), 0];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max((max - min) * 0.15, 0.3);
    return { yMin: min - padding, yRange: max - min + padding * 2 };
  }, [allItems]);

  // Y-axis labels
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

  // Pre-compute SVG paths (only depend on data, not hover state)
  const pathMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of allItems) {
      if (period === '1D' && minutesMap) {
        const mins = minutesMap.get(item.ticker) || [];
        map.set(item.ticker, buildTimePathFromMinutes(item.sparkline, mins, yMin, yRange));
      } else {
        map.set(item.ticker, buildIndexPath(item.sparkline, yMin, yRange));
      }
    }
    return map;
  }, [allItems, period, yMin, yRange, minutesMap]);

  // Hover handler — sticky sector lock with up/down cycling:
  // Left/right scrubs time on the locked sector.
  // Accumulated vertical movement cycles to the next line above/below.
  const CYCLE_THRESHOLD = 18; // SVG units of vertical movement to trigger a cycle

  // Shared hover computation used by both mouse and touch
  const updateHover = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current || allItems.length === 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * CHART_W;
      const svgY = ((clientY - rect.top) / rect.height) * CHART_H;
      if (svgX < PAD.left || svgX > CHART_W - PAD.right) {
        setHoverX(null);
        setHoverInfos([]);
        setHoverTime('');
        setHoveredTicker(null);
        lockedTickerRef.current = null;
        vertAccumRef.current = 0;
        return;
      }
      setHoverX(svgX);

      // Compute Y position for each sector at this X
      const infos: HoverInfo[] = [];
      let timeStr = '';
      for (const item of allItems) {
        if (item.sparkline.length === 0) continue;
        const idx = period === '1D' && minutesMap
          ? getHoverIndex1D(minutesMap.get(item.ticker) || [], svgX)
          : getHoverIndexByPosition(item.sparkline.length, svgX);
        const val = item.sparkline[idx];
        const ts = item.timestamps[idx];
        if (!timeStr && ts) {
          timeStr = formatTimestampET(ts, period !== '1D');
        }
        const y = PAD.top + PLOT_H - ((val - yMin) / (yRange || 1)) * PLOT_H;
        infos.push({
          ticker: item.ticker,
          value: val,
          timestamp: ts || '',
          color: lineColor(item.changePercent),
          y,
        });
      }
      setHoverInfos(infos);
      setHoverTime(timeStr);

      // Sort by Y position at this X (top of chart = lowest Y = highest %)
      const sorted = [...infos].sort((a, b) => a.y - b.y);

      if (!lockedTickerRef.current) {
        // First hover — lock to nearest line by cursor Y
        let nearest = sorted[0];
        let nearestDist = Infinity;
        for (const info of sorted) {
          const d = Math.abs(info.y - svgY);
          if (d < nearestDist) { nearestDist = d; nearest = info; }
        }
        lockedTickerRef.current = nearest.ticker;
        setHoveredTicker(nearest.ticker);
        lastXRef.current = svgX;
        lastYRef.current = svgY;
        vertAccumRef.current = 0;
      } else {
        const dx = Math.abs(svgX - lastXRef.current);
        const dy = svgY - lastYRef.current;
        const absDy = Math.abs(dy);
        lastXRef.current = svgX;
        lastYRef.current = svgY;

        // Only accumulate vertical movement when it's the dominant direction.
        // If horizontal movement is 2x+ the vertical, ignore the vertical wobble.
        if (absDy > 0.5 && (dx < absDy * 2)) {
          vertAccumRef.current += dy;
        } else {
          // Mostly horizontal — decay the accumulator toward zero
          vertAccumRef.current *= 0.7;
        }

        if (Math.abs(vertAccumRef.current) > CYCLE_THRESHOLD) {
          const direction = vertAccumRef.current > 0 ? 1 : -1;
          const currentIdx = sorted.findIndex(s => s.ticker === lockedTickerRef.current);
          if (currentIdx !== -1) {
            const nextIdx = Math.max(0, Math.min(sorted.length - 1, currentIdx + direction));
            lockedTickerRef.current = sorted[nextIdx].ticker;
            setHoveredTicker(sorted[nextIdx].ticker);
          }
          vertAccumRef.current = 0;
        } else {
          setHoveredTicker(lockedTickerRef.current);
        }
      }
    },
    [allItems, period, yMin, yRange, minutesMap],
  );

  const clearHover = useCallback(() => {
    setHoverX(null);
    setHoveredTicker(null);
    setHoverInfos([]);
    setHoverTime('');
    lockedTickerRef.current = null;
    vertAccumRef.current = 0;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => updateHover(e.clientX, e.clientY),
    [updateHover],
  );

  const handleMouseLeave = useCallback(() => clearHover(), [clearHover]);

  // Touch handlers — press and drag to scrub, just like mouse hover
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      if (e.touches.length !== 1) return;
      isTouchingRef.current = true;
      const t = e.touches[0];
      updateHover(t.clientX, t.clientY);
    },
    [updateHover],
  );

  const handleTouchEnd = useCallback(() => {
    isTouchingRef.current = false;
    clearHover();
  }, [clearHover]);

  // Native touchmove listener with { passive: false } so preventDefault() works
  // This prevents page scrolling while scrubbing the chart
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onTouchMove = (e: TouchEvent) => {
      if (!isTouchingRef.current || e.touches.length !== 1) return;
      e.preventDefault(); // Block scroll while scrubbing
      const t = e.touches[0];
      updateHover(t.clientX, t.clientY);
    };
    svg.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => svg.removeEventListener('touchmove', onTouchMove);
  }, [updateHover]);

  if (loading && !data) {
    return (
      <div className="p-4 animate-pulse h-[360px]" />
    );
  }

  if (!data || allItems.length === 0) return null;

  const zeroY = PAD.top + PLOT_H - ((0 - yMin) / (yRange || 1)) * PLOT_H;

  const timeLabels1D = [
    { min: 4 * 60, label: '4 AM' },
    { min: 7 * 60, label: '7 AM' },
    { min: 9 * 60 + 30, label: '9:30' },
    { min: 12 * 60, label: '12 PM' },
    { min: 14 * 60 + 30, label: '2:30' },
    { min: 17 * 60, label: '5 PM' },
    { min: 20 * 60, label: '8 PM' },
  ];

  // Hovered item for tooltip
  const hoveredInfo = hoveredTicker ? hoverInfos.find(h => h.ticker === hoveredTicker) : null;

  return (
    <div className="overflow-hidden">
      {/* Period selector — underline style */}
      <div className="flex items-center gap-0 -ml-1 mb-1">
        {(['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`relative px-2.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
              period === p
                ? 'text-rh-green'
                : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-white/60'
            }`}
          >
            {p}
            {period === p && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-rh-green" />
            )}
          </button>
        ))}
      </div>

      <div className="pb-1 relative" style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            data-no-tab-swipe
            style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
          >
            {/* 0% baseline */}
            {zeroY >= PAD.top && zeroY <= PAD.top + PLOT_H && (
              <line
                x1={PAD.left} x2={CHART_W - PAD.right}
                y1={zeroY} y2={zeroY}
                stroke="rgba(150,150,150,0.2)"
                strokeWidth={0.5}
                strokeDasharray="4,4"
              />
            )}

            {/* Y-axis labels */}
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
                  stroke="rgba(0,200,5,0.1)"
                  strokeWidth={0.5}
                  strokeDasharray="3,3"
                />
              );
            })()}

            {/* Sector lines — simple green/red based on change direction */}
            {allItems.map((item, i) => {
              const isHovered = hoveredTicker === item.ticker;
              const anyHovered = hoveredTicker !== null;
              const color = lineShade(item.changePercent, i, allItems.length);
              const opacity = anyHovered ? (isHovered ? 1 : 0.08) : 0.8;
              return (
                <path
                  key={item.ticker}
                  d={pathMap.get(item.ticker) || ''}
                  fill="none"
                  stroke={isHovered ? lineColor(item.changePercent) : color}
                  strokeWidth={isHovered ? 2.5 : 1.3}
                  opacity={opacity}
                  strokeLinejoin="round"
                  style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}
                />
              );
            })}

            {/* Hover crosshair */}
            {hoverX !== null && (
              <line
                x1={hoverX} x2={hoverX}
                y1={PAD.top} y2={PAD.top + PLOT_H}
                stroke="rgba(150,150,150,0.3)"
                strokeWidth={0.5}
              />
            )}

            {/* Hover dots on each line */}
            {hoverX !== null && hoveredTicker && hoveredInfo && (
              <circle
                cx={hoverX}
                cy={hoveredInfo.y}
                r={3.5}
                fill={hoveredInfo.color}
                stroke="rgba(0,0,0,0.3)"
                strokeWidth={0.5}
              />
            )}

            {/* Time labels */}
            {period === '1D' ? (
              timeLabels1D.map(({ min, label }, i) => {
                const x = PAD.left + ((min - DAY_START_MIN) / DAY_RANGE_MIN) * PLOT_W;
                const anchor = i === 0 ? 'start' : i === timeLabels1D.length - 1 ? 'end' : 'middle';
                return (
                  <text
                    key={label}
                    x={x} y={CHART_H - 5}
                    textAnchor={anchor}
                    className="fill-gray-400 dark:fill-white/20"
                    fontSize="5.5"
                    fontFamily="system-ui"
                  >
                    {label}
                  </text>
                );
              })
            ) : (() => {
              const longestTs = allItems.reduce((a, b) =>
                a.timestamps.length >= b.timestamps.length ? a : b
              ).timestamps;
              if (longestTs.length === 0) return null;
              const count = longestTs.length;
              const indices = [0, Math.floor(count / 4), Math.floor(count / 2), Math.floor(count * 3 / 4), count - 1];
              return indices.map((idx, i) => {
                const xFrac = count > 1 ? idx / (count - 1) : 0.5;
                const x = PAD.left + xFrac * PLOT_W;
                const d = new Date(longestTs[idx]);
                const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const anchor = i === 0 ? 'start' : i === indices.length - 1 ? 'end' : 'middle';
                return (
                  <text
                    key={idx}
                    x={x} y={CHART_H - 5}
                    textAnchor={anchor}
                    className="fill-gray-400 dark:fill-white/20"
                    fontSize="5.5"
                    fontFamily="system-ui"
                  >
                    {label}
                  </text>
                );
              });
            })()}
          </svg>

          {/* Hover tooltip */}
          {hoverX !== null && hoveredTicker && hoveredInfo && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                left: `${(hoverX / CHART_W) * 100}%`,
                top: '8px',
                transform: hoverX > CHART_W * 0.7 ? 'translateX(-110%)' : 'translateX(8px)',
              }}
            >
              <div className="bg-gray-900/90 dark:bg-black/80 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border border-white/10">
                <div className="text-[10px] text-white/50 mb-1">{hoverTime}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{hoveredInfo.ticker}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: hoveredInfo.color }}>
                    {hoveredInfo.value > 0 ? '+' : ''}{hoveredInfo.value.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Horizontal bar chart */}
      <div className="pb-4 pt-3 border-t border-gray-200/10 dark:border-white/[0.04]">
        <div className="space-y-0">
          {allItems.map((item) => {
            const pct = item.changePercent;
            const maxAbsPct = Math.max(...allItems.map(it => Math.abs(it.changePercent)), 0.01);
            const barWidth = (Math.abs(pct) / maxAbsPct) * 45;
            const isPositive = pct >= 0;
            const isZero = Math.abs(pct) < 0.005;
            const isHovered = hoveredTicker === item.ticker;
            return (
              <div
                key={item.ticker}
                className={`flex items-center gap-2 cursor-pointer py-2.5 border-b border-gray-200/10 dark:border-white/[0.04] last:border-b-0 transition-colors ${isHovered ? 'bg-gray-100/40 dark:bg-white/[0.02]' : 'hover:bg-gray-100/40 dark:hover:bg-white/[0.02]'}`}
                onMouseEnter={() => setHoveredTicker(item.ticker)}
                onMouseLeave={() => setHoveredTicker(null)}
                onTouchStart={() => {
                  touchTriggeredRef.current = true;
                  hoveredAtTouchStartRef.current = hoveredTicker;
                  setHoveredTicker(item.ticker);
                }}
                onClick={() => {
                  if (touchTriggeredRef.current) {
                    touchTriggeredRef.current = false;
                    if (hoveredAtTouchStartRef.current === item.ticker) {
                      onTickerClick?.(item.ticker);
                    }
                    return;
                  }
                  onTickerClick?.(item.ticker);
                }}
              >
                <span className={`text-[11px] w-16 sm:w-24 text-right shrink-0 font-medium tabular-nums transition-colors ${isHovered ? 'text-rh-light-text dark:text-rh-text' : 'text-rh-light-muted/60 dark:text-rh-muted/60'}`}>
                  {item.name}
                </span>
                <div className="flex-1 flex items-center h-3">
                  <div className="relative w-full h-full flex items-center">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200/20 dark:bg-white/[0.08]" />
                    {!isZero && (
                      <div
                        className="absolute h-full rounded-[2px] transition-all duration-500"
                        style={{
                          left: isPositive ? '50%' : `${50 - barWidth}%`,
                          width: `${Math.max(barWidth, 0.5)}%`,
                          background: isPositive ? '#00C805' : '#E8544E',
                        }}
                      />
                    )}
                  </div>
                </div>
                <span className={`text-[11px] font-bold min-w-[48px] text-right tabular-nums ${isZero ? 'text-rh-light-muted dark:text-rh-muted' : isPositive ? 'text-rh-green' : 'text-rh-red'}`}>
                  {isPositive ? '+' : ''}{pct.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
