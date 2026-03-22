import { useState, useEffect, useCallback, useRef } from 'react';
import { PerformanceData, PerformanceWindow } from '../types';
import { getPerformance } from '../api';
import { Acronym } from './Acronym';

const BENCHMARKS = ['SPY', 'QQQ', 'DIA'];

function fmt(val: number | null, suffix = '%'): string {
  if (val === null) return '--';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}${suffix}`;
}

interface Props {
  refreshTrigger?: number;
  window?: PerformanceWindow;
  chartReturnPct?: number | null; // from portfolio chart, overrides API return for consistency
  portfolioId?: string;
  inline?: boolean;
}

export function BenchmarkWidget({ refreshTrigger, window: externalWindow, chartReturnPct, portfolioId, inline = false }: Props) {
  const [perfWindow, setPerfWindow] = useState<PerformanceWindow>(externalWindow || '1M');
  const [benchmark, setBenchmark] = useState('SPY');
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const currentPortfolioIdRef = useRef(portfolioId);
  currentPortfolioIdRef.current = portfolioId;

  const fetchData = useCallback(async () => {
    const fetchPortfolioId = portfolioId; // capture at call time
    try {
      setLoading(true);
      const result = await getPerformance(perfWindow, benchmark, portfolioId);
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return; // stale, discard
      setData(result);
    } catch {
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return; // stale, discard
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [perfWindow, benchmark, portfolioId]);

  // Reset data when portfolioId changes to avoid showing stale data
  useEffect(() => {
    setData(null);
  }, [portfolioId]);

  // Sync window when portfolio chart period changes — clear stale data immediately
  // so the widget never shows data from a different period while refetching
  useEffect(() => {
    if (externalWindow && externalWindow !== perfWindow) {
      setPerfWindow(externalWindow);
      setData(null);
    }
  }, [externalWindow, perfWindow]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  // Use chart return when available so "You" matches the chart exactly.
  // For non-1D periods, only use chartReturnPct (don't fall back to API) because
  // the API performance endpoint doesn't account for snapshot-only coverage.
  const youPct = chartReturnPct != null
    ? Math.round(chartReturnPct * 100) / 100
    : (perfWindow === '1D' ? (data?.simpleReturnPct ?? data?.twrPct ?? null) : null);
  const effectiveAlpha = (youPct !== null && data?.benchmarkReturnPct != null)
    ? Math.round((youPct - data.benchmarkReturnPct) * 100) / 100
    : null;

  const beating = effectiveAlpha !== null && effectiveAlpha >= 0;
  const alphaColor = effectiveAlpha === null
    ? 'text-rh-light-muted dark:text-rh-muted'
    : beating ? 'text-rh-green' : 'text-rh-red';

  const windowLabel = perfWindow === '1D' ? 'today' : perfWindow === '1W' ? 'this week' : perfWindow === '1M' ? 'this month' : perfWindow === 'YTD' ? 'YTD' : perfWindow === '1Y' ? 'this year' : perfWindow;

  if (inline) {
    // Compact inline rendering — no card, no padding, no ambient glow
    return (
      <div className="flex items-center gap-2 benchmark-fade-in">
        {loading && !data ? (
          <div className="animate-spin rounded-full h-3 w-3 border-2 border-rh-green border-t-transparent"></div>
        ) : !data || (data.twrPct == null && data.simpleReturnPct == null) ? null : (
          <>
            <span className={`text-sm font-bold ${alphaColor}`}>
              {fmt(effectiveAlpha)}
            </span>
            <div className="flex gap-1">
              {BENCHMARKS.map(b => (
                <button
                  key={b}
                  onClick={() => setBenchmark(b)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-all duration-150 ${
                    benchmark === b
                      ? 'bg-rh-green/15 text-rh-green font-semibold'
                      : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-rh-text'
                  }`}
                >
                  <Acronym label={b} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="py-4 benchmark-fade-in">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50">vs Benchmark</h3>
        {/* Benchmark selector */}
        <div className="flex gap-1">
          {BENCHMARKS.map(b => (
            <button
              key={b}
              onClick={() => setBenchmark(b)}
              className={`text-[11px] px-2 py-0.5 rounded-md transition-all duration-150 ${
                benchmark === b
                  ? 'bg-rh-green/15 text-rh-green font-semibold'
                  : 'text-rh-light-muted/50 dark:text-rh-muted/50 hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              <Acronym label={b} />
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="h-12 flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-rh-green border-t-transparent"></div>
        </div>
      ) : !data || (data.twrPct == null && data.simpleReturnPct == null) ? (
        <p className="text-xs text-rh-light-muted dark:text-rh-muted text-center py-3">
          Add holdings to compare
        </p>
      ) : (
        <>
          {/* Alpha — hero number */}
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-2xl font-bold tracking-tight ${alphaColor} ${
              beating ? 'alpha-glow-green animate-glow-pulse' : effectiveAlpha !== null && effectiveAlpha < 0 ? 'alpha-glow-red' : ''
            }`}>
              {fmt(effectiveAlpha)}
            </span>
            <span className={`text-xs font-medium ${beating ? 'text-rh-green/70' : effectiveAlpha !== null && effectiveAlpha < 0 ? 'text-rh-red/70' : 'text-rh-light-muted/40 dark:text-rh-muted/40'}`}>
              {effectiveAlpha !== null ? (beating ? 'outperforming' : 'trailing') : 'vs benchmark'} {windowLabel}
            </span>
          </div>

          {/* You vs Benchmark — compact bar */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-rh-light-muted/40 dark:text-rh-muted/40">You</span>
              <span className={`font-semibold ${(youPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>{fmt(youPct)}</span>
            </div>
            <span className="text-rh-light-muted/20 dark:text-rh-muted/20">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-rh-light-muted/40 dark:text-rh-muted/40">{benchmark}</span>
              <span className={`font-semibold ${(data.benchmarkReturnPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>{fmt(data.benchmarkReturnPct)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
