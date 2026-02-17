import { useState, useEffect } from 'react';
import { useAuth, PlanTier } from '../context/AuthContext';
import { getBillingStatus, createPortalSession, BillingStatus } from '../api';
import { useToast } from '../context/ToastContext';

const PLAN_LABELS: Record<PlanTier, { name: string; color: string; bg: string }> = {
  free: { name: 'Free', color: 'text-rh-light-muted dark:text-rh-muted', bg: 'bg-gray-200/50 dark:bg-white/[0.06]' },
  pro: { name: 'Pro', color: 'text-rh-green', bg: 'bg-rh-green/10' },
  premium: { name: 'Premium', color: 'text-amber-500', bg: 'bg-amber-500/10' },
};

export function BillingSection() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBillingStatus()
      .then((data) => { if (!cancelled) setBilling(data); })
      .catch(() => { /* billing not configured yet — show free */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const plan: PlanTier = billing?.plan || user?.plan || 'free';
  const label = PLAN_LABELS[plan];

  const handleManage = async () => {
    setPortalLoading(true);
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
      setPortalLoading(false);
    }
  };

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
        Subscription
      </h3>
      <div className="p-4 rounded-xl bg-gray-50/50 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.06] space-y-3">
        {/* Current plan */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${label.color} ${label.bg}`}>
              {label.name}
            </span>
            {loading && (
              <div className="w-3 h-3 border border-rh-light-muted/30 border-t-rh-light-muted rounded-full animate-spin" />
            )}
          </div>
          {billing?.planExpiresAt && (
            <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
              Renews {new Date(billing.planExpiresAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {plan === 'free' ? (
            <a
              href="#pricing"
              onClick={(e) => {
                e.preventDefault();
                window.location.hash = '#pricing';
                window.dispatchEvent(new HashChangeEvent('hashchange'));
              }}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-center bg-rh-green text-white hover:bg-rh-green/90 transition-colors min-h-[44px] flex items-center justify-center"
            >
              Upgrade Plan
            </a>
          ) : (
            <button
              onClick={handleManage}
              disabled={portalLoading}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-center border border-gray-200/60 dark:border-white/[0.1] text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors min-h-[44px]"
            >
              {portalLoading ? 'Opening...' : 'Manage Subscription'}
            </button>
          )}
        </div>

        {/* Plan info */}
        {plan === 'free' && (
          <p className="text-[11px] text-rh-light-muted dark:text-rh-muted">
            Free plan includes up to 25 holdings, 1 watchlist, and 3 price alerts.
          </p>
        )}
      </div>
    </section>
  );
}
