import { useState, useEffect, useCallback } from 'react';
import { useAuth, PlanTier } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getBillingStatus } from '../api';
import {
  getProducts,
  purchaseProduct,
  restorePurchases,
  openManageSubscriptions,
  IAPProduct,
  AppleProductId,
  ApplePurchaseFailure,
} from '../utils/iap';

/**
 * Native iOS paywall (StoreKit 2). Web uses Stripe via PricingPage.
 *
 * Prices come from StoreKit, localized. Access does not: a purchase here only
 * ever results in "we sent it to the server". The plan shown to the user comes
 * from the authenticated backend, exactly as it does everywhere else.
 */

/** How long we will wait for the backend to project the new entitlement. */
const REFRESH_DELAYS_MS = [0, 1500, 3000, 5000];

const PURCHASE_MESSAGES: Record<ApplePurchaseFailure, string> = {
  cancelled: '',
  'not-available': 'In-app purchases are not available on this device.',
  'product-unavailable': 'That plan is not available from the App Store right now.',
  'iap-disabled': 'App Store subscriptions are not available yet. Please try again later.',
  'worker-unavailable': 'Purchases are temporarily unavailable. Please try again shortly.',
  'billing-rail-conflict':
    'This account already has a subscription managed on the web. Contact support so we can move it to the App Store.',
  'ownership-conflict': 'That purchase belongs to a different Nala account.',
  'verification-pending':
    'We could not confirm your purchase yet. It is safe — reopen the app shortly and it will finish.',
  'verification-failed': 'We could not verify that purchase. Contact support and nothing will be lost.',
  'missing-jws': 'We could not read the receipt for that purchase. Try Restore Purchases.',
  'unexpected-response':
    'We could not confirm your purchase. Nothing is lost — reopen the app shortly or contact support.',
  unknown: 'Something went wrong. Your purchase was not charged twice.',
};

export function NativePaywall() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [products, setProducts] = useState<IAPProduct[]>([]);
  const [unavailable, setUnavailable] = useState<AppleProductId[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [billing, setBilling] = useState<'yearly' | 'monthly'>('yearly');
  const currentPlan = user?.plan || 'free';

  useEffect(() => {
    let cancelled = false;
    getProducts().then((catalog) => {
      if (cancelled) return;
      setProducts(catalog.products);
      setUnavailable(catalog.unavailable);
      setLoadFailed(catalog.loadFailed);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  /**
   * Bounded wait for the backend to project the purchase. Not a failure path:
   * if it has not landed by the end of the window the app picks it up on the
   * next ordinary refresh.
   */
  const awaitEntitlement = useCallback(async (before: string) => {
    for (const delay of REFRESH_DELAYS_MS) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      try {
        const status = await getBillingStatus();
        if (String(status.plan) !== String(before)) {
          await refreshUser();
          return true;
        }
      } catch {
        // Keep waiting — a failed poll is not a failed purchase.
      }
    }
    await refreshUser();
    return false;
  }, [refreshUser]);

  const handlePurchase = async (product: IAPProduct) => {
    setPurchasing(product.id);
    const before = currentPlan;
    try {
      const result = await purchaseProduct(product.id);

      if (result.status === 'accepted') {
        showToast('Purchase received. Your subscription is being activated.', 'success');
        const projected = await awaitEntitlement(before);
        if (!projected) {
          showToast('Still activating — this can take a moment.', 'info');
        }
        return;
      }

      if (result.status === 'charged-conflict') {
        showToast(PURCHASE_MESSAGES['billing-rail-conflict'], 'error');
        await refreshUser();
        return;
      }

      // User closed the sheet: not an error, say nothing.
      if (result.reason === 'cancelled') return;
      showToast(PURCHASE_MESSAGES[result.reason], 'error');
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const before = currentPlan;
    try {
      const result = await restorePurchases();
      switch (result.status) {
        case 'pending':
          showToast('Restoring your purchases…', 'success');
          await awaitEntitlement(before);
          break;
        case 'no-restorable-purchases':
          showToast('No purchases associated with this Nala account were found.', 'info');
          break;
        case 'incomplete':
          // Partial restore. Some transactions may have been queued even though
          // another could not be verified — say so honestly AND still pick up
          // whatever the backend accepted.
          showToast(
            result.queued
              ? 'Some purchases were restored, but we could not verify all of them.'
              : 'We could not fully verify your purchases. Please try again shortly.',
            result.queued ? 'info' : 'error',
          );
          if (result.queued) await awaitEntitlement(before);
          break;
        case 'too-many':
          showToast('Too many purchases to restore automatically. Please contact support.', 'error');
          break;
        case 'conflict':
          showToast(PURCHASE_MESSAGES['ownership-conflict'], 'error');
          break;
        case 'retry-later':
          showToast('Restore is temporarily unavailable. Please try again shortly.', 'error');
          break;
        case 'unavailable':
          showToast(PURCHASE_MESSAGES['not-available'], 'error');
          break;
        default:
          showToast('Restore failed. Please try again.', 'error');
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleManage = async () => {
    const opened = await openManageSubscriptions();
    if (!opened) showToast('Could not open subscription settings.', 'error');
  };

  const planRank: Record<PlanTier, number> = { free: 0, pro: 1, premium: 2, elite: 3 };

  const filteredProducts = products.filter(p => p.period === billing);
  const planOrder: ('pro' | 'premium' | 'elite')[] = ['pro', 'premium', 'elite'];
  const sortedProducts = planOrder
    .map(plan => filteredProducts.find(p => p.tier === plan))
    .filter((p): p is IAPProduct => !!p);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="w-8 h-8 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-rh-light-text dark:text-white">Loading plans...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-rh-light-text dark:text-white mb-3">
          Upgrade Your Plan
        </h1>
        <p className="text-sm text-rh-light-text dark:text-white">
          Unlock premium features. Cancel anytime.
        </p>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mt-5">
          <span className="text-sm font-medium text-rh-light-text dark:text-white">
            Monthly
          </span>
          <button
            type="button"
            onClick={() => setBilling(b => b === 'yearly' ? 'monthly' : 'yearly')}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
              billing === 'yearly' ? 'bg-rh-green' : 'bg-gray-300 dark:bg-white/20'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
              billing === 'yearly' ? 'translate-x-7' : 'translate-x-0'
            }`} />
          </button>
          <span className="text-sm font-medium text-rh-light-text dark:text-white">
            Yearly
          </span>
          {billing === 'yearly' && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-rh-green bg-rh-green/10 px-2 py-0.5 rounded-full">
              Save 35%
            </span>
          )}
        </div>
      </div>

      {/* Plan cards */}
      <div className="space-y-3">
        {sortedProducts.map((product) => {
          const isCurrent = currentPlan === product.tier;
          const isUpgrade = planRank[product.tier] > planRank[currentPlan];
          const isPro = product.tier === 'pro';
          const isElite = product.tier === 'elite';
          const isPurchasing = purchasing === product.id;

          return (
            <div
              key={product.id}
              className={`relative rounded-2xl p-5 border transition-all ${
                isPro
                  ? 'border-rh-green/30 bg-gradient-to-r from-[#0d1a0d] to-[#0a0f0a]'
                  : isElite
                    ? 'border-purple-500/30 bg-gradient-to-r from-[#0d0d1a] to-[#0a0a0f]'
                    : 'border-gray-200/60 dark:border-white/[0.08] bg-gray-50/80 dark:bg-[#111613]'
              }`}
            >
              {isPro && (
                <span className="absolute -top-2.5 left-4 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rh-green/20 text-rh-green border border-rh-green/30">
                  Most Popular
                </span>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-base font-semibold ${
                    isPro ? 'text-rh-green' : isElite ? 'text-purple-400' : 'text-rh-light-text dark:text-white/80'
                  }`}>
                    {product.tier.charAt(0).toUpperCase() + product.tier.slice(1)}
                  </h3>
                  <p className="text-xs text-rh-light-text dark:text-white mt-0.5">{product.description}</p>
                </div>

                <div className="text-right">
                  <span className="text-xl font-extrabold text-rh-light-text dark:text-white">
                    {product.price}
                  </span>
                  <span className="text-xs text-rh-light-text dark:text-white">
                    /{billing === 'yearly' ? 'yr' : 'mo'}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                {isCurrent ? (
                  <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center border border-gray-300/50 dark:border-white/10 text-rh-light-text dark:text-white">
                    Current Plan
                  </div>
                ) : isUpgrade ? (
                  <button
                    type="button"
                    onClick={() => handlePurchase(product)}
                    disabled={!!purchasing}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                      isPro
                        ? 'bg-rh-green text-white hover:bg-rh-green/90 shadow-lg shadow-rh-green/25'
                        : isElite
                          ? 'bg-gradient-to-r from-purple-500/90 to-purple-600 text-white border border-purple-500/50'
                          : 'bg-gradient-to-r from-rh-green/90 to-rh-green text-white border border-rh-green/50'
                    }`}
                  >
                    {isPurchasing ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      'Subscribe'
                    )}
                  </button>
                ) : (
                  <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center border border-gray-300/50 dark:border-white/10 text-rh-light-text dark:text-white">
                    Downgrade via Settings
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/*
        Unavailable state. StoreKit did not return these, so there is no
        localized price and nothing to buy — we say so rather than invent one.
      */}
      {(loadFailed || unavailable.length > 0) && (
        <p className="mt-4 text-xs text-center text-rh-light-text dark:text-white/80">
          {loadFailed || sortedProducts.length === 0
            ? 'Plans are unavailable from the App Store right now. Please try again shortly.'
            : 'Some plans are unavailable from the App Store right now.'}
        </p>
      )}

      {/* Restore purchases + trust signals */}
      <div className="mt-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleRestore}
            disabled={restoring}
            className="text-sm text-rh-green hover:text-rh-green/80 font-medium transition-colors"
          >
            {restoring ? 'Restoring...' : 'Restore Purchases'}
          </button>
          <span className="text-rh-light-text/30 dark:text-white/[0.18]">·</span>
          <button
            type="button"
            onClick={handleManage}
            className="text-sm text-rh-green hover:text-rh-green/80 font-medium transition-colors"
          >
            Manage Subscription
          </button>
        </div>

        <p className="text-[11px] text-rh-light-text dark:text-white leading-relaxed px-4">
          Payment will be charged to your Apple ID account. Subscriptions automatically renew
          unless cancelled at least 24 hours before the end of the current period.
          Manage subscriptions in your device Settings.
        </p>
        <div className="flex items-center justify-center gap-3 text-[11px]">
          <button type="button" onClick={() => { window.location.hash = '#privacy'; }} className="text-rh-light-text dark:text-white/80 hover:text-rh-light-text dark:hover:text-white underline">
            Privacy Policy
          </button>
          <span className="text-rh-light-text/30 dark:text-white/[0.18]">·</span>
          <button type="button" onClick={() => { window.location.hash = '#terms'; }} className="text-rh-light-text dark:text-white/80 hover:text-rh-light-text dark:hover:text-white underline">
            Terms of Service
          </button>
        </div>
      </div>
    </div>
  );
}
