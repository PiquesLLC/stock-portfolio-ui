import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Portfolio, Holding, LeaderboardWindow, MarketSession, PortfolioIntelligenceResponse, IntelligenceWindow } from '../types';
import { getUserPortfolio, getUserProfile, getUserIntelligence, getUserChart } from '../api';
import { PortfolioValueChart } from './PortfolioValueChart';
import { FollowButton } from './FollowButton';
import { PortfolioIntelligence } from './PortfolioIntelligence';
import { StockDetailView } from './StockDetailView';

type HoldingSortKey = 'ticker' | 'shares' | 'price' | 'value' | 'dayPL' | 'dayChg' | 'pl' | 'plPct';
type SortDir = 'asc' | 'desc';

function getHoldingValue(h: Holding, key: HoldingSortKey): number | string {
  switch (key) {
    case 'ticker': return h.ticker;
    case 'shares': return h.shares;
    case 'price': return h.currentPrice;
    case 'value': return h.currentValue;
    case 'dayPL': return h.dayChange;
    case 'dayChg': return h.dayChangePercent;
    case 'pl': return h.profitLoss;
    case 'plPct': return h.profitLossPercent;
  }
}

interface UserPortfolioViewProps {
  userId: string;
  displayName: string;
  returnPct: number | null;
  window: LeaderboardWindow;
  trackingStartAt?: string;
  session?: MarketSession;
  currentUserId?: string;
  onBack: () => void;
  onStockClick?: (ticker: string) => void;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function UserPortfolioView({ userId, displayName, returnPct, window, trackingStartAt, session, currentUserId, onBack, onStockClick }: UserPortfolioViewProps) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [intelligence, setIntelligence] = useState<PortfolioIntelligenceResponse | null>(null);
  const [sortKey, setSortKey] = useState<HoldingSortKey>('ticker');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [viewingStock, setViewingStock] = useState<{ ticker: string; holding: Holding } | null>(null);
  const [chartRefreshCount, setChartRefreshCount] = useState(0);
  const lastValidPortfolio = useRef<Portfolio | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleSort = (key: HoldingSortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(key === 'ticker' ? 'asc' : 'desc');
    } else {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    }
  };

  const sortedHoldings = useMemo(() => {
    if (!portfolio) return [];
    return [...portfolio.holdings].sort((a, b) => {
      const aVal = getHoldingValue(a, sortKey);
      const bVal = getHoldingValue(b, sortKey);
      let cmp: number;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = (aVal as number) - (bVal as number);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [portfolio, sortKey, sortDir]);

  const sortIndicator = (key: HoldingSortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1 opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  const thClass = (key: HoldingSortKey, align: 'left' | 'right' = 'right') => {
    const base = 'px-4 py-3 text-xs font-medium cursor-pointer hover:text-rh-light-text dark:hover:text-white hover:bg-gray-100 dark:hover:bg-rh-dark/30 transition-colors select-none whitespace-nowrap';
    const alignCls = align === 'right' ? 'text-right' : '';
    const activeCls = sortKey === key ? 'text-rh-light-text dark:text-white' : 'text-rh-light-muted dark:text-rh-muted';
    return `${base} ${alignCls} ${activeCls}`;
  };

  // Fetch follow status
  useEffect(() => {
    if (!currentUserId || currentUserId === userId) return;
    getUserProfile(userId, currentUserId)
      .then((p) => setIsFollowing(p.viewerIsFollowing))
      .catch(() => {});
  }, [userId, currentUserId]);

  // Fetch intelligence for this user
  useEffect(() => {
    getUserIntelligence(userId, '1d')
      .then(setIntelligence)
      .catch(() => {});
  }, [userId]);

  const fetchData = useCallback(async () => {
    // Skip if tab not focused
    if (!document.hasFocus()) return;

    try {
      const data = await getUserPortfolio(userId);

      // Validate data — keep previous if quotes are unavailable
      const hasValidData = data.holdings.length === 0 ||
        data.holdings.some(h => !h.priceUnavailable && h.currentPrice > 0);

      if (!hasValidData && lastValidPortfolio.current) {
        setIsStale(true);
        return;
      }

      setPortfolio(data);
      setError(null);
      setLastUpdate(new Date());
      setChartRefreshCount(c => c + 1);

      const dataIsRepricing = data.quotesMeta?.anyRepricing ||
        data.quotesStale ||
        (data.quotesUnavailableCount && data.quotesUnavailableCount > 0);
      setIsStale(!!dataIsRepricing);

      if (hasValidData) {
        lastValidPortfolio.current = data;
      }
    } catch (err) {
      // On error, keep existing data
      if (lastValidPortfolio.current) {
        setIsStale(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load portfolio');
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    lastValidPortfolio.current = null;
    fetchData();
  }, [fetchData]);

  // Polling with session-aware interval (same logic as main portfolio + leaderboard)
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const isMarketActive = session === 'REG' || session === 'PRE' || session === 'POST';
    const pollMs = isMarketActive ? 12000 : 60000;

    intervalRef.current = setInterval(fetchData, pollMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, session]);

  if (viewingStock) {
    return (
      <StockDetailView
        ticker={viewingStock.ticker}
        holding={viewingStock.holding}
        portfolioTotal={portfolio?.totalValue ?? 0}
        onBack={() => setViewingStock(null)}
      />
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-4 transition-colors"
      >
        <span>&larr;</span> Back to Leaderboard
      </button>

      {/* User header */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
        <h1 className="text-lg sm:text-xl font-bold text-rh-light-text dark:text-rh-text">{displayName}</h1>
        {returnPct !== null && (
          <span className={`px-2 py-0.5 text-xs sm:text-sm font-medium rounded ${
            returnPct >= 0 ? 'bg-rh-green/10 text-rh-green' : 'bg-rh-red/10 text-rh-red'
          }`}>
            {formatPercent(returnPct)} ({window})
          </span>
        )}
        {trackingStartAt && (
          <span className="hidden sm:inline px-2 py-0.5 text-xs font-medium rounded bg-blue-500/10 text-blue-400">
            Tracking since {new Date(trackingStartAt).toLocaleDateString()}
          </span>
        )}
        {currentUserId && isFollowing !== null && (
          <FollowButton
            targetUserId={userId}
            currentUserId={currentUserId}
            initialFollowing={isFollowing}
          />
        )}
      </div>

      {/* Status line: last updated + repricing */}
      <div className="flex items-center gap-3 mb-6">
        {lastUpdate && (
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}
        {isStale && (
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
            </span>
            <span className="text-xs text-yellow-400">Repricing...</span>
          </span>
        )}
      </div>

      {error && <div className="text-rh-red text-sm mb-4">{error}</div>}

      {loading && !portfolio ? (
        <div className="text-rh-light-muted dark:text-rh-muted text-sm">Loading portfolio...</div>
      ) : portfolio ? (
        <>
          {/* Portfolio Value Chart */}
          <PortfolioValueChart
            currentValue={portfolio.netEquity}
            dayChange={portfolio.dayChange}
            dayChangePercent={portfolio.dayChangePercent}
            refreshTrigger={chartRefreshCount}
            fetchFn={(period) => getUserChart(userId, period)}
          />

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              label="Total Assets"
              value={formatCurrency(portfolio.totalAssets)}
            />
            <SummaryCard
              label="Net Equity"
              value={formatCurrency(portfolio.netEquity)}
            />
            <SummaryCard
              label="Day Change"
              value={formatCurrency(portfolio.dayChange)}
              valueColor={portfolio.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red'}
              sub={formatPercent(portfolio.dayChangePercent)}
            />
            <SummaryCard
              label="Total P/L"
              value={formatCurrency(portfolio.totalPL)}
              valueColor={portfolio.totalPL >= 0 ? 'text-rh-green' : 'text-rh-red'}
              sub={formatPercent(portfolio.totalPLPercent)}
            />
          </div>

          {/* Holdings table */}
          {portfolio.holdings.length === 0 ? (
            <div className="text-rh-light-muted dark:text-rh-muted text-sm">No holdings</div>
          ) : (
            <div className="bg-gray-50/40 dark:bg-white/[0.03] backdrop-blur-md rounded-xl border border-gray-200/40 dark:border-white/[0.06] overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-200/30 dark:border-white/[0.06] text-left">
                    <th className={thClass('ticker', 'left')} onClick={() => handleSort('ticker')}>Ticker{sortIndicator('ticker')}</th>
                    <th className={thClass('shares')} onClick={() => handleSort('shares')}>{sortIndicator('shares')}Shares</th>
                    <th className={thClass('price')} onClick={() => handleSort('price')}>{sortIndicator('price')}Price</th>
                    <th className={`hidden sm:table-cell ${thClass('value')}`} onClick={() => handleSort('value')}>{sortIndicator('value')}Value</th>
                    <th className={`hidden sm:table-cell ${thClass('dayPL')}`} onClick={() => handleSort('dayPL')}>{sortIndicator('dayPL')}Day P/L</th>
                    <th className={thClass('dayChg')} onClick={() => handleSort('dayChg')}>{sortIndicator('dayChg')}Day %</th>
                    <th className={thClass('pl')} onClick={() => handleSort('pl')}>{sortIndicator('pl')}P/L</th>
                    <th className={thClass('plPct')} onClick={() => handleSort('plPct')}>{sortIndicator('plPct')}P/L %</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.map((h) => {
                    const plColor = h.profitLoss >= 0 ? 'text-rh-green' : 'text-rh-red';
                    const dayColor = h.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red';
                    return (
                      <tr key={h.id} className="border-b border-gray-200/20 dark:border-white/[0.04] last:border-b-0 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 sm:px-4 py-3 text-sm font-medium text-rh-light-text dark:text-rh-text">
                          <span
                            className="cursor-pointer hover:text-rh-green hover:underline transition-colors"
                            onClick={() => onStockClick ? onStockClick(h.ticker) : setViewingStock({ ticker: h.ticker, holding: h })}
                          >{h.ticker}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-sm text-right text-rh-light-text dark:text-rh-text">{h.shares}</td>
                        <td className="px-3 sm:px-4 py-3 text-sm text-right text-rh-light-text dark:text-rh-text">{formatCurrency(h.currentPrice)}</td>
                        <td className={`hidden sm:table-cell px-3 sm:px-4 py-3 text-sm text-right text-rh-light-text dark:text-rh-text`}>{formatCurrency(h.currentValue)}</td>
                        <td className={`hidden sm:table-cell px-3 sm:px-4 py-3 text-sm text-right ${dayColor}`}>
                          {formatCurrency(h.dayChange)}
                        </td>
                        <td className={`px-3 sm:px-4 py-3 text-sm text-right ${dayColor}`}>
                          {formatPercent(h.dayChangePercent)}
                        </td>
                        <td className={`px-3 sm:px-4 py-3 text-sm text-right ${plColor}`}>{formatCurrency(h.profitLoss)}</td>
                        <td className={`px-3 sm:px-4 py-3 text-sm text-right ${plColor}`}>{formatPercent(h.profitLossPercent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Portfolio Intelligence */}
          {intelligence && (
            <div className="mt-6">
              <PortfolioIntelligence
                initialData={intelligence}
                fetchFn={(w: IntelligenceWindow) => getUserIntelligence(userId, w)}
              />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, valueColor, sub }: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-50/40 dark:bg-white/[0.03] backdrop-blur-md rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-4">
      <div className="text-xs text-rh-light-muted dark:text-rh-muted mb-1">{label}</div>
      <div className={`text-base sm:text-lg font-bold ${valueColor ?? 'text-rh-light-text dark:text-rh-text'}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-xs mt-0.5 ${valueColor ?? 'text-rh-light-muted dark:text-rh-muted'}`}>
          {sub}
        </div>
      )}
    </div>
  );
}
