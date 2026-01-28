import { useState, useEffect, useCallback, useRef } from 'react';
import { Portfolio, Settings } from './types';
import { getPortfolio, getSettings } from './api';
import { REFRESH_INTERVAL } from './config';
import { CashBalance } from './components/CashBalance';
import { MarginDebt } from './components/MarginDebt';
import { HoldingForm } from './components/HoldingForm';
import { HoldingsTable } from './components/HoldingsTable';
import { Projections } from './components/Projections';
import { PerformanceSummary } from './components/PerformanceSummary';

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

export default function App() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [summaryRefreshTrigger, setSummaryRefreshTrigger] = useState(0);

  // Keep track of the last valid portfolio to avoid flickering
  const lastValidPortfolio = useRef<Portfolio | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const portfolioData = await getPortfolio();
      const settingsData = await getSettings();

      // Check if the new data is valid (not showing -100% P/L for all holdings)
      const hasValidData = portfolioData.holdings.length === 0 ||
        portfolioData.holdings.some(h => !h.priceUnavailable && h.currentPrice > 0);

      // If we have unavailable quotes, keep the previous valid state if available
      if (!hasValidData && lastValidPortfolio.current) {
        console.log('New data has unavailable quotes, keeping previous valid state');
        setIsStale(true);
        return;
      }

      // Update with new data
      setPortfolio(portfolioData);
      setSettings(settingsData);
      setError('');
      setLastUpdate(new Date());

      // Track staleness
      const dataIsStale = portfolioData.quotesStale ||
        (portfolioData.quotesUnavailableCount && portfolioData.quotesUnavailableCount > 0);
      setIsStale(!!dataIsStale);

      // Save as last valid portfolio if it has good data
      if (hasValidData) {
        lastValidPortfolio.current = portfolioData;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';

      // On fetch error, keep existing data and show stale indicator
      if (portfolio) {
        console.log('Fetch failed, keeping previous state:', message);
        setIsStale(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [portfolio]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleUpdate = () => {
    fetchData();
    setSummaryRefreshTrigger((t) => t + 1);
  };


  if (loading && !portfolio) {
    return (
      <div className="min-h-screen bg-rh-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-rh-green border-t-transparent mx-auto mb-4"></div>
          <p className="text-rh-muted">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="min-h-screen bg-rh-black flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-rh-red text-6xl mb-4">!</div>
          <h1 className="text-xl font-semibold mb-2">Connection Error</h1>
          <p className="text-rh-muted mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="bg-rh-green hover:bg-green-600 text-black font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rh-black">
      <header className="border-b border-rh-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Stock Portfolio</h1>
          <div className="flex items-center gap-4">
            {isStale && (
              <span className="flex items-center gap-2" title="Repricing quotes…">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
                </span>
                <span className="text-xs text-yellow-400">Repricing…</span>
              </span>
            )}
            {lastUpdate && (
              <span className="text-sm text-rh-muted">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stale Data Banner - only show if quotes are completely unavailable */}
        {portfolio && portfolio.quotesUnavailableCount && portfolio.quotesUnavailableCount > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3">
            <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-yellow-400 text-sm font-medium">Some quotes unavailable</p>
              <p className="text-yellow-400/70 text-xs">
                {portfolio.quotesUnavailableCount} of {portfolio.holdings.length} holdings have no current price data.
                Totals may be incomplete.
              </p>
            </div>
          </div>
        )}

        {/* 1. Top Summary Stat Cards: Total Assets, Net Equity, Day Change, Total P/L */}
        {portfolio && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* 1. Total Assets - used for performance tracking (no margin debt) */}
            <div className="bg-rh-card border border-rh-border rounded-lg p-4">
              <p className="text-rh-muted text-sm">Total Assets</p>
              <p className="text-2xl font-bold">
                {portfolio.totalAssets > 0 ? formatCurrency(portfolio.totalAssets) : '—'}
              </p>
              <p className="text-xs text-rh-muted mt-1">Holdings + Cash</p>
            </div>
            {/* 2. Net Equity - shows balance after margin debt */}
            <div className="bg-rh-card border border-rh-border rounded-lg p-4">
              <p className="text-rh-muted text-sm">Net Equity</p>
              <p className="text-2xl font-bold">
                {formatCurrency(portfolio.netEquity)}
              </p>
              {portfolio.marginDebt > 0 ? (
                <p className="text-xs text-rh-muted mt-1">
                  After ${portfolio.marginDebt.toLocaleString()} margin
                </p>
              ) : (
                <p className="text-xs text-rh-muted mt-1">Cash: {formatCurrency(portfolio.cashBalance)}</p>
              )}
            </div>
            {/* 3. Day Change */}
            <div className="bg-rh-card border border-rh-border rounded-lg p-4">
              <p className="text-rh-muted text-sm">Day Change</p>
              <p className={`text-2xl font-bold ${
                portfolio.dayChange === 0 ? '' : portfolio.dayChange > 0 ? 'text-rh-green' : 'text-rh-red'
              }`}>
                {portfolio.holdings.length > 0
                  ? `${formatCurrency(portfolio.dayChange)} (${formatPercent(portfolio.dayChangePercent)})`
                  : '—'}
              </p>
            </div>
            {/* 4. Total P/L */}
            <div className="bg-rh-card border border-rh-border rounded-lg p-4">
              <p className="text-rh-muted text-sm">Total P/L</p>
              <p className={`text-2xl font-bold ${
                portfolio.totalPL === 0 ? '' : portfolio.totalPL > 0 ? 'text-rh-green' : 'text-rh-red'
              }`}>
                {portfolio.holdings.length > 0
                  ? `${formatCurrency(portfolio.totalPL)} (${formatPercent(portfolio.totalPLPercent)})`
                  : '—'}
              </p>
            </div>
          </div>
        )}

        {/* 2. Performance Summary Cards */}
        <PerformanceSummary refreshTrigger={summaryRefreshTrigger} />

        {/* 3. Holdings Table with Add Holding Form */}
        <HoldingsTable
          holdings={portfolio?.holdings ?? []}
          onUpdate={handleUpdate}
        />

        {/* Add Holding Form - placed below table */}
        <HoldingForm onUpdate={handleUpdate} />

        {/* 4. Portfolio Projections */}
        <Projections currentValue={portfolio?.netEquity ?? 0} />

        {/* Account Settings - Cash & Margin */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CashBalance
            currentBalance={portfolio?.cashBalance ?? 0}
            onUpdate={handleUpdate}
          />
          <MarginDebt
            currentDebt={portfolio?.marginDebt ?? 0}
            onUpdate={handleUpdate}
          />
        </div>
      </main>
    </div>
  );
}
