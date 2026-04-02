import { useState, useEffect, useRef } from 'react';
import { Holding } from '../types';
import { getEarningsSummary, EarningsSummaryItem } from '../api';
import EventsCalendar from './EventsCalendar';
import { earningsUpcomingCache, EARNINGS_CACHE_TTL_MS, UpcomingEarningCacheEntry } from '../utils/earnings-cache';
import { StepLoader } from './StepLoader';

const EARNINGS_STEPS = [
  'Checking upcoming reports',
  'Loading earnings estimates',
  'Analyzing beat/miss history',
  'Building earnings calendar',
];

interface EarningsTabProps {
  holdings: Holding[];
  onTickerClick?: (ticker: string) => void;
  portfolioId?: string;
}

type UpcomingEarning = UpcomingEarningCacheEntry;

function getDayLabel(daysUntil: number, dateMs: number): string {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  const d = new Date(dateMs);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatCountdown(daysUntil: number): string {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `in ${daysUntil} days`;
}

function toUpcomingEarning(item: EarningsSummaryItem): UpcomingEarning {
  const dateMs = new Date(item.reportDate + 'T00:00:00').getTime();
  return {
    ticker: item.ticker,
    date: item.reportDate,
    dateMs,
    estimatedEPS: item.estimatedEPS,
    daysUntil: item.daysUntil,
    dayLabel: getDayLabel(item.daysUntil, dateMs),
  };
}

export function EarningsTab({ holdings, onTickerClick, portfolioId }: EarningsTabProps) {
  const [upcoming, setUpcoming] = useState<UpcomingEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const currentPortfolioIdRef = useRef(portfolioId);
  currentPortfolioIdRef.current = portfolioId;

  useEffect(() => {
    mountedRef.current = true;

    // Safety net: force loading=false after 20s no matter what
    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 20_000);

    async function fetchUpcoming() {
      const fetchPortfolioId = portfolioId; // capture at call time
      // Use cache if fresh (keyed by portfolioId)
      const cached = earningsUpcomingCache.get(portfolioId);
      if (cached && Date.now() - cached.timestamp < EARNINGS_CACHE_TTL_MS) {
        setUpcoming(cached.data);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Earnings fetch timeout')), 15_000)
        );
        const { results } = await Promise.race([getEarningsSummary(portfolioId), timeoutPromise]);
        if (!mountedRef.current || fetchPortfolioId !== currentPortfolioIdRef.current) return;

        const mapped = results.map(toUpcomingEarning);
        mapped.sort((a, b) => a.daysUntil - b.daysUntil);
        earningsUpcomingCache.set(portfolioId, { data: mapped, timestamp: Date.now() });
        setUpcoming(mapped);
      } catch {
        // Fall through with empty (includes timeout)
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    fetchUpcoming();
    return () => {
      mountedRef.current = false;
      clearTimeout(safetyTimeout);
    };
  }, [holdings, portfolioId]);

  const thisWeek = upcoming.filter(e => e.daysUntil <= 7);
  const next = upcoming[0];

  return (
    <div className="space-y-6">
      {/* Countdown Hero */}
      {loading ? (
        <StepLoader title="Loading Earnings" steps={EARNINGS_STEPS} interval={2500} />
      ) : next ? (
        <div className="relative overflow-hidden border-b border-gray-200/10 dark:border-white/[0.04] pb-6">
          <div className="absolute top-3 right-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/50">Next Earnings</span>
          </div>
          <div className="flex items-center gap-5">
            {/* Countdown circle */}
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="3" className="text-amber-400/10" />
                <circle
                  cx="40" cy="40" r="36"
                  fill="none" stroke="currentColor" strokeWidth="3"
                  className="text-amber-400"
                  strokeDasharray={`${Math.max(5, (1 - next.daysUntil / 30) * 226)} 226`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-amber-500 dark:text-amber-400 tabular-nums leading-none">
                  {next.daysUntil}
                </span>
                <span className="text-[10px] text-amber-500/60 dark:text-amber-400/60">
                  {next.daysUntil === 1 ? 'day' : 'days'}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <button
                onClick={() => onTickerClick?.(next.ticker)}
                className="text-xl font-bold text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors"
              >
                {next.ticker}
              </button>
              <p className="text-sm text-rh-light-muted dark:text-rh-muted mt-0.5">
                Reports {formatCountdown(next.daysUntil)}
              </p>
              <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/50 mt-1">
                {next.dayLabel}
                {next.estimatedEPS !== null && (
                  <> · Est. EPS <span className="font-medium text-rh-light-text dark:text-rh-text">${next.estimatedEPS.toFixed(2)}</span></>
                )}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">No upcoming earnings for your holdings</p>
        </div>
      )}

      {/* This Week Row */}
      {thisWeek.length > 1 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-rh-green" />
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-muted/50 dark:text-rh-muted/50">
              This Week
            </h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {thisWeek.map((e) => (
              <button
                key={e.ticker}
                onClick={() => onTickerClick?.(e.ticker)}
                className="shrink-0 border-b border-gray-200/10 dark:border-white/[0.04] px-4 py-3.5 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors text-left min-w-[130px]"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-semibold text-sm text-rh-light-text dark:text-rh-text">{e.ticker}</span>
                  {e.daysUntil === 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </div>
                <p className="text-[11px] text-rh-light-muted dark:text-rh-muted">{e.dayLabel}</p>
                {e.estimatedEPS !== null && (
                  <p className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/50 mt-0.5">
                    Est. ${e.estimatedEPS.toFixed(2)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Full Calendar */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-4 rounded-full bg-rh-green" />
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-muted/50 dark:text-rh-muted/50">
            All Events
          </h3>
        </div>
        <EventsCalendar holdings={holdings} onTickerClick={onTickerClick} />
      </div>
    </div>
  );
}
