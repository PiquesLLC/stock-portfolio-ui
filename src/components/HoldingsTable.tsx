import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Reorder, motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '../utils/animations';
import { Holding } from '../types';
import { useToast } from '../context/ToastContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { deleteHolding, addHolding, updateSettings, getPortfolio, getEarningsSummary, getFastQuote } from '../api';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';
import { MiniSparkline } from './MiniSparkline';
import { StockLogo } from './StockLogo';
import { ConfirmModal } from './ConfirmModal';
import { PortfolioImport } from './PortfolioImport';
import { DraggableHoldingCard } from './DraggableHoldingCard';

// Earnings badge data per ticker
interface EarningsBadge {
  daysUntil: number;
  label: string; // "Today", "Tomorrow", "Wed", "Feb 18", etc.
}

// Module-level cache so we don't refetch on every re-render
const EARNINGS_BADGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let earningsBadgeCache: { data: Record<string, EarningsBadge>; timestamp: number } | null = null;

export interface HoldingsTableActions {
  openAdd: () => void;
  openCashMargin: () => void;
  openImport: () => void;
}

interface Props {
  holdings: Holding[];
  onUpdate: () => void;
  onTickerClick?: (ticker: string, holding: Holding, siblings?: string[]) => void;
  cashBalance?: number;
  marginDebt?: number;
  userId?: string;
  actionsRef?: React.MutableRefObject<HoldingsTableActions | null>;
  chartPeriod?: import('../types').PortfolioChartPeriod;
  portfolioId?: string;
  hideEmptyState?: boolean;
  // Optional controlled props — when provided, override the internal state.
  // Used by App.tsx so the search input + view-mode toggle can be rendered
  // in the chart's period strip on desktop (state lifted) while the
  // mobile fallback still uses internal state.
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  viewMode?: 'compact' | 'detailed';
  onViewModeChange?: (m: 'compact' | 'detailed') => void;
  // Slot for arbitrary JSX rendered in the toolbar's right side on desktop
  // (e.g. App.tsx passes the relocated Compare:SPY toggle here).
  headerSlot?: React.ReactNode;
}

type SortKey = 'ticker' | 'shares' | 'averageCost' | 'currentPrice' | 'currentValue' | 'dayChange' | 'dayChangePercent' | 'profitLoss' | 'profitLossPercent' | 'custom';
type SortDir = 'asc' | 'desc';

type DisplayMetric = 'lastPrice' | 'dayChangePct' | 'equity' | 'dayChange' | 'totalReturn' | 'totalReturnPct';

const DISPLAY_METRICS: { key: DisplayMetric; label: string }[] = [
  { key: 'lastPrice', label: 'Last price' },
  { key: 'dayChangePct', label: 'Percent change' },
  { key: 'equity', label: 'Your equity' },
  { key: 'dayChange', label: "Today's return" },
  { key: 'totalReturn', label: 'Total return' },
  { key: 'totalReturnPct', label: 'Total percent change' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'ticker', label: 'Name' },
  { key: 'currentValue', label: 'Market value' },
  { key: 'dayChange', label: "Today's change" },
  { key: 'dayChangePercent', label: "Today's %" },
  { key: 'profitLoss', label: 'Total P/L' },
  { key: 'profitLossPercent', label: 'Total %' },
  { key: 'currentPrice', label: 'Price' },
];

function getMetricDisplay(h: Holding, metric: DisplayMetric): { text: string; isPositive: boolean; isNeutral: boolean } {
  switch (metric) {
    case 'lastPrice': return { text: formatCurrency(h.currentPrice), isPositive: true, isNeutral: true };
    case 'dayChangePct': return { text: formatPercent(h.dayChangePercent), isPositive: h.dayChangePercent >= 0, isNeutral: false };
    case 'equity': return { text: formatPercent(h.dayChangePercent), isPositive: h.dayChangePercent >= 0, isNeutral: false }; // equity shown on top, so show day change below
    case 'dayChange': return { text: formatPL(h.dayChange), isPositive: h.dayChange >= 0, isNeutral: false };
    case 'totalReturn': return { text: formatPL(h.profitLoss), isPositive: h.profitLoss >= 0, isNeutral: false };
    case 'totalReturnPct': return { text: formatPercent(h.profitLossPercent), isPositive: h.profitLossPercent >= 0, isNeutral: false };
  }
}

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
  if (key === 'ticker' || key === 'custom') return true;
  if (key === 'shares' || key === 'averageCost') return !isNaN(holding[key]);
  // For price-dependent fields, check if price is available
  if (holding.priceUnavailable || holding.currentPrice <= 0) return false;
  return !isNaN(holding[key]);
}

// Get sortable value from holding
function getSortValue(holding: Holding, key: SortKey): string | number {
  if (key === 'ticker') return holding.ticker.toLowerCase();
  if (key === 'custom') return 0; // Custom sort handled separately
  return holding[key];
}

export function HoldingsTable({
  holdings,
  onUpdate,
  onTickerClick,
  cashBalance = 0,
  marginDebt = 0,
  userId,
  actionsRef,
  chartPeriod = '1D',
  portfolioId,
  hideEmptyState,
  searchQuery: searchQueryProp,
  onSearchQueryChange,
  viewMode: viewModeProp,
  onViewModeChange,
  headerSlot,
}: Props) {
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    // If user has a saved custom order, default to 'custom' so it persists across tab switches
    if (typeof window === 'undefined') return 'ticker';
    try {
      const stored = localStorage.getItem(`holdingsCustomOrder:${userId || 'default'}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return 'custom';
      }
    } catch {}
    return 'ticker';
  });
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCashMarginModal, setShowCashMarginModal] = useState(false);
  const [cashValue, setCashValue] = useState(cashBalance.toString());
  const [marginValue, setMarginValue] = useState(marginDebt.toString());
  const [cashMarginLoading, setCashMarginLoading] = useState(false);
  const [cashMarginError, setCashMarginError] = useState('');
  const [confirmDeleteTicker, setConfirmDeleteTicker] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  // Per-row kebab menu (Edit/Delete). Anchor stores the kebab button's screen
  // rect so the floating menu portals to the right position.
  const [rowMenu, setRowMenu] = useState<{ holding: Holding; anchor: DOMRect } | null>(null);
  useEffect(() => {
    if (!rowMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRowMenu(null); };
    // Close on scroll/resize — the captured anchor goes stale immediately
    // when the row moves underneath, leaving the menu detached in screen space.
    const onScroll = () => setRowMenu(null);
    const onResize = () => setRowMenu(null);
    // Outside-click via document mousedown so clicking a DIFFERENT row's kebab
    // immediately re-opens the menu (a backdrop would swallow that first click).
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-row-menu]') || t.closest('[data-row-kebab]')) return;
      setRowMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [rowMenu]);
  const [viewModeInternal, setViewModeInternal] = useLocalStorage<'compact' | 'detailed'>('holdingsView', 'compact', {
    serialize: v => v,
    deserialize: v => (v === 'detailed' ? 'detailed' : 'compact'),
  });
  // Controlled-or-uncontrolled hybrid: external prop wins when provided.
  const viewMode = viewModeProp ?? viewModeInternal;
  const setViewMode = (m: 'compact' | 'detailed') => {
    if (onViewModeChange) onViewModeChange(m);
    else setViewModeInternal(m);
  };
  const [displayMetric, setDisplayMetric] = useLocalStorage<DisplayMetric>('holdingsDisplayMetric', 'dayChangePct', {
    serialize: v => v,
    deserialize: v => v as DisplayMetric,
  });
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  // No UI surface for search any more (input was removed on both mobile +
  // desktop). The filter logic still keys off `searchQuery` so external
  // callers can re-introduce a controlled input via the prop without code
  // changes here. Reference onSearchQueryChange to silence unused-prop lint.
  void onSearchQueryChange;
  const searchQuery = searchQueryProp ?? '';
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [formData, setFormData] = useState({ ticker: '', shares: '', averageCost: '', fundingSource: 'cash' as 'cash' | 'margin', logAsTrade: true });
  const [addCurrentPrice, setAddCurrentPrice] = useState<number | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  // Custom order for drag-to-reorder (scoped by userId)
  const customOrderKey = `holdingsCustomOrder:${userId || 'default'}`;
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(customOrderKey);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Extract held tickers for autocomplete boost
  const heldTickers = useMemo(() => holdings.map(h => h.ticker), [holdings]);

  // Ref for the Add Stock button to return focus after modal closes
  const addStockButtonRef = useRef<HTMLButtonElement>(null);

  // Sync cash/margin values when props change (round to 2 decimals to avoid floating point noise)
  useEffect(() => { setCashValue(parseFloat(cashBalance.toFixed(2)).toString()); }, [cashBalance]);
  useEffect(() => { setMarginValue(parseFloat(marginDebt.toFixed(2)).toString()); }, [marginDebt]);

  // Upcoming earnings badges (within 7 days)
  const [earningsBadges, setEarningsBadges] = useState<Record<string, EarningsBadge>>({});

  useEffect(() => {
    if (holdings.length === 0) return;

    // Use cache if fresh
    if (earningsBadgeCache && Date.now() - earningsBadgeCache.timestamp < EARNINGS_BADGE_CACHE_TTL) {
      setEarningsBadges(earningsBadgeCache.data);
      return;
    }

    let cancelled = false;

    async function fetchEarningsBadges() {
      try {
        const { results } = await getEarningsSummary();
        if (cancelled) return;

        const badges: Record<string, EarningsBadge> = {};
        for (const item of results) {
          if (item.daysUntil <= 7) {
            const dateMs = new Date(item.reportDate + 'T00:00:00').getTime();
            let label: string;
            if (item.daysUntil === 0) label = 'Today';
            else if (item.daysUntil === 1) label = 'Tomorrow';
            else label = new Date(dateMs).toLocaleDateString('en-US', { weekday: 'short' });
            // Only keep first per ticker (they're sorted by date)
            if (!badges[item.ticker]) {
              badges[item.ticker] = { daysUntil: item.daysUntil, label };
            }
          }
        }

        earningsBadgeCache = { data: badges, timestamp: Date.now() };
        setEarningsBadges(badges);
      } catch (e) {
        console.error('Earnings badge fetch failed:', e);
      }
    }

    fetchEarningsBadges();
    return () => { cancelled = true; };
  }, [holdings]);

  // Check if any modal is open
  const isModalOpen = showAddModal || editingHolding !== null || showCashMarginModal;

  const handleOpenCashMargin = useCallback(() => {
    setCashValue(parseFloat(cashBalance.toFixed(2)).toString());
    setMarginValue(parseFloat(marginDebt.toFixed(2)).toString());
    setCashMarginError('');
    setShowCashMarginModal(true);
  }, [cashBalance, marginDebt]);

  const handleSaveCashMargin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashMarginError('');
    const cash = cashValue.trim() === '' ? 0 : parseFloat(cashValue);
    const margin = marginValue.trim() === '' ? 0 : parseFloat(marginValue);
    if (isNaN(cash) || cash < 0) { setCashMarginError('Cash balance must be non-negative'); return; }
    if (isNaN(margin) || margin < 0) { setCashMarginError('Margin debt must be non-negative'); return; }
    setCashMarginLoading(true);
    try {
      await updateSettings({ cashBalance: cash, marginDebt: margin });
      onUpdate();
      setShowCashMarginModal(false);
    } catch (err) {
      setCashMarginError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setCashMarginLoading(false);
    }
  };

  const handleDelete = async (ticker: string) => {
    setConfirmDeleteTicker(ticker);
  };

  const executeDelete = async () => {
    const ticker = confirmDeleteTicker;
    if (!ticker) return;
    setConfirmDeleteTicker(null);
    setDeleting(ticker);
    try {
      await deleteHolding(ticker);
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete', 'error');
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

  // Total portfolio value for weight % calculation
  const totalPortfolioValue = useMemo(() =>
    holdings.reduce((sum, h) => sum + (h.priceUnavailable ? 0 : h.currentValue), 0),
    [holdings],
  );

  // Memoized sorted holdings
  const sortedHoldings = useMemo(() => {
    if (sortKey === 'custom' && customOrder.length > 0) {
      return [...holdings].sort((a, b) => {
        const aIdx = customOrder.indexOf(a.id);
        const bIdx = customOrder.indexOf(b.id);
        // Items not in custom order go to end, sorted alphabetically
        if (aIdx === -1 && bIdx === -1) return a.ticker.localeCompare(b.ticker);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });
    }
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
  }, [holdings, sortKey, sortDir, customOrder]);

  // Wrap onTickerClick to inject the current sorted ticker list as `siblings`,
  // enabling swipe-between-stocks navigation in StockDetailView.
  const handleTickerClick = useCallback((ticker: string, holding: Holding) => {
    if (!onTickerClick) return;
    const siblings = sortedHoldings.map(h => h.ticker);
    onTickerClick(ticker, holding, siblings);
  }, [onTickerClick, sortedHoldings]);

  const normalizedSearch = searchQuery.trim().toUpperCase();
  const matchingHoldingIds = useMemo(() => {
    if (!normalizedSearch) return new Set<string>();
    return new Set(
      sortedHoldings
        .filter((holding) => holding.ticker.toUpperCase().includes(normalizedSearch))
        .map((holding) => holding.id),
    );
  }, [sortedHoldings, normalizedSearch]);
  const matchCount = matchingHoldingIds.size;
  const hasActiveFilter = normalizedSearch.length > 0;

  // Ordered IDs for Reorder.Group
  const orderedIds = useMemo(() => sortedHoldings.map(h => h.id), [sortedHoldings]);

  // Reorder callback — sets custom order and switches sort to 'custom'
  const handleReorder = useCallback((newOrder: string[]) => {
    setCustomOrder(newOrder);
    setSortKey('custom');
    if (typeof window !== 'undefined') {
      localStorage.setItem(customOrderKey, JSON.stringify(newOrder));
    }
  }, [customOrderKey]);

  // Reconcile custom order when holdings change (add/remove)
  useEffect(() => {
    // Skip when there are no holdings — there's nothing to reconcile, and
    // reconciling against an empty list would wipe a previously-saved custom
    // order. (App.tsx now mounts a hidden HoldingsTable on empty portfolios to
    // host the add/cash/import modals, so this effect runs on empty too.)
    if (customOrder.length === 0 || holdings.length === 0) return;
    const holdingIds = new Set(holdings.map(h => h.id));
    const filtered = customOrder.filter(id => holdingIds.has(id));
    const newIds = holdings.filter(h => !customOrder.includes(h.id)).map(h => h.id);
    if (filtered.length !== customOrder.length || newIds.length > 0) {
      const reconciled = [...filtered, ...newIds];
      setCustomOrder(reconciled);
      if (typeof window !== 'undefined') {
        localStorage.setItem(customOrderKey, JSON.stringify(reconciled));
      }
    }
  }, [holdings, customOrder, customOrderKey]);

  // Get sort indicator for a column
  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1 opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  // Get header class for a column
  const getHeaderClass = (key: SortKey, align: 'left' | 'right' = 'left') => {
    const base = 'px-3 py-3 font-medium cursor-pointer hover:text-rh-light-text dark:hover:text-white hover:bg-gray-100 dark:hover:bg-rh-dark/30 transition-colors select-none whitespace-nowrap';
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
      logAsTrade: false, // Edits are data corrections by default
    });
    setModalError('');
  };

  // Open add modal
  const handleOpenAdd = useCallback(() => {
    setShowAddModal(true);
    setFormData({ ticker: '', shares: '', averageCost: '', fundingSource: 'cash', logAsTrade: true });
    setAddCurrentPrice(null);
    setModalError('');
  }, []);

  // Expose actions to parent via ref
  useEffect(() => {
    if (actionsRef) {
      actionsRef.current = { openAdd: handleOpenAdd, openCashMargin: handleOpenCashMargin, openImport: () => setShowImport(true) };
    }
  }, [handleOpenAdd, handleOpenCashMargin, actionsRef]);

  // Close modals
  const handleCloseModal = useCallback(() => {
    setEditingHolding(null);
    setShowAddModal(false);
    setModalError('');
    setFormData({ ticker: '', shares: '', averageCost: '', fundingSource: 'cash', logAsTrade: true });
    setAddCurrentPrice(null);
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

      await addHolding({ ticker, shares, averageCost, ...(!formData.logAsTrade ? { skipActivity: true } : {}), portfolioId });

      // If buying on margin, adjust margin debt to keep net equity unchanged.
      // We fetch the fresh portfolio to get the actual new totalAssets at MARKET prices,
      // then set marginDebt = newTotalAssets - oldNetEquity. This prevents the bug where
      // cost basis != market value caused phantom portfolio value changes.
      if (formData.fundingSource === 'margin' && !isEditing) {
        const freshPortfolio = await getPortfolio(undefined, portfolioId);
        const newMarginDebt = freshPortfolio.totalAssets - oldNetEquity;
        if (newMarginDebt > 0) {
          await updateSettings({ marginDebt: newMarginDebt });
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
        <label className="block text-sm font-medium text-rh-light-text dark:text-white mb-1">
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
            onChange={(value) => {
              setFormData({ ...formData, ticker: value });
              if (!value) {
                setAddCurrentPrice(null);
                setFormData(prev => ({ ...prev, ticker: value, averageCost: '' }));
              }
            }}
            onSelect={async (result) => {
              setFormData(prev => ({ ...prev, ticker: result.symbol }));
              setAddCurrentPrice(null);
              try {
                const quote = await getFastQuote(result.symbol);
                if (quote?.currentPrice) {
                  setAddCurrentPrice(quote.currentPrice);
                  setFormData(prev => ({
                    ...prev,
                    ticker: result.symbol,
                    averageCost: prev.averageCost.trim() ? prev.averageCost : quote.currentPrice.toFixed(2),
                  }));
                }
              } catch {
                // Leave manual cost entry available if quote fetch fails.
              }
            }}
            placeholder="e.g. AAPL"
            autoFocus
            heldTickers={heldTickers}
          />
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-rh-light-text dark:text-white mb-1">Shares</label>
        <input
          type="number"
          inputMode="decimal"
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
        <label className="block text-sm font-medium text-rh-light-text dark:text-white mb-1">
          Average Cost ($)
          {!isEditing && addCurrentPrice !== null && (
            <span className="ml-1.5 text-rh-green font-normal">
              Current: ${addCurrentPrice.toFixed(2)}
            </span>
          )}
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={formData.averageCost}
          onChange={(e) => setFormData({ ...formData, averageCost: e.target.value })}
          placeholder={!isEditing && addCurrentPrice !== null ? `$${addCurrentPrice.toFixed(2)}` : 'e.g. 150.00'}
          className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-white/[0.08]
            bg-rh-light-bg dark:bg-white/[0.04] text-rh-light-text dark:text-rh-text
            focus:outline-none focus:ring-2 focus:ring-rh-green/20 focus:border-rh-green/40"
        />
      </div>
      {!isEditing && (
        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-white mb-2">Funding Source</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, fundingSource: 'cash' })}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                formData.fundingSource === 'cash'
                  ? 'bg-rh-green/10 text-rh-green border border-rh-green/40'
                  : 'bg-rh-light-bg dark:bg-white/[0.04] text-rh-light-text dark:text-white border border-rh-light-border dark:border-white/[0.08] hover:border-rh-green/30'
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
                  : 'bg-rh-light-bg dark:bg-white/[0.04] text-rh-light-text dark:text-white border border-rh-light-border dark:border-white/[0.08] hover:border-yellow-500/30'
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
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={formData.logAsTrade}
          onChange={(e) => setFormData({ ...formData, logAsTrade: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 dark:border-white/20 text-rh-green focus:ring-rh-green/30 bg-transparent"
        />
        <span className="text-sm text-rh-light-text dark:text-white">
          Log as trade
        </span>
        <span className="text-[10px] text-rh-light-text dark:text-white">
          {formData.logAsTrade ? 'Shows in Latest Moves' : 'Data correction only'}
        </span>
      </label>
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
            text-rh-light-text dark:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] dark:hover:text-rh-text transition-colors"
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
      <>
        {!hideEmptyState && (
          <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Holdings</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenCashMargin}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-rh-light-border dark:border-rh-border
                    text-rh-light-text dark:text-rh-text hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors text-xs sm:text-sm"
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
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-rh-green text-black font-semibold
                    hover:bg-green-600 transition-colors text-xs sm:text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Stock
                </button>
              </div>
            </div>
            <div className="text-center py-8 space-y-4">
              <p className="text-rh-light-text dark:text-white">No holdings yet. Add your first stock above.</p>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200/40 dark:border-white/[0.08] text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-white hover:border-rh-green/30 transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import from CSV
              </button>
            </div>
          </div>
        )}

        {showImport && (
          <PortfolioImport
            onClose={() => setShowImport(false)}
            onImportComplete={() => { setShowImport(false); onUpdate(); }}
            onboarding
            onManualEntry={() => { setShowImport(false); handleOpenAdd(); }}
            portfolioId={portfolioId}
          />
        )}

        {showAddModal && createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title-add"
          >
            <div
              className="absolute inset-0 modal-overlay bg-black/60 backdrop-blur-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCloseModal();
              }}
              aria-hidden="true"
            />
            <div
              className="relative modal-container bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[18px] p-6 w-full max-w-md border border-gray-200/60 dark:border-white/[0.1] [box-shadow:0_8px_32px_rgba(0,0,0,0.12)] dark:[box-shadow:0_8px_32px_rgba(0,0,0,0.5)]"
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
                  className="text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-white p-1"
                  aria-label="Close modal"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {renderModalContent(false)}
            </div>
          </div>,
          document.body
        )}

        {showCashMarginModal && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 modal-overlay bg-black/60 backdrop-blur-sm" onClick={() => setShowCashMarginModal(false)} aria-hidden="true" />
            <div
              className="relative modal-container bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[18px] p-0 dark:p-6 w-full max-w-[440px] dark:max-w-sm border border-gray-200/60 dark:border-white/[0.1] [box-shadow:0_8px_32px_rgba(0,0,0,0.12)] dark:[box-shadow:0_8px_32px_rgba(0,0,0,0.5)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between px-5 pt-5 pb-0 dark:px-0 dark:pt-0 dark:pb-0 mb-1 dark:mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Cash & Margin</h3>
                  <p className="text-xs text-rh-light-text mt-0.5 dark:hidden">Used to calculate your net equity and returns.</p>
                </div>
                <button type="button" onClick={() => setShowCashMarginModal(false)}
                  className="text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-white p-1 mt-0.5 transition-colors">
                  <svg className="w-4 h-4 dark:w-5 dark:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleSaveCashMargin} className="px-5 pb-5 dark:px-0 dark:pb-0 space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-rh-light-text/70 dark:text-sm dark:font-normal dark:text-white mb-1.5 dark:mb-1">Cash Balance</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-text dark:text-white text-sm">$</span>
                    <input type="number" inputMode="decimal" step="0.01" min="0" value={cashValue} onChange={e => setCashValue(e.target.value)}
                      className="w-full bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl px-3 py-2.5 dark:py-2 pl-7 text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green/50 focus:ring-2 focus:ring-rh-green/10 dark:focus:border-rh-green dark:focus:ring-rh-green/20 transition-shadow"
                      placeholder="0.00" />
                  </div>
                  <p className="text-[11px] text-rh-light-text mt-1 dark:hidden">Uninvested cash in your brokerage account.</p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => { const amt = prompt('Deposit amount:'); if (amt && parseFloat(amt) > 0) setCashValue(v => (parseFloat(v || '0') + parseFloat(amt)).toFixed(2)); }}
                      className="text-[10px] px-2 py-1 rounded-lg bg-rh-green/10 text-rh-green font-medium hover:bg-rh-green/20 transition-colors">
                      + Deposit
                    </button>
                    <button type="button" onClick={() => { const amt = prompt('Withdraw amount:'); if (amt && parseFloat(amt) > 0) setCashValue(v => Math.max(0, parseFloat(v || '0') - parseFloat(amt)).toFixed(2)); }}
                      className="text-[10px] px-2 py-1 rounded-lg bg-rh-red/10 text-rh-red font-medium hover:bg-rh-red/20 transition-colors">
                      - Withdraw
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-rh-light-text/70 dark:text-sm dark:font-normal dark:text-white mb-1.5 dark:mb-1">Margin Debt</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-text dark:text-white text-sm">$</span>
                    <input type="number" inputMode="decimal" step="0.01" min="0" value={marginValue} onChange={e => setMarginValue(e.target.value)}
                      className="w-full bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl px-3 py-2.5 dark:py-2 pl-7 text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green/50 focus:ring-2 focus:ring-rh-green/10 dark:focus:border-rh-green dark:focus:ring-rh-green/20 transition-shadow"
                      placeholder="0.00" />
                  </div>
                  <p className="text-[11px] text-rh-light-text mt-1 dark:hidden">Amount borrowed (used to compute net equity).</p>
                  <p className="text-xs text-rh-light-text dark:text-white mt-1 hidden dark:block">Enter your broker margin balance to calculate net equity</p>
                </div>
                {cashMarginError && <p className="text-rh-red text-sm">{cashMarginError}</p>}
                <div className="border-t border-black/[0.06] dark:border-transparent pt-4 dark:pt-0 flex justify-end gap-3 dark:block">
                  <button type="button" onClick={() => setShowCashMarginModal(false)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-rh-light-text hover:text-rh-light-text hover:bg-black/[0.04] transition-colors dark:hidden">
                    Cancel
                  </button>
                  <button type="submit" disabled={cashMarginLoading}
                    className="px-6 py-2.5 dark:w-full dark:px-4 dark:py-2.5 bg-rh-green hover:bg-green-600 hover:shadow-lg hover:shadow-rh-green/20 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-black font-semibold rounded-xl text-sm transition-all">
                    {cashMarginLoading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden">
      <div className="px-3 sm:px-4 pb-2 sm:pb-4 pt-0 flex items-center justify-between gap-3 border-b border-gray-200/40 dark:border-white/[0.06] sm:border-b-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {hasActiveFilter && (
            <span className="hidden sm:inline text-[11px] text-rh-light-text dark:text-white whitespace-nowrap">
              {matchCount} match{matchCount === 1 ? '' : 'es'}
            </span>
          )}
          {/* Desktop: Simple/Detailed toggle */}
          {/* Tablet (md to <lg): inline Simple/Detailed toggle. On lg+ it's
              hidden here and rendered up in the chart's period strip via the
              chartToolbar prop wired from App.tsx. */}
          <div className="hidden md:flex lg:hidden rounded-lg overflow-hidden border border-gray-200/40 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === 'compact' ? 'bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-white/60 dark:hover:text-white'}`}
            >Simple</button>
            <button
              type="button"
              onClick={() => setViewMode('detailed')}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === 'detailed' ? 'bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-white/60 dark:hover:text-white'}`}
            >Detailed</button>
          </div>
          {/* Mobile: sort icon + gear icon */}
          <div className="flex items-center gap-1 md:hidden">
            {/* Sort picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowSortMenu(!showSortMenu); setShowDisplayMenu(false); }}
                className="p-1 text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
                title="Sort holdings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9M3 12h5m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              </button>
              {showSortMenu && (
                <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-rh-light-card dark:bg-rh-card border border-rh-light-border/40 dark:border-rh-border/40 rounded-xl shadow-xl py-1 animate-fade-in-up">
                  <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-rh-light-text/70 dark:text-white/80">Sort by</p>
                  {customOrder.length > 0 && (
                    <button
                      type="button"
                      className="flex items-center justify-between w-full px-3 py-2 text-[13px] text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
                      onClick={() => {
                        setSortKey('custom');
                        setShowSortMenu(false);
                      }}
                    >
                      <span>Custom</span>
                      {sortKey === 'custom' && (
                        <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )}
                  {SORT_OPTIONS.map((s) => {
                    const isActive = sortKey === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        className="flex items-center justify-between w-full px-3 py-2 text-[13px] text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
                        onClick={() => {
                          if (isActive) {
                            setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                          } else {
                            setSortKey(s.key);
                            setSortDir(s.key === 'ticker' ? 'asc' : 'desc');
                            // Clear custom order when selecting a standard sort
                            setCustomOrder([]);
                            if (typeof window !== 'undefined') {
                              localStorage.removeItem(customOrderKey);
                            }
                          }
                          setShowSortMenu(false);
                        }}
                      >
                        <span>{s.label}</span>
                        {isActive && (
                          <span className="text-rh-green text-xs font-medium">{sortDir === 'desc' ? '▼' : '▲'}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Display data picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowDisplayMenu(!showDisplayMenu); setShowSortMenu(false); }}
                className="p-1 text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
                title="Display data"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {showDisplayMenu && (
                <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-rh-light-card dark:bg-rh-card border border-rh-light-border/40 dark:border-rh-border/40 rounded-xl shadow-xl py-1 animate-fade-in-up">
                  <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-rh-light-text/70 dark:text-white/80">View density</p>
                  {(['compact', 'detailed'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="flex items-center justify-between w-full px-3 py-2 text-[13px] text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
                      onClick={() => {
                        setViewMode(mode);
                        setShowDisplayMenu(false);
                      }}
                    >
                      <span>{mode === 'compact' ? 'Simple' : 'Detailed'}</span>
                      {viewMode === mode && (
                        <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                  <div className="my-1 border-t border-gray-100 dark:border-white/[0.06]" />
                  <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-rh-light-text/70 dark:text-white/80">Display data</p>
                  {DISPLAY_METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className="flex items-center justify-between w-full px-3 py-2 text-[13px] text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
                      onClick={() => {
                        setDisplayMetric(m.key);
                        setShowDisplayMenu(false);
                      }}
                    >
                      <span>{m.label}</span>
                      {displayMetric === m.key && (
                        <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile: tucked-away icon buttons. Right side of the HOLDINGS toolbar,
              next to the filter / sort / gear cluster. Desktop renders the
              full-text versions elsewhere (App.tsx top-right of chart for
              actionsRef callers, or the lg:flex block below for fallback). */}
          <div className="flex items-center gap-1 lg:hidden">
            <button
              type="button"
              onClick={handleOpenCashMargin}
              title="Cash & Margin"
              aria-label="Cash & Margin"
              className="p-1.5 rounded-lg text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleOpenAdd}
              title="Add Stock"
              aria-label="Add Stock"
              className="p-1.5 rounded-lg bg-rh-green text-black hover:bg-green-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          {/* Desktop fallback: full-text buttons for callers that don't hoist
              actions (e.g. embedded HoldingsTable usage). When App.tsx provides
              actionsRef, it renders its own desktop buttons at the chart's
              top-right and this branch stays hidden. */}
          {!actionsRef && (
            <div className="hidden lg:flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenCashMargin}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rh-light-border/40 dark:border-rh-border/30
                  text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-rh-text hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-all duration-150 text-xs hover:scale-[1.02]"
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
          {/* Desktop-only slot rendered to the right of the toolbar (e.g.
              Compare:SPY toggle injected by App.tsx). On lg+ the filter
              input lives up in the chart's period strip via chartToolbar. */}
          {headerSlot && <div className="hidden lg:flex items-center gap-2">{headerSlot}</div>}
        </div>
      </div>
      {/* ── Mobile Card List ──────────────────────────────────────── */}
      <div className="md:hidden">
        {hasActiveFilter && matchCount === 0 && (
          <div className="py-2 text-center text-[11px] text-rh-light-text dark:text-white">
            No tickers match "{searchQuery.trim()}" yet.
          </div>
        )}
        {!hasActiveFilter ? (
          <Reorder.Group axis="y" values={orderedIds} onReorder={handleReorder} as="div">
            {sortedHoldings.map((holding, idx) => (
              <DraggableHoldingCard
                key={holding.id}
                holding={holding}
                idx={idx}
                displayMetric={displayMetric}
                chartPeriod={chartPeriod}
                earningsBadge={earningsBadges[holding.ticker]}
                onTickerClick={handleTickerClick}
                onDelete={handleDelete}
                getMetricDisplay={getMetricDisplay}
                formatCurrency={formatCurrency}
                dragActiveId={dragActiveId}
                onDragActiveChange={setDragActiveId}
              />
            ))}
          </Reorder.Group>
        ) : (
          <Reorder.Group axis="y" values={orderedIds} onReorder={() => {}} as="div">
            {sortedHoldings.map((holding, idx) => (
              <DraggableHoldingCard
                key={holding.id}
                holding={holding}
                idx={idx}
                displayMetric={displayMetric}
                chartPeriod={chartPeriod}
                earningsBadge={earningsBadges[holding.ticker]}
                onTickerClick={handleTickerClick}
                onDelete={handleDelete}
                getMetricDisplay={getMetricDisplay}
                formatCurrency={formatCurrency}
                dragActiveId={null}
                onDragActiveChange={() => {}}
                isSearchMatch={matchingHoldingIds.has(holding.id)}
                isSearchDimmed={!matchingHoldingIds.has(holding.id)}
              />
            ))}
          </Reorder.Group>
        )}
      </div>

      {/* ── Desktop Table ─────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto no-scrollbar">
        {hasActiveFilter && matchCount === 0 && (
          <div className="py-4 text-center text-[11px] text-rh-light-text dark:text-white">
            No tickers match "{searchQuery.trim()}" yet. Your holdings remain visible for context.
          </div>
        )}
        <table className={`w-full ${viewMode === 'compact' ? 'table-fixed' : ''}`}>
          <thead className="sticky top-0 z-10 backdrop-blur-sm bg-rh-light-bg/90 dark:bg-rh-black/90">
            <tr className="border-t border-b border-rh-light-border/25 dark:border-rh-border/25 text-left text-xs uppercase tracking-wider text-rh-light-text/70 dark:text-white/80">
              <th className={`${viewMode !== 'compact' ? 'w-0' : 'w-[12%]'} ${getHeaderClass('ticker')}`} onClick={() => handleSort('ticker')} title="Sort by ticker symbol">
                Ticker{getSortIndicator('ticker')}
              </th>
              <th className={`${viewMode !== 'compact' ? 'w-0' : 'w-[11%]'} px-2 py-3 font-medium text-center cursor-pointer hover:text-rh-light-text dark:hover:text-white hover:bg-gray-100 dark:hover:bg-rh-dark/30 transition-colors select-none whitespace-nowrap ${sortKey === 'dayChangePercent' ? 'text-rh-light-text dark:text-white' : ''}`} style={viewMode === 'compact' ? { paddingLeft: '52px' } : undefined} onClick={() => handleSort('dayChangePercent')} title="Sort by today's percentage change">
                Today{sortKey === 'dayChangePercent' ? <span className="ml-1 opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span> : null}
              </th>
              <th className={`${viewMode === 'compact' ? 'hidden' : 'hidden md:table-cell'} ${getHeaderClass('averageCost', 'right')}`} onClick={() => handleSort('averageCost')} title="Sort by average cost basis">
                {getSortIndicator('averageCost')}Avg Cost
              </th>
              <th className={`${viewMode === 'compact' ? 'hidden' : 'hidden lg:table-cell'} ${getHeaderClass('shares', 'right')}`} onClick={() => handleSort('shares')} title="Sort by number of shares">
                {getSortIndicator('shares')}Shares
              </th>
              <th className={`${viewMode === 'compact' ? 'w-[19%]' : ''} ${getHeaderClass('currentPrice', 'right')}`} onClick={() => handleSort('currentPrice')} title="Sort by current price">
                {getSortIndicator('currentPrice')}Price
              </th>
              <th className={`hidden sm:table-cell ${viewMode === 'compact' ? 'w-[20%]' : ''} ${getHeaderClass('currentValue', 'right')}`} onClick={() => handleSort('currentValue')} title="Sort by market value">
                {getSortIndicator('currentValue')}Mkt Val
              </th>
              <th className={`${viewMode === 'compact' ? 'hidden' : 'hidden xl:table-cell'} ${getHeaderClass('currentValue', 'right')}`} onClick={() => handleSort('currentValue')} title="Sort by portfolio weight (same as market value)">
                Weight
              </th>
              <th className={`${viewMode === 'compact' ? 'w-[20%]' : 'hidden lg:table-cell'} ${getHeaderClass('dayChange', 'right')}`} onClick={() => handleSort('dayChange')} title="Sort by today's profit/loss">
                {getSortIndicator('dayChange')}Day P/L
              </th>
              <th
                className={`${viewMode === 'compact' ? 'w-[18%]' : 'hidden md:table-cell'} ${getHeaderClass('dayChangePercent', 'right')}`}
                style={viewMode === 'compact' ? { paddingRight: '2.5rem' } : undefined}
                onClick={() => handleSort('dayChangePercent')}
                title="Sort by today's percentage change"
              >
                {getSortIndicator('dayChangePercent')}Day %
              </th>
              <th className={`${viewMode === 'compact' ? 'hidden' : ''} ${getHeaderClass('profitLoss', 'right')}`} onClick={() => handleSort('profitLoss')} title="Sort by total profit/loss" style={{ paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
                {getSortIndicator('profitLoss')}<span className="hidden sm:inline">Total </span>P/L
              </th>
              <th
                className={`${viewMode === 'compact' ? 'hidden' : 'hidden sm:table-cell'} ${getHeaderClass('profitLossPercent', 'right')}`}
                style={{ paddingRight: '2.5rem' }}
                onClick={() => handleSort('profitLossPercent')}
                title="Sort by total percentage return"
              >
                {getSortIndicator('profitLossPercent')}Total %
              </th>
              {/* Action column collapsed to zero width — Edit/Delete buttons
                  are absolutely positioned on the <td> below so the rightmost
                  data column (Total % / Day %) can extend to the chart strip's
                  right edge (Compare: SPY alignment). */}
              <th className="w-0 p-0"></th>
            </tr>
          </thead>
          <motion.tbody
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {sortedHoldings.map((holding, _sIdx) => {
              const isUnavailable = holding.priceUnavailable;
              const isRepricing = holding.isRepricing || holding.priceIsStale;
              const hasValidPrice = !isUnavailable && holding.currentPrice > 0;
              const isSearchMatch = !hasActiveFilter || matchingHoldingIds.has(holding.id);

              return (
                <React.Fragment key={holding.id}>
                <motion.tr
                  variants={staggerItem}
                  data-search-match={isSearchMatch ? 'true' : 'false'}
                  className={`relative border-b border-rh-light-border/20 dark:border-rh-border/20 holding-row group hover:bg-gray-50/80 dark:hover:bg-white/[0.03] hover:backdrop-blur-[5px] transition-all duration-300 ${isUnavailable ? 'opacity-60' : ''} ${onTickerClick ? 'cursor-pointer' : ''} ${hasActiveFilter ? (isSearchMatch ? 'bg-rh-green/10 ring-1 ring-inset ring-rh-green/20' : 'opacity-55') : ''}`}
                  onClick={onTickerClick && !isUnavailable ? () => handleTickerClick(holding.ticker, holding) : undefined}
                >
                  <td className="px-4 py-2.5 font-semibold text-rh-light-text dark:text-rh-text">
                    <div className="flex items-center gap-2">
                      <StockLogo ticker={holding.ticker} size="sm" />
                      <span
                        className={onTickerClick ? 'cursor-pointer hover:underline hover:text-rh-green transition-colors' : ''}
                        onClick={onTickerClick ? () => handleTickerClick(holding.ticker, holding) : undefined}
                      >
                        {holding.ticker}
                      </span>
                      {isUnavailable && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded shrink-0" title="No price data available">
                          no data
                        </span>
                      )}
                      {earningsBadges[holding.ticker] && (
                        <span
                          className="text-[10px] bg-amber-500/15 text-amber-500 dark:text-amber-400 px-1.5 py-0.5 rounded-full shrink-0 font-medium"
                          title={`Earnings ${earningsBadges[holding.ticker].daysUntil === 0 ? 'today' : `in ${earningsBadges[holding.ticker].daysUntil} day${earningsBadges[holding.ticker].daysUntil === 1 ? '' : 's'}`}`}
                        >
                          {earningsBadges[holding.ticker].daysUntil === 0
                            ? 'ER Today'
                            : `ER ${earningsBadges[holding.ticker].label}`}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center" style={viewMode === 'compact' ? { paddingLeft: '52px' } : undefined}>
                    {hasValidPrice && (
                      <MiniSparkline ticker={holding.ticker} positive={holding.dayChange >= 0} period={chartPeriod} />
                    )}
                  </td>
                  <td className={`${viewMode === 'compact' ? 'hidden' : 'hidden md:table-cell'} px-3 py-3 text-right text-rh-light-text dark:text-rh-text group-hover:text-rh-light-text dark:group-hover:text-white transition-colors duration-200`}>{formatCurrency(holding.averageCost)}</td>
                  <td className={`${viewMode === 'compact' ? 'hidden' : 'hidden lg:table-cell'} px-3 py-3 text-right text-rh-light-text dark:text-rh-text group-hover:text-rh-light-text dark:group-hover:text-white transition-colors duration-200`}>{holding.shares.toLocaleString()}</td>
                  <td className={`px-3 py-3 text-right transition-colors duration-200 ${isRepricing ? 'text-yellow-400' : 'text-rh-light-text dark:text-rh-text dark:group-hover:text-white'}`}>
                    {hasValidPrice ? formatCurrency(holding.currentPrice) : '—'}
                  </td>
                  <td className={`hidden sm:table-cell px-3 py-3 text-right font-medium text-rh-light-text dark:text-rh-text dark:group-hover:text-white transition-colors duration-200`}>
                    {hasValidPrice ? formatCurrency(holding.currentValue) : '—'}
                  </td>
                  <td className={`${viewMode === 'compact' ? 'hidden' : 'hidden xl:table-cell'} px-3 py-3 text-right text-rh-light-text dark:text-rh-text group-hover:text-rh-light-text dark:group-hover:text-white transition-colors duration-200`}>
                    {hasValidPrice && totalPortfolioValue > 0
                      ? `${(holding.currentValue / totalPortfolioValue * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className={`${viewMode === 'compact' ? '' : 'hidden lg:table-cell'} px-3 py-3 text-right ${
                    !hasValidPrice ? 'text-rh-light-text dark:text-white' :
                    holding.dayChange >= 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                  }`}>
                    {hasValidPrice ? formatPL(holding.dayChange) : '—'}
                  </td>
                  <td className={`${viewMode === 'compact' ? 'pl-3 pr-10' : 'hidden md:table-cell px-3'} py-3 text-right ${
                    !hasValidPrice ? 'text-rh-light-text dark:text-white' :
                    holding.dayChangePercent >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {hasValidPrice ? formatPercent(holding.dayChangePercent) : '—'}
                  </td>
                  <td className={`${viewMode === 'compact' ? 'hidden' : ''} px-2 sm:px-3 py-3 text-right font-semibold value-transition ${
                    !hasValidPrice ? 'text-rh-light-text dark:text-white' :
                    holding.profitLoss >= 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                  }`}>
                    {hasValidPrice ? formatPL(holding.profitLoss) : '—'}
                  </td>
                  <td className={`${viewMode === 'compact' ? 'hidden' : 'hidden sm:table-cell'} pl-2 sm:pl-3 pr-10 py-3 text-right font-bold value-transition ${
                    !hasValidPrice ? 'text-rh-light-text dark:text-white' :
                    holding.profitLossPercent >= 0 ? 'text-rh-green profit-glow twinkle-glow' : 'text-rh-red loss-glow twinkle-glow'
                  }`}>
                    {hasValidPrice ? formatPercent(holding.profitLossPercent) : '—'}
                  </td>
                  <td className="w-0 p-0 relative">
                    <button
                      type="button"
                      data-row-kebab
                      aria-haspopup="menu"
                      aria-expanded={rowMenu?.holding.id === holding.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setRowMenu({ holding, anchor: rect });
                      }}
                      style={{
                        position: 'absolute',
                        right: 6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 28,
                        height: 28,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        zIndex: 5,
                      }}
                      className={`transition-opacity duration-150 rounded text-rh-light-text dark:text-white/80 hover:text-rh-light-text dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-white/10 ${
                        rowMenu?.holding.id === holding.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                      }`}
                      aria-label="More actions"
                      title="More actions"
                    >
                      <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style={{ display: 'block' }}>
                        <circle cx="12" cy="5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="19" r="1.8" />
                      </svg>
                    </button>
                  </td>
                </motion.tr>
                {viewMode === 'detailed' && hasValidPrice && (
                  <tr className="md:hidden border-b border-rh-light-border/10 dark:border-rh-border/10">
                    <td colSpan={99} className="px-4 py-1 pb-2">
                      <div className="flex items-center gap-3 text-[10px] text-rh-light-text dark:text-white">
                        <span>{holding.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares</span>
                        <span>·</span>
                        <span>avg {formatCurrency(holding.averageCost)}</span>
                        <span>·</span>
                        <span>{totalPortfolioValue > 0 ? `${(holding.currentValue / totalPortfolioValue * 100).toFixed(1)}%` : '—'}</span>
                        <span>·</span>
                        <span className={holding.dayChange >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}>
                          {formatPL(holding.dayChange)} today
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </motion.tbody>
        </table>
      </div>

      {/* Per-row Edit/Delete kebab menu — portaled so it isn't clipped by
          the table's overflow-x-auto container. Outside-click + scroll/resize
          dismissal lives in the rowMenu effect above (no backdrop overlay,
          which would swallow the next kebab click on a different row). */}
      {rowMenu && createPortal(
        (() => {
          const MENU_W = 160;
          const MENU_H = 80; // approx — 2 items x ~36px + py-1 padding
          // Flip upward if there isn't room below the kebab.
          const flipUp = rowMenu.anchor.bottom + MENU_H + 8 > window.innerHeight;
          const top = flipUp
            ? Math.max(8, rowMenu.anchor.top - MENU_H - 4)
            : rowMenu.anchor.bottom + 4;
          // Right-align the menu's right edge with the kebab's right edge.
          const left = Math.max(8, Math.min(window.innerWidth - MENU_W - 8, rowMenu.anchor.right - MENU_W));
          return (
            <div
              data-row-menu
              role="menu"
              className="fixed z-[80] bg-white dark:bg-[#1a1a1e]/95 backdrop-blur-xl rounded-lg border border-gray-200/60 dark:border-white/[0.08] shadow-xl py-1 min-w-[140px]"
              style={{ top, left, width: MENU_W }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { handleEdit(rowMenu.holding); setRowMenu(null); }}
                className="w-full px-3 py-2 text-left text-sm text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={deleting === rowMenu.holding.ticker}
                onClick={() => { handleDelete(rowMenu.holding.ticker); setRowMenu(null); }}
                className="w-full px-3 py-2 text-left text-sm text-rh-red hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22m-13 0V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                </svg>
                {deleting === rowMenu.holding.ticker ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          );
        })(),
        document.body
      )}

      {/* Add Stock Modal */}
      {showAddModal && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-add"
        >
          <div
            className="absolute inset-0 modal-overlay bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCloseModal();
            }}
            aria-hidden="true"
          />
          <div
            className="relative modal-container bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[18px] p-6 w-full max-w-md border border-gray-200/60 dark:border-white/[0.1] [box-shadow:0_8px_32px_rgba(0,0,0,0.12)] dark:[box-shadow:0_8px_32px_rgba(0,0,0,0.5)]"
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
                className="text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-white p-1"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {renderModalContent(false)}
          </div>
        </div>,
        document.body
      )}

      {/* Edit Holding Modal */}
      {editingHolding && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-edit"
        >
          <div
            className="absolute inset-0 modal-overlay bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCloseModal();
            }}
            aria-hidden="true"
          />
          <div
            className="relative modal-container bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[18px] p-6 w-full max-w-md border border-gray-200/60 dark:border-white/[0.1] [box-shadow:0_8px_32px_rgba(0,0,0,0.12)] dark:[box-shadow:0_8px_32px_rgba(0,0,0,0.5)]"
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
                className="text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-white p-1"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {renderModalContent(true)}
          </div>
        </div>,
        document.body
      )}

      {/* Cash & Margin Modal */}
      {showCashMarginModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 modal-overlay bg-black/60 backdrop-blur-sm" onClick={() => setShowCashMarginModal(false)} aria-hidden="true" />
          <div
            className="relative modal-container bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[18px] p-0 dark:p-6 w-full max-w-[440px] dark:max-w-sm border border-gray-200/60 dark:border-white/[0.1] [box-shadow:0_8px_32px_rgba(0,0,0,0.12)] dark:[box-shadow:0_8px_32px_rgba(0,0,0,0.5)]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-5 pb-0 dark:px-0 dark:pt-0 dark:pb-0 mb-1 dark:mb-4">
              <div>
                <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Cash & Margin</h3>
                <p className="text-xs text-rh-light-text mt-0.5 dark:hidden">Used to calculate your net equity and returns.</p>
              </div>
              <button type="button" onClick={() => setShowCashMarginModal(false)}
                className="text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-white p-1 mt-0.5 transition-colors">
                <svg className="w-4 h-4 dark:w-5 dark:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveCashMargin} className="px-5 pb-5 dark:px-0 dark:pb-0 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-rh-light-text/70 dark:text-sm dark:font-normal dark:text-white mb-1.5 dark:mb-1">Cash Balance</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-text dark:text-white text-sm">$</span>
                  <input type="number" inputMode="decimal" step="0.01" min="0" value={cashValue} onChange={e => setCashValue(e.target.value)}
                    className="w-full bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl dark:rounded-xl px-3 py-2.5 dark:py-2 pl-7 text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green/50 focus:ring-2 focus:ring-rh-green/10 dark:focus:border-rh-green dark:focus:ring-rh-green/20 transition-shadow"
                    placeholder="0.00" />
                </div>
                <p className="text-[11px] text-rh-light-text mt-1 dark:hidden">Uninvested cash in your brokerage account.</p>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => { const amt = prompt('Deposit amount:'); if (amt && parseFloat(amt) > 0) setCashValue(v => (parseFloat(v || '0') + parseFloat(amt)).toFixed(2)); }}
                    className="text-[10px] px-2 py-1 rounded-lg bg-rh-green/10 text-rh-green font-medium hover:bg-rh-green/20 transition-colors">
                    + Deposit
                  </button>
                  <button type="button" onClick={() => { const amt = prompt('Withdraw amount:'); if (amt && parseFloat(amt) > 0) setCashValue(v => Math.max(0, parseFloat(v || '0') - parseFloat(amt)).toFixed(2)); }}
                    className="text-[10px] px-2 py-1 rounded-lg bg-rh-red/10 text-rh-red font-medium hover:bg-rh-red/20 transition-colors">
                    - Withdraw
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-rh-light-text/70 dark:text-sm dark:font-normal dark:text-white mb-1.5 dark:mb-1">Margin Debt</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-text dark:text-white text-sm">$</span>
                  <input type="number" inputMode="decimal" step="0.01" min="0" value={marginValue} onChange={e => setMarginValue(e.target.value)}
                    className="w-full bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl dark:rounded-xl px-3 py-2.5 dark:py-2 pl-7 text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green/50 focus:ring-2 focus:ring-rh-green/10 dark:focus:border-rh-green dark:focus:ring-rh-green/20 transition-shadow"
                    placeholder="0.00" />
                </div>
                <p className="text-[11px] text-rh-light-text mt-1 dark:hidden">Amount borrowed (used to compute net equity).</p>
                <p className="text-xs text-rh-light-text dark:text-white mt-1 hidden dark:block">Enter your broker margin balance to calculate net equity</p>
              </div>
              {cashMarginError && <p className="text-rh-red text-sm">{cashMarginError}</p>}
              {/* Footer — light mode: divider + right-aligned buttons; dark mode: full-width save */}
              <div className="border-t border-black/[0.06] dark:border-transparent pt-4 dark:pt-0 flex justify-end gap-3 dark:block">
                <button type="button" onClick={() => setShowCashMarginModal(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-rh-light-text hover:text-rh-light-text hover:bg-black/[0.04] transition-colors dark:hidden">
                  Cancel
                </button>
                <button type="submit" disabled={cashMarginLoading}
                  className="px-6 py-2.5 dark:w-full dark:px-4 dark:py-2.5 bg-rh-green hover:bg-green-600 hover:shadow-lg hover:shadow-rh-green/20 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-black font-semibold rounded-xl text-sm transition-all">
                  {cashMarginLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* Click-outside handler for dropdowns */}
      {(showDisplayMenu || showSortMenu) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowDisplayMenu(false); setShowSortMenu(false); }} />
      )}
      {confirmDeleteTicker && (
        <ConfirmModal
          title="Remove Holding"
          message={`Are you sure you want to remove ${confirmDeleteTicker} from your portfolio?`}
          confirmLabel="Remove"
          danger
          onConfirm={executeDelete}
          onCancel={() => setConfirmDeleteTicker(null)}
        />
      )}
    </div>
  );
}
