import { useState, useEffect, useRef } from 'react';
import { EarningsResponse, ParsedQuarterlyEarning } from '../types';
import { getEarnings } from '../api';

function formatEPS(v: number | null): string {
  if (v == null) return '-';
  return `$${v.toFixed(2)}`;
}

function formatQuarter(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const m = d.getMonth();
  const q = m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
  return `${q} '${String(d.getFullYear()).slice(2)}`;
}

// EPS bar chart showing beat/miss for last 8 quarters
function EPSChart({ quarters }: { quarters: ParsedQuarterlyEarning[] }) {
  const display = quarters.slice(0, 8).reverse(); // chronological order

  if (display.length === 0) return null;

  // Find max absolute EPS for scaling
  const allVals = display.flatMap(q => [q.reportedEPS, q.estimatedEPS].filter((v): v is number => v != null));
  const maxVal = Math.max(...allVals.map(Math.abs), 0.01);

  const barW = 100 / display.length;

  return (
    <div className="mb-4">
      <div className="flex items-end justify-between gap-1" style={{ height: '80px' }}>
        {display.map((q, i) => {
          const reported = q.reportedEPS ?? 0;
          const estimated = q.estimatedEPS ?? 0;
          const reportedH = Math.abs(reported) / maxVal * 60;
          const estimatedH = Math.abs(estimated) / maxVal * 60;

          return (
            <div key={i} className="flex flex-col items-center flex-1 min-w-0" style={{ maxWidth: `${barW}%` }}>
              <div className="flex items-end gap-px h-[60px] w-full justify-center">
                {/* Estimated bar */}
                <div
                  className="bg-rh-light-border dark:bg-rh-border rounded-t-sm"
                  style={{ height: `${Math.max(estimatedH, 2)}px`, width: '35%' }}
                  title={`Est: ${formatEPS(q.estimatedEPS)}`}
                />
                {/* Reported bar */}
                <div
                  className={`rounded-t-sm ${q.beat === true ? 'bg-rh-green' : q.beat === false ? 'bg-rh-red' : 'bg-rh-light-muted dark:bg-rh-muted'}`}
                  style={{ height: `${Math.max(reportedH, 2)}px`, width: '35%' }}
                  title={`Actual: ${formatEPS(q.reportedEPS)}`}
                />
              </div>
              <span className="text-[9px] text-rh-light-muted dark:text-rh-muted mt-1 truncate w-full text-center">
                {formatQuarter(q.fiscalDateEnding)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 justify-end">
        <span className="flex items-center gap-1 text-[10px] text-rh-light-muted dark:text-rh-muted">
          <span className="w-2 h-2 rounded-sm bg-rh-light-border dark:bg-rh-border inline-block" /> Estimated
        </span>
        <span className="flex items-center gap-1 text-[10px] text-rh-light-muted dark:text-rh-muted">
          <span className="w-2 h-2 rounded-sm bg-rh-green inline-block" /> Beat
        </span>
        <span className="flex items-center gap-1 text-[10px] text-rh-light-muted dark:text-rh-muted">
          <span className="w-2 h-2 rounded-sm bg-rh-red inline-block" /> Miss
        </span>
      </div>
    </div>
  );
}

// Cache per ticker
const earningsCache = new Map<string, { data: EarningsResponse; time: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function EarningsSection({ ticker }: { ticker: string }) {
  const [data, setData] = useState<EarningsResponse | null>(earningsCache.get(ticker)?.data ?? null);
  const [loading, setLoading] = useState(!earningsCache.has(ticker));
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const cached = earningsCache.get(ticker);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    setLoading(!cached);
    getEarnings(ticker)
      .then(resp => {
        if (mountedRef.current) {
          setData(resp);
          earningsCache.set(ticker, { data: resp, time: Date.now() });
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => { mountedRef.current = false; };
  }, [ticker]);

  if (loading) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-rh-light-border dark:bg-rh-border rounded w-20 mb-4" />
        <div className="h-20 bg-rh-light-border dark:bg-rh-border rounded" />
      </div>
    );
  }

  if (!data || data.quarterly.length === 0) return null;

  // Count beats/misses
  const beats = data.quarterly.filter(q => q.beat === true).length;
  const misses = data.quarterly.filter(q => q.beat === false).length;
  const total = data.quarterly.filter(q => q.beat != null).length;

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text">Earnings</h3>
        {total > 0 && (
          <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
            Beat {beats}/{total} quarters
          </span>
        )}
      </div>

      {/* EPS bar chart */}
      <EPSChart quarters={data.quarterly} />

      {/* Recent quarters table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-rh-light-muted dark:text-rh-muted border-b border-rh-light-border dark:border-rh-border">
              <th className="text-left py-1.5 pr-3 font-medium">Quarter</th>
              <th className="text-right py-1.5 px-2 font-medium">EPS</th>
              <th className="text-right py-1.5 px-2 font-medium">Est.</th>
              <th className="text-right py-1.5 px-2 font-medium">Surprise</th>
              <th className="text-right py-1.5 pl-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.quarterly.slice(0, 8).map((q, i) => (
              <tr key={i} className="border-b border-rh-light-border/50 dark:border-rh-border/50">
                <td className="py-1.5 pr-3 text-rh-light-text dark:text-rh-text font-medium">
                  {formatQuarter(q.fiscalDateEnding)}
                </td>
                <td className="py-1.5 px-2 text-right text-rh-light-text dark:text-rh-text">
                  {formatEPS(q.reportedEPS)}
                </td>
                <td className="py-1.5 px-2 text-right text-rh-light-muted dark:text-rh-muted">
                  {formatEPS(q.estimatedEPS)}
                </td>
                <td className={`py-1.5 px-2 text-right ${q.surprise != null && q.surprise >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {q.surprisePercentage != null ? `${q.surprisePercentage > 0 ? '+' : ''}${q.surprisePercentage.toFixed(1)}%` : '-'}
                </td>
                <td className="py-1.5 pl-2 text-right">
                  {q.beat === true && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rh-green/10 text-rh-green">
                      Beat
                    </span>
                  )}
                  {q.beat === false && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rh-red/10 text-rh-red">
                      Miss
                    </span>
                  )}
                  {q.beat == null && (
                    <span className="text-rh-light-muted dark:text-rh-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
