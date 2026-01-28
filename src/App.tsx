import { useState, useEffect, useCallback, useRef } from 'react';
import { Portfolio, Settings, MarketSession } from './types';
import { getPortfolio, getSettings } from './api';
import { REFRESH_INTERVAL } from './config';
import { CashBalance } from './components/CashBalance';
import { MarginDebt } from './components/MarginDebt';
import { HoldingForm } from './components/HoldingForm';
import { HoldingsTable } from './components/HoldingsTable';
import { Projections } from './components/Projections';
import { PerformanceSummary } from './components/PerformanceSummary';
import { Navigation, TabType } from './components/Navigation';
import { InsightsPage } from './components/InsightsPage';
import { LeaderboardPage } from './components/LeaderboardPage';

// Theme utilities
function getInitialTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem('theme');
  if (stored === 'light') return 'light';
  return 'dark'; // Default to dark
}

function applyTheme(theme: 'dark' | 'light') {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem('theme', theme);
}

function getSessionDisplay(session?: MarketSession): { label: string; color: string; description: string } {
  switch (session) {
    case 'PRE': return { label: 'PRE', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', description: 'Pre-Market (4:00 AM - 9:30 AM ET)' };
    case 'REG': return { label: 'OPEN', color: 'bg-green-500/20 text-green-400 border-green-500/30', description: 'Regular Session (9:30 AM - 4:00 PM ET)' };
    case 'POST': return { label: 'AH', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', description: 'After-Hours (4:00 PM - 8:00 PM ET)' };
    case 'CLOSED': return { label: 'CLOSED', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', description: 'Market Closed' };
    default: return { label: 'CLOSED', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', description: 'Market Closed' };
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

export default function App() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [summaryRefreshTrigger, setSummaryRefreshTrigger] = useState(0);
  const [portfolioRefreshCount, setPortfolioRefreshCount] = useState(0);
  const [showExtendedHours, setShowExtendedHours] = useState(() => {
    const stored = localStorage.getItem('showExtendedHours');
    return stored !== null ? stored === 'true' : true; // Default to showing extended hours
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  const [activeTab, setActiveTab] = useState<TabType>('portfolio');

  // Keep track of the last valid portfolio to avoid flickering
  const lastValidPortfolio = useRef<Portfolio | null>(null);
  // Track last totalAssets to only trigger projection refresh on value change
  const lastTotalAssets = useRef<number | null>(null);

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

      // Only trigger projection refresh when portfolio value actually changes
      const newTotalAssets = Math.round(portfolioData.totalAssets * 100) / 100;
      if (lastTotalAssets.current === null || newTotalAssets !== lastTotalAssets.current) {
        lastTotalAssets.current = newTotalAssets;
        setPortfolioRefreshCount((c) => c + 1);
      }

      // Track repricing state
      const dataIsRepricing = portfolioData.quotesMeta?.anyRepricing ||
        portfolioData.quotesStale ||
        (portfolioData.quotesUnavailableCount && portfolioData.quotesUnavailableCount > 0);
      setIsStale(!!dataIsRepricing);

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

  const toggleExtendedHours = () => {
    const newValue = !showExtendedHours;
    setShowExtendedHours(newValue);
    localStorage.setItem('showExtendedHours', String(newValue));
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  // Determine if we're currently in extended hours
  const isExtendedHours = portfolio?.session === 'PRE' || portfolio?.session === 'POST';


  if (loading && !portfolio) {
    return (
      <div className="min-h-screen bg-rh-light-bg dark:bg-rh-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-rh-green border-t-transparent mx-auto mb-4"></div>
          <p className="text-rh-light-muted dark:text-rh-muted">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="min-h-screen bg-rh-light-bg dark:bg-rh-black flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-rh-red text-6xl mb-4">!</div>
          <h1 className="text-xl font-semibold text-rh-light-text dark:text-rh-text mb-2">Connection Error</h1>
          <p className="text-rh-light-muted dark:text-rh-muted mb-4">{error}</p>
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
    <div className="min-h-screen bg-rh-light-bg dark:bg-rh-black text-rh-light-text dark:text-rh-text">
      <header className="border-b border-rh-light-border dark:border-rh-border bg-rh-light-card dark:bg-rh-black">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Stock Portfolio</h1>
            {portfolio?.session && (
              <span
                className={`text-xs px-2 py-1 rounded border font-medium ${getSessionDisplay(portfolio.session).color}`}
                title={getSessionDisplay(portfolio.session).description}
              >
                {getSessionDisplay(portfolio.session).label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors
                bg-gray-100 dark:bg-rh-dark hover:bg-gray-200 dark:hover:bg-rh-border
                text-rh-light-muted dark:text-rh-muted"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            {/* Extended Hours Toggle - only show during extended hours sessions */}
            {isExtendedHours && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showExtendedHours}
                  onChange={toggleExtendedHours}
                  className="w-4 h-4 rounded border-rh-border dark:border-rh-border bg-rh-dark dark:bg-rh-dark text-rh-green focus:ring-rh-green focus:ring-offset-0"
                />
                <span className="text-xs text-rh-muted dark:text-rh-muted">Extended hours</span>
              </label>
            )}
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
              <span className="text-sm text-rh-light-muted dark:text-rh-muted">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Portfolio Tab */}
        {activeTab === 'portfolio' && (
          <>
            {/* Stale Data Banner - only show if quotes are completely unavailable */}
            {portfolio && (portfolio.quotesUnavailableCount ?? 0) > 0 && (
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
                <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4 shadow-sm dark:shadow-none">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm">Total Assets</p>
                  <p className="text-2xl font-bold text-rh-light-text dark:text-rh-text">
                    {portfolio.totalAssets > 0 ? formatCurrency(portfolio.totalAssets) : '—'}
                  </p>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">Holdings + Cash</p>
                </div>
                {/* 2. Net Equity - shows balance after margin debt */}
                <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4 shadow-sm dark:shadow-none">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm">Net Equity</p>
                  <p className="text-2xl font-bold text-rh-light-text dark:text-rh-text">
                    {formatCurrency(portfolio.netEquity)}
                  </p>
                  {portfolio.marginDebt > 0 ? (
                    <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
                      After ${portfolio.marginDebt.toLocaleString()} margin
                    </p>
                  ) : (
                    <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">Cash: {formatCurrency(portfolio.cashBalance)}</p>
                  )}
                </div>
                {/* 3. Day Change */}
                <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4 shadow-sm dark:shadow-none">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm">Day Change</p>
                  <p className={`text-2xl font-bold ${
                    portfolio.dayChange === 0 ? 'text-rh-light-text dark:text-rh-text' : portfolio.dayChange > 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {portfolio.holdings.length > 0
                      ? `${formatCurrency(portfolio.dayChange)} (${formatPercent(portfolio.dayChangePercent)})`
                      : '—'}
                  </p>
                </div>
                {/* 4. Total P/L */}
                <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4 shadow-sm dark:shadow-none">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm">Total P/L</p>
                  <p className={`text-2xl font-bold ${
                    portfolio.totalPL === 0 ? 'text-rh-light-text dark:text-rh-text' : portfolio.totalPL > 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {portfolio.holdings.length > 0
                      ? `${formatCurrency(portfolio.totalPL)} (${formatPercent(portfolio.totalPLPercent)})`
                      : '—'}
                  </p>
                </div>
              </div>
            )}

            {/* 2. Add/Update Holding Form */}
            <HoldingForm
              onUpdate={handleUpdate}
              heldTickers={portfolio?.holdings.map(h => h.ticker) ?? []}
            />

            {/* 3. Performance Summary Cards (Current Holdings P/L + Since Tracking Start) */}
            <PerformanceSummary refreshTrigger={summaryRefreshTrigger} />

            {/* 4. Cash Balance & Margin Debt */}
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

            {/* 5. Holdings Table */}
            <HoldingsTable
              holdings={portfolio?.holdings ?? []}
              onUpdate={handleUpdate}
              showExtendedHours={showExtendedHours}
            />

            {/* 6. Portfolio Projections (last section) */}
            <Projections
              currentValue={portfolio?.netEquity ?? 0}
              refreshTrigger={portfolioRefreshCount}
              session={portfolio?.session}
            />
          </>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && <InsightsPage />}

        {/* Leaderboard Tab */}
        {activeTab === 'leaderboard' && <LeaderboardPage />}
      </main>
    </div>
  );
}
