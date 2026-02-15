import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Portfolio, Settings, PortfolioChartPeriod } from './types';
import { getPortfolio, getSettings, getPortfolioChart, getHealthStatus, HealthStatus } from './api';
import { REFRESH_INTERVAL } from './config';
import { HoldingsTable, HoldingsTableActions } from './components/HoldingsTable';
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
import { PremiumOverlay } from './components/PremiumOverlay';
import { useKeyboardShortcuts } from './components/useKeyboardShortcuts';
import { ShortcutToast, KeyboardCheatSheet } from './components/KeyboardShortcuts';
import { DailyReportModal } from './components/DailyReportModal';
import { LoginPage } from './components/LoginPage';
import { useAuth } from './context/AuthContext';
import { Holding } from './types';
import type Hls from 'hls.js';
import Starfield from './components/Starfield';
import { MiniPlayer } from './components/MiniPlayer';
import { Term } from './components/Term';

import { formatCurrency, formatPercent } from './utils/format';
import { getInitialTheme, applyTheme } from './utils/theme';
import { getSessionDisplay, getLocalTzAbbr } from './utils/market';
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

// Preload heatmap data 3s after boot so Heatmap tab opens instantly
setTimeout(() => {
  import('./api').then(({ getMarketHeatmap }) => {
    getMarketHeatmap('1D', 'SP500').then(resp => {
      (window as any).__heatmapPreload = { data: resp, ts: Date.now() };
    }).catch(() => {});
  });
}, 3000);

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-rh-green border-t-transparent" />
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

const VALID_TABS = new Set<TabType>(['portfolio', 'nala', 'insights', 'watchlists', 'discover', 'macro', 'leaderboard', 'feed', 'watch']);

function parseHash(): NavState {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const params = new URLSearchParams(hash);
    const rawTab = params.get('tab') || 'portfolio';
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
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
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
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(initialNav.profile);
  const [leaderboardUserId, setLeaderboardUserId] = useState<string | null>(initialNav.lbuser);
  const [insightsSubTab, setInsightsSubTab] = useState<string | null>(initialNav.subtab);
  const [viewingStock, setViewingStock] = useState<{ ticker: string; holding: Holding | null } | null>(
    initialNav.stock ? { ticker: initialNav.stock, holding: null } : null
  );
  // Premium-gated: const [nalaQuestion, setNalaQuestion] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [dailyReportHidden, setDailyReportHidden] = useState(false);

  // --- Keyboard shortcuts ---
  const searchRef = useRef<{ focus: () => void } | null>(null);
  const holdingsActionsRef = useRef<HoldingsTableActions | null>(null);
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  const clearNavigationState = useCallback(() => {
    setViewingProfileId(null);
    setViewingStock(null);
    setLeaderboardUserId(null);
  }, []);
  const { toastMessage, isCheatSheetOpen, closeCheatSheet } = useKeyboardShortcuts({
    activeTab,
    setActiveTab,
    focusSearch,
    clearNavigationState,
  });

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

  // Sync navigation state → URL hash
  useEffect(() => {
    const stockTicker = viewingStock?.ticker || null;
    const subtab = activeTab === 'insights' ? insightsSubTab : null;
    const hashTab = activeTab;
    setHash(hashTab, stockTicker, viewingProfileId, leaderboardUserId, subtab);
  }, [activeTab, viewingStock, viewingProfileId, leaderboardUserId, insightsSubTab]);

  // Handle browser back/forward — parse directly from hash, never sessionStorage
  useEffect(() => {
    const onHashChange = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const rawTab = params.get('tab') || 'portfolio';
      const tab = VALID_TABS.has(rawTab as TabType) ? (rawTab as TabType) : 'portfolio';
      const stock = params.get('stock') || null;
      const profile = params.get('profile') || null;
      const lbuser = params.get('lbuser') || null;
      const subtab = params.get('subtab') || null;

      setActiveTab(tab);
      setViewingProfileId(profile);
      setLeaderboardUserId(lbuser);
      setInsightsSubTab(subtab);
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
      const settingsData = await getSettings(currentUserId);

      const hasValidData = portfolioData.holdings.length === 0 ||
        portfolioData.holdings.some(h => !h.priceUnavailable && h.currentPrice > 0);

      const holdingsChanged = !lastValidPortfolio.current ||
        portfolioData.holdings.length !== lastValidPortfolio.current.holdings.length ||
        portfolioData.holdings.some(h => !lastValidPortfolio.current!.holdings.find(old => old.ticker === h.ticker));

      if (!hasValidData && lastValidPortfolio.current && !holdingsChanged) {
        console.log('New data has unavailable quotes, keeping previous price data but updating settings');
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
        console.log('Fetch failed, keeping previous state:', message);
        setIsStale(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [portfolio, currentUserId]);

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
      <div className="min-h-screen bg-rh-light-bg dark:bg-rh-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-rh-green border-t-transparent mx-auto mb-4"></div>
          <p className="text-rh-light-muted dark:text-rh-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (loading && !portfolio) {
    return (
      <div className="min-h-screen bg-rh-light-bg dark:bg-transparent flex items-center justify-center">
        <Starfield />
        <div className="relative z-10 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-rh-green border-t-transparent mx-auto mb-4"></div>
          <p className="text-rh-light-muted dark:text-rh-muted">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="min-h-screen bg-rh-light-bg dark:bg-transparent flex items-center justify-center">
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
    <div className="min-h-screen bg-rh-light-bg dark:bg-transparent text-rh-light-text dark:text-rh-text" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Fixed shield covering the iOS status bar area so scrolling content is hidden behind it */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-rh-light-bg dark:bg-black" style={{ height: 'env(safe-area-inset-top)' }} />
      <Starfield />
      <div className="grain-overlay" />
      <div className="sticky z-30" style={{ top: 'env(safe-area-inset-top)', WebkitBackfaceVisibility: 'hidden' }}>
      <header className="relative z-20 border-b border-rh-light-border/40 dark:border-rh-border/40 bg-rh-light-bg dark:bg-black/95 backdrop-blur-xl">
        <div className="max-w-[clamp(1200px,75vw,1800px)] mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-[35px] w-[35px] cursor-pointer"
              onClick={() => { setActiveTab('portfolio'); setViewingStock(null); }}
            >
              <img src="/north-signal-logo.png" alt="Nala" className="h-full w-full hidden dark:block" />
              <img src="/north-signal-logo-transparent.png" alt="Nala" className="h-full w-full dark:hidden" />
            </div>
          </div>
          <div className="flex-1 flex items-center justify-end gap-2 sm:gap-4">
            <div className="flex-1 max-w-[400px] min-w-[120px]">
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
            {portfolio?.session && (
              <span
                className={`text-xs px-2 py-1 rounded border font-medium cursor-default
                  ${portfolio.session === 'CLOSED' ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' : ''}
                  ${portfolio.session === 'REG' ? 'bg-green-500/20 text-green-400 border-green-500/30 animate-[breathing_1.2s_ease-in-out_infinite]' : ''}
                  ${portfolio.session !== 'CLOSED' && portfolio.session !== 'REG' ? getSessionDisplay(portfolio.session).color : ''}`}
                title={getSessionDisplay(portfolio.session).description}
              >
                {getSessionDisplay(portfolio.session).label}
              </span>
            )}
            {currentUserName && currentUserId && (
              <UserMenu
                userName={currentUserName}
                userId={currentUserId}
                onProfileClick={() => { setViewingStock(null); setViewingProfileId(currentUserId); setActiveTab('leaderboard'); }}
                onSettingsClick={() => setSettingsModalOpen(true)}
                onLogoutClick={logout}
              />
            )}
            {currentUserId && (
              <button
                onClick={() => { setShowDailyReport(true); setDailyReportHidden(false); }}
                className="relative p-2 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-colors"
                title="Today's Brief"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </button>
            )}
            {currentUserId && <NotificationBell userId={currentUserId} />}
            <button
              onClick={toggleTheme}
              className="hidden sm:flex group items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors
                bg-gray-100 dark:bg-rh-dark hover:bg-gray-200 dark:hover:bg-rh-border
                text-rh-light-muted dark:text-rh-muted"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4 group-hover:text-yellow-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
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
      </header>

      <Navigation activeTab={activeTab} onTabChange={(tab) => {
        setActiveTab(tab);
        setViewingProfileId(null);
        setViewingStock(null);
        setLeaderboardUserId(null);
      }} />
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
        {viewingStock && (
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

        {activeTab === 'portfolio' && !viewingStock && (
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
              <div className="px-6 py-4 border-y border-gray-200/30 dark:border-white/[0.04] space-y-3">
                {/* Stats grid — 2 columns on mobile, inline on desktop */}
                {chartMeasurement ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">
                        {new Date(chartMeasurement.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        {' → '}
                        {new Date(chartMeasurement.endTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                      <div className="flex items-baseline gap-1.5">
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
                    {chartMeasurement.outperformance !== null && (
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">vs SPY</span>
                        <div>
                          <span className={`text-sm font-bold ${
                            chartMeasurement.outperformance >= 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                          }`}>
                            {chartMeasurement.outperformance >= 0 ? '+' : ''}{chartMeasurement.outperformance.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45"><Term beginner="Total Value" advanced="Assets" /></span>
                      <div className="text-sm font-bold text-rh-light-text/80 dark:text-rh-text/80">
                        {portfolio.totalAssets > 0 ? formatCurrency(portfolio.totalAssets) : '—'}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45"><Term beginner="Total Owned" advanced="Equity" /></span>
                      <div className="text-sm font-bold text-rh-light-text/80 dark:text-rh-text/80">
                        {formatCurrency(portfolio.netEquity)}
                      </div>
                    </div>
                    {(portfolio.cashBalance > 0 || portfolio.marginDebt > 0) && (
                      <div className="flex items-center gap-2">
                        {portfolio.cashBalance > 0 && (
                          <div className="flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg bg-rh-green/[0.08] border border-rh-green/20">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-rh-green/60">Cash</span>
                            <span className="text-xs font-bold text-rh-green">${portfolio.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {portfolio.marginDebt > 0 && (
                          <div className="flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg bg-rh-red/[0.08] border border-rh-red/20">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-rh-red/60">Margin</span>
                            <span className="text-xs font-bold text-rh-red">-${portfolio.marginDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35"><Term beginner="Today" advanced="Day" /></span>
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-sm font-bold ${
                          portfolio.dayChange === 0 ? 'text-rh-light-text/80 dark:text-rh-text/80' : portfolio.dayChange > 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                        }`}>
                          {portfolio.holdings.length > 0 ? formatCurrency(portfolio.dayChange) : '—'}
                        </span>
                        {portfolio.holdings.length > 0 && (
                          <span className={`text-[10px] ${portfolio.dayChange >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                            {formatPercent(portfolio.dayChangePercent)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35"><Term beginner="All-Time Gain/Loss" advanced="Total P/L" /></span>
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-sm font-extrabold ${
                          portfolio.totalPL === 0 ? 'text-rh-light-text/80 dark:text-rh-text/80' : portfolio.totalPL > 0 ? 'text-rh-green profit-glow twinkle-glow' : 'text-rh-red loss-glow twinkle-glow'
                        }`}>
                          {portfolio.holdings.length > 0 ? formatCurrency(portfolio.totalPL) : '—'}
                        </span>
                        {portfolio.holdings.length > 0 && (
                          <span className={`text-[10px] ${portfolio.totalPL >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                            {formatPercent(portfolio.totalPLPercent)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* Action buttons */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => holdingsActionsRef.current?.openCashMargin()}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rh-light-border/40 dark:border-rh-border/30
                      text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-all duration-150 text-xs hover:scale-[1.02]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Cash & Margin
                  </button>
                  <button
                    type="button"
                    onClick={() => holdingsActionsRef.current?.openAdd()}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rh-green text-black font-semibold
                      hover:bg-green-600 transition-all duration-150 text-xs hover:scale-[1.02]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Stock
                  </button>
                </div>
              </div>
            )}

            {portfolio && (
              <div className="flex flex-col md:flex-row md:items-start">
                <div className="md:flex-1 min-w-0">
                  <BenchmarkWidget refreshTrigger={portfolioRefreshCount} window={chartPeriod} chartReturnPct={chartReturnPct} />
                </div>
                <div className="hidden md:block w-px self-stretch bg-gray-200/20 dark:bg-white/[0.04] my-3" />
                <div className="md:hidden h-px bg-gray-200/20 dark:bg-white/[0.04] mx-6" />
                <div className="md:flex-1 min-w-0">
                  <DividendsSection refreshTrigger={portfolioRefreshCount} holdings={portfolio.holdings} onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })} />
                </div>
              </div>
            )}

            <div className="space-y-8">
              <HoldingsTable
                holdings={portfolio?.holdings ?? []}
                onUpdate={handleUpdate}
                onTickerClick={(ticker, holding) => setViewingStock({ ticker, holding })}
                cashBalance={portfolio?.cashBalance ?? 0}
                marginDebt={portfolio?.marginDebt ?? 0}
                userId={currentUserId}
                actionsRef={holdingsActionsRef}
                chartPeriod={chartPeriod}
              />
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
              />
            </ErrorBoundary>
          )}

          {activeTab === 'macro' && !viewingStock && (
            <ErrorBoundary>
              <EconomicIndicators />
            </ErrorBoundary>
          )}

          {activeTab === 'leaderboard' && !viewingProfileId && !viewingStock && (
            <ErrorBoundary>
              <LeaderboardPage
                session={portfolio?.session}
                currentUserId={currentUserId}
                onStockClick={(ticker) => setViewingStock({ ticker, holding: null })}
                selectedUserId={leaderboardUserId}
                onSelectedUserChange={setLeaderboardUserId}
              />
            </ErrorBoundary>
          )}

          {viewingProfileId && !viewingStock && (
            <ErrorBoundary>
              <UserProfileView
                userId={viewingProfileId}
                currentUserId={currentUserId}
                session={portfolio?.session}
                onBack={() => setViewingProfileId(null)}
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
    </div>
  );
}
