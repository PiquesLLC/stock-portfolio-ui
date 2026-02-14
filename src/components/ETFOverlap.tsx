import { useState, useEffect } from 'react';
import { EtfOverlapResponse, EtfOverlapPair } from '../types';
import { getEtfOverlap } from '../api';
import { SkeletonCard } from './SkeletonCard';

interface Props {
  onTickerClick?: (ticker: string) => void;
}

function formatDollars(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function OverlapCell({ pair, onClick }: { pair: EtfOverlapPair | null; onClick?: () => void }) {
  if (!pair) return <td className="p-2 text-center text-xs text-rh-light-muted dark:text-rh-muted">—</td>;
  const pct = pair.overlapPercent;
  const bg = pct >= 15 ? 'bg-green-400/30 dark:bg-green-500/20'
    : pct >= 5 ? 'bg-green-300/20 dark:bg-green-500/10'
    : pct > 0 ? 'bg-green-200/15 dark:bg-green-500/5'
    : '';
  return (
    <td
      className={`p-2 text-center text-xs font-medium cursor-pointer hover:ring-1 hover:ring-rh-green/50 rounded transition-all ${bg}`}
      onClick={onClick}
      title={`${pair.sharedHoldings.length} shared holdings`}
    >
      {pct.toFixed(1)}%
    </td>
  );
}

export function ETFOverlap({ onTickerClick }: Props) {
  const [data, setData] = useState<EtfOverlapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEtf, setExpandedEtf] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<EtfOverlapPair | null>(null);

  useEffect(() => {
    setLoading(true);
    getEtfOverlap()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard lines={4} height="200px" />
        <SkeletonCard lines={6} height="300px" />
      </div>
    );
  }

  if (!data || (data.etfs.length === 0 && data.exposures.length === 0)) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-12 text-center">
        <svg className="w-14 h-14 mx-auto mb-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-rh-light-text dark:text-rh-text font-medium mb-2">No ETFs in Portfolio</p>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Add ETF holdings to see overlap analysis, exposure breakdown, and concentration warnings.
        </p>
      </div>
    );
  }

  const etfTickers = data.etfs.map(e => e.ticker);

  // Merge same-company tickers (GOOGL/GOOG, BRK.A/BRK.B)
  const MERGE_MAP: Record<string, string> = { 'GOOG': 'GOOGL', 'BRK.A': 'BRK.B' };
  const mergedExposures = (() => {
    const map = new Map<string, typeof data.exposures[0]>();
    for (const exp of data.exposures) {
      const canonical = MERGE_MAP[exp.ticker] ?? exp.ticker;
      const existing = map.get(canonical);
      if (existing) {
        existing.totalExposureValue += exp.totalExposureValue;
        existing.exposurePct += exp.exposurePct;
        existing.sources = [...existing.sources, ...exp.sources];
      } else {
        map.set(canonical, { ...exp, ticker: canonical, sources: [...exp.sources] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalExposureValue - a.totalExposureValue);
  })();

  const maxExposure = mergedExposures.length > 0 ? Math.max(...mergedExposures.map(e => e.exposurePct)) : 1;
  const topExposures = mergedExposures.slice(0, 20);

  // Recompute warnings from merged data (API warnings don't account for GOOG/GOOGL merge)
  const mergedWarnings = mergedExposures
    .filter(e => e.exposurePct >= 10)
    .map(e => ({
      ticker: e.ticker,
      exposurePct: e.exposurePct,
      message: `High concentration: ${e.ticker} is ${e.exposurePct.toFixed(1)}% of portfolio exposure`,
    }));

  // Build lookup for overlap matrix
  const pairLookup = new Map<string, EtfOverlapPair>();
  for (const p of data.overlapMatrix) {
    pairLookup.set(`${p.etfA}:${p.etfB}`, p);
    pairLookup.set(`${p.etfB}:${p.etfA}`, p);
  }

  return (
    <div className="space-y-5">
      {/* Concentration Warnings */}
      {mergedWarnings.length > 0 && (
        <div className="space-y-2">
          {mergedWarnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3.5 rounded-xl border-l-[3px] border-l-amber-500 bg-amber-50/40 dark:bg-amber-500/[0.06] border border-amber-200/30 dark:border-amber-500/10"
            >
              <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-sm font-semibold text-rh-light-text dark:text-rh-text cursor-pointer hover:text-rh-green transition-colors"
                    onClick={() => onTickerClick?.(w.ticker)}
                  >
                    {w.ticker}
                  </span>
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    {w.exposurePct.toFixed(1)}% exposure
                  </span>
                </div>
                <p className="text-xs text-rh-light-muted dark:text-rh-muted">{w.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Overlap Matrix — full grid when 3+ pairs, compact cards when fewer */}
      {data.overlapMatrix.length >= 3 && etfTickers.length >= 2 && (
        <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            ETF Overlap Matrix
          </h3>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-left text-rh-light-muted dark:text-rh-muted font-medium"></th>
                  {etfTickers.map(t => (
                    <th key={t} className="p-2 text-center text-rh-light-text dark:text-rh-text font-semibold">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {etfTickers.map(rowTicker => (
                  <tr key={rowTicker}>
                    <td className="p-2 text-rh-light-text dark:text-rh-text font-semibold">{rowTicker}</td>
                    {etfTickers.map(colTicker => {
                      if (rowTicker === colTicker) {
                        return (
                          <td key={colTicker} className="p-2 text-center">
                            <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">—</span>
                          </td>
                        );
                      }
                      const pair = pairLookup.get(`${rowTicker}:${colTicker}`) ?? null;
                      return (
                        <OverlapCell
                          key={colTicker}
                          pair={pair}
                          onClick={() => pair && setSelectedPair(selectedPair?.etfA === pair.etfA && selectedPair?.etfB === pair.etfB ? null : pair)}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Shared holdings detail for selected pair */}
          {selectedPair && (
            <div className="mt-3 p-3 rounded-lg bg-gray-100/60 dark:bg-white/[0.03] border border-gray-200/30 dark:border-white/[0.04]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-rh-light-text dark:text-rh-text">
                  {selectedPair.etfA} &amp; {selectedPair.etfB} — {selectedPair.overlapPercent.toFixed(1)}% overlap
                </span>
                <button
                  onClick={() => setSelectedPair(null)}
                  className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedPair.sharedHoldings.map(h => (
                  <span
                    key={h.ticker}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-rh-green/10 text-rh-green font-medium cursor-pointer hover:bg-rh-green/20 transition-colors"
                    onClick={() => onTickerClick?.(h.ticker)}
                  >
                    {h.ticker} ({h.overlapPct.toFixed(1)}%)
                  </span>
                ))}
                {selectedPair.sharedHoldings.length === 0 && (
                  <span className="text-xs text-rh-light-muted dark:text-rh-muted">No shared holdings data</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compact overlap cards when 1-2 pairs */}
      {data.overlapMatrix.length > 0 && data.overlapMatrix.length < 3 && (
        <div className="space-y-2">
          {data.overlapMatrix.map(pair => (
            <div
              key={`${pair.etfA}-${pair.etfB}`}
              className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
                  {pair.etfA} &amp; {pair.etfB}
                </span>
                <span className="text-xs font-medium text-rh-green">
                  {pair.overlapPercent.toFixed(1)}% overlap
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pair.sharedHoldings.map(h => (
                  <span
                    key={h.ticker}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-rh-green/10 text-rh-green font-medium cursor-pointer hover:bg-rh-green/20 transition-colors"
                    onClick={() => onTickerClick?.(h.ticker)}
                  >
                    {h.ticker} ({h.overlapPct.toFixed(1)}%)
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top Exposures */}
      {topExposures.length > 0 && (
        <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Portfolio Exposure
            <span className="text-[10px] font-normal text-rh-light-muted dark:text-rh-muted ml-1">
              Direct + ETF combined
            </span>
          </h3>
          <div className="space-y-1.5">
            {topExposures.map(exp => {
              const directSources = exp.sources.filter(s => s.source === 'direct');
              const etfSources = exp.sources.filter(s => s.source === 'etf');
              const hasDirect = directSources.length > 0;
              const hasEtf = etfSources.length > 0;
              const barWidth = maxExposure > 0 ? (exp.exposurePct / maxExposure) * 100 : 0;

              // Compute green (direct) vs blue (ETF) portions
              const directValue = directSources.reduce((sum, s) => sum + (s.value ?? 0), 0);
              const etfValue = etfSources.reduce((sum, s) => sum + (s.value ?? 0), 0);
              const totalSourceValue = directValue + etfValue;
              const directPct = totalSourceValue > 0 ? (directValue / totalSourceValue) * 100 : (hasDirect ? 100 : 0);
              const etfPct = 100 - directPct;

              return (
                <div key={exp.ticker} className="group relative flex items-center gap-2">
                  <span
                    className="w-12 text-xs font-semibold text-rh-light-text dark:text-rh-text cursor-pointer hover:text-rh-green transition-colors shrink-0"
                    onClick={() => onTickerClick?.(exp.ticker)}
                  >
                    {exp.ticker}
                  </span>
                  <div className="flex-1 h-5 bg-gray-100/50 dark:bg-white/[0.03] rounded-full overflow-hidden relative">
                    <div
                      className="h-full flex rounded-full overflow-hidden"
                      style={{ width: `${Math.max(barWidth, 2)}%` }}
                    >
                      {hasEtf && (
                        <div
                          className="h-full bg-blue-500/50"
                          style={{ width: `${etfPct}%` }}
                        />
                      )}
                      {hasDirect && (
                        <div
                          className="h-full bg-rh-green/60"
                          style={{ width: `${directPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs tabular-nums font-medium text-rh-light-text dark:text-rh-text w-12 text-right">
                      {exp.exposurePct.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-rh-light-muted dark:text-rh-muted w-14 text-right">
                      {formatDollars(exp.totalExposureValue)}
                    </span>
                  </div>
                  {/* Source tooltip on hover — absolutely positioned to avoid layout shift */}
                  <div className="invisible group-hover:visible absolute left-14 -top-6 flex items-center gap-1 z-10 bg-rh-light-card dark:bg-rh-card shadow-lg rounded-md px-2 py-1 border border-gray-200/40 dark:border-white/[0.08]">
                    {hasDirect && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rh-green/10 text-rh-green font-medium whitespace-nowrap">Direct</span>
                    )}
                    {[...new Set(etfSources.map(s => s.etf))].map(etf => (
                      <span key={etf} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium whitespace-nowrap">
                        {etf}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-200/30 dark:border-white/[0.04]">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-rh-green/60" />
              <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">Direct holding</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500/40" />
              <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">Via ETF</span>
            </div>
            <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 ml-auto">Hover for sources</span>
          </div>
        </div>
      )}

      {/* Per-ETF Holdings Breakdown */}
      {data.etfs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text flex items-center gap-2 px-1">
            <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            ETF Holdings Breakdown
          </h3>
          {data.etfs.map(etf => {
            const isExpanded = expandedEtf === etf.ticker;
            return (
              <div
                key={etf.ticker}
                className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedEtf(isExpanded ? null : etf.ticker)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-100/60 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{etf.ticker}</span>
                    <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                      {formatDollars(etf.value)} · {etf.holdings.length} holdings · {etf.totalHoldingsPercent.toFixed(0)}% coverage
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-rh-light-muted dark:text-rh-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="px-5 pb-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-rh-light-muted dark:text-rh-muted">
                          <th className="text-left py-1.5 font-medium">Ticker</th>
                          <th className="text-left py-1.5 font-medium">Name</th>
                          <th className="text-right py-1.5 font-medium">Weight</th>
                          <th className="text-right py-1.5 font-medium">Exposure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {etf.holdings.map(h => (
                          <tr key={h.ticker} className="border-t border-gray-200/20 dark:border-white/[0.03]">
                            <td className="py-1.5">
                              <span
                                className="font-semibold text-rh-light-text dark:text-rh-text cursor-pointer hover:text-rh-green transition-colors"
                                onClick={() => onTickerClick?.(h.ticker)}
                              >
                                {h.ticker}
                              </span>
                            </td>
                            <td className="py-1.5 text-rh-light-muted dark:text-rh-muted truncate max-w-[160px]">
                              {h.name ?? '—'}
                            </td>
                            <td className="py-1.5 text-right font-medium text-rh-light-text dark:text-rh-text">
                              {h.weightPct.toFixed(2)}%
                            </td>
                            <td className="py-1.5 text-right text-rh-light-muted dark:text-rh-muted">
                              {formatDollars(h.exposureValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {etf.unknownExposureValue > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200/20 dark:border-white/[0.03] text-xs text-rh-light-muted dark:text-rh-muted">
                        Other undisclosed holdings: {formatDollars(etf.unknownExposureValue)}
                        <span className="ml-1">({(100 - etf.totalHoldingsPercent).toFixed(0)}% not covered)</span>
                      </div>
                    )}
                    {etf.asOfDate && (
                      <div className="mt-1 text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
                        Holdings as of {etf.asOfDate}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
