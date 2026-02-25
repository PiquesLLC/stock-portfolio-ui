import { useState, useEffect, useCallback, useRef } from 'react';
import { HealthScore as HealthScoreType, PortfolioIntelligenceResponse, Holding } from '../types';
import { getHealthScore, getPortfolioIntelligence, getPortfolio } from '../api';
import { HealthScore } from './HealthScore';
import { PortfolioIntelligence } from './PortfolioIntelligence';
import { ProjectionsAndGoals } from './ProjectionsAndGoals';
import { IncomeInsights } from './IncomeInsights';
// Premium-gated: import PortfolioBriefing from './PortfolioBriefing';
// Premium-gated: import BehaviorInsights from './BehaviorInsights';
import { AllocationDonut } from './AllocationDonut';
import { WhatIfSimulator } from './WhatIfSimulator';
import { EarningsTab } from './EarningsTab';
import { SkeletonCard } from './SkeletonCard';
import { PremiumOverlay } from './PremiumOverlay';
import { ETFOverlap } from './ETFOverlap';
import { TaxHarvest } from './TaxHarvest';
import { MarketSession } from '../types';

type InsightsSubTab = 'intelligence' | 'income' | 'projections-goals' | 'ai-briefing' | 'ai-behavior' | 'allocation' | 'what-if' | 'earnings' | 'etf-overlap' | 'tax-harvest';

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

const VALID_SUBTABS = new Set<InsightsSubTab>(['intelligence', 'income', 'projections-goals', 'ai-briefing', 'ai-behavior', 'allocation', 'what-if', 'earnings', 'etf-overlap', 'tax-harvest']);

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

  const fetchInsights = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

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

      // Only mark cache as fresh if both data sources loaded — prevents
      // caching a partial success that skips retrying the failed source
      if (insightsCache.healthScore && insightsCache.intelligence) {
        insightsCache.lastFetchTime = Date.now();
      }
      if (mountedRef.current) {
        setInitialLoadComplete(true);
      }
    } finally {
      fetchingRef.current = false;
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
      fetchInsights();
    } else if (cacheIsStale) {
      fetchInsights();
    }
    // If cache is fresh, don't fetch at all

    return () => {
      mountedRef.current = false;
    };
  }, [fetchInsights]);

  // Fetch holdings on mount (needed for Allocation + What-If tabs)
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
    { id: 'earnings', label: 'Earnings' },
    { id: 'what-if', label: 'Scenarios' },
    { id: 'ai-behavior', label: 'Behavior' },
    // Secondary
    { id: 'allocation', label: 'Allocation' },
    { id: 'income', label: 'Income' },
    { id: 'projections-goals', label: 'Goals' },
    { id: 'etf-overlap', label: 'ETF Overlap' },
    { id: 'tax-harvest', label: 'Tax Harvest' },
  ];

  // AI Briefing subtab (Premium)
  if (subTab === 'ai-briefing') {
    return (
      <div className="space-y-3">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <PremiumOverlay
          featureName="AI Portfolio Briefing"
          description="Weekly AI-generated briefing analyzing your portfolio's performance, market conditions, and actionable insights tailored to your holdings."
        />
      </div>
    );
  }

  // Earnings subtab
  if (subTab === 'earnings') {
    return (
      <div className="space-y-3">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <EarningsTab holdings={holdings} onTickerClick={onTickerClick} />
      </div>
    );
  }

  // Behavior Coach subtab (Premium)
  if (subTab === 'ai-behavior') {
    return (
      <div className="space-y-3">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <PremiumOverlay
          featureName="AI Behavior Coach"
          description="Personalized behavioral analysis of your trading patterns. Get scored on discipline, diversification, and risk management with actionable coaching tips."
        />
      </div>
    );
  }

  // Income subtab
  if (subTab === 'income') {
    return (
      <div className="space-y-3">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <IncomeInsights refreshTrigger={refreshTrigger} onTickerClick={onTickerClick} />
      </div>
    );
  }

  // Projections & Goals subtab
  if (subTab === 'projections-goals') {
    return (
      <div className="space-y-3">
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
      <div className="space-y-3">
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
      <div className="space-y-3">
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

  // ETF Overlap subtab
  if (subTab === 'etf-overlap') {
    return (
      <div className="space-y-3">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <ETFOverlap onTickerClick={onTickerClick} />
      </div>
    );
  }

  // Tax-Loss Harvesting subtab
  if (subTab === 'tax-harvest') {
    return (
      <div className="space-y-3">
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <TaxHarvest onTickerClick={onTickerClick} />
      </div>
    );
  }

  // Show initial loading only if we have no cached data at all
  if (!initialLoadComplete && !hasAnyData) {
    return (
      <div className="space-y-3">
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
    <div className="space-y-3">
      {/* Sub-tabs */}
      <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />

      {/* Portfolio Intelligence (includes Attribution Pulse) */}
      {intelligence ? (
        <PortfolioIntelligence initialData={intelligence} onTickerClick={onTickerClick} session={session} />
      ) : (
        <SkeletonCard lines={5} height="220px" />
      )}

      {/* Health Score */}
      {healthScore && <HealthScore data={healthScore} />}

      {/* Empty State - Only show if no holdings */}
      {!hasAnyData && initialLoadComplete && (
        <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-12 text-center">
          <svg className="w-14 h-14 mx-auto mb-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
