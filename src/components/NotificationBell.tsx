import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertEvent as AlertEventType, PriceAlertEvent, AnalystEvent, MilestoneEvent, AnomalyEvent } from '../types';
import { getAlertEvents, getUnreadAlertCount, markAlertRead, markAllAlertsRead, getPriceAlertEvents, getUnreadPriceAlertCount, markPriceAlertEventRead, getAnalystEvents, getUnreadAnalystCount, markAnalystEventRead, markAllAnalystEventsRead, getMilestoneEvents, getUnreadMilestoneCount, markMilestoneEventRead, markAllMilestoneEventsRead, getAnomalies, getUnreadAnomalyCount, markAnomalyRead, markAllAnomaliesRead } from '../api';
import { AlertsPanel } from './AlertsPanel';

const ALERT_TYPE_LABELS: Record<string, string> = {
  drawdown: 'Drawdown',
  sector_exposure: 'Concentration',
  underperform_spy: 'Underperformance',
  '52w_high': '52W High',
  '52w_low': '52W Low',
  'ath': 'All-Time High',
  'atl': 'All-Time Low',
  volume_spike: 'Volume Spike',
  price_spike: 'Price Spike',
  sector_divergence: 'Sector Move',
  concentration: 'Concentration',
  dividend_change: 'Dividend Change',
};

// Unified notification type for display
interface UnifiedNotification {
  id: string;
  type: 'alert' | 'price_alert' | 'analyst' | 'milestone' | 'anomaly';
  label: string;
  message: string;
  read: boolean;
  createdAt: string;
  ticker?: string;
}

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
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('notificationsEnabled');
    return saved !== 'false'; // Default to true
  });
  const ref = useRef<HTMLDivElement>(null);

  const toggleNotifications = () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    localStorage.setItem('notificationsEnabled', String(newValue));
    if (!newValue) {
      setUnreadCount(0); // Hide badge when disabled
    } else {
      fetchCount(); // Refresh count when enabled
    }
  };

  const fetchCount = useCallback(async () => {
    if (!userId || !notificationsEnabled) return;
    try {
      const [alertCount, priceAlertCount, analystCount, milestoneCount, anomalyCount] = await Promise.all([
        getUnreadAlertCount(userId),
        getUnreadPriceAlertCount(userId),
        getUnreadAnalystCount(),
        getUnreadMilestoneCount(userId),
        getUnreadAnomalyCount(),
      ]);
      setUnreadCount(alertCount.count + priceAlertCount.count + analystCount.count + milestoneCount.count + anomalyCount.count);
    } catch {}
  }, [userId, notificationsEnabled]);

  const fetchEvents = useCallback(async () => {
    if (!userId) return;
    try {
      const [alertEvents, priceAlertEvents, analystEvents, milestoneEvents, anomalyEvents] = await Promise.all([
        getAlertEvents(userId),
        getPriceAlertEvents(userId, 50),
        getAnalystEvents(50),
        getMilestoneEvents(userId, 50),
        getAnomalies(50),
      ]);

      // Convert alert events to unified format
      const unifiedAlerts: UnifiedNotification[] = alertEvents.map((e: AlertEventType) => ({
        id: e.id,
        type: 'alert' as const,
        label: ALERT_TYPE_LABELS[e.alert.type] || e.alert.type,
        message: e.message,
        read: e.read,
        createdAt: e.createdAt,
      }));

      // Convert price alert events to unified format
      const unifiedPriceAlerts: UnifiedNotification[] = priceAlertEvents.map((e: PriceAlertEvent) => ({
        id: e.id,
        type: 'price_alert' as const,
        label: 'Price Alert',
        message: e.message,
        read: e.read,
        createdAt: e.createdAt,
        ticker: e.priceAlert?.ticker,
      }));

      // Convert analyst events to unified format
      const unifiedAnalyst: UnifiedNotification[] = analystEvents.map((e: AnalystEvent) => ({
        id: e.id,
        type: 'analyst' as const,
        label: e.eventType === 'target_change' ? 'Price Target' : 'Rating Change',
        message: e.message,
        read: e.read,
        createdAt: e.createdAt,
        ticker: e.ticker,
      }));

      // Convert milestone events to unified format
      const unifiedMilestones: UnifiedNotification[] = milestoneEvents.map((e: MilestoneEvent) => ({
        id: e.id,
        type: 'milestone' as const,
        label: ALERT_TYPE_LABELS[e.eventType] || e.eventType,
        message: e.message,
        read: e.read,
        createdAt: e.createdAt,
        ticker: e.ticker,
      }));

      // Convert anomaly events to unified format
      const unifiedAnomalies: UnifiedNotification[] = anomalyEvents.map((e: AnomalyEvent) => ({
        id: e.id,
        type: 'anomaly' as const,
        label: ALERT_TYPE_LABELS[e.type] || e.type.replace('_', ' '),
        message: e.title + (e.analysis ? ` — ${e.analysis}` : ''),
        read: e.read,
        createdAt: e.createdAt,
        ticker: e.ticker,
      }));

      // Merge and sort by date (newest first)
      const merged = [...unifiedAlerts, ...unifiedPriceAlerts, ...unifiedAnalyst, ...unifiedMilestones, ...unifiedAnomalies].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setNotifications(merged);

      // Refresh count
      const [alertCount, priceAlertCount, analystCount, milestoneCount, anomalyCount] = await Promise.all([
        getUnreadAlertCount(userId),
        getUnreadPriceAlertCount(userId),
        getUnreadAnalystCount(),
        getUnreadMilestoneCount(userId),
        getUnreadAnomalyCount(),
      ]);
      setUnreadCount(alertCount.count + priceAlertCount.count + analystCount.count + milestoneCount.count + anomalyCount.count);
    } catch {}
  }, [userId]);

  // Poll unread count every 30s (but not while dropdown is open)
  useEffect(() => {
    if (!open) {
      fetchCount();
      const interval = setInterval(fetchCount, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchCount, open]);

  // Track if we're in the process of marking as read
  const markingReadRef = useRef(false);

  // Load events when dropdown opens, mark as read instantly
  useEffect(() => {
    if (open) {
      fetchEvents();
      // Clear badge immediately for instant feedback
      if (unreadCount > 0) {
        setUnreadCount(0);
        // Then mark as read on server in background
        if (!markingReadRef.current) {
          markingReadRef.current = true;
          handleMarkAllRead().finally(() => {
            markingReadRef.current = false;
          });
        }
      }
    }
  }, [open]);

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

  const handleMarkRead = async (notification: UnifiedNotification) => {
    // Optimistic update — mark read in UI immediately
    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      if (notification.type === 'alert') {
        await markAlertRead(notification.id);
      } else if (notification.type === 'price_alert') {
        await markPriceAlertEventRead(notification.id);
      } else if (notification.type === 'analyst') {
        await markAnalystEventRead(notification.id);
      } else if (notification.type === 'milestone') {
        await markMilestoneEventRead(notification.id);
      } else if (notification.type === 'anomaly') {
        await markAnomalyRead(notification.id);
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      // Mark all portfolio alerts as read
      await markAllAlertsRead(userId);

      // Fetch current price alert events and mark them as read
      const priceAlertEvents = await getPriceAlertEvents(userId, 50);
      const unreadPriceAlerts = priceAlertEvents.filter(e => !e.read);
      await Promise.all(unreadPriceAlerts.map(e => markPriceAlertEventRead(e.id)));

      // Mark all analyst events as read
      await markAllAnalystEventsRead();

      // Mark all milestone events as read
      await markAllMilestoneEventsRead(userId);

      // Mark all anomaly events as read
      await markAllAnomaliesRead();

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
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
        {/* Badge always rendered to prevent layout shift, visibility controlled by opacity */}
        <span
          className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rh-red text-white text-[10px] font-bold flex items-center justify-center transition-opacity duration-150 ${
            unreadCount > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {unreadCount > 9 ? '9+' : unreadCount || '0'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto
          bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border
          rounded-xl shadow-xl z-50 scrollbar-minimal"
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

          {/* Notifications toggle */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-rh-light-border dark:border-rh-border bg-rh-light-bg/50 dark:bg-rh-dark/50">
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">
              Notifications {notificationsEnabled ? 'on' : 'off'}
            </span>
            <button
              onClick={toggleNotifications}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                notificationsEnabled ? 'bg-rh-green' : 'bg-gray-600'
              }`}
              title={notificationsEnabled ? 'Turn off notifications' : 'Turn on notifications'}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200"
                style={{ left: notificationsEnabled ? '22px' : '2px' }}
              />
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-rh-light-muted dark:text-rh-muted">
              No notifications yet
            </div>
          ) : (
            <div>
              {notifications.slice(0, 20).map(notification => (
                <div
                  key={`${notification.type}-${notification.id}`}
                  onClick={() => !notification.read && handleMarkRead(notification)}
                  className={`px-4 py-3 border-b border-rh-light-border dark:border-rh-border last:border-b-0
                    hover:bg-rh-light-bg dark:hover:bg-rh-dark/50 transition-colors cursor-pointer
                    ${!notification.read ? 'bg-blue-500/5' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!notification.read && (
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-rh-green flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium uppercase tracking-wider ${
                          notification.type === 'anomaly' ? 'text-orange-500' :
                          notification.type === 'price_alert' ? 'text-rh-green' :
                          notification.type === 'analyst' ? 'text-amber-500' :
                          notification.label === '52W High' || notification.label === 'All-Time High' ? 'text-emerald-500' :
                          notification.label === '52W Low' || notification.label === 'All-Time Low' ? 'text-rose-500' :
                          'text-rh-light-muted dark:text-rh-muted'
                        }`}>
                          {notification.label}
                        </span>
                        {notification.ticker && (
                          <span className="text-[10px] font-semibold text-rh-light-text dark:text-rh-text">
                            {notification.ticker}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-rh-light-text dark:text-rh-text mt-0.5 leading-relaxed">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-rh-light-muted dark:text-rh-muted mt-1">
                        {timeAgo(notification.createdAt)}
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
