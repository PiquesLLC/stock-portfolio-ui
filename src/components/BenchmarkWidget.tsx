import { useState, useEffect, useCallback } from 'react';
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
}

export function BenchmarkWidget({ refreshTrigger, window: externalWindow, chartReturnPct }: Props) {
  const [window, setWindow] = useState<PerformanceWindow>(externalWindow || '1M');
  const [benchmark, setBenchmark] = useState('SPY');
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getPerformance(window, benchmark);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [window, benchmark]);

  // Sync window when portfolio chart period changes
  useEffect(() => {
    if (externalWindow) setWindow(externalWindow);
  }, [externalWindow]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  // Use chart return when available so "You" matches the chart exactly
  const youPct = chartReturnPct != null ? Math.round(chartReturnPct * 100) / 100 : (data?.simpleReturnPct ?? data?.twrPct ?? null);
  const effectiveAlpha = (youPct !== null && data?.benchmarkReturnPct != null)
    ? Math.round((youPct - data.benchmarkReturnPct) * 100) / 100
    : data?.alphaPct ?? null;

  const beating = effectiveAlpha !== null && effectiveAlpha >= 0;
  const alphaColor = effectiveAlpha === null
    ? 'text-rh-light-muted dark:text-rh-muted'
    : beating ? 'text-rh-green' : 'text-rh-red';

  const windowLabel = window === '1D' ? 'today' : window === '1W' ? 'this week' : window === '1M' ? 'this month' : window === 'YTD' ? 'YTD' : window === '1Y' ? 'this year' : window;

  return (
    <div className={`px-6 py-4 benchmark-fade-in ${beating ? 'benchmark-ambient-green' : ''}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
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
              {beating ? 'outperforming' : 'trailing'} {windowLabel}
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
