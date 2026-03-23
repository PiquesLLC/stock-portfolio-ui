import { useState, useCallback, useRef, useEffect } from 'react';
import { TabType } from '../components/Navigation';

// Tab-swipe navigation removed — it conflicts with swipe-to-delete and other horizontal gestures

interface SwipeGuards {
  viewingStock: unknown;
  settingsView: boolean;
  creatorView: unknown;
  adminView: unknown;
  compareStocks: unknown;
  showOnboardingTour: boolean;
  showDailyReport: boolean;
  showPrivacyModal: boolean;
}

interface UsePullToRefreshParams {
  activeTab: TabType;
  setActiveTab?: (tab: TabType) => void;
  resetNavigation: () => void;
  fetchData: () => void | Promise<void>;
  onRefreshTriggered: () => void;
  guards: SwipeGuards;
}

export function usePullToRefresh({
  activeTab,
  resetNavigation,
  fetchData,
  onRefreshTriggered,
  guards,
}: UsePullToRefreshParams) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  // Pull refs
  const pullTouchY = useRef(0);
  const pullActive = useRef(false);

  // Swipe refs
  const swipeTouchX = useRef(0);
  const swipeTouchY = useRef(0);
  const swipeActive = useRef(false);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const mainRef = useRef<HTMLElement>(null);

  // Swipe guard ref — avoids recreating onTouchEndCombined on every state change
  const swipeGuardRef = useRef({ ...guards, refreshing, pullY });
  swipeGuardRef.current = { ...guards, refreshing, pullY };

  const onPullEndRef = useRef<() => void>(() => {});
  const resetNavRef = useRef(resetNavigation);
  resetNavRef.current = resetNavigation;

  const onPullStart = useCallback((e: React.TouchEvent) => {
    if (swipeGuardRef.current.refreshing) return;
    if (window.scrollY <= 0) {
      pullTouchY.current = e.touches[0].clientY;
      pullActive.current = true;
    }
  }, []);

  const onPullMove = useCallback((e: React.TouchEvent) => {
    if (!pullActive.current || swipeGuardRef.current.refreshing) return;
    const dy = e.touches[0].clientY - pullTouchY.current;
    if (dy > 0) {
      setPullY(Math.min(dy * 0.4, 80));
    } else {
      pullActive.current = false;
      setPullY(0);
    }
  }, []);

  const onPullEnd = useCallback(() => {
    if (!pullActive.current) return;
    pullActive.current = false;
    if (pullY > 50) {
      setRefreshing(true);
      setPullY(50);
      onRefreshTriggered();
      Promise.resolve(fetchDataRef.current()).finally(() => { setRefreshing(false); setPullY(0); });
    } else {
      setPullY(0);
    }
  }, [pullY, onRefreshTriggered]);
  onPullEndRef.current = onPullEnd;

  const [isTouchDevice, setIsTouchDevice] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // Safari <14 fallback
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  const onTouchStartCombined = useCallback((e: React.TouchEvent) => {
    onPullStart(e);
    if (!isTouchDevice || e.touches.length !== 1) return;
    const startX = e.touches[0].clientX;
    // Skip iOS edge-swipe zone (~20px from screen edges) to avoid conflicting with system back/forward
    if (startX < 20 || startX > window.innerWidth - 20) return;
    const raw = e.target as Node;
    const el = raw.nodeType === Node.TEXT_NODE ? raw.parentElement : raw as Element;
    if (el?.closest?.('input,textarea,button,a,[role="button"],[data-no-tab-swipe]')) return;
    swipeTouchX.current = startX;
    swipeTouchY.current = e.touches[0].clientY;
    swipeActive.current = true;
  }, [onPullStart, isTouchDevice]);

  const onTouchMoveCombined = useCallback((e: React.TouchEvent) => {
    onPullMove(e);
    if (!swipeActive.current) return;
    const dy = Math.abs(e.touches[0].clientY - swipeTouchY.current);
    const dx = Math.abs(e.touches[0].clientX - swipeTouchX.current);
    if (dy > dx) swipeActive.current = false;
  }, [onPullMove]);

  const onTouchEndCombined = useCallback((_e: React.TouchEvent) => {
    onPullEndRef.current();
    // Tab-swipe navigation disabled — it conflicts with swipe-to-delete and other horizontal gestures
    swipeActive.current = false;
  }, []);

  return {
    pullY,
    refreshing,
    isPulling: pullActive,
    mainRef,
    onTouchStart: onTouchStartCombined,
    onTouchMove: onTouchMoveCombined,
    onTouchEnd: onTouchEndCombined,
  };
}
