import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSectorPerformance, SectorPerformanceResponse } from '../api';


/* ─── Types ─── */

interface TrailPoint {
  x: number; // RS-Ratio (relative strength vs SPY)
  y: number; // RS-Momentum (rate of change of RS)
}

interface SectorDot {
  ticker: string;
  name: string;
  color: string;
  trail: TrailPoint[]; // oldest → newest
  current: TrailPoint;
  changePercent: number;
  relativeStrength: number;
}

type ViewMode = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y';

/* ─── Constants ─── */

const SECTOR_META: Record<string, { color: string; name: string }> = {
  XLK: { color: '#3b82f6', name: 'Technology' },
  XLV: { color: '#10b981', name: 'Healthcare' },
  XLF: { color: '#f59e0b', name: 'Financials' },
  XLE: { color: '#f97316', name: 'Energy' },
  XLI: { color: '#6b7280', name: 'Industrials' },
  XLC: { color: '#8b5cf6', name: 'Communication' },
  XLY: { color: '#ec4899', name: 'Consumer Disc.' },
  XLP: { color: '#14b8a6', name: 'Staples' },
  XLB: { color: '#a16207', name: 'Materials' },
  XLRE: { color: '#06b6d4', name: 'Real Estate' },
  XLU: { color: '#84cc16', name: 'Utilities' },
  GLD: { color: '#eab308', name: 'Gold' },
};

const TRAIL_LENGTH = 8;
const MOMENTUM_WINDOW = 5;

/* ─── Helpers ─── */

/** Normalize timestamp to minute precision to avoid drift mismatches */
function normalizeTs(ts: string): string {
  // Truncate to minute: "2026-03-11T14:30:45.123Z" → "2026-03-11T14:30"
  return ts.slice(0, 16);
}

function computeSectorDots(data: SectorPerformanceResponse): SectorDot[] {
  if (!data?.benchmark) return [];
  const spySparkline = data.benchmark.sparkline;
  const spyTimestamps = data.benchmark.timestamps;
  if (!spySparkline?.length || !spyTimestamps?.length) return [];
  if (spySparkline.length !== spyTimestamps.length) return []; // data integrity check

  // Build normalized timestamp → index map for SPY (O(1) lookups)
  const spyIndexByTs = new Map<string, number>();
  for (let i = 0; i < spyTimestamps.length; i++) {
    spyIndexByTs.set(normalizeTs(spyTimestamps[i]), i);
  }

  return (data.sectors || [])
    .filter(s => SECTOR_META[s.ticker] && s.sparkline?.length && s.timestamps?.length
      && s.sparkline.length === s.timestamps.length)
    .map(sector => {
      // Join on timestamp — only use points where both sector and SPY have data
      const alignedRs: number[] = [];
      for (let i = 0; i < sector.timestamps.length; i++) {
        const spyIdx = spyIndexByTs.get(normalizeTs(sector.timestamps[i]));
        if (spyIdx != null) {
          alignedRs.push(sector.sparkline[i] - spySparkline[spyIdx]);
        }
      }

      // Need enough aligned points for momentum + trail
      if (alignedRs.length < MOMENTUM_WINDOW + 2) return null;

      const rs = smooth(alignedRs, 3);

      const rawMomentum: number[] = [];
      for (let i = 0; i < rs.length; i++) {
        rawMomentum.push(i < MOMENTUM_WINDOW ? 0 : rs[i] - rs[i - MOMENTUM_WINDOW]);
      }
      const momentum = smooth(rawMomentum, 3);

      const startIdx = Math.max(MOMENTUM_WINDOW, rs.length - TRAIL_LENGTH);
      const trail: TrailPoint[] = [];
      for (let i = startIdx; i < rs.length; i++) {
        trail.push({ x: rs[i], y: momentum[i] });
      }

      if (trail.length === 0) return null;

      const current = trail[trail.length - 1];
      const meta = SECTOR_META[sector.ticker];
      const benchmarkChange = data.benchmark.changePercent ?? 0;

      return {
        ticker: sector.ticker,
        name: meta?.name || sector.name,
        color: meta?.color || '#888',
        trail,
        current,
        changePercent: sector.changePercent - benchmarkChange, // relative to SPY
        relativeStrength: current.x,
      };
    })
    .filter((d): d is SectorDot => d != null);
}

function getAxisBounds(dots: SectorDot[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const dot of dots) {
    for (const p of dot.trail) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  // Asymmetric bounds — fit the data, not forced symmetric.
  // Ensure origin (0,0) is always visible and each side has at least some padding.
  const padFactor = 1.3;
  const minPad = 0.3;
  return {
    minX: Math.min(-minPad, minX * padFactor),
    maxX: Math.max(minPad, maxX * padFactor),
    minY: Math.min(-minPad, minY * padFactor),
    maxY: Math.max(minPad, maxY * padFactor),
  };
}

function getQuadrant(p: TrailPoint): string {
  if (p.x >= 0 && p.y >= 0) return 'Leading';
  if (p.x >= 0 && p.y < 0) return 'Weakening';
  if (p.x < 0 && p.y < 0) return 'Lagging';
  return 'Improving';
}

/** Smooth an array with a simple moving average */
function smooth(arr: number[], window = 3): number[] {
  const half = Math.floor(window / 2);
  return arr.map((_, i) => {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j]; count++;
    }
    return sum / count;
  });
}

/** Convert a set of points to a smooth SVG cubic bezier path (Catmull-Rom) */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;

  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/* ─── Component ─── */

interface Props {
  onTickerClick?: (ticker: string) => void;
}

export function SectorRotationGraph({ onTickerClick }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('1M');
  const [data, setData] = useState<SectorPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchSeqRef = useRef(0);

  // Detect dark mode for SVG colors
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const period = viewMode as '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y';

  const fetchData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const result = await getSectorPerformance(period);
      if (seq !== fetchSeqRef.current) return;
      setData(result);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      console.error('[SectorRotation] fetch failed:', err);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const dots = useMemo(() => data ? computeSectorDots(data) : [], [data]);
  const bounds = useMemo(() => getAxisBounds(dots), [dots]);

  // Clear hover if the hovered sector disappeared from data refresh
  useEffect(() => {
    if (hoveredSector && dots.length > 0 && !dots.some(d => d.ticker === hoveredSector)) {
      setHoveredSector(null);
    }
  }, [dots, hoveredSector]);

  // SVG layout — wide aspect ratio to match Sectors tab width
  const width = 1000;
  const height = 470;
  const pad = { top: 12, right: 14, bottom: 25, left: 14 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const scaleX = (v: number) => pad.left + ((v - bounds.minX) / (bounds.maxX - bounds.minX)) * plotW;
  const scaleY = (v: number) => pad.top + ((bounds.maxY - v) / (bounds.maxY - bounds.minY)) * plotH;

  const centerX = scaleX(0);
  const centerY = scaleY(0);

  const hoveredDot = dots.find(d => d.ticker === hoveredSector);

  // Theme-aware SVG colors
  const lineColor = isDark ? 'white' : 'black';
  const lineOp = isDark ? 0.08 : 0.1;

  const arrowOutline = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';
  const arrowStroke = isDark ? 'white' : 'white';
  const textShadow = isDark
    ? '0 1px 6px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.8)'
    : '0 1px 4px rgba(255,255,255,0.9), 0 0 8px rgba(255,255,255,0.6)';

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-rh-light-muted dark:text-rh-muted text-sm">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading rotation data...
        </div>
      </div>
    );
  }

  if (!data || dots.length === 0) {
    return (
      <div className="text-center py-20 text-rh-light-muted dark:text-rh-muted text-sm">
        No sector data available
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {/* How-to guide — toggled by ? button */}
      {showGuide && (
        <div className="mb-4 rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] p-4 text-xs leading-relaxed text-rh-light-muted dark:text-white/50">
          <p className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-2">How to read this chart</p>
          <p className="mb-3">
            Each dot is a market sector plotted relative to the S&P 500 (SPY). The <strong className="text-rh-light-text dark:text-white/70">horizontal position</strong> shows
            whether a sector is outperforming or underperforming SPY. The <strong className="text-rh-light-text dark:text-white/70">vertical position</strong> shows
            whether that gap is growing or shrinking.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/[0.06]">
              <span className="text-blue-400 font-bold text-sm leading-none mt-0.5">↗</span>
              <div><span className="font-semibold text-blue-400">Improving</span> — Behind SPY, but the gap is narrowing. Early sign of a turnaround.</div>
            </div>
            <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-500/[0.06]">
              <span className="text-emerald-400 font-bold text-sm leading-none mt-0.5">⬆</span>
              <div><span className="font-semibold text-emerald-400">Leading</span> — Ahead of SPY and still pulling away. The strongest position.</div>
            </div>
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/[0.06]">
              <span className="text-amber-400 font-bold text-sm leading-none mt-0.5">↘</span>
              <div><span className="font-semibold text-amber-400">Weakening</span> — Still ahead of SPY, but starting to lose steam. The lead is shrinking.</div>
            </div>
            <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/[0.06]">
              <span className="text-red-400 font-bold text-sm leading-none mt-0.5">⬇</span>
              <div><span className="font-semibold text-red-400">Lagging</span> — Behind SPY and falling further behind. The weakest position.</div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-0 text-[10px] font-semibold tracking-wide mb-1">
            {[
              { label: 'LAGGING', color: '#ef4444', arrow: true },
              { label: 'IMPROVING', color: '#3b82f6', arrow: true },
              { label: 'LEADING', color: '#10b981', arrow: true },
              { label: 'WEAKENING', color: '#f59e0b', arrow: true },
              { label: 'LAGGING', color: '#ef4444', arrow: false },
            ].map((q, i) => (
              <div key={i} className="flex items-center">
                <span className="px-2 py-0.5 rounded" style={{ color: q.color, background: `${q.color}15` }}>
                  {q.label}
                </span>
                {q.arrow && (
                  <svg className="w-3.5 h-3.5 mx-0.5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] opacity-60 text-center">
            Sectors rotate clockwise through this cycle. Trails show recent movement. Hover a dot for details.
          </p>
        </div>
      )}

      {/* Main graph */}
      <div className="relative">
        {/* Title (left) + Period buttons (right) — sit flush on chart top edge */}
        <div className="flex items-end justify-between mb-0 px-[1.4%]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-rh-light-text dark:text-rh-text">
              Sector Rotation
            </h3>
            <button
              onClick={() => setShowGuide(g => !g)}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold transition-all shrink-0 ${
                showGuide
                  ? 'bg-rh-green text-black'
                  : 'bg-gray-200/60 dark:bg-white/[0.08] text-rh-light-muted dark:text-white/40 hover:bg-gray-300/60 dark:hover:bg-white/[0.12]'
              }`}
              title="How to read this chart"
            >?</button>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted hidden sm:block">
              Where money is moving
            </p>
          </div>
          <div className="flex gap-0.5 bg-gray-100/60 dark:bg-white/[0.04] rounded-lg p-0.5">
            {(['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                  viewMode === mode
                    ? 'bg-white dark:bg-rh-card text-rh-green shadow-sm'
                    : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          onMouseLeave={() => setHoveredSector(null)}
        >
          <defs>
            {/* Animations */}
            <style>{`
              @keyframes flowDash {
                to { stroke-dashoffset: 0; }
              }
              @keyframes pulseArrow {
                0%, 100% { transform: scale(1); opacity: 0.35; }
                50% { transform: scale(2.2); opacity: 0; }
              }
              @keyframes pulseArrowSm {
                0%, 100% { transform: scale(1); opacity: 0.25; }
                50% { transform: scale(1.8); opacity: 0; }
              }
              @media (prefers-reduced-motion: reduce) {
                * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
              }
            `}</style>
            {/* Glow + shadow filters for each sector */}
            {dots.map(dot => (
              <filter key={`glow-${dot.ticker}`} id={`glow-${dot.ticker}`} x="-80%" y="-80%" width="260%" height="260%">
                {/* Drop shadow behind arrow */}
                <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="shadow" />
                <feOffset in="shadow" dx="0" dy="3" result="shadowOffset" />
                <feFlood floodColor="black" floodOpacity="0.6" result="shadowColor" />
                <feComposite in="shadowColor" in2="shadowOffset" operator="in" result="dropShadow" />
                {/* Colored glow */}
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feFlood floodColor={dot.color} floodOpacity="0.6" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="dropShadow" />
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {/* Quadrant backgrounds — subtle tints */}
          {(() => {
            const qOp = isDark ? 0.02 : 0.05;
            return (<>
              <rect x={centerX} y={pad.top} width={scaleX(bounds.maxX) - centerX} height={centerY - pad.top}
                fill="#10b981" opacity={qOp} />
              <rect x={centerX} y={centerY} width={scaleX(bounds.maxX) - centerX} height={scaleY(bounds.minY) - centerY}
                fill="#f59e0b" opacity={qOp} />
              <rect x={pad.left} y={centerY} width={centerX - pad.left} height={scaleY(bounds.minY) - centerY}
                fill="#ef4444" opacity={qOp} />
              <rect x={pad.left} y={pad.top} width={centerX - pad.left} height={centerY - pad.top}
                fill="#3b82f6" opacity={qOp} />
            </>);
          })()}

          {/* Quadrant labels — styled with glow */}
          {[
            { label: 'LEADING', x: scaleX(bounds.maxX) - 14, y: pad.top + 28, anchor: 'end' as const, color: '#10b981' },
            { label: 'WEAKENING', x: scaleX(bounds.maxX) - 14, y: scaleY(bounds.minY) - 14, anchor: 'end' as const, color: '#f59e0b' },
            { label: 'LAGGING', x: pad.left + 14, y: scaleY(bounds.minY) - 14, anchor: 'start' as const, color: '#ef4444' },
            { label: 'IMPROVING', x: pad.left + 14, y: pad.top + 28, anchor: 'start' as const, color: '#3b82f6' },
          ].map(q => (
            <g key={q.label}>
              {/* Soft glow behind text */}
              <text x={q.x} y={q.y} textAnchor={q.anchor}
                fontSize="11" fontWeight="800" letterSpacing="0.18em" fill={q.color} opacity={0.12}
                style={{ filter: 'blur(6px)' }}>
                {q.label}
              </text>
              {/* Main label */}
              <text x={q.x} y={q.y} textAnchor={q.anchor}
                fontSize="11" fontWeight="800" letterSpacing="0.18em" fill={q.color} opacity={isDark ? 0.35 : 0.5}>
                {q.label}
              </text>
            </g>
          ))}

          {/* Axis crosshairs */}
          <line x1={pad.left} y1={centerY} x2={pad.left + plotW} y2={centerY}
            stroke={lineColor} strokeWidth={1} opacity={lineOp} strokeDasharray="4 4" />
          <line x1={centerX} y1={pad.top} x2={centerX} y2={pad.top + plotH}
            stroke={lineColor} strokeWidth={1} opacity={lineOp} strokeDasharray="4 4" />

          {/* SPY benchmark badge — right side of chart, hides on hover */}
          {!hoveredSector && (() => {
            const spyReturn = data.benchmark?.changePercent ?? 0;
            const sign = spyReturn >= 0 ? '+' : '';
            const spyColor = spyReturn >= 0 ? '#10b981' : '#ef4444';
            const lx = pad.left + plotW - 6;
            const ly = centerY;
            return (
              <g className="pointer-events-none">
                {/* SPY + percentage inline */}
                <text x={lx} y={ly + 4} textAnchor="end" fontSize="11" fontWeight="600"
                  fill={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}>
                  SPY{'  '}
                  <tspan fill={spyColor} fontWeight="700" opacity={0.9}>
                    {sign}{spyReturn.toFixed(1)}%
                  </tspan>
                </text>
              </g>
            );
          })()}


          {/* Sector trails + dots (visual layer — no pointer events) */}
          {dots.map((dot, dotIdx) => {
            const isHovered = hoveredSector === dot.ticker;
            const isFaded = hoveredSector != null && !isHovered;
            const opacity = isFaded ? 0.08 : 1;
            const scaledTrail = dot.trail.map(p => ({ x: scaleX(p.x), y: scaleY(p.y) }));
            const pathD = smoothPath(scaledTrail);

            // Compute trail length for dash animation
            let trailLen = 0;
            for (let i = 1; i < scaledTrail.length; i++) {
              const dx = scaledTrail[i].x - scaledTrail[i - 1].x;
              const dy = scaledTrail[i].y - scaledTrail[i - 1].y;
              trailLen += Math.sqrt(dx * dx + dy * dy);
            }
            const staggerDelay = dotIdx * 0.3;

            return (
              <g key={dot.ticker} opacity={opacity} className="pointer-events-none" style={{ transition: 'opacity 0.3s ease' }}>
                {/* Smooth trail — soft glow base */}
                {pathD && (
                  <path d={pathD} fill="none" stroke={dot.color}
                    strokeWidth={isHovered ? 5 : 2.5} strokeLinecap="round"
                    opacity={isHovered ? 0.2 : 0.1} />
                )}
                {/* Smooth trail — solid */}
                {pathD && (
                  <path d={pathD} fill="none" stroke={dot.color}
                    strokeWidth={isHovered ? 2.5 : 1.5} strokeLinecap="round"
                    opacity={isHovered ? 0.7 : 0.4} />
                )}
                {/* Animated flowing dash — "cars on highway" effect */}
                {pathD && trailLen > 10 && (
                  <path d={pathD} fill="none" stroke={dot.color}
                    strokeWidth={isHovered ? 3 : 2} strokeLinecap="round"
                    opacity={isHovered ? 0.9 : 0.6}
                    strokeDasharray={`4 ${Math.max(8, trailLen * 0.15)}`}
                    strokeDashoffset={trailLen}
                    style={{
                      animation: `flowDash ${2.4 + staggerDelay * 0.24}s linear infinite`,
                      animationDelay: `${staggerDelay}s`,
                    }} />
                )}

                {/* Trail dots — fade in toward head */}
                {scaledTrail.slice(0, -1).map((p, i) => {
                  const progress = i / Math.max(1, scaledTrail.length - 1);
                  return (
                    <circle key={i} cx={p.x} cy={p.y}
                      r={1 + progress * (isHovered ? 2.5 : 1.5)}
                      fill={dot.color} opacity={0.15 + progress * 0.4} />
                  );
                })}

                {/* Head arrowhead + pulse — points in direction of movement */}
                {(() => {
                  const cx = scaleX(dot.current.x);
                  const cy = scaleY(dot.current.y);
                  let angle = 0;
                  if (scaledTrail.length >= 2) {
                    const prev = scaledTrail[scaledTrail.length - 2];
                    const curr = scaledTrail[scaledTrail.length - 1];
                    angle = Math.atan2(curr.y - prev.y, curr.x - prev.x) * (180 / Math.PI);
                  }
                  const s = isHovered ? 8 : 5.5;
                  const pts = `${s * 1.4},0 ${-s},${-s * 0.85} ${-s * 0.4},0 ${-s},${s * 0.85}`;
                  return (
                    <g transform={`translate(${cx},${cy}) rotate(${angle})`}>
                      {/* Pulse — same arrow shape, scales up and fades */}
                      <polygon
                        points={pts}
                        fill="none" stroke={dot.color} strokeWidth={1}
                        style={{
                          transformOrigin: '0 0',
                          animation: `${isHovered ? 'pulseArrow' : 'pulseArrowSm'} ${isHovered ? 1.8 : 3}s ease-out infinite`,
                          animationDelay: `${staggerDelay}s`,
                        }} />
                      {/* Outline to separate arrow from trail */}
                      <polygon
                        points={pts}
                        fill="none"
                        stroke={arrowOutline} strokeWidth={3.5}
                        strokeLinejoin="round"
                      />
                      {/* Solid arrow */}
                      <polygon
                        points={pts}
                        fill={dot.color}
                        stroke={arrowStroke} strokeWidth={isHovered ? 1.2 : 0.8} strokeOpacity={isHovered ? 0.7 : 0.4}
                        strokeLinejoin="round"
                        filter={`url(#glow-${dot.ticker})`}
                      />
                    </g>
                  );
                })()}


              </g>
            );
          })}

          {/* Invisible hit targets — always on top, always full opacity */}
          {/* Render hovered dot LAST (on top) so it stays interactive when clustered */}
          {[...dots].sort((a, b) => {
            if (a.ticker === hoveredSector) return 1; // hovered on top
            if (b.ticker === hoveredSector) return -1;
            return 0;
          }).map(dot => (
            <circle
              key={`hit-${dot.ticker}`}
              cx={scaleX(dot.current.x)}
              cy={scaleY(dot.current.y)}
              r={14}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredSector(dot.ticker)}
              onClick={() => onTickerClick?.(dot.ticker)}
            />
          ))}

          {/* Hover detail tooltip — positioned to avoid the ticker label above the dot */}
          {hoveredDot && (() => {
            const rawX = scaleX(hoveredDot.current.x);
            const rawY = scaleY(hoveredDot.current.y);
            const quadrant = getQuadrant(hoveredDot.current);
            const rsValue = hoveredDot.current.x;
            const rsAbs = Math.abs(rsValue);
            const rsLabel = rsValue >= 0
              ? `+${rsAbs.toFixed(1)}% ahead of SPY`
              : `${rsAbs.toFixed(1)}% behind SPY`;
            const momSign = hoveredDot.current.y >= 0 ? '+' : '';
            const momLabel = hoveredDot.current.y >= 0 ? 'Gaining steam' : 'Losing steam';
            const qColor = quadrant === 'Leading' ? '#10b981' : quadrant === 'Improving' ? '#3b82f6' : quadrant === 'Weakening' ? '#f59e0b' : '#ef4444';
            const qText = quadrant === 'Improving' ? '↗ Improving — catching up'
              : quadrant === 'Leading' ? '⬆ Leading — outperforming'
              : quadrant === 'Weakening' ? '↘ Weakening — fading'
              : '⬇ Lagging — falling behind';

            // Position: prefer right of dot, flip left if no room
            const foX = rawX + 300 < width ? rawX + 22 : rawX - 280;
            const foY = Math.max(pad.top, rawY - 40);

            return (
              <foreignObject x={foX} y={foY} width="260" height="90" className="pointer-events-none overflow-visible">
                <div style={{
                  background: 'rgba(0,0,0,0.92)',
                  border: `1px solid ${hoveredDot.color}66`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  width: 'fit-content',
                  maxWidth: 250,
                  whiteSpace: 'nowrap',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                    {hoveredDot.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
                    {rsLabel} · {momLabel} ({momSign}{hoveredDot.current.y.toFixed(2)})
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: qColor, marginTop: 4 }}>
                    {qText}
                  </div>
                </div>
              </foreignObject>
            );
          })()}

          {/* Hovered ticker label — rendered last so it's always on top */}
          {hoveredDot && (() => {
            const hx = scaleX(hoveredDot.current.x);
            const hy = scaleY(hoveredDot.current.y);
            const scaledTrail = hoveredDot.trail.map(p => ({ x: scaleX(p.x), y: scaleY(p.y) }));
            let arrow = '';
            if (scaledTrail.length >= 2) {
              const prev = scaledTrail[scaledTrail.length - 2];
              const curr = scaledTrail[scaledTrail.length - 1];
              const adx = curr.x - prev.x;
              const ady = curr.y - prev.y;
              if (Math.sqrt(adx * adx + ady * ady) >= 2) {
                const angle = Math.atan2(ady, adx) * (180 / Math.PI);
                const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
                const idx = Math.round(((angle + 360) % 360) / 45) % 8;
                arrow = ' ' + arrows[idx];
              }
            }
            return (
              <text x={hx} y={hy - 18}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill={hoveredDot.color}
                className="select-none pointer-events-none"
                style={{ textShadow }}>
                {hoveredDot.ticker}{arrow}
              </text>
            );
          })()}
        </svg>
      </div>

      {/* Color key — tight under chart */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-center -mt-6">
        {dots.map(dot => {
          const isHov = hoveredSector === dot.ticker;
          return (
            <button
              key={dot.ticker}
              onClick={() => onTickerClick?.(dot.ticker)}
              onMouseEnter={() => setHoveredSector(dot.ticker)}
              onMouseLeave={() => setHoveredSector(null)}
              className={`inline-flex items-center gap-1 px-1 py-0.5 rounded transition-opacity text-[10px] ${
                isHov ? 'opacity-100' : hoveredSector ? 'opacity-25' : 'opacity-50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot.color }} />
              <span className="font-medium text-rh-light-text dark:text-rh-text">{dot.ticker}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
