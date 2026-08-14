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
    description: 'When a holding sets a new 52-week high, and if it closes there',
    unit: '',
  },
  '52w_low': {
    name: '52-Week Low',
    description: 'When a holding sets a new 52-week low, and if it closes there',
    unit: '',
  },
  'ath': {
    name: 'All-Time High',
    description: 'When a holding sets a new all-time high, and if it closes there',
    unit: '',
  },
  'atl': {
    name: 'All-Time Low',
    description: 'When a holding sets a new all-time low, and if it closes there',
    unit: '',
  },
  'congress_trade': {
    name: 'Congress Trades',
    description: 'When a member of Congress trades one of your holdings',
    unit: '',
  },
  'value_radar': {
    name: 'Value Radar',
    description: 'Alerts when your holdings or watchlist stocks enter Deep Value',
    unit: '',
  },
};

const PRICE_SPIKE_PRESETS = [
  { label: '1%', value: 1 },
  { label: '3%', value: 3 },
  { label: '5%', value: 5 },
  { label: '10%', value: 10 },
];

// Flat grouped list — unknown/new alert types fall into the last group
const ALERT_GROUPS: { label: string; types: string[] }[] = [
  { label: 'Portfolio', types: ['drawdown', 'underperform_spy'] },
  { label: 'Milestones', types: ['52w_high', '52w_low', 'ath', 'atl'] },
  { label: 'Activity', types: ['congress_trade', 'value_radar'] },
];
const GROUPED_TYPES = new Set(ALERT_GROUPS.flatMap(g => g.types));

// Only these types have a server-evaluated threshold — the milestone and
// activity alerts are pure on/off switches
const THRESHOLD_TYPES = new Set(['drawdown', 'underperform_spy']);

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
        className="w-full max-w-sm mx-4 max-h-[75vh] overflow-y-auto scrollbar-minimal rounded-2xl
          border border-gray-200/60 dark:border-white/[0.1] bg-white dark:bg-black/95 backdrop-blur-md shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">Alert Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-lg text-rh-light-text dark:text-white
              hover:bg-black/5 dark:hover:bg-white/[0.08] hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
          >
            <svg className="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-rh-light-text dark:text-white text-sm">Loading alerts...</div>
        ) : (
          <div className="px-5">
            {/* Price action — % move presets */}
            <div className="pt-2 pb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-text/70 dark:text-white/80">Price action</span>
                {savingSpike && (
                  <span className="text-[10px] text-rh-green">Saving...</span>
                )}
              </div>
              <p className="text-xs text-rh-light-text dark:text-white leading-relaxed">
                Notify me when any holding moves more than this % in a day
              </p>
              <div className="flex items-center gap-1.5 mt-2.5">
                {PRICE_SPIKE_PRESETS.map(preset => (
                  <button
                    type="button"
                    key={preset.value}
                    onClick={() => handlePriceSpikeChange(preset.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      priceSpikePct === preset.value
                        ? 'text-rh-green border-rh-green/25 bg-rh-green/[0.06]'
                        : 'border-gray-200/40 dark:border-white/[0.08] text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-rh-text hover:border-gray-300/60 dark:hover:border-white/[0.15]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="number"
                    inputMode="decimal"
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
                    className="w-14 px-2 py-1.5 text-xs text-center tabular-nums rounded-lg bg-transparent
                      border border-gray-200/60 dark:border-white/[0.1] text-rh-light-text dark:text-rh-text
                      focus:border-rh-green/50 focus:outline-none"
                  />
                  <span className="text-xs text-rh-light-text dark:text-white">%</span>
                </div>
              </div>
            </div>

            {/* Portfolio-level alerts, grouped flat list — no boxes-in-boxes */}
            {ALERT_GROUPS.map(group => {
              const groupAlerts = alerts.filter(a =>
                group.types.includes(a.type) ||
                (group.label === 'Activity' && !GROUPED_TYPES.has(a.type))
              );
              if (groupAlerts.length === 0) return null;

              return (
                <div key={group.label} className="pt-3 pb-1 border-t border-gray-200/40 dark:border-white/[0.06]">
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-rh-light-text/70 dark:text-white/80">
                    {group.label}
                  </span>
                  <div className="divide-y divide-gray-200/40 dark:divide-white/[0.06]">
                    {groupAlerts.map(alert => {
                      const meta = ALERT_LABELS[alert.type] || { name: alert.type, description: '', unit: '' };

                      return (
                        <div key={alert.id} className="py-3 flex items-start justify-between gap-4">
                          <div className={`min-w-0 transition-opacity ${alert.enabled ? '' : 'opacity-50'}`}>
                            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">{meta.name}</span>
                            <p className="text-xs text-rh-light-text dark:text-white mt-0.5 leading-relaxed">{meta.description}</p>
                            {THRESHOLD_TYPES.has(alert.type) && alert.enabled && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  value={alert.threshold ?? ''}
                                  onChange={e => handleThresholdChange(alert, e.target.value)}
                                  onBlur={() => handleThresholdBlur(alert)}
                                  className="w-16 px-2 py-1 text-xs text-right tabular-nums rounded-lg bg-transparent
                                    border border-gray-200/60 dark:border-white/[0.1] text-rh-light-text dark:text-rh-text
                                    focus:border-rh-green/50 focus:outline-none"
                                />
                                <span className="text-xs text-rh-light-text dark:text-white">{meta.unit}</span>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggle(alert)}
                            aria-pressed={alert.enabled}
                            className={`relative flex-shrink-0 mt-0.5 w-10 h-[22px] rounded-full transition-colors after:content-[''] after:absolute after:-inset-3 ${
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
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="px-5 pt-1 pb-4 text-[11px] text-rh-light-text dark:text-white">
          Alerts are evaluated each time your portfolio snapshot updates.
        </p>
      </div>
    </div>,
    document.body
  );
}
