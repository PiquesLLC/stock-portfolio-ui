import { useState, useEffect, useCallback } from 'react';
import { WatchlistSummary, WatchlistDetail, WatchlistHolding, PortfolioChartPeriod } from '../types';
import {
  getWatchlists,
  getWatchlistDetail,
  getWatchlistChart,
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
  addWatchlistHolding,
  updateWatchlistHolding,
  removeWatchlistHolding,
  getFastQuote,
} from '../api';
import { useDataEvents } from '../context/DataEventContext';
import { CreateWatchlistModal } from './CreateWatchlistModal';
import { ConfirmModal } from './ConfirmModal';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';
import { MiniSparkline } from './MiniSparkline';
import { StockLogo } from './StockLogo';
import { PortfolioValueChart } from './PortfolioValueChart';
import { formatCurrency, formatPercent } from '../utils/format';

type DisplayMetric = 'lastPrice' | 'dayChangePct' | 'equity' | 'dayChange' | 'totalReturn' | 'totalReturnPct';

const DISPLAY_METRICS: { key: DisplayMetric; label: string }[] = [
  { key: 'lastPrice', label: 'Last price' },
  { key: 'dayChangePct', label: 'Percent change' },
  { key: 'equity', label: 'Your equity' },
  { key: 'dayChange', label: "Today's return" },
  { key: 'totalReturn', label: 'Total return' },
  { key: 'totalReturnPct', label: 'Total percent change' },
];

function getWatchlistMetric(h: WatchlistHolding, metric: DisplayMetric): { text: string; isPositive: boolean; isNeutral: boolean } {
  switch (metric) {
    case 'lastPrice': return { text: formatCurrency(h.currentPrice), isPositive: true, isNeutral: true };
    case 'dayChangePct': return { text: formatPercent(h.dayChangePercent), isPositive: h.dayChangePercent >= 0, isNeutral: false };
    case 'equity': return { text: formatPercent(h.dayChangePercent), isPositive: h.dayChangePercent >= 0, isNeutral: false };
    case 'dayChange': {
      const sign = h.dayChange >= 0 ? '+' : '';
      return { text: `${sign}${formatCurrency(h.dayChange)}`, isPositive: h.dayChange >= 0, isNeutral: false };
    }
    case 'totalReturn': {
      const sign = h.profitLoss >= 0 ? '+' : '';
      return { text: `${sign}${formatCurrency(h.profitLoss)}`, isPositive: h.profitLoss >= 0, isNeutral: false };
    }
    case 'totalReturnPct': return { text: formatPercent(h.profitLossPercent), isPositive: h.profitLossPercent >= 0, isNeutral: false };
  }
}

interface WatchlistPageProps {
  onTickerClick: (ticker: string) => void;
}

type SortKey = 'ticker' | 'currentPrice' | 'shares' | 'averageCost' | 'currentValue' | 'dayChange' | 'profitLoss' | 'weekChangePercent' | 'monthChangePercent' | 'yearChangePercent' | 'peRatio';
type SortDir = 'asc' | 'desc';

export function WatchlistPage({ onTickerClick }: WatchlistPageProps) {
  const { emit } = useDataEvents();
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WatchlistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [editingWatchlist, setEditingWatchlist] = useState<WatchlistSummary | null>(null);
  const [deletingWatchlist, setDeletingWatchlist] = useState<WatchlistSummary | null>(null);

  // Add holding state
  const [showAddStock, setShowAddStock] = useState(false);
  const [addTicker, setAddTicker] = useState('');
  const [addShares, setAddShares] = useState('1');
  const [addCost, setAddCost] = useState('');
  const [addCurrentPrice, setAddCurrentPrice] = useState<number | null>(null);
  const [addError, setAddError] = useState('');

  // Edit holding state
  const [editingHolding, setEditingHolding] = useState<WatchlistHolding | null>(null);
  const [editShares, setEditShares] = useState('');
  const [editCost, setEditCost] = useState('');

  // Delete holding state
  const [deletingHolding, setDeletingHolding] = useState<WatchlistHolding | null>(null);

  // Chart refresh trigger — increment to re-fetch chart after holding changes
  const [chartRefresh, setChartRefresh] = useState(0);

  // Track chart period so sparklines can sync
  const [chartPeriod, setChartPeriod] = useState<PortfolioChartPeriod>('1D');

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('currentValue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Mobile display metric
  const [displayMetric, setDisplayMetric] = useState<DisplayMetric>(
    () => (localStorage.getItem('watchlistDisplayMetric') as DisplayMetric) || 'dayChangePct'
  );
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);

  const loadWatchlists = useCallback(async () => {
    try {
      const lists = await getWatchlists();
      setWatchlists(lists);
    } catch {
      setError('Failed to load watchlists');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const d = await getWatchlistDetail(id);
      setDetail(d);
    } catch {
      setError('Failed to load watchlist');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWatchlists();
  }, [loadWatchlists]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Auto-refresh watchlist detail every 60s so currentValue stays fresh for chart bridging
  useEffect(() => {
    if (!selectedId) return;
    const id = setInterval(() => loadDetail(selectedId), 60_000);
    return () => clearInterval(id);
  }, [selectedId, loadDetail]);

  const handleCreate = async (data: { name: string; description?: string; color: string }) => {
    try {
      await createWatchlist(data);
      setShowCreate(false);
      await loadWatchlists();
      emit('watchlist:changed');
    } catch (_err) {
      // The error will show via toast
    }
  };

  const handleEdit = async (data: { name: string; description?: string; color: string }) => {
    if (!editingWatchlist) return;
    try {
      await updateWatchlist(editingWatchlist.id, data);
      setEditingWatchlist(null);
      await loadWatchlists();
      if (selectedId === editingWatchlist.id) await loadDetail(editingWatchlist.id);
    } catch {
      // toast
    }
  };

  const handleDelete = async () => {
    if (!deletingWatchlist) return;
    try {
      await deleteWatchlist(deletingWatchlist.id);
      setDeletingWatchlist(null);
      if (selectedId === deletingWatchlist.id) {
        setSelectedId(null);
        setDetail(null);
      }
      await loadWatchlists();
      emit('watchlist:changed');
    } catch {
      // toast
    }
  };

  const handleAddHolding = async () => {
    if (!selectedId || !addTicker.trim()) return;
    const s = parseFloat(addShares);
    const c = parseFloat(addCost);
    if (!s || s <= 0) { setAddError('Enter valid shares'); return; }
    if (!c || c <= 0) { setAddError('Enter valid cost'); return; }

    try {
      await addWatchlistHolding(selectedId, { ticker: addTicker.toUpperCase(), shares: s, averageCost: c });
      setShowAddStock(false);
      setAddTicker('');
      setAddShares('1');
      setAddCost('');
      setAddCurrentPrice(null);
      setAddError('');
      await loadDetail(selectedId);
      await loadWatchlists();
      setChartRefresh(n => n + 1);
      emit('watchlist:changed');
    } catch {
      setAddError('Failed to add holding');
    }
  };

  const handleEditHolding = async () => {
    if (!selectedId || !editingHolding) return;
    const s = parseFloat(editShares);
    const c = parseFloat(editCost);
    if (!s || s <= 0 || !c || c <= 0) return;

    try {
      await updateWatchlistHolding(selectedId, editingHolding.ticker, { shares: s, averageCost: c });
      setEditingHolding(null);
      await loadDetail(selectedId);
      setChartRefresh(n => n + 1);
      emit('watchlist:changed');
    } catch {
      // toast
    }
  };

  const handleDeleteHolding = async () => {
    if (!selectedId || !deletingHolding) return;
    try {
      await removeWatchlistHolding(selectedId, deletingHolding.ticker);
      setDeletingHolding(null);
      await loadDetail(selectedId);
      await loadWatchlists();
      setChartRefresh(n => n + 1);
      emit('watchlist:changed');
    } catch {
      // toast
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' ? 'asc' : 'desc');
    }
  };

  const sortedHoldings = detail?.holdings?.slice().sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string') return mul * av.localeCompare(bv as string);
    // Handle null values (e.g. peRatio) — push nulls to the end
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return mul * ((av as number) - (bv as number));
  }) ?? [];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return (
      <svg className="w-3 h-3 inline-block ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
      </svg>
    );
  };

  // ─── Detail View ────────────────────────────────────────────────────
  if (selectedId) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedId(null); setDetail(null); }}
            className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {detail && (
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: detail.color }} />
              )}
              <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text truncate">
                {detail?.name || 'Loading...'}
              </h1>
            </div>
            {detail?.description && (
              <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5 truncate">{detail.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const wl = watchlists.find(w => w.id === selectedId);
                if (wl) setEditingWatchlist(wl);
              }}
              className="p-2 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              title="Edit watchlist"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => {
                const wl = watchlists.find(w => w.id === selectedId);
                if (wl) setDeletingWatchlist(wl);
              }}
              className="p-2 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-red hover:bg-rh-red/10 transition-colors"
              title="Delete watchlist"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {detail && detail.holdings.length > 0 && (() => {
          const s = detail.summary;
          const hasAfterHours = (s.afterHoursChange ?? 0) !== 0;
          const regChange = s.regularDayChange ?? s.dayChange;
          const regPct = s.regularDayChangePercent ?? s.dayChangePercent;
          const ahChange = s.afterHoursChange ?? 0;
          const ahPct = s.afterHoursChangePercent ?? 0;
          return (
            <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-8 gap-y-2 px-4 py-3 rounded-xl bg-gray-50/60 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.04]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45">Value</span>
                <span className="text-sm font-bold text-rh-light-text dark:text-rh-text">
                  {formatCurrency(s.totalValue)}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45">Total P/L</span>
                <span className={`text-sm font-bold ${s.totalPL >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {formatCurrency(s.totalPL)}
                </span>
                <span className={`text-[10px] ${s.totalPL >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                  {formatPercent(s.totalPLPercent)}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45">Day</span>
                <span className={`text-sm font-bold ${regChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {formatCurrency(regChange)}
                </span>
                <span className={`text-[10px] ${regChange >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                  {formatPercent(regPct)}
                </span>
              </div>
              {hasAfterHours && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45">After hrs</span>
                  <span className={`text-sm font-bold ${ahChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {formatCurrency(ahChange)}
                  </span>
                  <span className={`text-[10px] ${ahChange >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                    {formatPercent(ahPct)}
                  </span>
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45">Holdings</span>
                <span className="text-sm font-bold text-rh-light-text dark:text-rh-text">{s.holdingsCount}</span>
              </div>
            </div>
          );
        })()}

        {/* Portfolio chart */}
        {detail && detail.holdings.length > 0 && selectedId && (
          <PortfolioValueChart
            currentValue={detail.summary.totalValue}
            dayChange={detail.summary.dayChange}
            dayChangePercent={detail.summary.dayChangePercent}
            refreshTrigger={chartRefresh}
            fetchFn={(period) => getWatchlistChart(selectedId, period)}
            onPeriodChange={setChartPeriod}
          />
        )}

        {/* Add stock button */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowAddStock(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rh-green text-black font-semibold hover:bg-green-600 transition-all duration-150 text-xs hover:scale-[1.02]"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Stock
          </button>
        </div>

        {/* Add stock form */}
        {showAddStock && (
          <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.06] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-rh-light-muted dark:text-rh-muted mb-1">Ticker</label>
                <TickerAutocompleteInput
                  value={addTicker}
                  onChange={(val) => { setAddTicker(val); if (!val) { setAddCurrentPrice(null); setAddCost(''); } }}
                  onSelect={async (result) => {
                    setAddTicker(result.symbol);
                    setAddCurrentPrice(null);
                    try {
                      const quote = await getFastQuote(result.symbol);
                      if (quote?.currentPrice) {
                        setAddCurrentPrice(quote.currentPrice);
                        setAddCost(quote.currentPrice.toFixed(2));
                      }
                    } catch { /* silent */ }
                  }}
                  heldTickers={detail?.holdings.map(h => h.ticker) ?? []}
                  compact
                  placeholder="Search ticker..."
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-rh-light-muted dark:text-rh-muted mb-1">Shares</label>
                <input
                  type="number"
                  value={addShares}
                  onChange={(e) => setAddShares(e.target.value)}
                  min="0.001"
                  step="any"
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text focus:outline-none focus:border-rh-green/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-rh-light-muted dark:text-rh-muted mb-1">
                  Avg Cost ($)
                  {addCurrentPrice !== null && (
                    <span className="ml-1.5 text-rh-green font-normal">
                      Current: ${addCurrentPrice.toFixed(2)}
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  value={addCost}
                  onChange={(e) => setAddCost(e.target.value)}
                  min="0.01"
                  step="any"
                  placeholder={addCurrentPrice !== null ? `$${addCurrentPrice.toFixed(2)}` : 'Entry price'}
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text placeholder:text-rh-light-muted/50 dark:placeholder:text-rh-muted/50 focus:outline-none focus:border-rh-green/50 transition-colors"
                />
              </div>
            </div>
            {addError && <p className="text-xs text-rh-red">{addError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowAddStock(false); setAddError(''); setAddCurrentPrice(null); setAddTicker(''); setAddCost(''); setAddShares('1'); }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                Cancel
              </button>
              <button onClick={handleAddHolding} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-rh-green/15 text-rh-green hover:bg-rh-green/25 transition-colors">
                Add
              </button>
            </div>
          </div>
        )}

        {/* Holdings header with display picker */}
        {detail && detail.holdings.length > 0 && (
          <div className="px-3 sm:px-0 flex items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rh-light-muted/80 dark:text-rh-muted/80">Holdings</h2>
            <div className="relative md:hidden">
              <button
                onClick={() => setShowDisplayMenu(!showDisplayMenu)}
                className="p-1 text-rh-light-muted/50 dark:text-rh-muted/50 hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
                title="Display data"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {showDisplayMenu && (
                <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-rh-light-card dark:bg-rh-card border border-rh-light-border/40 dark:border-rh-border/40 rounded-xl shadow-xl py-1 animate-fade-in-up">
                  <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/50">Display data</p>
                  {DISPLAY_METRICS.map((m) => (
                    <button
                      key={m.key}
                      className="flex items-center justify-between w-full px-3 py-2 text-[13px] text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
                      onClick={() => {
                        setDisplayMetric(m.key);
                        localStorage.setItem('watchlistDisplayMetric', m.key);
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
        )}

        {/* Holdings */}
        {detailLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-rh-green border-t-transparent" />
          </div>
        ) : detail && detail.holdings.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-12 h-12 mx-auto mb-3 text-rh-light-muted/30 dark:text-rh-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-1">No holdings yet</p>
            <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 mb-4">Add stocks to track their performance</p>
            <button
              onClick={() => setShowAddStock(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-rh-green/15 text-rh-green hover:bg-rh-green/25 transition-colors"
            >
              Add First Stock
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="md:hidden">
              {sortedHoldings.map((h, idx) => {
                const metric = getWatchlistMetric(h, displayMetric);
                return (
                  <div
                    key={h.ticker}
                    className={`flex items-center px-3 py-3 ${idx > 0 ? 'border-t border-rh-light-border/15 dark:border-rh-border/15' : ''} cursor-pointer active:bg-gray-100 dark:active:bg-white/[0.03]`}
                    onClick={() => onTickerClick(h.ticker)}
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <StockLogo ticker={h.ticker} size="sm" />
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{h.ticker}</span>
                        <p className="text-[11px] text-rh-light-muted/50 dark:text-rh-muted/50">
                          {h.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares
                        </p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 px-3">
                      <MiniSparkline ticker={h.ticker} positive={h.dayChange >= 0} period={chartPeriod} />
                    </div>
                    <div className="flex-1 text-right">
                      <p className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
                        {formatCurrency(h.currentValue)}
                      </p>
                      <p className={`text-[11px] font-medium ${
                        metric.isNeutral
                          ? 'text-rh-light-muted dark:text-rh-muted'
                          : metric.isPositive ? 'text-rh-green' : 'text-rh-red'
                      }`}>
                        {metric.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto pb-1 scrollbar-hide">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200/30 dark:border-white/[0.04]">
                    {([
                      ['ticker', 'Ticker', 'text-left'],
                    ] as [SortKey, string, string][]).map(([key, label, className]) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className={`${className} py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-white/40 cursor-pointer hover:text-rh-light-text dark:hover:text-rh-text transition-colors select-none`}
                      >
                        {label}<SortIcon col={key} />
                      </th>
                    ))}
                    <th className="py-2.5 px-2 text-center">
                      <svg className="w-5 h-5 inline-block text-rh-light-muted/60 dark:text-white/35" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 8-8" />
                      </svg>
                    </th>
                    {([
                      ['currentPrice', 'Price', 'text-right'],
                      ['shares', 'Shares', 'text-right hidden xl:table-cell'],
                      ['averageCost', 'Avg Cost', 'text-right hidden xl:table-cell'],
                      ['currentValue', 'Mkt Val', 'text-right'],
                      ['dayChange', 'Day P/L', 'text-right'],
                      ['weekChangePercent', 'Week', 'text-right hidden lg:table-cell w-[88px]'],
                      ['monthChangePercent', 'Month', 'text-right hidden lg:table-cell w-[88px]'],
                      ['yearChangePercent', '1Y', 'text-right hidden lg:table-cell w-[88px]'],
                      ['peRatio', 'P/E', 'text-right hidden lg:table-cell w-[64px]'],
                      ['profitLoss', 'Total P/L', 'text-right'],
                    ] as [SortKey, string, string][]).map(([key, label, className]) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className={`${className} py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-white/40 cursor-pointer hover:text-rh-light-text dark:hover:text-rh-text transition-colors select-none`}
                      >
                        {label}<SortIcon col={key} />
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.map((h) => (
                    <tr
                      key={h.ticker}
                      onClick={() => onTickerClick(h.ticker)}
                      className="border-b border-gray-200/20 dark:border-white/[0.03] hover:bg-gray-100/70 dark:hover:bg-white/[0.04] transition-colors group cursor-pointer"
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <StockLogo ticker={h.ticker} size="sm" />
                          <span className="font-semibold text-rh-light-text dark:text-rh-text group-hover:text-rh-green transition-colors">
                            {h.ticker}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <MiniSparkline ticker={h.ticker} positive={h.dayChange >= 0} period={chartPeriod} />
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-rh-light-text dark:text-rh-text">
                        {formatCurrency(h.currentPrice)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-rh-light-muted dark:text-rh-muted hidden xl:table-cell">
                        {h.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-rh-light-muted dark:text-rh-muted hidden xl:table-cell">
                        {formatCurrency(h.averageCost)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-rh-light-text dark:text-rh-text">
                        {formatCurrency(h.currentValue)}
                      </td>
                      <td className={`py-3 px-3 text-right tabular-nums ${h.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                        <div className="text-sm">{formatCurrency(h.dayChange)}</div>
                        <div className="text-[9px] opacity-50">{formatPercent(h.dayChangePercent)}</div>
                      </td>
                      <td className={`py-3 px-3 text-right tabular-nums hidden lg:table-cell ${h.weekChangePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                        {formatPercent(h.weekChangePercent)}
                      </td>
                      <td className={`py-3 px-3 text-right tabular-nums hidden lg:table-cell ${h.monthChangePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                        {formatPercent(h.monthChangePercent)}
                      </td>
                      <td className={`py-3 px-3 text-right tabular-nums hidden lg:table-cell ${h.yearChangePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                        {formatPercent(h.yearChangePercent)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums hidden lg:table-cell text-rh-light-muted dark:text-rh-muted">
                        {h.peRatio !== null ? h.peRatio.toFixed(1) : '—'}
                      </td>
                      <td className={`py-3 px-3 text-right tabular-nums font-medium ${h.profitLoss >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                        <div className="text-sm">{formatCurrency(h.profitLoss)}</div>
                        <div className="text-[9px] opacity-50">{formatPercent(h.profitLossPercent)}</div>
                      </td>
                      <td className="py-3 px-1">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingHolding(h);
                              setEditShares(String(h.shares));
                              setEditCost(String(h.averageCost));
                            }}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
                            title="Edit"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingHolding(h);
                            }}
                            className="p-1 rounded hover:bg-rh-red/10 text-rh-light-muted dark:text-rh-muted hover:text-rh-red transition-colors"
                            title="Remove"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Click-outside handler for display data dropdown */}
        {showDisplayMenu && (
          <div className="fixed inset-0 z-40" onClick={() => setShowDisplayMenu(false)} />
        )}

        {/* Edit holding modal */}
        {editingHolding && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center" onClick={() => setEditingHolding(null)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="relative w-[90%] max-w-sm bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[18px] border border-white/20 dark:border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-rh-light-text dark:text-white mb-4">
                Edit {editingHolding.ticker}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-medium text-rh-light-muted dark:text-rh-muted mb-1">Shares</label>
                  <input
                    type="number"
                    value={editShares}
                    onChange={(e) => setEditShares(e.target.value)}
                    min="0.001"
                    step="any"
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text focus:outline-none focus:border-rh-green/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-rh-light-muted dark:text-rh-muted mb-1">Avg Cost ($)</label>
                  <input
                    type="number"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    min="0.01"
                    step="any"
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text focus:outline-none focus:border-rh-green/50 transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-5">
                <button onClick={() => setEditingHolding(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                  Cancel
                </button>
                <button onClick={handleEditHolding} className="px-5 py-2 rounded-xl text-sm font-bold bg-rh-green/15 text-rh-green hover:bg-rh-green/25 transition-colors">
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete holding confirm */}
        {deletingHolding && (
          <ConfirmModal
            title={`Remove ${deletingHolding.ticker}?`}
            message={`Remove ${deletingHolding.ticker} from this watchlist? This won't affect your real portfolio.`}
            confirmLabel="Remove"
            danger
            onConfirm={handleDeleteHolding}
            onCancel={() => setDeletingHolding(null)}
          />
        )}

        {/* Edit watchlist modal */}
        {editingWatchlist && (
          <CreateWatchlistModal
            onClose={() => setEditingWatchlist(null)}
            onSave={handleEdit}
            initialData={{ name: editingWatchlist.name, description: editingWatchlist.description ?? '', color: editingWatchlist.color }}
            isEdit
          />
        )}

        {/* Delete watchlist confirm */}
        {deletingWatchlist && (
          <ConfirmModal
            title={`Delete "${deletingWatchlist.name}"?`}
            message={`This will permanently delete the watchlist and all ${deletingWatchlist.holdingsCount} holding${deletingWatchlist.holdingsCount !== 1 ? 's' : ''} in it.`}
            confirmLabel="Delete"
            danger
            onConfirm={handleDelete}
            onCancel={() => setDeletingWatchlist(null)}
          />
        )}
      </div>
    );
  }

  // ─── List View ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Watchlists</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rh-green text-black font-semibold hover:bg-green-600 transition-all duration-150 text-xs hover:scale-[1.02]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Watchlist
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-rh-green border-t-transparent" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-sm text-rh-red mb-3">{error}</p>
          <button onClick={loadWatchlists} className="text-sm text-rh-green hover:underline">Retry</button>
        </div>
      ) : watchlists.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-16 h-16 mx-auto mb-4 text-rh-light-muted/20 dark:text-rh-muted/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-2">No watchlists yet</h2>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-6 max-w-sm mx-auto">
            Create virtual portfolios to track "what if" scenarios, sector plays, and dividend picks — with full P&L tracking.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-rh-green text-black hover:bg-green-600 transition-colors"
          >
            Create Your First Watchlist
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {watchlists.map((wl) => (
            <button
              key={wl.id}
              onClick={() => setSelectedId(wl.id)}
              className="text-left p-4 rounded-xl bg-rh-light-card dark:bg-white/[0.03] border-l-[3px] border border-gray-200/30 dark:border-white/[0.04] hover:border-gray-300/50 dark:hover:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-all group"
              style={{ borderLeftColor: wl.color }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-rh-light-text dark:text-rh-text truncate group-hover:text-rh-green transition-colors">
                    {wl.name}
                  </h3>
                  {wl.description && (
                    <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5 line-clamp-2">{wl.description}</p>
                  )}
                </div>
                <svg className="w-4 h-4 text-rh-light-muted/30 dark:text-rh-muted/30 group-hover:text-rh-light-muted dark:group-hover:text-rh-muted transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                  {wl.holdingsCount} holding{wl.holdingsCount !== 1 ? 's' : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create watchlist modal */}
      {showCreate && (
        <CreateWatchlistModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}
    </div>
  );
}
