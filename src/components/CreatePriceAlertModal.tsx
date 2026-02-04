import { useState } from 'react';
import { PriceAlertCondition } from '../types';
import { createPriceAlert } from '../api';

interface Props {
  ticker: string;
  currentPrice: number;
  onClose: () => void;
  onCreated: () => void;
}

const CONDITION_OPTIONS: { value: PriceAlertCondition; label: string; description: string }[] = [
  { value: 'above', label: 'Price Above', description: 'Alert when price crosses above target' },
  { value: 'below', label: 'Price Below', description: 'Alert when price crosses below target' },
  { value: 'pct_up', label: 'Percent Up', description: 'Alert when price increases by X%' },
  { value: 'pct_down', label: 'Percent Down', description: 'Alert when price decreases by X%' },
];

export function CreatePriceAlertModal({ ticker, currentPrice, onClose, onCreated }: Props) {
  const [condition, setCondition] = useState<PriceAlertCondition>('above');
  const [targetPrice, setTargetPrice] = useState('');
  const [percentChange, setPercentChange] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPriceCondition = condition === 'above' || condition === 'below';
  const isPercentCondition = condition === 'pct_up' || condition === 'pct_down';

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
        referencePrice: isPercentCondition ? currentPrice : undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alert');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate target price for percent conditions
  const getProjectedPrice = () => {
    const pct = parseFloat(percentChange);
    if (!pct || pct <= 0) return null;
    if (condition === 'pct_up') {
      return currentPrice * (1 + pct / 100);
    }
    if (condition === 'pct_down') {
      return currentPrice * (1 - pct / 100);
    }
    return null;
  };

  const projectedPrice = isPercentCondition ? getProjectedPrice() : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-6 w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
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

        {/* Ticker and current price */}
        <div className="mb-4 p-3 bg-rh-light-bg dark:bg-rh-dark rounded-lg">
          <div className="text-sm text-rh-light-muted dark:text-rh-muted">
            {ticker}
          </div>
          <div className="text-xl font-bold text-rh-light-text dark:text-rh-text">
            ${currentPrice.toFixed(2)}
          </div>
          <div className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
            Current Price
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Condition select */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-2">
              Alert Condition
            </label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as PriceAlertCondition)}
              className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/50"
            >
              {CONDITION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
              {CONDITION_OPTIONS.find(o => o.value === condition)?.description}
            </p>
          </div>

          {/* Target price input (for above/below) */}
          {isPriceCondition && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-2">
                Target Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-muted dark:text-rh-muted">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder={currentPrice.toFixed(2)}
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/50"
                />
              </div>
              {targetPrice && parseFloat(targetPrice) > 0 && (
                <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
                  {condition === 'above' ? 'Alert when price rises to ' : 'Alert when price falls to '}
                  <span className="font-medium text-rh-light-text dark:text-rh-text">
                    ${parseFloat(targetPrice).toFixed(2)}
                  </span>
                  {' '}({((parseFloat(targetPrice) - currentPrice) / currentPrice * 100).toFixed(1)}% from current)
                </p>
              )}
            </div>
          )}

          {/* Percent input (for pct_up/pct_down) */}
          {isPercentCondition && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-2">
                Percent Change
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={percentChange}
                  onChange={(e) => setPercentChange(e.target.value)}
                  placeholder="5"
                  className="w-full pr-7 pl-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-rh-light-muted dark:text-rh-muted">%</span>
              </div>
              {projectedPrice && (
                <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
                  Alert when price reaches{' '}
                  <span className={`font-medium ${condition === 'pct_up' ? 'text-rh-green' : 'text-rh-red'}`}>
                    ${projectedPrice.toFixed(2)}
                  </span>
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 p-2 bg-rh-red/10 border border-rh-red/30 rounded-lg">
              <p className="text-sm text-rh-red">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-rh-light-border dark:border-rh-border text-rh-light-text dark:text-rh-text text-sm font-medium hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg bg-rh-green hover:bg-green-600 text-black font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
