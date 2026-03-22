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

// EPS comparison chart: paired bars (estimate + actual) per quarter
// hoveredTableIdx uses table ordering (0=newest). Chart displays reversed (0=oldest).
function EarningsChart({ quarters, hoveredTableIdx, setHoveredTableIdx }: {
  quarters: ParsedQuarterlyEarning[];
  hoveredTableIdx: number | null;
  setHoveredTableIdx: (idx: number | null) => void;
}) {
  const display = quarters.slice(0, 8).reverse();
  const count = display.length;
  const hovered = hoveredTableIdx != null ? count - 1 - hoveredTableIdx : null;
  if (display.length === 0) return null;

  // Collect all EPS values to determine scale
  const allEps: number[] = [];
  for (const q of display) {
    if (q.reportedEPS != null) allEps.push(q.reportedEPS);
    if (q.estimatedEPS != null) allEps.push(q.estimatedEPS);
  }
  if (allEps.length === 0) return null;

  const maxEps = Math.max(...allEps, 0);
  const minEps = Math.min(...allEps, 0);
  const range = Math.max(maxEps - minEps, 0.01);
  const chartH = 120;
  // Zero line position: distance from bottom
  const zeroFromBottom = minEps < 0 ? (Math.abs(minEps) / range) * chartH : 0;

  const hoveredQ = hovered != null ? display[hovered] : null;

  return (
    <div className="mb-4">
      {/* Inline tooltip */}
      <div className="h-5 flex items-center gap-2 px-1 mb-1">
        {hoveredQ ? (
          <>
            <span className="text-[10px] font-semibold text-rh-light-text/70 dark:text-white/60">{formatQuarter(hoveredQ.fiscalDateEnding)}</span>
            {hoveredQ.surprisePercentage != null && (
              <span className={`text-[10px] font-mono tabular-nums font-semibold ${hoveredQ.surprisePercentage >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                {hoveredQ.surprisePercentage > 0 ? '+' : ''}{hoveredQ.surprisePercentage.toFixed(1)}%
              </span>
            )}
            {hoveredQ.reportedEPS != null && (
              <span className="text-[10px] font-mono tabular-nums text-rh-light-text/50 dark:text-white/40">EPS: {formatEPS(hoveredQ.reportedEPS)}</span>
            )}
            {hoveredQ.estimatedEPS != null && (
              <span className="text-[10px] font-mono tabular-nums text-rh-light-muted/40 dark:text-white/25">Est: {formatEPS(hoveredQ.estimatedEPS)}</span>
            )}
          </>
        ) : null}
      </div>
      <div className="relative pl-7 pr-1" style={{ height: `${chartH}px` }}>
        {/* 0 axis label */}
        <span
          className="absolute left-0 text-[9px] font-mono text-rh-light-muted/30 dark:text-white/15 tabular-nums leading-none"
          style={{ bottom: `${zeroFromBottom}px`, transform: 'translateY(50%)' }}
        >0</span>
        {/* Zero line */}
        <div className="absolute left-7 right-1 h-px bg-gray-300/40 dark:bg-white/[0.08]" style={{ bottom: `${zeroFromBottom}px` }} />
        <div className="flex gap-3 h-full items-end">
          {display.map((q, i) => {
            const isRecent = i >= display.length - 4;
            const opacity = isRecent ? 1 : 0.45;
            const est = q.estimatedEPS;
            const actual = q.reportedEPS;
            const isBeat = q.beat === true;

            const estH = est != null ? Math.max((Math.abs(est) / range) * chartH, 3) : 0;
            const actualH = actual != null ? Math.max((Math.abs(actual) / range) * chartH, 3) : 0;
            const estPositive = est != null && est >= 0;
            const actualPositive = actual != null && actual >= 0;

            return (
              <div
                key={i}
                className="flex-1 min-w-0 flex justify-center"
                style={{ opacity: hovered != null ? (hovered === i ? 1 : 0.3) : opacity }}
                onMouseEnter={() => setHoveredTableIdx(count - 1 - i)}
                onMouseLeave={() => setHoveredTableIdx(null)}
              >
                <div className="relative h-full flex items-end gap-[2px]" style={{ width: '24px' }}>
                  {/* Estimate bar */}
                  {est != null && (
                    <div
                      className={`w-[10px] ${estPositive ? 'rounded-t' : 'rounded-b'} ${isBeat ? 'bg-rh-green/20' : 'bg-rh-red/20'}`}
                      style={estPositive
                        ? { position: 'absolute', bottom: `${zeroFromBottom}px`, left: 0, height: `${estH}px` }
                        : { position: 'absolute', bottom: `${zeroFromBottom - estH}px`, left: 0, height: `${estH}px` }
                      }
                    />
                  )}
                  {/* Actual EPS bar */}
                  {actual != null && (
                    <div
                      className={`w-[10px] ${actualPositive ? 'rounded-t' : 'rounded-b'} ${isBeat ? 'bg-rh-green' : 'bg-rh-red'}`}
                      style={actualPositive
                        ? { position: 'absolute', bottom: `${zeroFromBottom}px`, right: 0, height: `${actualH}px` }
                        : { position: 'absolute', bottom: `${zeroFromBottom - actualH}px`, right: 0, height: `${actualH}px` }
                      }
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Quarter labels */}
      <div className="flex gap-3 pl-7 pr-1 mt-1.5">
        {display.map((q, i) => {
          const isRecent = i >= display.length - 4;
          const isLabelHovered = hovered === i;
          return (
            <span key={i} className={`text-[8px] font-mono flex-1 text-center tabular-nums transition-colors duration-100 ${
              isLabelHovered
                ? 'text-rh-light-text/80 dark:text-white/70 font-semibold'
                : isRecent
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
  const [hoveredTableIdx, setHoveredTableIdx] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const cached = earningsCache.get(ticker);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    setData(null);
    setLoading(!cached);
    getEarnings(ticker)
      .then(resp => {
        if (requestIdRef.current === requestId) {
          setData(resp);
          earningsCache.set(ticker, { data: resp, time: Date.now() });
          setLoading(false);
        }
      })
      .catch(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [ticker]);

  useEffect(() => { setExpanded(false); }, [ticker]);

  if (loading) {
    return (
      <div className="pt-4 pb-5 mb-6 border-b border-gray-200/10 dark:border-white/[0.04] animate-pulse">
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
    <div className="pt-2 pb-2 mb-6 border-b border-gray-200/10 dark:border-white/[0.04] overflow-hidden">
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
              {/* Surprise % bars: green up / red down */}
              <EarningsChart quarters={data.quarterly} hoveredTableIdx={hoveredTableIdx} setHoveredTableIdx={setHoveredTableIdx} />

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ tableLayout: 'auto' }}>
                  <thead>
                    <tr className="border-b border-gray-200/30 dark:border-white/[0.05]">
                      <th className="text-left py-2 pr-2 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider w-[72px]">Quarter</th>
                      <th className="text-right py-2 px-1.5 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider">Est.</th>
                      <th className="text-right py-2 px-1.5 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider">EPS</th>
                      <th className="text-right py-2 px-1.5 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider">Surprise</th>
                      <th className="text-right py-2 pl-1.5 font-medium text-rh-light-muted/40 dark:text-white/20 text-[10px] uppercase tracking-wider w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.quarterly.slice(0, 8).map((q, i) => {
                      // Last 4 quarters = full opacity, older = dimmed
                      const rowOpacity = i < 4 ? 1 : 0.55;
                      const isRowHovered = hoveredTableIdx === i;
                      const anyHovered = hoveredTableIdx != null;
                      return (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: anyHovered ? (isRowHovered ? 1 : 0.35) : rowOpacity }}
                        transition={{ duration: 0.15, delay: anyHovered ? 0 : i * 0.025 }}
                        onMouseEnter={() => setHoveredTableIdx(i)}
                        onMouseLeave={() => setHoveredTableIdx(null)}
                        className={`border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0 cursor-default ${
                          isRowHovered
                            ? 'bg-gray-200/50 dark:bg-white/[0.04]'
                            : i === 0 ? 'bg-gray-100/40 dark:bg-white/[0.02]' : ''
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
                            ? 'text-rh-light-muted/60 dark:text-white/40'
                            : 'text-rh-light-muted/50 dark:text-white/30'
                        }`}>
                          {formatEPS(q.estimatedEPS)}
                        </td>
                        <td className={`py-2.5 px-1.5 text-right font-mono tabular-nums ${
                          i === 0
                            ? 'font-semibold text-rh-light-text dark:text-white/90'
                            : 'text-rh-light-text dark:text-white/80'
                        }`}>
                          {formatEPS(q.reportedEPS)}
                        </td>
                        <td className={`py-2.5 px-1.5 text-right font-mono tabular-nums ${
                          i === 0 ? 'font-semibold' : ''
                        } ${
                          q.surprisePercentage != null && q.surprisePercentage >= 0 ? 'text-rh-green' : 'text-rh-red'
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
