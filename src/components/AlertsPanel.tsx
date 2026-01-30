import { useState, useEffect } from 'react';
import { AlertConfig } from '../types';
import { getAlerts, updateAlertConfig } from '../api';

interface AlertsPanelProps {
  userId: string;
  onClose: () => void;
}

const ALERT_LABELS: Record<string, { name: string; description: string; unit: string }> = {
  drawdown: {
    name: 'Drawdown Alert',
    description: 'Triggers when portfolio drawdown exceeds threshold',
    unit: '%',
  },
  sector_exposure: {
    name: 'Sector Concentration',
    description: 'Triggers when any single sector exceeds threshold',
    unit: '%',
  },
  underperform_spy: {
    name: 'Underperforming SPY',
    description: 'Triggers after consecutive days trailing SPY',
    unit: ' days',
  },
  '52w_high': {
    name: '52-Week High',
    description: 'Triggers when any holding hits a 52-week high',
    unit: '',
  },
  '52w_low': {
    name: '52-Week Low',
    description: 'Triggers when any holding hits a 52-week low',
    unit: '',
  },
};

export function AlertsPanel({ userId, onClose }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<AlertConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAlerts(userId)
      .then(setAlerts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const handleToggle = async (alert: AlertConfig) => {
    const updated = await updateAlertConfig(alert.id, { enabled: !alert.enabled });
    setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, ...updated } : a));
  };

  const handleThresholdChange = async (alert: AlertConfig, value: string) => {
    const num = value === '' ? null : parseFloat(value);
    if (value !== '' && (isNaN(num!) || num! < 0)) return;
    setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, threshold: num } : a));
  };

  const handleThresholdBlur = async (alert: AlertConfig) => {
    await updateAlertConfig(alert.id, { threshold: alert.threshold });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-6 w-full max-w-md mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Alert Settings</h2>
          <button
            onClick={onClose}
            className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-rh-light-muted dark:text-rh-muted text-sm">Loading alerts...</div>
        ) : (
          <div className="space-y-4">
            {alerts.map(alert => {
              const meta = ALERT_LABELS[alert.type] || { name: alert.type, description: '', unit: '' };
              const hasThreshold = alert.type !== '52w_high' && alert.type !== '52w_low';

              return (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border transition-opacity ${
                    alert.enabled
                      ? 'bg-rh-light-bg dark:bg-rh-dark border-rh-light-border dark:border-rh-border'
                      : 'bg-rh-light-bg/50 dark:bg-rh-dark/50 border-rh-light-border/50 dark:border-rh-border/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">{meta.name}</span>
                    <button
                      onClick={() => handleToggle(alert)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        alert.enabled ? 'bg-rh-green' : 'bg-gray-400 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          alert.enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-2">{meta.description}</p>
                  {hasThreshold && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-rh-light-muted dark:text-rh-muted">Threshold:</span>
                      <input
                        type="number"
                        min="0"
                        value={alert.threshold ?? ''}
                        onChange={e => handleThresholdChange(alert, e.target.value)}
                        onBlur={() => handleThresholdBlur(alert)}
                        className="w-20 px-2 py-1 text-xs rounded bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border text-rh-light-text dark:text-rh-text"
                      />
                      <span className="text-xs text-rh-light-muted dark:text-rh-muted">{meta.unit}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-rh-light-muted/70 dark:text-rh-muted/70 mt-4">
          Alerts are evaluated each time your portfolio snapshot updates.
        </p>
      </div>
    </div>
  );
}
