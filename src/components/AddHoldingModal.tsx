import { useState, useEffect } from 'react';
import { Holding } from '../types';
import { addHolding } from '../api';
import { useToast } from '../context/ToastContext';

interface AddHoldingModalProps {
  ticker: string;
  currentPrice: number;
  onAdded?: () => void;
  holding?: Holding | null;
  onClose: () => void;
}

export function AddHoldingModal({ ticker, currentPrice, onAdded, holding, onClose }: AddHoldingModalProps) {
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = parseFloat(shares);
    const c = parseFloat(avgCost);
    if (!s || s <= 0) { setFormError('Enter a valid number of shares'); return; }
    if (!c || c <= 0) { setFormError('Enter a valid average cost'); return; }

    setSubmitting(true);
    setFormError(null);
    try {
      await addHolding({ ticker: ticker.toUpperCase(), shares: s, averageCost: c });
      showToast(`${ticker.toUpperCase()} added to portfolio`, 'success');
      onAdded?.();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add holding');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-white dark:bg-[#0a0a0b] rounded-xl border border-gray-200/60 dark:border-white/[0.08] p-5 modal-container backdrop-blur-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white">
            {holding ? 'Update Holding' : 'Add to Portfolio'}
          </h2>
          <button onClick={onClose} className="text-rh-light-muted/60 dark:text-white/30 hover:text-rh-light-text dark:hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {holding && (
          <div className="mb-3 text-sm text-rh-light-muted dark:text-rh-muted">
            Holding <span className="font-semibold text-rh-light-text dark:text-rh-text">{holding.shares}</span> shares at <span className="font-semibold text-rh-light-text dark:text-rh-text">${holding.averageCost.toFixed(2)}</span> avg
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-1">Shares</label>
            <input
              type="number"
              step="any"
              min="0.001"
              value={shares}
              onChange={e => setShares(e.target.value)}
              placeholder="10"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-200/60 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.04] text-rh-light-text dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/30 focus:border-rh-green/40 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-1">Avg Cost per Share</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={avgCost}
              onChange={e => setAvgCost(e.target.value)}
              placeholder={currentPrice.toFixed(2)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200/60 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.04] text-rh-light-text dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/30 focus:border-rh-green/40 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-5 py-2.5 rounded-lg bg-rh-green hover:bg-green-600 text-black font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : holding ? 'Update' : 'Add to Portfolio'}
          </button>
        </form>
        {formError && <p className="text-rh-red text-xs mt-2">{formError}</p>}
      </div>
    </div>
  );
}
