import { useState, useEffect, useCallback, useRef } from 'react';
import { HealthScore as HealthScoreType, Attribution as AttributionType, LeakDetectorResult, PortfolioIntelligenceResponse, Holding } from '../types';
import { getHealthScore, getAttribution, getLeakDetector, getPortfolioIntelligence, getPortfolio } from '../api';
import { HealthScore } from './HealthScore';
import { Attribution } from './Attribution';
import { PortfolioIntelligence } from './PortfolioIntelligence';
import { ProjectionsAndGoals } from './ProjectionsAndGoals';
import { IncomeInsights } from './IncomeInsights';
import PortfolioBriefing from './PortfolioBriefing';
import BehaviorInsights from './BehaviorInsights';
import EventsCalendar from './EventsCalendar';
import CorrelationHeatmap from './CorrelationHeatmap';
import { AllocationDonut } from './AllocationDonut';
import { WhatIfSimulator } from './WhatIfSimulator';
import { LeakDetector } from './LeakDetector';
import { SkeletonCard } from './SkeletonCard';
import { MarketSession } from '../types';

type InsightsSubTab = 'intelligence' | 'income' | 'projections-goals' | 'ai-briefing' | 'ai-behavior' | 'events' | 'allocation' | 'what-if';

const PRIMARY_COUNT = 5; // core tabs always visible

function InsightsTabBar({ tabs, activeTab, onTabChange }: {
  tabs: { id: InsightsSubTab; label: string }[];
  activeTab: InsightsSubTab;
  onTabChange: (id: InsightsSubTab) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const primaryTabs = tabs.slice(0, PRIMARY_COUNT);
  const secondaryTabs = tabs.slice(PRIMARY_COUNT);
  const activeSecondary = secondaryTabs.find((t) => t.id === activeTab);

  // Close dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  const btnClass = (active: boolean) =>
    `px-4 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
      active
        ? 'bg-rh-light-card dark:bg-rh-card text-rh-green shadow-sm'
        : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
    }`;

  return (
    <>
      {/* Desktop: all tabs in one row */}
      <div className="hidden md:flex gap-1 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => onTabChange(t.id)} className={btnClass(activeTab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Mobile: primary tabs + More dropdown */}
      <div className="flex md:hidden gap-1 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-1 overflow-x-auto">
        {primaryTabs.map((t) => (
          <button key={t.id} onClick={() => { onTabChange(t.id); setMoreOpen(false); }} className={btnClass(activeTab === t.id)}>
            {t.label}
          </button>
        ))}
        {secondaryTabs.length > 0 && (
          <div className="relative shrink-0" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={btnClass(!!activeSecondary)}
            >
              {activeSecondary ? activeSecondary.label : 'More'}
              <svg className="w-3 h-3 ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={moreOpen ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute top-full right-0 mt-1 z-30 min-w-[120px] sm:min-w-[140px] rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1a] shadow-lg py-1">
                {secondaryTabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { onTabChange(t.id); setMoreOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                      activeTab === t.id
                        ? 'text-rh-green font-medium bg-gray-50 dark:bg-white/[0.04]'
                        : 'text-rh-light-text dark:text-rh-text hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Cache for insights data - persists across component mounts
const insightsCache: {
  healthScore: HealthScoreType | null;
  attribution: AttributionType | null;
  leakDetector: LeakDetectorResult | null;
  intelligence: PortfolioIntelligenceResponse | null;
  lastFetchTime: number | null;
} = {
  healthScore: null,
  attribution: null,
  leakDetector: null,
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

const VALID_SUBTABS = new Set<InsightsSubTab>(['intelligence', 'income', 'projections-goals', 'ai-briefing', 'ai-behavior', 'events', 'allocation', 'what-if']);

interface InsightsPageProps {
  onTickerClick?: (ticker: string) => void;
  currentValue: number;
  refreshTrigger?: number;
  session?: MarketSession;
  cashBalance?: number;
  totalAssets?: number;
  initialSubTab?: string | null;
  onSubTabChange?: (subtab: string) => void;
}

export function InsightsPage({ onTickerClick, currentValue, refreshTrigger, session, cashBalance = 0, totalAssets = 0, initialSubTab, onSubTabChange }: InsightsPageProps) {
  const [subTab, setSubTabLocal] = useState<InsightsSubTab>(
    () => (initialSubTab && VALID_SUBTABS.has(initialSubTab as InsightsSubTab)) ? initialSubTab as InsightsSubTab : 'intelligence'
  );

  const setSubTab = useCallback((tab: InsightsSubTab) => {
    setSubTabLocal(tab);
    onSubTabChange?.(tab);
  }, [onSubTabChange]);

  // Initialize state from cache
  const [healthScore, setHealthScore] = useState<HealthScoreType | null>(insightsCache.healthScore);
  const [attribution, setAttribution] = useState<AttributionType | null>(insightsCache.attribution);
  const [leakDetector, setLeakDetector] = useState<LeakDetectorResult | null>(insightsCache.leakDetector);
  const [intelligence, setIntelligence] = useState<PortfolioIntelligenceResponse | null>(insightsCache.intelligence);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(insightsCache.lastFetchTime !== null);
  const [holdings, setHoldings] = useState<Holding[]>([]);

  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);
  const holdingsFetchedRef = useRef(false);

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
      !insightsCache.leakDetector && !insightsCache.intelligence;

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

  // Fetch holdings on mount (needed for allocation donut on Intelligence tab + Events/Allocation tabs)
  useEffect(() => {
    if (!holdingsFetchedRef.current) {
      holdingsFetchedRef.current = true;
      getPortfolio()
        .then((p) => {
          if (mountedRef.current) setHoldings(p.holdings);
        })
        .catch((e) => console.error('Failed to fetch holdings:', e));
    }
  }, []);

  // Check if we have any data to show
  const hasAnyData = healthScore || attribution || leakDetector || intelligence;

  const subTabs: { id: InsightsSubTab; label: string }[] = [
    // Primary — core cockpit instruments
    { id: 'intelligence', label: 'Intelligence' },
    { id: 'ai-briefing', label: 'AI Briefing' },
    { id: 'allocation', label: 'Allocation' },
    { id: 'events', label: 'Events' },
    { id: 'what-if', label: 'Scenarios' },
    // Secondary — powerful but not universal
    { id: 'ai-behavior', label: 'Behavior' },
    { id: 'income', label: 'Income' },
    { id: 'projections-goals', label: 'Goals' },
  ];

  // AI Briefing subtab
  if (subTab === 'ai-briefing') {
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <PortfolioBriefing />
      </div>
    );
  }

  // Behavior Coach subtab
  if (subTab === 'ai-behavior') {
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <BehaviorInsights />
      </div>
    );
  }

  // Income subtab
  if (subTab === 'income') {
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <IncomeInsights refreshTrigger={refreshTrigger} />
      </div>
    );
  }

  // Projections & Goals subtab
  if (subTab === 'projections-goals') {
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <ProjectionsAndGoals
          currentValue={currentValue}
          refreshTrigger={refreshTrigger}
          session={session}
        />
      </div>
    );
  }

  // Events subtab
  if (subTab === 'events') {
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <EventsCalendar holdings={holdings} />
      </div>
    );
  }

  // What-If Simulator subtab
  if (subTab === 'what-if') {
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <WhatIfSimulator
          holdings={holdings}
          cashBalance={cashBalance}
          totalValue={totalAssets}
        />
      </div>
    );
  }

  // Allocation subtab — donut chart + correlation heatmap
  if (subTab === 'allocation') {
    const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AllocationDonut
            holdings={holdings}
            totalValue={totalValue}
          />
          <CorrelationHeatmap holdings={holdings} />
        </div>
      </div>
    );
  }

  // Show initial loading only if we have no cached data at all
  if (!initialLoadComplete && !hasAnyData) {
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <SkeletonCard lines={4} height="180px" />
        <SkeletonCard lines={5} height="220px" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard lines={3} height="160px" />
          <SkeletonCard lines={3} height="160px" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: sub-tabs left, refresh + timestamp right */}
      <div className="flex items-center justify-between">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
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

      {/* Attribution and Allocation Donut - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {attribution ? (
          <Attribution initialData={attribution} onTickerClick={onTickerClick} />
        ) : (
          <SkeletonCard lines={3} height="160px" />
        )}
        <AllocationDonut
          holdings={holdings}
          totalValue={holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0)}
          onTickerClick={onTickerClick}
        />
      </div>

      {/* Correlation / Leak Detector */}
      {leakDetector && <LeakDetector data={leakDetector} />}

      {/* Empty State - Only show if no holdings */}
      {!hasAnyData && initialLoadComplete && (
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-12 text-center">
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
