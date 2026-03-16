import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { HealthScore as HealthScoreType, PortfolioIntelligenceResponse, Holding, PerformanceWindow } from '../types';
import { getHealthScore, getPortfolioIntelligence, getPortfolio, getPerformanceReport } from '../api';
import { HealthScore } from './HealthScore';
import { PortfolioIntelligence } from './PortfolioIntelligence';
import { ProjectionsAndGoals } from './ProjectionsAndGoals';
import { IncomeInsights } from './IncomeInsights';
import PortfolioBriefing from './PortfolioBriefing';
import BehaviorInsights from './BehaviorInsights';
import { AllocationDonut } from './AllocationDonut';
import { WhatIfSimulator } from './WhatIfSimulator';
import { EarningsTab } from './EarningsTab';
import { EarningsPreview } from './EarningsPreview';
import { SkeletonCard } from './SkeletonCard';
import { PremiumOverlay } from './PremiumOverlay';
import { ETFOverlap } from './ETFOverlap';
import { TaxHarvest } from './TaxHarvest';
import { MarketSession } from '../types';
import { useToast } from '../context/ToastContext';
import { clearInsightsCache, INSIGHTS_CACHE_TTL_MS, insightsCache } from '../utils/insights-cache';
import { navigateToPricing } from '../utils/navigate-to-pricing';

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

  const btnClass = useCallback((active: boolean) =>
    `px-4 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
      active
        ? 'bg-rh-light-card dark:bg-rh-card text-rh-green shadow-sm'
        : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
    }`, []);

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

const REPORT_PERIODS: { value: PerformanceWindow; label: string }[] = [
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1Y' },
  { value: 'ALL', label: 'All' },
];

function PerformanceReportCard({ portfolioId }: { portfolioId?: string }) {
  const [period, setPeriod] = useState<PerformanceWindow>('1M');
  const [generating, setGenerating] = useState(false);
  const { showToast } = useToast();

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const isDark = document.documentElement.classList.contains('dark');
      const html = await getPerformanceReport(period, 'SPY', isDark ? 'dark' : 'light', portfolioId);
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showToast('Pop-up blocked — please allow pop-ups for this site', 'error');
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.addEventListener('load', () => { printWindow.print(); });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to generate report';
      if (msg.includes('upgrade_required')) {
        showToast('Elite plan required for performance reports', 'error');
        navigateToPricing();
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setGenerating(false);
    }
  }, [period, showToast, portfolioId]);

  return (
    <PremiumOverlay
      featureName="PDF Performance Reports"
      description="Download beautifully formatted performance reports with sparklines, sector allocation, and benchmark comparison."
      requiredPlan="elite"
    >
      <div className="bg-gray-50/40 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.05] rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Performance Report</h3>
              <p className="text-[11px] text-rh-light-muted dark:text-rh-muted">Download as PDF</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Period pills */}
            <div className="flex gap-0.5 bg-gray-100/60 dark:bg-white/[0.04] rounded-lg p-0.5">
              {REPORT_PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                    period === p.value
                      ? 'bg-white dark:bg-white/[0.1] text-rh-light-text dark:text-rh-text shadow-sm'
                      : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Download button */}
            <button
              onClick={handleDownload}
              disabled={generating}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rh-green text-white hover:bg-rh-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 min-h-[32px]"
            >
              {generating ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </PremiumOverlay>
  );
}

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
  portfolioId?: string;
  onPortfolioChange?: (id: string | undefined) => void;
  portfolios?: Array<{ id: string; name: string }>;
}

export function InsightsPage({ onTickerClick, currentValue, refreshTrigger, session, cashBalance = 0, totalAssets = 0, marginDebt = 0, initialSubTab, onSubTabChange, portfolioId }: InsightsPageProps) {
  const { showToast } = useToast();
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
  const currentPortfolioIdRef = useRef(portfolioId);
  currentPortfolioIdRef.current = portfolioId;

  // Clear cache and reset state when portfolioId changes
  const prevPortfolioIdRef = useRef(portfolioId);
  useEffect(() => {
    if (prevPortfolioIdRef.current !== portfolioId) {
      prevPortfolioIdRef.current = portfolioId;
      clearInsightsCache();
      setHealthScore(null);
      setIntelligence(null);
      setInitialLoadComplete(false);
      setHoldings([]);
      holdingsFetchedRef.current = false;
    }
  }, [portfolioId]);

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
    const fetchPortfolioId = portfolioId; // capture at call time

    try {
      // Fetch each insight independently - errors in one don't block others
      const fetchPromises = [
        getHealthScore(portfolioId)
          .then(data => { if (mountedRef.current && fetchPortfolioId === currentPortfolioIdRef.current) setHealthScore(data); })
          .catch(e => { console.error('Health score error:', e); showToast('Failed to load health score', 'error'); }),
        getPortfolioIntelligence('1d', portfolioId)
          .then(data => { if (mountedRef.current && fetchPortfolioId === currentPortfolioIdRef.current) setIntelligence(data); })
          .catch(e => { console.error('Intelligence error:', e); showToast('Failed to load intelligence', 'error'); }),
      ];

      await Promise.allSettled(fetchPromises);

      // Discard stale response if portfolioId changed during fetch
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return;

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
  }, [showToast, portfolioId]);

  // Fetch on mount only if cache is stale or empty
  useEffect(() => {
    mountedRef.current = true;

    const cacheAge = insightsCache.lastFetchTime
      ? Date.now() - insightsCache.lastFetchTime
      : Infinity;

    const cacheIsStale = cacheAge > INSIGHTS_CACHE_TTL_MS;
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
  }, [fetchInsights, refreshTrigger]);

  // Fetch holdings on mount (needed for Allocation + What-If tabs)
  useEffect(() => {
    holdingsFetchedRef.current = true;
    const fetchPortfolioId = portfolioId; // capture at call time
    getPortfolio(undefined, portfolioId)
      .then((p) => {
        if (mountedRef.current && fetchPortfolioId === currentPortfolioIdRef.current) setHoldings(p.holdings);
      })
      .catch((e) => { console.error('Failed to fetch holdings:', e); showToast('Failed to load holdings', 'error'); });
  }, [showToast, portfolioId]);

  // Check if we have any data to show
  const hasAnyData = healthScore || intelligence;

  const subTabs = useMemo<{ id: InsightsSubTab; label: string }[]>(() => [
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
  ], []);

  // Portfolio picker moved to nav dropdown — no inline picker needed
  const portfolioPicker = null;

  // AI Briefing subtab (Premium)
  if (subTab === 'ai-briefing') {
    return (
      <div className="space-y-3">
        {portfolioPicker}
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <PremiumOverlay
          featureName="AI Portfolio Briefing"
          description="Weekly AI-generated briefing analyzing your portfolio's performance, market conditions, and actionable insights tailored to your holdings."
        >
          <PortfolioBriefing portfolioId={portfolioId} onTickerClick={onTickerClick} />
        </PremiumOverlay>
      </div>
    );
  }

  // Earnings subtab
  if (subTab === 'earnings') {
    return (
      <div className="space-y-3">
        {portfolioPicker}
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <EarningsPreview onTickerClick={onTickerClick} portfolioId={portfolioId} />
        <EarningsTab holdings={holdings} onTickerClick={onTickerClick} portfolioId={portfolioId} />
      </div>
    );
  }

  // Behavior Coach subtab (Premium)
  if (subTab === 'ai-behavior') {
    return (
      <div className="space-y-3">
        {portfolioPicker}
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <PremiumOverlay
          featureName="AI Behavior Coach"
          description="Personalized behavioral analysis of your trading patterns. Get scored on discipline, diversification, and risk management with actionable coaching tips."
        >
          <BehaviorInsights onTickerClick={onTickerClick} portfolioTickers={holdings.map(h => h.ticker)} portfolioId={portfolioId} />
        </PremiumOverlay>
      </div>
    );
  }

  // Income subtab
  if (subTab === 'income') {
    return (
      <div className="space-y-3">
        {portfolioPicker}
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <IncomeInsights refreshTrigger={refreshTrigger} onTickerClick={onTickerClick} portfolioId={portfolioId} />
      </div>
    );
  }

  // Projections & Goals subtab
  if (subTab === 'projections-goals') {
    return (
      <div className="space-y-3">
        {portfolioPicker}
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <ProjectionsAndGoals
          currentValue={currentValue}
          refreshTrigger={refreshTrigger}
          session={session}
          portfolioId={portfolioId}
        />
      </div>
    );
  }

  // Allocation subtab — donut chart
  if (subTab === 'allocation') {
    const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
    return (
      <div className="space-y-3">
        {portfolioPicker}
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
        {portfolioPicker}
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
        {portfolioPicker}
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <ETFOverlap onTickerClick={onTickerClick} portfolioId={portfolioId} />
      </div>
    );
  }

  // Tax-Loss Harvesting subtab
  if (subTab === 'tax-harvest') {
    return (
      <div className="space-y-3">
        {portfolioPicker}
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <TaxHarvest onTickerClick={onTickerClick} portfolioId={portfolioId} />
      </div>
    );
  }

  // Show initial loading only if we have no cached data at all
  if (!initialLoadComplete && !hasAnyData) {
    return (
      <div className="space-y-3">
        {portfolioPicker}
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
      {/* Portfolio picker */}
      {portfolioPicker}

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

      {/* Performance Report (Elite) */}
      <PerformanceReportCard portfolioId={portfolioId} />

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
