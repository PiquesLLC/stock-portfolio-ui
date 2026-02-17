import { useState } from 'react';
import { PriceAlert, PriceAlertCondition } from '../types';
import { updatePriceAlert, deletePriceAlert } from '../api';
import { useToast } from '../context/ToastContext';

interface Props {
  alerts: PriceAlert[];
  onRefresh: () => void;
}

function formatCondition(condition: PriceAlertCondition, targetPrice: number | null, percentChange: number | null, referencePrice: number | null): string {
  switch (condition) {
    case 'above':
      return `Price above $${targetPrice?.toFixed(2) ?? '?'}`;
    case 'below':
      return `Price below $${targetPrice?.toFixed(2) ?? '?'}`;
    case 'pct_up':
      return `Up ${percentChange?.toFixed(1) ?? '?'}% from $${referencePrice?.toFixed(2) ?? '?'}`;
    case 'pct_down':
      return `Down ${percentChange?.toFixed(1) ?? '?'}% from $${referencePrice?.toFixed(2) ?? '?'}`;
    default:
      return condition;
  }
}

function getConditionIcon(condition: PriceAlertCondition): string {
  switch (condition) {
    case 'above':
    case 'pct_up':
      return '↑';
    case 'below':
    case 'pct_down':
      return '↓';
    default:
      return '•';
  }
}

function getConditionColor(condition: PriceAlertCondition): string {
  switch (condition) {
    case 'above':
    case 'pct_up':
      return 'text-rh-green';
    case 'below':
    case 'pct_down':
      return 'text-rh-red';
    default:
      return 'text-rh-light-text dark:text-rh-text';
  }
}

export function PriceAlertsList({ alerts, onRefresh }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleToggle = async (alert: PriceAlert) => {
    setTogglingId(alert.id);
    try {
      await updatePriceAlert(alert.id, { enabled: !alert.enabled });
      onRefresh();
    } catch {
      showToast('Failed to update alert');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (alertId: string) => {
    setDeletingId(alertId);
    try {
      await deletePriceAlert(alertId);
      onRefresh();
      showToast('Alert deleted', 'success');
    } catch {
      showToast('Failed to delete alert');
    } finally {
      setDeletingId(null);
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-rh-light-muted dark:text-rh-muted">
        No price alerts set for this ticker
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`flex items-center justify-between p-3 rounded-lg border ${
            alert.triggered
              ? 'bg-rh-green/5 border-rh-green/20'
              : alert.enabled
              ? 'bg-rh-light-bg dark:bg-rh-dark border-rh-light-border dark:border-rh-border'
              : 'bg-rh-light-bg/50 dark:bg-rh-dark/50 border-rh-light-border/50 dark:border-rh-border/50 opacity-60'
          }`}
        >
          <div className="flex items-center gap-3">
            {/* Condition icon */}
            <span className={`text-lg font-bold ${getConditionColor(alert.condition)}`}>
              {getConditionIcon(alert.condition)}
            </span>

            {/* Condition text */}
            <div>
              <div className={`text-sm font-medium ${alert.enabled ? 'text-rh-light-text dark:text-rh-text' : 'text-rh-light-muted dark:text-rh-muted'}`}>
                {formatCondition(alert.condition, alert.targetPrice, alert.percentChange, alert.referencePrice)}
              </div>
              <div className="text-xs text-rh-light-muted dark:text-rh-muted">
                {alert.triggered ? (
                  <span className="text-rh-green font-medium">
                    Triggered {alert.triggeredAt ? new Date(alert.triggeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                  </span>
                ) : (
                  `Created ${new Date(alert.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Toggle button (only for non-triggered alerts) */}
            {!alert.triggered && (
              <button
                onClick={() => handleToggle(alert)}
                disabled={togglingId === alert.id}
                className={`relative w-10 h-6 rounded-full transition-colors after:content-[''] after:absolute after:-inset-3 ${
                  alert.enabled ? 'bg-rh-green' : 'bg-rh-light-border dark:bg-rh-border'
                } ${togglingId === alert.id ? 'opacity-50' : ''}`}
                title={alert.enabled ? 'Disable alert' : 'Enable alert'}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    alert.enabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            )}

            {/* Delete button */}
            <button
              onClick={() => handleDelete(alert.id)}
              disabled={deletingId === alert.id}
              className="relative p-1.5 text-rh-light-muted dark:text-rh-muted hover:text-rh-red transition-colors disabled:opacity-50 after:content-[''] after:absolute after:-inset-2"
              title="Delete alert"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
