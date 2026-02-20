import { CreatorProfile, PerformanceData } from '../types';

interface CreatorPaywallCardProps {
  creator: CreatorProfile;
  performance?: PerformanceData | null;
  onSubscribe: () => void;
  loading?: boolean;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

const SECTION_META: Record<string, { label: string; icon: string }> = {
  showHoldings: { label: 'Full Holdings', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  showTradeHistory: { label: 'Trade History', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  showRationale: { label: 'Trade Rationale', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  showSectors: { label: 'Sector Breakdown', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' },
  showRiskMetrics: { label: 'Risk Metrics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  showWatchlists: { label: 'Watchlists', icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z' },
};

function getSignalGrade(perf: PerformanceData): { grade: string; score: number } {
  if (perf.snapshotCount < 5) return { grade: '--', score: 0 };
  let score = 50;
  if (perf.twrPct !== null) {
    if (perf.twrPct >= 10) score += 30;
    else if (perf.twrPct >= 5) score += 20;
    else if (perf.twrPct >= 2) score += 12;
    else if (perf.twrPct >= 0) score += 5;
    else if (perf.twrPct >= -5) score -= 5;
    else score -= 15;
  }
  if (perf.alphaPct !== null) {
    if (perf.alphaPct >= 5) score += 20;
    else if (perf.alphaPct >= 2) score += 12;
    else if (perf.alphaPct >= 0) score += 5;
    else score -= 8;
  }
  if (perf.volatilityPct !== null) {
    if (perf.volatilityPct > 40) score -= 15;
    else if (perf.volatilityPct > 25) score -= 8;
    else if (perf.volatilityPct < 15) score += 5;
  }
  if (perf.maxDrawdownPct !== null) {
    if (perf.maxDrawdownPct > 20) score -= 20;
    else if (perf.maxDrawdownPct > 10) score -= 10;
    else if (perf.maxDrawdownPct < 5) score += 5;
  }
  score = Math.max(0, Math.min(100, score));
  let grade: string;
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B+';
  else if (score >= 60) grade = 'B';
  else if (score >= 50) grade = 'C+';
  else if (score >= 40) grade = 'C';
  else if (score >= 30) grade = 'D';
  else grade = 'F';
  return { grade, score };
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-rh-green bg-rh-green/15 border-rh-green/30';
  if (grade.startsWith('B')) return 'text-blue-400 bg-blue-500/15 border-blue-500/30';
  if (grade.startsWith('C')) return 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30';
  return 'text-rh-muted bg-white/[0.06] border-white/[0.08]';
}

function trackRecordLabel(createdAt: string): string {
  const months = Math.floor((Date.now() - new Date(createdAt).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months < 1) return 'New creator';
  if (months === 1) return '1 month track record';
  if (months < 12) return `${months} month track record`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 year track record' : `${years}+ year track record`;
}

export function CreatorPaywallCard({ creator, performance, onSubscribe, loading }: CreatorPaywallCardProps) {
  const unlockedSections = creator.visibility
    ? Object.entries(creator.visibility)
        .filter(([key, val]) => key.startsWith('show') && val === true)
        .map(([key]) => SECTION_META[key])
        .filter(Boolean)
    : [];

  const signal = performance ? getSignalGrade(performance) : null;
  const hasTrackRecord = signal && signal.grade !== '--';
  const returnPct = performance?.twrPct ?? null;
  const subCount = creator.subscriberCount ?? 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200/60 dark:border-white/[0.1]
      bg-gradient-to-b from-white/90 to-gray-50/90 dark:from-white/[0.06] dark:to-white/[0.02]
      backdrop-blur-xl p-5">

      {/* Trust signals row */}
      {(hasTrackRecord || subCount > 0) && (
        <div className="flex items-center justify-center gap-3 mb-4">
          {/* Signal grade badge */}
          {hasTrackRecord && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full border ${gradeColor(signal!.grade)}`}>
              {signal!.grade}
              <span className="font-normal opacity-70">Signal</span>
            </span>
          )}

          {/* Return badge */}
          {returnPct !== null && (
            <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full border ${
              returnPct >= 0
                ? 'text-rh-green bg-rh-green/10 border-rh-green/20'
                : 'text-rh-red bg-rh-red/10 border-rh-red/20'
            }`}>
              {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}% <span className="font-normal opacity-60 ml-0.5">1mo</span>
            </span>
          )}

          {/* Subscriber count */}
          {subCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full
              text-rh-light-muted dark:text-rh-muted bg-gray-100 dark:bg-white/[0.06] border border-gray-200/40 dark:border-white/[0.08]">
              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {subCount} {subCount === 1 ? 'subscriber' : 'subscribers'}
            </span>
          )}
        </div>
      )}

      {/* Creator name + pricing */}
      <div className="text-center">
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-1">
          {creator.displayName || creator.username}
        </h3>

        {/* Track record age */}
        <p className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 mb-2">
          {trackRecordLabel(creator.createdAt)}
        </p>

        <p className="text-2xl font-bold text-rh-green mb-0.5">
          {formatPrice(creator.pricingCents)}<span className="text-sm font-normal text-rh-light-muted dark:text-rh-muted">/mo</span>
        </p>
      </div>

      {/* Trial badge */}
      {creator.trialDays > 0 && (
        <div className="text-center">
          <span className="inline-block px-2.5 py-0.5 text-[10px] font-medium rounded-full
            bg-rh-green/10 text-rh-green mb-3">
            {creator.trialDays}-day free trial
          </span>
        </div>
      )}

      {/* Pitch */}
      {creator.pitch && (
        <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-4 max-w-xs mx-auto leading-relaxed text-center">
          "{creator.pitch}"
        </p>
      )}

      {/* What you unlock — with icons */}
      {unlockedSections.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2 text-center">
            What you unlock
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {unlockedSections.map(section => (
              <div key={section.label}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                  bg-gray-50/80 dark:bg-white/[0.03] border border-gray-200/30 dark:border-white/[0.06]">
                <svg className="w-3.5 h-3.5 text-rh-green/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={section.icon} />
                </svg>
                <span className="text-[10px] font-medium text-rh-light-text dark:text-rh-text">
                  {section.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={onSubscribe}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-rh-green text-white text-sm font-semibold
          hover:bg-rh-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? 'Loading...'
          : creator.trialDays > 0
            ? `Start ${creator.trialDays}-day free trial`
            : subCount > 0
              ? `Join ${subCount} ${subCount === 1 ? 'subscriber' : 'subscribers'} — ${formatPrice(creator.pricingCents)}/mo`
              : `Subscribe for ${formatPrice(creator.pricingCents)}/mo`
        }
      </button>

      {/* Disclaimer */}
      <p className="mt-2.5 text-[9px] text-rh-light-muted/50 dark:text-rh-muted/50 leading-tight text-center">
        Educational content only. Not investment advice. Cancel anytime.
      </p>
    </div>
  );
}
