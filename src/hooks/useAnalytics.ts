import { useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { TabType } from '../components/Navigation';

// ── Types ──────────────────────────────────────────────────────────────

interface AnalyticsEvent {
  sessionId: string;
  event: 'view' | 'action';
  feature: string;
  subFeature?: string;
  metadata?: string;
  durationMs?: number;
}

type Feature =
  | 'portfolio' | 'insights' | 'discover' | 'leaderboard' | 'watchlists'
  | 'nala_ai' | 'macro' | 'feed' | 'profile' | 'pricing'
  | 'stock_detail' | 'compare_stocks' | 'portfolio_compare'
  | 'user_profile' | 'daily_brief' | 'settings'
  | 'creator_dashboard' | 'creator_settings'
  | 'admin_waitlist' | 'admin_jobs' | 'admin_analytics';

// ── Session ID (once per page load) ────────────────────────────────────

const sessionId = crypto.randomUUID();

// ── Feature derivation ─────────────────────────────────────────────────

interface NavigationState {
  activeTab: TabType;
  viewingStock: { ticker: string } | null;
  compareStocks: string[] | null;
  viewingProfileId: string | null;
  settingsView: boolean;
  creatorView: 'dashboard' | 'settings' | null;
  adminView: 'waitlist' | 'jobs' | 'analytics' | null;
  showDailyReport: boolean;
  comparingUser: { userId: string } | null;
}

function deriveFeature(nav: NavigationState): Feature {
  // Priority: overlays > sub-views > active tab
  if (nav.showDailyReport) return 'daily_brief';
  if (nav.settingsView) return 'settings';
  if (nav.adminView === 'waitlist') return 'admin_waitlist';
  if (nav.adminView === 'jobs') return 'admin_jobs';
  if (nav.adminView === 'analytics') return 'admin_analytics';
  if (nav.creatorView === 'dashboard') return 'creator_dashboard';
  if (nav.creatorView === 'settings') return 'creator_settings';
  if (nav.viewingStock) return 'stock_detail';
  if (nav.compareStocks && nav.compareStocks.length >= 2) return 'compare_stocks';
  if (nav.comparingUser) return 'portfolio_compare';
  if (nav.viewingProfileId && nav.activeTab !== 'profile') return 'user_profile';

  // Map tabs
  const tabMap: Record<string, Feature> = {
    portfolio: 'portfolio',
    nala: 'nala_ai',
    insights: 'insights',
    watchlists: 'watchlists',
    discover: 'discover',
    macro: 'macro',
    leaderboard: 'leaderboard',
    feed: 'feed',
    pricing: 'pricing',
    profile: 'profile',
  };
  return tabMap[nav.activeTab] || 'portfolio';
}

// ── Buffer & flush ─────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH_SIZE = 50;
let eventBuffer: AnalyticsEvent[] = [];

function flushEvents() {
  if (eventBuffer.length === 0) return;
  const batch = eventBuffer.splice(0, MAX_BATCH_SIZE);
  const body = JSON.stringify({ events: batch });

  // Fire-and-forget — no need to await
  fetch(`${API_BASE_URL}/analytics/events`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {
    // Silently ignore — analytics should never break the app
  });
}

function flushWithBeacon() {
  if (eventBuffer.length === 0) return;
  const batch = eventBuffer.splice(0, MAX_BATCH_SIZE);
  const body = JSON.stringify({ events: batch });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(`${API_BASE_URL}/analytics/events`, blob);
  } else {
    // Fallback for browsers that don't support sendBeacon
    fetch(`${API_BASE_URL}/analytics/events`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useAnalytics(nav: NavigationState, isAuthenticated: boolean) {
  const currentFeatureRef = useRef<Feature | null>(null);
  const viewStartRef = useRef<number>(Date.now());
  // Keep nav in a ref so visibility handler always reads latest without re-registering
  const navRef = useRef(nav);
  navRef.current = nav;

  const endCurrentView = useCallback(() => {
    if (!currentFeatureRef.current) return;
    const durationMs = Date.now() - viewStartRef.current;
    // Only record views longer than 500ms to filter noise
    if (durationMs > 500) {
      eventBuffer.push({
        sessionId,
        event: 'view',
        feature: currentFeatureRef.current,
        durationMs,
      });
    }
  }, []);

  // Track feature changes
  useEffect(() => {
    if (!isAuthenticated) return;

    const feature = deriveFeature(nav);
    if (feature === currentFeatureRef.current) return;

    // End previous view
    endCurrentView();

    // Start new view
    currentFeatureRef.current = feature;
    viewStartRef.current = Date.now();
  }, [
    isAuthenticated,
    nav.activeTab,
    nav.viewingStock,
    nav.compareStocks,
    nav.viewingProfileId,
    nav.settingsView,
    nav.creatorView,
    nav.adminView,
    nav.showDailyReport,
    nav.comparingUser,
    endCurrentView,
  ]);

  // Flush timer
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(flushEvents, FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  // Visibility change: end view + flush on tab hide
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        endCurrentView();
        currentFeatureRef.current = null;
        flushWithBeacon();
      } else if (document.visibilityState === 'visible') {
        // Resume tracking from ref (always latest nav state)
        const feature = deriveFeature(navRef.current);
        currentFeatureRef.current = feature;
        viewStartRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAuthenticated, endCurrentView]);

  // Flush on unmount (page navigation)
  useEffect(() => {
    return () => {
      endCurrentView();
      flushWithBeacon();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
