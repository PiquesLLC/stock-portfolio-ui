import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IncomeInsightsResponse, IncomeCategoryDetail, IncomeHealthDetails } from '../types';
import { getIncomeInsights, getCashInterestAccrual, CashInterestAccrual, downloadDividendCalendar } from '../api';
import { DripProjector } from './DripProjector';

interface Props {
  refreshTrigger?: number;
  onTickerClick?: (ticker: string) => void;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function getScoreColor(score: number, max: number = 100): string {
  const pct = (score / max) * 100;
  if (pct >= 75) return 'text-rh-green';
  if (pct >= 50) return 'text-yellow-400';
  if (pct >= 25) return 'text-orange-400';
  return 'text-rh-red';
}

function getBarColorClass(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 75) return 'bg-rh-green';
  if (pct >= 50) return 'bg-yellow-400';
  if (pct >= 25) return 'bg-orange-400';
  return 'bg-rh-red';
}

function getGradeColor(grade: string): string {
  if (grade === 'Excellent' || grade === 'Strong') return 'bg-rh-green/20 text-rh-green';
  if (grade === 'Good' || grade === 'Moderate') return 'bg-yellow-400/20 text-yellow-400';
  if (grade === 'Fair') return 'bg-orange-400/20 text-orange-400';
  return 'bg-rh-red/20 text-rh-red';
}

// Map API grades to display grades
function getDisplayGrade(grade: string): string {
  if (grade === 'Excellent') return 'Strong';
  if (grade === 'Good') return 'Good';
  if (grade === 'Fair') return 'Moderate';
  return 'Weak';
}

type IncomeCategoryKey = 'stability' | 'growth' | 'coverage' | 'diversification';

const CATEGORY_LABELS: Record<IncomeCategoryKey, string> = {
  stability: 'Stability',
  growth: 'Growth',
  coverage: 'Coverage',
  diversification: 'Diversification',
};

// ============================================================================
// DRAWER
// ============================================================================

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  categoryKey: IncomeCategoryKey;
  details: IncomeHealthDetails;
}

function Drawer({ open, onClose, categoryKey, details }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const catDetail: IncomeCategoryDetail = details[categoryKey];
  const title = CATEGORY_LABELS[categoryKey];

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`${title} explanation`}
        className="fixed top-0 right-0 h-full w-full max-w-md bg-white/95 dark:bg-[#0a0a0b]/95 backdrop-blur-xl border-l border-gray-200/30 dark:border-white/[0.04]
          shadow-xl z-50 overflow-y-auto outline-none animate-slide-in-right"
      >
        <div className="sticky top-0 bg-white/95 dark:bg-[#0a0a0b]/95 backdrop-blur-xl border-b border-gray-200/30 dark:border-white/[0.04] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-rh-light-muted dark:text-rh-muted
                hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">{title}</h2>
              <p className={`text-sm font-medium ${getScoreColor(catDetail.score, catDetail.maxScore)}`}>
                Score: {catDetail.score}/{catDetail.maxScore}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-rh-light-muted dark:text-rh-muted
              hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {catDetail.calcBullets.length > 0 && (
            <Section title="How we calculated this">
              <ul className="space-y-1.5">
                {catDetail.calcBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-rh-light-muted dark:text-rh-muted">
                    <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {catDetail.evidenceBullets.length > 0 && (
            <Section title="Evidence from your portfolio">
              <ul className="space-y-1.5">
                {catDetail.evidenceBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-rh-light-text dark:text-rh-text">
                    <span className="text-blue-400 mt-0.5 shrink-0">→</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {catDetail.drivers.length > 0 && (
            <Section title="What's affecting your score">
              <div className="space-y-3">
                {catDetail.drivers.map((d, i) => (
                  <div key={i} className="bg-gray-50/40 dark:bg-white/[0.02] rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">{d.label}</span>
                      <span className="text-sm font-mono text-blue-400">{d.value}</span>
                    </div>
                    <p className="text-xs text-rh-light-muted dark:text-rh-muted">{d.impact}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

        </div>
      </div>
    </>,
    document.body
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-2">{title}</h3>
      {children}
    </div>
  );
}

// ============================================================================
// BREAKDOWN ROW
// ============================================================================

function BreakdownRow({
  label,
  value,
  maxValue = 25,
  onClick,
}: {
  label: string;
  value: number;
  maxValue?: number;
  onClick: () => void;
}) {
  const pct = Math.max(0, (value / maxValue) * 100);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left rounded-lg px-2 py-1.5 -mx-2
        hover:bg-rh-light-bg dark:hover:bg-rh-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
        transition-colors cursor-pointer group"
      aria-label={`${label}: ${value}/${maxValue} — click for details`}
    >
      <span className="text-sm text-rh-light-muted dark:text-rh-muted w-28">{label}</span>
      <div className="flex-1 h-2 bg-rh-light-border dark:bg-rh-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getBarColorClass(value, maxValue)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm w-12 text-right font-medium ${getScoreColor(value, maxValue)}`}>{value}/{maxValue}</span>
      <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// ============================================================================
// INCOME HEALTH SCORE
// ============================================================================

function IncomeHealthScore({ data }: { data: IncomeInsightsResponse['healthScore'] }) {
  const { overall, breakdown, grade, details } = data;
  const [selectedCategory, setSelectedCategory] = useState<IncomeCategoryKey | null>(null);

  return (
    <>
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-1">
              Income Health Score
            </h3>
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${getGradeColor(grade)}`}>
              {getDisplayGrade(grade)}
            </span>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${getScoreColor(overall)}`}>
              {overall}
            </div>
            <div className="text-xs text-rh-light-muted dark:text-rh-muted">/ 100</div>
          </div>
        </div>

        <div className="space-y-1">
          <BreakdownRow label="Stability" value={breakdown.stability} onClick={() => setSelectedCategory('stability')} />
          <BreakdownRow label="Growth" value={breakdown.growth} onClick={() => setSelectedCategory('growth')} />
          <BreakdownRow label="Coverage" value={breakdown.coverage} onClick={() => setSelectedCategory('coverage')} />
          <BreakdownRow label="Diversification" value={breakdown.diversification} onClick={() => setSelectedCategory('diversification')} />
        </div>
      </div>

      {selectedCategory && (
        <Drawer
          open={!!selectedCategory}
          onClose={() => setSelectedCategory(null)}
          categoryKey={selectedCategory}
          details={details}
        />
      )}
    </>
  );
}

// ============================================================================
// KEY DRIVERS
// ============================================================================

function IncomeKeyDrivers({ drivers }: { drivers: string[] }) {
  if (drivers.length === 0) return null;

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
      <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">
        Key Income Drivers
      </h3>
      <ul className="space-y-2">
        {drivers.slice(0, 4).map((driver, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-rh-light-text dark:text-rh-text">
            <span className="text-rh-green mt-0.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <span>{driver}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// SIGNAL CARDS
// ============================================================================

function IncomeSignalCards({ signals, cashInterest }: { signals: IncomeInsightsResponse['signals']; cashInterest?: CashInterestAccrual | null }) {
  const { cashFlow, momentum, reliability } = signals;

  const trendColor = momentum.trend === 'growing' ? 'text-rh-green' :
    momentum.trend === 'declining' ? 'text-rh-red' : 'text-rh-light-muted dark:text-rh-muted';

  const reliabilityColor = reliability.classification === 'stable' ? 'text-rh-green' :
    reliability.classification === 'moderate' ? 'text-yellow-400' : 'text-rh-red';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Cash Flow */}
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-medium text-rh-light-muted dark:text-rh-muted">Cash Flow</span>
        </div>
        <div className="text-xl font-bold text-rh-light-text dark:text-rh-text">
          {formatCurrency(cashFlow.annualIncome)}
          <span className="text-xs font-normal text-rh-light-muted dark:text-rh-muted">/yr</span>
        </div>
        <div className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
          {formatCurrency(cashFlow.monthlyIncome)}/mo
        </div>
        {cashInterest && cashInterest.annualAccrual > 0 && (
          <div className="text-[10px] text-blue-400 mt-1.5 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            +{formatCurrency(cashInterest.annualAccrual)}/yr cash interest ({cashInterest.cashInterestRate}% APY)
          </div>
        )}
      </div>

      {/* Momentum */}
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg className={`w-4 h-4 ${trendColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="text-xs font-medium text-rh-light-muted dark:text-rh-muted">Momentum</span>
        </div>
        <div className={`text-xl font-bold ${trendColor}`}>
          {momentum.yoyChangePct !== null ? (
            <>
              {momentum.yoyChangePct >= 0 ? '+' : ''}{momentum.yoyChangePct.toFixed(1)}%
            </>
          ) : (
            <span className="text-rh-light-muted dark:text-rh-muted">--</span>
          )}
          <span className="text-xs font-normal text-rh-light-muted dark:text-rh-muted"> YoY</span>
        </div>
        <div className="text-xs text-rh-light-muted dark:text-rh-muted mt-1 capitalize">
          {momentum.trend}
        </div>
      </div>

      {/* Reliability */}
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg className={`w-4 h-4 ${reliabilityColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-xs font-medium text-rh-light-muted dark:text-rh-muted">Reliability</span>
        </div>
        <div className={`text-xl font-bold capitalize ${reliabilityColor}`}>
          {reliability.classification}
        </div>
        <div className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
          {reliability.consecutiveMonths} consecutive months
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CONTRIBUTORS
// ============================================================================

function IncomeContributors({
  contributors,
  onTickerClick,
}: {
  contributors: IncomeInsightsResponse['contributors'];
  onTickerClick?: (ticker: string) => void;
}) {
  if (contributors.length === 0) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">
          Top Income Contributors
        </h3>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted text-center py-4">
          No dividend income recorded yet.
        </p>
      </div>
    );
  }

  const maxDividend = Math.max(...contributors.map(c => c.dividendDollar));

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
      <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-4">
        Top Income Contributors
      </h3>
      <div className="space-y-3">
        {contributors.slice(0, 7).map((c) => (
          <div key={c.ticker} className="flex items-center gap-3">
            <button
              onClick={() => onTickerClick?.(c.ticker)}
              className="w-14 text-xs font-mono font-semibold text-rh-green hover:underline text-left"
            >
              {c.ticker}
            </button>
            <div className="flex-1">
              <div className="h-4 bg-rh-light-bg dark:bg-rh-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-rh-green/70 rounded-full transition-all duration-500"
                  style={{ width: `${(c.dividendDollar / maxDividend) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-right w-20">
              <div className="text-xs font-semibold text-rh-light-text dark:text-rh-text">
                {formatCurrency(c.dividendDollar)}
              </div>
              <div className="text-[10px] text-rh-light-muted dark:text-rh-muted">
                {c.percentOfTotal.toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// CONCENTRATION
// ============================================================================

function IncomeConcentration({ data }: { data: IncomeInsightsResponse['concentration'] }) {
  if (!data.top1Ticker) return null;

  return (
    <div className={`bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm border rounded-lg p-5 ${
      data.isConcentrated ? 'border-orange-400/50' : 'border-gray-200/30 dark:border-white/[0.04]'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
          Income Concentration
        </h3>
        {data.isConcentrated && (
          <span className="px-2 py-0.5 text-[10px] font-medium bg-orange-400/20 text-orange-400 rounded">
            Concentrated
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1">
            Top 1
          </div>
          <div className="text-lg font-bold text-rh-light-text dark:text-rh-text">
            {data.top1Percent.toFixed(1)}%
          </div>
          <div className="text-xs text-rh-light-muted dark:text-rh-muted">
            {data.top1Ticker}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1">
            Top 3
          </div>
          <div className="text-lg font-bold text-rh-light-text dark:text-rh-text">
            {data.top3Percent.toFixed(1)}%
          </div>
          <div className="text-xs text-rh-light-muted dark:text-rh-muted">
            {data.top3Tickers.join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TIMELINE
// ============================================================================

function IncomeDividendTimeline({
  events,
  onTickerClick,
}: {
  events: IncomeInsightsResponse['timeline'];
  onTickerClick?: (ticker: string) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">
          Dividend Timeline
        </h3>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted text-center py-4">
          No recent dividend payments.
        </p>
      </div>
    );
  }

  const hasEstimatedDates = events.some(e => e.dateEstimated);

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
          Dividend Timeline
        </h3>
        <button
          onClick={() => downloadDividendCalendar(6)}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-rh-green bg-rh-green/10 hover:bg-rh-green/20 rounded-full transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Export Calendar
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto scrollbar-minimal">
        <div className="space-y-3">
          {events.map((event, i) => (
            <div key={`${event.ticker}-${event.date}-${i}`} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-rh-green flex-shrink-0" />
              <button
                onClick={() => onTickerClick?.(event.ticker)}
                className="text-xs font-mono font-semibold text-rh-green hover:underline w-12 text-left"
              >
                {event.ticker}
              </button>
              <div className="flex-1 text-xs text-rh-light-muted dark:text-rh-muted" title={event.dateEstimated ? 'Date is estimated' : ''}>
                {event.dateEstimated && <span className="text-orange-400">~</span>}
                {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="text-xs font-semibold text-rh-green">
                +{formatCurrency(event.amountReceived)}
              </div>
            </div>
          ))}
        </div>
      </div>
      {hasEstimatedDates && (
        <p className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 mt-3">
          <span className="text-orange-400">~</span> Date estimated from ex-date
        </p>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function IncomeInsights({ refreshTrigger, onTickerClick }: Props) {
  const [data, setData] = useState<IncomeInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashInterest, setCashInterest] = useState<CashInterestAccrual | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [result, interest] = await Promise.all([
        getIncomeInsights('today'),
        getCashInterestAccrual().catch(() => null),
      ]);
      if (mountedRef.current) {
        setData(result);
        setCashInterest(interest);
      }
    } catch (err) {
      console.error('Failed to fetch income insights:', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData, refreshTrigger]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse bg-gray-100/60 dark:bg-white/[0.06] rounded-lg h-48" />
        <div className="animate-pulse bg-gray-100/60 dark:bg-white/[0.06] rounded-lg h-24" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-gray-100/60 dark:bg-white/[0.06] rounded-lg h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-12 text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-rh-light-text dark:text-rh-text font-medium mb-2">No income data available</p>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Add dividend-paying stocks to see income analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Row: Health Score + Key Drivers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IncomeHealthScore data={data.healthScore} />
        <IncomeKeyDrivers drivers={data.keyDrivers} />
      </div>

      {/* Signal Cards */}
      <IncomeSignalCards signals={data.signals} cashInterest={cashInterest} />

      {/* DRIP Income Projector */}
      <DripProjector refreshTrigger={refreshTrigger} onTickerClick={onTickerClick} />

      {/* Contributors + Concentration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IncomeContributors contributors={data.contributors} onTickerClick={onTickerClick} />
        <div className="space-y-6">
          <IncomeConcentration data={data.concentration} />
          <IncomeDividendTimeline events={data.timeline} onTickerClick={onTickerClick} />
        </div>
      </div>
    </div>
  );
}
