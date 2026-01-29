import { useState, useEffect, useCallback, useRef } from 'react';
import { Portfolio, LeaderboardWindow, MarketSession } from '../types';
import { getUserPortfolio } from '../api';

interface UserPortfolioViewProps {
  userId: string;
  displayName: string;
  returnPct: number | null;
  window: LeaderboardWindow;
  trackingStartAt?: string;
  session?: MarketSession;
  onBack: () => void;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function UserPortfolioView({ userId, displayName, returnPct, window, trackingStartAt, session, onBack }: UserPortfolioViewProps) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const lastValidPortfolio = useRef<Portfolio | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-4 transition-colors"
      >
        <span>&larr;</span> Back to Leaderboard
      </button>

      {/* User header */}
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">{displayName}</h1>
        {returnPct !== null && (
          <span className={`px-2 py-0.5 text-sm font-medium rounded ${
            returnPct >= 0 ? 'bg-rh-green/10 text-rh-green' : 'bg-rh-red/10 text-rh-red'
          }`}>
            {formatPercent(returnPct)} ({window})
          </span>
        )}
        {trackingStartAt && (
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-500/10 text-blue-400">
            Tracking since {new Date(trackingStartAt).toLocaleDateString()}
          </span>
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
            <div className="bg-rh-light-card dark:bg-rh-card rounded-xl border border-rh-light-border dark:border-rh-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-rh-light-border dark:border-rh-border text-left">
                    <th className="px-4 py-3 text-xs font-medium text-rh-light-muted dark:text-rh-muted">Ticker</th>
                    <th className="px-4 py-3 text-xs font-medium text-rh-light-muted dark:text-rh-muted text-right">Shares</th>
                    <th className="px-4 py-3 text-xs font-medium text-rh-light-muted dark:text-rh-muted text-right">Price</th>
                    <th className="px-4 py-3 text-xs font-medium text-rh-light-muted dark:text-rh-muted text-right">Value</th>
                    <th className="px-4 py-3 text-xs font-medium text-rh-light-muted dark:text-rh-muted text-right">Day Chg</th>
                    <th className="px-4 py-3 text-xs font-medium text-rh-light-muted dark:text-rh-muted text-right">P/L</th>
                    <th className="px-4 py-3 text-xs font-medium text-rh-light-muted dark:text-rh-muted text-right">P/L %</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.holdings.map((h) => {
                    const plColor = h.profitLoss >= 0 ? 'text-rh-green' : 'text-rh-red';
                    const dayColor = h.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red';
                    return (
                      <tr key={h.id} className="border-b border-rh-light-border dark:border-rh-border last:border-b-0">
                        <td className="px-4 py-3 text-sm font-medium text-rh-light-text dark:text-rh-text">{h.ticker}</td>
                        <td className="px-4 py-3 text-sm text-right text-rh-light-text dark:text-rh-text">{h.shares}</td>
                        <td className="px-4 py-3 text-sm text-right text-rh-light-text dark:text-rh-text">{formatCurrency(h.currentPrice)}</td>
                        <td className="px-4 py-3 text-sm text-right text-rh-light-text dark:text-rh-text">{formatCurrency(h.currentValue)}</td>
                        <td className={`px-4 py-3 text-sm text-right ${dayColor}`}>
                          {formatPercent(h.dayChangePercent)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${plColor}`}>{formatCurrency(h.profitLoss)}</td>
                        <td className={`px-4 py-3 text-sm text-right ${plColor}`}>{formatPercent(h.profitLossPercent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
    <div className="bg-rh-light-card dark:bg-rh-card rounded-xl border border-rh-light-border dark:border-rh-border p-4">
      <div className="text-xs text-rh-light-muted dark:text-rh-muted mb-1">{label}</div>
      <div className={`text-lg font-bold ${valueColor ?? 'text-rh-light-text dark:text-rh-text'}`}>
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
