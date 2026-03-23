import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertEvent as AlertEventType, PriceAlertEvent, AnalystEvent, MilestoneEvent, AnomalyEvent, SocialNotificationData } from '../types';
import { getAlertEvents, getUnreadAlertCount, markAlertRead, markAllAlertsRead, getPriceAlertEvents, getUnreadPriceAlertCount, markPriceAlertEventRead, getAnalystEvents, getUnreadAnalystCount, markAllAnalystEventsRead, getMilestoneEvents, getUnreadMilestoneCount, markMilestoneEventRead, markAllMilestoneEventsRead, getAnomalies, markAnomalyRead, getSocialNotifications, getUnreadSocialNotifCount, markSocialNotifRead, markAllSocialNotifsRead } from '../api';
import { AlertsPanel } from './AlertsPanel';
import { isPushSupported, subscribeToPush, unsubscribeFromPush, isPushSubscribed, getPushPermission } from '../utils/push';
import { useToast } from '../context/ToastContext';
import { timeAgo } from '../utils/format';
import { isNative, platform } from '../utils/platform';

const ALERT_TYPE_LABELS: Record<string, string> = {
  drawdown: 'Drawdown',
  underperform_spy: 'Underperformance',
  '52w_high': '52W High',
  '52w_low': '52W Low',
  'ath': 'All-Time High',
  'atl': 'All-Time Low',
  volume_spike: 'Volume Spike',
  price_spike: 'Price Spike',
  sector_divergence: 'Sector Move',
  dividend_change: 'Dividend Change',
  congress_trade: 'Congress Trade',
};

// Unified notification type for display
interface UnifiedNotification {
  id: string;
  type: 'alert' | 'price_alert' | 'analyst' | 'milestone' | 'anomaly' | 'social';
  label: string;
  message: string;
  read: boolean;
  createdAt: string;
  ticker?: string;
}

function isVisibleAnomaly(event: AnomalyEvent): boolean {
  return event.type !== 'concentration';
}

function groupByDay(notifications: UnifiedNotification[]): { label: string; items: UnifiedNotification[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  const groups: { label: string; items: UnifiedNotification[] }[] = [];
  let currentLabel = '';

  for (const n of notifications) {
    const t = new Date(n.createdAt).getTime();
    const label = t >= today ? 'Today' : t >= yesterday ? 'Yesterday' : 'Earlier';
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, items: [] });
    }
    groups[groups.length - 1].items.push(n);
  }
  return groups;
}

// Play a short notification chime using Web Audio API
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.setValueAtTime(1108, ctx.currentTime + 0.08); // C#6
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
}

interface Props {
  userId: string;
  onTickerClick?: (ticker: string) => void;
}

export function NotificationBell({ userId, onTickerClick }: Props) {
  const { showToast } = useToast();
  const isNativeIos = isNative && platform === 'ios';
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('notificationsEnabled');
    return saved !== 'false'; // Default to true
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('notificationSoundEnabled');
    return saved !== 'false'; // Default to true
  });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const pushSupported = isPushSupported();
  const prevUnreadRef = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  const baseTitleRef = useRef(document.title.replace(/^\(\d+\)\s*/, ''));

  // Check push subscription status on mount
  useEffect(() => {
    if (pushSupported) {
      isPushSubscribed().then(setPushEnabled);
    }
  }, [pushSupported]);

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

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem('notificationSoundEnabled', String(newValue));
    if (newValue) playNotificationSound(); // Preview sound on enable
  };

  const togglePush = async () => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
        showToast('Push notifications disabled', 'info');
      } else {
        const permission = getPushPermission();
        if (permission === 'unsupported') {
          showToast('Push not supported — install the app to your home screen first', 'error');
          return;
        }
        if (permission === 'denied') {
          showToast('Push blocked — enable notifications in your device settings', 'error');
          return;
        }
        const ok = await subscribeToPush();
        setPushEnabled(ok);
        if (ok) {
          showToast('Push notifications enabled! You\'ll get alerts even when the app is closed.', 'success');
        } else {
          showToast('Could not enable push — check browser console for details', 'error');
        }
      }
    } finally {
      setPushLoading(false);
    }
  };

  const fetchCount = useCallback(async () => {
    if (!userId || !notificationsEnabled) return;
    try {
      const [alertCount, priceAlertCount, analystCount, milestoneCount, anomalyEvents, socialCount] = await Promise.all([
        getUnreadAlertCount(userId),
        getUnreadPriceAlertCount(userId),
        getUnreadAnalystCount(),
        getUnreadMilestoneCount(),
        getAnomalies(100),
        getUnreadSocialNotifCount().catch(() => ({ count: 0 })),
      ]);
      const visibleUnreadAnomalyCount = (anomalyEvents || []).filter((event: AnomalyEvent) => isVisibleAnomaly(event) && !event.read).length;
      setUnreadCount((alertCount?.count ?? 0) + (priceAlertCount?.count ?? 0) + (analystCount?.count ?? 0) + (milestoneCount?.count ?? 0) + visibleUnreadAnomalyCount + (socialCount?.count ?? 0));
    } catch { /* silent — background poll, 401s are expected when session expires */ }
  }, [userId, notificationsEnabled]);

  const fetchEvents = useCallback(async (): Promise<UnifiedNotification[]> => {
    if (!userId) return [];
    try {
      const [alertEvents, priceAlertEvents, analystEvents, milestoneEvents, anomalyEvents, socialEvents] = await Promise.all([
        getAlertEvents(userId),
        getPriceAlertEvents(userId, 50),
        getAnalystEvents(50),
        getMilestoneEvents(50),
        getAnomalies(50),
        getSocialNotifications(50).catch(() => [] as SocialNotificationData[]),
      ]);

      // Convert alert events — filter orphaned events where parent Alert was deleted
      const unifiedAlerts: UnifiedNotification[] = (alertEvents || []).filter((e: AlertEventType) => e?.alert).map((e: AlertEventType) => ({
        id: e.id,
        type: 'alert' as const,
        label: ALERT_TYPE_LABELS[e.alert.type] || e.alert.type,
        message: e.message,
        read: e.read,
        createdAt: e.createdAt,
      }));

      // Convert price alert events — guard against orphaned/malformed events
      const unifiedPriceAlerts: UnifiedNotification[] = (priceAlertEvents || []).filter((e: PriceAlertEvent) => e?.message).map((e: PriceAlertEvent) => ({
        id: e.id,
        type: 'price_alert' as const,
        label: 'Price Alert',
        message: e.message,
        read: e.read,
        createdAt: e.createdAt,
        ticker: e.priceAlert?.ticker,
      }));

      // Convert analyst events
      const unifiedAnalyst: UnifiedNotification[] = (analystEvents || []).map((e: AnalystEvent) => ({
        id: e.id,
        type: 'analyst' as const,
        label: e.eventType === 'target_change' ? 'Price Target' : 'Rating Change',
        message: e.message ?? '',
        read: e.read,
        createdAt: e.createdAt,
        ticker: e.ticker,
      }));

      // Convert milestone events
      const unifiedMilestones: UnifiedNotification[] = (milestoneEvents || []).map((e: MilestoneEvent) => ({
        id: e.id,
        type: 'milestone' as const,
        label: ALERT_TYPE_LABELS[e.eventType] || e.eventType,
        message: e.message ?? '',
        read: e.read,
        createdAt: e.createdAt,
        ticker: e.ticker,
      }));

      // Convert anomaly events (exclude concentration — shown in Health Score instead)
      const unifiedAnomalies: UnifiedNotification[] = (anomalyEvents || []).filter(isVisibleAnomaly).map((e: AnomalyEvent) => ({
        id: e.id,
        type: 'anomaly' as const,
        label: ALERT_TYPE_LABELS[e.type] || (e.type ?? 'unknown').replace('_', ' '),
        message: (e.title ?? '') + (e.analysis ? ` — ${e.analysis}` : ''),
        read: e.read,
        createdAt: e.createdAt,
        ticker: e.ticker,
      }));

      // Convert social notifications
      const SOCIAL_LABELS: Record<string, string> = {
        new_follower: 'New Follower',
        comment: 'Comment',
        like: 'Like',
        mention: 'Mention',
      };
      const unifiedSocial: UnifiedNotification[] = (socialEvents || []).map((e: SocialNotificationData) => ({
        id: e.id,
        type: 'social' as const,
        label: SOCIAL_LABELS[e.type] || 'Social',
        message: e.message ?? '',
        read: e.read,
        createdAt: e.createdAt,
      }));

      // Merge and sort by date (newest first)
      const merged = [...unifiedAlerts, ...unifiedPriceAlerts, ...unifiedAnalyst, ...unifiedMilestones, ...unifiedAnomalies, ...unifiedSocial].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setNotifications(merged);

      // Compute unread from filtered merged list (avoids counting excluded types like concentration)
      setUnreadCount(merged.filter(n => !n.read).length);
      return merged;
    } catch (e) { console.error('Notifications fetch failed:', e); }
    return [];
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

  // Load events when dropdown opens, mark as read
  useEffect(() => {
    if (open) {
      fetchEvents().then((merged) => {
        const unreadVisibleCount = merged.filter(n => !n.read).length;
        // Always fire mark-all-read when opening if badge showed unread,
        // even if the visible list is empty (handles orphaned/phantom events)
        if (unreadVisibleCount > 0 || unreadCount > 0) {
          setUnreadCount(0);
          if (!markingReadRef.current) {
            markingReadRef.current = true;
            handleMarkAllRead(merged).finally(() => {
              markingReadRef.current = false;
            });
          }
        }
      });
    }
    // fetchEvents/handleMarkAllRead/unreadCount excluded: only `open` toggle should trigger; adding others causes unnecessary re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Update tab title with unread count
  useEffect(() => {
    const base = baseTitleRef.current;
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
    return () => { document.title = base; };
  }, [unreadCount]);

  // Play sound when new notifications arrive
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && soundEnabled && notificationsEnabled && !open) {
      playNotificationSound();
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount, soundEnabled, notificationsEnabled, open]);

  // Close on outside click (pointerdown works for both mouse and touch on iOS)
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
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
        await markAllAnalystEventsRead();
      } else if (notification.type === 'milestone') {
        await markMilestoneEventRead(notification.id);
      } else if (notification.type === 'anomaly') {
        await markAnomalyRead(notification.id);
      } else if (notification.type === 'social') {
        await markSocialNotifRead(notification.id);
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async (currentNotifications?: UnifiedNotification[]) => {
    try {
      // Mark all portfolio alerts as read
      await markAllAlertsRead(userId);

      // Fetch current price alert events and mark them as read
      const priceAlertEvents = await getPriceAlertEvents(userId, 50).catch(() => [] as PriceAlertEvent[]);
      const unreadPriceAlerts = (priceAlertEvents || []).filter(e => !e.read);
      await Promise.all(unreadPriceAlerts.map(e => markPriceAlertEventRead(e.id)));

      // Mark all analyst events as read
      await markAllAnalystEventsRead();

      // Mark all milestone events as read
      await markAllMilestoneEventsRead();

      // Mark all anomaly events as read
      const sourceNotifications = currentNotifications ?? notifications;
      const visibleUnreadAnomalies = sourceNotifications.filter(n => n.type === 'anomaly' && !n.read);
      await Promise.all(visibleUnreadAnomalies.map(n => markAnomalyRead(n.id)));

      // Mark all social notifications as read
      await markAllSocialNotifsRead().catch(() => {});

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
  };

  const dropdownClassName = isNativeIos
    ? `absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1rem)] max-h-[50vh] overflow-y-auto
        bg-white dark:bg-[#1a1a1e] border border-gray-200 dark:border-white/[0.08]
        rounded-xl shadow-2xl shadow-black/10 dark:shadow-black/50 z-40 scrollbar-minimal`
    : `fixed sm:absolute right-2 sm:right-0 top-14 sm:top-full sm:mt-2 w-72 sm:w-80 max-h-[50vh] sm:max-h-96 overflow-y-auto
        bg-white dark:bg-[#1a1a1e]/95 backdrop-blur-xl border border-gray-200 dark:border-white/[0.08]
        rounded-xl shadow-2xl shadow-black/10 dark:shadow-black/50 z-50 scrollbar-minimal`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="group relative p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted
          hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 group-hover:animate-[bell-swing_0.6s_ease-in-out]" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ transformOrigin: 'top center' }}>
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
        <div className={dropdownClassName}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-rh-light-border dark:border-rh-border">
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => { void handleMarkAllRead(); }}
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

          {/* Notifications toggle + sound toggle + push toggle */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-rh-light-border dark:border-rh-border bg-rh-light-bg/50 dark:bg-rh-dark/50">
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">
              Notifications {notificationsEnabled ? 'on' : 'off'}
            </span>
            <div className="flex items-center gap-3">
              {/* Push notifications toggle */}
              <button
                onClick={togglePush}
                disabled={pushLoading}
                className={`p-1 rounded transition-colors ${pushEnabled ? 'text-rh-green' : 'text-rh-light-muted/40 dark:text-rh-muted/40'} ${pushLoading ? 'opacity-50' : ''}`}
                title={pushEnabled ? 'Push notifications on' : !pushSupported ? 'Push not available — try removing and re-adding app to home screen' : getPushPermission() === 'denied' ? 'Push blocked by browser — check site settings' : 'Enable push notifications'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </button>
              {/* Sound toggle */}
              <button
                onClick={toggleSound}
                className={`p-1 rounded transition-colors ${soundEnabled ? 'text-rh-green' : 'text-rh-light-muted/40 dark:text-rh-muted/40'}`}
                title={soundEnabled ? 'Sound on' : 'Sound off'}
              >
                {soundEnabled ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                )}
              </button>
              {/* Master notification toggle */}
              <button
                onClick={toggleNotifications}
                className={`relative w-10 h-5 rounded-full transition-colors after:content-[''] after:absolute after:-inset-3 ${
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
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <svg className="w-8 h-8 mx-auto mb-2 text-rh-light-muted/30 dark:text-rh-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-sm text-rh-light-muted dark:text-rh-muted">All caught up</p>
              <p className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 mt-0.5">No new notifications</p>
            </div>
          ) : (
            <div>
              {groupByDay(notifications.slice(0, 30)).map(group => (
                <div key={group.label}>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/60 bg-rh-light-card dark:bg-rh-card sticky top-0 z-10">
                    {group.label}
                  </div>
                  {group.items.map(notification => (
                    <div
                      key={`${notification.type}-${notification.id}`}
                      onClick={() => {
                        if (!notification.read) handleMarkRead(notification);
                        if (notification.ticker && onTickerClick) {
                          onTickerClick(notification.ticker);
                          setOpen(false);
                        }
                      }}
                      className={`px-4 py-3 border-b border-rh-light-border/50 dark:border-rh-border/50 last:border-b-0
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
                              notification.type === 'social' ? 'text-blue-500' :
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
                              <span className="text-[10px] font-semibold text-rh-green">
                                {notification.ticker}
                              </span>
                            )}
                            <span className="ml-auto text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 flex-shrink-0">
                              {timeAgo(notification.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-rh-light-text dark:text-rh-text mt-0.5 leading-relaxed line-clamp-2">
                            {notification.message.replace(/\*\*/g, '')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
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
