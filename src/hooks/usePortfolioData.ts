import { useState, useEffect, useCallback, useRef } from 'react';
import { Portfolio, Settings } from '../types';
import { getPortfolio, getSettings, getHealthStatus, HealthStatus } from '../api';
import { REFRESH_INTERVAL } from '../config';

interface UsePortfolioDataParams {
  currentUserId: string;
  authLoading: boolean;
  portfolioId?: string;
}

export function usePortfolioData({ currentUserId, authLoading, portfolioId }: UsePortfolioDataParams) {
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
  const currentPortfolioIdRef = useRef(portfolioId);
  currentPortfolioIdRef.current = portfolioId;
  // Brownout resilience (2026-07-14 outage): without these, every 5s poll
  // stacked a NEW request on a stalled server (fetch has no default timeout),
  // so one degraded API accumulated dozens of hanging /portfolio calls per
  // open tab — client-side amplification of the exact overload it was
  // polling. Single-flight + a hard request deadline + failure backoff.
  const inFlightRef = useRef(false);
  const inFlightControllerRef = useRef<AbortController | null>(null);
  const consecutiveFailuresRef = useRef(0);

  // Reset portfolio state when the user switches portfolios. Without this,
  // the previous portfolio's holdings/cash/totals remain visible until the
  // new fetch resolves — a "flash of wrong portfolio" UX bug.
  // The `currentPortfolioIdRef` guard at fetchData:37 prevents stale-fetch
  // setState, but the existing state has to be cleared explicitly.
  useEffect(() => {
    setPortfolio(null);
    setIsStale(false);
    setLoading(true);
    setError('');
    lastValidPortfolio.current = null;
    hasPortfolioRef.current = false;
    lastTotalAssets.current = null;
    consecutiveFailuresRef.current = 0;
    // Abort any in-flight fetch for the previous portfolio so the
    // single-flight guard can't delay the new portfolio's first load.
    inFlightControllerRef.current?.abort();
  }, [portfolioId]);

  const fetchData = useCallback(async () => {
    if (!currentUserId || authLoading) return;
    if (inFlightRef.current) return; // single-flight: never stack polls
    inFlightRef.current = true;
    const controller = new AbortController();
    inFlightControllerRef.current = controller;
    // Hard deadline: a degraded server must produce a failure (and backoff),
    // not an indefinitely hanging request.
    const deadline = setTimeout(() => controller.abort(), 20_000);
    const fetchPortfolioId = portfolioId; // capture at call time
    try {
      const portfolioData = await getPortfolio(undefined, portfolioId, controller.signal);
      const settingsData = await getSettings(controller.signal);
      consecutiveFailuresRef.current = 0;

      // Discard stale response if portfolioId changed during fetch
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return;

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
      // Superseded by a portfolio switch (its reset effect aborts us):
      // not a failure of the CURRENT portfolio — discard like the
      // stale-response guard on the success path.
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return;
      consecutiveFailuresRef.current += 1;
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      if (hasPortfolioRef.current) {
        setIsStale(true);
      } else {
        setError(message);
      }
    } finally {
      clearTimeout(deadline);
      inFlightRef.current = false;
      if (inFlightControllerRef.current === controller) inFlightControllerRef.current = null;
      setLoading(false);
    }
  }, [currentUserId, authLoading, portfolioId]);

  // Adaptive polling: 5s during regular hours, 30s extended, 60s closed.
  // Prevents after-hours oscillation from cache TTL mismatches across providers
  const sessionRef = useRef(portfolio?.session);
  sessionRef.current = portfolio?.session;

  useEffect(() => {
    if (!currentUserId || authLoading) return;
    fetchData();
    const getInterval = () => {
      // Failure backoff: while the server is degraded, retry at 10s→20s→40s→
      // capped 60s instead of hammering every 5s. Recovery self-heals: the
      // first successful poll resets the counter (and clears the error state).
      const failures = consecutiveFailuresRef.current;
      if (failures >= 2) {
        return Math.min(60_000, 5_000 * 2 ** (failures - 1));
      }
      const s = sessionRef.current;
      // CLOSED keeps a slow heartbeat rather than stopping: the only thing that
      // updates sessionRef is a poll, so a stopped loop could never observe the
      // CLOSED→PRE/REG transition — values stayed frozen at market open until a
      // manual refresh (and a mount while CLOSED never started polling at all).
      if (s === 'CLOSED') return 60_000;
      if (s === 'PRE' || s === 'POST') return 30_000; // 30s during extended hours
      return REFRESH_INTERVAL; // 5s during market hours
    };
    // Dynamic interval via chained setTimeout — re-evaluated every tick
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      fetchData();
      timer = setTimeout(tick, getInterval());
    };
    timer = setTimeout(tick, getInterval());
    return () => clearTimeout(timer);
  }, [fetchData, currentUserId, authLoading]);

  // Fetch provider health status periodically. Gated on auth like the data
  // effect above — /health/status requires a session, so firing it for a
  // logged-out visitor on the landing page just 401s and logs a spurious
  // "Session expired" error.
  useEffect(() => {
    if (!currentUserId || authLoading) return;
    const fetchHealth = () => getHealthStatus().then(setHealthStatus).catch(e => console.error('Health status fetch failed:', e));
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, [currentUserId, authLoading]);

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
