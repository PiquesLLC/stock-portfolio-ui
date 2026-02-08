import { useState, useEffect, useRef, useMemo } from 'react';
import { EconomicDashboardResponse, InternationalEconomicResponse, EconomicIndicator } from '../types';
import { getEconomicDashboard, getInternationalEconomic } from '../api';
import { SkeletonCard } from './SkeletonCard';
import { IndicatorCard } from './economic/IndicatorCard';
import { ChartPanel } from './economic/FullChart';
import { PortfolioImpactCard } from './economic/PortfolioImpactCard';

// Selection key: region + index to track which card is selected across all sections
interface SelectedCard {
  region: 'us' | 'eu' | 'japan';
  idx: number;
}

// Cache for economic data
let economicCache: EconomicDashboardResponse | null = null;
let cacheTime: number | null = null;
let intlCache: InternationalEconomicResponse | null = null;
let intlCacheTime: number | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function EconomicIndicators() {
  const [data, setData] = useState<EconomicDashboardResponse | null>(economicCache);
  const [intlData, setIntlData] = useState<InternationalEconomicResponse | null>(intlCache);
  const [loading, setLoading] = useState(!economicCache);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedCard | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Fetch US data
    const usCacheAge = cacheTime ? Date.now() - cacheTime : Infinity;
    if (economicCache && usCacheAge < CACHE_TTL) {
      setData(economicCache);
      setLoading(false);
    } else {
      setLoading(!economicCache);
      getEconomicDashboard()
        .then(resp => {
          if (mountedRef.current) {
            setData(resp);
            economicCache = resp;
            cacheTime = Date.now();
            setLoading(false);
          }
        })
        .catch(err => {
          if (mountedRef.current) {
            setError(err.message);
            setLoading(false);
          }
        });
    }

    // Fetch international data (independent — doesn't block US)
    const intlCacheAge = intlCacheTime ? Date.now() - intlCacheTime : Infinity;
    if (!intlCache || intlCacheAge >= CACHE_TTL) {
      getInternationalEconomic()
        .then(resp => {
          if (mountedRef.current) {
            setIntlData(resp);
            intlCache = resp;
            intlCacheTime = Date.now();
          }
        })
        .catch(err => {
          console.error('International economic data error:', err.message);
        });
    }

    return () => { mountedRef.current = false; };
  }, []);

  // Convert US indicators object to array — must be before any early returns
  // Merges Alpha Vantage US data with World Bank US GDP Growth for cross-region comparison
  const usIndicatorList = useMemo(() => {
    if (!data) return [];
    const { indicators } = data;
    const usGdpGrowth = intlData?.regions?.us?.indicators?.gdpGrowth ?? null;
    return [
      indicators.cpi,
      indicators.fedFundsRate,
      indicators.treasuryYield10Y,
      indicators.unemployment,
      indicators.gdp,
      usGdpGrowth,
    ].filter((ind): ind is EconomicIndicator => ind != null);
  }, [data, intlData]);

  // Convert EU indicators to array
  const euIndicatorList = useMemo(() => {
    if (!intlData?.regions?.eu?.indicators) return [];
    const { gdpGrowth, inflation, unemployment, gdp } = intlData.regions.eu.indicators;
    return [gdp, gdpGrowth, inflation, unemployment].filter((ind): ind is EconomicIndicator => ind != null);
  }, [intlData]);

  // Convert Japan indicators to array
  const jpnIndicatorList = useMemo(() => {
    if (!intlData?.regions?.japan?.indicators) return [];
    const { gdpGrowth, inflation, unemployment, gdp } = intlData.regions.japan.indicators;
    return [gdp, gdpGrowth, inflation, unemployment].filter((ind): ind is EconomicIndicator => ind != null);
  }, [intlData]);

  // Find the currently selected indicator across all regions
  const selectedIndicator = useMemo(() => {
    if (!selected) return null;
    if (selected.region === 'us') return usIndicatorList[selected.idx] ?? null;
    if (selected.region === 'eu') return euIndicatorList[selected.idx] ?? null;
    if (selected.region === 'japan') return jpnIndicatorList[selected.idx] ?? null;
    return null;
  }, [selected, usIndicatorList, euIndicatorList, jpnIndicatorList]);

  const selectedRegionLabel = selected?.region === 'eu' ? 'European Union'
    : selected?.region === 'japan' ? 'Japan'
    : 'United States';

  const handleCardClick = (region: 'us' | 'eu' | 'japan', idx: number) => {
    if (selected?.region === region && selected?.idx === idx) {
      setSelected(null); // deselect
    } else {
      setSelected({ region, idx });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text">Economic Indicators</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} lines={2} height="100px" />)}
        </div>
      </div>
    );
  }

  if (error || !data || usIndicatorList.length === 0) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-8 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          {error || 'Economic indicators data not yet available. Data refreshes daily.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* -- Portfolio Impact Card -- */}
      <PortfolioImpactCard />

      {/* -- United States -- */}
      <div id="macro-region-us" className="space-y-3 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-y-1">
          <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text flex items-center gap-2">
            <span className="text-base">$</span> United States
            <span className="text-[10px] font-normal text-rh-light-muted/50 dark:text-rh-muted/50 hidden sm:inline">Monthly / Quarterly</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 italic hidden sm:inline">Dates show latest available</span>
            {data.lastUpdated && (
              <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
                {data.dataAge === 'stale' ? 'Data may be stale' : `Updated ${new Date(data.lastUpdated).toLocaleDateString()}`}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {usIndicatorList.map((ind, i) => (
            <IndicatorCard
              key={`us-${ind.name}`}
              indicator={ind}
              isSelected={selected?.region === 'us' && selected?.idx === i}
              onClick={() => handleCardClick('us', i)}
            />
          ))}
        </div>
      </div>

      {/* Expanded chart (shows after the region that owns it, or at bottom) */}
      {selectedIndicator && selected?.region === 'us' && (
        <ChartPanel
          indicator={selectedIndicator}
          regionLabel={selectedRegionLabel}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Divider */}
      {euIndicatorList.length > 0 && (
        <div className="border-t border-gray-200/50 dark:border-white/[0.06]" />
      )}

      {/* -- European Union -- */}
      {euIndicatorList.length > 0 && (
        <div id="macro-region-eu" className="space-y-3 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-y-1">
            <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text flex items-center gap-2">
              <span className="text-base">&#8364;</span> European Union
              <span className="text-[10px] font-normal text-rh-light-muted/50 dark:text-rh-muted/50 hidden sm:inline">Annual</span>
            </h3>
            {intlData?.lastUpdated && (
              <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
                {intlData.dataAge === 'stale' ? 'Data may be stale' : `Updated ${new Date(intlData.lastUpdated).toLocaleDateString()}`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {euIndicatorList.map((ind, i) => (
              <IndicatorCard
                key={`eu-${ind.name}`}
                indicator={ind}
                isSelected={selected?.region === 'eu' && selected?.idx === i}
                onClick={() => handleCardClick('eu', i)}
              />
            ))}
          </div>
        </div>
      )}

      {selectedIndicator && selected?.region === 'eu' && (
        <ChartPanel
          indicator={selectedIndicator}
          regionLabel={selectedRegionLabel}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Divider */}
      {jpnIndicatorList.length > 0 && (
        <div className="border-t border-gray-200/50 dark:border-white/[0.06]" />
      )}

      {/* -- Japan -- */}
      {jpnIndicatorList.length > 0 && (
        <div id="macro-region-japan" className="space-y-3 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-y-1">
            <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text flex items-center gap-2">
              <span className="text-base">&#165;</span> Japan
              <span className="text-[10px] font-normal text-rh-light-muted/50 dark:text-rh-muted/50 hidden sm:inline">Annual</span>
            </h3>
            {intlData?.lastUpdated && (
              <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
                {intlData.dataAge === 'stale' ? 'Data may be stale' : `Updated ${new Date(intlData.lastUpdated).toLocaleDateString()}`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {jpnIndicatorList.map((ind, i) => (
              <IndicatorCard
                key={`jpn-${ind.name}`}
                indicator={ind}
                isSelected={selected?.region === 'japan' && selected?.idx === i}
                onClick={() => handleCardClick('japan', i)}
              />
            ))}
          </div>
        </div>
      )}

      {selectedIndicator && selected?.region === 'japan' && (
        <ChartPanel
          indicator={selectedIndicator}
          regionLabel={selectedRegionLabel}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Loading skeleton for international data if not yet loaded */}
      {!intlData && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text opacity-50">Loading international data...</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} height="100px" />)}
          </div>
        </div>
      )}

      {/* -- Last Sync Footer -- */}
      <div className="border-t border-gray-200/30 dark:border-white/[0.04] pt-4 mt-2">
        <div className="flex items-center justify-between text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Data current as of{' '}
              {data.lastUpdated
                ? new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : 'unknown'}
            </span>
          </div>
          <span>
            US via Alpha Vantage &middot; EU &amp; Japan via World Bank
          </span>
        </div>
      </div>
    </div>
  );
}
