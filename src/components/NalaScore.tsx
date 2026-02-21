import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NalaScoreResponse, NalaDimension, NalaSubMetric } from '../types';
import { getNalaScore } from '../api';

interface NalaScoreProps {
  ticker: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 75) return 'text-rh-green';
  if (score >= 50) return 'text-yellow-400';
  if (score >= 25) return 'text-orange-400';
  return 'text-red-400';
}

function getBarColor(score: number): string {
  if (score >= 75) return 'bg-rh-green';
  if (score >= 50) return 'bg-yellow-400';
  if (score >= 25) return 'bg-orange-400';
  return 'bg-red-400';
}

function getBarColorHex(score: number): string {
  if (score >= 75) return '#00c805';
  if (score >= 50) return '#facc15';
  if (score >= 25) return '#fb923c';
  return '#f87171';
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const DIM_ICONS: Record<string, string> = {
  Value: 'V', Quality: 'Q', Growth: 'G', Dividends: 'D', Momentum: 'M',
  'Cost Efficiency': 'C', Diversification: 'Di', Performance: 'P',
};

// ── Pentagon Radar Chart ─────────────────────────────────────────

function PentagonChart({ dimensions, availableDimensions }: { dimensions: Record<string, NalaDimension>; availableDimensions: string[] }) {
  const cx = 100, cy = 105, r = 72;
  const dims = Object.values(dimensions);
  const n = dims.length || 5;
  const labels = dims.map(d => d.name);
  const scores = dims.map(d => availableDimensions.includes(d.name) ? d.score : 0);

  function vertex(i: number, radius: number): [number, number] {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  }

  function polygon(radii: number[]): string {
    return radii.map((rad, i) => vertex(i, rad).join(',')).join(' ');
  }

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Data polygon (score/100 * r)
  const dataRadii = scores.map(s => (s / 100) * r);

  return (
    <svg viewBox="0 0 200 210" className="w-full max-w-[220px] mx-auto">
      {/* Grid rings */}
      {rings.map((pct, ri) => (
        <polygon
          key={ri}
          points={polygon(Array(n).fill(r * pct))}
          fill="none"
          className="stroke-gray-300/30 dark:stroke-white/[0.08]"
          strokeWidth="0.5"
        />
      ))}

      {/* Axis lines */}
      {Array.from({ length: n }, (_, i) => {
        const [vx, vy] = vertex(i, r);
        return <line key={i} x1={cx} y1={cy} x2={vx} y2={vy} className="stroke-gray-300/20 dark:stroke-white/[0.06]" strokeWidth="0.5" />;
      })}

      {/* Data shape */}
      <polygon
        points={polygon(dataRadii)}
        fill="#00c805"
        fillOpacity="0.15"
        stroke="#00c805"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {dataRadii.map((rad, i) => {
        const [px, py] = vertex(i, rad);
        return <circle key={i} cx={px} cy={py} r="3" fill="#00c805" />;
      })}

      {/* Labels */}
      {labels.map((label, i) => {
        const [lx, ly] = vertex(i, r + 18);
        const dim = dims[i];
        const available = availableDimensions.includes(dim.name);
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`text-[9px] font-semibold ${available ? 'fill-gray-600 dark:fill-white/70' : 'fill-gray-400/50 dark:fill-white/20'}`}
          >
            {label}
          </text>
        );
      })}

      {/* Score numbers near each vertex */}
      {scores.map((score, i) => {
        const dim = dims[i];
        if (!availableDimensions.includes(dim.name)) return null;
        const [lx, ly] = vertex(i, r + 8);
        return (
          <text
            key={`s${i}`}
            x={lx}
            y={ly + 10}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[7px] fill-gray-400 dark:fill-white/40"
          >
            {score}
          </text>
        );
      })}
    </svg>
  );
}

// ── Sub-Metric Row ───────────────────────────────────────────────

function SubMetricRow({ metric }: { metric: NalaSubMetric }) {
  const pct = (metric.score / metric.maxScore) * 100;
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-rh-light-text dark:text-rh-text">{metric.name}</span>
        <span className="text-xs text-rh-light-muted dark:text-rh-muted">{metric.rawValue}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200/60 dark:bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${getBarColor(pct)} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-rh-light-muted/70 dark:text-rh-muted/60 mt-1">{metric.explanation}</p>
    </div>
  );
}

// ── Drawer (follows HealthScore pattern) ─────────────────────────

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  dimension: NalaDimension | null;
}

function Drawer({ open, onClose, dimension }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!dimension) return null;

  const scorePct = dimension.score;

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        className={`absolute right-0 top-0 h-full w-full max-w-[380px] bg-white/90 dark:bg-[#111]/95 backdrop-blur-2xl
          border-l border-gray-200/50 dark:border-white/[0.06] shadow-2xl
          transform transition-transform duration-200 ease-out overflow-y-auto scrollbar-minimal
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${getBarColor(scorePct)} text-white`}>
                {DIM_ICONS[dimension.name] || '?'}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{dimension.name}</h3>
                <span className={`text-lg font-bold ${getScoreColor(scorePct)}`}>{scorePct}/100</span>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-rh-light-muted dark:text-rh-muted hover:bg-black/5 dark:hover:bg-white/[0.08] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Weight badge */}
          <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/50 mb-4">
            Weight: {Math.round(dimension.weight * 100)}% of composite score
          </div>

          {/* Sub-metrics */}
          <div className="divide-y divide-gray-200/30 dark:divide-white/[0.04]">
            {dimension.subMetrics.map((sm, i) => (
              <SubMetricRow key={i} metric={sm} />
            ))}
          </div>

          {/* Insight */}
          {dimension.insight && (
            <div className="mt-4 p-3 rounded-lg bg-gray-100/50 dark:bg-white/[0.03] border border-gray-200/30 dark:border-white/[0.04]">
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">{dimension.insight}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Dimension Progress Row ───────────────────────────────────────

function DimensionRow({ dimension, onClick, available }: { dimension: NalaDimension; onClick: () => void; available: boolean }) {
  if (!available) return null;
  const pct = dimension.score;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2 group hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-lg px-1 transition-colors text-left"
    >
      <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${getBarColor(pct)} text-white flex-shrink-0`}>
        {DIM_ICONS[dimension.name] || dimension.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium text-rh-light-text dark:text-rh-text">{dimension.name}</span>
          <span className={`text-xs font-semibold ${getScoreColor(pct)}`}>{pct}</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-200/60 dark:bg-white/[0.06] overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${getBarColor(pct)}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <svg className="w-3.5 h-3.5 text-rh-light-muted/40 dark:text-rh-muted/30 group-hover:text-rh-light-text dark:group-hover:text-rh-text transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function NalaScore({ ticker }: NalaScoreProps) {
  const [data, setData] = useState<NalaScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerDim, setDrawerDim] = useState<NalaDimension | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    getNalaScore(ticker)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-5 mb-6 animate-pulse">
        <div className="h-4 w-24 bg-gray-200/50 dark:bg-white/[0.06] rounded mb-4" />
        <div className="h-40 bg-gray-200/30 dark:bg-white/[0.03] rounded-lg" />
      </div>
    );
  }

  if (!data || data.availableDimensions.length < 2) return null;

  const { composite, grade, dimensions, keyInsights, availableDimensions, isETF, dataAge, lastUpdated } = data;

  return (
    <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Nala Score</h3>
          <span className="text-[9px] uppercase tracking-wider font-semibold text-blue-500/80 dark:text-blue-400/70 bg-blue-500/10 dark:bg-blue-400/10 px-1.5 py-0.5 rounded">
            Beta
          </span>
          {isETF && (
            <span className="text-[9px] uppercase tracking-wider text-blue-500/70 dark:text-blue-400/60 bg-blue-500/10 dark:bg-blue-400/10 px-1.5 py-0.5 rounded">
              ETF
            </span>
          )}
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="w-6 h-6 flex items-center justify-center rounded-full text-rh-light-muted/60 dark:text-rh-muted/50 hover:text-rh-light-text dark:hover:text-rh-text hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors"
          title="About Nala Score"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div className="mb-4 p-3.5 rounded-lg bg-blue-50/50 dark:bg-blue-500/[0.04] border border-blue-200/30 dark:border-blue-400/[0.08]">
          <p className="text-xs text-rh-light-text/80 dark:text-rh-text/70 leading-relaxed mb-2">
            <span className="font-semibold">Nala Score</span> grades {isETF ? 'ETFs' : 'stocks'} across 5 key dimensions. Each dimension contains 4 data-driven sub-metrics — tap any dimension to see the full breakdown.
          </p>
          <div className="space-y-1.5 text-[11px] text-rh-light-muted dark:text-rh-muted">
            {isETF ? (<>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">C</span><span><strong>Cost Efficiency</strong> (25%) — Expense ratio, fund size, holdings count, track record</span></div>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">Di</span><span><strong>Diversification</strong> (25%) — Category breadth, holdings depth, underlying valuations, income</span></div>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">P</span><span><strong>Performance</strong> (20%) — 52-week position, 6-month and 3-month returns, beta</span></div>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">D</span><span><strong>Dividends</strong> (15%) — Yield, payout ratio, growth streak, growth rate</span></div>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">M</span><span><strong>Momentum</strong> (15%) — 52-week position, returns, beta stability, analyst consensus</span></div>
            </>) : (<>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">V</span><span><strong>Value</strong> (25%) — Is the stock fairly priced? P/E, PEG, forward estimates, analyst targets</span></div>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">Q</span><span><strong>Quality</strong> (25%) — Well-run business? ROE, margins, debt, free cash flow</span></div>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">G</span><span><strong>Growth</strong> (20%) — Is it growing? Revenue, earnings, and cash flow growth rates</span></div>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">D</span><span><strong>Dividends</strong> (15%) — Rewards shareholders? Yield, payout ratio, growth streak</span></div>
              <div className="flex items-start gap-2"><span className="text-rh-green font-bold mt-px">M</span><span><strong>Momentum</strong> (15%) — Market confirming? 52-week position, returns, analyst consensus</span></div>
            </>)}
          </div>
          <p className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/40 mt-2.5">
            Scores update daily. {isETF ? 'Cost Efficiency & Diversification' : 'Quality & Value'} are weighted highest. This feature is in beta — scoring methodology may be refined over time.
          </p>
        </div>
      )}

      {/* Top section: Pentagon + Score */}
      <div className="flex items-center gap-4 mb-4">
        {/* Pentagon Chart */}
        <div className="flex-shrink-0 w-[180px]">
          <PentagonChart dimensions={dimensions} availableDimensions={availableDimensions} />
        </div>

        {/* Composite Score */}
        <div className="flex-1 flex flex-col items-center">
          {/* Circular score */}
          <div className="relative w-20 h-20 mb-2">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-gray-200/40 dark:stroke-white/[0.06]" strokeWidth="2.5" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                stroke={getBarColorHex(composite)}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${(composite / 100) * 97.4} 97.4`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-xl font-bold ${getScoreColor(composite)}`}>{composite}</span>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
            grade === 'Strong' ? 'bg-rh-green/15 text-rh-green' :
            grade === 'Good' ? 'bg-yellow-400/15 text-yellow-500' :
            grade === 'Fair' ? 'bg-orange-400/15 text-orange-400' :
            'bg-red-400/15 text-red-400'
          }`}>
            {grade}
          </span>
          {lastUpdated && (
            <div className="flex items-center gap-1 mt-1.5">
              {dataAge === 'stale' && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              )}
              <span className={`text-[10px] ${
                dataAge === 'stale'
                  ? 'text-amber-500/80 dark:text-amber-400/70'
                  : 'text-rh-light-muted/50 dark:text-rh-muted/40'
              }`}>
                {dataAge === 'stale' ? 'Data may be stale' : `Updated ${formatRelativeTime(lastUpdated)}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dimension Bars */}
      <div className="space-y-0.5 mb-3">
        {Object.keys(dimensions).map(key => (
          <DimensionRow
            key={key}
            dimension={dimensions[key]}
            available={availableDimensions.includes(dimensions[key].name)}
            onClick={() => setDrawerDim(dimensions[key])}
          />
        ))}
      </div>

      {/* Key Insights */}
      {keyInsights.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200/30 dark:border-white/[0.04]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors mb-2"
          >
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Key Insights
          </button>
          {expanded && (
            <ul className="space-y-1.5">
              {keyInsights.map((insight, i) => (
                <li key={i} className="text-[11px] text-rh-light-muted dark:text-rh-muted leading-relaxed flex gap-2">
                  <span className="text-rh-green mt-0.5 flex-shrink-0">{i === 0 ? '>' : insight.startsWith('Watch') ? '!' : '+'}</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Drawer */}
      <Drawer
        open={drawerDim !== null}
        onClose={() => setDrawerDim(null)}
        dimension={drawerDim}
      />
    </div>
  );
}
