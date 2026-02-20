import { useState } from 'react';
import { CreatorProfile, PerformanceData } from '../types';

interface CreatorSubscribeButtonProps {
  creator: CreatorProfile;
  performance?: PerformanceData | null;
  onSubscribe: () => void;
  loading?: boolean;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

const SECTION_META: Record<string, { label: string; icon: string }> = {
  showHoldings: { label: 'Holdings', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  showTradeHistory: { label: 'Trades', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  showRationale: { label: 'Rationale', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  showSectors: { label: 'Sectors', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' },
  showRiskMetrics: { label: 'Risk', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  showWatchlists: { label: 'Watchlists', icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z' },
};

function trackAge(createdAt: string): string {
  const months = Math.floor((Date.now() - new Date(createdAt).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months < 1) return 'New';
  if (months < 12) return `${months}mo track record`;
  const yrs = Math.floor(months / 12);
  return `${yrs}yr+ track record`;
}

/** Inline subscribe button — renders in the header row next to Follow/Compare */
export function CreatorSubscribeButton({ creator, performance, onSubscribe, loading }: CreatorSubscribeButtonProps) {
  const [open, setOpen] = useState(false);
  const price = formatPrice(creator.pricingCents);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rh-green text-white hover:bg-rh-green/90 transition-colors"
      >
        Subscribe {price}/mo
      </button>

      {open && (
        <CreatorSubscribeModal
          creator={creator}
          performance={performance}
          onSubscribe={() => { onSubscribe(); setOpen(false); }}
          onClose={() => setOpen(false)}
          loading={loading}
        />
      )}
    </>
  );
}

/** Keep old name as alias for existing imports */
export const CreatorPaywallCard = CreatorSubscribeButton;

/** Modal with full creator info, pricing, unlock details */
function CreatorSubscribeModal({ creator, performance, onSubscribe, onClose, loading }: {
  creator: CreatorProfile;
  performance?: PerformanceData | null;
  onSubscribe: () => void;
  onClose: () => void;
  loading?: boolean;
}) {
  const unlockedSections = creator.visibility
    ? Object.entries(creator.visibility)
        .filter(([key, val]) => key.startsWith('show') && val === true)
        .map(([key]) => SECTION_META[key])
        .filter(Boolean)
    : [];

  const returnPct = performance?.twrPct ?? null;
  const subCount = creator.subscriberCount ?? 0;
  const price = formatPrice(creator.pricingCents);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-gray-200/60 dark:border-white/[0.1]
          bg-white dark:bg-[#1a1a1e] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-bold text-rh-light-text dark:text-rh-text">
                {creator.displayName || creator.username}
              </h3>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">
                {trackAge(creator.createdAt)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 -mr-1 -mt-1 rounded-lg text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Proof stats */}
          <div className="flex items-center gap-2 mt-3">
            {returnPct !== null && (
              <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                returnPct >= 0
                  ? 'text-rh-green bg-rh-green/10'
                  : 'text-rh-red bg-rh-red/10'
              }`}>
                {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}% 1mo
              </span>
            )}
            {subCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md
                text-rh-light-muted dark:text-rh-muted bg-gray-100 dark:bg-white/[0.06]">
                {subCount} subscriber{subCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Pitch */}
        {creator.pitch && (
          <div className="px-5 pb-3">
            <p className="text-xs text-rh-light-muted dark:text-rh-muted leading-relaxed">
              "{creator.pitch}"
            </p>
          </div>
        )}

        {/* Divider */}
        <div className="mx-5 border-t border-gray-200/40 dark:border-white/[0.06]" />

        {/* What you unlock */}
        {unlockedSections.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2">
              What you unlock
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {unlockedSections.map(section => (
                <div key={section.label}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg
                    bg-gray-50 dark:bg-white/[0.04] border border-gray-200/30 dark:border-white/[0.06]">
                  <svg className="w-3.5 h-3.5 text-rh-green/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={section.icon} />
                  </svg>
                  <span className="text-[11px] font-medium text-rh-light-text dark:text-rh-text/80">
                    {section.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA section */}
        <div className="px-5 pb-4 pt-1">
          {/* Price */}
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-2xl font-bold text-rh-green">{price}</span>
            <span className="text-sm text-rh-light-muted dark:text-rh-muted">/mo</span>
            {creator.trialDays > 0 && (
              <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-rh-green/10 text-rh-green">
                {creator.trialDays}-day free trial
              </span>
            )}
          </div>

          {/* Subscribe button */}
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
                : `Subscribe — ${price}/mo`
            }
          </button>

          {/* Trust strip */}
          <div className="flex items-center justify-center gap-2 mt-2 text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40">
            <span>Cancel anytime</span>
            <span className="opacity-60">·</span>
            <span>Secure checkout</span>
            <span className="opacity-60">·</span>
            <span>Educational only</span>
          </div>
        </div>
      </div>
    </div>
  );
}
