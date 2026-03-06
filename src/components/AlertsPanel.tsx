import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertConfig } from '../types';
import { getAlerts, updateAlertConfig, getUserSettings, updateUserSettings } from '../api';

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
  'ath': {
    name: 'All-Time High',
    description: 'Triggers when any holding hits an all-time high',
    unit: '',
  },
  'atl': {
    name: 'All-Time Low',
    description: 'Triggers when any holding hits an all-time low',
    unit: '',
  },
};

const PRICE_SPIKE_PRESETS = [
  { label: '1%', value: 1 },
  { label: '3%', value: 3 },
  { label: '5%', value: 5 },
  { label: '10%', value: 10 },
];

export function AlertsPanel({ userId, onClose }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<AlertConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceSpikePct, setPriceSpikePct] = useState(3.0);
  const [savingSpike, setSavingSpike] = useState(false);

  useEffect(() => {
    Promise.all([
      getAlerts(userId),
      getUserSettings(userId),
    ])
      .then(([alertsData, settings]) => {
        setAlerts(alertsData);
        setPriceSpikePct(settings.priceSpikePct ?? 3.0);
      })
      .catch(e => console.error('Alerts fetch failed:', e))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

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

  const handlePriceSpikeChange = async (value: number) => {
    setPriceSpikePct(value);
    setSavingSpike(true);
    try {
      await updateUserSettings(userId, { priceSpikePct: value });
    } catch (e) {
      console.error('Failed to save price spike threshold:', e);
    } finally {
      setSavingSpike(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1a1e] border border-gray-200/60 dark:border-white/[0.08]
          rounded-2xl p-6 w-full max-w-md mx-4 max-h-[70vh] overflow-y-auto scrollbar-minimal
          shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Alert Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-rh-light-muted dark:text-rh-muted
              hover:bg-black/5 dark:hover:bg-white/[0.08] hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
          >
            <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-rh-light-muted dark:text-rh-muted text-sm">Loading alerts...</div>
        ) : (
          <div className="space-y-3">
            {/* Price Spike Threshold */}
            <div className="p-4 rounded-xl border transition-all bg-gray-50/80 dark:bg-white/[0.04] border-gray-200/50 dark:border-white/[0.06]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Price Action Alerts</span>
                {savingSpike && (
                  <span className="text-[10px] text-rh-green">Saving...</span>
                )}
              </div>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-3">
                Notify me when any holding moves more than this % in a day
              </p>
              <div className="flex items-center gap-2">
                {PRICE_SPIKE_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => handlePriceSpikeChange(preset.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      priceSpikePct === preset.value
                        ? 'bg-rh-green/10 border-rh-green text-rh-green dark:bg-rh-green/20'
                        : 'bg-white/60 dark:bg-white/[0.04] border-gray-200/50 dark:border-white/[0.08] text-rh-light-muted dark:text-rh-muted hover:border-rh-green/50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-1">
                  <input
                    type="number"
                    min="1"
                    max="25"
                    step="0.5"
                    value={priceSpikePct}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setPriceSpikePct(v);
                    }}
                    onBlur={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v >= 1 && v <= 25) handlePriceSpikeChange(v);
                    }}
                    className="w-16 px-2 py-1.5 text-xs rounded-lg bg-white/60 dark:bg-white/[0.06] border border-gray-200/50 dark:border-white/[0.08] text-rh-light-text dark:text-rh-text text-center"
                  />
                  <span className="text-xs text-rh-light-muted dark:text-rh-muted">%</span>
                </div>
              </div>
            </div>

            {/* Existing portfolio-level alerts */}
            {alerts.map(alert => {
              const meta = ALERT_LABELS[alert.type] || { name: alert.type, description: '', unit: '' };
              const hasThreshold = !['52w_high', '52w_low', 'ath', 'atl'].includes(alert.type);

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border transition-all ${
                    alert.enabled
                      ? 'bg-gray-50/80 dark:bg-white/[0.04] border-gray-200/50 dark:border-white/[0.06]'
                      : 'bg-gray-50/40 dark:bg-white/[0.02] border-gray-200/30 dark:border-white/[0.03] opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">{meta.name}</span>
                    <button
                      onClick={() => handleToggle(alert)}
                      className={`relative w-10 h-[22px] rounded-full transition-colors after:content-[''] after:absolute after:-inset-3 ${
                        alert.enabled ? 'bg-rh-green' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                          alert.enabled ? 'translate-x-[18px]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted">{meta.description}</p>
                  {hasThreshold && (
                    <div className="flex items-center gap-2 mt-2.5">
                      <span className="text-xs text-rh-light-muted dark:text-rh-muted">Threshold:</span>
                      <input
                        type="number"
                        min="0"
                        value={alert.threshold ?? ''}
                        onChange={e => handleThresholdChange(alert, e.target.value)}
                        onBlur={() => handleThresholdBlur(alert)}
                        className="w-20 px-2 py-1 text-xs rounded-lg bg-white/60 dark:bg-white/[0.06] border border-gray-200/50 dark:border-white/[0.08] text-rh-light-text dark:text-rh-text"
                      />
                      <span className="text-xs text-rh-light-muted dark:text-rh-muted">{meta.unit}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-rh-light-muted/60 dark:text-rh-muted/50 mt-4">
          Alerts are evaluated each time your portfolio snapshot updates.
        </p>
      </div>
    </div>,
    document.body
  );
}
