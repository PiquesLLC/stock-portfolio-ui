import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth, PlanTier } from '../context/AuthContext';
import { createCheckoutSession, createPortalSession } from '../api';
import { useToast } from '../context/ToastContext';

const PLANS: {
  id: PlanTier;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  highlight?: boolean;
  priceEnvKey: string;
}[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
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
    monthlyPrice: 3.99,
    yearlyPrice: 30,
    description: 'For active investors who want more',
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
    monthlyPrice: 8.99,
    yearlyPrice: 80,
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

const PRICE_IDS: Record<string, string> = {
  pro: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || 'pro',
  premium: import.meta.env.VITE_STRIPE_PREMIUM_PRICE_ID || 'premium',
};

export function PricingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billing, setBilling] = useState<'yearly' | 'monthly'>('yearly');
  const [activeSlide, setActiveSlide] = useState(1); // start on Pro (center)
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentPlan = user?.plan || 'free';

  // Track scroll position to update dot indicators
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.offsetWidth;
    const idx = Math.round(el.scrollLeft / cardWidth);
    setActiveSlide(Math.min(Math.max(idx, 0), PLANS.length - 1));
  }, []);

  // Scroll to Pro card on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = el.offsetWidth; // scroll to 2nd card (Pro)
    }
  }, []);

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

  const planRank: Record<PlanTier, number> = { free: 0, pro: 1, premium: 2 };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-rh-light-text dark:text-white mb-3">
          Subscribe to Our Best Plans
        </h1>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted max-w-md mx-auto">
          Choose the plan that's right for you. Start free, upgrade anytime.
        </p>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <span className={`text-sm font-medium transition-colors ${billing === 'monthly' ? 'text-rh-light-text dark:text-white' : 'text-rh-light-muted dark:text-rh-muted'}`}>
            Monthly
          </span>
          <button
            onClick={() => setBilling(b => b === 'yearly' ? 'monthly' : 'yearly')}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
              billing === 'yearly'
                ? 'bg-rh-green'
                : 'bg-gray-300 dark:bg-white/20'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
              billing === 'yearly' ? 'translate-x-7' : 'translate-x-0'
            }`} />
          </button>
          <span className={`text-sm font-medium transition-colors ${billing === 'yearly' ? 'text-rh-light-text dark:text-white' : 'text-rh-light-muted dark:text-rh-muted'}`}>
            Yearly
          </span>
          {billing === 'yearly' && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-rh-green bg-rh-green/10 px-2 py-0.5 rounded-full">
              Save 35%
            </span>
          )}
        </div>
      </div>

      {/* ==================== DESKTOP CARDS ==================== */}
      <div className="hidden sm:flex items-center justify-center gap-5 mb-10">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isUpgrade = planRank[plan.id] > planRank[currentPlan];
          const isDowngrade = planRank[plan.id] < planRank[currentPlan];
          const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
          const isCenter = plan.highlight;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl transition-all duration-500 ${
                isCenter
                  ? 'w-[280px] min-h-[480px] z-10 scale-105'
                  : 'w-[260px] min-h-[440px]'
              }`}
            >
              {/* Glow effect for center card */}
              {isCenter && (
                <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-b from-rh-green/40 via-rh-green/10 to-transparent blur-sm" />
              )}

              <div className={`relative flex flex-col flex-1 rounded-3xl p-6 overflow-hidden ${
                isCenter
                  ? 'bg-gradient-to-b from-[#1a2a1a] via-[#0d1a0d] to-[#0a0f0a] dark:from-[#1a2a1a] dark:via-[#0d1a0d] dark:to-[#0a0f0a] border border-rh-green/30 shadow-[0_0_60px_rgba(0,200,5,0.15)]'
                  : 'bg-[#111613] dark:bg-[#111613] border border-white/[0.08] shadow-xl'
              } ${
                /* Light mode overrides for non-center */
                !isCenter ? 'sm:bg-gray-50/80 sm:dark:bg-[#111613] sm:border-gray-200/60 sm:dark:border-white/[0.08]' : ''
              }`}>

                {/* Decorative orb for center card */}
                {isCenter && (
                  <div className="absolute top-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-rh-green/20 blur-3xl pointer-events-none" />
                )}

                {/* Most Popular badge */}
                {isCenter && (
                  <div className="flex justify-center mb-4">
                    <span className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.15em] bg-rh-green/20 text-rh-green border border-rh-green/30">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Plan name */}
                <div className={`${isCenter ? 'text-center' : ''} mb-4`}>
                  <h3 className={`text-base font-semibold mb-2 ${
                    isCenter
                      ? 'text-rh-green italic'
                      : 'text-rh-light-text dark:text-white/80'
                  }`}>
                    {plan.name}
                  </h3>

                  {/* Price */}
                  <div className={`flex items-baseline gap-1 ${isCenter ? 'justify-center' : ''}`}>
                    <span className={`font-extrabold ${isCenter ? 'text-4xl text-white' : 'text-3xl text-rh-light-text dark:text-white'}`}>
                      ${price}
                    </span>
                    {price > 0 && (
                      <span className="text-sm text-rh-light-muted dark:text-white/40">
                        /{billing === 'yearly' ? 'yr' : 'mo'}
                      </span>
                    )}
                  </div>

                  {isCenter && (
                    <p className="text-[11px] text-white/40 mt-1">Recommended</p>
                  )}

                  {!isCenter && (
                    <p className="text-xs text-rh-light-muted dark:text-white/40 mt-2">{plan.description}</p>
                  )}
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-2.5 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-[13px]">
                      <svg className="w-4 h-4 text-rh-green shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className={isCenter ? 'text-white/80' : 'text-rh-light-text dark:text-white/70'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <div className="mt-auto">
                  {isCurrent ? (
                    currentPlan !== 'free' ? (
                      <button
                        onClick={handleManage}
                        disabled={loadingPlan === 'manage'}
                        className="w-full py-3 px-4 rounded-2xl text-sm font-medium border border-white/10 text-rh-light-muted dark:text-white/50 hover:bg-white/5 transition-colors min-h-[48px]"
                      >
                        {loadingPlan === 'manage' ? 'Opening...' : 'Manage Subscription'}
                      </button>
                    ) : (
                      <div className="w-full py-3 px-4 rounded-2xl text-sm font-medium text-center border border-gray-300/50 dark:border-white/10 text-rh-light-muted dark:text-white/40 min-h-[48px] flex items-center justify-center">
                        Selected plan
                      </div>
                    )
                  ) : isUpgrade ? (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={loadingPlan === plan.id}
                      className={`w-full py-3 px-4 rounded-2xl text-sm font-bold transition-all min-h-[48px] ${
                        isCenter
                          ? 'bg-rh-green text-white hover:bg-rh-green/90 shadow-lg shadow-rh-green/25'
                          : 'bg-gradient-to-r from-rh-green/90 to-rh-green text-white hover:from-rh-green hover:to-rh-green/90 border border-rh-green/50'
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
                  ) : isDowngrade ? (
                    <button
                      onClick={handleManage}
                      disabled={loadingPlan === 'manage'}
                      className="w-full py-3 px-4 rounded-2xl text-sm font-medium border border-gray-300/50 dark:border-white/10 text-rh-light-muted dark:text-white/40 hover:bg-white/5 transition-colors min-h-[48px]"
                    >
                      {loadingPlan === 'manage' ? 'Opening...' : 'Change Plan'}
                    </button>
                  ) : null}
                </div>

                {/* Current plan indicator */}
                {isCurrent && (
                  <div className="absolute top-3 right-3">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      Current
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ==================== MOBILE SWIPEABLE CAROUSEL ==================== */}
      <div className="sm:hidden mb-8">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 gap-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {PLANS.map((plan, idx) => {
            const isCurrent = currentPlan === plan.id;
            const isUpgrade = planRank[plan.id] > planRank[currentPlan];
            const isDowngrade = planRank[plan.id] < planRank[currentPlan];
            const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
            const isActive = activeSlide === idx;

            return (
              <div
                key={plan.id}
                className="snap-center shrink-0 w-[calc(100vw-48px)]"
              >
                <div className={`relative rounded-3xl p-6 flex flex-col min-h-[420px] transition-all duration-300 ${
                  plan.highlight
                    ? 'bg-gradient-to-b from-[#1a2a1a] via-[#0d1a0d] to-[#0a0f0a] border border-rh-green/30 shadow-[0_0_40px_rgba(0,200,5,0.12)]'
                    : 'bg-[#111613] border border-white/[0.08] shadow-xl'
                } ${isActive ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-80'}`}>

                  {/* Decorative orb */}
                  {plan.highlight && (
                    <div className="absolute top-10 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-rh-green/20 blur-3xl pointer-events-none" />
                  )}

                  {/* Badges */}
                  {isCurrent && (
                    <div className="absolute top-4 right-4">
                      <span className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        Current
                      </span>
                    </div>
                  )}
                  {plan.highlight && (
                    <div className="flex justify-center mb-3">
                      <span className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.15em] bg-rh-green/20 text-rh-green border border-rh-green/30">
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Plan name + price */}
                  <div className="text-center mb-5">
                    <h3 className={`text-base font-semibold mb-2 ${
                      plan.highlight ? 'text-rh-green italic' : 'text-white/80'
                    }`}>
                      {plan.name}
                    </h3>
                    <div className="flex items-baseline gap-1 justify-center">
                      <span className="text-4xl font-extrabold text-white">${price}</span>
                      {price > 0 && (
                        <span className="text-sm text-white/40">/{billing === 'yearly' ? 'yr' : 'mo'}</span>
                      )}
                    </div>
                    {plan.highlight && (
                      <p className="text-[11px] text-white/40 mt-1">Recommended</p>
                    )}
                    {!plan.highlight && (
                      <p className="text-[11px] text-white/40 mt-1">{plan.description}</p>
                    )}
                  </div>

                  {/* Features — all shown on mobile carousel */}
                  <ul className="flex-1 space-y-2.5 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-[13px]">
                        <svg className="w-4 h-4 text-rh-green shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-white/75">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div className="mt-auto">
                    {isCurrent ? (
                      currentPlan !== 'free' ? (
                        <button
                          onClick={handleManage}
                          disabled={loadingPlan === 'manage'}
                          className="w-full py-3 px-4 rounded-2xl text-sm font-medium border border-white/10 text-white/50 hover:bg-white/5 transition-colors min-h-[48px]"
                        >
                          {loadingPlan === 'manage' ? 'Opening...' : 'Manage Subscription'}
                        </button>
                      ) : (
                        <div className="w-full py-3 px-4 rounded-2xl text-sm font-medium text-center border border-white/10 text-white/40 min-h-[48px] flex items-center justify-center">
                          Selected plan
                        </div>
                      )
                    ) : isUpgrade ? (
                      <button
                        onClick={() => handleUpgrade(plan.id)}
                        disabled={loadingPlan === plan.id}
                        className={`w-full py-3 px-4 rounded-2xl text-sm font-bold transition-all min-h-[48px] ${
                          plan.highlight
                            ? 'bg-rh-green text-white hover:bg-rh-green/90 shadow-lg shadow-rh-green/25'
                            : 'bg-gradient-to-r from-rh-green/90 to-rh-green text-white border border-rh-green/50'
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
                    ) : isDowngrade ? (
                      <button
                        onClick={handleManage}
                        disabled={loadingPlan === 'manage'}
                        className="w-full py-3 px-4 rounded-2xl text-sm font-medium border border-white/10 text-white/40 hover:bg-white/5 transition-colors min-h-[48px]"
                      >
                        {loadingPlan === 'manage' ? 'Opening...' : 'Change Plan'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {PLANS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                const el = scrollRef.current;
                if (el) el.scrollTo({ left: idx * el.offsetWidth, behavior: 'smooth' });
              }}
              className={`rounded-full transition-all duration-300 ${
                activeSlide === idx
                  ? 'w-6 h-2 bg-rh-green'
                  : 'w-2 h-2 bg-white/20'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Trust signals */}
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
