import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getDividendGrowthRates, DividendGrowthResponse, HoldingGrowthData } from '../api';

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 10_000) return `$${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatCurrencyExact(val: number): string {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

interface ProjectionPoint {
  year: number;
  annualIncome: number;
  monthlyIncome: number;
  cumulativeIncome: number;
  portfolioDividendValue: number;
}

function projectIncome(
  currentAnnual: number,
  growthRate: number,
  years: number,
  reinvest: boolean,
  reinvestYield: number,
): ProjectionPoint[] {
  const points: ProjectionPoint[] = [];
  let annual = currentAnnual;
  let cumulative = 0;
  let extraAnnualFromReinvest = 0;

  const currentYear = new Date().getFullYear();
  for (let i = 0; i <= years; i++) {
    const totalAnnual = annual + extraAnnualFromReinvest;
    cumulative += i === 0 ? 0 : totalAnnual;
    points.push({
      year: currentYear + i,
      annualIncome: totalAnnual,
      monthlyIncome: totalAnnual / 12,
      cumulativeIncome: cumulative,
      portfolioDividendValue: reinvestYield > 0 ? (totalAnnual / (reinvestYield / 100)) : 0,
    });
    // Grow existing dividends
    annual *= (1 + growthRate / 100);
    // If reinvesting, dividends buy more shares that also pay dividends
    if (reinvest && reinvestYield > 0) {
      extraAnnualFromReinvest += totalAnnual * (reinvestYield / 100);
    }
  }
  return points;
}

// ─── SVG Chart ──────────────────────────────────────────
function ProjectionChart({ points, hoveredIdx, setHoveredIdx }: {
  points: ProjectionPoint[];
  hoveredIdx: number | null;
  setHoveredIdx: (i: number | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 600, H = 220;
  const pad = { t: 20, r: 16, b: 28, l: 52 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const maxVal = Math.max(...points.map(p => p.annualIncome), 1);
  const x = (i: number) => pad.l + (i / Math.max(points.length - 1, 1)) * plotW;
  const y = (v: number) => pad.t + plotH - (v / maxVal) * plotH;

  // Build area path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.annualIncome).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${(pad.t + plotH).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + plotH).toFixed(1)} Z`;

  // Y-axis ticks
  const yTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((mx - pad.l) / plotW) * (points.length - 1));
    setHoveredIdx(Math.max(0, Math.min(points.length - 1, idx)));
  }, [points.length, setHoveredIdx]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredIdx(null)}
    >
      <defs>
        <linearGradient id="drip-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00c805" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00c805" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={pad.l} y1={y(tick)} x2={W - pad.r} y2={y(tick)} stroke="currentColor" className="text-gray-200 dark:text-white/[0.06]" strokeWidth="1" />
          <text x={pad.l - 6} y={y(tick) + 4} textAnchor="end" className="fill-gray-400 dark:fill-white/30" fontSize="9" fontFamily="system-ui">
            {formatCurrency(tick)}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 6)) === 0 || i === points.length - 1).map((p) => {
        const idx = points.indexOf(p);
        return (
          <text key={p.year} x={x(idx)} y={H - 6} textAnchor="middle" className="fill-gray-400 dark:fill-white/30" fontSize="9" fontFamily="system-ui">
            {p.year}
          </text>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="url(#drip-gradient)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#00c805" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots at start and end */}
      <circle cx={x(0)} cy={y(points[0].annualIncome)} r="3" fill="#00c805" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].annualIncome)} r="3" fill="#00c805" />

      {/* Hover indicator */}
      {hoveredIdx !== null && (
        <>
          <line x1={x(hoveredIdx)} y1={pad.t} x2={x(hoveredIdx)} y2={pad.t + plotH} stroke="#00c805" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
          <circle cx={x(hoveredIdx)} cy={y(points[hoveredIdx].annualIncome)} r="4" fill="#00c805" stroke="white" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

// ─── Growth Rate Badge ──────────────────────────────────
function GrowthBadge({ rate, label }: { rate: number | null; label: string }) {
  if (rate == null) return null;
  const color = rate > 0 ? 'text-rh-green bg-rh-green/10' : rate < 0 ? 'text-rh-red bg-rh-red/10' : 'text-rh-light-muted dark:text-rh-muted bg-gray-100 dark:bg-white/[0.04]';
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>
      {label}: {rate > 0 ? '+' : ''}{rate.toFixed(1)}%
    </span>
  );
}

// ─── Holding Growth Row ─────────────────────────────────
function HoldingGrowthRow({ holding, onTickerClick }: { holding: HoldingGrowthData; onTickerClick?: (t: string) => void }) {
  const streakColor = holding.consecutiveYearsGrowth >= 10 ? 'text-rh-green' : holding.consecutiveYearsGrowth >= 5 ? 'text-yellow-400' : 'text-rh-light-muted dark:text-rh-muted';

  return (
    <div className="flex items-center justify-between py-2 px-1 -mx-1 rounded hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => onTickerClick?.(holding.ticker)}
          className="text-sm font-semibold text-rh-green hover:underline shrink-0"
        >
          {holding.ticker}
        </button>
        <div className="flex items-center gap-1 flex-wrap">
          <GrowthBadge rate={holding.growthRates['1yr']} label="1Y" />
          <GrowthBadge rate={holding.growthRates['3yr']} label="3Y" />
          <GrowthBadge rate={holding.growthRates['5yr']} label="5Y" />
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {holding.consecutiveYearsGrowth > 0 && (
          <span className={`text-[10px] font-medium ${streakColor}`} title={`${holding.consecutiveYearsGrowth} consecutive years of dividend growth`}>
            {holding.consecutiveYearsGrowth}yr streak
          </span>
        )}
        <span className="text-xs text-rh-light-text dark:text-rh-text font-medium">
          ${holding.currentAnnualDividend.toFixed(2)}/sh
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────
interface Props {
  refreshTrigger?: number;
  onTickerClick?: (ticker: string) => void;
}

type Scenario = 'conservative' | 'moderate' | 'aggressive';
const SCENARIO_RATES: Record<Scenario, { label: string; cap: number; description: string }> = {
  conservative: { label: 'Conservative', cap: 5, description: '5% growth — typical for mature dividend payers' },
  moderate:     { label: 'Moderate',     cap: 10, description: '10% growth — solid dividend growth portfolio' },
  aggressive:   { label: 'Aggressive',   cap: 20, description: 'Up to 20% — assumes strong continued growth' },
};

// Compute a realistic growth rate by capping outliers before averaging
function computeProjectionRate(holdings: HoldingGrowthData[], scenarioCap: number): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const h of holdings) {
    const rate = h.growthRates['5yr'] ?? h.growthRates['3yr'] ?? h.growthRates['1yr'];
    if (rate == null) continue;
    // Cap individual growth rates — ETF distribution spikes and new-payer inflation aren't real growth
    const cappedRate = Math.min(Math.max(rate, -10), scenarioCap);
    const weight = h.currentAnnualDividend;
    weightedSum += cappedRate * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export function DripProjector({ refreshTrigger, onTickerClick }: Props) {
  const [data, setData] = useState<DividendGrowthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [years, setYears] = useState(10);
  const [reinvest, setReinvest] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('moderate');

  useEffect(() => {
    setLoading(true);
    getDividendGrowthRates()
      .then(setData)
      .catch(() => setError('Failed to load dividend growth data'))
      .finally(() => setLoading(false));
  }, [refreshTrigger]);

  // Calculate portfolio-level projection with capped growth rates
  const projectionRate = useMemo(() => {
    if (!data) return 0;
    return computeProjectionRate(data.holdings, SCENARIO_RATES[scenario].cap);
  }, [data, scenario]);

  const projection = useMemo(() => {
    if (!data) return null;
    const currentAnnual = data.portfolio.totalAnnualIncome;
    const avgYield = data.holdings.length > 0
      ? data.holdings.reduce((sum, h) => sum + h.dividendYield, 0) / data.holdings.length
      : 0;
    return projectIncome(currentAnnual, projectionRate, years, reinvest, avgYield);
  }, [data, years, reinvest, projectionRate]);

  const hoveredPoint = projection && hoveredIdx !== null ? projection[hoveredIdx] : null;
  const finalPoint = projection ? projection[projection.length - 1] : null;

  if (loading) {
    return (
      <div className="bg-white/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-white/[0.06] rounded w-48" />
          <div className="h-[220px] bg-gray-100 dark:bg-white/[0.04] rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data || !projection) {
    return null; // Silently hide if no data — will show once Codex's API lands
  }

  if (data.portfolio.totalAnnualIncome === 0) {
    return null; // No dividend income to project
  }

  const sortedHoldings = [...data.holdings].sort((a, b) => {
    const aRate = a.growthRates['5yr'] ?? a.growthRates['3yr'] ?? a.growthRates['1yr'] ?? -999;
    const bRate = b.growthRates['5yr'] ?? b.growthRates['3yr'] ?? b.growthRates['1yr'] ?? -999;
    return bRate - aRate;
  });

  const displayHoldings = showAllHoldings ? sortedHoldings : sortedHoldings.slice(0, 5);

  return (
    <div className="bg-white/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl border border-gray-200/40 dark:border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <svg className="w-4.5 h-4.5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Dividend Income Projector</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">DRIP</span>
              <button
                onClick={() => setReinvest(!reinvest)}
                className={`w-7 h-4 rounded-full transition-colors relative ${reinvest ? 'bg-rh-green' : 'bg-gray-300 dark:bg-white/[0.12]'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${reinvest ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
            </label>
          </div>
        </div>

        {/* Current income summary */}
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-2xl font-bold text-rh-light-text dark:text-rh-text">
            {formatCurrencyExact(data.portfolio.totalMonthlyIncome)}
          </span>
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">/mo today</span>
          {finalPoint && (
            <>
              <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="text-2xl font-bold text-rh-green">
                {formatCurrencyExact(finalPoint.monthlyIncome)}
              </span>
              <span className="text-xs text-rh-light-muted dark:text-rh-muted">/mo in {years}yr</span>
            </>
          )}
        </div>

        {/* Year selector + Scenario selector */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1">
            {[5, 10, 15, 20, 30].map(yr => (
              <button
                key={yr}
                onClick={() => setYears(yr)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                  years === yr
                    ? 'bg-rh-green text-white shadow-sm'
                    : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                {yr}Y
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(Object.keys(SCENARIO_RATES) as Scenario[]).map(s => (
              <button
                key={s}
                onClick={() => setScenario(s)}
                title={SCENARIO_RATES[s].description}
                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                  scenario === s
                    ? 'bg-rh-green/15 text-rh-green'
                    : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                {SCENARIO_RATES[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-3 pb-1">
        <ProjectionChart points={projection} hoveredIdx={hoveredIdx} setHoveredIdx={setHoveredIdx} />
      </div>

      {/* Disclaimer */}
      <p className="px-5 pb-2 text-[9px] text-rh-light-muted/50 dark:text-rh-muted/40 leading-tight">
        Projection based on historical dividend growth rates with a {SCENARIO_RATES[scenario].cap}% annual cap. Actual results will vary. Does not include new contributions.
      </p>

      {/* Hover tooltip */}
      {hoveredPoint && (
        <div className="px-5 pb-3 flex items-center gap-4 text-xs">
          <span className="text-rh-light-muted dark:text-rh-muted">{hoveredPoint.year}</span>
          <span className="text-rh-light-text dark:text-rh-text font-medium">{formatCurrencyExact(hoveredPoint.annualIncome)}/yr</span>
          <span className="text-rh-green font-medium">{formatCurrencyExact(hoveredPoint.monthlyIncome)}/mo</span>
          <span className="text-rh-light-muted dark:text-rh-muted">Cumulative: {formatCurrency(hoveredPoint.cumulativeIncome)}</span>
        </div>
      )}

      {/* Portfolio growth stats */}
      <div className="px-5 py-3 border-t border-gray-200/30 dark:border-white/[0.06] grid grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">Proj. Growth</p>
          <p className={`text-sm font-semibold ${projectionRate > 0 ? 'text-rh-green' : 'text-rh-light-text dark:text-rh-text'}`}>
            {projectionRate > 0 ? '+' : ''}{projectionRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">Annual Income</p>
          <p className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{formatCurrencyExact(data.portfolio.totalAnnualIncome)}</p>
        </div>
        <div>
          <p className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">{years}Y Cumulative</p>
          <p className="text-sm font-semibold text-rh-green">{formatCurrency(finalPoint?.cumulativeIncome ?? 0)}</p>
        </div>
      </div>

      {/* Per-holding growth rates */}
      {sortedHoldings.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-200/30 dark:border-white/[0.06]">
          <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50 mb-2">
            Dividend Growth by Holding
          </p>
          <div className="divide-y divide-gray-100/50 dark:divide-white/[0.04]">
            {displayHoldings.map(h => (
              <HoldingGrowthRow key={h.ticker} holding={h} onTickerClick={onTickerClick} />
            ))}
          </div>
          {sortedHoldings.length > 5 && (
            <button
              onClick={() => setShowAllHoldings(!showAllHoldings)}
              className="mt-2 text-[11px] text-rh-green hover:underline"
            >
              {showAllHoldings ? 'Show less' : `Show all ${sortedHoldings.length} holdings`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
