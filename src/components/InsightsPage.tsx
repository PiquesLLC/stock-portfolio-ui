import { useState, useEffect, useCallback, useRef } from 'react';
import { HealthScore as HealthScoreType, Attribution as AttributionType, LeakDetectorResult, RiskForecast as RiskForecastType, PortfolioIntelligenceResponse } from '../types';
import { getHealthScore, getAttribution, getLeakDetector, getRiskForecast, getPortfolioIntelligence } from '../api';
import { HealthScore } from './HealthScore';
import { Attribution } from './Attribution';
import { LeakDetector } from './LeakDetector';
import { RiskForecast } from './RiskForecast';
import { PortfolioIntelligence } from './PortfolioIntelligence';
import { ProjectionsAndGoals } from './ProjectionsAndGoals';
import { SkeletonCard } from './SkeletonCard';
import { MarketSession } from '../types';

type InsightsSubTab = 'intelligence' | 'projections-goals';

// Cache for insights data - persists across component mounts
const insightsCache: {
  healthScore: HealthScoreType | null;
  attribution: AttributionType | null;
  leakDetector: LeakDetectorResult | null;
  riskForecast: RiskForecastType | null;
  intelligence: PortfolioIntelligenceResponse | null;
  lastFetchTime: number | null;
} = {
  healthScore: null,
  attribution: null,
  leakDetector: null,
  riskForecast: null,
  intelligence: null,
  lastFetchTime: null,
};

// Cache TTL: 5 minutes before considering stale
const CACHE_TTL_MS = 5 * 60 * 1000;

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

interface InsightsPageProps {
  onTickerClick?: (ticker: string) => void;
  currentValue: number;
  refreshTrigger?: number;
  session?: MarketSession;
}

export function InsightsPage({ onTickerClick, currentValue, refreshTrigger, session }: InsightsPageProps) {
  const [subTab, setSubTab] = useState<InsightsSubTab>('intelligence');

  // Initialize state from cache
  const [healthScore, setHealthScore] = useState<HealthScoreType | null>(insightsCache.healthScore);
  const [attribution, setAttribution] = useState<AttributionType | null>(insightsCache.attribution);
  const [leakDetector, setLeakDetector] = useState<LeakDetectorResult | null>(insightsCache.leakDetector);
  const [riskForecast, setRiskForecast] = useState<RiskForecastType | null>(insightsCache.riskForecast);
  const [intelligence, setIntelligence] = useState<PortfolioIntelligenceResponse | null>(insightsCache.intelligence);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(insightsCache.lastFetchTime !== null);

  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);

  // Update cache when state changes
  useEffect(() => {
    insightsCache.healthScore = healthScore;
  }, [healthScore]);

  useEffect(() => {
    insightsCache.attribution = attribution;
  }, [attribution]);

  useEffect(() => {
    insightsCache.leakDetector = leakDetector;
  }, [leakDetector]);

  useEffect(() => {
    insightsCache.riskForecast = riskForecast;
  }, [riskForecast]);

  useEffect(() => {
    insightsCache.intelligence = intelligence;
  }, [intelligence]);

  const fetchInsights = useCallback(async (silent: boolean = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      // Fetch each insight independently - errors in one don't block others
      const fetchPromises = [
        getHealthScore()
          .then(data => { if (mountedRef.current) setHealthScore(data); })
          .catch(e => console.error('Health score error:', e)),
        getAttribution('1d')
          .then(data => { if (mountedRef.current) setAttribution(data); })
          .catch(e => console.error('Attribution error:', e)),
        getLeakDetector()
          .then(data => { if (mountedRef.current) setLeakDetector(data); })
          .catch(e => console.error('Leak detector error:', e)),
        getRiskForecast()
          .then(data => { if (mountedRef.current) setRiskForecast(data); })
          .catch(e => console.error('Risk forecast error:', e)),
        getPortfolioIntelligence('1d')
          .then(data => { if (mountedRef.current) setIntelligence(data); })
          .catch(e => console.error('Intelligence error:', e)),
      ];

      await Promise.allSettled(fetchPromises);

      insightsCache.lastFetchTime = Date.now();
      if (mountedRef.current) {
        setInitialLoadComplete(true);
      }
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, []);

  // Fetch on mount only if cache is stale or empty
  useEffect(() => {
    mountedRef.current = true;

    const cacheAge = insightsCache.lastFetchTime
      ? Date.now() - insightsCache.lastFetchTime
      : Infinity;

    const cacheIsStale = cacheAge > CACHE_TTL_MS;
    const hasNoData = !insightsCache.healthScore && !insightsCache.attribution &&
      !insightsCache.leakDetector && !insightsCache.riskForecast && !insightsCache.intelligence;

    if (hasNoData) {
      // No data at all - do a visible fetch
      fetchInsights(false);
    } else if (cacheIsStale) {
      // Have data but it's stale - do a silent background refresh
      fetchInsights(true);
    }
    // If cache is fresh, don't fetch at all

    return () => {
      mountedRef.current = false;
    };
  }, [fetchInsights]);

  const handleRefresh = () => {
    fetchInsights(false);
  };

  const handleRiskForecastRefresh = async () => {
    try {
      const data = await getRiskForecast();
      if (mountedRef.current) {
        setRiskForecast(data);
        insightsCache.riskForecast = data;
      }
    } catch (e) {
      console.error('Risk forecast refresh error:', e);
    }
  };

  // Check if we have any data to show
  const hasAnyData = healthScore || attribution || leakDetector || riskForecast || intelligence;

  const subTabs: { id: InsightsSubTab; label: string }[] = [
    { id: 'intelligence', label: 'Intelligence' },
    { id: 'projections-goals', label: 'Projections & Goals' },
  ];

  // Projections & Goals subtab
  if (subTab === 'projections-goals') {
    return (
      <div className="space-y-6">
        <div className="flex gap-1 bg-rh-light-bg dark:bg-rh-dark rounded-lg p-1 w-fit">
          {subTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-4 py-1 text-xs font-medium rounded-md transition-colors
                ${subTab === t.id
                  ? 'bg-rh-light-card dark:bg-rh-card text-rh-green shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ProjectionsAndGoals
          currentValue={currentValue}
          refreshTrigger={refreshTrigger}
          session={session}
        />
      </div>
    );
  }

  // Show initial loading only if we have no cached data at all
  if (!initialLoadComplete && !hasAnyData) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={4} height="180px" />
        <SkeletonCard lines={5} height="220px" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard lines={3} height="160px" />
          <SkeletonCard lines={3} height="160px" />
        </div>
        <SkeletonCard lines={4} height="200px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: sub-tabs left, refresh + timestamp right */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-rh-light-bg dark:bg-rh-dark rounded-lg p-1">
          {subTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-4 py-1 text-xs font-medium rounded-md transition-colors
                ${subTab === t.id
                  ? 'bg-rh-light-card dark:bg-rh-card text-rh-green shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {insightsCache.lastFetchTime && (
            <span className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 tabular-nums min-w-[90px] text-right">
              Updated {formatTimeAgo(insightsCache.lastFetchTime)}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text
              hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors disabled:opacity-50"
            title="Refresh insights"
          >
            <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Health Score - Always show if we have data */}
      {healthScore && <HealthScore data={healthScore} />}

      {/* Portfolio Intelligence */}
      {intelligence ? (
        <PortfolioIntelligence initialData={intelligence} onTickerClick={onTickerClick} />
      ) : (
        <SkeletonCard lines={5} height="220px" />
      )}

      {/* Attribution and Leak Detector - Side by Side - Always show both */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {attribution ? (
          <Attribution initialData={attribution} onTickerClick={onTickerClick} />
        ) : (
          <SkeletonCard lines={3} height="160px" />
        )}
        {leakDetector ? (
          <LeakDetector data={leakDetector} />
        ) : (
          <SkeletonCard lines={3} height="160px" />
        )}
      </div>

      {/* Risk Forecast - Always show */}
      {riskForecast ? (
        <RiskForecast
          data={riskForecast}
          onRefresh={handleRiskForecastRefresh}
          isRefreshing={false}
        />
      ) : (
        <SkeletonCard lines={4} height="200px" />
      )}


      {/* Empty State - Only show if no holdings */}
      {!hasAnyData && initialLoadComplete && (
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-rh-light-text dark:text-rh-text font-medium mb-2">No insights available</p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">
            Add some holdings to your portfolio to see analytics.
          </p>
        </div>
      )}
    </div>
  );
}
