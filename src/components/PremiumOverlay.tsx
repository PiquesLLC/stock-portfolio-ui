import { ReactNode } from 'react';
import { useAuth, PlanTier } from '../context/AuthContext';

interface PremiumOverlayProps {
  featureName: string;
  description: string;
  requiredPlan?: PlanTier;
  children?: ReactNode;
}

function SkeletonPreview() {
  return (
    <div className="space-y-4 p-4">
      {/* Fake header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rh-green/20" />
        <div className="space-y-1.5">
          <div className="h-4 w-40 rounded bg-gray-300/30 dark:bg-white/10" />
          <div className="h-3 w-56 rounded bg-gray-200/30 dark:bg-white/5" />
        </div>
      </div>
      {/* Fake search bar */}
      <div className="h-12 rounded-xl bg-gray-200/40 dark:bg-white/[0.04] border border-gray-200/30 dark:border-white/[0.06]" />
      {/* Fake cards */}
      {[1, 2, 3].map(i => (
        <div key={i} className="p-4 rounded-xl bg-gray-100/50 dark:bg-white/[0.03] border border-gray-200/30 dark:border-white/[0.05] space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gray-300/30 dark:bg-white/10" />
            <div className="h-4 w-32 rounded bg-gray-300/30 dark:bg-white/10" />
            <div className="ml-auto h-5 w-16 rounded-full bg-rh-green/15" />
          </div>
          <div className="h-3 w-full rounded bg-gray-200/30 dark:bg-white/5" />
          <div className="h-3 w-3/4 rounded bg-gray-200/30 dark:bg-white/5" />
        </div>
      ))}
      {/* Fake metrics row */}
      <div className="flex gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 p-3 rounded-lg bg-gray-100/50 dark:bg-white/[0.03] border border-gray-200/30 dark:border-white/[0.05]">
            <div className="h-3 w-12 rounded bg-gray-200/30 dark:bg-white/5 mb-2" />
            <div className="h-5 w-16 rounded bg-gray-300/30 dark:bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PremiumOverlay({ featureName, description, requiredPlan = 'premium', children }: PremiumOverlayProps) {
  const { user } = useAuth();
  const currentPlan = user?.plan || 'free';

  // Check if user has access
  const planRank: Record<PlanTier, number> = { free: 0, pro: 1, premium: 2 };
  if (planRank[currentPlan] >= planRank[requiredPlan]) {
    return <>{children}</>;
  }

  const planLabel = requiredPlan === 'pro' ? 'Pro' : 'Premium';

  return (
    <div className="relative">
      {/* Blurred content preview */}
      <div className="pointer-events-none select-none blur-[6px] opacity-50 overflow-hidden max-h-[500px]">
        {children ?? <SkeletonPreview />}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-transparent via-black/20 to-black/40 dark:from-transparent dark:via-black/30 dark:to-black/60 rounded-xl">
        <div className="flex flex-col items-center gap-3 px-6 py-8 rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-xl border border-white/30 dark:border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] max-w-sm text-center">
          {/* Lock icon */}
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          {/* Premium badge */}
          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-500 border border-amber-500/20">
            {planLabel}
          </span>

          {/* Feature name */}
          <h3 className="text-base font-bold text-rh-light-text dark:text-white">
            {featureName}
          </h3>

          {/* Description */}
          <p className="text-xs text-rh-light-muted dark:text-rh-muted leading-relaxed">
            {description}
          </p>

          {/* Upgrade button */}
          <a
            href="#pricing"
            onClick={(e) => {
              e.preventDefault();
              window.location.hash = '#pricing';
              window.dispatchEvent(new HashChangeEvent('hashchange'));
            }}
            className="mt-1 px-6 py-2.5 rounded-xl text-sm font-semibold bg-rh-green text-white hover:bg-rh-green/90 transition-colors shadow-sm shadow-rh-green/20 min-h-[44px] flex items-center justify-center"
          >
            Upgrade to {planLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
