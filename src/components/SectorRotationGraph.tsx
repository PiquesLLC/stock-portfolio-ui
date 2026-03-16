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
  group: SectorGroup;
}

type ViewMode = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y';
type SectorGroup = 'cyclical' | 'defensive' | 'sensitive';

/* ─── Constants ─── */

const SECTOR_META: Record<string, { color: string; name: string; group: SectorGroup }> = {
  XLK: { color: '#3b82f6', name: 'Technology', group: 'sensitive' },
  XLV: { color: '#10b981', name: 'Healthcare', group: 'defensive' },
  XLF: { color: '#f59e0b', name: 'Financials', group: 'cyclical' },
  XLE: { color: '#f97316', name: 'Energy', group: 'cyclical' },
  XLI: { color: '#6b7280', name: 'Industrials', group: 'sensitive' },
  XLC: { color: '#8b5cf6', name: 'Communication', group: 'sensitive' },
  XLY: { color: '#ec4899', name: 'Consumer Disc.', group: 'cyclical' },
  XLP: { color: '#14b8a6', name: 'Staples', group: 'defensive' },
  XLB: { color: '#a16207', name: 'Materials', group: 'cyclical' },
  XLRE: { color: '#06b6d4', name: 'Real Estate', group: 'defensive' },
  XLU: { color: '#84cc16', name: 'Utilities', group: 'defensive' },
  GLD: { color: '#eab308', name: 'Gold', group: 'sensitive' },
};

const TRAIL_LENGTH = 8;
const MOMENTUM_WINDOW = 5;

const QUADRANT_COLORS: Record<string, string> = {
  Leading: '#10b981',
  Weakening: '#f59e0b',
  Lagging: '#ef4444',
  Improving: '#3b82f6',
};

/* ─── Helpers ─── */

/** Normalize timestamp to minute precision to avoid drift mismatches */
function normalizeTs(ts: string): string {
  return ts.slice(0, 16);
}

function computeSectorDots(data: SectorPerformanceResponse): SectorDot[] {
  if (!data?.benchmark) return [];
  const spySparkline = data.benchmark.sparkline;
  const spyTimestamps = data.benchmark.timestamps;
  if (!spySparkline?.length || !spyTimestamps?.length) return [];
  if (spySparkline.length !== spyTimestamps.length) return [];

  const spyIndexByTs = new Map<string, number>();
  for (let i = 0; i < spyTimestamps.length; i++) {
    spyIndexByTs.set(normalizeTs(spyTimestamps[i]), i);
  }

  return (data.sectors || [])
    .filter(s => SECTOR_META[s.ticker] && s.sparkline?.length && s.timestamps?.length
      && s.sparkline.length === s.timestamps.length)
    .map(sector => {
      const alignedRs: number[] = [];
      for (let i = 0; i < sector.timestamps.length; i++) {
        const spyIdx = spyIndexByTs.get(normalizeTs(sector.timestamps[i]));
        if (spyIdx != null) {
          alignedRs.push(sector.sparkline[i] - spySparkline[spyIdx]);
        }
      }

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
        changePercent: sector.changePercent - benchmarkChange,
        relativeStrength: current.x,
        group: meta?.group || 'sensitive',
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

/** Generate nice tick values for an axis range */
function getAxisTicks(min: number, max: number, maxTicks = 5): number[] {
  const range = max - min;
  if (range <= 0) return [0];
  const rawStep = range / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / mag;
  const step = normalized <= 1.5 ? mag : normalized <= 3 ? 2 * mag : normalized <= 7 ? 5 * mag : 10 * mag;
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max; v += step) {
    if (Math.abs(v) > step * 0.01) ticks.push(v); // skip 0 (crosshair already marks it)
  }
  return ticks;
}

/** Resolve label collisions by nudging overlapping labels apart */
function resolveCollisions(labels: { ticker: string; x: number; y: number }[], minDist = 18): { ticker: string; x: number; y: number }[] {
  const result = labels.map(l => ({ ...l }));
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[j].x - result[i].x;
        const dy = result[j].y - result[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist > 0.01) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          result[i].x -= nx * overlap;
          result[i].y -= ny * overlap;
          result[j].x += nx * overlap;
          result[j].y += ny * overlap;
        }
      }
    }
  }
  return result;
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
  const [activeGroups, setActiveGroups] = useState<Set<SectorGroup>>(new Set(['cyclical', 'defensive', 'sensitive']));
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchSeqRef = useRef(0);

  // Detect dark mode
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

  const allDots = useMemo(() => data ? computeSectorDots(data) : [], [data]);
  const dots = useMemo(() => allDots.filter(d => activeGroups.has(d.group)), [allDots, activeGroups]);
  const bounds = useMemo(() => getAxisBounds(dots), [dots]);

  useEffect(() => {
    if (hoveredSector && dots.length > 0 && !dots.some(d => d.ticker === hoveredSector)) {
      setHoveredSector(null);
    }
  }, [dots, hoveredSector]);

  const toggleGroup = (group: SectorGroup) => {
    setActiveGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        if (next.size > 1) next.delete(group); // always keep at least one
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // SVG layout
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

  // Axis ticks
  const xTicks = useMemo(() => getAxisTicks(bounds.minX, bounds.maxX, 5), [bounds]);
  const yTicks = useMemo(() => getAxisTicks(bounds.minY, bounds.maxY, 4), [bounds]);

  // Collision-resolved ticker labels for non-hovered state
  const resolvedLabels = useMemo(() => {
    if (hoveredSector) return [];
    const raw = dots.map(d => ({ ticker: d.ticker, x: scaleX(d.current.x), y: scaleY(d.current.y) - 16 }));
    return resolveCollisions(raw, 22);
  }, [dots, hoveredSector, bounds]);

  // Diagnostics data
  const diagnostics = useMemo(() => {
    return dots.map(dot => {
      const q = getQuadrant(dot.current);
      const dist = Math.sqrt(dot.current.x ** 2 + dot.current.y ** 2);
      const momDir = dot.trail.length >= 2
        ? dot.current.y - dot.trail[dot.trail.length - 2].y
        : 0;
      return { ...dot, quadrant: q, distance: dist, momDirection: momDir };
    }).sort((a, b) => b.current.x - a.current.x); // sort by relative strength
  }, [dots]);

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

  if (!data || allDots.length === 0) {
    return (
      <div className="text-center py-20 text-rh-light-muted dark:text-rh-muted text-sm">
        No sector data available
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {/* How-to guide */}
      {showGuide && (
        <div className="mb-4 rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] p-4 text-xs leading-relaxed text-rh-light-muted dark:text-white/50 relative">
          <button
            onClick={() => setShowGuide(false)}
            className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-rh-light-muted dark:text-white/40 hover:text-rh-light-text dark:hover:text-white/70 hover:bg-gray-200/60 dark:hover:bg-white/[0.08] transition-colors"
            title="Close guide"
          >✕</button>
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
        {/* Header: Title + Group filters */}
        <div className="space-y-1.5 mb-1 px-[1.4%]">
          <div className="flex items-center justify-between">
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
            </div>
            {/* Period selector */}
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
          {/* Sector group filter pills */}
          <div className="flex gap-1.5">
            {([
              { group: 'cyclical' as const, label: 'Cyclical', color: '#f59e0b' },
              { group: 'defensive' as const, label: 'Defensive', color: '#10b981' },
              { group: 'sensitive' as const, label: 'Sensitive', color: '#3b82f6' },
            ]).map(g => {
              const active = activeGroups.has(g.group);
              return (
                <button
                  key={g.group}
                  onClick={() => toggleGroup(g.group)}
                  className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full transition-all border ${
                    active
                      ? 'border-current'
                      : 'border-transparent opacity-30 hover:opacity-50'
                  }`}
                  style={{ color: active ? g.color : isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          onMouseLeave={() => setHoveredSector(null)}
          style={{ contain: 'layout style paint', willChange: 'transform', touchAction: 'pan-y', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties}
        >
          <defs>
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
            {/* Per-sector glow filters — tighter region + lower stdDeviation for perf */}
            {dots.map(dot => (
              <filter key={`glow-${dot.ticker}`} id={`glow-${dot.ticker}`} x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="black" floodOpacity="0.5" result="shadow" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feFlood floodColor={dot.color} floodOpacity="0.5" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="shadow" />
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {/* Quadrant backgrounds */}
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

          {/* Quadrant labels with glow */}
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

          {/* Axis tick marks + labels */}
          {/* Axis ticks — pinned to chart edges so they don't overlap sector trails */}
          {xTicks.map(v => {
            const x = scaleX(v);
            return (
              <g key={`xt-${v}`} className="pointer-events-none">
                <line x1={x} y1={centerY - 3} x2={x} y2={centerY + 3}
                  stroke={lineColor} strokeWidth={0.8} opacity={lineOp * 1.5} />
                <text x={x} y={pad.top + plotH + 14} textAnchor="middle"
                  fontSize="8" fill={lineColor} opacity={isDark ? 0.2 : 0.25}>
                  {v > 0 ? '+' : ''}{v.toFixed(1)}%
                </text>
              </g>
            );
          })}
          {yTicks.map(v => {
            const y = scaleY(v);
            return (
              <g key={`yt-${v}`} className="pointer-events-none">
                <line x1={centerX - 3} y1={y} x2={centerX + 3} y2={y}
                  stroke={lineColor} strokeWidth={0.8} opacity={lineOp * 1.5} />
                <text x={pad.left + plotW + 2} y={y + 3} textAnchor="end"
                  fontSize="8" fill={lineColor} opacity={isDark ? 0.2 : 0.25}>
                  {v > 0 ? '+' : ''}{v.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* SPY benchmark — right side of horizontal crosshair */}
          {!hoveredSector && (() => {
            const spyReturn = data.benchmark?.changePercent ?? 0;
            const sign = spyReturn >= 0 ? '+' : '';
            const spyColor = spyReturn >= 0 ? '#10b981' : '#ef4444';
            const lx = pad.left + plotW - 6;
            const ly = centerY;
            return (
              <g className="pointer-events-none">
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

          {/* Sector trails + arrows */}
          {dots.map(dot => {
            const isHovered = hoveredSector === dot.ticker;
            const isFaded = hoveredSector != null && !isHovered;
            const opacity = isFaded ? 0.08 : 1;
            const scaledTrail = dot.trail.map(p => ({ x: scaleX(p.x), y: scaleY(p.y) }));
            const pathD = smoothPath(scaledTrail);

            let trailLen = 0;
            for (let i = 1; i < scaledTrail.length; i++) {
              const dx = scaledTrail[i].x - scaledTrail[i - 1].x;
              const dy = scaledTrail[i].y - scaledTrail[i - 1].y;
              trailLen += Math.sqrt(dx * dx + dy * dy);
            }
            return (
              <g key={dot.ticker} opacity={opacity} className="pointer-events-none" style={{ transition: 'opacity 0.3s ease' }}>
                {/* Trail glow base */}
                {pathD && (
                  <path d={pathD} fill="none" stroke={dot.color}
                    strokeWidth={isHovered ? 6 : 3} strokeLinecap="round"
                    opacity={isHovered ? 0.15 : 0.06} />
                )}
                {/* Trail solid — per-segment age gradient */}
                {scaledTrail.length >= 2 && scaledTrail.slice(0, -1).map((p, i) => {
                  const next = scaledTrail[i + 1];
                  const progress = (i + 1) / (scaledTrail.length - 1);
                  const segOpacity = 0.1 + progress * (isHovered ? 0.7 : 0.5);
                  const segWidth = 0.5 + progress * (isHovered ? 2.5 : 1.5);
                  return (
                    <line key={i} x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                      stroke={dot.color} strokeWidth={segWidth} strokeLinecap="round"
                      opacity={segOpacity} />
                  );
                })}
                {/* Animated flowing dash */}
                {pathD && trailLen > 10 && !isFaded && (
                  <path d={pathD} fill="none" stroke={dot.color}
                    strokeWidth={isHovered ? 3 : 2} strokeLinecap="round"
                    opacity={isHovered ? 0.9 : 0.6}
                    strokeDasharray={`4 ${Math.max(8, trailLen * 0.15)}`}
                    strokeDashoffset={trailLen}
                    style={{ animation: `flowDash 2.4s linear infinite` }} />
                )}

                {/* Trail dots — age gradient */}
                {scaledTrail.slice(0, -1).map((p, i) => {
                  const progress = i / Math.max(1, scaledTrail.length - 1);
                  return (
                    <circle key={i} cx={p.x} cy={p.y}
                      r={0.5 + progress * (isHovered ? 3 : 2)}
                      fill={dot.color} opacity={0.08 + progress * 0.5} />
                  );
                })}

                {/* Arrowhead */}
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
                      {/* Pulse ring */}
                      {!isFaded && (
                        <polygon
                          points={pts}
                          fill="none" stroke={dot.color} strokeWidth={1}
                          style={{
                            transformOrigin: '0 0',
                            animation: `${isHovered ? 'pulseArrow' : 'pulseArrowSm'} ${isHovered ? 1.8 : 3}s ease-out infinite`,
                          }} />
                      )}
                      <polygon points={pts} fill="none"
                        stroke={arrowOutline} strokeWidth={3.5} strokeLinejoin="round" />
                      <polygon points={pts} fill={dot.color}
                        stroke={arrowStroke} strokeWidth={isHovered ? 1.2 : 0.8}
                        strokeOpacity={isHovered ? 0.7 : 0.4} strokeLinejoin="round"
                        filter={`url(#glow-${dot.ticker})`} />
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* Hit targets */}
          {[...dots].sort((a, b) => {
            if (a.ticker === hoveredSector) return 1;
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
              onClick={() => {
                // Two-tap pattern for mobile: first tap highlights, second tap navigates
                if (hoveredSector === dot.ticker) {
                  onTickerClick?.(dot.ticker);
                } else {
                  setHoveredSector(dot.ticker);
                }
              }}
            />
          ))}

          {/* Collision-resolved ticker labels (non-hovered state) */}
          {!hoveredSector && resolvedLabels.map(label => {
            const dot = dots.find(d => d.ticker === label.ticker);
            if (!dot) return null;
            return (
              <text key={`label-${label.ticker}`}
                x={label.x} y={label.y}
                textAnchor="middle" fontSize={9} fontWeight={600}
                fill={dot.color} opacity={0.6}
                className="select-none pointer-events-none"
                style={{ textShadow }}>
                {label.ticker}
              </text>
            );
          })}

          {/* Hover tooltip */}
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
            const qColor = QUADRANT_COLORS[quadrant];
            const qText = quadrant === 'Improving' ? '↗ Improving — catching up'
              : quadrant === 'Leading' ? '⬆ Leading — outperforming'
              : quadrant === 'Weakening' ? '↘ Weakening — fading'
              : '⬇ Lagging — falling behind';

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

          {/* Hovered ticker label */}
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
                textAnchor="middle" fontSize={13} fontWeight={700}
                fill={hoveredDot.color}
                className="select-none pointer-events-none"
                style={{ textShadow }}>
                {hoveredDot.ticker}{arrow}
              </text>
            );
          })()}
        </svg>
      </div>

      {/* Legend — color key */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-center -mt-6">
        {dots.map(dot => {
          const isHov = hoveredSector === dot.ticker;
          return (
            <button
              key={dot.ticker}
              onClick={() => {
                if (hoveredSector === dot.ticker) {
                  onTickerClick?.(dot.ticker);
                } else {
                  setHoveredSector(dot.ticker);
                }
              }}
              onMouseEnter={() => setHoveredSector(dot.ticker)}
              onMouseLeave={() => setHoveredSector(null)}
              onTouchStart={() => setHoveredSector(prev => prev === dot.ticker ? null : dot.ticker)}
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

      {/* Diagnostics panel — sector breakdown table */}
      <div className="mt-4 px-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {diagnostics.map(d => {
            const qColor = QUADRANT_COLORS[d.quadrant];
            const momArrow = d.momDirection > 0.01 ? '↑' : d.momDirection < -0.01 ? '↓' : '→';
            const momColor = d.momDirection > 0.01 ? '#10b981' : d.momDirection < -0.01 ? '#ef4444' : isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
            const isHov = hoveredSector === d.ticker;
            return (
              <button
                key={d.ticker}
                onMouseEnter={() => setHoveredSector(d.ticker)}
                onMouseLeave={() => setHoveredSector(null)}
                onTouchStart={() => setHoveredSector(prev => prev === d.ticker ? null : d.ticker)}
                onClick={() => {
                  if (hoveredSector === d.ticker) {
                    onTickerClick?.(d.ticker);
                  } else {
                    setHoveredSector(d.ticker);
                  }
                }}
                className={`flex items-center gap-2 p-2 rounded-lg transition-all text-left cursor-pointer ${
                  isHov
                    ? 'bg-gray-100 dark:bg-white/[0.06]'
                    : 'bg-gray-50/50 dark:bg-white/[0.02] hover:bg-gray-100/80 dark:hover:bg-white/[0.04]'
                }`}
                style={isHov ? { boxShadow: `inset 0 0 0 1px ${d.color}40` } : undefined}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-rh-light-text dark:text-rh-text truncate">{d.ticker}</span>
                    <span className="text-[9px] font-bold px-1 py-px rounded" style={{ color: qColor, background: qColor + '18' }}>
                      {d.quadrant.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-rh-light-muted dark:text-white/40">
                      RS {d.current.x >= 0 ? '+' : ''}{d.current.x.toFixed(1)}%
                    </span>
                    <span className="text-[10px] font-semibold" style={{ color: momColor }}>
                      {momArrow}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
