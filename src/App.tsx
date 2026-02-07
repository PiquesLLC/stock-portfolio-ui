import { useState, useEffect, useCallback, useRef } from 'react';
import { Portfolio, Settings, MarketSession, PortfolioChartPeriod } from './types';
import { getPortfolio, getSettings, getUsers, getPortfolioChart } from './api';
import { REFRESH_INTERVAL } from './config';
import { HoldingsTable, HoldingsTableActions } from './components/HoldingsTable';
import { PerformanceSummary } from './components/PerformanceSummary';
import { Navigation, TabType } from './components/Navigation';
import { InsightsPage } from './components/InsightsPage';
import NalaAIPage from './components/NalaAIPage';
import { EconomicIndicators } from './components/EconomicIndicators';
import { LeaderboardPage } from './components/LeaderboardPage';
import { FeedPage } from './components/FeedPage';
import { WatchPage } from './components/WatchPage';
import { MiniPlayer } from './components/MiniPlayer';
import { UserProfileView } from './components/UserProfileView';
import { StockDetailView } from './components/StockDetailView';
import { PortfolioValueChart, ChartMeasurement } from './components/PortfolioValueChart';
import { BenchmarkWidget } from './components/BenchmarkWidget';

import { DividendsSection } from './components/DividendsSection';
import { NotificationBell } from './components/NotificationBell';
import { UserMenu } from './components/UserMenu';
import { AccountSettingsModal } from './components/AccountSettingsModal';
import { TickerAutocompleteInput } from './components/TickerAutocompleteInput';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useKeyboardShortcuts } from './components/useKeyboardShortcuts';
import { ShortcutToast, KeyboardCheatSheet } from './components/KeyboardShortcuts';
import { FuturesBanner } from './components/FuturesBanner';

import { DailyReportModal } from './components/DailyReportModal';
import { LoginPage } from './components/LoginPage';
import { useAuth } from './context/AuthContext';
import { Holding } from './types';
import Hls from 'hls.js';
import Starfield from './components/Starfield';

export interface Channel {
  id: string;
  name: string;
  url: string;
  website: string;
  description: string;
}

export const CHANNELS: Channel[] = [
  { id: 'cnbc', name: 'CNBC', url: '/hls/cnbc/cnbcsd.m3u8', website: 'https://www.cnbc.com/live-tv/', description: 'Business News' },
  { id: 'bloomberg', name: 'Bloomberg US', url: 'https://www.bloomberg.com/media-manifest/streams/us.m3u8', website: 'https://www.bloomberg.com/live', description: 'Markets & Finance' },
  { id: 'yahoo-finance', name: 'Yahoo Finance', url: 'https://d1ewctnvcwvvvu.cloudfront.net/playlist.m3u8', website: 'https://finance.yahoo.com/live/', description: 'Markets & Investing' },
];

// Theme utilities
function getInitialTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem('theme');
  if (stored === 'light') return 'light';
  return 'dark'; // Default to dark
}

function applyTheme(theme: 'dark' | 'light') {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem('theme', theme);
}

// Convert ET hours:minutes to user's local timezone string
function etToLocal(hour: number, minute: number): string {
  // Create a date in ET, then format in user's local timezone
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const localDate = new Date(now);
  const offsetMs = localDate.getTime() - etDate.getTime();
  const et = new Date(now);
  et.setHours(hour, minute, 0, 0);
  // Adjust: shift from ET to the date that would produce the same ET time, then add offset
  const etToday = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  etToday.setHours(hour, minute, 0, 0);
  const local = new Date(etToday.getTime() + offsetMs);
  return local.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getLocalTzAbbr(): string {
  return new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(new Date())
    .find(p => p.type === 'timeZoneName')?.value || '';
}

function getSessionDisplay(session?: MarketSession): { label: string; color: string; description: string } {
  const tz = getLocalTzAbbr();
  switch (session) {
    case 'PRE': return { label: 'PRE', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', description: `Pre-Market (${etToLocal(4, 0)} - ${etToLocal(9, 30)} ${tz})` };
    case 'REG': return { label: 'OPEN', color: 'bg-green-500/20 text-green-400 border-green-500/30', description: `Regular Session (${etToLocal(9, 30)} - ${etToLocal(16, 0)} ${tz})` };
    case 'POST': return { label: 'AH', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', description: `After-Hours (${etToLocal(16, 0)} - ${etToLocal(20, 0)} ${tz})` };
    case 'CLOSED': return { label: 'CLOSED', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', description: 'Market Closed' };
    default: return { label: 'CLOSED', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', description: 'Market Closed' };
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// Parse hash to restore navigation state on load/refresh
interface NavState {
  tab: TabType;
  stock: string | null;
  profile: string | null;
  lbuser: string | null; // leaderboard selected user
}

// Valid tab names for URL parameter validation
const VALID_TABS = new Set<TabType>(['portfolio', 'nala', 'insights', 'macro', 'leaderboard', 'feed', 'watch']);

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
    };
    sessionStorage.setItem('navState', JSON.stringify(state));
    return state;
  }
  try {
    const saved = sessionStorage.getItem('navState');
    if (saved) {
      const s = JSON.parse(saved);
      return { tab: s.tab || 'portfolio', stock: s.stock || null, profile: s.profile || null, lbuser: s.lbuser || null };
    }
  } catch {}
  return { tab: 'portfolio', stock: null, profile: null, lbuser: null };
}

function setHash(tab: TabType, stock?: string | null, profile?: string | null, lbuser?: string | null) {
  const params = new URLSearchParams();
  if (tab !== 'portfolio') params.set('tab', tab);
  if (stock) params.set('stock', stock);
  if (profile) params.set('profile', profile);
  if (lbuser) params.set('lbuser', lbuser);
  const str = params.toString();
  window.location.hash = str ? str : '';
  sessionStorage.setItem('navState', JSON.stringify({ tab, stock, profile, lbuser }));
}

const savedInitialNav = parseHash(); // Parse once at module load, before any React renders

export default function App() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
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
  const [summaryRefreshTrigger, setSummaryRefreshTrigger] = useState(0);
  const [portfolioRefreshCount, setPortfolioRefreshCount] = useState(0);
  const [showExtendedHours, setShowExtendedHours] = useState(() => {
    const stored = localStorage.getItem('showExtendedHours');
    return stored !== null ? stored === 'true' : true;
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  const [activeTab, setActiveTab] = useState<TabType>(initialNav.tab);
  // Use authenticated user from auth context
  const currentUserId = user?.id || '';
  const currentUserName = user?.displayName || user?.username || '';
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(initialNav.profile);
  const [leaderboardUserId, setLeaderboardUserId] = useState<string | null>(initialNav.lbuser);
  const [viewingStock, setViewingStock] = useState<{ ticker: string; holding: Holding | null } | null>(
    initialNav.stock ? { ticker: initialNav.stock, holding: null } : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const [showDailyReport, setShowDailyReport] = useState(false);

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
    return stored !== null ? stored === 'true' : true; // default ON
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

  // Callback ref: when WatchPage's container mounts, bump containerReady to re-trigger the effect
  const watchContainerCallback = useCallback((node: HTMLDivElement | null) => {
    watchVideoContainerRef.current = node;
    if (node) setContainerReady(c => c + 1);
  }, []);

  const handlePipToggle = (enabled: boolean) => {
    setPipEnabled(enabled);
    localStorage.setItem('pipEnabled', String(enabled));
  };

  // Activate stream when navigating to Watch tab
  useEffect(() => {
    if (activeTab === 'watch') {
      setStreamActive(true);
    } else if (!pipEnabled) {
      setStreamActive(false);
    }
  }, [activeTab, pipEnabled]);

  const handleMiniPlayerClose = () => {
    setStreamActive(false);
  };

  const handleMiniPlayerExpand = () => {
    setActiveTab('watch');
    setViewingProfileId(null);
    setViewingStock(null);
    setLeaderboardUserId(null);
  };

  // When viewing a stock detail on the Watch tab, treat it like navigating away
  const watchFullyVisible = activeTab === 'watch' && !viewingStock;
  const showMiniPlayer = streamActive && pipEnabled && !watchFullyVisible;

  // Unified effect: move video into correct container, then init/destroy HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Determine if stream should be active (derive directly, don't wait for state)
    const shouldBeActive = watchFullyVisible || (streamActive && pipEnabled);

    // 1. Place video in the right container
    if (watchFullyVisible && watchVideoContainerRef.current) {
      watchVideoContainerRef.current.appendChild(video);
      video.style.display = '';
    } else if (shouldBeActive && !watchFullyVisible && miniVideoContainerRef.current) {
      miniVideoContainerRef.current.appendChild(video);
      video.style.display = '';
    } else {
      video.style.display = 'none';
    }

    // 2. Start or stop HLS
    if (!shouldBeActive) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
        loadedChannelRef.current = null;
      }
      setStreamStatus('Loading stream...');
      setStreamHasError(false);
      return;
    }

    // If channel changed, tear down and re-init
    if (hlsRef.current && loadedChannelRef.current !== activeChannel.id) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      loadedChannelRef.current = null;
      setStreamStatus('Loading stream...');
      setStreamHasError(false);
    }

    // Already running correct channel
    if (hlsRef.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        debug: false,
        lowLatencyMode: true,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });
      hlsRef.current = hls;
      loadedChannelRef.current = activeChannel.id;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStreamStatus('');
        setStreamHasError(false);
        video.play().catch(() => {
          setStreamStatus('Click to play');
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('HLS error:', data.type, data.details);
        if (data.fatal) {
          setStreamHasError(true);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setStreamStatus('Network error — retrying...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
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
      video.src = activeChannel.url;
      loadedChannelRef.current = activeChannel.id;
      video.addEventListener('loadedmetadata', () => {
        setStreamStatus('');
        video.play().catch(() => {
          setStreamStatus('Click to play');
        });
      });
    } else {
      setStreamStatus('HLS not supported in this browser');
      setStreamHasError(true);
    }
  }, [streamActive, activeTab, pipEnabled, activeChannel, containerReady, watchFullyVisible]);

  // User ID now comes from auth context - no manual fetching needed

  const handleViewProfile = (userId: string) => {
    setViewingProfileId(userId);
  };

  // Sync navigation state → URL hash
  useEffect(() => {
    const stockTicker = viewingStock?.ticker || null;
    setHash(activeTab, stockTicker, viewingProfileId, leaderboardUserId);
  }, [activeTab, viewingStock, viewingProfileId, leaderboardUserId]);

  // Handle browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const nav = parseHash();
      setActiveTab(nav.tab);
      setViewingProfileId(nav.profile);
      setLeaderboardUserId(nav.lbuser);
      if (nav.stock) {
        setViewingStock(prev => prev?.ticker === nav.stock ? prev : { ticker: nav.stock!, holding: null });
      } else {
        setViewingStock(null);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Keep track of the last valid portfolio to avoid flickering
  const lastValidPortfolio = useRef<Portfolio | null>(null);
  // Track last totalAssets to only trigger projection refresh on value change
  const lastTotalAssets = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentUserId) return; // Wait for user to be set
    try {
      const portfolioData = await getPortfolio(currentUserId);
      const settingsData = await getSettings(currentUserId);

      // Check if the new data is valid (not showing -100% P/L for all holdings)
      const hasValidData = portfolioData.holdings.length === 0 ||
        portfolioData.holdings.some(h => !h.priceUnavailable && h.currentPrice > 0);

      // Check if holdings structure changed (new stock added/removed)
      const holdingsChanged = !lastValidPortfolio.current ||
        portfolioData.holdings.length !== lastValidPortfolio.current.holdings.length ||
        portfolioData.holdings.some(h => !lastValidPortfolio.current!.holdings.find(old => old.ticker === h.ticker));

      // If we have unavailable quotes but holdings structure changed, we MUST accept the new data
      // Otherwise the new holding or settings won't be reflected
      if (!hasValidData && lastValidPortfolio.current && !holdingsChanged) {
        console.log('New data has unavailable quotes, keeping previous price data but updating settings');
        // Merge: keep old price-related data but use new settings (cashBalance, marginDebt)
        setPortfolio({
          ...lastValidPortfolio.current,
          cashBalance: portfolioData.cashBalance,
          marginDebt: portfolioData.marginDebt,
          // Recalculate netEquity with new margin debt but old holdings value
          netEquity: lastValidPortfolio.current.totalAssets - portfolioData.marginDebt,
        });
        setSettings(settingsData);
        setIsStale(true);
        return;
      }

      // Update with new data
      setPortfolio(portfolioData);
      setSettings(settingsData);
      setError('');
      setLastUpdate(new Date());

      // Only trigger projection refresh when portfolio value actually changes
      const newTotalAssets = Math.round(portfolioData.totalAssets * 100) / 100;
      if (lastTotalAssets.current === null || newTotalAssets !== lastTotalAssets.current) {
        lastTotalAssets.current = newTotalAssets;
        setPortfolioRefreshCount((c) => c + 1);
      }

      // Track repricing state
      const dataIsRepricing = portfolioData.quotesMeta?.anyRepricing ||
        portfolioData.quotesStale ||
        (portfolioData.quotesUnavailableCount && portfolioData.quotesUnavailableCount > 0);
      setIsStale(!!dataIsRepricing);

      // Save as last valid portfolio if it has good data
      if (hasValidData) {
        lastValidPortfolio.current = portfolioData;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';

      // On fetch error, keep existing data and show stale indicator
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

  // Show daily report on first visit of the day
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

  const handleUpdate = () => {
    fetchData();
    setSummaryRefreshTrigger((t) => t + 1);
  };

  const toggleExtendedHours = () => {
    const newValue = !showExtendedHours;
    setShowExtendedHours(newValue);
    localStorage.setItem('showExtendedHours', String(newValue));
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  // Determine if we're currently in extended hours
  const isExtendedHours = portfolio?.session === 'PRE' || portfolio?.session === 'POST';


  // Show loading while checking auth
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

  // Show login page if not authenticated
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
    <div className="min-h-screen bg-rh-light-bg dark:bg-transparent text-rh-light-text dark:text-rh-text">
      <Starfield />
      <div className="grain-overlay" />
      <header className="relative z-30 border-b border-rh-light-border/40 dark:border-rh-border/40 dark:bg-black/30 dark:backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Dark mode: show PNG as-is. Light mode: use image as mask over green fill */}
            <div
              className="h-[35px] w-[35px] cursor-pointer"
              onClick={() => { setActiveTab('portfolio'); setViewingStock(null); }}
            >
              <img src="/north-signal-logo.png" alt="Nala" className="h-full w-full hidden dark:block" />
              <img src="/north-signal-logo-transparent.png" alt="Nala" className="h-full w-full dark:hidden" />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Global Stock Search */}
            <div className="w-[140px] sm:w-[270px]">
              <TickerAutocompleteInput
                value={searchQuery}
                onChange={setSearchQuery}
                onSelect={(result) => {
                  const held = portfolio?.holdings.find(h => h.ticker.toUpperCase() === result.symbol.toUpperCase()) ?? null;
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
            {/* User Menu */}
            {currentUserName && currentUserId && (
              <UserMenu
                userName={currentUserName}
                userId={currentUserId}
                onProfileClick={() => { setViewingStock(null); setViewingProfileId(currentUserId); setActiveTab('leaderboard'); }}
                onSettingsClick={() => setSettingsModalOpen(true)}
                onLogoutClick={logout}
              />
            )}
            {/* Notification Bell */}
            {currentUserId && <NotificationBell userId={currentUserId} />}

            {/* Theme Toggle - hidden on mobile */}
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
              <span className="hidden sm:inline text-[11px] text-rh-light-muted/50 dark:text-rh-muted/50 whitespace-nowrap">
                {lastUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} <span className="text-rh-light-muted/30 dark:text-rh-muted/30">{getLocalTzAbbr()}</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <Navigation activeTab={activeTab} onTabChange={(tab) => {
        setActiveTab(tab);
        setViewingProfileId(null);
        setViewingStock(null);
        setLeaderboardUserId(null);
      }} />

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-6 space-y-8">
        {/* Stock Detail Overlay (works from any tab) */}
        {viewingStock && (
          <StockDetailView
            ticker={viewingStock.ticker}
            holding={viewingStock.holding}
            portfolioTotal={portfolio?.totalAssets ?? 0}
            onBack={() => setViewingStock(null)}
            onHoldingAdded={() => {
              fetchData();
              // Update viewingStock to reflect the new holding after refresh
              setTimeout(async () => {
                const p = await getPortfolio(currentUserId);
                const held = p.holdings.find(h => h.ticker.toUpperCase() === viewingStock.ticker.toUpperCase()) ?? null;
                setViewingStock(prev => prev ? { ...prev, holding: held } : null);
                setPortfolio(p);
              }, 500);
            }}
          />
        )}

        {/* Portfolio Tab */}
        {activeTab === 'portfolio' && !viewingStock && (
          <>
            {/* Stale Data Banner - only show if quotes are completely unavailable */}
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

            {/* Portfolio Value Chart */}
            {portfolio && (
              <div className="space-y-0">
                <PortfolioValueChart
                  currentValue={portfolio.netEquity}
                  dayChange={portfolio.dayChange}
                  dayChangePercent={portfolio.dayChangePercent}
                  regularDayChange={portfolio.regularDayChange}
                  regularDayChangePercent={portfolio.regularDayChangePercent}
                  afterHoursChange={portfolio.afterHoursChange}
                  afterHoursChangePercent={portfolio.afterHoursChangePercent}
                  refreshTrigger={portfolioRefreshCount}
                  fetchFn={(period) => getPortfolioChart(period, currentUserId)}
                  onPeriodChange={setChartPeriod}
                  onReturnChange={setChartReturnPct}
                  onMeasurementChange={setChartMeasurement}
                  session={portfolio.session}
                />
                <FuturesBanner session={portfolio.session} refreshTrigger={portfolioRefreshCount} />
              </div>
            )}

            {/* Key Metrics — compact inline bar */}
            {portfolio && (
              <div className="flex flex-wrap items-center gap-y-2 px-6 py-3 border-y border-white/[0.04] dark:border-white/[0.04] border-gray-200/30">
                {/* Capital group */}
                <div className="flex items-baseline gap-1.5 mr-8">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45">Assets</span>
                  <span className="text-sm font-bold text-rh-light-text/80 dark:text-rh-text/80">
                    {portfolio.totalAssets > 0 ? formatCurrency(portfolio.totalAssets) : '—'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 mr-10">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/45">Equity</span>
                  <span className="text-sm font-bold text-rh-light-text/80 dark:text-rh-text/80">
                    {formatCurrency(portfolio.netEquity)}
                  </span>
                  {portfolio.marginDebt > 0 && (
                    <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">
                      (${portfolio.marginDebt.toLocaleString()} margin)
                    </span>
                  )}
                </div>
                {/* Divider — separates capital from performance */}
                <div className="hidden md:block w-px h-5 bg-white/[0.08] dark:bg-white/[0.08] bg-gray-300/40 mr-10" />
                {/* Performance group — swaps to measurement data when active */}
                {chartMeasurement ? (
                  <>
                    <div className="flex items-baseline gap-1.5 mr-8">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">
                        {new Date(chartMeasurement.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        {' → '}
                        {new Date(chartMeasurement.endTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                      <span className={`text-sm font-extrabold ${
                        chartMeasurement.dollarChange >= 0 ? 'text-rh-green profit-glow twinkle-glow' : 'text-rh-red loss-glow twinkle-glow'
                      }`}>
                        {chartMeasurement.dollarChange >= 0 ? '+' : '-'}${Math.abs(chartMeasurement.dollarChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className={`text-[10px] ${chartMeasurement.percentChange >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                        {chartMeasurement.percentChange >= 0 ? '+' : ''}{chartMeasurement.percentChange.toFixed(2)}%
                      </span>
                    </div>
                    {chartMeasurement.outperformance !== null && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">vs SPY</span>
                        <span className={`text-sm font-bold ${
                          chartMeasurement.outperformance >= 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                        }`}>
                          {chartMeasurement.outperformance >= 0 ? '+' : ''}{chartMeasurement.outperformance.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1.5 mr-8">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">Day</span>
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
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">Total P/L</span>
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
                  </>
                )}
                {/* Action buttons — pushed right */}
                <div className="flex items-center gap-2 ml-auto">
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

            {/* Benchmark + Dividends */}
            {portfolio && (
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="md:flex-1">
                  <BenchmarkWidget refreshTrigger={portfolioRefreshCount} window={chartPeriod} chartReturnPct={chartReturnPct} />
                </div>
                <div className="hidden md:block w-px self-stretch bg-white/[0.04] dark:bg-white/[0.04] bg-gray-200/30 my-4" />
                <div className="md:flex-1">
                  <DividendsSection refreshTrigger={portfolioRefreshCount} holdings={portfolio.holdings} />
                </div>
              </div>
            )}

            {/* Holdings + Performance */}
            <div className="space-y-8">
              <HoldingsTable
                holdings={portfolio?.holdings ?? []}
                onUpdate={handleUpdate}
                showExtendedHours={showExtendedHours}
                onTickerClick={(ticker, holding) => setViewingStock({ ticker, holding })}
                cashBalance={portfolio?.cashBalance ?? 0}
                marginDebt={portfolio?.marginDebt ?? 0}
                userId={currentUserId}
                actionsRef={holdingsActionsRef}
              />

              <PerformanceSummary refreshTrigger={summaryRefreshTrigger} />
            </div>

          </>
        )}

        {/* Nala AI Tab */}
        {activeTab === 'nala' && !viewingStock && (
          <ErrorBoundary>
            <NalaAIPage
              onTickerClick={(ticker) => setViewingStock({ ticker, holding: portfolio?.holdings.find(h => h.ticker.toUpperCase() === ticker.toUpperCase()) ?? null })}
            />
          </ErrorBoundary>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && !viewingStock && (
          <ErrorBoundary>
            <InsightsPage
              onTickerClick={(ticker) => setViewingStock({ ticker, holding: portfolio?.holdings.find(h => h.ticker.toUpperCase() === ticker.toUpperCase()) ?? null })}
              currentValue={portfolio?.netEquity ?? 0}
              refreshTrigger={portfolioRefreshCount}
              session={portfolio?.session}
              cashBalance={portfolio?.cashBalance ?? 0}
              totalAssets={portfolio?.totalAssets ?? 0}
            />
          </ErrorBoundary>
        )}

        {/* Macro Tab */}
        {activeTab === 'macro' && !viewingStock && (
          <ErrorBoundary>
            <EconomicIndicators />
          </ErrorBoundary>
        )}

        {/* Leaderboard Tab */}
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

        {/* Profile View (overlays leaderboard or feed tab) */}
        {viewingProfileId && !viewingStock && (
          <ErrorBoundary>
            <UserProfileView
              userId={viewingProfileId}
              currentUserId={currentUserId}
              session={portfolio?.session}
              onBack={() => setViewingProfileId(null)}
              onStockClick={(ticker) => setViewingStock({ ticker, holding: null })}
            />
          </ErrorBoundary>
        )}

        {/* Watch Tab — keep mounted (hidden) when viewing a stock so the video stream isn't interrupted */}
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
                onTickerClick={(ticker) => setViewingStock({ ticker, holding: portfolio?.holdings.find(h => h.ticker === ticker) ?? null })}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* Feed Tab */}
        {activeTab === 'feed' && !viewingProfileId && !viewingStock && (
          <ErrorBoundary>
            <FeedPage
              currentUserId={currentUserId}
              onUserClick={handleViewProfile}
              onTickerClick={(ticker) => setViewingStock({ ticker, holding: portfolio?.holdings.find(h => h.ticker === ticker) ?? null })}
            />
          </ErrorBoundary>
        )}
      </main>

      {/* Persistent video element — always in DOM, moved between containers */}
      <video
        ref={videoRef}
        controls
        playsInline
        autoPlay
        muted
        className="w-full aspect-video"
        style={{ background: '#000', display: 'none' }}
      />

      {/* Disclaimer Footer */}
      <footer className="relative z-10 border-t border-rh-light-border/30 dark:border-rh-border/30 mt-12 py-6">
        <p className="text-center text-[11px] text-rh-light-muted/60 dark:text-rh-muted/60 max-w-2xl mx-auto px-4">
          Past performance does not guarantee future results. For informational purposes only. Not financial advice.
        </p>
      </footer>

      {/* Mini Player — shown when stream active + PiP enabled + not on Watch tab */}
      {showMiniPlayer && (
        <MiniPlayer
          channelName={activeChannel.name}
          onClose={handleMiniPlayerClose}
          onExpand={handleMiniPlayerExpand}
        >
          <div ref={miniVideoContainerRef} className="aspect-video bg-black" />
        </MiniPlayer>
      )}

      {/* Account Settings Modal */}
      <AccountSettingsModal
        userId={currentUserId}
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onSave={() => {
          // Refresh user data after settings change
          fetchData();
        }}
      />
      {/* Daily Report Modal */}
      {showDailyReport && (
        <DailyReportModal
          onClose={() => setShowDailyReport(false)}
          onTickerClick={(ticker) => {
            setShowDailyReport(false);
            setViewingStock({ ticker, holding: portfolio?.holdings.find(h => h.ticker === ticker) ?? null });
          }}
        />
      )}
      <ShortcutToast message={toastMessage} />
      <KeyboardCheatSheet isOpen={isCheatSheetOpen} onClose={closeCheatSheet} />
    </div>
  );
}
