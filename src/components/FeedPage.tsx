import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ActivityEvent } from '../types';
import { getFeed } from '../api';
import { ActivityCard } from './ActivityCard';
import { ReportModal } from './ReportModal';
import { useMutedUsers } from '../hooks/useMutedUsers';
import { useDataEvents } from '../context/DataEventContext';

interface FeedPageProps {
  currentUserId: string;
  onUserClick: (userId: string) => void;
  onTickerClick?: (ticker: string) => void;
}

// Group consecutive events by the same user within the same time bucket
interface EventGroup {
  userId: string;
  displayName: string;
  events: ActivityEvent[];
}

// Time-grouped section
interface TimeSection {
  label: string;
  groups: EventGroup[];
}

const THRESHOLD_OPTIONS = [
  { label: 'All', value: 0 },
  { label: '$1k+', value: 1000 },
  { label: '$5k+', value: 5000 },
  { label: '$10k+', value: 10000 },
] as const;

function getTimeBucket(isoDate: string): string {
  const now = new Date();
  const d = new Date(isoDate);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return 'Earlier';
}

function groupEventsByUser(events: ActivityEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  let currentGroup: EventGroup | null = null;

  for (const event of events) {
    if (currentGroup && currentGroup.userId === event.userId) {
      currentGroup.events.push(event);
    } else {
      currentGroup = {
        userId: event.userId,
        displayName: event.displayName,
        events: [event],
      };
      groups.push(currentGroup);
    }
  }

  return groups;
}

function groupByTime(events: ActivityEvent[]): TimeSection[] {
  const bucketOrder: string[] = [];
  const bucketMap = new Map<string, ActivityEvent[]>();

  for (const event of events) {
    const label = getTimeBucket(event.createdAt);
    if (!bucketMap.has(label)) {
      bucketOrder.push(label);
      bucketMap.set(label, []);
    }
    bucketMap.get(label)!.push(event);
  }

  return bucketOrder.map((label) => ({
    label,
    groups: groupEventsByUser(bucketMap.get(label)!),
  }));
}

function isSellAction(type: string, payload: { shares?: number; previousShares?: number }): boolean {
  if (type === 'holding_removed') return true;
  if (type === 'holding_updated' && payload.previousShares && payload.shares) {
    return payload.shares < payload.previousShares;
  }
  return false;
}

function getNotionalValue(e: ActivityEvent): number {
  return (e.payload.shares && e.payload.averageCost)
    ? e.payload.shares * e.payload.averageCost
    : 0;
}

export function FeedPage({ currentUserId, onUserClick, onTickerClick }: FeedPageProps) {
  const { on } = useDataEvents();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedEnabled, setFeedEnabled] = useState(true);
  const [threshold, setThreshold] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const { isMuted, toggleMute, mutedList, unmute } = useMutedUsers();
  const [reportTarget, setReportTarget] = useState<{ userId: string; username: string } | null>(null);

  const fetchFeed = useCallback(async () => {
    try {
      setError(null);
      const data = await getFeed(currentUserId);
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!feedEnabled) return;
    fetchFeed();
    const interval = setInterval(fetchFeed, 30000);
    return () => clearInterval(interval);
  }, [fetchFeed, feedEnabled]);

  // Re-fetch immediately when watchlist changes (e.g. stock added via modal overlay)
  useEffect(() => on('watchlist:changed', fetchFeed), [on, fetchFeed]);

  // Close settings dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    if (showSettings) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSettings]);

  // Apply threshold + muted user filters
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (isMuted(e.userId)) return false;
      if (threshold > 0 && getNotionalValue(e) < threshold) return false;
      return true;
    });
  }, [events, threshold, isMuted]);

  const timeSections = useMemo(() => groupByTime(filteredEvents), [filteredEvents]);

  // Summary stats (from filtered events)
  const summary = useMemo(() => {
    const todayEvents = filteredEvents.filter(e => getTimeBucket(e.createdAt) === 'Today');
    let buys = 0;
    let sells = 0;
    for (const e of todayEvents) {
      if (isSellAction(e.type, e.payload)) sells++;
      else buys++;
    }
    return { buys, sells, total: todayEvents.length };
  }, [filteredEvents]);

  const hasTodaySection = timeSections.length > 0 && timeSections[0].label === 'Today';

  return (
    <div className="max-w-xl mx-auto">
      {/* Header with controls */}
      <div className="px-4 pt-1 pb-4 border-b border-rh-light-border/30 dark:border-white/10 flex items-center justify-between">
        <h1 className="text-xl font-bold text-rh-light-text dark:text-white">Activity</h1>
        <div className="flex items-center gap-2" ref={settingsRef}>
          {/* Threshold dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all
                ${showSettings
                  ? 'bg-gray-200/60 dark:bg-white/[0.08] text-rh-light-text dark:text-white'
                  : 'text-rh-light-muted/50 dark:text-white/30 hover:text-rh-light-muted dark:hover:text-white/50 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
                }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              {(threshold > 0 || mutedList.length > 0) && (
                <span className="text-rh-green">
                  {[
                    threshold > 0 ? THRESHOLD_OPTIONS.find(o => o.value === threshold)?.label : null,
                    mutedList.length > 0 ? `${mutedList.length} muted` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>

            {showSettings && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl overflow-hidden
                bg-white dark:bg-[#1a1a1e]/95 backdrop-blur-xl border border-gray-200 dark:border-white/[0.08] shadow-2xl shadow-black/10 dark:shadow-black/50">
                <div className="px-3 py-2 border-b border-gray-200/60 dark:border-white/[0.06]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-rh-light-muted/50 dark:text-white/30">Min Trade Size</span>
                </div>
                {THRESHOLD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setThreshold(opt.value); setShowSettings(false); }}
                    className={`w-full px-3 py-2 text-left text-[12px] font-medium transition-colors flex items-center justify-between
                      ${threshold === opt.value
                        ? 'bg-rh-green/10 text-rh-green'
                        : 'text-rh-light-muted dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/[0.04] hover:text-rh-light-text dark:hover:text-white/80'
                      }`}
                  >
                    {opt.label}
                    {threshold === opt.value && (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}

                {/* Muted users section */}
                {mutedList.length > 0 && (
                  <>
                    <div className="px-3 py-2 border-t border-gray-200/60 dark:border-white/[0.06]">
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-rh-light-muted/50 dark:text-white/30">
                        Muted ({mutedList.length})
                      </span>
                    </div>
                    <div className="max-h-32 overflow-y-auto">
                      {mutedList.map((user) => (
                        <div
                          key={user.userId}
                          className="flex items-center justify-between px-3 py-1.5 text-[12px]"
                        >
                          <span className="text-rh-light-muted dark:text-white/50 truncate mr-2">{user.displayName}</span>
                          <button
                            onClick={() => unmute(user.userId)}
                            className="text-[10px] font-semibold text-rh-green/60 hover:text-rh-green transition-colors flex-shrink-0"
                          >
                            Unmute
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* On/Off toggle pill */}
          <button
            onClick={() => setFeedEnabled(!feedEnabled)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide transition-all
              ${feedEnabled
                ? 'bg-rh-green/15 text-rh-green border border-rh-green/20'
                : 'bg-gray-100 dark:bg-white/[0.04] text-rh-light-muted dark:text-white/30 border border-gray-200/60 dark:border-white/[0.06]'
              }`}
          >
            {feedEnabled ? 'Live' : 'Off'}
          </button>
        </div>
      </div>

      {!feedEnabled ? (
        <div className="p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-white/[0.03] mx-auto mb-4 flex items-center justify-center">
            <svg className="w-7 h-7 text-rh-light-muted/30 dark:text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-rh-light-text dark:text-white font-medium mb-1">Activity paused</p>
          <p className="text-rh-light-muted/50 dark:text-white/30 text-sm">
            Tap "Off" to resume the feed.
          </p>
        </div>
      ) : (
        <>
          {/* Summary banner */}
          {!loading && filteredEvents.length > 0 && summary.total > 0 && (
            <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl bg-rh-light-bg/60 dark:bg-white/[0.04] border border-rh-light-border/40 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-rh-green animate-pulse" />
                  <span className="text-[13px] font-semibold text-rh-light-text dark:text-rh-text">Today</span>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  {summary.buys > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-rh-green/10 text-rh-green font-semibold">
                      {summary.buys} {summary.buys === 1 ? 'buy' : 'buys'}
                    </span>
                  )}
                  {summary.sells > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-rh-red/10 text-rh-red font-semibold">
                      {summary.sells} {summary.sells === 1 ? 'sell' : 'sells'}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-rh-light-muted/50 dark:text-white/25 ml-auto">
                  {summary.total} trades
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="m-4 bg-rh-red/10 border border-rh-red/30 rounded-lg p-3">
              <p className="text-rh-red text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-rh-light-bg dark:bg-white/5 mx-auto mb-4 flex items-center justify-center">
                <svg className="w-7 h-7 text-rh-light-muted/50 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-rh-light-text dark:text-white font-medium mb-1">
                {threshold > 0 ? 'No trades above threshold' : 'No activity yet'}
              </p>
              <p className="text-rh-light-muted/70 dark:text-white/50 text-sm">
                {threshold > 0
                  ? `No trades above ${THRESHOLD_OPTIONS.find(o => o.value === threshold)?.label}. Try lowering the filter.`
                  : 'Follow investors from the Leaderboard to see their trades.'}
              </p>
            </div>
          ) : (
            <div className="mt-2">
              {timeSections.map((section, sectionIdx) => {
                // Skip "Today" header when summary banner is showing
                const skipHeader = sectionIdx === 0 && hasTodaySection && summary.total > 0;

                return (
                  <div key={section.label}>
                    {!skipHeader && (
                      <div className="px-4 pt-4 pb-1.5 flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-rh-light-muted/50 dark:text-white/25">
                          {section.label}
                        </span>
                        <div className="flex-1 h-px bg-rh-light-border/15 dark:bg-white/[0.05]" />
                      </div>
                    )}

                    <div className="divide-y divide-rh-light-border/10 dark:divide-white/[0.05]">
                      {section.groups.map((group, index) => (
                        <ActivityCard
                          key={`${group.userId}-${section.label}-${index}`}
                          events={group.events}
                          onUserClick={onUserClick}
                          onTickerClick={onTickerClick}
                          onMute={toggleMute}
                          onReport={(userId, username) => setReportTarget({ userId, username })}
                          currentUserId={currentUserId}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      <ReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetUserId={reportTarget?.userId ?? ''}
        targetUsername={reportTarget?.username ?? ''}
        context="activity feed"
      />
    </div>
  );
}
