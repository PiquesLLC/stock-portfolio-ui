import { CreatorProfile } from '../types';

interface CreatorPaywallCardProps {
  creator: CreatorProfile;
  onSubscribe: () => void;
  loading?: boolean;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

const SECTION_LABELS: Record<string, string> = {
  showHoldings: 'Full Holdings',
  showTradeHistory: 'Trade History',
  showRationale: 'Trade Rationale',
  showSectors: 'Sector Breakdown',
  showRiskMetrics: 'Risk Metrics',
  showWatchlists: 'Watchlists',
};

export function CreatorPaywallCard({ creator, onSubscribe, loading }: CreatorPaywallCardProps) {
  const unlockedSections = creator.visibility
    ? Object.entries(creator.visibility)
        .filter(([key, val]) => key.startsWith('show') && val === true)
        .map(([key]) => SECTION_LABELS[key])
        .filter(Boolean)
    : [];

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200/60 dark:border-white/[0.1]
      bg-gradient-to-b from-white/90 to-gray-50/90 dark:from-white/[0.06] dark:to-white/[0.02]
      backdrop-blur-xl p-5 text-center">
      {/* Lock icon */}
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full
        bg-gray-100 dark:bg-white/[0.08]">
        <svg className="h-6 w-6 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>

      {/* Creator name + pricing */}
      <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-1">
        Subscribe to {creator.displayName || creator.username}
      </h3>
      <p className="text-2xl font-bold text-rh-green mb-0.5">
        {formatPrice(creator.pricingCents)}<span className="text-sm font-normal text-rh-light-muted dark:text-rh-muted">/mo</span>
      </p>

      {/* Trial badge */}
      {creator.trialDays > 0 && (
        <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full
          bg-rh-green/10 text-rh-green mb-3">
          {creator.trialDays}-day free trial
        </span>
      )}

      {/* Pitch */}
      {creator.pitch && (
        <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-3 max-w-xs mx-auto leading-relaxed">
          {creator.pitch}
        </p>
      )}

      {/* What you unlock */}
      {unlockedSections.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1.5">
            What you unlock
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {unlockedSections.map(label => (
              <span key={label} className="px-2 py-0.5 text-[10px] font-medium rounded-md
                bg-gray-100 dark:bg-white/[0.06] text-rh-light-text dark:text-rh-text
                border border-gray-200/40 dark:border-white/[0.08]">
                {label}
              </span>
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
        {loading ? 'Loading...' : `Subscribe for ${formatPrice(creator.pricingCents)}/mo`}
      </button>

      {/* Disclaimer */}
      <p className="mt-2 text-[9px] text-rh-light-muted dark:text-rh-muted leading-tight">
        Educational content only. Not investment advice. Cancel anytime.
      </p>
    </div>
  );
}
