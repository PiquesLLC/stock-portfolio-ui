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

import { PremiumOverlay } from './PremiumOverlay';
import { ETFOverlap } from './ETFOverlap';
import { TaxHarvest } from './TaxHarvest';
import { MarketSession } from '../types';
import { useToast } from '../context/ToastContext';
import { clearInsightsCache, INSIGHTS_CACHE_TTL_MS, insightsCache } from '../utils/insights-cache';
import { navigateToPricing } from '../utils/navigate-to-pricing';

type InsightsSubTab = 'intelligence' | 'income' | 'projections-goals' | 'ai-briefing' | 'ai-behavior' | 'allocation' | 'what-if' | 'earnings' | 'etf-overlap' | 'tax-harvest';

const INTELLIGENCE_STEPS = [
  'Scanning portfolio events',
  'Analyzing earnings & dividends',
  'Evaluating analyst activity',
  'Building intelligence report',
];

function IntelligenceLoader() {
  const [activeStep, setActiveStep] = useState(0);
  const [typedText, setTypedText] = useState('');
  const fullText = INTELLIGENCE_STEPS[activeStep] || '';

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(prev => (prev < INTELLIGENCE_STEPS.length - 1 ? prev + 1 : prev));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTypedText('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i <= fullText.length) setTypedText(fullText.slice(0, i));
      else clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [activeStep, fullText]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-rh-green/10 border border-rh-green/20 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-rh-light-text dark:text-white">Gathering Intelligence</p>
          <p className="text-[11px] text-rh-light-muted/50 dark:text-white/25">Powered by NALA</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {INTELLIGENCE_STEPS.map((step, i) => {
          const isActive = i === activeStep;
          const isDone = i < activeStep;
          return (
            <div key={i} className={`flex items-center gap-2.5 transition-all duration-500 ${isActive ? 'opacity-100' : isDone ? 'opacity-40' : 'opacity-15'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all duration-500 ${
                isDone ? 'bg-rh-green/20 text-rh-green' : isActive ? 'bg-rh-green text-black' : 'bg-gray-200/60 dark:bg-white/[0.06] text-rh-light-muted dark:text-white/30'
              }`}>
                {isDone ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (i + 1)}
              </div>
              <span className={`text-[12px] transition-all duration-500 ${isActive ? 'text-rh-light-text dark:text-white font-medium' : isDone ? 'text-rh-light-muted dark:text-white/50' : 'text-rh-light-muted/50 dark:text-white/30'}`}>
                {isActive ? typedText : step}
                {isActive && <span className="inline-block w-[2px] h-[12px] bg-rh-green ml-0.5 align-middle animate-pulse" />}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 h-1 bg-gray-200/60 dark:bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-rh-green/60 to-rh-green rounded-full transition-all duration-[3000ms] ease-linear"
          style={{ width: `${Math.min(95, ((activeStep + 1) / INTELLIGENCE_STEPS.length) * 100)}%` }}
        />
      </div>
    </div>
  );
}

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
        ? 'bg-white dark:bg-white/[0.1] text-rh-light-text dark:text-white shadow-sm'
        : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
    }`, []);

  return (
    <>
      {/* Desktop: all tabs in one row */}
      <div className="hidden md:flex gap-1 bg-gray-100 dark:bg-white/[0.04] rounded-lg p-0.5 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => onTabChange(t.id)} className={btnClass(activeTab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Mobile: fewer primary tabs + More dropdown */}
      <div className="flex md:hidden gap-1 bg-gray-100 dark:bg-white/[0.04] rounded-lg p-0.5">
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
      <div className="border-t border-gray-200/10 dark:border-white/[0.04] pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-rh-green" />
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">Performance Report</h3>
          </div>
          <button
            onClick={handleDownload}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rh-green bg-rh-green/10 hover:bg-rh-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="flex">
          {REPORT_PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`relative px-2.5 py-2 text-[12px] font-medium transition-all ${
                period === p.value
                  ? 'text-rh-light-text dark:text-white'
                  : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              {p.label}
              {period === p.value && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-rh-green" />
              )}
            </button>
          ))}
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
    { id: 'ai-briefing', label: 'Briefing' },
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
          <PortfolioBriefing portfolioId={portfolioId} onTickerClick={onTickerClick} holdings={holdings} currentValue={currentValue} />
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

  // Show step loader for Intelligence tab until all data is ready
  if (!initialLoadComplete && !hasAnyData) {
    return (
      <div className="space-y-3">
        {portfolioPicker}
        <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />
        <IntelligenceLoader />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Portfolio picker */}
      {portfolioPicker}

      {/* Sub-tabs */}
      <InsightsTabBar tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} />

      {/* Show loader until intelligence is ready — everything reveals together */}
      {!intelligence ? (
        <IntelligenceLoader />
      ) : (
        <>
          <PortfolioIntelligence initialData={intelligence} onTickerClick={onTickerClick} session={session} />
          {healthScore && <HealthScore data={healthScore} />}
          <PerformanceReportCard portfolioId={portfolioId} />
        </>
      )}

      {/* Empty State - Only show if no holdings */}
      {!hasAnyData && initialLoadComplete && (
        <div className="p-12 text-center">
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
