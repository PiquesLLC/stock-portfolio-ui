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

  return (
    <div className={`px-6 py-4 benchmark-fade-in ${beating ? 'benchmark-ambient-green' : ''}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50">vs Benchmark</h3>
          {/* Benchmark selector */}
          <div className="flex gap-1">
            {BENCHMARKS.map(b => (
              <button
                key={b}
                onClick={() => setBenchmark(b)}
                className={`text-xs px-2.5 py-1 rounded-md transition-all duration-150 ${
                  benchmark === b
                    ? 'bg-rh-green/15 text-rh-green font-semibold shadow-sm shadow-rh-green/10'
                    : 'text-rh-light-muted/60 dark:text-rh-muted/60 hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:-translate-y-[1px]'
                }`}
              >
                <Acronym label={b} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="h-16 flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-rh-green border-t-transparent"></div>
        </div>
      ) : !data || data.snapshotCount < 2 || (youPct === 0 && data.simpleReturnPct === 0 && data.twrPct === 0) ? (
        <p className="text-sm text-rh-light-muted dark:text-rh-muted text-center py-4">
          Add holdings to compare against the market
        </p>
      ) : (
        <>
          {/* Headline — instant emotional read */}
          <p className="text-base mb-0.5">
            <span className={beating ? 'text-rh-green font-semibold' : 'text-rh-red font-semibold'}>
              {beating ? "You're beating the market" : "You're trailing the market"}
            </span>
            <span className="text-rh-light-muted/50 dark:text-rh-muted/50 font-normal ml-1.5 text-sm">
              ({window === '1D' ? 'today' : window === '1W' ? 'this week' : window === '1M' ? 'this month' : window === 'YTD' ? 'YTD' : window === '1Y' ? 'this year' : window})
            </span>
          </p>

          {/* Alpha number + inline comparison */}
          <div className="flex items-baseline gap-3 mb-2">
            <span className={`text-3xl font-bold tracking-tight ${alphaColor} ${
              beating ? 'alpha-glow-green animate-glow-pulse' : effectiveAlpha !== null && effectiveAlpha < 0 ? 'alpha-glow-red' : ''
            }`}>
              {fmt(effectiveAlpha)}
            </span>
            <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider cursor-help" title="Alpha = your return minus benchmark return">alpha vs {benchmark}</span>
          </div>

          {/* Inline comparison — instant clarity */}
          <div className="flex items-center gap-6 text-xs text-rh-light-muted/40 dark:text-rh-muted/40 mb-1">
            <span>You: <span className={`font-semibold ${(youPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>{fmt(youPct)}</span></span>
            <span>{benchmark}: <span className={`font-semibold ${(data.benchmarkReturnPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>{fmt(data.benchmarkReturnPct)}</span></span>
          </div>

        </>
      )}
    </div>
  );
}
