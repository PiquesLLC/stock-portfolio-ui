import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
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

// RegionSection renders indicator cards in rows, inserting chart panel
// directly after the row containing the selected card
function RegionSection({
  id,
  label,
  sublabel,
  lastUpdated,
  dataAge,
  indicators,
  region,
  selected,
  selectedIndicator,
  selectedRegionLabel,
  onCardClick,
  onChartClose,
  extraHeaderRight,
}: {
  id: string;
  label: ReactNode;
  sublabel: string;
  lastUpdated: string | null;
  dataAge: string | null;
  indicators: EconomicIndicator[];
  region: 'us' | 'eu' | 'japan';
  selected: SelectedCard | null;
  selectedIndicator: EconomicIndicator | null;
  selectedRegionLabel: string;
  onCardClick: (region: 'us' | 'eu' | 'japan', idx: number) => void;
  onChartClose: () => void;
  extraHeaderRight?: ReactNode;
}) {
  const isThisRegion = selected?.region === region;
  // Determine which row the selected card is in (3 cols on lg, 2 on sm, 1 on xs)
  // We use lg breakpoint (3 cols) for row calculation since that's the grid layout
  const selectedIdx = isThisRegion ? selected!.idx : -1;

  // Group indicators into rows of 3 (matching lg:grid-cols-3)
  const rows: EconomicIndicator[][] = [];
  for (let i = 0; i < indicators.length; i += 3) {
    rows.push(indicators.slice(i, i + 3));
  }

  const selectedRowIdx = selectedIdx >= 0 ? Math.floor(selectedIdx / 3) : -1;

  return (
    <div id={id} className="space-y-3 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-y-1">
        <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text flex items-center gap-2">
          {label}
          <span className="text-[10px] font-normal text-rh-light-muted/50 dark:text-rh-muted/50 hidden sm:inline">{sublabel}</span>
        </h3>
        <div className="flex items-center gap-2">
          {extraHeaderRight}
          {lastUpdated && (
            <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
              {dataAge === 'stale' ? 'Data may be stale' : `Updated ${new Date(lastUpdated).toLocaleDateString()}`}
            </span>
          )}
        </div>
      </div>
      {rows.map((row, rowIdx) => {
        const rowStartIdx = rowIdx * 3;
        return (
          <div key={rowIdx}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {row.map((ind, colIdx) => {
                const globalIdx = rowStartIdx + colIdx;
                return (
                  <IndicatorCard
                    key={`${region}-${ind.name}`}
                    indicator={ind}
                    isSelected={isThisRegion && selected?.idx === globalIdx}
                    onClick={() => onCardClick(region, globalIdx)}
                  />
                );
              })}
            </div>
            {isThisRegion && selectedIndicator && selectedRowIdx === rowIdx && (
              <div className="mt-4">
                <ChartPanel
                  indicator={selectedIndicator}
                  regionLabel={selectedRegionLabel}
                  onClose={onChartClose}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
      <RegionSection
        id="macro-region-us"
        label={<><span className="text-base">$</span> United States</>}
        sublabel="Monthly / Quarterly"
        lastUpdated={data.lastUpdated}
        dataAge={data.dataAge}
        indicators={usIndicatorList}
        region="us"
        selected={selected}
        selectedIndicator={selectedIndicator}
        selectedRegionLabel={selectedRegionLabel}
        onCardClick={handleCardClick}
        onChartClose={() => setSelected(null)}
        extraHeaderRight={
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 italic hidden sm:inline">Dates show latest available</span>
        }
      />

      {/* Divider */}
      {euIndicatorList.length > 0 && (
        <div className="border-t border-gray-200/50 dark:border-white/[0.06]" />
      )}

      {/* -- European Union -- */}
      {euIndicatorList.length > 0 && (
        <RegionSection
          id="macro-region-eu"
          label={<><span className="text-base">&#8364;</span> European Union</>}
          sublabel="Annual"
          lastUpdated={intlData?.lastUpdated ?? null}
          dataAge={intlData?.dataAge ?? null}
          indicators={euIndicatorList}
          region="eu"
          selected={selected}
          selectedIndicator={selectedIndicator}
          selectedRegionLabel={selectedRegionLabel}
          onCardClick={handleCardClick}
          onChartClose={() => setSelected(null)}
        />
      )}

      {/* Divider */}
      {jpnIndicatorList.length > 0 && (
        <div className="border-t border-gray-200/50 dark:border-white/[0.06]" />
      )}

      {/* -- Japan -- */}
      {jpnIndicatorList.length > 0 && (
        <RegionSection
          id="macro-region-japan"
          label={<><span className="text-base">&#165;</span> Japan</>}
          sublabel="Annual"
          lastUpdated={intlData?.lastUpdated ?? null}
          dataAge={intlData?.dataAge ?? null}
          indicators={jpnIndicatorList}
          region="japan"
          selected={selected}
          selectedIndicator={selectedIndicator}
          selectedRegionLabel={selectedRegionLabel}
          onCardClick={handleCardClick}
          onChartClose={() => setSelected(null)}
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
