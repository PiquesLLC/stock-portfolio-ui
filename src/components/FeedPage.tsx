import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActivityEvent } from '../types';
import { getFeed } from '../api';
import { ActivityCard } from './ActivityCard';

interface FeedPageProps {
  currentUserId: string;
  onUserClick: (userId: string) => void;
  onTickerClick?: (ticker: string) => void;
}

// Group consecutive events by the same user
interface EventGroup {
  userId: string;
  displayName: string;
  events: ActivityEvent[];
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

export function FeedPage({ currentUserId, onUserClick, onTickerClick }: FeedPageProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    fetchFeed();
    const interval = setInterval(fetchFeed, 30000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  const eventGroups = useMemo(() => groupEventsByUser(events), [events]);

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="px-4 py-4 border-b border-rh-light-border/30 dark:border-white/10">
        <h1 className="text-xl font-bold text-rh-light-text dark:text-white">Activity</h1>
      </div>

      {error && (
        <div className="m-4 bg-rh-red/10 border border-rh-red/30 rounded-lg p-3">
          <p className="text-rh-red text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-rh-light-bg dark:bg-white/5 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-7 h-7 text-rh-light-muted/50 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-rh-light-text dark:text-white font-medium mb-1">No activity yet</p>
          <p className="text-rh-light-muted/70 dark:text-white/50 text-sm">
            Follow investors from the Leaderboard to see their trades.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-rh-light-border/20 dark:divide-white/[0.08]">
          {eventGroups.map((group, index) => (
            <ActivityCard
              key={`${group.userId}-${index}`}
              events={group.events}
              onUserClick={onUserClick}
              onTickerClick={onTickerClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
