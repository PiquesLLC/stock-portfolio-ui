import { useState, useEffect, useRef } from 'react';
import { Holding, EarningsResponse, DividendEvent } from '../types';
import { getEarnings, getUpcomingDividends } from '../api';
import { SkeletonCard } from './SkeletonCard';

// ═══════════════════════════════════════════════════════════════════════════
// Module-level cache with 5min TTL
// ═══════════════════════════════════════════════════════════════════════════

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

const earningsCache: Record<string, CacheEntry<EarningsResponse>> = {};
let dividendsCache: CacheEntry<DividendEvent[]> | null = null;

function getCached<T>(entry: CacheEntry<T> | null | undefined): T | null {
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry.data;
}

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface EarningsEvent {
  type: 'earnings';
  ticker: string;
  date: string;         // ISO date string
  dateMs: number;
  fiscalDateEnding: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  beat: boolean | null;
  surprise: number | null;
  surprisePercentage: number | null;
  isUpcoming: boolean;
}

interface DividendCalendarEvent {
  type: 'dividend';
  ticker: string;
  date: string;
  dateMs: number;
  exDate: string;
  payDate: string;
  amountPerShare: number;
}

type CalendarEvent = EarningsEvent | DividendCalendarEvent;

interface DateGroup {
  label: string;
  events: CalendarEvent[];
}

interface EventsCalendarProps {
  holdings: Holding[];
  onTickerClick?: (ticker: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function getDateGroupLabel(dateMs: number, now: Date): string {
  const eventDate = new Date(dateMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < -30) return 'Older';
  if (diffDays < 0) return 'Last 30 Days';
  if (diffDays === 0) return 'Today';
  if (diffDays <= 30) return 'Next 30 Days';
  return 'Later';
}

const GROUP_ORDER: Record<string, number> = {
  'Last 30 Days': -1,
  'Older': -2,
  'Today': 0,
  'Next 30 Days': 1,
  'Later': 2,
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatEPS(val: number | null): string {
  if (val === null) return '--';
  return `$${val.toFixed(2)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function EventsCalendar({ holdings, onTickerClick }: EventsCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function fetchAll() {
      if (holdings.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const allEvents: CalendarEvent[] = [];

      // Fetch earnings for each holding (use cache when available)
      const earningsPromises = holdings.map(async (h) => {
        const ticker = h.ticker;
        try {
          const cached = getCached(earningsCache[ticker]);
          let earningsData: EarningsResponse;
          if (cached) {
            earningsData = cached;
          } else {
            earningsData = await getEarnings(ticker);
            earningsCache[ticker] = { data: earningsData, timestamp: Date.now() };
          }

          // Process quarterly earnings
          for (const q of earningsData.quarterly) {
            const reportDate = new Date(q.reportedDate + 'T00:00:00');
            const isUpcoming = q.reportedEPS === null || reportDate > now;
            const isRecent = !isUpcoming && reportDate >= thirtyDaysAgo;

            if (isUpcoming || isRecent) {
              allEvents.push({
                type: 'earnings',
                ticker,
                date: q.reportedDate,
                dateMs: reportDate.getTime(),
                fiscalDateEnding: q.fiscalDateEnding,
                reportedEPS: q.reportedEPS,
                estimatedEPS: q.estimatedEPS,
                beat: q.beat,
                surprise: q.surprise,
                surprisePercentage: q.surprisePercentage,
                isUpcoming,
              });
            }
          }
        } catch (e) {
          console.error(`Failed to fetch earnings for ${ticker}:`, e);
        }
      });

      // Fetch upcoming dividends
      const dividendPromise = (async () => {
        try {
          const cached = getCached(dividendsCache);
          let dividendData: DividendEvent[];
          if (cached) {
            dividendData = cached;
          } else {
            dividendData = await getUpcomingDividends();
            dividendsCache = { data: dividendData, timestamp: Date.now() };
          }

          // Only include dividends for tickers we hold
          const heldTickers = new Set(holdings.map(h => h.ticker.toUpperCase()));
          for (const d of dividendData) {
            if (!heldTickers.has(d.ticker.toUpperCase())) continue;
            const exDateMs = new Date(d.exDate + 'T00:00:00').getTime();
            allEvents.push({
              type: 'dividend',
              ticker: d.ticker,
              date: d.exDate,
              dateMs: exDateMs,
              exDate: d.exDate,
              payDate: d.payDate,
              amountPerShare: d.amountPerShare,
            });
          }
        } catch (e) {
          console.error('Failed to fetch upcoming dividends:', e);
        }
      })();

      await Promise.allSettled([...earningsPromises, dividendPromise]);

      if (!mountedRef.current) return;

      // Sort by date ascending
      allEvents.sort((a, b) => a.dateMs - b.dateMs);
      setEvents(allEvents);
      setLoading(false);
    }

    fetchAll().catch((e) => {
      if (mountedRef.current) {
        setError(e.message || 'Failed to load events');
        setLoading(false);
      }
    });

    return () => { mountedRef.current = false; };
  }, [holdings]);

  // Group events by date category
  const now = new Date();
  const groups: DateGroup[] = [];
  const groupMap = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const label = getDateGroupLabel(event.dateMs, now);
    if (!groupMap.has(label)) {
      groupMap.set(label, []);
    }
    groupMap.get(label)!.push(event);
  }

  for (const [label, groupEvents] of groupMap) {
    // Past groups: most recent first; future groups: soonest first
    const order = GROUP_ORDER[label] ?? 99;
    const sorted = [...groupEvents].sort((a, b) =>
      order < 0 ? b.dateMs - a.dateMs : a.dateMs - b.dateMs
    );
    groups.push({ label, events: sorted });
  }
  groups.sort((a, b) => (GROUP_ORDER[a.label] ?? 99) - (GROUP_ORDER[b.label] ?? 99));

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard lines={3} height="120px" />
        <SkeletonCard lines={4} height="160px" />
        <SkeletonCard lines={3} height="120px" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl p-8 text-center">
        <svg className="w-10 h-10 mx-auto mb-3 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">{error}</p>
      </div>
    );
  }

  // ── Empty ──
  if (events.length === 0) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl p-12 text-center">
        <svg className="w-12 h-12 mx-auto mb-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-rh-light-text dark:text-rh-text font-medium mb-1">No upcoming events</p>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Earnings and dividend events for your holdings will appear here.
        </p>
      </div>
    );
  }

  // ── Timeline ──
  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-rh-green/20 rounded-xl px-4 py-2.5">
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">Total Events</span>
          <p className="text-lg font-semibold text-rh-green tabular-nums">{events.length}</p>
        </div>
        <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-amber-400/20 rounded-xl px-4 py-2.5">
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">Earnings</span>
          <p className="text-lg font-semibold text-amber-500 dark:text-amber-400 tabular-nums">
            {events.filter(e => e.type === 'earnings').length}
          </p>
        </div>
        <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-blue-400/20 rounded-xl px-4 py-2.5">
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">Dividends</span>
          <p className="text-lg font-semibold text-blue-500 dark:text-blue-400 tabular-nums">
            {events.filter(e => e.type === 'dividend').length}
          </p>
        </div>
      </div>

      {/* Date groups */}
      {groups.map((group) => (
        <div key={group.label}>
          {/* Group header */}
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{group.label}</h3>
            <div className="flex-1 h-px bg-gray-200/60 dark:bg-white/[0.06]" />
            <span className="text-xs text-rh-light-muted dark:text-rh-muted tabular-nums">
              {group.events.length} event{group.events.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Events in this group */}
          <div className="space-y-2">
            {group.events.map((event, idx) => (
              <EventCard key={`${event.ticker}-${event.type}-${event.date}-${idx}`} event={event} onTickerClick={onTickerClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Card
// ═══════════════════════════════════════════════════════════════════════════

function EventCard({ event, onTickerClick }: { event: CalendarEvent; onTickerClick?: (ticker: string) => void }) {
  if (event.type === 'earnings') {
    return <EarningsCard event={event} onTickerClick={onTickerClick} />;
  }
  return <DividendCard event={event} onTickerClick={onTickerClick} />;
}

function EarningsCard({ event, onTickerClick }: { event: EarningsEvent; onTickerClick?: (ticker: string) => void }) {
  const beatColor = event.beat === true
    ? 'text-rh-green'
    : event.beat === false
      ? 'text-rh-red'
      : 'text-rh-light-muted dark:text-rh-muted';

  const beatBg = event.beat === true
    ? 'bg-rh-green/10 border-rh-green/20'
    : event.beat === false
      ? 'bg-rh-red/10 border-rh-red/20'
      : 'bg-gray-100/60 dark:bg-white/[0.02] border-gray-200/40 dark:border-white/[0.06]';

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl p-4 flex items-center gap-4">
      {/* Date column */}
      <div className="text-center min-w-[52px]">
        <p className="text-xs text-rh-light-muted dark:text-rh-muted">{formatDate(event.date)}</p>
      </div>

      {/* Divider */}
      <div className="w-px h-10 bg-gray-200/60 dark:bg-white/[0.06]" />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => onTickerClick?.(event.ticker)} className="font-semibold text-sm text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors">{event.ticker}</button>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-400/15 text-amber-500 dark:text-amber-400 border border-amber-400/20">
            Earnings
          </span>
          {event.isUpcoming && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-400/15 text-blue-500 dark:text-blue-400 border border-blue-400/20">
              Upcoming
            </span>
          )}
        </div>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted truncate">
          Fiscal quarter ending {event.fiscalDateEnding}
        </p>
      </div>

      {/* EPS data */}
      <div className="text-right shrink-0">
        {event.reportedEPS !== null ? (
          <div className={`inline-flex flex-col items-end px-3 py-1.5 rounded-lg border ${beatBg}`}>
            <span className={`text-sm font-semibold tabular-nums ${beatColor}`}>
              {formatEPS(event.reportedEPS)}
            </span>
            <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
              vs est. {formatEPS(event.estimatedEPS)}
            </span>
            {event.surprisePercentage !== null && (
              <span className={`text-[10px] font-medium tabular-nums ${beatColor}`}>
                {event.beat ? '+' : ''}{event.surprisePercentage.toFixed(1)}%
              </span>
            )}
          </div>
        ) : (
          <div className="inline-flex flex-col items-end px-3 py-1.5 rounded-lg border bg-gray-100/60 dark:bg-white/[0.02] border-gray-200/40 dark:border-white/[0.06]">
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">Est.</span>
            <span className="text-sm font-semibold tabular-nums text-rh-light-text dark:text-rh-text">
              {formatEPS(event.estimatedEPS)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function DividendCard({ event, onTickerClick }: { event: DividendCalendarEvent; onTickerClick?: (ticker: string) => void }) {
  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl p-4 flex items-center gap-4">
      {/* Date column */}
      <div className="text-center min-w-[52px]">
        <p className="text-xs text-rh-light-muted dark:text-rh-muted">{formatDate(event.exDate)}</p>
      </div>

      {/* Divider */}
      <div className="w-px h-10 bg-gray-200/60 dark:bg-white/[0.06]" />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => onTickerClick?.(event.ticker)} className="font-semibold text-sm text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors">{event.ticker}</button>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-400/15 text-blue-500 dark:text-blue-400 border border-blue-400/20">
            Dividend
          </span>
        </div>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted truncate">
          Ex-date {formatDate(event.exDate)} &middot; Pay date {formatDate(event.payDate)}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <div className="inline-flex flex-col items-end px-3 py-1.5 rounded-lg border bg-blue-400/10 border-blue-400/20">
          <span className="text-sm font-semibold tabular-nums text-blue-500 dark:text-blue-400">
            ${event.amountPerShare.toFixed(2)}
          </span>
          <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">per share</span>
        </div>
      </div>
    </div>
  );
}
