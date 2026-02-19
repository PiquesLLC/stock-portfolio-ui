import { useState, useEffect, useMemo } from 'react';
import { Portfolio, PortfolioIntelligenceResponse } from '../types';
import { getPortfolio, getUserPortfolio, getPortfolioIntelligence, getUserIntelligence } from '../api';
import { AllocationDonut } from './AllocationDonut';
import { StockLogo } from './StockLogo';

interface PortfolioCompareProps {
  theirUserId: string;
  theirDisplayName: string;
  onBack: () => void;
  onTickerClick?: (ticker: string) => void;
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function PortfolioCompare({ theirUserId, theirDisplayName, onBack, onTickerClick }: PortfolioCompareProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myPortfolio, setMyPortfolio] = useState<Portfolio | null>(null);
  const [theirPortfolio, setTheirPortfolio] = useState<Portfolio | null>(null);
  const [myIntel, setMyIntel] = useState<PortfolioIntelligenceResponse | null>(null);
  const [theirIntel, setTheirIntel] = useState<PortfolioIntelligenceResponse | null>(null);

  // Load portfolios first for instant render, then lazy-load intelligence
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      getPortfolio(),
      getUserPortfolio(theirUserId),
    ])
      .then(([mp, tp]) => {
        if (cancelled) return;
        setMyPortfolio(mp);
        setTheirPortfolio(tp);
        setLoading(false);

        // Lazy-load intelligence (sector exposure, beta) in background
        Promise.all([
          getPortfolioIntelligence('1m').catch(() => null),
          getUserIntelligence(theirUserId, '1m').catch(() => null),
        ]).then(([mi, ti]) => {
          if (cancelled) return;
          setMyIntel(mi);
          setTheirIntel(ti);
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Failed to load comparison data');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [theirUserId]);

  // Compute comparison data
  const comparison = useMemo(() => {
    if (!myPortfolio || !theirPortfolio) return null;

    const myHoldings = myPortfolio.holdings;
    const theirHoldings = theirPortfolio.holdings;

    const myTickers = new Set(myHoldings.map(h => h.ticker));
    const theirTickers = new Set(theirHoldings.map(h => h.ticker));
    const allTickers = new Set([...myTickers, ...theirTickers]);

    const shared = [...myTickers].filter(t => theirTickers.has(t));
    const onlyMine = [...myTickers].filter(t => !theirTickers.has(t));
    const onlyTheirs = [...theirTickers].filter(t => !myTickers.has(t));
    const overlapPct = allTickers.size > 0 ? (shared.length / allTickers.size) * 100 : 0;

    // Build lookup maps for weight %
    const myTotal = myHoldings.reduce((s, h) => s + h.currentValue, 0) || 1;
    const theirTotal = theirHoldings.reduce((s, h) => s + h.currentValue, 0) || 1;
    const myWeights = new Map(myHoldings.map(h => [h.ticker, (h.currentValue / myTotal) * 100]));
    const theirWeights = new Map(theirHoldings.map(h => [h.ticker, (h.currentValue / theirTotal) * 100]));

    // Sector comparison
    const mySectors = myIntel?.sectorExposure ?? [];
    const theirSectors = theirIntel?.sectorExposure ?? [];
    const allSectorNames = new Set([
      ...mySectors.map(s => s.sector),
      ...theirSectors.map(s => s.sector),
    ]);
    const sectorComparison = [...allSectorNames].map(sector => ({
      sector,
      myPct: mySectors.find(s => s.sector === sector)?.exposurePercent ?? 0,
      theirPct: theirSectors.find(s => s.sector === sector)?.exposurePercent ?? 0,
    })).sort((a, b) => Math.max(b.myPct, b.theirPct) - Math.max(a.myPct, a.theirPct));

    // Find biggest sector divergence for summary
    let biggestDivergence = { sector: '', diff: 0, myPct: 0, theirPct: 0 };
    for (const s of sectorComparison) {
      const diff = Math.abs(s.myPct - s.theirPct);
      if (diff > biggestDivergence.diff) {
        biggestDivergence = { sector: s.sector, diff, myPct: s.myPct, theirPct: s.theirPct };
      }
    }

    return {
      shared, onlyMine, onlyTheirs, overlapPct,
      myWeights, theirWeights,
      sectorComparison,
      hasTheirHoldings: theirHoldings.length > 0,
      biggestDivergence,
    };
  }, [myPortfolio, theirPortfolio, myIntel, theirIntel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <img src="/north-signal-logo.png" alt="" className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-rh-light-muted dark:text-rh-muted mb-2">Failed to load comparison</p>
        <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">{error}</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 rounded-lg bg-rh-green text-black text-sm font-medium">
          Go Back
        </button>
      </div>
    );
  }

  if (!myPortfolio || !theirPortfolio || !comparison) return null;

  const theirRestricted = !comparison.hasTheirHoldings;
  const maxSectorPct = comparison.sectorComparison.reduce((m, s) => Math.max(m, s.myPct, s.theirPct), 0) || 1;
  const totalUnique = comparison.shared.length + comparison.onlyMine.length + comparison.onlyTheirs.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 dark:text-gray-400 hover:text-rh-light-text dark:hover:text-rh-text transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-base font-bold text-rh-light-text dark:text-white">
            You <span className="text-gray-600 dark:text-gray-300 font-normal">vs</span> {theirDisplayName}
          </h2>
          {/* Fix #6: "So what" summary line */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {comparison.overlapPct.toFixed(0)}% overlap
            {comparison.biggestDivergence.sector && (
              <span className="text-gray-400 dark:text-gray-500">
                {' · Biggest gap: '}
                <span className="text-rh-light-text dark:text-rh-text font-medium">{comparison.biggestDivergence.sector}</span>
                {' ('}
                <span className="text-rh-green">{comparison.biggestDivergence.myPct.toFixed(1)}%</span>
                {' vs '}
                <span style={{ color: '#5b8def' }}>{comparison.biggestDivergence.theirPct.toFixed(1)}%</span>
                {')'}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Summary Cards — Fix #1: higher contrast labels */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Holdings"
          myValue={`${myPortfolio.holdings.length}`}
          theirValue={`${theirPortfolio.holdings.length}`}
          theirName={theirDisplayName}
        />
        <SummaryCard
          label="Overlap"
          myValue={`${comparison.shared.length} shared`}
          theirValue={`${comparison.overlapPct.toFixed(0)}%`}
          theirName="match"
          singleValue
        />
        <SummaryCard
          label="Day Change"
          myValue={formatPct(myPortfolio.dayChangePercent)}
          myColor={myPortfolio.dayChangePercent >= 0}
          theirValue={formatPct(theirPortfolio.dayChangePercent)}
          theirColor={theirPortfolio.dayChangePercent >= 0}
          theirName={theirDisplayName}
        />
        <SummaryCard
          label="Beta"
          myValue={myIntel?.beta?.portfolioBeta?.toFixed(2) ?? '—'}
          theirValue={theirIntel?.beta?.portfolioBeta?.toFixed(2) ?? '—'}
          theirName={theirDisplayName}
        />
      </div>

      {/* Side-by-side Donuts — Fix #2: maxSlices=8 */}
      {!theirRestricted ? (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-50/40 dark:bg-white/[0.03] rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-4">
              <AllocationDonut holdings={myPortfolio.holdings} totalValue={myPortfolio.holdingsValue} onTickerClick={onTickerClick} title="Your Allocation" maxSlices={8} />
            </div>
            <div className="bg-gray-50/40 dark:bg-white/[0.03] rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-4">
              <AllocationDonut holdings={theirPortfolio.holdings} totalValue={theirPortfolio.holdingsValue} onTickerClick={onTickerClick} title={`${theirDisplayName}'s Allocation`} maxSlices={8} />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center sm:hidden">Tap a segment or legend item for details</p>
        </div>
      ) : (
        <div className="bg-gray-50/40 dark:bg-white/[0.03] rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {theirDisplayName}'s holdings are private. Sector comparison is shown below.
          </p>
        </div>
      )}

      {/* Holdings Breakdown — Fix #4: normalized heights, Fix #5: counts in headers */}
      {!theirRestricted && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Holdings Breakdown
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <HoldingsGroup
              title="Shared"
              count={comparison.shared.length}
              totalUnique={totalUnique}
              tickers={comparison.shared}
              accent="#10b981"
              myWeights={comparison.myWeights}
              theirWeights={comparison.theirWeights}
              showBoth
              onTickerClick={onTickerClick}
              emptyHint="No shared holdings yet"
            />
            <HoldingsGroup
              title="Only You"
              count={comparison.onlyMine.length}
              totalUnique={totalUnique}
              tickers={comparison.onlyMine}
              accent="#3b82f6"
              myWeights={comparison.myWeights}
              theirWeights={comparison.theirWeights}
              onTickerClick={onTickerClick}
            />
            <HoldingsGroup
              title={`Only ${theirDisplayName}`}
              count={comparison.onlyTheirs.length}
              totalUnique={totalUnique}
              tickers={comparison.onlyTheirs}
              accent="#8b5cf6"
              myWeights={comparison.myWeights}
              theirWeights={comparison.theirWeights}
              showTheirs
              onTickerClick={onTickerClick}
            />
          </div>
        </div>
      )}

      {/* Sector Comparison — bars touch, higher contrast labels */}
      {!myIntel && !theirIntel && (
        <div className="flex items-center justify-center py-6 gap-2">
          <div className="w-3 h-3 border-2 border-rh-green/40 border-t-rh-green rounded-full animate-spin" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Loading sector data...</span>
        </div>
      )}
      {comparison.sectorComparison.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Sector Exposure
          </h3>
          <div className="bg-gray-50/40 dark:bg-white/[0.03] rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-4 space-y-3.5">
            {/* Legend */}
            <div className="flex items-center gap-4 mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rh-green" />
                You
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#5b8def' }} />
                {theirDisplayName}
              </div>
            </div>
            {comparison.sectorComparison.map(({ sector, myPct, theirPct }) => (
              <div key={sector} className="flex items-center gap-3">
                <div className="w-24 sm:w-28 text-xs text-rh-light-text dark:text-rh-text font-medium truncate shrink-0">
                  {sector}
                </div>
                <div className="flex-1 flex items-center">
                  {/* My bar — flush right */}
                  <div className="flex-1 flex justify-end">
                    <div
                      className="h-4 rounded-l-sm bg-rh-green/80 transition-all duration-300"
                      style={{ width: `${(myPct / maxSectorPct) * 100}%`, minWidth: myPct > 0 ? 4 : 0 }}
                    />
                  </div>
                  {/* Center divider */}
                  <div className="w-[1.5px] self-stretch bg-gray-600 dark:bg-white shrink-0" />
                  {/* Their bar — flush left */}
                  <div className="flex-1">
                    <div
                      className="h-4 rounded-r-sm transition-all duration-300"
                      style={{ width: `${(theirPct / maxSectorPct) * 100}%`, minWidth: theirPct > 0 ? 4 : 0, background: '#5b8def' }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 w-24 sm:w-28 shrink-0">
                  <span className="text-[11px] tabular-nums font-medium text-rh-green w-12 text-right">{myPct.toFixed(1)}%</span>
                  <span className="text-[11px] tabular-nums font-medium w-12 text-right" style={{ color: '#5b8def' }}>{theirPct.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Summary Card — Fix #1: higher contrast labels ─── */

function SummaryCard({ label, myValue, theirValue, theirName, myColor, theirColor, singleValue }: {
  label: string;
  myValue: string;
  theirValue: string;
  theirName: string;
  myColor?: boolean;
  theirColor?: boolean;
  singleValue?: boolean;
}) {
  return (
    <div className="bg-gray-50/40 dark:bg-white/[0.03] rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">{label}</p>
      {singleValue ? (
        <div>
          <p className="text-base font-bold text-rh-light-text dark:text-rh-text">{myValue}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{theirValue} {theirName}</p>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">You</span>
            <span className={`text-sm font-bold tabular-nums ${myColor == null ? 'text-rh-light-text dark:text-rh-text' : myColor ? 'text-rh-green' : 'text-rh-red'}`}>
              {myValue}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate mr-1">{theirName}</span>
            <span className={`text-sm font-bold tabular-nums ${theirColor == null ? 'text-rh-light-text dark:text-rh-text' : theirColor ? 'text-rh-green' : 'text-rh-red'}`}>
              {theirValue}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Holdings Group — Fix #3,#4,#5: aligned columns, normalized height, counts ─── */

function HoldingsGroup({ title, count, totalUnique, tickers, accent, myWeights, theirWeights, showBoth, showTheirs, onTickerClick, emptyHint }: {
  title: string;
  count: number;
  totalUnique: number;
  tickers: string[];
  accent: string;
  myWeights: Map<string, number>;
  theirWeights: Map<string, number>;
  showBoth?: boolean;
  showTheirs?: boolean;
  onTickerClick?: (ticker: string) => void;
  emptyHint?: string;
}) {
  const sorted = [...tickers].sort((a, b) => {
    const wa = showTheirs ? (theirWeights.get(a) ?? 0) : (myWeights.get(a) ?? 0);
    const wb = showTheirs ? (theirWeights.get(b) ?? 0) : (myWeights.get(b) ?? 0);
    return wb - wa;
  });

  const pctOfTotal = totalUnique > 0 ? ((count / totalUnique) * 100).toFixed(0) : '0';

  return (
    <div className="bg-gray-50/40 dark:bg-white/[0.03] rounded-xl border border-gray-200/40 dark:border-white/[0.06] overflow-hidden flex flex-col sm:min-h-[280px]">
      {/* Fix #5: prominent count + percentage in header */}
      <div className="px-3 py-2.5 border-b border-gray-200/40 dark:border-white/[0.06] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
        <span className="text-xs font-semibold text-rh-light-text dark:text-rh-text">{title}</span>
        <div className="ml-auto flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-rh-light-text dark:text-rh-text tabular-nums">{count}</span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">({pctOfTotal}%)</span>
        </div>
      </div>
      {/* Fix #3: fixed tab-stop columns. Fix #7: modern scrollbar */}
      <div className="flex-1 max-h-[280px] overflow-y-auto scrollbar-minimal">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-8 px-4 text-center">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{emptyHint || 'No holdings'}</p>
            {emptyHint && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">Try comparing with a more diversified portfolio</p>
            )}
          </div>
        ) : sorted.map((ticker, i) => (
          <button
            key={ticker}
            onClick={() => onTickerClick?.(ticker)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100/60 dark:hover:bg-white/[0.04] transition-colors text-left${i > 0 ? ' border-t border-gray-100/60 dark:border-white/[0.04]' : ''}`}
          >
            <StockLogo ticker={ticker} size="sm" />
            <span className="text-xs font-semibold text-rh-light-text dark:text-rh-text w-16 shrink-0 truncate">{ticker}</span>
            <span className="flex-1" />
            {showBoth ? (
              <div className="flex shrink-0">
                <span className="text-[11px] tabular-nums font-medium text-rh-green w-14 text-right">{(myWeights.get(ticker) ?? 0).toFixed(1)}%</span>
                <span className="text-[11px] tabular-nums font-medium w-14 text-right" style={{ color: '#5b8def' }}>{(theirWeights.get(ticker) ?? 0).toFixed(1)}%</span>
              </div>
            ) : (
              <span className="text-[11px] tabular-nums font-medium text-gray-500 dark:text-gray-400 w-14 text-right shrink-0">
                {((showTheirs ? theirWeights : myWeights).get(ticker) ?? 0).toFixed(1)}%
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
