import { ReactNode } from 'react';
import { useAuth, PlanTier } from '../context/AuthContext';
import { navigateToPricing } from '../utils/navigate-to-pricing';

interface PremiumOverlayProps {
  featureName: string;
  description: string;
  requiredPlan?: PlanTier;
  children?: ReactNode;
}


export function PremiumOverlay({ featureName, description, requiredPlan = 'premium', children }: PremiumOverlayProps) {
  const { user } = useAuth();
  const currentPlan = user?.plan || 'free';

  // Check if user has access
  const planRank: Record<PlanTier, number> = { free: 0, pro: 1, premium: 2, elite: 3 };
  if (planRank[currentPlan] >= planRank[requiredPlan]) {
    return <>{children}</>;
  }

  const planLabel = requiredPlan === 'pro' ? 'Pro' : requiredPlan === 'elite' ? 'Elite' : 'Premium';

  return (
    <div className="relative">
      {/* Compact lock card */}
      <div className="flex items-center gap-4 px-5 py-4 rounded-xl bg-white/80 dark:bg-white/[0.04] border border-gray-200/40 dark:border-white/[0.08]">
        <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-white">{featureName}</h3>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-amber-500/15 text-amber-500 border border-amber-500/20">
              {planLabel}
            </span>
          </div>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">{description}</p>
        </div>
        <a
          href="#tab=pricing"
          onClick={(e) => {
            e.preventDefault();
            navigateToPricing();
          }}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-rh-green text-white hover:bg-rh-green/90 transition-colors flex-shrink-0"
        >
          Upgrade
        </a>
      </div>
    </div>
  );
}
