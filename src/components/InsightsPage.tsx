import { useState, useEffect, useCallback, useRef } from 'react';
import { HealthScore as HealthScoreType, PortfolioIntelligenceResponse, Holding } from '../types';
import { getHealthScore, getPortfolioIntelligence, getPortfolio } from '../api';
import { HealthScore } from './HealthScore';
import { PortfolioIntelligence } from './PortfolioIntelligence';
import { ProjectionsAndGoals } from './ProjectionsAndGoals';
import { IncomeInsights } from './IncomeInsights';
import PortfolioBriefing from './PortfolioBriefing';
import BehaviorInsights from './BehaviorInsights';
import EventsCalendar from './EventsCalendar';
import { AllocationDonut } from './AllocationDonut';
import { WhatIfSimulator } from './WhatIfSimulator';
import { SkeletonCard } from './SkeletonCard';
import { MarketSession } from '../types';

type InsightsSubTab = 'intelligence' | 'income' | 'projections-goals' | 'ai-briefing' | 'ai-behavior' | 'allocation' | 'what-if';

const PRIMARY_COUNT_MOBILE = 3;

function InsightsTabBar({ tabs, activeTab, onTabChange }: {
  tabs: { id: InsightsSubTab; label: string }[];
  activeTab: InsightsSubTab;
  onTabChange: (id: InsightsSubTab) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const mobilePrimary = tabs.slice(0, PRIMARY_COUNT_MOBILE);
  const mobileSecondary = tabs.slice(PRIMARY_COUNT_MOBILE);
  const activeMobileSecondary = mobileSecondary.find((t) => t.id === activeTab);

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

      {/* Mobile: fewer primary tabs + More dropdown */}
      <div className="flex md:hidden gap-1 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-1">
        {mobilePrimary.map((t) => (
          <button key={t.id} onClick={() => { onTabChange(t.id); setMoreOpen(false); }} className={btnClass(activeTab === t.id)}>
            {t.label}
          </button>
        ))}
        {mobileSecondary.length > 0 && (
          <div className="relative shrink-0" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={btnClass(!!activeMobileSecondary)}
            >
              {activeMobileSecondary ? activeMobileSecondary.label : 'More'}
              <svg className="w-3 h-3 ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={moreOpen ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute top-full right-0 mt-1 z-30 min-w-[120px] sm:min-w-[140px] rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1a] shadow-lg py-1">
                {mobileSecondary.map((t) => (
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
  intelligence: PortfolioIntelligenceResponse | null;
  lastFetchTime: number | null;
} = {
  healthScore: null,
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

const VALID_SUBTABS = new Set<InsightsSubTab>(['intelligence', 'income', 'projections-goals', 'ai-briefing', 'ai-behavior', 'allocation', 'what-if']);

function EventsSection({ holdings }: { holdings: Holding[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-100/60 dark:hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Events</span>
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">Earnings &amp; Dividends</span>
        </div>
        <svg
          className={`w-4 h-4 text-rh-light-muted dark:text-rh-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-5 pb-5">
          <EventsCalendar holdings={holdings} />
        </div>
      )}
    </div>
  );
}

interface InsightsPageProps {
  onTickerClick?: (ticker: string) => void;
  currentValue: number;
  refreshTrigger?: number;
  session?: MarketSession;
  cashBalance?: number;
  totalAssets?: number;
  marginDebt?: number;
  initialSubTab?: string | null;
  onSubTabChange?: (subtab: string) => void;
}

export function InsightsPage({ onTickerClick, currentValue, refreshTrigger, session, cashBalance = 0, totalAssets = 0, marginDebt = 0, initialSubTab, onSubTabChange }: InsightsPageProps) {
  const [subTab, setSubTabLocal] = useState<InsightsSubTab>(
    () => (initialSubTab && VALID_SUBTABS.has(initialSubTab as InsightsSubTab)) ? initialSubTab as InsightsSubTab : 'intelligence'
  );

  const setSubTab = useCallback((tab: InsightsSubTab) => {
    setSubTabLocal(tab);
    onSubTabChange?.(tab);
  }, [onSubTabChange]);

  // Initialize state from cache
  const [healthScore, setHealthScore] = useState<HealthScoreType | null>(insightsCache.healthScore);
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
    const hasNoData = !insightsCache.healthScore && !insightsCache.intelligence;

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

  // Fetch holdings on mount (needed for Events on Intelligence tab + Allocation tab)
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
  const hasAnyData = healthScore || intelligence;

  const subTabs: { id: InsightsSubTab; label: string }[] = [
    // Primary
    { id: 'intelligence', label: 'Intelligence' },
    { id: 'ai-briefing', label: 'AI Briefing' },
    { id: 'allocation', label: 'Allocation' },
    { id: 'what-if', label: 'Scenarios' },
    { id: 'ai-behavior', label: 'Behavior' },
    // Secondary
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
        <BehaviorInsights onTickerClick={onTickerClick} portfolioTickers={holdings.map(h => h.ticker)} />
      </div>
    );
  }

  // Income subtab
  if (subTab === 'income') {
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <IncomeInsights refreshTrigger={refreshTrigger} onTickerClick={onTickerClick} />
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

  // Allocation subtab — donut chart
  if (subTab === 'allocation') {
    const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
    return (
      <div className="space-y-6">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <AllocationDonut
          holdings={holdings}
          totalValue={totalValue}
          onTickerClick={onTickerClick}
        />
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
          marginDebt={marginDebt}
          onTickerClick={onTickerClick}
        />
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
    <div className="space-y-4">
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

      {/* Portfolio Intelligence (includes Attribution Pulse) */}
      {intelligence ? (
        <PortfolioIntelligence initialData={intelligence} onTickerClick={onTickerClick} session={session} />
      ) : (
        <SkeletonCard lines={5} height="220px" />
      )}

      {/* Health Score */}
      {healthScore && <HealthScore data={healthScore} />}

      {/* Events Timeline — collapsible */}
      {holdings.length > 0 && (
        <EventsSection holdings={holdings} />
      )}

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
