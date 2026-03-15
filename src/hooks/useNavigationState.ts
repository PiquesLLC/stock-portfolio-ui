import { useState, useEffect, useCallback } from 'react';
import { TabType } from '../components/Navigation';
import { Holding } from '../types';

const VALID_TABS = new Set<TabType>(['portfolio', 'nala', 'insights', 'watchlists', 'discover', 'macro', 'leaderboard', 'feed', 'pricing', 'profile']);

function getLocationHash(): string {
  return typeof window !== 'undefined' ? window.location.hash : '';
}

function setLocationHash(value: string): void {
  if (typeof window !== 'undefined') {
    window.location.hash = value;
  }
}

function persistNavState(state: { tab: string; stock: string | null; profile: string | null; lbuser: string | null; subtab: string | null }): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('navState', JSON.stringify(state));
  }
}

function setHash(tab: TabType, stock?: string | null, profile?: string | null, lbuser?: string | null, subtab?: string | null) {
  const params = new URLSearchParams();
  if (tab !== 'portfolio') params.set('tab', tab);
  if (stock) params.set('stock', stock);
  if (profile) params.set('profile', profile);
  if (lbuser) params.set('lbuser', lbuser);
  if (subtab) params.set('subtab', subtab);
  const str = params.toString();
  setLocationHash(str ? str : '');
  persistNavState({ tab, stock: stock ?? null, profile: profile ?? null, lbuser: lbuser ?? null, subtab: subtab ?? null });
}

interface NavState {
  tab: TabType;
  stock: string | null;
  profile: string | null;
  lbuser: string | null;
  subtab: string | null;
  compareStocks?: string[];
}

interface UseNavigationStateParams {
  initialNav: NavState & { compareStocks?: string[] };
  currentUserId: string;
  isAuthenticated: boolean;
  initialSettingsView: boolean;
  initialAdminView: 'waitlist' | 'jobs' | 'analytics' | null;
}

export function useNavigationState({
  initialNav,
  currentUserId,
  isAuthenticated,
  initialSettingsView,
  initialAdminView,
}: UseNavigationStateParams) {
  const [activeTab, setActiveTab] = useState<TabType>(initialNav.tab);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(initialNav.profile);
  const [leaderboardUserId, setLeaderboardUserId] = useState<string | null>(initialNav.lbuser);
  const [insightsSubTab, setInsightsSubTab] = useState<string | null>(initialNav.tab === 'insights' ? initialNav.subtab : null);
  const [discoverSubTab, setDiscoverSubTab] = useState<string | null>(initialNav.tab === 'discover' ? initialNav.subtab : null);
  const [comparingUser, setComparingUser] = useState<{ userId: string; displayName: string } | null>(null);
  const [viewingStock, setViewingStock] = useState<{ ticker: string; holding: Holding | null } | null>(
    initialNav.stock ? { ticker: initialNav.stock, holding: null } : null
  );
  const [compareStocks, setCompareStocks] = useState<string[] | null>(initialNav.compareStocks ?? null);
  const [settingsView, setSettingsView] = useState(initialSettingsView);
  const [creatorView, setCreatorView] = useState<'dashboard' | 'settings' | null>(null);
  const [adminView, setAdminView] = useState<'waitlist' | 'jobs' | 'analytics' | null>(initialAdminView);

  /** Reset all sub-view navigation state — call before switching tabs */
  const resetNavigation = useCallback(() => {
    setViewingProfileId(null);
    setViewingStock(null);
    setLeaderboardUserId(null);
    setCompareStocks(null);
    setCreatorView(null);
    setAdminView(null);
    setSettingsView(false);
  }, []);

  const clearNavigationState = useCallback(() => {
    setViewingProfileId(null);
    setViewingStock(null);
    setLeaderboardUserId(null);
    setComparingUser(null);
  }, []);

  // Auto-set viewingProfileId when navigating to profile tab
  useEffect(() => {
    if (activeTab === 'profile' && !viewingProfileId && currentUserId) {
      setViewingProfileId(currentUserId);
    }
  }, [activeTab, viewingProfileId, currentUserId]);

  // Sync navigation state → URL hash (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;
    // Admin views get their own hash so they survive refresh
    if (adminView === 'waitlist') {
      setLocationHash('tab=admin-waitlist');
      return;
    }
    if (adminView === 'jobs') {
      setLocationHash('tab=admin-jobs');
      return;
    }
    if (adminView === 'analytics') {
      setLocationHash('tab=admin-analytics');
      return;
    }
    if (compareStocks && compareStocks.length >= 2) {
      const p = new URLSearchParams();
      p.set('tab', 'compare');
      p.set('stocks', compareStocks.join(','));
      setLocationHash(p.toString());
      persistNavState({ tab: 'compare', stock: null, profile: null, lbuser: null, subtab: null });
      return;
    }
    const stockTicker = viewingStock?.ticker || null;
    const subtab = activeTab === 'insights' ? insightsSubTab : activeTab === 'discover' ? discoverSubTab : null;
    const hashTab = activeTab;
    const hashProfile = activeTab === 'profile' ? null : viewingProfileId;
    setHash(hashTab, stockTicker, hashProfile, leaderboardUserId, subtab);
  }, [isAuthenticated, activeTab, viewingStock, viewingProfileId, leaderboardUserId, insightsSubTab, discoverSubTab, compareStocks, adminView]);

  // Handle browser back/forward
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const params = new URLSearchParams(getLocationHash().slice(1));
      const rawTab = params.get('tab') || 'portfolio';
      const stock = params.get('stock') || null;
      const profile = params.get('profile') || null;
      const lbuser = params.get('lbuser') || null;
      const subtab = params.get('subtab') || null;

      if (rawTab === 'settings') {
        setSettingsView(true);
        setAdminView(null);
        return;
      }
      setSettingsView(false);

      if (rawTab === 'admin-waitlist') {
        setViewingProfileId(null);
        setViewingStock(null);
        setLeaderboardUserId(null);
        setComparingUser(null);
        setCompareStocks(null);
        setCreatorView(null);
        setSettingsView(false);
        setAdminView('waitlist');
        return;
      }
      if (rawTab === 'admin-jobs') {
        setViewingProfileId(null);
        setViewingStock(null);
        setLeaderboardUserId(null);
        setComparingUser(null);
        setCompareStocks(null);
        setCreatorView(null);
        setSettingsView(false);
        setAdminView('jobs');
        return;
      }
      if (rawTab === 'admin-analytics') {
        setViewingProfileId(null);
        setViewingStock(null);
        setLeaderboardUserId(null);
        setComparingUser(null);
        setCompareStocks(null);
        setCreatorView(null);
        setSettingsView(false);
        setAdminView('analytics');
        return;
      }
      setAdminView(null);

      if (rawTab === 'compare') {
        const stocksRaw = params.get('stocks')?.split(',').filter(Boolean) ?? [];
        const normalized = [...new Set(stocksRaw.map(s => s.trim().toUpperCase()).filter(Boolean))].slice(0, 4);
        if (normalized.length >= 2) {
          setCompareStocks(normalized);
          setViewingStock(null);
          return;
        }
      }
      setCompareStocks(null);

      const tab = VALID_TABS.has(rawTab as TabType) ? (rawTab as TabType) : 'portfolio';
      setActiveTab(tab);
      setViewingProfileId(profile);
      setLeaderboardUserId(lbuser);
      if (tab === 'insights') setInsightsSubTab(subtab);
      if (tab === 'discover') setDiscoverSubTab(subtab);
      if (stock) {
        setViewingStock(prev => prev?.ticker === stock ? prev : { ticker: stock, holding: null });
      } else {
        setViewingStock(null);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return {
    activeTab, setActiveTab,
    viewingStock, setViewingStock,
    viewingProfileId, setViewingProfileId,
    leaderboardUserId, setLeaderboardUserId,
    insightsSubTab, setInsightsSubTab,
    discoverSubTab, setDiscoverSubTab,
    comparingUser, setComparingUser,
    compareStocks, setCompareStocks,
    settingsView, setSettingsView,
    creatorView, setCreatorView,
    adminView, setAdminView,
    resetNavigation,
    clearNavigationState,
  };
}
