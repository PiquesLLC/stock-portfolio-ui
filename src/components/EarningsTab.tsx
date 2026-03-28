import { useState, useEffect, useRef } from 'react';
import { Holding } from '../types';
import { getEarningsSummary, EarningsSummaryItem } from '../api';
import EventsCalendar from './EventsCalendar';
import { earningsUpcomingCache, EARNINGS_CACHE_TTL_MS, UpcomingEarningCacheEntry } from '../utils/earnings-cache';

const EARNINGS_STEPS = [
  'Checking upcoming reports',
  'Loading earnings estimates',
  'Analyzing beat/miss history',
  'Building earnings calendar',
];

function EarningsLoader() {
  const [activeStep, setActiveStep] = useState(0);
  const [typedText, setTypedText] = useState('');
  const fullText = EARNINGS_STEPS[activeStep] || '';

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(prev => (prev < EARNINGS_STEPS.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTypedText('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i <= fullText.length) setTypedText(fullText.slice(0, i));
      else clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [activeStep, fullText]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-rh-light-text dark:text-white">Loading Earnings</p>
          <p className="text-[11px] text-rh-light-muted/50 dark:text-white/25">Powered by NALA</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {EARNINGS_STEPS.map((step, i) => {
          const isActive = i === activeStep;
          const isDone = i < activeStep;
          return (
            <div key={i} className={`flex items-center gap-2.5 transition-all duration-500 ${isActive ? 'opacity-100' : isDone ? 'opacity-40' : 'opacity-15'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all duration-500 ${
                isDone ? 'bg-amber-500/20 text-amber-500' : isActive ? 'bg-amber-500 text-black' : 'bg-gray-200/60 dark:bg-white/[0.06] text-rh-light-muted dark:text-white/30'
              }`}>
                {isDone ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (i + 1)}
              </div>
              <span className={`text-[12px] transition-all duration-500 ${isActive ? 'text-rh-light-text dark:text-white font-medium' : isDone ? 'text-rh-light-muted dark:text-white/50' : 'text-rh-light-muted/50 dark:text-white/30'}`}>
                {isActive ? typedText : step}
                {isActive && <span className="inline-block w-[2px] h-[12px] bg-amber-500 ml-0.5 align-middle animate-pulse" />}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 h-1 bg-gray-200/60 dark:bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500/60 to-amber-500 rounded-full transition-all duration-[2500ms] ease-linear"
          style={{ width: `${Math.min(95, ((activeStep + 1) / EARNINGS_STEPS.length) * 100)}%` }}
        />
      </div>
    </div>
  );
}

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
        <EarningsLoader />
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
