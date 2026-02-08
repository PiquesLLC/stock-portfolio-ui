import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Holding, MarketSession } from '../types';
import { deleteHolding, addHolding, updateSettings, getPortfolio } from '../api';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';
import { getAcronymTitle } from './Acronym';
import { MiniSparkline } from './MiniSparkline';

function getSessionBadge(session?: MarketSession): { label: string; color: string; title?: string } | null {
  switch (session) {
    case 'PRE': return { label: 'PRE', color: 'bg-blue-500/20 text-blue-400', title: getAcronymTitle('PRE') };
    case 'REG': return { label: 'REG', color: 'bg-green-500/20 text-green-400', title: getAcronymTitle('REG') };
    case 'POST': return { label: 'AH', color: 'bg-purple-500/20 text-purple-400', title: getAcronymTitle('AH') };
    case 'CLOSED': return { label: 'CLOSED', color: 'bg-gray-500/10 text-gray-500/60' };
    default: return null;
  }
}

export interface HoldingsTableActions {
  openAdd: () => void;
  openCashMargin: () => void;
}

interface Props {
  holdings: Holding[];
  onUpdate: () => void;
  showExtendedHours?: boolean;
  onTickerClick?: (ticker: string, holding: Holding) => void;
  cashBalance?: number;
  marginDebt?: number;
  userId?: string;
  actionsRef?: React.MutableRefObject<HoldingsTableActions | null>;
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

export function HoldingsTable({ holdings, onUpdate, showExtendedHours = true, onTickerClick, cashBalance = 0, marginDebt = 0, userId, actionsRef }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('ticker');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCashMarginModal, setShowCashMarginModal] = useState(false);
  const [cashValue, setCashValue] = useState(cashBalance.toString());
  const [marginValue, setMarginValue] = useState(marginDebt.toString());
  const [cashMarginLoading, setCashMarginLoading] = useState(false);
  const [cashMarginError, setCashMarginError] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [formData, setFormData] = useState({ ticker: '', shares: '', averageCost: '', fundingSource: 'cash' as 'cash' | 'margin' });

  // Extract held tickers for autocomplete boost
  const heldTickers = useMemo(() => holdings.map(h => h.ticker), [holdings]);

  // Ref for the Add Stock button to return focus after modal closes
  const addStockButtonRef = useRef<HTMLButtonElement>(null);

  // Sync cash/margin values when props change (round to 2 decimals to avoid floating point noise)
  useEffect(() => { setCashValue(parseFloat(cashBalance.toFixed(2)).toString()); }, [cashBalance]);
  useEffect(() => { setMarginValue(parseFloat(marginDebt.toFixed(2)).toString()); }, [marginDebt]);

  // Check if any modal is open
  const isModalOpen = showAddModal || editingHolding !== null || showCashMarginModal;

  const handleOpenCashMargin = () => {
    setCashValue(parseFloat(cashBalance.toFixed(2)).toString());
    setMarginValue(parseFloat(marginDebt.toFixed(2)).toString());
    setCashMarginError('');
    setShowCashMarginModal(true);
  };

  const handleSaveCashMargin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashMarginError('');
    const cash = parseFloat(cashValue);
    const margin = parseFloat(marginValue);
    if (isNaN(cash) || cash < 0) { setCashMarginError('Cash balance must be non-negative'); return; }
    if (isNaN(margin) || margin < 0) { setCashMarginError('Margin debt must be non-negative'); return; }
    setCashMarginLoading(true);
    try {
      await updateSettings({ cashBalance: cash, marginDebt: margin }, userId);
      onUpdate();
      setShowCashMarginModal(false);
    } catch (err) {
      setCashMarginError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setCashMarginLoading(false);
    }
  };

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
      fundingSource: 'cash', // Not used for edits, but needed for type
    });
    setModalError('');
  };

  // Open add modal
  const handleOpenAdd = () => {
    setShowAddModal(true);
    setFormData({ ticker: '', shares: '', averageCost: '', fundingSource: 'cash' });
    setModalError('');
  };

  // Expose actions to parent via ref
  if (actionsRef) {
    actionsRef.current = { openAdd: handleOpenAdd, openCashMargin: handleOpenCashMargin };
  }

  // Close modals
  const handleCloseModal = useCallback(() => {
    setEditingHolding(null);
    setShowAddModal(false);
    setModalError('');
    setFormData({ ticker: '', shares: '', averageCost: '', fundingSource: 'cash' });
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
    const isEditing = editingHolding !== null;

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
      // Calculate current net equity BEFORE adding the holding
      // so we can keep it unchanged for margin purchases
      const oldHoldingsValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
      const oldNetEquity = oldHoldingsValue + cashBalance - marginDebt;

      await addHolding({ ticker, shares, averageCost });

      // If buying on margin, adjust margin debt to keep net equity unchanged.
      // We fetch the fresh portfolio to get the actual new totalAssets at MARKET prices,
      // then set marginDebt = newTotalAssets - oldNetEquity. This prevents the bug where
      // cost basis != market value caused phantom portfolio value changes.
      if (formData.fundingSource === 'margin' && !isEditing) {
        const freshPortfolio = await getPortfolio(userId);
        const newMarginDebt = freshPortfolio.totalAssets - oldNetEquity;
        if (newMarginDebt > 0) {
          await updateSettings({ marginDebt: newMarginDebt }, userId);
        }
      }

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
            className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-white/[0.08]
              bg-rh-light-bg dark:bg-white/[0.04] text-rh-light-text dark:text-rh-text
              focus:outline-none focus:ring-2 focus:ring-rh-green/20 focus:border-rh-green/40
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
          className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-white/[0.08]
            bg-rh-light-bg dark:bg-white/[0.04] text-rh-light-text dark:text-rh-text
            focus:outline-none focus:ring-2 focus:ring-rh-green/20 focus:border-rh-green/40"
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
          className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-white/[0.08]
            bg-rh-light-bg dark:bg-white/[0.04] text-rh-light-text dark:text-rh-text
            focus:outline-none focus:ring-2 focus:ring-rh-green/20 focus:border-rh-green/40"
        />
      </div>
      {!isEditing && (
        <div>
          <label className="block text-sm font-medium text-rh-light-muted dark:text-rh-muted mb-2">Funding Source</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, fundingSource: 'cash' })}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                formData.fundingSource === 'cash'
                  ? 'bg-rh-green/10 text-rh-green border border-rh-green/40'
                  : 'bg-rh-light-bg dark:bg-white/[0.04] text-rh-light-muted dark:text-rh-muted border border-rh-light-border dark:border-white/[0.08] hover:border-rh-green/30'
              }`}
            >
              Cash
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, fundingSource: 'margin' })}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                formData.fundingSource === 'margin'
                  ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/40'
                  : 'bg-rh-light-bg dark:bg-white/[0.04] text-rh-light-muted dark:text-rh-muted border border-rh-light-border dark:border-white/[0.08] hover:border-yellow-500/30'
              }`}
            >
              Margin
            </button>
          </div>
          {formData.fundingSource === 'margin' && (
            <p className="text-xs text-yellow-500/70 mt-1.5">Margin debt will increase by the purchase amount</p>
          )}
        </div>
      )}
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
          className="flex-1 px-4 py-2 rounded-xl border border-rh-light-border dark:border-white/[0.08]
            text-rh-light-text dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.05] dark:hover:text-rh-text transition-colors"
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
          className="flex-1 px-4 py-2 rounded-xl bg-rh-green text-black font-semibold
            hover:bg-green-600 hover:shadow-lg hover:shadow-rh-green/20 disabled:opacity-50 transition-all"
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenCashMargin}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rh-light-border dark:border-rh-border
                text-rh-light-text dark:text-rh-text hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Cash & Margin
            </button>
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
              className="absolute inset-0 modal-overlay bg-black/60"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCloseModal();
              }}
              aria-hidden="true"
            />
            <div
              className="relative modal-container bg-white dark:bg-rh-card rounded-[18px] p-6 w-full max-w-md [border:none] [outline:none] [box-shadow:0_4px_24px_rgba(0,0,0,0.08),0_12px_48px_rgba(0,0,0,0.06)]"
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
    <div className="rounded-xl overflow-hidden">
      <div className="px-4 pb-4 pt-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rh-light-muted/80 dark:text-rh-muted/80">Holdings</h2>
        {!actionsRef && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenCashMargin}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rh-light-border/40 dark:border-rh-border/30
                text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-all duration-150 text-xs hover:scale-[1.02]"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Cash & Margin
            </button>
            <button
              ref={addStockButtonRef}
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rh-green text-black font-semibold
                hover:bg-green-600 transition-all duration-150 text-xs hover:scale-[1.02]"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Stock
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 backdrop-blur-sm bg-rh-light-bg/90 dark:bg-rh-black/90">
            <tr className="border-t border-b border-rh-light-border/25 dark:border-rh-border/25 text-left text-xs uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/60">
              <th className={getHeaderClass('ticker')} onClick={() => handleSort('ticker')} title="Sort by ticker symbol">
                Ticker{getSortIndicator('ticker')}
              </th>
              <th className={`px-2 py-3 font-medium text-center cursor-pointer hover:text-rh-light-text dark:hover:text-white hover:bg-gray-100 dark:hover:bg-rh-dark/30 transition-colors select-none whitespace-nowrap ${sortKey === 'dayChangePercent' ? 'text-rh-light-text dark:text-white' : ''}`} onClick={() => handleSort('dayChangePercent')} title="Sort by today's percentage change">
                Today{sortKey === 'dayChangePercent' ? <span className="ml-1 opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span> : null}
              </th>
              <th className={`hidden md:table-cell ${getHeaderClass('averageCost', 'right')}`} onClick={() => handleSort('averageCost')} title="Sort by average cost basis">
                {getSortIndicator('averageCost')}Avg Cost
              </th>
              <th className={`hidden lg:table-cell ${getHeaderClass('shares', 'right')}`} onClick={() => handleSort('shares')} title="Sort by number of shares">
                {getSortIndicator('shares')}Shares
              </th>
              <th className={getHeaderClass('currentPrice', 'right')} onClick={() => handleSort('currentPrice')} title="Sort by current price">
                {getSortIndicator('currentPrice')}Price
              </th>
              <th className={`hidden sm:table-cell ${getHeaderClass('currentValue', 'right')}`} onClick={() => handleSort('currentValue')} title="Sort by market value">
                {getSortIndicator('currentValue')}Mkt Val
              </th>
              <th className={`hidden lg:table-cell ${getHeaderClass('dayChange', 'right')}`} onClick={() => handleSort('dayChange')} title="Sort by today's profit/loss">
                {getSortIndicator('dayChange')}Day <span>P/L</span>
              </th>
              <th className={`hidden md:table-cell ${getHeaderClass('dayChangePercent', 'right')}`} onClick={() => handleSort('dayChangePercent')} title="Sort by today's percentage change">
                {getSortIndicator('dayChangePercent')}Day %
              </th>
              <th className={getHeaderClass('profitLoss', 'right')} onClick={() => handleSort('profitLoss')} title="Sort by total profit/loss">
                {getSortIndicator('profitLoss')}Total <span>P/L</span>
              </th>
              <th className={`hidden sm:table-cell ${getHeaderClass('profitLossPercent', 'right')}`} onClick={() => handleSort('profitLossPercent')} title="Sort by total percentage return">
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
                  className={`border-b border-rh-light-border/20 dark:border-rh-border/20 holding-row group hover:bg-gray-50/80 dark:hover:bg-white/[0.03] hover:backdrop-blur-[5px] transition-all duration-300 ${isUnavailable ? 'opacity-60' : ''} ${onTickerClick ? 'cursor-pointer' : ''}`}
                  onClick={onTickerClick && !isUnavailable ? () => onTickerClick(holding.ticker, holding) : undefined}
                >
                  <td className="px-4 py-2.5 font-semibold text-rh-light-text dark:text-rh-text">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={onTickerClick ? 'cursor-pointer hover:underline hover:text-rh-green transition-colors' : ''}
                        onClick={onTickerClick ? () => onTickerClick(holding.ticker, holding) : undefined}
                      >
                        {holding.ticker}
                      </span>
                      {isRepricing && !isUnavailable && (
                        <span
                          className="relative flex h-2 w-2 shrink-0"
                          title="Repricing…"
                        >
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
                        </span>
                      )}
                      {isUnavailable && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded shrink-0" title="No price data available">
                          no data
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {hasValidPrice && (
                      <MiniSparkline ticker={holding.ticker} positive={holding.dayChange >= 0} />
                    )}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-right text-rh-light-text dark:text-rh-text group-hover:text-rh-light-text dark:group-hover:text-white transition-colors duration-200">{formatCurrency(holding.averageCost)}</td>
                  <td className="hidden lg:table-cell px-4 py-3 text-right text-rh-light-text dark:text-rh-text group-hover:text-rh-light-text dark:group-hover:text-white transition-colors duration-200">{holding.shares.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right transition-colors duration-200 ${isRepricing ? 'text-yellow-400' : 'text-rh-light-text dark:text-rh-text dark:group-hover:text-white'}`}>
                    <div className="flex items-center justify-end gap-1.5">
                      {hasValidPrice ? formatCurrency(holding.currentPrice) : '—'}
                      {showExtendedHours && hasValidPrice && holding.session && holding.session !== 'CLOSED' && holding.session !== 'PRE' && getSessionBadge(holding.session) && (
                        <span
                          className={`text-[10px] px-1 py-0.5 rounded font-medium ${getSessionBadge(holding.session)!.color}`}
                          title={getSessionBadge(holding.session)!.title}
                        >
                          {getSessionBadge(holding.session)!.label}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`hidden sm:table-cell px-4 py-3 text-right font-medium text-rh-light-text dark:text-rh-text dark:group-hover:text-white transition-colors duration-200`}>
                    {hasValidPrice ? formatCurrency(holding.currentValue) : '—'}
                  </td>
                  <td className={`hidden lg:table-cell px-4 py-3 text-right ${
                    !hasValidPrice ? 'text-rh-light-muted dark:text-rh-muted' :
                    holding.dayChange >= 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                  }`}>
                    {hasValidPrice ? formatPL(holding.dayChange) : '—'}
                  </td>
                  <td className={`hidden md:table-cell px-4 py-3 text-right text-[13px] ${
                    !hasValidPrice ? 'text-rh-light-muted dark:text-rh-muted' :
                    holding.dayChangePercent >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'
                  }`}>
                    {hasValidPrice ? formatPercent(holding.dayChangePercent) : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold value-transition ${
                    !hasValidPrice ? 'text-rh-light-muted dark:text-rh-muted' :
                    holding.profitLoss >= 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                  }`}>
                    {hasValidPrice ? formatPL(holding.profitLoss) : '—'}
                  </td>
                  <td className={`hidden sm:table-cell px-4 py-3 text-right font-bold value-transition ${
                    !hasValidPrice ? 'text-rh-light-muted dark:text-rh-muted' :
                    holding.profitLossPercent >= 0 ? 'text-rh-green profit-glow twinkle-glow' : 'text-rh-red loss-glow twinkle-glow'
                  }`}>
                    {hasValidPrice ? formatPercent(holding.profitLossPercent) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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
            className="absolute inset-0 modal-overlay bg-black/60"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCloseModal();
            }}
            aria-hidden="true"
          />
          <div
            className="relative modal-container bg-white dark:bg-rh-card rounded-[18px] p-6 w-full max-w-md [border:none] [outline:none] [box-shadow:0_4px_24px_rgba(0,0,0,0.08),0_12px_48px_rgba(0,0,0,0.06)]"
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
            className="absolute inset-0 modal-overlay bg-black/60"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCloseModal();
            }}
            aria-hidden="true"
          />
          <div
            className="relative modal-container bg-white dark:bg-rh-card rounded-[18px] p-6 w-full max-w-md [border:none] [outline:none] [box-shadow:0_4px_24px_rgba(0,0,0,0.08),0_12px_48px_rgba(0,0,0,0.06)]"
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

      {/* Cash & Margin Modal */}
      {showCashMarginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 modal-overlay bg-black/60" onClick={() => setShowCashMarginModal(false)} aria-hidden="true" />
          <div
            className="relative modal-container bg-white dark:bg-rh-card rounded-[18px] p-0 dark:p-6 w-full max-w-[440px] dark:max-w-sm [border:none] [outline:none] [box-shadow:0_4px_24px_rgba(0,0,0,0.08),0_12px_48px_rgba(0,0,0,0.06)]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-5 pb-0 dark:px-0 dark:pt-0 dark:pb-0 mb-1 dark:mb-4">
              <div>
                <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Cash & Margin</h3>
                <p className="text-xs text-rh-light-muted/60 mt-0.5 dark:hidden">Used to calculate your net equity and returns.</p>
              </div>
              <button type="button" onClick={() => setShowCashMarginModal(false)}
                className="text-rh-light-muted/50 dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white p-1 mt-0.5 transition-colors">
                <svg className="w-4 h-4 dark:w-5 dark:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveCashMargin} className="px-5 pb-5 dark:px-0 dark:pb-0 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-rh-light-text/70 dark:text-sm dark:font-normal dark:text-rh-muted mb-1.5 dark:mb-1">Cash Balance</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-muted/50 dark:text-rh-muted text-sm">$</span>
                  <input type="number" step="0.01" min="0" value={cashValue} onChange={e => setCashValue(e.target.value)}
                    className="w-full bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl dark:rounded-xl px-3 py-2.5 dark:py-2 pl-7 text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green/50 focus:ring-2 focus:ring-rh-green/10 dark:focus:border-rh-green dark:focus:ring-rh-green/20 transition-shadow"
                    placeholder="0.00" />
                </div>
                <p className="text-[11px] text-rh-light-muted/50 mt-1 dark:hidden">Uninvested cash in your brokerage account.</p>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-rh-light-text/70 dark:text-sm dark:font-normal dark:text-rh-muted mb-1.5 dark:mb-1">Margin Debt</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-muted/50 dark:text-rh-muted text-sm">$</span>
                  <input type="number" step="0.01" min="0" value={marginValue} onChange={e => setMarginValue(e.target.value)}
                    className="w-full bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl dark:rounded-xl px-3 py-2.5 dark:py-2 pl-7 text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green/50 focus:ring-2 focus:ring-rh-green/10 dark:focus:border-rh-green dark:focus:ring-rh-green/20 transition-shadow"
                    placeholder="0.00" />
                </div>
                <p className="text-[11px] text-rh-light-muted/50 mt-1 dark:hidden">Amount borrowed (used to compute net equity).</p>
                <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1 hidden dark:block">Enter your broker margin balance to calculate net equity</p>
              </div>
              {cashMarginError && <p className="text-rh-red text-sm">{cashMarginError}</p>}
              {/* Footer — light mode: divider + right-aligned buttons; dark mode: full-width save */}
              <div className="border-t border-black/[0.06] dark:border-transparent pt-4 dark:pt-0 flex justify-end gap-3 dark:block">
                <button type="button" onClick={() => setShowCashMarginModal(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-rh-light-muted hover:text-rh-light-text hover:bg-black/[0.04] transition-colors dark:hidden">
                  Cancel
                </button>
                <button type="submit" disabled={cashMarginLoading}
                  className="px-6 py-2.5 dark:w-full dark:px-4 dark:py-2.5 bg-rh-green hover:bg-green-600 hover:shadow-lg hover:shadow-rh-green/20 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-black font-semibold rounded-xl text-sm transition-all">
                  {cashMarginLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
