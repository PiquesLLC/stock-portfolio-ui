import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

// Side-by-side comparison bars: faint estimate behind, colored actual in front
function ComparisonChart({ quarters }: { quarters: ParsedQuarterlyEarning[] }) {
  const display = quarters.slice(0, 8).reverse();
  if (display.length === 0) return null;

  // Scale bars by EPS value — find max across all reported & estimated
  const allValues = display.flatMap(q => [q.reportedEPS, q.estimatedEPS].filter((v): v is number => v != null));
  const maxEPS = Math.max(...allValues, 0.01);
  const barMaxH = 64;

  return (
    <div className="mb-4">
      {/* Baseline + bars */}
      <div className="relative px-1">
        {/* Baseline line — slightly brightened */}
        <div className="absolute bottom-0 left-1 right-1 h-px bg-gray-300/40 dark:bg-white/[0.08]" />
        <div className="flex items-end gap-3" style={{ height: `${barMaxH + 8}px` }}>
          {display.map((q, i) => {
            const estH = q.estimatedEPS != null ? Math.max((q.estimatedEPS / maxEPS) * barMaxH, 3) : 0;
            const actH = q.reportedEPS != null ? Math.max((q.reportedEPS / maxEPS) * barMaxH, 3) : 0;
            const isBeat = q.beat === true;
            const isMiss = q.beat === false;
            // Recency: last 4 (rightmost) = full, older = dimmed
            const isRecent = i >= display.length - 4;
            const opacity = isRecent ? 1 : 0.45;

            return (
              <div key={i} className="flex-1 min-w-0 flex items-end justify-center" style={{ opacity }}>
                <div className="relative flex items-end justify-center">
                  {/* Estimated bar — narrower, faint */}
                  {estH > 0 && (
                    <div
                      className="w-[11px] rounded-t bg-gray-400/35 dark:bg-white/[0.14]"
                      style={{ height: `${estH}px` }}
                    />
                  )}
                  {/* Actual bar — full width, colored */}
                  {actH > 0 && (
                    <div
                      className={`w-[14px] rounded-t ml-[2px] ${
                        isMiss ? 'bg-rh-red' :
                        isBeat ? 'bg-rh-green' :
                        'bg-gray-400/50 dark:bg-white/[0.2]'
                      }`}
                      style={{ height: `${actH}px` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Quarter labels */}
      <div className="flex gap-3 px-1 mt-1.5">
        {display.map((q, i) => {
          const isRecent = i >= display.length - 4;
          return (
            <span key={i} className={`text-[8px] font-mono flex-1 text-center tabular-nums ${
              isRecent
                ? 'text-rh-light-muted/50 dark:text-white/25'
                : 'text-rh-light-muted/30 dark:text-white/12'
            }`}>
              {formatQuarter(q.fiscalDateEnding)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Collapsed streak: small colored dots with recency-based opacity
function StreakDots({ quarters }: { quarters: ParsedQuarterlyEarning[] }) {
  const display = quarters.slice(0, 8).reverse();
  const total = display.length;
  return (
    <div className="flex items-center gap-1.5">
      {display.map((q, i) => {
        // Last 4 quarters (rightmost) = full opacity, older = dimmed
        const recentIndex = total - 1 - i; // 0 = oldest shown, total-1 = newest
        const isRecent = recentIndex < 4;
        const opacity = isRecent ? 1 : 0.35;
        return (
          <div
            key={i}
            style={{ opacity }}
            className={`w-[5px] h-[5px] rounded-full ${
              q.beat === true ? 'bg-rh-green' :
              q.beat === false ? 'bg-rh-red' :
              'bg-gray-400/40 dark:bg-white/[0.15]'
            }`}
          />
        );
      })}
    </div>
  );
}

// Dynamic tagline based on beat ratio
function getEarningsTagline(beats: number, total: number): string {
  if (total === 0) return '';
  const ratio = beats / total;
  if (ratio >= 0.9) return 'Reliable earnings execution';
  if (ratio >= 0.75) return 'Consistent beat track record';
  if (ratio >= 0.5) return 'Mixed earnings history';
  if (ratio >= 0.25) return 'Frequently misses estimates';
  return 'Struggles to meet expectations';
}

const earningsCache = new Map<string, { data: EarningsResponse; time: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function EarningsSection({ ticker }: { ticker: string }) {
  const [data, setData] = useState<EarningsResponse | null>(earningsCache.get(ticker)?.data ?? null);
  const [loading, setLoading] = useState(!earningsCache.has(ticker));
  const [expanded, setExpanded] = useState(false);
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

  useEffect(() => { setExpanded(false); }, [ticker]);

  if (loading) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl p-5 mb-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-200/50 dark:bg-white/[0.06] rounded w-16" />
          <div className="flex gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[5px] h-[5px] rounded-full bg-gray-200/40 dark:bg-white/[0.04]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.quarterly.length === 0) return null;

  const beats = data.quarterly.filter(q => q.beat === true).length;
  const total = data.quarterly.filter(q => q.beat != null).length;
  const latest = data.quarterly[0];
  const tagline = getEarningsTagline(beats, total);

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl mb-6 overflow-hidden">
      {/* Collapsed card */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors duration-150"
      >
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-rh-light-text/90 dark:text-white/90 tracking-tight">Earnings</h3>
            {total > 0 && (
              <span className="font-mono text-[11px] text-rh-light-muted/40 dark:text-white/25 tabular-nums">
                Beat {beats} of {total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {latest?.reportedEPS != null && (
              <span className="font-mono text-xs text-rh-light-text/80 dark:text-white/70 tabular-nums">
                {formatEPS(latest.reportedEPS)}
              </span>
            )}
            {latest?.estimatedEPS != null && (
              <span className="font-mono text-[11px] text-rh-light-muted/35 dark:text-white/20 tabular-nums">
                est. {formatEPS(latest.estimatedEPS)}
              </span>
            )}
            {tagline && (
              <>
                <span className="text-rh-light-muted/15 dark:text-white/[0.06]">&middot;</span>
                <span className="text-[11px] text-rh-light-muted/40 dark:text-white/20 italic">
                  {tagline}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3.5">
          {/* Dots visible only when collapsed */}
          <AnimatePresence>
            {!expanded && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <StreakDots quarters={data.quarterly} />
              </motion.div>
            )}
          </AnimatePresence>
          <motion.svg
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="w-3.5 h-3.5 text-rh-light-muted/25 dark:text-white/10 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </div>
      </button>

      {/* Expanded view */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              {/* Comparison bars: faint estimate + colored actual */}
              <ComparisonChart quarters={data.quarterly} />

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ tableLayout: 'auto' }}>
                  <thead>
                    <tr className="border-b border-gray-200/30 dark:border-white/[0.05]">
                      <th className="text-left py-2 pr-2 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider w-[72px]">Quarter</th>
                      <th className="text-right py-2 px-1.5 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider">EPS</th>
                      <th className="text-right py-2 px-1.5 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider">Est.</th>
                      <th className="text-right py-2 px-1.5 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider">Surprise</th>
                      <th className="text-right py-2 pl-1.5 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.quarterly.slice(0, 8).map((q, i) => {
                      // Last 4 quarters = full opacity, older = dimmed
                      const rowOpacity = i < 4 ? 1 : 0.55;
                      return (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: rowOpacity }}
                        transition={{ duration: 0.15, delay: i * 0.025 }}
                        className={`border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0 ${
                          i === 0 ? 'bg-gray-100/40 dark:bg-white/[0.02]' : ''
                        }`}
                      >
                        <td className={`py-2.5 pr-2 font-mono tabular-nums w-[72px] ${
                          i === 0
                            ? 'font-semibold text-rh-light-text dark:text-white/80'
                            : 'font-medium text-rh-light-text/80 dark:text-white/60'
                        }`}>
                          {formatQuarter(q.fiscalDateEnding)}
                        </td>
                        <td className={`py-2.5 px-1.5 text-right font-mono tabular-nums ${
                          i === 0
                            ? 'font-semibold text-rh-light-text dark:text-white/90'
                            : 'text-rh-light-text dark:text-white/80'
                        }`}>
                          {formatEPS(q.reportedEPS)}
                        </td>
                        <td className={`py-2.5 px-1.5 text-right font-mono tabular-nums ${
                          i === 0
                            ? 'text-rh-light-muted/60 dark:text-white/40'
                            : 'text-rh-light-muted/50 dark:text-white/30'
                        }`}>
                          {formatEPS(q.estimatedEPS)}
                        </td>
                        <td className={`py-2.5 px-1.5 text-right font-mono tabular-nums ${
                          i === 0 ? 'font-semibold' : ''
                        } ${
                          q.surprise != null && q.surprise >= 0 ? 'text-rh-green' : 'text-rh-red'
                        }`}>
                          {q.surprisePercentage != null
                            ? `${q.surprisePercentage > 0 ? '+' : ''}${q.surprisePercentage.toFixed(1)}%`
                            : '-'}
                        </td>
                        <td className="py-2.5 pl-1.5 text-right">
                          {q.beat === true && (
                            <span className={`font-mono text-[10px] text-rh-green ${i === 0 ? 'font-semibold' : ''}`}>Beat</span>
                          )}
                          {q.beat === false && (
                            <span className={`font-mono text-[10px] text-rh-red ${i === 0 ? 'font-semibold' : ''}`}>Miss</span>
                          )}
                          {q.beat == null && (
                            <span className="font-mono text-[10px] text-rh-light-muted/30 dark:text-white/15">-</span>
                          )}
                        </td>
                      </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
