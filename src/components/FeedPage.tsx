import { useState, useEffect, useCallback } from 'react';
import { ActivityEvent } from '../types';
import { getFeed } from '../api';
import { ActivityCard } from './ActivityCard';

interface FeedPageProps {
  currentUserId: string;
  onUserClick: (userId: string) => void;
}

export function FeedPage({ currentUserId, onUserClick }: FeedPageProps) {
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

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text mb-4">Activity Feed</h1>
      <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-4">
        Portfolio changes from people you follow.
      </p>

      {error && (
        <div className="text-rh-red text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-rh-light-muted dark:text-rh-muted text-sm">Loading feed...</div>
      ) : events.length === 0 ? (
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-8 text-center">
          <p className="text-rh-light-muted dark:text-rh-muted text-sm">
            No activity yet. Follow other users from the Leaderboard to see their portfolio changes here.
          </p>
        </div>
      ) : (
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl divide-y divide-rh-light-border dark:divide-rh-border">
          {events.map((event) => (
            <div key={event.id} className="px-4">
              <ActivityCard event={event} showUser={true} onUserClick={onUserClick} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
