import { useState, useEffect, useMemo } from 'react';
import { PriceAlertCondition, ReferencePriceType } from '../types';
import { createPriceAlert } from '../api';

interface Props {
  ticker: string;
  currentPrice: number;
  openPrice?: number;
  averageCost?: number;
  onClose: () => void;
  onCreated: () => void;
}

const CONDITION_OPTIONS: { value: PriceAlertCondition; label: string }[] = [
  { value: 'above', label: 'Price Above' },
  { value: 'below', label: 'Price Below' },
  { value: 'pct_up', label: 'Percent Up' },
  { value: 'pct_down', label: 'Percent Down' },
];

type ExpirationOption = 'never' | 'end_of_day' | 'end_of_week' | 'custom';

function getEndOfDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function getEndOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function CreatePriceAlertModal({ ticker, currentPrice, openPrice, averageCost, onClose, onCreated }: Props) {
  const [condition, setCondition] = useState<PriceAlertCondition>('above');
  const [targetPrice, setTargetPrice] = useState('');
  const [percentChange, setPercentChange] = useState('');
  const [repeatAlert, setRepeatAlert] = useState(false);
  const [referencePriceType, setReferencePriceType] = useState<ReferencePriceType>('current');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expiration, setExpiration] = useState<ExpirationOption>('never');
  const [customDate, setCustomDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const isPriceCondition = condition === 'above' || condition === 'below';
  const isPercentCondition = condition === 'pct_up' || condition === 'pct_down';

  // Get the reference price based on selection
  const referencePrice = useMemo(() => {
    switch (referencePriceType) {
      case 'open': return openPrice ?? currentPrice;
      case 'avgCost': return averageCost ?? currentPrice;
      default: return currentPrice;
    }
  }, [referencePriceType, currentPrice, openPrice, averageCost]);

  // Calculate projected price for percent conditions
  const projectedPrice = useMemo(() => {
    const pct = parseFloat(percentChange);
    if (!pct || pct <= 0) return null;
    if (condition === 'pct_up') return referencePrice * (1 + pct / 100);
    if (condition === 'pct_down') return referencePrice * (1 - pct / 100);
    return null;
  }, [percentChange, condition, referencePrice]);

  // Generate alert preview text
  const previewText = useMemo(() => {
    if (isPriceCondition) {
      const price = parseFloat(targetPrice);
      if (!price || price <= 0) return null;
      const direction = condition === 'above' ? 'rises above' : 'falls below';
      return `You'll be notified if ${ticker} ${direction} $${price.toFixed(2)}.`;
    }
    if (isPercentCondition && projectedPrice) {
      const direction = condition === 'pct_up' ? 'rises to' : 'falls to';
      return `You'll be notified if ${ticker} ${direction} $${projectedPrice.toFixed(2)}.`;
    }
    return null;
  }, [isPriceCondition, isPercentCondition, targetPrice, projectedPrice, condition, ticker]);

  // Get expiration date
  const getExpiresAt = (): string | undefined => {
    switch (expiration) {
      case 'end_of_day': return getEndOfDay().toISOString();
      case 'end_of_week': return getEndOfWeek().toISOString();
      case 'custom': return customDate ? new Date(customDate + 'T23:59:59').toISOString() : undefined;
      default: return undefined;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isPriceCondition) {
      const price = parseFloat(targetPrice);
      if (!price || price <= 0) {
        setError('Please enter a valid target price');
        return;
      }
    }

    if (isPercentCondition) {
      const pct = parseFloat(percentChange);
      if (!pct || pct <= 0) {
        setError('Please enter a valid percentage');
        return;
      }
    }

    setSubmitting(true);

    try {
      await createPriceAlert({
        ticker,
        condition,
        targetPrice: isPriceCondition ? parseFloat(targetPrice) : undefined,
        percentChange: isPercentCondition ? parseFloat(percentChange) : undefined,
        referencePrice: isPercentCondition ? referencePrice : undefined,
        referencePriceType: isPercentCondition ? referencePriceType : undefined,
        repeatAlert,
        expiresAt: getExpiresAt(),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alert');
    } finally {
      setSubmitting(false);
    }
  };

  const referencePriceLabel = referencePriceType === 'open' ? "today's open" :
    referencePriceType === 'avgCost' ? 'your avg cost' : 'current price';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white/90 dark:bg-white/[0.06] backdrop-blur-xl border border-gray-200/50 dark:border-white/[0.08] rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl dark:shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">
            Set Price Alert
          </h2>
          <button
            onClick={onClose}
            className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Ticker + Price */}
        <div className="mb-4 p-3 bg-rh-light-bg dark:bg-rh-dark rounded-lg">
          <div className="text-xs text-rh-light-muted dark:text-rh-muted">{ticker}</div>
          <div className="text-xl font-bold text-rh-light-text dark:text-rh-text">${currentPrice.toFixed(2)}</div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Condition select */}
          <div className="mb-3">
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as PriceAlertCondition)}
              className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/50"
            >
              {CONDITION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Target price input (for above/below) */}
          {isPriceCondition && (
            <div className="mb-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-muted dark:text-rh-muted text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="Target price"
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/50"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Percent input (for pct_up/pct_down) */}
          {isPercentCondition && (
            <div className="mb-3">
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={percentChange}
                  onChange={(e) => setPercentChange(e.target.value)}
                  placeholder="Percent change"
                  className="w-full pr-8 pl-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/50"
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-rh-light-muted dark:text-rh-muted text-sm">%</span>
              </div>
              <p className="text-[11px] text-rh-light-muted dark:text-rh-muted mt-1">
                Based on {referencePriceLabel} (${referencePrice.toFixed(2)})
              </p>
            </div>
          )}

          {/* Trigger behavior toggle */}
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setRepeatAlert(false)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                !repeatAlert
                  ? 'bg-rh-green/20 text-rh-green border border-rh-green/30'
                  : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted border border-rh-light-border dark:border-rh-border'
              }`}
            >
              Trigger once
            </button>
            <button
              type="button"
              onClick={() => setRepeatAlert(true)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                repeatAlert
                  ? 'bg-rh-green/20 text-rh-green border border-rh-green/30'
                  : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted border border-rh-light-border dark:border-rh-border'
              }`}
            >
              Repeat
            </button>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-3"
          >
            <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Advanced options
          </button>

          {/* Advanced section */}
          {showAdvanced && (
            <div className="mb-3 p-3 bg-rh-light-bg/50 dark:bg-rh-dark/50 rounded-lg space-y-3">
              {/* Reference price selector (only for percent conditions) */}
              {isPercentCondition && (
                <div>
                  <label className="block text-[11px] font-medium text-rh-light-muted dark:text-rh-muted mb-1.5">
                    Calculate from
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReferencePriceType('current')}
                      className={`flex-1 py-1 text-[10px] font-medium rounded transition-colors ${
                        referencePriceType === 'current'
                          ? 'bg-rh-green/20 text-rh-green'
                          : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted'
                      }`}
                    >
                      Current
                    </button>
                    {openPrice && (
                      <button
                        type="button"
                        onClick={() => setReferencePriceType('open')}
                        className={`flex-1 py-1 text-[10px] font-medium rounded transition-colors ${
                          referencePriceType === 'open'
                            ? 'bg-rh-green/20 text-rh-green'
                            : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted'
                        }`}
                      >
                        Open
                      </button>
                    )}
                    {averageCost && (
                      <button
                        type="button"
                        onClick={() => setReferencePriceType('avgCost')}
                        className={`flex-1 py-1 text-[10px] font-medium rounded transition-colors ${
                          referencePriceType === 'avgCost'
                            ? 'bg-rh-green/20 text-rh-green'
                            : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted'
                        }`}
                      >
                        Avg Cost
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Expiration */}
              <div>
                <label className="block text-[11px] font-medium text-rh-light-muted dark:text-rh-muted mb-1.5">
                  Expires
                </label>
                <select
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value as ExpirationOption)}
                  className="w-full px-2 py-1.5 rounded border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-xs focus:outline-none"
                >
                  <option value="never">Never</option>
                  <option value="end_of_day">End of day</option>
                  <option value="end_of_week">End of week</option>
                  <option value="custom">Custom date</option>
                </select>
                {expiration === 'custom' && (
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full mt-1.5 px-2 py-1.5 rounded border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-xs focus:outline-none"
                  />
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          {previewText && (
            <div className="mb-3 py-2 px-3 bg-rh-green/5 border border-rh-green/20 rounded-lg">
              <p className="text-xs text-rh-light-text dark:text-rh-text">{previewText}</p>
            </div>
          )}

          {error && (
            <div className="mb-3 p-2 bg-rh-red/10 border border-rh-red/30 rounded-lg">
              <p className="text-xs text-rh-red">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border text-rh-light-text dark:text-rh-text text-sm font-medium hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-3 py-2 rounded-lg bg-rh-green hover:bg-green-600 text-black font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
