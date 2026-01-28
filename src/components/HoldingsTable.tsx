import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Holding, MarketSession } from '../types';
import { deleteHolding, addHolding } from '../api';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';

function getSessionBadge(session?: MarketSession): { label: string; color: string } | null {
  switch (session) {
    case 'PRE': return { label: 'PRE', color: 'bg-blue-500/20 text-blue-400' };
    case 'REG': return { label: 'REG', color: 'bg-green-500/20 text-green-400' };
    case 'POST': return { label: 'AH', color: 'bg-purple-500/20 text-purple-400' };
    case 'CLOSED': return { label: 'CLOSED', color: 'bg-gray-500/20 text-gray-400' };
    default: return null;
  }
}

interface Props {
  holdings: Holding[];
  onUpdate: () => void;
  showExtendedHours?: boolean;
}

type SortKey = 'ticker' | 'shares' | 'averageCost' | 'currentPrice' | 'currentValue' | 'dayChange' | 'dayChangePercent' | 'profitLoss' | 'profitLossPercent';
type SortDir = 'asc' | 'desc';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatPL(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

// Check if a value is valid for sorting (not NaN, not unavailable)
function isValidValue(holding: Holding, key: SortKey): boolean {
  if (key === 'ticker') return true;
  if (key === 'shares' || key === 'averageCost') return !isNaN(holding[key]);
  // For price-dependent fields, check if price is available
  if (holding.priceUnavailable || holding.currentPrice <= 0) return false;
  return !isNaN(holding[key]);
}

// Get sortable value from holding
function getSortValue(holding: Holding, key: SortKey): string | number {
  if (key === 'ticker') return holding.ticker.toLowerCase();
  return holding[key];
}

export function HoldingsTable({ holdings, onUpdate, showExtendedHours = true }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('ticker');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [formData, setFormData] = useState({ ticker: '', shares: '', averageCost: '' });

  // Extract held tickers for autocomplete boost
  const heldTickers = useMemo(() => holdings.map(h => h.ticker), [holdings]);

  // Ref for the Add Stock button to return focus after modal closes
  const addStockButtonRef = useRef<HTMLButtonElement>(null);

  // Check if any modal is open
  const isModalOpen = showAddModal || editingHolding !== null;

  const handleDelete = async (ticker: string) => {
    if (!confirm(`Delete ${ticker} from portfolio?`)) return;

    setDeleting(ticker);
    try {
      await deleteHolding(ticker);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  // Handle column header click - toggle between desc and asc
  const handleSort = (key: SortKey) => {
    if (sortKey !== key) {
      // New column: start with descending
      setSortKey(key);
      setSortDir('desc');
    } else {
      // Same column: toggle direction
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    }
  };

  // Memoized sorted holdings
  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => {
      const aValid = isValidValue(a, sortKey);
      const bValid = isValidValue(b, sortKey);

      // Push invalid values to bottom regardless of sort direction
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;

      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = (aVal as number) - (bVal as number);
      }

      // Tiebreaker: alphabetical by ticker
      if (comparison === 0 && sortKey !== 'ticker') {
        comparison = a.ticker.localeCompare(b.ticker);
      }

      return sortDir === 'desc' ? -comparison : comparison;
    });
  }, [holdings, sortKey, sortDir]);

  // Get sort indicator for a column
  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1 opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  // Get header class for a column
  const getHeaderClass = (key: SortKey, align: 'left' | 'right' = 'left') => {
    const base = 'px-4 py-3 font-medium cursor-pointer hover:text-rh-light-text dark:hover:text-white hover:bg-gray-100 dark:hover:bg-rh-dark/30 transition-colors select-none whitespace-nowrap';
    const alignClass = align === 'right' ? 'text-right' : '';
    const activeClass = sortKey === key ? 'text-rh-light-text dark:text-white' : '';
    return `${base} ${alignClass} ${activeClass}`;
  };

  // Open edit modal
  const handleEdit = (holding: Holding) => {
    setEditingHolding(holding);
    setFormData({
      ticker: holding.ticker,
      shares: String(holding.shares),
      averageCost: String(holding.averageCost),
    });
    setModalError('');
  };

  // Open add modal
  const handleOpenAdd = () => {
    setShowAddModal(true);
    setFormData({ ticker: '', shares: '', averageCost: '' });
    setModalError('');
  };

  // Close modals
  const handleCloseModal = useCallback(() => {
    setEditingHolding(null);
    setShowAddModal(false);
    setModalError('');
    setFormData({ ticker: '', shares: '', averageCost: '' });
    // Return focus to the Add Stock button for accessibility
    setTimeout(() => {
      addStockButtonRef.current?.focus();
    }, 0);
  }, []);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isModalOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseModal();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isModalOpen, handleCloseModal]);

  // Save holding (add or edit)
  const handleSaveHolding = async () => {
    const ticker = formData.ticker.trim().toUpperCase();
    const shares = parseFloat(formData.shares);
    const averageCost = parseFloat(formData.averageCost);

    if (!ticker) {
      setModalError('Ticker is required');
      return;
    }
    if (isNaN(shares) || shares <= 0) {
      setModalError('Shares must be greater than 0');
      return;
    }
    if (isNaN(averageCost) || averageCost < 0) {
      setModalError('Average cost must be 0 or greater');
      return;
    }

    setModalLoading(true);
    setModalError('');

    try {
      await addHolding({ ticker, shares, averageCost });
      handleCloseModal();
      onUpdate();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save holding');
    } finally {
      setModalLoading(false);
    }
  };

  // Render modal content - using a function to avoid component recreation issues
  const renderModalContent = (isEditing: boolean) => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-rh-light-muted dark:text-rh-muted mb-1">
          Ticker {isEditing && <span className="text-xs">(read-only)</span>}
        </label>
        {isEditing ? (
          <input
            type="text"
            value={formData.ticker}
            disabled
            className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border
              bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text
              focus:outline-none focus:ring-2 focus:ring-rh-green/50
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
        ) : (
          <TickerAutocompleteInput
            value={formData.ticker}
            onChange={(value) => setFormData({ ...formData, ticker: value })}
            placeholder="e.g. AAPL"
            autoFocus
            heldTickers={heldTickers}
          />
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-rh-light-muted dark:text-rh-muted mb-1">Shares</label>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={formData.shares}
          onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
          placeholder="e.g. 10"
          className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border
            bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text
            focus:outline-none focus:ring-2 focus:ring-rh-green/50"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-rh-light-muted dark:text-rh-muted mb-1">Average Cost ($)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={formData.averageCost}
          onChange={(e) => setFormData({ ...formData, averageCost: e.target.value })}
          placeholder="e.g. 150.00"
          className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border
            bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text
            focus:outline-none focus:ring-2 focus:ring-rh-green/50"
        />
      </div>
      {modalError && (
        <p className="text-rh-red text-sm">{modalError}</p>
      )}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCloseModal();
          }}
          className="flex-1 px-4 py-2 rounded-lg border border-rh-light-border dark:border-rh-border
            text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSaveHolding();
          }}
          disabled={modalLoading}
          className="flex-1 px-4 py-2 rounded-lg bg-rh-green text-black font-semibold
            hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {modalLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );

  if (holdings.length === 0) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Holdings</h2>
          <button
            ref={addStockButtonRef}
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rh-green text-black font-semibold
              hover:bg-green-600 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Stock
          </button>
        </div>
        <p className="text-rh-light-muted dark:text-rh-muted text-center py-8">No holdings yet. Add your first stock above.</p>

        {showAddModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title-add"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCloseModal();
              }}
              aria-hidden="true"
            />
            <div
              className="relative bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-6 w-full max-w-md shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 id="modal-title-add" className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Add Stock</h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCloseModal();
                  }}
                  className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white p-1"
                  aria-label="Close modal"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {renderModalContent(false)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg overflow-hidden shadow-sm dark:shadow-none">
      <div className="p-6 pb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Holdings</h2>
        <button
          ref={addStockButtonRef}
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rh-green text-black font-semibold
            hover:bg-green-600 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Stock
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-t border-b border-rh-light-border dark:border-rh-border text-left text-sm text-rh-light-muted dark:text-rh-muted">
              <th className={getHeaderClass('ticker')} onClick={() => handleSort('ticker')}>
                Ticker{getSortIndicator('ticker')}
              </th>
              <th className={getHeaderClass('shares', 'right')} onClick={() => handleSort('shares')}>
                {getSortIndicator('shares')}Shares
              </th>
              <th className={getHeaderClass('averageCost', 'right')} onClick={() => handleSort('averageCost')}>
                {getSortIndicator('averageCost')}Avg Cost
              </th>
              <th className={getHeaderClass('currentPrice', 'right')} onClick={() => handleSort('currentPrice')}>
                {getSortIndicator('currentPrice')}Price
              </th>
              <th className={getHeaderClass('currentValue', 'right')} onClick={() => handleSort('currentValue')}>
                {getSortIndicator('currentValue')}Market Value
              </th>
              <th className={getHeaderClass('dayChange', 'right')} onClick={() => handleSort('dayChange')}>
                {getSortIndicator('dayChange')}Day P/L
              </th>
              <th className={getHeaderClass('dayChangePercent', 'right')} onClick={() => handleSort('dayChangePercent')}>
                {getSortIndicator('dayChangePercent')}Day %
              </th>
              <th className={getHeaderClass('profitLoss', 'right')} onClick={() => handleSort('profitLoss')}>
                {getSortIndicator('profitLoss')}Total P/L
              </th>
              <th className={getHeaderClass('profitLossPercent', 'right')} onClick={() => handleSort('profitLossPercent')}>
                {getSortIndicator('profitLossPercent')}Total %
              </th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding) => {
              const isUnavailable = holding.priceUnavailable;
              const isRepricing = holding.isRepricing || holding.priceIsStale;
              const hasValidPrice = !isUnavailable && holding.currentPrice > 0;

              return (
                <tr
                  key={holding.id}
                  className={`border-b border-rh-light-border dark:border-rh-border hover:bg-gray-50 dark:hover:bg-rh-dark/50 ${isUnavailable ? 'opacity-60' : ''}`}
                >
                  <td className="px-4 py-4 font-semibold text-rh-light-text dark:text-rh-text">
                    <div className="flex items-center gap-2">
                      {holding.ticker}
                      {isRepricing && !isUnavailable && (
                        <span
                          className="relative flex h-2 w-2"
                          title="Repricing…"
                        >
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
                        </span>
                      )}
                      {isUnavailable && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded" title="No price data available">
                          no data
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-rh-light-text dark:text-rh-text">{holding.shares.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right text-rh-light-text dark:text-rh-text">{formatCurrency(holding.averageCost)}</td>
                  <td className={`px-4 py-4 text-right ${isRepricing ? 'text-yellow-400' : 'text-rh-light-text dark:text-rh-text'}`}>
                    <div className="flex items-center justify-end gap-1.5">
                      {hasValidPrice ? formatCurrency(holding.currentPrice) : '—'}
                      {showExtendedHours && hasValidPrice && holding.session && getSessionBadge(holding.session) && (
                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${getSessionBadge(holding.session)!.color}`}>
                          {getSessionBadge(holding.session)!.label}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-rh-light-text dark:text-rh-text">
                    {hasValidPrice ? formatCurrency(holding.currentValue) : '—'}
                  </td>
                  <td className={`px-4 py-4 text-right ${
                    !hasValidPrice ? 'text-rh-light-muted dark:text-rh-muted' :
                    holding.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {hasValidPrice ? formatPL(holding.dayChange) : '—'}
                  </td>
                  <td className={`px-4 py-4 text-right ${
                    !hasValidPrice ? 'text-rh-light-muted dark:text-rh-muted' :
                    holding.dayChangePercent >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {hasValidPrice ? formatPercent(holding.dayChangePercent) : '—'}
                  </td>
                  <td className={`px-4 py-4 text-right ${
                    !hasValidPrice ? 'text-rh-light-muted dark:text-rh-muted' :
                    holding.profitLoss >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {hasValidPrice ? formatPL(holding.profitLoss) : '—'}
                  </td>
                  <td className={`px-4 py-4 text-right ${
                    !hasValidPrice ? 'text-rh-light-muted dark:text-rh-muted' :
                    holding.profitLossPercent >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {hasValidPrice ? formatPercent(holding.profitLossPercent) : '—'}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(holding)}
                        className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white text-sm transition-colors"
                        title="Edit holding"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(holding.ticker)}
                        disabled={deleting === holding.ticker}
                        className="text-rh-light-muted dark:text-rh-muted hover:text-rh-red disabled:opacity-50 text-sm transition-colors"
                        title="Delete holding"
                      >
                        {deleting === holding.ticker ? (
                          <span className="text-xs">...</span>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Stock Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-add"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCloseModal();
            }}
            aria-hidden="true"
          />
          <div
            className="relative bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="modal-title-add" className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Add Stock</h3>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCloseModal();
                }}
                className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white p-1"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {renderModalContent(false)}
          </div>
        </div>
      )}

      {/* Edit Holding Modal */}
      {editingHolding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-edit"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCloseModal();
            }}
            aria-hidden="true"
          />
          <div
            className="relative bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="modal-title-edit" className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Edit {editingHolding.ticker}</h3>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCloseModal();
                }}
                className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white p-1"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {renderModalContent(true)}
          </div>
        </div>
      )}
    </div>
  );
}
