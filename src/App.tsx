import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { Portfolio, Settings, PortfolioChartPeriod } from './types';
import { getPortfolio, getSettings, getPortfolioChart, getHealthStatus, HealthStatus } from './api';
import { REFRESH_INTERVAL } from './config';
import { HoldingsTable } from './components/HoldingsTable';
import { OptionsTable } from './components/OptionsTable';
import { PerformanceSummary } from './components/PerformanceSummary';
import { Navigation, TabType } from './components/Navigation';
import { PortfolioValueChart, ChartMeasurement } from './components/PortfolioValueChart';
import { BenchmarkWidget } from './components/BenchmarkWidget';
import { DividendsSection } from './components/DividendsSection';
import { NotificationBell } from './components/NotificationBell';
import { UserMenu } from './components/UserMenu';
import { AccountSettingsModal } from './components/AccountSettingsModal';
import { TickerAutocompleteInput } from './components/TickerAutocompleteInput';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { PremiumOverlay } from './components/PremiumOverlay';
import { useKeyboardShortcuts } from './components/useKeyboardShortcuts';
import { ShortcutToast, KeyboardCheatSheet } from './components/KeyboardShortcuts';
import { DailyReportModal } from './components/DailyReportModal';
import { LandingPage } from './components/LandingPage';
import { PrivacyPage } from './components/PrivacyPage';
import { useAuth } from './context/AuthContext';
import { Holding } from './types';
import type Hls from 'hls.js';
import Starfield from './components/Starfield';
import { MiniPlayer } from './components/MiniPlayer';
import { Term } from './components/Term';

import { formatCurrency, formatPercent } from './utils/format';
import { getInitialTheme, applyTheme } from './utils/theme';
import { getLocalTzAbbr } from './utils/market';
import { Channel, CHANNELS } from './utils/channels';
import { useOnlineStatus } from './hooks/useOnlineStatus';

// Lazy-loaded page components
const InsightsPage = lazy(() => import('./components/InsightsPage').then(m => ({ default: m.InsightsPage })));
// Premium-gated: const NalaAIPage = lazy(() => import('./components/NalaAIPage'));
const EconomicIndicators = lazy(() => import('./components/EconomicIndicators').then(m => ({ default: m.EconomicIndicators })));
const LeaderboardPage = lazy(() => import('./components/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const FeedPage = lazy(() => import('./components/FeedPage').then(m => ({ default: m.FeedPage })));
const WatchPage = lazy(() => import('./components/WatchPage').then(m => ({ default: m.WatchPage })));
const WatchlistPage = lazy(() => import('./components/WatchlistPage').then(m => ({ default: m.WatchlistPage })));
const DiscoverPage = lazy(() => import('./components/DiscoverPage').then(m => ({ default: m.DiscoverPage })));
const UserProfileView = lazy(() => import('./components/UserProfileView').then(m => ({ default: m.UserProfileView })));
const StockDetailView = lazy(() => import('./components/StockDetailView').then(m => ({ default: m.StockDetailView })));
const PricingPage = lazy(() => import('./components/PricingPage').then(m => ({ default: m.PricingPage })));
const PortfolioCompare = lazy(() => import('./components/PortfolioCompare').then(m => ({ default: m.PortfolioCompare })));
const CompareStocksPage = lazy(() => import('./components/CompareStocksPage').then(m => ({ default: m.CompareStocksPage })));

// Typed heatmap preload on window for cross-component cache seeding
declare global { interface Window { __heatmapPreload?: { data: import('./types').HeatmapResponse; ts: number } } }

// Preload heatmap data 3s after boot so Heatmap tab opens instantly
setTimeout(() => {
  import('./api').then(({ getMarketHeatmap }) => {
    getMarketHeatmap('1D', 'SP500').then(resp => {
      window.__heatmapPreload = { data: resp, ts: Date.now() };
    }).catch(() => {});
  });
}, 3000);

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin" />
    </div>
  );
}

// Parse hash to restore navigation state on load/refresh
interface NavState {
  tab: TabType;
  stock: string | null;
  profile: string | null;
  lbuser: string | null;
  subtab: string | null;
}

const VALID_TABS = new Set<TabType>(['portfolio', 'nala', 'insights', 'watchlists', 'discover', 'macro', 'leaderboard', 'feed', 'watch', 'pricing', 'profile']);

// Desktop-only tab list for the consolidated header bar
const PRIMARY_TABS: { id: TabType; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'insights', label: 'Insights' },
  { id: 'discover', label: 'Discover' },
  { id: 'watchlists', label: 'Watchlists' },
  { id: 'nala', label: 'Nala AI' },
];

const MORE_TABS: { id: TabType; label: string }[] = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'macro', label: 'Macro' },
  { id: 'feed', label: 'Feed' },
  { id: 'watch', label: 'Watch' },
  { id: 'profile', label: 'Profile' },
  { id: 'pricing', label: 'Pricing' },
];


function parseHash(): NavState & { compareStocks?: string[] } {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const params = new URLSearchParams(hash);
    const rawTab = params.get('tab') || 'portfolio';

    // Handle compare page on initial load
    if (rawTab === 'compare') {
      const stocksRaw = params.get('stocks')?.split(',').filter(Boolean) ?? [];
      const normalized = [...new Set(stocksRaw.map(s => s.trim().toUpperCase()).filter(Boolean))].slice(0, 4);
      if (normalized.length >= 2) {
        sessionStorage.setItem('navState', JSON.stringify({ tab: 'compare', stock: null, profile: null, lbuser: null, subtab: null }));
        return { tab: 'portfolio', stock: null, profile: null, lbuser: null, subtab: null, compareStocks: normalized };
      }
    }

    const state: NavState = {
      tab: VALID_TABS.has(rawTab as TabType) ? (rawTab as TabType) : 'portfolio',
      stock: params.get('stock') || null,
      profile: params.get('profile') || null,
      lbuser: params.get('lbuser') || null,
      subtab: params.get('subtab') || null,
    };
    sessionStorage.setItem('navState', JSON.stringify(state));
    return state;
  }
  try {
    const saved = sessionStorage.getItem('navState');
    if (saved) {
      const s = JSON.parse(saved);
      return { tab: s.tab || 'portfolio', stock: s.stock || null, profile: s.profile || null, lbuser: s.lbuser || null, subtab: s.subtab || null };
    }
  } catch {}
  return { tab: 'portfolio', stock: null, profile: null, lbuser: null, subtab: null };
}

function setHash(tab: TabType, stock?: string | null, profile?: string | null, lbuser?: string | null, subtab?: string | null) {
  const params = new URLSearchParams();
  if (tab !== 'portfolio') params.set('tab', tab);
  if (stock) params.set('stock', stock);
  if (profile) params.set('profile', profile);
  if (lbuser) params.set('lbuser', lbuser);
  if (subtab) params.set('subtab', subtab);
  const str = params.toString();
  window.location.hash = str ? str : '';
  sessionStorage.setItem('navState', JSON.stringify({ tab, stock, profile, lbuser, subtab }));
}

const savedInitialNav = parseHash();

export default function App() {
  const { user, isAuthenticated, isLoading: authLoading, logout, verifyEmail, resendVerification } = useAuth();
  const isOnline = useOnlineStatus();
  const initialNav = savedInitialNav;
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [chartPeriod, setChartPeriod] = useState<PortfolioChartPeriod>('1D');
  const [chartReturnPct, setChartReturnPct] = useState<number | null>(null);
  const [chartMeasurement, setChartMeasurement] = useState<ChartMeasurement | null>(null);
  const [, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [summaryRefreshTrigger, setSummaryRefreshTrigger] = useState(0);
  const [portfolioRefreshCount, setPortfolioRefreshCount] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  const [activeTab, setActiveTab] = useState<TabType>(initialNav.tab);
  const currentUserId = user?.id || '';
  const currentUserName = user?.displayName || user?.username || '';
  const isPaidUser = user?.plan === 'pro' || user?.plan === 'premium';
  const visibleMoreTabs = useMemo(() =>
    isPaidUser ? MORE_TABS.filter(t => t.id !== 'pricing') : MORE_TABS,
    [isPaidUser]
  );
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const moreDropdownRef = useRef<HTMLDivElement>(null);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(initialNav.profile);
  const [leaderboardUserId, setLeaderboardUserId] = useState<string | null>(initialNav.lbuser);
  const [insightsSubTab, setInsightsSubTab] = useState<string | null>(initialNav.tab === 'insights' ? initialNav.subtab : null);
  const [discoverSubTab, setDiscoverSubTab] = useState<string | null>(initialNav.tab === 'discover' ? initialNav.subtab : null);
  const [comparingUser, setComparingUser] = useState<{ userId: string; displayName: string } | null>(null);
  const [viewingStock, setViewingStock] = useState<{ ticker: string; holding: Holding | null } | null>(
    initialNav.stock ? { ticker: initialNav.stock, holding: null } : null
  );
  const [compareStocks, setCompareStocks] = useState<string[] | null>(initialNav.compareStocks ?? null);
  // Premium-gated: const [nalaQuestion, setNalaQuestion] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyModalTab, setPrivacyModalTab] = useState<'privacy' | 'terms'>('privacy');
  const [dailyReportHidden, setDailyReportHidden] = useState(false);
  const [showVerifyEmailModal, setShowVerifyEmailModal] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResendCooldown, setVerifyResendCooldown] = useState(0);

  // Close "More" dropdown on outside click
  useEffect(() => {
    if (!moreDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(e.target as Node)) {
        setMoreDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreDropdownOpen]);

  // Listen for email-verify-needed events from API layer (403 on AI endpoints)
  useEffect(() => {
    const handler = () => setShowVerifyEmailModal(true);
    window.addEventListener('email-verify-needed', handler);
    return () => window.removeEventListener('email-verify-needed', handler);
  }, []);

  // --- Keyboard shortcuts ---
  const searchRef = useRef<{ focus: () => void } | null>(null);
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  const clearNavigationState = useCallback(() => {
    setViewingProfileId(null);
    setViewingStock(null);
    setLeaderboardUserId(null);
    setComparingUser(null);
  }, []);
  const { toastMessage, isCheatSheetOpen, closeCheatSheet } = useKeyboardShortcuts({
    activeTab,
    setActiveTab,
    focusSearch,
    clearNavigationState,
  });

  // --- Pull-to-refresh ---
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullTouchY = useRef(0);
  const pullActive = useRef(false);
  const fetchDataRef = useRef<() => void>(() => {});

  const onPullStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    if (window.scrollY <= 0) {
      pullTouchY.current = e.touches[0].clientY;
      pullActive.current = true;
    }
  }, [refreshing]);

  const onPullMove = useCallback((e: React.TouchEvent) => {
    if (!pullActive.current || refreshing) return;
    const dy = e.touches[0].clientY - pullTouchY.current;
    if (dy > 0) {
      setPullY(Math.min(dy * 0.4, 80));
    } else {
      pullActive.current = false;
      setPullY(0);
    }
  }, [refreshing]);

  const onPullEnd = useCallback(() => {
    if (!pullActive.current) return;
    pullActive.current = false;
    if (pullY > 50) {
      setRefreshing(true);
      setPullY(50);
      fetchDataRef.current();
      setSummaryRefreshTrigger(t => t + 1);
      setTimeout(() => { setRefreshing(false); setPullY(0); }, 1200);
    } else {
      setPullY(0);
    }
  }, [pullY]);

  // --- Stream / PiP state ---
  const [pipEnabled, setPipEnabled] = useState(() => {
    const stored = localStorage.getItem('pipEnabled');
    return stored !== null ? stored === 'true' : true;
  });
  const [streamActive, setStreamActive] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel>(CHANNELS[0]);
  const [streamStatus, setStreamStatus] = useState('Loading stream...');
  const [streamHasError, setStreamHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const watchVideoContainerRef = useRef<HTMLDivElement | null>(null);
  const miniVideoContainerRef = useRef<HTMLDivElement>(null);
  const loadedChannelRef = useRef<string | null>(null);
  const [containerReady, setContainerReady] = useState(0);

  const watchContainerCallback = useCallback((node: HTMLDivElement | null) => {
    watchVideoContainerRef.current = node;
    if (node) setContainerReady(c => c + 1);
  }, []);

  const handlePipToggle = (enabled: boolean) => {
    setPipEnabled(enabled);
    localStorage.setItem('pipEnabled', String(enabled));
  };

  useEffect(() => {
    if (activeTab === 'watch') {
      setStreamActive(true);
    } else if (!pipEnabled) {
      setStreamActive(false);
    }
  }, [activeTab, pipEnabled]);

  const handleManualPlay = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.play().then(() => setStreamStatus('')).catch(() => {});
    }
  }, []);

  const handleMiniPlayerClose = () => setStreamActive(false);
  const handleMiniPlayerExpand = () => {
    setActiveTab('watch');
    setViewingProfileId(null);
    setViewingStock(null);
    setLeaderboardUserId(null);
  };

  const watchFullyVisible = activeTab === 'watch' && !viewingStock;
  const showMiniPlayer = streamActive && pipEnabled && !watchFullyVisible;

  // Helper: fully reset video element so a fresh HLS can attach cleanly
  const resetVideoElement = useCallback((video: HTMLVideoElement) => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }, []);

  // Helper: tear down HLS instance and reset refs
  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      loadedChannelRef.current = null;
    }
  }, []);

  // Unified HLS effect
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const shouldBeActive = watchFullyVisible || (streamActive && pipEnabled);

    // Move video element to the correct container
    if (watchFullyVisible && watchVideoContainerRef.current) {
      watchVideoContainerRef.current.appendChild(video);
      video.style.display = '';
    } else if (shouldBeActive && !watchFullyVisible && miniVideoContainerRef.current) {
      miniVideoContainerRef.current.appendChild(video);
      video.style.display = '';
    } else {
      video.style.display = 'none';
    }

    // Tear down when stream should not be active
    if (!shouldBeActive) {
      destroyHls();
      resetVideoElement(video);
      setStreamStatus('Loading stream...');
      setStreamHasError(false);
      return;
    }

    // Channel changed — destroy old instance so we recreate below
    if (hlsRef.current && loadedChannelRef.current !== activeChannel.id) {
      destroyHls();
      resetVideoElement(video);
      setStreamStatus('Loading stream...');
      setStreamHasError(false);
    }

    // Already loaded for the current channel — nothing to do
    if (hlsRef.current) return;

    setStreamStatus('Loading stream...');
    setStreamHasError(false);

    // Dynamic import hls.js only when needed (saves ~250KB from initial bundle)
    import('hls.js').then(({ default: HlsLib }) => {
      // Guard: effect was cleaned up or another instance was created while awaiting import
      if (cancelled || hlsRef.current) return;

      if (HlsLib.isSupported()) {
        const hls = new HlsLib({
          enableWorker: false,
          debug: false,
          lowLatencyMode: true,
          xhrSetup: (xhr: XMLHttpRequest) => { xhr.withCredentials = false; },
        });
        hlsRef.current = hls;
        loadedChannelRef.current = activeChannel.id;

        hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
          setStreamStatus('');
          setStreamHasError(false);
          video.play().catch(() => setStreamStatus('Click to play'));
        });

        hls.on(HlsLib.Events.ERROR, (_event: string, data: { type: string; details: string; fatal: boolean }) => {
          console.error('HLS error:', data.type, data.details);
          if (data.fatal) {
            setStreamHasError(true);
            switch (data.type) {
              case HlsLib.ErrorTypes.NETWORK_ERROR:
                setStreamStatus('Network error — retrying...');
                hls.startLoad();
                break;
              case HlsLib.ErrorTypes.MEDIA_ERROR:
                setStreamStatus('Media error — recovering...');
                hls.recoverMediaError();
                break;
              default:
                setStreamStatus('Stream unavailable');
                hls.destroy();
                hlsRef.current = null;
                loadedChannelRef.current = null;
                break;
            }
          }
        });

        hls.loadSource(activeChannel.url);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = activeChannel.url;
        loadedChannelRef.current = activeChannel.id;
        const onMeta = () => {
          if (cancelled) return;
          setStreamStatus('');
          video.play().catch(() => {
            if (!cancelled) setStreamStatus('Click to play');
          });
        };
        video.addEventListener('loadedmetadata', onMeta, { once: true });
      } else {
        setStreamStatus('HLS not supported in this browser');
        setStreamHasError(true);
      }
    });

    return () => { cancelled = true; };
  }, [streamActive, activeTab, pipEnabled, activeChannel, containerReady, watchFullyVisible, destroyHls, resetVideoElement]);

  const handleViewProfile = (userId: string) => setViewingProfileId(userId);
  const handleCompare = useCallback((userId: string, displayName: string) => {
    setComparingUser({ userId, displayName });
  }, []);

  // Auto-set viewingProfileId when navigating to profile tab
  useEffect(() => {
    if (activeTab === 'profile' && !viewingProfileId && currentUserId) {
      setViewingProfileId(currentUserId);
    }
  }, [activeTab, viewingProfileId, currentUserId]);

  // Sync navigation state → URL hash
  useEffect(() => {
    // Compare page has its own hash format
    if (compareStocks && compareStocks.length >= 2) {
      const p = new URLSearchParams();
      p.set('tab', 'compare');
      p.set('stocks', compareStocks.join(','));
      window.location.hash = p.toString();
      sessionStorage.setItem('navState', JSON.stringify({ tab: 'compare', stock: null, profile: null, lbuser: null, subtab: null }));
      return;
    }
    const stockTicker = viewingStock?.ticker || null;
    const subtab = activeTab === 'insights' ? insightsSubTab : activeTab === 'discover' ? discoverSubTab : null;
    const hashTab = activeTab;
    // Don't expose profile ID in URL for own profile tab — it's always the current user
    const hashProfile = activeTab === 'profile' ? null : viewingProfileId;
    setHash(hashTab, stockTicker, hashProfile, leaderboardUserId, subtab);
  }, [activeTab, viewingStock, viewingProfileId, leaderboardUserId, insightsSubTab, discoverSubTab, compareStocks]);

  // Handle browser back/forward — parse directly from hash, never sessionStorage
  useEffect(() => {
    const onHashChange = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const rawTab = params.get('tab') || 'portfolio';
      const stock = params.get('stock') || null;
      const profile = params.get('profile') || null;
      const lbuser = params.get('lbuser') || null;
      const subtab = params.get('subtab') || null;

      // Handle compare page (not a nav tab — transient overlay like StockDetailView)
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

  const lastValidPortfolio = useRef<Portfolio | null>(null);
  const lastTotalAssets = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const portfolioData = await getPortfolio();  // Always use system/default portfolio
      const settingsData = await getSettings();

      const hasValidData = portfolioData.holdings.length === 0 ||
        portfolioData.holdings.some(h => !h.priceUnavailable && h.currentPrice > 0);

      const holdingsChanged = !lastValidPortfolio.current ||
        portfolioData.holdings.length !== lastValidPortfolio.current.holdings.length ||
        portfolioData.holdings.some(h => !lastValidPortfolio.current!.holdings.find(old => old.ticker === h.ticker));

      if (!hasValidData && lastValidPortfolio.current && !holdingsChanged) {
        setPortfolio({
          ...lastValidPortfolio.current,
          cashBalance: portfolioData.cashBalance,
          marginDebt: portfolioData.marginDebt,
          netEquity: lastValidPortfolio.current.totalAssets - portfolioData.marginDebt,
        });
        setSettings(settingsData);
        setIsStale(true);
        return;
      }

      setPortfolio(portfolioData);
      setSettings(settingsData);
      setError('');
      setLastUpdate(new Date());

      const newTotalAssets = Math.round(portfolioData.totalAssets * 100) / 100;
      if (lastTotalAssets.current === null || newTotalAssets !== lastTotalAssets.current) {
        lastTotalAssets.current = newTotalAssets;
        setPortfolioRefreshCount((c) => c + 1);
      }

      const dataIsRepricing = portfolioData.quotesMeta?.anyRepricing ||
        portfolioData.quotesStale ||
        (portfolioData.quotesUnavailableCount && portfolioData.quotesUnavailableCount > 0);
      setIsStale(!!dataIsRepricing);

      if (hasValidData) {
        lastValidPortfolio.current = portfolioData;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      if (portfolio) {
        setIsStale(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [portfolio, currentUserId]);
  fetchDataRef.current = fetchData;

  useEffect(() => {
    if (!currentUserId) return;
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData, currentUserId]);

  useEffect(() => {
    if (!currentUserId || !portfolio) return;
    const today = new Date().toDateString();
    const lastShown = localStorage.getItem('dailyReportLastShown');
    const disabled = localStorage.getItem('dailyReportDisabled') === 'true';
    if (!disabled && lastShown !== today) {
      setShowDailyReport(true);
      localStorage.setItem('dailyReportLastShown', today);
    }
  }, [currentUserId, portfolio]);

  // Fetch provider health status periodically
  useEffect(() => {
    const fetchHealth = () => getHealthStatus().then(setHealthStatus).catch(() => {});
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdate = () => {
    fetchData();
    setSummaryRefreshTrigger((t) => t + 1);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const findHolding = (ticker: string) => portfolio?.holdings.find(h => h.ticker.toUpperCase() === ticker.toUpperCase()) ?? null;

  if (authLoading) {
    return (
      <div className="min-h-screen min-h-dvh bg-rh-light-bg dark:bg-rh-black flex items-center justify-center">
        <div className="text-center">
          <img src="/north-signal-logo-transparent.png" alt="" className="h-12 w-12 animate-spin mx-auto mb-4" />
        </div>
      </div>
    );
  }

  // Public privacy/terms page (accessible without auth, needed for Plaid questionnaire)
  const rawHash = window.location.hash.slice(1);
  if (rawHash === 'privacy' || rawHash === 'terms') {
    return <PrivacyPage initialTab={rawHash} />;
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  if (loading && !portfolio) {
    return (
      <div className="min-h-screen min-h-dvh bg-rh-light-bg dark:bg-transparent flex items-center justify-center">
        <Starfield />
        <div className="relative z-10 text-center">
          <img src="/north-signal-logo-transparent.png" alt="" className="h-12 w-12 animate-spin mx-auto mb-4" />
        </div>
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="min-h-screen min-h-dvh bg-rh-light-bg dark:bg-transparent flex items-center justify-center">
        <Starfield />
        <div className="relative z-10 text-center max-w-md mx-auto p-6">
          <div className="text-rh-red text-6xl mb-4">!</div>
          <h1 className="text-xl font-semibold text-rh-light-text dark:text-rh-text mb-2">Connection Error</h1>
          <p className="text-rh-light-muted dark:text-rh-muted mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="bg-rh-green hover:bg-green-600 text-black font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-dvh bg-rh-light-bg dark:bg-transparent text-rh-light-text dark:text-rh-text" style={{ paddingTop: 'env(safe-area-inset-top)' }} onTouchStart={onPullStart} onTouchMove={onPullMove} onTouchEnd={onPullEnd}>
      {/* Fixed shield covering the iOS status bar area so scrolling content is hidden behind it */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-rh-light-bg dark:bg-black" style={{ height: 'env(safe-area-inset-top)' }} />
      <Starfield />
      <div className="grain-overlay" />
      <div className="sticky z-30" style={{ top: 'env(safe-area-inset-top)', WebkitBackfaceVisibility: 'hidden' }}>
      <header className="relative z-20 border-b border-rh-light-border/40 dark:border-rh-border/40 bg-rh-light-bg dark:bg-black/95 backdrop-blur-xl">
        <div className="px-3 py-2 flex sm:hidden items-center gap-2">
          {/* Mobile: logo + controls inline */}
          <div
            className="h-[35px] w-[35px] cursor-pointer flex-shrink-0"
            onClick={() => { setActiveTab('portfolio'); setViewingStock(null); setCompareStocks(null); }}
          >
            <img src="/north-signal-logo.png" alt="Nala" className="h-full w-full hidden dark:block" />
            <img src="/north-signal-logo-transparent.png" alt="Nala" className="h-full w-full dark:hidden" />
          </div>
          <div className="flex-1 flex items-center justify-end gap-2">
            <div className="flex-1 max-w-[400px] sm:max-w-[260px] min-w-[120px]">
              <TickerAutocompleteInput
                value={searchQuery}
                onChange={setSearchQuery}
                onSelect={(result) => {
                  const held = findHolding(result.symbol);
                  setViewingStock({ ticker: result.symbol, holding: held });
                  setSearchQuery('');
                }}
                heldTickers={portfolio?.holdings.map(h => h.ticker) ?? []}
                externalRef={searchRef}
                compact
              />
            </div>
            {currentUserName && currentUserId && (
              <UserMenu
                userName={currentUserName}
                userId={currentUserId}
                onProfileClick={() => { setViewingStock(null); setViewingProfileId(currentUserId); setActiveTab('profile'); }}
                onSettingsClick={() => setSettingsModalOpen(true)}
                onLogoutClick={logout}
              />
            )}
            {currentUserId && (
              <button
                onClick={() => { setShowDailyReport(true); setDailyReportHidden(false); }}
                className="relative p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-colors"
                title="Today's Brief"
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </button>
            )}
            {currentUserId && <NotificationBell userId={currentUserId} onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })} />}
            <button
              onClick={toggleTheme}
              className="hidden sm:flex items-center p-1.5 rounded-lg transition-colors
                hover:bg-gray-100 dark:hover:bg-rh-dark
                text-rh-light-muted dark:text-rh-muted"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            {lastUpdate && (
              <span className={`hidden sm:inline text-[11px] whitespace-nowrap flex items-center gap-1.5 ${
                isStale ? 'text-yellow-500/70' : 'text-rh-light-muted/50 dark:text-rh-muted/50'
              }`}>
                {isStale && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-400" />
                  </span>
                )}
                {lastUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} <span className={isStale ? 'text-yellow-500/40' : 'text-rh-light-muted/30 dark:text-rh-muted/30'}>{getLocalTzAbbr()}</span>
              </span>
            )}
          </div>
        </div>

        {/* Desktop: logo far-left, tabs aligned with content column, controls far-right */}
        <div className="hidden sm:flex items-center h-14 px-5 gap-4">
          {/* Logo */}
          <div
            className="h-[30px] w-[30px] cursor-pointer flex-shrink-0"
            onClick={() => { setActiveTab('portfolio'); setViewingStock(null); setCompareStocks(null); }}
          >
            <img src="/north-signal-logo.png" alt="Nala" className="h-full w-full hidden dark:block" />
            <img src="/north-signal-logo-transparent.png" alt="Nala" className="h-full w-full dark:hidden" />
          </div>

          {/* Primary nav — left edge aligned with content container below */}
          <nav className="flex items-center"
            style={{ marginLeft: 'max(0px, calc((100vw - clamp(1080px, 64vw, 1530px)) / 2 - 72px))' }}>
            {PRIMARY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setViewingProfileId(null);
                  setViewingStock(null);
                  setLeaderboardUserId(null);
                  setCompareStocks(null);
                }}
                className={`relative px-3 py-2 text-[13px] rounded-md transition-all duration-150 whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'text-rh-green font-semibold bg-rh-green/[0.08]'
                    : 'text-rh-light-muted/60 dark:text-rh-muted/60 font-medium hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100/60 dark:hover:bg-white/[0.04]'
                  }`}
              >
                {tab.label}
                <span className={`absolute bottom-0 left-2.5 right-2.5 h-0.5 bg-rh-green rounded-full transition-all duration-200 ${
                  activeTab === tab.id ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                }`} />
              </button>
            ))}
            {/* More dropdown */}
            <div className="relative" ref={moreDropdownRef}>
              <button
                onClick={() => setMoreDropdownOpen(!moreDropdownOpen)}
                className={`relative px-3 py-2 text-[13px] font-medium rounded-md transition-all duration-150 whitespace-nowrap flex items-center gap-1
                  ${visibleMoreTabs.some(t => t.id === activeTab)
                    ? 'text-rh-green font-semibold bg-rh-green/[0.08]'
                    : 'text-rh-light-muted/60 dark:text-rh-muted/60 hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100/60 dark:hover:bg-white/[0.04]'
                  }`}
              >
                {visibleMoreTabs.find(t => t.id === activeTab)?.label || 'More'}
                <svg className={`w-3 h-3 transition-transform duration-150 ${moreDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className={`absolute bottom-0 left-2.5 right-2.5 h-0.5 bg-rh-green rounded-full transition-all duration-200 ${
                  visibleMoreTabs.some(t => t.id === activeTab) ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                }`} />
              </button>
              {moreDropdownOpen && (
                <div className="absolute top-full left-0 mt-1.5 bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl shadow-2xl py-1.5 min-w-[160px] z-50">
                  {visibleMoreTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setViewingProfileId(null);
                        setViewingStock(null);
                        setLeaderboardUserId(null);
                        setCompareStocks(null);
                        setMoreDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors duration-150
                        ${activeTab === tab.id
                          ? 'text-rh-green font-semibold bg-rh-green/[0.06]'
                          : 'text-rh-light-text dark:text-rh-text/80 hover:bg-rh-light-bg dark:hover:bg-rh-dark font-medium'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Search — flexible middle zone */}
          <div className="flex-1 max-w-[420px] min-w-[180px]">
            <TickerAutocompleteInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSelect={(result) => {
                const held = findHolding(result.symbol);
                setViewingStock({ ticker: result.symbol, holding: held });
                setSearchQuery('');
              }}
              heldTickers={portfolio?.holdings.map(h => h.ticker) ?? []}
              externalRef={searchRef}
              compact
            />
          </div>

          {/* Right utilities — notifications, brief, theme, profile */}
          <div className="flex items-center gap-1 ml-auto">
            {currentUserId && <NotificationBell userId={currentUserId} onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })} />}
            {currentUserId && (
              <button
                onClick={() => { setShowDailyReport(true); setDailyReportHidden(false); }}
                className="p-2 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-all duration-150"
                title="Today's Brief"
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg transition-all duration-150
                hover:bg-gray-100 dark:hover:bg-rh-dark
                text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            {currentUserName && currentUserId && (
              <UserMenu
                userName={currentUserName}
                userId={currentUserId}
                onProfileClick={() => { setViewingStock(null); setViewingProfileId(currentUserId); setActiveTab('profile'); }}
                onSettingsClick={() => setSettingsModalOpen(true)}
                onLogoutClick={logout}
              />
            )}
          </div>
        </div>
      </header>

      {/* Mobile-only navigation */}
      <div className="sm:hidden">
        <Navigation activeTab={activeTab} userPlan={user?.plan} onTabChange={(tab) => {
          setActiveTab(tab);
          setViewingProfileId(null);
          setViewingStock(null);
          setLeaderboardUserId(null);
          setCompareStocks(null);
        }} />
      </div>
      </div>

      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden bg-rh-light-bg dark:bg-black"
        style={{
          height: pullY > 0 ? `${pullY}px` : '0px',
          transition: pullActive.current ? 'none' : 'height 0.3s ease',
        }}
      >
        <img
          src="/north-signal-logo-transparent.png"
          alt=""
          className={`h-6 w-6 ${refreshing ? 'animate-spin' : ''}`}
          style={{ opacity: pullY > 10 ? Math.min(pullY / 50, 1) : 0, transform: refreshing ? undefined : `rotate(${pullY * 4}deg)` }}
        />
      </div>

      <main className={`relative z-10 mx-auto py-4 sm:py-6 space-y-6 sm:space-y-8 ${
        activeTab === 'discover' && !viewingStock
          ? 'max-w-[clamp(1080px,62vw,1620px)] px-2 sm:px-3'
          : 'max-w-[clamp(1080px,64vw,1530px)] px-3 sm:px-6'
      }`}>
        {!isOnline && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
            <p className="text-yellow-400 text-sm font-medium">
              You're offline — market data may be outdated
            </p>
          </div>
        )}
        {compareStocks && compareStocks.length >= 2 && (
          <Suspense fallback={<PageFallback />}>
            <CompareStocksPage
              tickers={compareStocks}
              onBack={() => {
                const first = compareStocks[0];
                setCompareStocks(null);
                setViewingStock({ ticker: first, holding: findHolding(first) });
              }}
              onTickerClick={(ticker) => {
                setCompareStocks(null);
                setViewingStock({ ticker, holding: findHolding(ticker) });
              }}
              onUpdateTickers={(tickers) => setCompareStocks(tickers)}
            />
          </Suspense>
        )}

        {viewingStock && !compareStocks && (
          <Suspense fallback={<PageFallback />}>
            <StockDetailView
              ticker={viewingStock.ticker}
              holding={viewingStock.holding}
              portfolioTotal={portfolio?.totalAssets ?? 0}
              onBack={() => {
                if (dailyReportHidden) {
                  setDailyReportHidden(false);
                }
                setViewingStock(null);
              }}
              onHoldingAdded={() => {
                fetchData();
                setTimeout(async () => {
                  const p = await getPortfolio();
                  const held = p.holdings.find(h => h.ticker.toUpperCase() === viewingStock.ticker.toUpperCase()) ?? null;
                  setViewingStock(prev => prev ? { ...prev, holding: held } : null);
                  setPortfolio(p);
                }, 500);
              }}
            />
          </Suspense>
        )}

        {activeTab === 'portfolio' && !viewingStock && !compareStocks && (
          <>
            {portfolio && (portfolio.quotesUnavailableCount ?? 0) > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-yellow-400 text-sm font-medium">Some quotes unavailable</p>
                  <p className="text-yellow-400/70 text-xs">
                    {portfolio.quotesUnavailableCount} of {portfolio.holdings.length} holdings have no current price data.
                    Totals may be incomplete.
                  </p>
                </div>
              </div>
            )}

            {portfolio && (
              <div className="-mx-3 sm:-mx-6">
                <PortfolioValueChart
                  currentValue={portfolio.netEquity}
                  dayChange={portfolio.dayChange}
                  dayChangePercent={portfolio.dayChangePercent}
                  regularDayChange={portfolio.regularDayChange}
                  regularDayChangePercent={portfolio.regularDayChangePercent}
                  afterHoursChange={portfolio.afterHoursChange}
                  afterHoursChangePercent={portfolio.afterHoursChangePercent}
                  refreshTrigger={portfolioRefreshCount}
                  fetchFn={(period) => getPortfolioChart(period)}
                  onPeriodChange={setChartPeriod}
                  onReturnChange={setChartReturnPct}
                  onMeasurementChange={setChartMeasurement}
                  session={portfolio.session}
                />
              </div>
            )}

            {portfolio && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {chartMeasurement ? (
                  <>
                    {/* Measurement left card */}
                    <div className="bg-rh-light-card dark:bg-white/[0.015] border border-rh-light-border/40 dark:border-white/[0.04] rounded-xl p-5 shadow-sm shadow-black/[0.03] dark:shadow-none">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">
                        {new Date(chartMeasurement.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        {' → '}
                        {new Date(chartMeasurement.endTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className={`text-sm font-extrabold ${
                          chartMeasurement.dollarChange >= 0 ? 'text-rh-green profit-glow twinkle-glow' : 'text-rh-red loss-glow twinkle-glow'
                        }`}>
                          {chartMeasurement.dollarChange >= 0 ? '+' : '-'}${Math.abs(chartMeasurement.dollarChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-[10px] ${chartMeasurement.percentChange >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                          {chartMeasurement.percentChange >= 0 ? '+' : ''}{chartMeasurement.percentChange.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    {/* Measurement right card */}
                    {chartMeasurement.outperformance !== null && (
                      <div className="bg-rh-light-card dark:bg-white/[0.015] border border-rh-light-border/40 dark:border-white/[0.04] rounded-xl p-5 shadow-sm shadow-black/[0.03] dark:shadow-none">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">vs SPY</span>
                        <div className="mt-1">
                          <span className={`text-sm font-bold ${
                            chartMeasurement.outperformance >= 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                          }`}>
                            {chartMeasurement.outperformance >= 0 ? '+' : ''}{chartMeasurement.outperformance.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Left card: Assets, Cash/Margin, Total P/L */}
                    <div className="bg-rh-light-card dark:bg-white/[0.015] border border-rh-light-border/40 dark:border-white/[0.04] rounded-xl p-5 shadow-sm shadow-black/[0.03] dark:shadow-none space-y-3">
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45"><Term beginner="Total Value" advanced="Assets" /></span>
                        <div className="text-base font-bold text-rh-light-text dark:text-rh-text">
                          {portfolio.totalAssets > 0 ? formatCurrency(portfolio.totalAssets) : '—'}
                        </div>
                      </div>
                      {(portfolio.cashBalance > 0 || portfolio.marginDebt > 0) && (
                        <div className="flex items-center gap-2">
                          {portfolio.cashBalance > 0 && (
                            <div className="flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg bg-rh-green/[0.08] border border-rh-green/20">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-rh-green/60">Cash</span>
                              <span className="text-sm font-bold text-rh-green">${portfolio.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          {portfolio.marginDebt > 0 && (
                            <div className="flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg bg-rh-red/[0.08] border border-rh-red/20">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-rh-red/60">Margin</span>
                              <span className="text-sm font-bold text-rh-red">-${portfolio.marginDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35"><Term beginner="All-Time Gain/Loss" advanced="Total P/L" /></span>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-base font-extrabold ${
                            portfolio.totalPL === 0 ? 'text-rh-light-text dark:text-rh-text' : portfolio.totalPL > 0 ? 'text-rh-green profit-glow twinkle-glow' : 'text-rh-red loss-glow twinkle-glow'
                          }`}>
                            {portfolio.holdings.length > 0 ? formatCurrency(portfolio.totalPL) : '—'}
                          </span>
                          {portfolio.holdings.length > 0 && (
                            <span className={`text-xs ${portfolio.totalPL >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                              {formatPercent(portfolio.totalPLPercent)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right card: Equity, Day */}
                    <div className="bg-rh-light-card dark:bg-white/[0.015] border border-rh-light-border/40 dark:border-white/[0.04] rounded-xl p-5 shadow-sm shadow-black/[0.03] dark:shadow-none space-y-3">
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45"><Term beginner="Total Owned" advanced="Equity" /></span>
                        <div className="text-base font-bold text-rh-light-text dark:text-rh-text">
                          {formatCurrency(portfolio.netEquity)}
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35"><Term beginner="Today" advanced="Day" /></span>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-base font-bold ${
                            portfolio.dayChange === 0 ? 'text-rh-light-text dark:text-rh-text' : portfolio.dayChange > 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                          }`}>
                            {portfolio.holdings.length > 0 ? formatCurrency(portfolio.dayChange) : '—'}
                          </span>
                          {portfolio.holdings.length > 0 && (
                            <span className={`text-xs ${portfolio.dayChange >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                              {formatPercent(portfolio.dayChangePercent)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {portfolio && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-rh-light-card dark:bg-white/[0.015] border border-rh-light-border/40 dark:border-white/[0.04] rounded-xl shadow-sm shadow-black/[0.03] dark:shadow-none overflow-hidden">
                  <BenchmarkWidget refreshTrigger={portfolioRefreshCount} window={chartPeriod} chartReturnPct={chartReturnPct} />
                </div>
                <div className="bg-rh-light-card dark:bg-white/[0.015] border border-rh-light-border/40 dark:border-white/[0.04] rounded-xl shadow-sm shadow-black/[0.03] dark:shadow-none overflow-hidden">
                  <DividendsSection refreshTrigger={portfolioRefreshCount} holdings={portfolio.holdings} onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })} />
                </div>
              </div>
            )}

            <div className="-mx-3 sm:-mx-6 space-y-8">
              <HoldingsTable
                holdings={portfolio?.holdings ?? []}
                onUpdate={handleUpdate}
                onTickerClick={(ticker, holding) => setViewingStock({ ticker, holding })}
                cashBalance={portfolio?.cashBalance ?? 0}
                marginDebt={portfolio?.marginDebt ?? 0}
                userId={currentUserId}
                chartPeriod={chartPeriod}
              />
              {(portfolio?.options?.length ?? 0) > 0 && (
                <div className="px-3 sm:px-6">
                  <OptionsTable
                    options={portfolio!.options}
                    onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                  />
                </div>
              )}
              <PerformanceSummary refreshTrigger={summaryRefreshTrigger} />
            </div>
          </>
        )}

        <Suspense fallback={<PageFallback />}>
          {activeTab === 'nala' && !viewingStock && (
            <PremiumOverlay
              featureName="Nala AI"
              description="AI-powered stock research and analysis. Get personalized stock picks, risk assessments, and actionable insights powered by real financial data."
            />
          )}

          {activeTab === 'insights' && !viewingStock && (
            <ErrorBoundary>
              <InsightsPage
                onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                currentValue={portfolio?.netEquity ?? 0}
                refreshTrigger={portfolioRefreshCount}
                session={portfolio?.session}
                cashBalance={portfolio?.cashBalance ?? 0}
                totalAssets={portfolio?.totalAssets ?? 0}
                marginDebt={portfolio?.marginDebt ?? 0}
                initialSubTab={insightsSubTab}
                onSubTabChange={setInsightsSubTab}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'watchlists' && (
            <div style={viewingStock ? { display: 'none' } : undefined}>
              <ErrorBoundary>
                <WatchlistPage
                  onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                />
              </ErrorBoundary>
            </div>
          )}

          {activeTab === 'discover' && !viewingStock && (
            <ErrorBoundary>
              <DiscoverPage
                onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                subTab={discoverSubTab}
                onSubTabChange={setDiscoverSubTab}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'macro' && !viewingStock && (
            <ErrorBoundary>
              <EconomicIndicators />
            </ErrorBoundary>
          )}

          {activeTab === 'leaderboard' && !viewingProfileId && !viewingStock && comparingUser && (
            <ErrorBoundary>
              <PortfolioCompare
                theirUserId={comparingUser.userId}
                theirDisplayName={comparingUser.displayName}
                onBack={() => setComparingUser(null)}
                onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'leaderboard' && !viewingProfileId && !viewingStock && !comparingUser && (
            <ErrorBoundary>
              <LeaderboardPage
                session={portfolio?.session}
                currentUserId={currentUserId}
                onStockClick={(ticker) => setViewingStock({ ticker, holding: null })}
                selectedUserId={leaderboardUserId}
                onSelectedUserChange={setLeaderboardUserId}
                onCompare={handleCompare}
              />
            </ErrorBoundary>
          )}

          {viewingProfileId && !viewingStock && (
            <ErrorBoundary>
              <UserProfileView
                userId={viewingProfileId}
                currentUserId={currentUserId}
                session={portfolio?.session}
                onBack={() => { setViewingProfileId(null); if (activeTab === 'profile') setActiveTab('portfolio'); }}
                onStockClick={(ticker) => setViewingStock({ ticker, holding: null })}
                onUserClick={handleViewProfile}
                onPortfolioUpdate={handleUpdate}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'watch' && (
            <div className={viewingStock ? 'hidden' : undefined}>
              <ErrorBoundary>
                <WatchPage
                  pipEnabled={pipEnabled}
                  onPipToggle={handlePipToggle}
                  status={streamStatus}
                  hasError={streamHasError}
                  videoContainerRef={watchContainerCallback}
                  channels={CHANNELS}
                  activeChannel={activeChannel}
                  onChannelChange={setActiveChannel}
                  onPlay={handleManualPlay}
                  onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                />
              </ErrorBoundary>
            </div>
          )}

          {activeTab === 'feed' && !viewingProfileId && !viewingStock && (
            <ErrorBoundary>
              <FeedPage
                currentUserId={currentUserId}
                onUserClick={handleViewProfile}
                onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'pricing' && (
            <ErrorBoundary>
              <PricingPage />
            </ErrorBoundary>
          )}
        </Suspense>
      </main>

      <video
        ref={videoRef}
        controls
        playsInline
        autoPlay
        muted
        className="w-full aspect-video"
        style={{ background: '#000', display: 'none' }}
      />

      <footer className="relative z-10 border-t border-rh-light-border/30 dark:border-rh-border/30 mt-12 py-6">
        <p className="text-center text-[11px] text-rh-light-muted/60 dark:text-rh-muted/60 max-w-2xl mx-auto px-4">
          Past performance does not guarantee future results. For informational purposes only. Not financial advice.
        </p>
        <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-rh-light-muted/40 dark:text-rh-muted/40">
          <button
            onClick={() => { setPrivacyModalTab('privacy'); setShowPrivacyModal(true); }}
            className="hover:text-rh-light-muted dark:hover:text-rh-muted transition-colors"
          >
            Privacy Policy
          </button>
          <span>·</span>
          <button
            onClick={() => { setPrivacyModalTab('terms'); setShowPrivacyModal(true); }}
            className="hover:text-rh-light-muted dark:hover:text-rh-muted transition-colors"
          >
            Terms of Service
          </button>
          <span>·</span>
          <span>Piques LLC</span>
        </div>
      </footer>

      {showMiniPlayer && (
        <MiniPlayer
          channelName={activeChannel.name}
          onClose={handleMiniPlayerClose}
          onExpand={handleMiniPlayerExpand}
        >
          <div ref={miniVideoContainerRef} className="aspect-video bg-black" />
        </MiniPlayer>
      )}

      <AccountSettingsModal
        userId={currentUserId}
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onSave={() => fetchData()}
        healthStatus={healthStatus}
      />
      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        initialTab={privacyModalTab}
      />
      {(showDailyReport || dailyReportHidden) && (
        <DailyReportModal
          onClose={() => { setShowDailyReport(false); setDailyReportHidden(false); }}
          hidden={dailyReportHidden}
          onTickerClick={(ticker) => {
            setDailyReportHidden(true);
            setViewingStock({ ticker, holding: findHolding(ticker) });
          }}
        />
      )}
      <ShortcutToast message={toastMessage} />
      <KeyboardCheatSheet isOpen={isCheatSheetOpen} onClose={closeCheatSheet} />
      {showVerifyEmailModal && user?.email && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowVerifyEmailModal(false); setVerifyCode(''); setVerifyError(''); }} />
          <div className="relative bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-2">Verify Your Email</h3>
            <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-4">
              Enter the 6-digit code sent to <span className="text-rh-light-text dark:text-rh-text font-medium">{user.email}</span>
            </p>
            {verifyError && (
              <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{verifyError}</div>
            )}
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (verifyCode.length !== 6 || verifyLoading) return;
              setVerifyLoading(true);
              setVerifyError('');
              try {
                await verifyEmail(user.email!, verifyCode);
                setShowVerifyEmailModal(false);
                setVerifyCode('');
              } catch (err) {
                setVerifyError(err instanceof Error ? err.message : 'Verification failed');
              } finally {
                setVerifyLoading(false);
              }
            }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-3 bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border rounded-lg text-rh-light-text dark:text-rh-text text-center text-2xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-rh-green/60 focus:border-rh-green"
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
              />
              <button
                type="submit"
                disabled={verifyCode.length !== 6 || verifyLoading}
                className="w-full mt-4 py-2.5 bg-rh-green hover:bg-rh-green/90 disabled:bg-rh-green/40 text-white font-semibold rounded-lg transition-colors"
              >
                {verifyLoading ? 'Verifying...' : 'Verify'}
              </button>
            </form>
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={async () => {
                  if (verifyResendCooldown > 0) return;
                  try {
                    await resendVerification(user.email!);
                    setVerifyResendCooldown(60);
                    const iv = setInterval(() => setVerifyResendCooldown(p => { if (p <= 1) { clearInterval(iv); return 0; } return p - 1; }), 1000);
                  } catch { setVerifyError('Failed to resend code'); }
                }}
                disabled={verifyResendCooldown > 0}
                className="text-sm text-rh-green hover:text-rh-green/80 disabled:text-rh-light-muted/40 dark:disabled:text-rh-muted/40 transition-colors"
              >
                {verifyResendCooldown > 0 ? `Resend in ${verifyResendCooldown}s` : 'Resend code'}
              </button>
              <button
                type="button"
                onClick={() => { setShowVerifyEmailModal(false); setVerifyCode(''); setVerifyError(''); }}
                className="text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
