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
}

export function BenchmarkWidget({ refreshTrigger, window: externalWindow }: Props) {
  const [window, setWindow] = useState<PerformanceWindow>(externalWindow || '1M');
  const [benchmark, setBenchmark] = useState('SPY');
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

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

  const beating = data?.alphaPct !== null && data?.alphaPct !== undefined && data.alphaPct >= 0;
  const alphaColor = data?.alphaPct === null || data?.alphaPct === undefined
    ? 'text-rh-light-muted dark:text-rh-muted'
    : beating ? 'text-rh-green' : 'text-rh-red';

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4 shadow-sm dark:shadow-none">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-rh-light-muted dark:text-rh-muted">vs Benchmark</h3>
          {/* Benchmark selector */}
          <div className="flex gap-1">
            {BENCHMARKS.map(b => (
              <button
                key={b}
                onClick={() => setBenchmark(b)}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  benchmark === b
                    ? 'bg-rh-green/20 text-rh-green font-medium'
                    : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
              >
                <Acronym label={b} />
              </button>
            ))}
          </div>
        </div>
        {/* Window synced from portfolio chart period */}
        <span className="text-xs text-rh-light-muted dark:text-rh-muted">{window}</span>
      </div>

      {loading && !data ? (
        <div className="h-12 flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-rh-green border-t-transparent"></div>
        </div>
      ) : !data || data.snapshotCount < 2 ? (
        <p className="text-sm text-rh-light-muted dark:text-rh-muted text-center py-2">
          Not enough data yet
        </p>
      ) : (
        <>
          {/* Main alpha display */}
          <div className="flex items-baseline gap-3 mb-2">
            <span className={`text-2xl font-bold ${alphaColor}`}>
              {fmt(data.alphaPct)}
            </span>
            <span className="text-sm text-rh-light-muted dark:text-rh-muted">
              {beating ? 'Beating' : 'Trailing'} <Acronym label={benchmark} />
            </span>
          </div>

          {/* Quick stats row */}
          <div className="flex gap-4 text-xs text-rh-light-muted dark:text-rh-muted">
            <span><Acronym label="TWR" />: <span className="text-rh-light-text dark:text-rh-text font-medium">{fmt(data.twrPct)}</span></span>
            <span><Acronym label={benchmark} />: <span className="text-rh-light-text dark:text-rh-text font-medium">{fmt(data.benchmarkReturnPct)}</span></span>
            {data.volatilityPct !== null && (
              <span><Acronym label="Vol" />: <span className="text-rh-light-text dark:text-rh-text font-medium">{data.volatilityPct.toFixed(1)}%</span></span>
            )}
            {data.beta !== null && (
              <span><Acronym label="Beta" />: <span className="text-rh-light-text dark:text-rh-text font-medium">{data.beta.toFixed(2)}</span></span>
            )}
          </div>

          {/* Expandable details */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mt-2 transition-colors"
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>

          {showDetails && (
            <div className="mt-3 pt-3 border-t border-rh-light-border dark:border-rh-border grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-rh-light-muted dark:text-rh-muted"><Acronym label="TWR" /></p>
                <p className={`font-medium ${(data.twrPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>{fmt(data.twrPct)}</p>
              </div>
              <div>
                <p className="text-rh-light-muted dark:text-rh-muted"><Acronym label="MWR" /> (<Acronym label="XIRR" />)</p>
                <p className={`font-medium ${(data.mwrPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {data.mwrPct !== null && Math.abs(data.mwrPct) > 10000 ? 'N/A' : fmt(data.mwrPct)}
                </p>
              </div>
              <div>
                <p className="text-rh-light-muted dark:text-rh-muted">Correlation</p>
                <p className="text-rh-light-text dark:text-rh-text font-medium">
                  {data.correlation !== null ? data.correlation.toFixed(2) : '--'}
                </p>
              </div>
              <div>
                <p className="text-rh-light-muted dark:text-rh-muted">Max Drawdown</p>
                <p className="text-rh-red font-medium">{data.maxDrawdownPct !== null ? `-${data.maxDrawdownPct.toFixed(2)}%` : '--'}</p>
              </div>
              {data.bestDay && (
                <div>
                  <p className="text-rh-light-muted dark:text-rh-muted">Best Day</p>
                  <p className="text-rh-green font-medium">{fmt(data.bestDay.returnPct)}</p>
                  <p className="text-rh-light-muted dark:text-rh-muted">{data.bestDay.date}</p>
                </div>
              )}
              {data.worstDay && (
                <div>
                  <p className="text-rh-light-muted dark:text-rh-muted">Worst Day</p>
                  <p className="text-rh-red font-medium">{fmt(data.worstDay.returnPct)}</p>
                  <p className="text-rh-light-muted dark:text-rh-muted">{data.worstDay.date}</p>
                </div>
              )}
              <div>
                <p className="text-rh-light-muted dark:text-rh-muted">Snapshots</p>
                <p className="text-rh-light-text dark:text-rh-text font-medium">{data.snapshotCount}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
