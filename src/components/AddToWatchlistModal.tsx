import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { WatchlistSummary } from '../types';
import { getWatchlists, addWatchlistHolding, removeWatchlistHolding, getWatchlistDetail } from '../api';
import { useDataEvents } from '../context/DataEventContext';

interface AddToWatchlistModalProps {
  ticker: string;
  currentPrice: number;
  onClose: () => void;
  onCreateNew: () => void;
}

export function AddToWatchlistModal({ ticker, currentPrice, onClose, onCreateNew }: AddToWatchlistModalProps) {
  const { emit } = useDataEvents();
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [holdingMap, setHoldingMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [shares, setShares] = useState('1');
  const [averageCost, setAverageCost] = useState(currentPrice.toFixed(2));
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const lists = await getWatchlists();
      setWatchlists(lists);

      // Check which watchlists already contain this ticker
      const map: Record<string, boolean> = {};
      await Promise.all(
        lists.map(async (wl) => {
          try {
            const detail = await getWatchlistDetail(wl.id);
            map[wl.id] = detail.holdings.some(h => h.ticker.toUpperCase() === ticker.toUpperCase());
          } catch {
            map[wl.id] = false;
          }
        })
      );
      setHoldingMap(map);
    } catch {
      setError('Failed to load watchlists');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    loadData();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, loadData]);

  const handleToggle = async (wlId: string) => {
    if (holdingMap[wlId]) {
      // Remove from watchlist
      try {
        await removeWatchlistHolding(wlId, ticker);
        setHoldingMap(prev => ({ ...prev, [wlId]: false }));
        emit('watchlist:changed');
      } catch {
        setError('Failed to remove from watchlist');
      }
    } else {
      // Show add form
      setAddingTo(wlId);
      setShares('1');
      setAverageCost(currentPrice.toFixed(2));
    }
  };

  const handleAdd = async () => {
    if (!addingTo) return;
    const s = parseFloat(shares);
    const c = parseFloat(averageCost);
    if (!s || s <= 0) { setError('Enter valid shares'); return; }
    if (!c || c <= 0) { setError('Enter valid cost'); return; }

    try {
      await addWatchlistHolding(addingTo, { ticker, shares: s, averageCost: c });
      setHoldingMap(prev => ({ ...prev, [addingTo]: true }));
      setAddingTo(null);
      setError('');
      emit('watchlist:changed');
    } catch {
      setError('Failed to add to watchlist');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[90%] max-w-md bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[18px] border border-white/20 dark:border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-rh-light-text dark:text-white">
            Add {ticker} to Watchlist
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
            <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="text-xs text-rh-red mb-3 px-3 py-2 bg-rh-red/10 rounded-lg">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-rh-green border-t-transparent" />
          </div>
        ) : watchlists.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-3">No watchlists yet</p>
            <button
              onClick={() => { onClose(); onCreateNew(); }}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-rh-green/15 text-rh-green hover:bg-rh-green/25 transition-colors"
            >
              Create Watchlist
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {watchlists.map((wl) => (
              <div key={wl.id}>
                <button
                  onClick={() => handleToggle(wl.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                    holdingMap[wl.id]
                      ? 'bg-rh-green/[0.08] border border-rh-green/20'
                      : 'border border-gray-200/40 dark:border-white/[0.06] hover:border-gray-300/60 dark:hover:border-white/[0.1]'
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: wl.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-rh-light-text dark:text-rh-text truncate">
                      {wl.name}
                    </div>
                    <div className="text-[11px] text-rh-light-muted dark:text-rh-muted">
                      {wl.holdingsCount} holding{wl.holdingsCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {holdingMap[wl.id] ? (
                    <svg className="w-5 h-5 text-rh-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-rh-light-muted/30 dark:text-rh-muted/30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </button>

                {/* Inline add form */}
                {addingTo === wl.id && (
                  <div className="mt-2 ml-6 p-3 rounded-xl bg-gray-50/80 dark:bg-white/[0.03] border border-gray-200/40 dark:border-white/[0.06] space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-rh-light-muted dark:text-rh-muted mb-1">Shares</label>
                        <input
                          type="number"
                          value={shares}
                          onChange={(e) => setShares(e.target.value)}
                          min="0.001"
                          step="any"
                          className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text focus:outline-none focus:border-rh-green/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-rh-light-muted dark:text-rh-muted mb-1">Avg Cost</label>
                        <input
                          type="number"
                          value={averageCost}
                          onChange={(e) => setAverageCost(e.target.value)}
                          min="0.01"
                          step="any"
                          className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text focus:outline-none focus:border-rh-green/50 transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setAddingTo(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAdd}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rh-green/15 text-rh-green hover:bg-rh-green/25 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => { onClose(); onCreateNew(); }}
          className="w-full mt-4 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border border-dashed border-gray-300/60 dark:border-white/[0.1] text-rh-light-muted dark:text-rh-muted hover:text-rh-green hover:border-rh-green/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create New Watchlist
        </button>
      </div>
    </div>,
    document.body
  );
}
