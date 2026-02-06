import { useState, useEffect, useRef } from 'react';
import { HealthScore as HealthScoreType, HealthCategoryDetail, HealthScoreDetails } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface HealthScoreProps {
  data: HealthScoreType;
}

type CategoryKey = 'concentration' | 'volatility' | 'drawdown' | 'diversification' | 'margin';

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  concentration: 'Concentration',
  volatility: 'Volatility',
  drawdown: 'Drawdown',
  diversification: 'Diversification',
  margin: 'Margin Penalty',
};

function getScoreColor(score: number): string {
  if (score >= 75) return 'text-rh-green';
  if (score >= 50) return 'text-yellow-400';
  if (score >= 25) return 'text-orange-400';
  return 'text-rh-red';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Needs Work';
  return 'At Risk';
}

// ============================================================
// DRAWER
// ============================================================

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  categoryKey: CategoryKey;
  details: HealthScoreDetails;
}

function Drawer({ open, onClose, categoryKey, details }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Trap focus inside drawer when open
  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const isMargin = categoryKey === 'margin';
  const marginDetail = details.margin;

  const catDetail: HealthCategoryDetail | null = isMargin
    ? null
    : details[categoryKey as Exclude<CategoryKey, 'margin'>];

  const title = CATEGORY_LABELS[categoryKey];
  const scoreLabel = isMargin
    ? (marginDetail.penalty > 0 ? `Penalty: -${marginDetail.penalty} points` : 'No penalty')
    : `Score: ${catDetail!.score}/${catDetail!.maxScore}`;

  const calcBullets = isMargin ? marginDetail.calcBullets : catDetail!.calcBullets;
  const evidenceBullets = isMargin ? marginDetail.evidenceBullets : catDetail!.evidenceBullets;
  const drivers = isMargin ? marginDetail.drivers : catDetail!.drivers;
  const fixes = isMargin ? marginDetail.quickFixes : catDetail!.quickFixes;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`${title} explanation`}
        className="fixed top-0 right-0 h-full w-full max-w-md bg-black/80 dark:bg-black/80 backdrop-blur-xl border-l border-white/[0.04]
          shadow-xl z-50 overflow-y-auto outline-none animate-slide-in-right"
      >
        {/* Header */}
        <div className="sticky top-0 bg-black/80 dark:bg-black/80 backdrop-blur-xl border-b border-white/[0.04] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">{title}</h2>
            <p className={`text-sm font-medium ${isMargin ? (marginDetail.penalty > 0 ? 'text-rh-red' : 'text-rh-green') : getBarColor(catDetail!.score, catDetail!.maxScore)}`}>
              {scoreLabel}
            </p>
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
          {/* How we calculated */}
          {calcBullets.length > 0 && (
            <Section title="How we calculated this">
              <ul className="space-y-1.5">
                {calcBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-rh-light-muted dark:text-rh-muted">
                    <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Evidence */}
          {evidenceBullets.length > 0 && (
            <Section title="Evidence from your holdings">
              <ul className="space-y-1.5">
                {evidenceBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-rh-light-text dark:text-rh-text">
                    <span className="text-blue-400 mt-0.5 shrink-0">→</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Drivers */}
          {drivers.length > 0 && (
            <Section title="What's affecting your score">
              <div className="space-y-3">
                {drivers.map((d, i) => (
                  <div key={i} className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg px-4 py-3">
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

          {/* Quick fixes */}
          {fixes.length > 0 && (
            <Section title="Quick fixes">
              <ul className="space-y-1.5">
                {fixes.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-rh-green">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </>
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

// ============================================================
// BAR COLOR HELPER (text class)
// ============================================================
function getBarColor(value: number, maxValue: number): string {
  const pct = (value / maxValue) * 100;
  if (pct >= 80) return 'text-rh-green';
  if (pct >= 50) return 'text-yellow-400';
  return 'text-rh-red';
}

// ============================================================
// CLICKABLE BREAKDOWN ROW
// ============================================================
function BreakdownRow({
  label,
  value,
  maxValue = 25,
  hasDetail,
  onClick,
}: {
  label: string;
  value: number;
  maxValue?: number;
  hasDetail: boolean;
  onClick: () => void;
}) {
  const pct = Math.max(0, (value / maxValue) * 100);

  const content = (
    <>
      <span className="text-sm text-rh-light-muted dark:text-rh-muted w-28">{label}</span>
      <div className="flex-1 h-2 bg-rh-light-border dark:bg-rh-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 80 ? 'bg-rh-green' : pct >= 50 ? 'bg-yellow-400' : 'bg-rh-red'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-rh-light-text dark:text-rh-text w-10 text-right">{value}/{maxValue}</span>
      {hasDetail && (
        <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </>
  );

  if (!hasDetail) {
    return <div className="flex items-center gap-3">{content}</div>;
  }

  return (
    <button
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="flex items-center gap-3 w-full text-left rounded-lg px-2 py-1.5 -mx-2
        hover:bg-rh-light-bg dark:hover:bg-rh-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
        transition-colors cursor-pointer group"
      aria-label={`${label}: ${value}/${maxValue} — click for details`}
    >
      {content}
    </button>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function HealthScore({ data }: HealthScoreProps) {
  const { overall, breakdown, reasons, quickFixes, partial, details } = data;
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [showAllReasons, setShowAllReasons] = useState(false);

  const hasDetails = !!details;
  const visibleReasons = showAllReasons ? reasons : reasons.slice(0, 2);

  if (partial) {
    return (
      <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-6 shadow-sm dark:shadow-none">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4 flex items-center gap-2">Portfolio Health <InfoTooltip text="Score from 0-100 based on concentration (top holding weight), volatility (annualized std dev of daily returns), max drawdown (largest peak-to-trough decline), diversification (number of holdings and sectors), and margin usage penalty." /></h3>
        <p className="text-rh-light-muted dark:text-rh-muted">Add holdings to see your health score</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5 shadow-sm dark:shadow-none">
        {/* Compact header: score circle + label + title on one row */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg className="w-16 h-16 transform -rotate-90">
              <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" fill="none" className="text-rh-light-border dark:text-rh-border" />
              <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" fill="none"
                strokeDasharray={163.4}
                strokeDashoffset={163.4 - (163.4 * overall) / 100}
                strokeLinecap="round"
                className={getScoreColor(overall)}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${getScoreColor(overall)}`}>{overall}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Portfolio Health</h3>
              <InfoTooltip text="Score from 0-100 based on concentration (top holding weight), volatility (annualized std dev of daily returns), max drawdown (largest peak-to-trough decline), diversification (number of holdings and sectors), and margin usage penalty." />
            </div>
            <p className={`text-sm font-medium ${getScoreColor(overall)}`}>{getScoreLabel(overall)} — {overall}/100</p>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="space-y-1 mb-4">
          <BreakdownRow label="Concentration" value={breakdown.concentration} hasDetail={hasDetails} onClick={() => setSelectedCategory('concentration')} />
          <BreakdownRow label="Volatility" value={breakdown.volatility} hasDetail={hasDetails} onClick={() => setSelectedCategory('volatility')} />
          <BreakdownRow label="Drawdown" value={breakdown.drawdown} hasDetail={hasDetails} onClick={() => setSelectedCategory('drawdown')} />
          <BreakdownRow label="Diversification" value={breakdown.diversification} hasDetail={hasDetails} onClick={() => setSelectedCategory('diversification')} />
          {breakdown.margin > 0 && (
            <button
              onClick={() => hasDetails && setSelectedCategory('margin')}
              onKeyDown={(e) => { if (hasDetails && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedCategory('margin'); } }}
              className={`flex items-center gap-3 w-full text-left rounded-lg px-2 py-1.5 -mx-2
                ${hasDetails ? 'hover:bg-rh-light-bg dark:hover:bg-rh-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer' : ''}
                transition-colors`}
              aria-label={`Margin Penalty: -${breakdown.margin} points — click for details`}
              disabled={!hasDetails}
            >
              <span className="text-sm text-rh-light-muted dark:text-rh-muted w-28">Margin Penalty</span>
              <span className="text-sm text-rh-red">-{breakdown.margin} points</span>
              {hasDetails && (
                <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Reasons — show top 2, expandable */}
        {reasons.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2">Key Drivers</h4>
            <ul className="space-y-1">
              {visibleReasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-rh-light-muted dark:text-rh-muted">
                  <span className="text-yellow-500 mt-0.5">•</span>
                  {reason}
                </li>
              ))}
            </ul>
            {reasons.length > 2 && (
              <button
                onClick={() => setShowAllReasons(!showAllReasons)}
                className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 hover:text-rh-light-text dark:hover:text-rh-text mt-1 transition-colors"
              >
                {showAllReasons ? 'Show less' : `+${reasons.length - 2} more`}
              </button>
            )}
          </div>
        )}

        {/* Quick Fixes — collapsed into summary */}
        {quickFixes.length > 0 && (
          <details className="pt-3 border-t border-white/[0.04]">
            <summary className="text-xs font-medium text-rh-green cursor-pointer hover:text-rh-green/80 transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {quickFixes.length} quick fix{quickFixes.length > 1 ? 'es' : ''} available
            </summary>
            <ul className="space-y-1 mt-2">
              {quickFixes.map((fix, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-rh-green">
                  <span className="mt-0.5">→</span>
                  {fix}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Drawer */}
      {hasDetails && selectedCategory && (
        <Drawer
          open={!!selectedCategory}
          onClose={() => setSelectedCategory(null)}
          categoryKey={selectedCategory}
          details={details!}
        />
      )}
    </>
  );
}
