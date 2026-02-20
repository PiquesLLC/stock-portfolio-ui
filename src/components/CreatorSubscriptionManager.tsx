import { useState, useEffect } from 'react';
import { getMyCreatorSubscriptions, cancelCreatorSubscription } from '../api';
import { CreatorSubscriptionInfo } from '../types';

interface CreatorSubscriptionManagerProps {
  onClose?: () => void;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}/mo`;
}

export function CreatorSubscriptionManager({ onClose }: CreatorSubscriptionManagerProps) {
  const [subscriptions, setSubscriptions] = useState<CreatorSubscriptionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    getMyCreatorSubscriptions()
      .then(setSubscriptions)
      .catch(() => setSubscriptions([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCancel = async (sub: CreatorSubscriptionInfo) => {
    if (!confirm(`Cancel subscription to ${sub.creatorDisplayName}? You'll retain access until the end of your billing period.`)) return;
    setCancelingId(sub.id);
    setCancelError(null);
    try {
      await cancelCreatorSubscription(sub.creatorUserId);
      setSubscriptions(prev =>
        prev.map(s => s.id === sub.id ? { ...s, status: 'canceled', canceledAt: new Date().toISOString() } : s)
      );
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setCancelingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="h-16 bg-gray-200 dark:bg-white/10 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">No creator subscriptions yet.</p>
        {onClose && (
          <button onClick={onClose} className="mt-2 text-xs text-rh-green hover:underline">Close</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {subscriptions.map(sub => (
        <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg
          border border-gray-200/40 dark:border-white/[0.08]
          bg-white/60 dark:bg-white/[0.03]">
          <div className="min-w-0">
            <p className="text-sm font-medium text-rh-light-text dark:text-rh-text truncate">
              {sub.creatorDisplayName}
            </p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">
              {formatPrice(sub.pricingCents)}
              {sub.status === 'canceled' && ' — cancels at end of period'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {sub.status === 'active' && (
              <span className="w-1.5 h-1.5 rounded-full bg-rh-green" />
            )}
            {sub.status === 'canceled' ? (
              <span className="text-[10px] font-medium text-rh-light-muted dark:text-rh-muted">Canceled</span>
            ) : (
              <button
                onClick={() => handleCancel(sub)}
                disabled={cancelingId === sub.id}
                className="text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors disabled:opacity-50"
              >
                {cancelingId === sub.id ? '...' : 'Cancel'}
              </button>
            )}
          </div>
        </div>
      ))}
      {cancelError && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400 text-center">{cancelError}</p>
      )}
    </div>
  );
}
