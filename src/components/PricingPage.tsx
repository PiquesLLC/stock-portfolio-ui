import { useState } from 'react';
import { useAuth, PlanTier } from '../context/AuthContext';
import { createCheckoutSession, createPortalSession } from '../api';
import { useToast } from '../context/ToastContext';

const PLANS: {
  id: PlanTier;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlight?: boolean;
  priceEnvKey: string;
}[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Get started with the basics',
    priceEnvKey: '',
    features: [
      'Up to 25 holdings',
      '1 watchlist',
      '3 price alerts',
      '1D / 1W / 1M charts',
      'Heatmap',
      'Basic dividend tracking',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$30',
    period: '/year',
    description: 'For active investors',
    highlight: true,
    priceEnvKey: 'pro',
    features: [
      'Unlimited holdings',
      'Unlimited watchlists',
      'Unlimited price alerts',
      'All chart periods',
      'Full dividend tracking + DRIP',
      'Nala Score',
      'Plaid brokerage linking',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$80',
    period: '/year',
    description: 'AI-powered investing edge',
    priceEnvKey: 'premium',
    features: [
      'Everything in Pro',
      'AI Stock Q&A',
      'AI Portfolio Briefing',
      'AI Behavior Coach',
      'AI Catalyst Detection',
      'Tax-loss harvesting',
      'Anomaly detection',
    ],
  },
];

// Price IDs will come from env or be passed from the API
// For now we use the priceEnvKey to identify which plan to request
const PRICE_IDS: Record<string, string> = {
  pro: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || 'pro',
  premium: import.meta.env.VITE_STRIPE_PREMIUM_PRICE_ID || 'premium',
};

export function PricingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const currentPlan = user?.plan || 'free';

  const handleUpgrade = async (planId: PlanTier) => {
    if (planId === 'free' || planId === currentPlan) return;

    setLoadingPlan(planId);
    try {
      const priceId = PRICE_IDS[planId];
      if (!priceId) {
        showToast('Plan not available yet', 'error');
        return;
      }
      const { url } = await createCheckoutSession(priceId);
      window.location.href = url;
    } catch (err: any) {
      const msg = err?.message || 'Failed to start checkout';
      if (msg.includes('503') || msg.includes('not configured')) {
        showToast('Billing is being set up — check back soon!', 'info');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleManage = async () => {
    setLoadingPlan('manage');
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (err: any) {
      const msg = err?.message || 'Failed to open billing portal';
      if (msg.includes('503') || msg.includes('not configured')) {
        showToast('Billing is being set up — check back soon!', 'info');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-rh-light-text dark:text-white mb-2">
          Choose Your Plan
        </h1>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted max-w-md mx-auto">
          Unlock powerful tools to make smarter investment decisions. Start free, upgrade anytime.
        </p>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isDowngrade = (currentPlan === 'premium' && plan.id === 'pro') || (currentPlan !== 'free' && plan.id === 'free');
          const isUpgrade = !isCurrent && !isDowngrade;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-6 flex flex-col transition-all ${
                plan.highlight
                  ? 'border-2 border-rh-green bg-rh-green/[0.03] dark:bg-rh-green/[0.02] shadow-lg shadow-rh-green/10'
                  : 'border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.02]'
              }`}
            >
              {/* Popular badge */}
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rh-green text-white shadow-sm">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Current plan badge */}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-500 border border-blue-500/30">
                    Current Plan
                  </span>
                </div>
              )}

              {/* Plan name + price */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-rh-light-text dark:text-white mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-3xl font-bold text-rh-light-text dark:text-white">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm text-rh-light-muted dark:text-rh-muted">{plan.period}</span>
                  )}
                </div>
                <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">{plan.description}</p>
              </div>

              {/* Features */}
              <ul className="flex-1 space-y-2.5 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-rh-green shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-rh-light-text dark:text-rh-text">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              {isCurrent ? (
                currentPlan !== 'free' ? (
                  <button
                    onClick={handleManage}
                    disabled={loadingPlan === 'manage'}
                    className="w-full py-2.5 px-4 rounded-xl text-sm font-medium border border-gray-200/60 dark:border-white/[0.1] text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors min-h-[44px]"
                  >
                    {loadingPlan === 'manage' ? 'Opening...' : 'Manage Subscription'}
                  </button>
                ) : (
                  <div className="w-full py-2.5 px-4 rounded-xl text-sm font-medium text-center text-rh-light-muted dark:text-rh-muted border border-gray-200/40 dark:border-white/[0.06] min-h-[44px] flex items-center justify-center">
                    Your current plan
                  </div>
                )
              ) : isUpgrade ? (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={loadingPlan === plan.id}
                  className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${
                    plan.highlight
                      ? 'bg-rh-green text-white hover:bg-rh-green/90 shadow-sm shadow-rh-green/20'
                      : 'bg-rh-light-text dark:bg-white text-white dark:text-black hover:opacity-90'
                  }`}
                >
                  {loadingPlan === plan.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Redirecting...
                    </span>
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </button>
              ) : (
                <button
                  onClick={handleManage}
                  disabled={loadingPlan === 'manage'}
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-medium border border-gray-200/60 dark:border-white/[0.1] text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors min-h-[44px]"
                >
                  {loadingPlan === 'manage' ? 'Opening...' : 'Change Plan'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* FAQ / Trust signals */}
      <div className="text-center space-y-3">
        <p className="text-xs text-rh-light-muted dark:text-rh-muted">
          All plans include a 7-day free trial. Cancel anytime. Payments processed securely by Stripe.
        </p>
        <div className="flex items-center justify-center gap-4 text-[11px] text-rh-light-muted dark:text-rh-muted">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secure checkout
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Cancel anytime
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            No hidden fees
          </span>
        </div>
      </div>
    </div>
  );
}
