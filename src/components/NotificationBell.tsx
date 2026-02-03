import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertEvent as AlertEventType } from '../types';
import { getAlertEvents, getUnreadAlertCount, markAlertRead, markAllAlertsRead } from '../api';
import { AlertsPanel } from './AlertsPanel';

const ALERT_TYPE_LABELS: Record<string, string> = {
  drawdown: 'Drawdown',
  sector_exposure: 'Concentration',
  underperform_spy: 'Underperformance',
  '52w_high': '52W High',
  '52w_low': '52W Low',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface Props {
  userId: string;
}

export function NotificationBell({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [events, setEvents] = useState<AlertEventType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    if (!userId) return;
    try {
      const { count } = await getUnreadAlertCount(userId);
      setUnreadCount(count);
    } catch {}
  }, [userId]);

  const fetchEvents = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getAlertEvents(userId);
      setEvents(data);
      // Refresh count too
      const { count } = await getUnreadAlertCount(userId);
      setUnreadCount(count);
    } catch {}
  }, [userId]);

  // Poll unread count every 30s
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Load events when dropdown opens
  useEffect(() => {
    if (open) fetchEvents();
  }, [open, fetchEvents]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMarkRead = async (eventId: string) => {
    await markAlertRead(eventId);
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, read: true } : e));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await markAllAlertsRead(userId);
    setEvents(prev => prev.map(e => ({ ...e, read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="group relative p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted
          hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 group-hover:animate-[bell-swing_0.6s_ease-in-out]" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ transformOrigin: 'top center' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rh-red text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto
          bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border
          rounded-xl shadow-xl z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-rh-light-border dark:border-rh-border">
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-rh-green hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => { setShowSettings(true); setOpen(false); }}
                className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text"
                title="Alert settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          {events.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-rh-light-muted dark:text-rh-muted">
              No notifications yet
            </div>
          ) : (
            <div>
              {events.slice(0, 20).map(event => (
                <div
                  key={event.id}
                  onClick={() => !event.read && handleMarkRead(event.id)}
                  className={`px-4 py-3 border-b border-rh-light-border dark:border-rh-border last:border-b-0
                    hover:bg-rh-light-bg dark:hover:bg-rh-dark/50 transition-colors cursor-pointer
                    ${!event.read ? 'bg-blue-500/5' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!event.read && (
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-rh-green flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">
                        {ALERT_TYPE_LABELS[event.alert.type] || event.alert.type}
                      </span>
                      <p className="text-xs text-rh-light-text dark:text-rh-text mt-0.5 leading-relaxed">
                        {event.message}
                      </p>
                      <p className="text-[10px] text-rh-light-muted dark:text-rh-muted mt-1">
                        {timeAgo(event.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {showSettings && (
        <AlertsPanel userId={userId} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
