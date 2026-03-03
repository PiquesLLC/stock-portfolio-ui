import { useState, useEffect, useCallback, useRef } from 'react';
import { Portfolio, Settings } from '../types';
import { getPortfolio, getSettings, getHealthStatus, HealthStatus } from '../api';
import { REFRESH_INTERVAL } from '../config';

interface UsePortfolioDataParams {
  currentUserId: string;
  authLoading: boolean;
}

export function usePortfolioData({ currentUserId, authLoading }: UsePortfolioDataParams) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [summaryRefreshTrigger, setSummaryRefreshTrigger] = useState(0);
  const [portfolioRefreshCount, setPortfolioRefreshCount] = useState(0);

  const lastValidPortfolio = useRef<Portfolio | null>(null);
  const hasPortfolioRef = useRef(false);
  const lastTotalAssets = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentUserId || authLoading) return;
    try {
      const portfolioData = await getPortfolio();
      const settingsData = await getSettings();

      const hasValidData = portfolioData.holdings.length === 0 ||
        portfolioData.holdings.some(h => !h.priceUnavailable && h.currentPrice > 0);

      const holdingsChanged = !lastValidPortfolio.current ||
        portfolioData.holdings.length !== lastValidPortfolio.current.holdings.length ||
        portfolioData.holdings.some(h => !lastValidPortfolio.current!.holdings.find(old => old.ticker === h.ticker));

      if (!hasValidData && lastValidPortfolio.current && !holdingsChanged) {
        setPortfolio({
          ...lastValidPortfolio.current,
          cashBalance: portfolioData.cashBalance,
          marginDebt: portfolioData.marginDebt,
          netEquity: lastValidPortfolio.current.totalAssets - portfolioData.marginDebt,
        });
        setSettings(settingsData);
        setIsStale(true);
        return;
      }

      setPortfolio(portfolioData);
      hasPortfolioRef.current = true;
      setSettings(settingsData);
      setError('');
      setLastUpdate(new Date());

      const newTotalAssets = Math.round(portfolioData.totalAssets * 100) / 100;
      if (lastTotalAssets.current === null || newTotalAssets !== lastTotalAssets.current) {
        lastTotalAssets.current = newTotalAssets;
        setPortfolioRefreshCount((c) => c + 1);
      }

      const dataIsRepricing = portfolioData.quotesMeta?.anyRepricing ||
        portfolioData.quotesStale ||
        (portfolioData.quotesUnavailableCount && portfolioData.quotesUnavailableCount > 0);
      setIsStale(!!dataIsRepricing);

      if (hasValidData) {
        lastValidPortfolio.current = portfolioData;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      if (hasPortfolioRef.current) {
        setIsStale(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [currentUserId, authLoading]);

  // Adaptive polling: 5s during regular hours, 15s during extended/closed
  // Prevents after-hours oscillation from cache TTL mismatches across providers
  const sessionRef = useRef(portfolio?.session);
  sessionRef.current = portfolio?.session;

  useEffect(() => {
    if (!currentUserId || authLoading) return;
    fetchData();
    const getInterval = () => {
      const s = sessionRef.current;
      return (s === 'PRE' || s === 'POST' || s === 'CLOSED') ? 15_000 : REFRESH_INTERVAL;
    };
    // Use dynamic interval via chained setTimeout instead of fixed setInterval
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { fetchData(); timer = setTimeout(tick, getInterval()); };
    timer = setTimeout(tick, getInterval());
    return () => clearTimeout(timer);
  }, [fetchData, currentUserId, authLoading]);

  // Fetch provider health status periodically
  useEffect(() => {
    const fetchHealth = () => getHealthStatus().then(setHealthStatus).catch(e => console.error('Health status fetch failed:', e));
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdate = useCallback(() => {
    fetchData();
    setSummaryRefreshTrigger((t) => t + 1);
  }, [fetchData]);

  return {
    portfolio,
    loading,
    error,
    lastUpdate,
    isStale,
    healthStatus,
    summaryRefreshTrigger,
    portfolioRefreshCount,
    fetchData,
    handleUpdate,
  };
}
