import { useState, useEffect } from 'react';
import { useAuth, PlanTier } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getProducts, purchaseProduct, restorePurchases, IAPProduct } from '../utils/iap';

/**
 * Native iOS paywall component using StoreKit 2.
 * Shows Apple-localized prices and triggers the Apple payment sheet.
 * Used on iOS only — web uses Stripe checkout via PricingPage.
 */
export function NativePaywall() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [products, setProducts] = useState<IAPProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [billing, setBilling] = useState<'yearly' | 'monthly'>('yearly');
  const currentPlan = user?.plan || 'free';

  // Load products from App Store
  useEffect(() => {
    getProducts().then((prods) => {
      setProducts(prods);
      setLoading(false);
    });
  }, []);

  const handlePurchase = async (product: IAPProduct) => {
    setPurchasing(product.id);
    try {
      const result = await purchaseProduct(product.id, user?.id);
      if (result.ok) {
        showToast(`Upgraded to ${result.plan}!`, 'success');
        await refreshUser();
      } else if (result.error === 'cancelled') {
        // User cancelled — do nothing
      } else {
        showToast(result.error || 'Purchase failed', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Purchase failed', 'error');
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.ok) {
        showToast(`Restored ${result.plan} subscription!`, 'success');
        await refreshUser();
      } else {
        showToast(result.message || 'No active subscription found', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Restore failed', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const planRank: Record<PlanTier, number> = { free: 0, pro: 1, premium: 2, elite: 3 };

  // Group products by plan tier, filter by billing period
  const filteredProducts = products.filter(p => p.period === billing);
  const planOrder: ('pro' | 'premium' | 'elite')[] = ['pro', 'premium', 'elite'];
  const sortedProducts = planOrder
    .map(plan => filteredProducts.find(p => p.plan === plan))
    .filter((p): p is IAPProduct => !!p);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="w-8 h-8 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">Loading plans...</p>
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
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Unlock premium features. Cancel anytime.
        </p>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mt-5">
          <span className={`text-sm font-medium ${billing === 'monthly' ? 'text-rh-light-text dark:text-white' : 'text-rh-light-muted dark:text-rh-muted'}`}>
            Monthly
          </span>
          <button
            onClick={() => setBilling(b => b === 'yearly' ? 'monthly' : 'yearly')}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
              billing === 'yearly' ? 'bg-rh-green' : 'bg-gray-300 dark:bg-white/20'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
              billing === 'yearly' ? 'translate-x-7' : 'translate-x-0'
            }`} />
          </button>
          <span className={`text-sm font-medium ${billing === 'yearly' ? 'text-rh-light-text dark:text-white' : 'text-rh-light-muted dark:text-rh-muted'}`}>
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
          const isCurrent = currentPlan === product.plan;
          const isUpgrade = planRank[product.plan] > planRank[currentPlan];
          const isPro = product.plan === 'pro';
          const isElite = product.plan === 'elite';
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
                    {product.plan.charAt(0).toUpperCase() + product.plan.slice(1)}
                  </h3>
                  <p className="text-xs text-rh-light-muted dark:text-white/40 mt-0.5">{product.description}</p>
                </div>

                <div className="text-right">
                  <span className="text-xl font-extrabold text-rh-light-text dark:text-white">
                    {product.price}
                  </span>
                  <span className="text-xs text-rh-light-muted dark:text-white/40">
                    /{billing === 'yearly' ? 'yr' : 'mo'}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                {isCurrent ? (
                  <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center border border-gray-300/50 dark:border-white/10 text-rh-light-muted dark:text-white/40">
                    Current Plan
                  </div>
                ) : isUpgrade ? (
                  <button
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
                  <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center border border-gray-300/50 dark:border-white/10 text-rh-light-muted dark:text-white/40">
                    Downgrade via Settings
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Restore purchases + trust signals */}
      <div className="mt-8 text-center space-y-4">
        <button
          onClick={handleRestore}
          disabled={restoring}
          className="text-sm text-rh-green hover:text-rh-green/80 font-medium transition-colors"
        >
          {restoring ? 'Restoring...' : 'Restore Purchases'}
        </button>

        <p className="text-[11px] text-rh-light-muted dark:text-rh-muted leading-relaxed px-4">
          Payment will be charged to your Apple ID account. Subscriptions automatically renew
          unless cancelled at least 24 hours before the end of the current period.
          Manage subscriptions in your device Settings.
        </p>
      </div>
    </div>
  );
}
