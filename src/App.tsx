import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PortfolioChartPeriod } from './types';
import { getPortfolio, getPortfolioChart, getUserByUsername, EmailVerifyError, getDailyReport, listPortfolios, PortfolioRecord } from './api';
import { useBiometricUnlock } from './hooks/useBiometricUnlock';
import { HoldingsTable, HoldingsTableActions } from './components/HoldingsTable';
import { OptionsTable } from './components/OptionsTable';
import { PerformanceSummary } from './components/PerformanceSummary';
import { Navigation, TabType } from './components/Navigation';
import { PortfolioValueChart, ChartMeasurement } from './components/PortfolioValueChart';
import { BenchmarkWidget } from './components/BenchmarkWidget';
import { DividendsSection } from './components/DividendsSection';
import { NotificationBell } from './components/NotificationBell';
import { UserMenu } from './components/UserMenu';
// AccountSettingsModal removed — replaced by full-page AccountSettingsPage
import { TickerAutocompleteInput } from './components/TickerAutocompleteInput';
import { ShareButton } from './components/ShareButton';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { PremiumOverlay } from './components/PremiumOverlay';
import { useKeyboardShortcuts } from './components/useKeyboardShortcuts';
import { ShortcutToast, KeyboardCheatSheet } from './components/KeyboardShortcuts';
import { DailyReportModal } from './components/DailyReportModal';
import { LandingPage } from './components/LandingPage';
import { PrivacyPage } from './components/PrivacyPage';
import { SupportPage } from './components/SupportPage';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import PortfolioPicker from './components/PortfolioPicker';


import Starfield from './components/Starfield';
import { MarketStrip } from './components/MarketStrip';
import { Term } from './components/Term';

import { formatCurrency, formatPercent } from './utils/format';
import { getInitialTheme, applyTheme } from './utils/theme';
import { getLocalTzAbbr } from './utils/market';
import { normalizePortfolioTabs } from './utils/portfolioDisplay';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { usePortfolioData } from './hooks/usePortfolioData';
import { useNavigationState } from './hooks/useNavigationState';
import { useJobAlerts } from './hooks/useJobAlerts';
import { useAnalytics } from './hooks/useAnalytics';

// Lazy-loaded page components
const InsightsPage = lazy(() => import('./components/InsightsPage').then(m => ({ default: m.InsightsPage })));
const DeepResearchPage = lazy(() => import('./components/DeepResearchPage'));
const EconomicIndicators = lazy(() => import('./components/EconomicIndicators').then(m => ({ default: m.EconomicIndicators })));
const LeaderboardPage = lazy(() => import('./components/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const FeedPage = lazy(() => import('./components/FeedPage').then(m => ({ default: m.FeedPage })));
const WatchlistPage = lazy(() => import('./components/WatchlistPage').then(m => ({ default: m.WatchlistPage })));
const DiscoverPage = lazy(() => import('./components/DiscoverPage').then(m => ({ default: m.DiscoverPage })));
const UserProfileView = lazy(() => import('./components/UserProfileView').then(m => ({ default: m.UserProfileView })));
const StockDetailView = lazy(() => import('./components/StockDetailView').then(m => ({ default: m.StockDetailView })));
const PricingPage = lazy(() => import('./components/PricingPage').then(m => ({ default: m.PricingPage })));
const PortfolioCompare = lazy(() => import('./components/PortfolioCompare').then(m => ({ default: m.PortfolioCompare })));
const CompareStocksPage = lazy(() => import('./components/CompareStocksPage').then(m => ({ default: m.CompareStocksPage })));
const CreatorDashboardPage = lazy(() => import('./components/CreatorDashboard').then(m => ({ default: m.CreatorDashboard })));
const CreatorSettingsPageComp = lazy(() => import('./components/CreatorSettingsPage').then(m => ({ default: m.CreatorSettingsPage })));
const OnboardingTour = lazy(() => import('./components/OnboardingTour').then(m => ({ default: m.OnboardingTour })));
const GettingStartedChecklist = lazy(() => import('./components/GettingStartedChecklist').then(m => ({ default: m.GettingStartedChecklist })));
const WaitlistAdminPage = lazy(() => import('./components/WaitlistAdminPage').then(m => ({ default: m.WaitlistAdminPage })));
const JobsDashboard = lazy(() => import('./components/JobsDashboard').then(m => ({ default: m.JobsDashboard })));
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
const AccountSettingsPageComp2 = lazy(() => import('./components/settings/AccountSettingsPage'));
const PublicProfilePage = lazy(() => import('./components/PublicProfilePage'));

// Typed heatmap preload on window for cross-component cache seeding
declare global { interface Window { __heatmapPreload?: { data: import('./types').HeatmapResponse; ts: number } } }

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function getSafeHash(): string {
  return isBrowser() ? window.location.hash.slice(1) : '';
}

function getSafePathname(): string {
  return isBrowser() ? window.location.pathname : '/';
}

function safeSessionStorageSet(key: string, value: string): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(key, value);
  }
}

// Preload heatmap data 3s after boot so Heatmap tab opens instantly
if (isBrowser()) {
  setTimeout(() => {
    import('./api').then(({ getMarketHeatmap }) => {
      getMarketHeatmap('1D', 'SP500').then(resp => {
        window.__heatmapPreload = { data: resp, ts: Date.now() };
      }).catch(e => console.error('Heatmap preload failed:', e));
    });
  }, 3000);
}

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

const VALID_TABS = new Set<TabType>(['portfolio', 'nala', 'insights', 'watchlists', 'discover', 'macro', 'leaderboard', 'feed', 'pricing', 'profile']);

// Desktop-only tab list for the consolidated header bar
const PRIMARY_TABS: { id: TabType; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'insights', label: 'Insights' },
  { id: 'discover', label: 'Discover' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'watchlists', label: 'Watchlists' },
  { id: 'nala', label: 'Nala AI' },
];

const MORE_TABS: { id: TabType; label: string }[] = [
  { id: 'macro', label: 'Macro' },
  { id: 'feed', label: 'Feed' },
  { id: 'profile', label: 'Profile' },
  { id: 'pricing', label: 'Pricing' },
];


function parseHash(): NavState & { compareStocks?: string[] } {
  const hash = getSafeHash();
  if (hash) {
    const params = new URLSearchParams(hash);
    // Support legacy bare #pricing links in addition to the canonical #tab=pricing format
    const rawTab = params.get('tab') || (VALID_TABS.has(hash as TabType) ? hash : 'portfolio');

    // Handle compare page on initial load
    if (rawTab === 'compare') {
      const stocksRaw = params.get('stocks')?.split(',').filter(Boolean) ?? [];
      const normalized = [...new Set(stocksRaw.map(s => s.trim().toUpperCase()).filter(Boolean))].slice(0, 4);
      if (normalized.length >= 2) {
        safeSessionStorageSet('navState', JSON.stringify({ tab: 'compare', stock: null, profile: null, lbuser: null, subtab: null }));
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
    safeSessionStorageSet('navState', JSON.stringify(state));
    return state;
  }
  // No hash fragment — always default to portfolio.
  // sessionStorage is only for preserving state during hash-based navigation,
  // not for overriding a bare URL like nalaai.com.
  return { tab: 'portfolio', stock: null, profile: null, lbuser: null, subtab: null };
}

const savedInitialNav = parseHash();
// Check if initial hash was #tab=settings or #tab=admin-waitlist
const _initialSettingsView = (() => {
  const hash = getSafeHash();
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  return params.get('tab') === 'settings';
})();
// Capture the admin hash at module load (before nav sync can overwrite it).
// Actual state is applied only AFTER auth confirms isWaitlistAdmin — see useEffect below.
const _initialAdminHash = (() => {
  const hash = getSafeHash();
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const tab = params.get('tab');
  if (tab === 'admin-waitlist') return 'waitlist' as const;
  if (tab === 'admin-jobs') return 'jobs' as const;
  if (tab === 'admin-analytics') return 'analytics' as const;
  return null;
})();
const _initialAdminView = null;

// Detect shareable profile URL: nalaai.com/<username>
// Strict guard: single path segment, no file extension, valid username chars,
// not a reserved path. Only true username candidates hit the API.
// This set MUST stay aligned with RESERVED_USERNAMES in auth.validators.ts.
const _pathname = getSafePathname();
const _pathSegments = _pathname.split('/').filter(Boolean);
const _RESERVED_PATHS = new Set([
  // Build / dev / static
  'assets', 'src', 'node_modules',
  // API route prefixes (mirrored from auth.validators.ts)
  'auth', 'health', 'market', 'portfolio', 'dividends', 'settings', 'insights',
  'goals', 'intelligence', 'leaderboard', 'users', 'social', 'transactions',
  'alerts', 'analyst', 'milestones', 'fundamentals', 'watchlists', 'creator',
  'referral', 'notifications', 'plaid', 'billing',
  // UI tab names / routes
  'profile', 'discover', 'feed', 'pricing', 'macro', 'nala',
  // Common reserved words
  'api', 'www', 'app', 'help', 'support', 'about', 'login', 'signup', 'register',
  'account', 'dashboard', 'home', 'index', 'privacy', 'terms', 'tos',
  'admin', 'system', 'favicon', 'robots', 'sitemap',
]);
const _candidate = _pathSegments.length === 1 ? _pathSegments[0] : null;
const _pendingUsername: string | null =
  _candidate &&
  !_RESERVED_PATHS.has(_candidate.toLowerCase()) &&
  !/\.\w+$/.test(_candidate) &&
  /^[a-zA-Z0-9_]{3,20}$/.test(_candidate)
    ? _candidate
    : null;

export default function App() {
  const { user, isAuthenticated, isLoading: authLoading, logout, verifyEmail, resendVerification, refreshUser } = useAuth();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();
  // Auto-unlock with biometric auth when resuming from background (native only)
  useBiometricUnlock();
  const initialNav = savedInitialNav;
  const currentUserId = user?.id || '';
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | undefined>(() => {
    try { return localStorage.getItem('nala:selectedPortfolioId') || undefined; } catch { return undefined; }
  });

  // Persist portfolio selection across refreshes
  useEffect(() => {
    try {
      if (selectedPortfolioId) localStorage.setItem('nala:selectedPortfolioId', selectedPortfolioId);
      else localStorage.removeItem('nala:selectedPortfolioId');
    } catch { /* ignore */ }
  }, [selectedPortfolioId]);

  const [userPortfolios, setUserPortfolios] = useState<PortfolioRecord[]>([]);
  const holdingsActionsRef = useRef<HoldingsTableActions | null>(null);
  const {
    portfolio, loading, error, lastUpdate, isStale,
    healthStatus, summaryRefreshTrigger, portfolioRefreshCount,
    fetchData, handleUpdate,
  } = usePortfolioData({ currentUserId, authLoading, portfolioId: selectedPortfolioId });

  const [chartPeriod, setChartPeriod] = useState<PortfolioChartPeriod>(() => {
    try {
      const saved = sessionStorage.getItem('nala:chartPeriod');
      if (saved && ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'].includes(saved)) return saved as PortfolioChartPeriod;
    } catch { /* ignore */ }
    return '1D';
  });
  const [chartReturnPct, setChartReturnPct] = useState<number | null>(null);
  const [chartMeasurement, setChartMeasurement] = useState<ChartMeasurement | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  const {
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
  } = useNavigationState({
    initialNav,
    currentUserId,
    isAuthenticated,
    initialSettingsView: _initialSettingsView,
    initialAdminView: _initialAdminView,
  });

  const jobAlerts = useJobAlerts(!!user?.isWaitlistAdmin);

  // Restore admin view from URL hash AFTER auth confirms admin status.
  // Uses _initialAdminHash (captured at module load) because the nav sync effect
  // overwrites window.location.hash before this effect fires.
  useEffect(() => {
    if (!user?.isWaitlistAdmin || !_initialAdminHash) return;
    setAdminView(_initialAdminHash);
  }, [user?.isWaitlistAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for pricing hash changes, keeping support for both legacy and canonical formats
  useEffect(() => {
    const handleHashChange = () => {
      const raw = window.location.hash.slice(1);
      if (!raw) return;
      // Support both legacy #pricing and canonical #tab=pricing formats — only pricing, to avoid
      // conflicting with useNavigationState's hash listener for other tabs
      const params = new URLSearchParams(raw);
      const tab = params.get('tab') || raw;
      if (tab === 'pricing') {
        resetNavigation();
        setActiveTab('pricing');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-warm daily report cache — fire-and-forget on login so it's ready when user opens Daily Brief
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      getDailyReport().catch(() => {});
    }
  }, [isAuthenticated, authLoading]);

  // Fetch portfolios list for insights page picker
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      listPortfolios()
        .then((portfolios) => {
          const visiblePortfolios = normalizePortfolioTabs(portfolios);
          setUserPortfolios(visiblePortfolios);
          if (visiblePortfolios.length === 0) return;

          setSelectedPortfolioId((current) => {
            if (current && visiblePortfolios.some((p) => p.id === current)) return current;
            return visiblePortfolios[0].id;
          });
        })
        .catch(() => {});
    }
  }, [isAuthenticated, authLoading]);

  const currentUserName = user?.displayName || user?.username || '';
  const isPaidUser = user?.plan === 'pro' || user?.plan === 'premium' || user?.plan === 'elite';
  const visibleMoreTabs = useMemo(() =>
    isPaidUser ? MORE_TABS.filter(t => t.id !== 'pricing') : MORE_TABS,
    [isPaidUser]
  );
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const moreDropdownRef = useRef<HTMLDivElement>(null);
  const [mobilePortfolioMenuOpen, setMobilePortfolioMenuOpen] = useState(false);
  const [desktopPortfolioOpen, setDesktopPortfolioOpen] = useState(false);
  const desktopPortfolioRef = useRef<HTMLDivElement>(null);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [utilsMenuOpen, setUtilsMenuOpen] = useState(false);
  const utilsMenuRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDailyReport, setShowDailyReport] = useState(false);

  // Analytics telemetry — tracks feature views with duration, batches events to API
  useAnalytics(
    { activeTab, viewingStock, compareStocks, viewingProfileId, settingsView, creatorView, adminView, showDailyReport, comparingUser },
    isAuthenticated,
  );

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyModalTab, setPrivacyModalTab] = useState<'privacy' | 'terms'>('privacy');
  const [dailyReportHidden, setDailyReportHidden] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResendCooldown, setVerifyResendCooldown] = useState(0);
  const [verifyAttemptsLeft, setVerifyAttemptsLeft] = useState<number>(-1);
  const [verifyLocked, setVerifyLocked] = useState(false);
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);
  const verificationEmail = user?.email ?? null;

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

  // Close desktop portfolio dropdown on outside click
  useEffect(() => {
    if (!desktopPortfolioOpen) return;
    const handler = (e: MouseEvent) => {
      if (desktopPortfolioRef.current && !desktopPortfolioRef.current.contains(e.target as Node)) {
        setDesktopPortfolioOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [desktopPortfolioOpen]);

  // Close utils overflow menu on outside click
  useEffect(() => {
    if (!utilsMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (utilsMenuRef.current && !utilsMenuRef.current.contains(e.target as Node)) {
        setUtilsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [utilsMenuOpen]);

  // --- Handle Stripe checkout redirect ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout');
    if (!checkoutStatus) return;

    // Clean the query param from URL immediately
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);

    if (checkoutStatus === 'success') {
      showToast('Upgrade successful! Your plan is now active.', 'success');
      // Poll for plan update — webhook may not have landed yet
      (async () => {
        for (let i = 0; i < 6; i++) {
          await refreshUser();
          await new Promise(r => setTimeout(r, i === 0 ? 1000 : 2000));
        }
      })();
    } else if (checkoutStatus === 'cancel') {
      showToast('Checkout cancelled. You can upgrade anytime.', 'info');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Handle Stripe Connect onboarding return redirect ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectStatus = params.get('connect');
    if (connectStatus !== 'return' && connectStatus !== 'refresh') return;

    // Clean the query param from URL immediately
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);

    // Navigate to creator dashboard and refresh setup status
    setCreatorView('dashboard');
    if (connectStatus === 'return') {
      showToast('Stripe Connect setup complete! Verifying account status...', 'success');
    }
    // Refresh creator setup status — the fallback API check will query Stripe directly
    // if the webhook hasn't arrived yet
    refreshCreatorSetupStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Resolve shareable profile URL: /username → profile view ---
  useEffect(() => {
    if (!_pendingUsername) return;
    getUserByUsername(_pendingUsername).then((found) => {
      if (!found) {
        // Not a valid username — clean the URL and fall through to normal app
        window.history.replaceState(null, '', '/');
        return;
      }
      // If profile is private and visitor is not the owner, don't route into a broken state
      if (!found.profilePublic && found.id !== currentUserId) {
        window.history.replaceState(null, '', '/');
        return;
      }
      setViewingProfileId(found.id);
      setActiveTab('profile');
      // Replace clean URL with hash-based navigation
      window.history.replaceState(null, '', '/#profile=' + found.id);
    });
  }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Keyboard shortcuts ---
  const searchRef = useRef<{ focus: () => void } | null>(null);
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  const { toastMessage, isCheatSheetOpen, closeCheatSheet } = useKeyboardShortcuts({
    activeTab,
    setActiveTab,
    focusSearch,
    clearNavigationState,
  });

  // --- Pull-to-refresh + swipe-to-cycle tabs ---
  const {
    pullY, refreshing, isPulling, mainRef,
    onTouchStart: onTouchStartCombined,
    onTouchMove: onTouchMoveCombined,
    onTouchEnd: onTouchEndCombined,
  } = usePullToRefresh({
    activeTab,
    setActiveTab,
    resetNavigation,
    fetchData: handleUpdate,
    onRefreshTriggered: () => {},
    guards: { viewingStock, settingsView, creatorView, adminView, compareStocks, showOnboardingTour, showDailyReport, showPrivacyModal },
  });

  const handleViewProfile = (userId: string) => {
    setViewingProfileId(userId);
    window.scrollTo(0, 0);
  };
  const handleCompare = useCallback((userId: string, displayName: string) => {
    setComparingUser({ userId, displayName });
  }, [setComparingUser]);

  // Check creator setup status (for header button + dashboard checklist)
  const [creatorSetupStatus, setCreatorSetupStatus] = useState<import('./api').CreatorSetupStatus | null>(null);
  const refreshCreatorSetupStatus = useCallback(() => {
    if (!currentUserId) { setCreatorSetupStatus(null); return; }
    fetch('/api/creator/setup-status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(s => setCreatorSetupStatus(s))
      .catch(() => setCreatorSetupStatus(null));
  }, [currentUserId]);
  useEffect(() => { refreshCreatorSetupStatus(); }, [refreshCreatorSetupStatus]);

  useEffect(() => {
    if (!currentUserId || !portfolio) return;
    // Don't show daily briefing during onboarding tour
    if (showOnboardingTour) return;
    // Don't auto-show for users with no holdings — they'd just see a loading loop
    if (!portfolio.holdings || portfolio.holdings.length === 0) return;
    // Use market-day boundaries: new trading day starts at 9:30 AM ET (market open)
    // Before 9:30 AM ET, the "market day" is still the previous calendar day
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const marketOpenMinutes = 9 * 60 + 30; // 9:30 AM ET
    const currentMinutes = et.getHours() * 60 + et.getMinutes();
    const marketDay = new Date(et);
    if (currentMinutes < marketOpenMinutes) {
      marketDay.setDate(marketDay.getDate() - 1);
    }
    const marketDayKey = marketDay.toDateString();
    const lastShown = localStorage.getItem('dailyReportLastShown');
    const disabled = localStorage.getItem('dailyReportDisabled') === 'true';
    if (!disabled && lastShown !== marketDayKey) {
      setShowDailyReport(true);
      localStorage.setItem('dailyReportLastShown', marketDayKey);
    }
  }, [currentUserId, portfolio, showOnboardingTour]);

  // Show onboarding tour for new users (account created within last 5 minutes)
  useEffect(() => {
    if (!currentUserId || !portfolio || loading) return;
    if (localStorage.getItem('nala_tour_completed')) return;
    // Only show for genuinely new accounts — not existing users seeing the update
    const createdAt = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
    const isNewAccount = createdAt > 0 && (Date.now() - createdAt) < 5 * 60 * 1000;
    if (isNewAccount) {
      setShowOnboardingTour(true);
    } else {
      // Existing user seeing this for the first time — silently mark completed
      localStorage.setItem('nala_tour_completed', '1');
    }
  }, [currentUserId, portfolio, loading, user?.createdAt]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const findHolding = (ticker: string) => portfolio?.holdings.find(h => h.ticker.toUpperCase() === ticker.toUpperCase()) ?? null;

  const portfolioTickers = useMemo(() => {
    if (!portfolio?.holdings) return new Set<string>();
    return new Set(portfolio.holdings.map(h => h.ticker.toUpperCase()));
  }, [portfolio?.holdings]);

  if (authLoading) {
    return (
      <div className="min-h-screen min-h-dvh bg-rh-light-bg dark:bg-rh-black flex items-center justify-center">
        <div className="text-center">
          <img src="/north-signal-logo-transparent.png" alt="" className="h-12 w-12 animate-spin mx-auto mb-4" />
        </div>
      </div>
    );
  }

  // Public support/privacy/terms pages
  const safePathname = getSafePathname();
  const rawHash = window.location.hash.slice(1);
  if (safePathname === '/support' || rawHash === 'support') {
    return <SupportPage />;
  }
  if (rawHash === 'privacy' || rawHash === 'terms') {
    return <PrivacyPage initialTab={rawHash} />;
  }

  if (!isAuthenticated && _pendingUsername) {
    return (
      <Suspense fallback={<div className="h-screen h-dvh bg-[#050505] flex items-center justify-center"><img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin" /></div>}>
        <PublicProfilePage username={_pendingUsername} />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  // Hard gate: block entire app until email is verified (Resend active in production since Mar 8)
  if (import.meta.env.VITE_EMAIL_VERIFICATION_ENABLED === 'true' && user && user.emailVerified === false) {
    // Missing email edge case — show recovery path
    if (!user.email) {
      return (
        <div className="min-h-screen min-h-dvh bg-rh-light-bg dark:bg-transparent flex items-center justify-center px-4">
          <Starfield />
          <div className="relative z-10 w-full max-w-sm">
            <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-2xl p-6 shadow-2xl text-center">
              <img src="/north-signal-logo-transparent.png" alt="Nala" className="h-10 w-10 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-rh-light-text dark:text-rh-text mb-2">Email Required</h2>
              <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-4">
                Your account needs a verified email to continue. Please contact support or log out and try again.
              </p>
              <a href="mailto:support@piques.com" className="block text-sm text-rh-green hover:text-rh-green/80 transition-colors mb-3">
                support@piques.com
              </a>
              <button onClick={() => logout()} className="text-sm text-rh-light-muted dark:text-rh-muted hover:text-red-400 transition-colors">
                Log out
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen min-h-dvh bg-rh-light-bg dark:bg-transparent flex items-center justify-center px-4">
        <Starfield />
        <div className="relative z-10 w-full max-w-sm">
          <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-2xl p-6 shadow-2xl">
            <div className="text-center mb-6">
              <img src="/north-signal-logo-transparent.png" alt="Nala" className="h-10 w-10 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Verify Your Email</h2>
              <p className="text-sm text-rh-light-muted dark:text-rh-muted mt-1">
                Enter the 6-digit code sent to <span className="text-rh-light-text dark:text-rh-text font-medium">{user.email}</span>
              </p>
              <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 mt-1">
                Check your spam folder if you don't see it
              </p>
            </div>
            {verifyError && (
              <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm">
                <p className="text-red-400">{verifyError}</p>
                {verifyAttemptsLeft >= 0 && !verifyLocked && (
                  <p className="text-red-400/60 text-xs mt-1">
                    {verifyAttemptsLeft === 1 ? '1 attempt remaining' : `${verifyAttemptsLeft} attempts remaining`}
                  </p>
                )}
              </div>
            )}
            {verifyLocked ? (
              <div className="text-center">
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Too many attempts</p>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
                    Your code has been invalidated. Request a new one below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (verifyResendCooldown > 0) return;
                    if (!verificationEmail) { setVerifyError('Missing email for verification. Log out and sign in again.'); return; }
                    try {
                      await resendVerification(verificationEmail);
                      setVerifyError('');
                      setVerifyLocked(false);
                      setVerifyAttemptsLeft(-1);
                      setVerifyCode('');
                      setVerifyResendCooldown(60);
                      const iv = setInterval(() => setVerifyResendCooldown(p => { if (p <= 1) { clearInterval(iv); return 0; } return p - 1; }), 1000);
                    } catch { setVerifyError('Failed to resend code. Try again in a moment.'); }
                  }}
                  disabled={verifyResendCooldown > 0 || !verificationEmail}
                  className="w-full py-2.5 bg-rh-green hover:bg-rh-green/90 disabled:bg-rh-green/40 text-white font-semibold rounded-lg transition-colors"
                >
                  {verifyResendCooldown > 0 ? `Resend in ${verifyResendCooldown}s` : 'Send new code'}
                </button>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (verifyCode.length !== 6 || verifyLoading) return;
                if (!verificationEmail) { setVerifyError('Missing email for verification. Log out and sign in again.'); return; }
                setVerifyLoading(true);
                setVerifyError('');
                try {
                  await verifyEmail(verificationEmail, verifyCode);
                  setVerifyCode('');
                } catch (err) {
                  if (err instanceof EmailVerifyError) {
                    setVerifyAttemptsLeft(err.remainingAttempts);
                    if (err.isLockout) {
                      setVerifyLocked(true);
                      setVerifyError('');
                    } else {
                      const msg = err.message.includes('expired')
                        ? 'Code expired. Request a new one below.'
                        : err.message;
                      setVerifyError(msg);
                    }
                  } else {
                    setVerifyError(err instanceof Error ? err.message : 'Verification failed');
                  }
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
            )}
            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={async () => {
                  if (verifyResendCooldown > 0) return;
                  if (!verificationEmail) { setVerifyError('Missing email for verification. Log out and sign in again.'); return; }
                  try {
                    await resendVerification(verificationEmail);
                    setVerifyError('');
                    setVerifyResendCooldown(60);
                    const iv = setInterval(() => setVerifyResendCooldown(p => { if (p <= 1) { clearInterval(iv); return 0; } return p - 1; }), 1000);
                  } catch { setVerifyError('Failed to resend code. Try again in a moment.'); }
                }}
                disabled={verifyResendCooldown > 0 || verifyLocked || !verificationEmail}
                className="text-sm text-rh-green hover:text-rh-green/80 disabled:text-rh-light-muted/40 dark:disabled:text-rh-muted/40 transition-colors"
              >
                {verifyResendCooldown > 0 ? `Resend in ${verifyResendCooldown}s` : 'Resend code'}
              </button>
              <button
                type="button"
                onClick={() => logout()}
                className="text-sm text-rh-light-muted dark:text-rh-muted hover:text-red-400 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
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
    <div className="min-h-screen min-h-dvh bg-rh-light-bg dark:bg-transparent text-rh-light-text dark:text-rh-text" style={{ paddingTop: 'env(safe-area-inset-top)' }} onTouchStart={onTouchStartCombined} onTouchMove={onTouchMoveCombined} onTouchEnd={onTouchEndCombined}>
      {/* Fixed shield covering the iOS status bar area so scrolling content is hidden behind it */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-rh-light-bg dark:bg-black" style={{ height: 'env(safe-area-inset-top)' }} />
      <Starfield />
      <div className="grain-overlay" />
      {/* Onboarding tour for new users */}
      {showOnboardingTour && (
        <Suspense fallback={null}>
          <OnboardingTour
            onComplete={() => {
              localStorage.setItem('nala_tour_completed', '1');
              setShowOnboardingTour(false);
              fetchData();
            }}
            onSkip={() => {
              localStorage.setItem('nala_tour_completed', '1');
              setShowOnboardingTour(false);
            }}
          />
        </Suspense>
      )}
      <div className="sticky z-30" style={{ top: 'env(safe-area-inset-top)', WebkitBackfaceVisibility: 'hidden' }}>
      <header className="relative z-20 border-b border-rh-light-border/40 dark:border-rh-border/40 bg-rh-light-bg dark:bg-black/95 backdrop-blur-xl">
        <div className="px-3 py-2 flex sm:hidden items-center gap-2">
          {/* Mobile: logo + controls inline */}
          <div
            className="h-[35px] w-[35px] cursor-pointer flex-shrink-0"
            onClick={() => { resetNavigation(); setActiveTab('portfolio'); }}
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
                onProfileClick={() => { setCreatorView(null); setAdminView(null); setViewingStock(null); setViewingProfileId(currentUserId); setActiveTab('profile'); }}
                onSettingsClick={() => { setCreatorView(null); setAdminView(null); setSettingsView(true); window.location.hash = 'tab=settings'; }}
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
            {currentUserId && (
              <button
                onClick={() => setCreatorView('dashboard')}
                className="p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-colors"
                title="Creator Dashboard"
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h4v8H3v-8zm7-8h4v16h-4V5zm7 4h4v12h-4V9z" />
                </svg>
              </button>
            )}
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
        <div className="hidden sm:flex relative items-center h-11 lg:h-14 px-3 lg:px-5 gap-2 lg:gap-4">
          {/* Logo */}
          <div
            className="h-[30px] w-[30px] cursor-pointer flex-shrink-0"
            onClick={() => { resetNavigation(); setActiveTab('portfolio'); }}
          >
            <img src="/north-signal-logo.png" alt="Nala" className="h-full w-full hidden dark:block" />
            <img src="/north-signal-logo-transparent.png" alt="Nala" className="h-full w-full dark:hidden" />
          </div>

          {/* Primary nav — left edge aligned with content container below */}
          <nav className="flex items-center"
            style={{ marginLeft: 'max(0px, calc((100vw - clamp(1080px, 64vw, 1530px)) / 2 - 72px))' }}>
            {PRIMARY_TABS.map((tab) => {
              // At sm–lg: show Portfolio, Insights, Discover, Leaderboard; collapse Watchlists + Nala AI into More
              const collapseAtSmLg = tab.id === 'watchlists' || tab.id === 'nala';

              return (
              <button
                key={tab.id}
                onClick={() => { resetNavigation(); if (tab.id === 'profile' && currentUserId) setViewingProfileId(currentUserId); setActiveTab(tab.id); }}
                className={`relative px-3 py-2 text-[13px] rounded-md transition-all duration-150 whitespace-nowrap
                  ${collapseAtSmLg ? 'hidden lg:inline-flex' : ''}
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
              );
            })}
            {/* More dropdown */}
            <div className="relative" ref={moreDropdownRef}>
              {(() => {
                // Tabs collapsed into More at sm–lg (hidden from primary nav)
                const collapsedPrimaryTabs: { id: TabType; label: string }[] = [
                  { id: 'watchlists', label: 'Watchlists' },
                  { id: 'nala', label: 'Nala AI' },
                ];
                const allMoreTabs = [...collapsedPrimaryTabs, ...visibleMoreTabs];
                const activeInMore = visibleMoreTabs.some(t => t.id === activeTab);
                const activeInCollapsed = collapsedPrimaryTabs.some(t => t.id === activeTab);
                const activeLabel = allMoreTabs.find(t => t.id === activeTab)?.label || 'More';
                return (
                  <>
              <button
                onClick={() => setMoreDropdownOpen(!moreDropdownOpen)}
                className={`relative px-3 py-2 text-[13px] font-medium rounded-md transition-all duration-150 whitespace-nowrap flex items-center gap-1
                  ${activeInMore
                    ? 'text-rh-green font-semibold bg-rh-green/[0.08]'
                    : activeInCollapsed
                      ? 'lg:text-rh-light-muted/60 lg:dark:text-rh-muted/60 text-rh-green font-semibold lg:font-medium bg-rh-green/[0.08] lg:bg-transparent lg:hover:text-rh-light-text lg:dark:hover:text-rh-text lg:hover:bg-gray-100/60 lg:dark:hover:bg-white/[0.04]'
                      : 'text-rh-light-muted/60 dark:text-rh-muted/60 hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100/60 dark:hover:bg-white/[0.04]'
                  }`}
              >
                {/* sm–lg: show collapsed tab label or 'More' */}
                <span className="lg:hidden">{activeLabel}</span>
                {/* lg+: only show visibleMoreTabs label (collapsed tabs visible in primary nav) */}
                <span className="hidden lg:inline">{visibleMoreTabs.find(t => t.id === activeTab)?.label || 'More'}</span>
                <svg className={`w-3 h-3 transition-transform duration-150 ${moreDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className={`absolute bottom-0 left-2.5 right-2.5 h-0.5 bg-rh-green rounded-full transition-all duration-200 ${
                  activeInMore ? 'scale-x-100 opacity-100'
                    : activeInCollapsed ? 'scale-x-100 opacity-100 lg:scale-x-0 lg:opacity-0'
                    : 'scale-x-0 opacity-0'
                }`} />
              </button>
              {moreDropdownOpen && (
                <div className="absolute top-full left-0 mt-1.5 bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl shadow-2xl py-1.5 min-w-[160px] z-50" data-no-tab-swipe>
                  {/* Overflow primary tabs — visible in More only at sm–lg */}
                  {collapsedPrimaryTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { resetNavigation(); if (tab.id === 'profile' && currentUserId) setViewingProfileId(currentUserId); setActiveTab(tab.id); setMoreDropdownOpen(false); }}
                      className={`lg:hidden w-full text-left px-4 py-2.5 text-[13px] transition-colors duration-150
                        ${activeTab === tab.id
                          ? 'text-rh-green font-semibold bg-rh-green/[0.06]'
                          : 'text-rh-light-text dark:text-rh-text/80 hover:bg-rh-light-bg dark:hover:bg-rh-dark font-medium'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <div className="lg:hidden border-b border-rh-light-border/20 dark:border-rh-border/20 my-1" />
                  {visibleMoreTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { resetNavigation(); if (tab.id === 'profile' && currentUserId) setViewingProfileId(currentUserId); setActiveTab(tab.id); setMoreDropdownOpen(false); }}
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
                  </>
                );
              })()}
            </div>
          </nav>

          {/* Search — full bar at lg+, icon at sm–lg (grouped with right controls) */}
          <div className="hidden lg:flex flex-1 max-w-[420px] min-w-[180px]">
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

          {/* Expanded search overlay — covers header when active at sm–lg */}
          {searchExpanded && (
            <div className="lg:hidden absolute inset-0 z-50 flex items-center px-3 gap-2 bg-rh-light-bg dark:bg-black/95">
              <div className="flex-1">
                <TickerAutocompleteInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSelect={(result) => {
                    const held = findHolding(result.symbol);
                    setViewingStock({ ticker: result.symbol, holding: held });
                    setSearchQuery('');
                    setSearchExpanded(false);
                  }}
                  heldTickers={portfolio?.holdings.map(h => h.ticker) ?? []}
                  externalRef={searchRef}
                  compact
                  autoFocus
                />
              </div>
              <button
                onClick={() => setSearchExpanded(false)}
                className="text-sm text-rh-light-muted dark:text-rh-muted px-2 py-1 hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Right utilities — order: notification, [lg: icons], search icon (sm–lg), "..." (sm–lg), avatar */}
          <div className="flex items-center gap-1 ml-auto">
            {currentUserId && <NotificationBell userId={currentUserId} onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })} />}

            {/* Full utility icons — lg+ only */}
            <div className="hidden lg:flex items-center gap-1">
              {currentUserId && (
                <button
                  onClick={() => setCreatorView('dashboard')}
                  className="p-2 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-all duration-150"
                  title="Creator Dashboard"
                >
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h4v8H3v-8zm7-8h4v16h-4V5zm7 4h4v12h-4V9z" />
                  </svg>
                </button>
              )}
              {currentUserId && user?.isWaitlistAdmin && (
                <>
                  <button
                    onClick={() => { setAdminView('waitlist'); setSettingsView(false); setCreatorView(null); window.location.hash = 'tab=admin-waitlist'; }}
                    className="p-2 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-all duration-150"
                    title="Admin — Waitlist"
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { setAdminView('jobs'); setSettingsView(false); setCreatorView(null); window.location.hash = 'tab=admin-jobs'; }}
                    className="relative p-2 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-all duration-150"
                    title="Admin — Background Jobs"
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {jobAlerts.level !== 'ok' && (
                      <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${jobAlerts.level === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`} />
                    )}
                  </button>
                  <button
                    onClick={() => { setAdminView('analytics'); setSettingsView(false); setCreatorView(null); window.location.hash = 'tab=admin-analytics'; }}
                    className="p-2 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-all duration-150"
                    title="Admin — Analytics"
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </button>
                </>
              )}
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
            </div>

            {/* Search icon — sm to lg only, grouped with right controls */}
            <button
              className="lg:hidden p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-colors"
              onClick={() => setSearchExpanded(true)}
              title="Search stocks"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Overflow "..." — sm to lg only */}
            <div className="relative lg:hidden" ref={utilsMenuRef}>
              <button
                onClick={() => setUtilsMenuOpen(!utilsMenuOpen)}
                className="p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-colors"
                title="More options"
              >
                <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>
              {utilsMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl shadow-2xl py-1.5 min-w-[180px] z-[60]"
                  style={{ maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>
                  {currentUserId && (
                    <button
                      onClick={() => { setCreatorView('dashboard'); setUtilsMenuOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-[13px] text-rh-light-text dark:text-rh-text/80 hover:bg-rh-light-bg dark:hover:bg-rh-dark font-medium transition-colors duration-150 flex items-center gap-2.5"
                    >
                      <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h4v8H3v-8zm7-8h4v16h-4V5zm7 4h4v12h-4V9z" />
                      </svg>
                      Creator Dashboard
                    </button>
                  )}
                  {currentUserId && user?.isWaitlistAdmin && (
                    <>
                      <button
                        onClick={() => { setAdminView('waitlist'); setSettingsView(false); setCreatorView(null); setUtilsMenuOpen(false); window.location.hash = 'tab=admin-waitlist'; }}
                        className="w-full text-left px-4 py-2.5 text-[13px] text-rh-light-text dark:text-rh-text/80 hover:bg-rh-light-bg dark:hover:bg-rh-dark font-medium transition-colors duration-150 flex items-center gap-2.5"
                      >
                        <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        Admin — Waitlist
                      </button>
                      <button
                        onClick={() => { setAdminView('jobs'); setSettingsView(false); setCreatorView(null); setUtilsMenuOpen(false); window.location.hash = 'tab=admin-jobs'; }}
                        className="w-full text-left px-4 py-2.5 text-[13px] text-rh-light-text dark:text-rh-text/80 hover:bg-rh-light-bg dark:hover:bg-rh-dark font-medium transition-colors duration-150 flex items-center gap-2.5"
                      >
                        <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Admin — Jobs
                        {jobAlerts.level !== 'ok' && (
                          <span className={`ml-auto w-2 h-2 rounded-full ${jobAlerts.level === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`} />
                        )}
                      </button>
                      <button
                        onClick={() => { setAdminView('analytics'); setSettingsView(false); setCreatorView(null); setUtilsMenuOpen(false); window.location.hash = 'tab=admin-analytics'; }}
                        className="w-full text-left px-4 py-2.5 text-[13px] text-rh-light-text dark:text-rh-text/80 hover:bg-rh-light-bg dark:hover:bg-rh-dark font-medium transition-colors duration-150 flex items-center gap-2.5"
                      >
                        <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Admin — Analytics
                      </button>
                    </>
                  )}
                  {currentUserId && (
                    <button
                      onClick={() => { setShowDailyReport(true); setDailyReportHidden(false); setUtilsMenuOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-[13px] text-rh-light-text dark:text-rh-text/80 hover:bg-rh-light-bg dark:hover:bg-rh-dark font-medium transition-colors duration-150 flex items-center gap-2.5"
                    >
                      <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                      </svg>
                      Today's Brief
                    </button>
                  )}
                  <button
                    onClick={() => { toggleTheme(); setUtilsMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-rh-light-text dark:text-rh-text/80 hover:bg-rh-light-bg dark:hover:bg-rh-dark font-medium transition-colors duration-150 flex items-center gap-2.5"
                  >
                    {theme === 'dark' ? (
                      <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                    )}
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </button>
                </div>
              )}
            </div>

            {/* User menu — always visible, rightmost item */}
            {currentUserName && currentUserId && (
              <UserMenu
                userName={currentUserName}
                userId={currentUserId}
                onProfileClick={() => { setCreatorView(null); setAdminView(null); setViewingStock(null); setViewingProfileId(currentUserId); setActiveTab('profile'); }}
                onSettingsClick={() => { setCreatorView(null); setAdminView(null); setSettingsView(true); window.location.hash = 'tab=settings'; }}
                onLogoutClick={logout}
              />
            )}
          </div>
        </div>
      </header>

      {/* Mobile-only navigation */}
      <div className="sm:hidden">
        <Navigation
          activeTab={activeTab}
          userPlan={user?.plan}
          portfolioMenuOpen={mobilePortfolioMenuOpen}
          onPortfolioMenuClose={() => setMobilePortfolioMenuOpen(false)}
          onPortfolioTabClick={() => {
            resetNavigation();
            setActiveTab('portfolio');
            setMobilePortfolioMenuOpen(false);
          }}
          portfolioMenu={user ? (
            <PortfolioPicker
              selectedPortfolioId={selectedPortfolioId}
              onSelect={(portfolioId) => {
                setSelectedPortfolioId(portfolioId);
                setMobilePortfolioMenuOpen(false);
              }}
              userPlan={user.plan || 'free'}
            />
          ) : null}
          onTabChange={(tab) => {
            resetNavigation();
            if (tab === 'profile' && currentUserId) setViewingProfileId(currentUserId);
            setActiveTab(tab);
            setMobilePortfolioMenuOpen(false);
          }}
        />
      </div>
      </div>

      {/* Market indices strip — portfolio, discover, insights only */}
      {!viewingStock && !settingsView && !creatorView && !adminView && (activeTab === 'portfolio' || activeTab === 'discover' || activeTab === 'insights') && (
        <MarketStrip onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })} />
      )}

      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden bg-rh-light-bg dark:bg-black"
        style={{
          height: pullY > 0 ? `${pullY}px` : '0px',
          transition: isPulling.current ? 'none' : 'height 0.3s ease',
        }}
      >
        <img
          src="/north-signal-logo-transparent.png"
          alt=""
          className={`h-6 w-6 ${refreshing ? 'animate-spin' : ''}`}
          style={{ opacity: pullY > 10 ? Math.min(pullY / 50, 1) : 0, transform: refreshing ? undefined : `rotate(${pullY * 4}deg)` }}
        />
      </div>

      <main
        ref={mainRef}
        className={`relative z-10 mx-auto pb-4 pt-0 sm:py-6 space-y-6 sm:space-y-8 ${
          activeTab === 'discover' && !viewingStock
            ? 'max-w-[clamp(1080px,62vw,1620px)] px-2 sm:px-3'
            : 'max-w-[clamp(1080px,64vw,1530px)] px-3 sm:px-6'
        }`}
        style={{ willChange: 'transform' }}
      >
        {!isOnline && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
            <p className="text-yellow-400 text-sm font-medium">
              You're offline — market data may be outdated
            </p>
          </div>
        )}
        {!settingsView && !creatorView && !adminView && compareStocks && compareStocks.length >= 2 && (
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

        {!settingsView && !creatorView && !adminView && viewingStock && !compareStocks && (
          <Suspense fallback={<PageFallback />}>
            <StockDetailView
              ticker={viewingStock.ticker}
              holding={findHolding(viewingStock.ticker) ?? viewingStock.holding}
              portfolioTotal={portfolio?.totalAssets ?? 0}
              onTickerNavigate={(ticker) => {
                setViewingStock({ ticker, holding: findHolding(ticker) });
              }}
              onBack={() => {
                if (dailyReportHidden) {
                  setDailyReportHidden(false);
                }
                setViewingStock(null);
              }}
              onHoldingAdded={async () => {
                const p = await getPortfolio();
                handleUpdate();
                const held = p.holdings.find(h => h.ticker.toUpperCase() === viewingStock.ticker.toUpperCase()) ?? null;
                setViewingStock(prev => prev ? { ...prev, holding: held } : null);
              }}
            />
          </Suspense>
        )}

        <AnimatePresence mode="wait">
        <motion.div
          key={settingsView ? 'settings' : (creatorView || adminView || activeTab)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-6 sm:space-y-8"
        >
        {!settingsView && !creatorView && !adminView && activeTab === 'portfolio' && !viewingStock && !compareStocks && (
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

            {/* Portfolio picker moved to above chart */}

            {/* Getting started checklist for new users */}
            {currentUserId && (
              <Suspense fallback={null}>
                <GettingStartedChecklist
                  userId={currentUserId}
                  hasHoldings={!!portfolio && portfolio.holdings.length > 0}
                  holdingsCount={portfolio?.holdings?.length ?? 0}
                  onNavigate={(tab) => { resetNavigation(); setActiveTab(tab as TabType); }}
                  onOpenDailyBrief={() => { setShowDailyReport(true); setDailyReportHidden(false); }}
                  onOpenCreatorSettings={() => setCreatorView('settings')}
                  onOpenAddStock={() => holdingsActionsRef.current?.openAdd()}
                />
              </Suspense>
            )}

            {/* Portfolio picker is now in the desktop nav tab dropdown */}

            {portfolio && portfolio.holdings.length === 0 && selectedPortfolioId && (
              <div className="rounded-xl border border-dashed border-gray-300/60 dark:border-white/[0.08]
                bg-white/60 dark:bg-white/[0.03] backdrop-blur-sm p-10 text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-400 dark:text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-white/70 mb-1">No holdings yet</h3>
                <p className="text-xs text-gray-500 dark:text-white/40 mb-5">
                  Add stocks to start tracking this portfolio.
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    onClick={() => holdingsActionsRef.current?.openCashMargin()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200/60 dark:border-white/[0.08]
                      text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors text-xs font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Cash & Margin
                  </button>
                  <button
                    onClick={() => holdingsActionsRef.current?.openAdd()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rh-green text-black font-semibold
                      hover:bg-green-600 transition-colors text-xs"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Stock
                  </button>
                  <button
                    onClick={() => holdingsActionsRef.current?.openImport()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200/40 dark:border-white/[0.06]
                      text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 hover:border-rh-green/30 transition-colors text-xs"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Import from CSV
                  </button>
                </div>
              </div>
            )}

            {portfolio && portfolio.holdings.length > 0 && (
              <>
              <div className="-mx-3 sm:-mx-6 relative">
              {user && (
                <div className="absolute top-2 right-3 sm:top-2 sm:right-6 z-20 flex flex-col items-end gap-1.5">
                  {userPortfolios.length > 1 && (
                    <div className="relative" ref={desktopPortfolioRef}>
                      <button
                        onClick={() => setDesktopPortfolioOpen(prev => !prev)}
                        className="flex items-center gap-1 text-[11px] font-medium text-rh-light-muted/70 dark:text-white/35 hover:text-rh-light-text dark:hover:text-white/60 transition-colors"
                      >
                        {userPortfolios.find(p => p.id === selectedPortfolioId)?.name || 'Portfolio 1'}
                        <svg className={`w-2.5 h-2.5 transition-transform duration-150 ${desktopPortfolioOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {desktopPortfolioOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-gray-200/60 dark:border-white/[0.08] bg-white dark:bg-[#1c1c1f] shadow-[0_8px_32px_rgba(0,0,0,0.3)] py-1 px-0.5">
                          <PortfolioPicker
                            selectedPortfolioId={selectedPortfolioId}
                            onSelect={(id) => { setSelectedPortfolioId(id); setDesktopPortfolioOpen(false); }}
                            userPlan={user.plan || 'free'}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <ShareButton type="performance" userId={user.id} username={user.username} displayName={user.displayName} period={chartPeriod || '1M'} />
                </div>
              )}
              <PortfolioValueChart
                currentValue={portfolio.netEquity}
                dayChange={portfolio.dayChange}
                dayChangePercent={portfolio.dayChangePercent}
                regularDayChange={portfolio.regularDayChange}
                regularDayChangePercent={portfolio.regularDayChangePercent}
                afterHoursChange={portfolio.afterHoursChange}
                afterHoursChangePercent={portfolio.afterHoursChangePercent}
                refreshTrigger={portfolioRefreshCount}
                fetchFn={(period) => getPortfolioChart(period, undefined, selectedPortfolioId)}
                onPeriodChange={(p: PortfolioChartPeriod) => { setChartPeriod(p); try { sessionStorage.setItem('nala:chartPeriod', p); } catch {} }}
                onReturnChange={setChartReturnPct}
                onMeasurementChange={setChartMeasurement}
                session={portfolio.session}
                quotesStale={isStale || !!portfolio.quotesMeta?.anyRepricing || (portfolio.quotesUnavailableCount ?? 0) > 0}
                mobileTopPadding="normal"
              />
              </div>
              </>
            )}

            {portfolio && portfolio.holdings.length > 0 && (
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
                    {/* Left card: Benchmark + Day/Total P/L */}
                    <div className="bg-rh-light-card dark:bg-white/[0.015] border border-rh-light-border/40 dark:border-white/[0.04] rounded-xl shadow-sm shadow-black/[0.03] dark:shadow-none overflow-hidden">
                      <BenchmarkWidget refreshTrigger={portfolioRefreshCount} window={chartPeriod} chartReturnPct={chartReturnPct} portfolioId={selectedPortfolioId} />
                      <div className="border-t border-rh-light-border/30 dark:border-white/[0.04]" />
                      <div className="px-5 py-4 space-y-2">
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/50"><Term beginner="Today" advanced="Day" /></span>
                          <div className="flex items-baseline gap-1.5">
                            <span className={`text-base font-extrabold ${
                              portfolio.dayChange === 0 ? 'text-rh-light-text dark:text-rh-text' : portfolio.dayChange > 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'
                            }`}>
                              {portfolio.holdings.length > 0 ? formatCurrency(portfolio.dayChange) : '—'}
                            </span>
                            {portfolio.holdings.length > 0 && (
                              <span className={`text-xs ${portfolio.dayChange >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                                {formatPercent(portfolio.dayChangePercent)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wider text-rh-light-muted/70 dark:text-white/50"><Term beginner="All-Time Gain/Loss" advanced="Total P/L" /></span>
                          <div className="flex items-baseline gap-1.5">
                            <span className={`text-base font-extrabold ${
                              portfolio.totalPL === 0 ? 'text-rh-light-text dark:text-rh-text' : portfolio.totalPL > 0 ? 'text-rh-green profit-glow twinkle-glow' : 'text-rh-red loss-glow twinkle-glow'
                            }`}>
                              {portfolio.holdings.length > 0 ? formatCurrency(portfolio.totalPL) : '—'}
                            </span>
                            {portfolio.holdings.length > 0 && (
                              <span className={`text-xs ${portfolio.totalPL >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                                {formatPercent(portfolio.totalPLPercent)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right card: Assets/Equity + Dividends */}
                    <div className="bg-rh-light-card dark:bg-white/[0.015] border border-rh-light-border/40 dark:border-white/[0.04] rounded-xl shadow-sm shadow-black/[0.03] dark:shadow-none overflow-hidden">
                      <div className="px-5 py-4 space-y-2">
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/55"><Term beginner="Total Value" advanced="Assets" /></span>
                          <div className="text-base font-bold text-rh-light-text dark:text-rh-text">
                            {portfolio.totalAssets > 0 ? formatCurrency(portfolio.totalAssets) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium uppercase tracking-wider text-rh-light-muted/80 dark:text-white/55"><Term beginner="Total Owned" advanced="Equity" /></span>
                            {(portfolio.cashBalance > 0 || portfolio.marginDebt > 0) && (
                              <div className="relative group">
                                <button className="w-3.5 h-3.5 rounded-full border border-rh-light-muted/30 dark:border-white/20 flex items-center justify-center text-[9px] font-medium text-rh-light-muted/60 dark:text-white/30 hover:border-rh-light-muted/50 dark:hover:border-white/40 hover:text-rh-light-muted dark:hover:text-white/60 transition-colors">
                                  i
                                </button>
                                <div className="absolute top-1/2 -translate-y-1/2 left-full ml-2 px-3 py-2 rounded-lg bg-rh-light-card dark:bg-[#1a1a1e] border border-rh-light-border/60 dark:border-white/[0.1] shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 whitespace-nowrap z-10">
                                  <div className="space-y-1">
                                    {portfolio.cashBalance > 0 && (
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="text-[10px] font-medium uppercase tracking-wider text-rh-green/60">Cash</span>
                                        <span className="text-xs font-bold text-rh-green">${portfolio.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                      </div>
                                    )}
                                    {portfolio.marginDebt > 0 && (
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="text-[10px] font-medium uppercase tracking-wider text-rh-red/60">Margin</span>
                                        <span className="text-xs font-bold text-rh-red">-${portfolio.marginDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="text-base font-bold text-rh-light-text dark:text-rh-text">
                            {formatCurrency(portfolio.netEquity)}
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-rh-light-border/30 dark:border-white/[0.04]" />
                      <DividendsSection refreshTrigger={portfolioRefreshCount} holdings={portfolio.holdings} onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })} />
                    </div>
                  </>
                )}
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
                portfolioId={selectedPortfolioId}
                hideEmptyState={!!selectedPortfolioId && (portfolio?.holdings?.length ?? 0) === 0}
              />
              {(portfolio?.options?.length ?? 0) > 0 && (
                <div className="px-3 sm:px-6">
                  <OptionsTable
                    options={portfolio!.options}
                    onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                  />
                </div>
              )}
              {(portfolio?.holdings?.length ?? 0) > 0 && (
                <PerformanceSummary refreshTrigger={summaryRefreshTrigger} portfolioId={selectedPortfolioId} />
              )}
            </div>

          </>
        )}

        <Suspense fallback={<PageFallback />}>
          {!settingsView && !creatorView && !adminView && activeTab === 'nala' && !viewingStock && (
            <PremiumOverlay
              featureName="NALA AI Deep Research"
              description="Institutional-quality research reports powered by Google Deep Research. Get deep-dive stock analysis, portfolio risk assessments, and structured bull/bear/base scenarios."
              requiredPlan="premium"
            >
              <ErrorBoundary>
                <DeepResearchPage
                  onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                />
              </ErrorBoundary>
            </PremiumOverlay>
          )}

          {!settingsView && !creatorView && !adminView && activeTab === 'insights' && !viewingStock && (
            <ErrorBoundary>
              <InsightsPage
                onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                currentValue={portfolio?.netEquity ?? 0}
                refreshTrigger={summaryRefreshTrigger}
                session={portfolio?.session}
                cashBalance={portfolio?.cashBalance ?? 0}
                totalAssets={portfolio?.totalAssets ?? 0}
                marginDebt={portfolio?.marginDebt ?? 0}
                initialSubTab={insightsSubTab}
                onSubTabChange={setInsightsSubTab}
                portfolioId={selectedPortfolioId}
                onPortfolioChange={setSelectedPortfolioId}
                portfolios={userPortfolios.map(p => ({ id: p.id, name: p.name }))}
              />
            </ErrorBoundary>
          )}

          {!settingsView && !creatorView && !adminView && activeTab === 'watchlists' && (
            <div style={viewingStock ? { display: 'none' } : undefined}>
              <ErrorBoundary>
                <WatchlistPage
                  onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                />
              </ErrorBoundary>
            </div>
          )}

          {!settingsView && !creatorView && !adminView && activeTab === 'discover' && !viewingStock && !viewingProfileId && (
            <ErrorBoundary>
              <DiscoverPage
                onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
                onUserClick={handleViewProfile}
                subTab={discoverSubTab}
                onSubTabChange={setDiscoverSubTab}
                portfolioTickers={portfolioTickers}
              />
            </ErrorBoundary>
          )}

          {!settingsView && !creatorView && !adminView && activeTab === 'macro' && !viewingStock && (
            <ErrorBoundary>
              <EconomicIndicators />
            </ErrorBoundary>
          )}

          {!settingsView && !creatorView && !adminView && activeTab === 'leaderboard' && !viewingProfileId && !viewingStock && comparingUser && (
            <ErrorBoundary>
              <PortfolioCompare
                theirUserId={comparingUser.userId}
                theirDisplayName={comparingUser.displayName}
                onBack={() => setComparingUser(null)}
                onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
              />
            </ErrorBoundary>
          )}

          {!settingsView && !creatorView && !adminView && activeTab === 'leaderboard' && !viewingProfileId && !viewingStock && !comparingUser && (
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

          {!settingsView && !creatorView && !adminView && viewingProfileId && !viewingStock && (
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

          {!settingsView && !creatorView && !adminView && activeTab === 'feed' && !viewingProfileId && !viewingStock && (
            <ErrorBoundary>
              <FeedPage
                currentUserId={currentUserId}
                onUserClick={handleViewProfile}
                onTickerClick={(ticker) => setViewingStock({ ticker, holding: findHolding(ticker) })}
              />
            </ErrorBoundary>
          )}

          {!settingsView && !creatorView && !adminView && activeTab === 'pricing' && (
            <ErrorBoundary>
              <PricingPage />
            </ErrorBoundary>
          )}

          {creatorView === 'dashboard' && (
            <ErrorBoundary>
              <CreatorDashboardPage
                onBack={() => setCreatorView(null)}
                onSettingsClick={() => setCreatorView('settings')}
                setupStatus={creatorSetupStatus}
                onSetupComplete={refreshCreatorSetupStatus}
              />
            </ErrorBoundary>
          )}

          {creatorView === 'settings' && (
            <ErrorBoundary>
              <CreatorSettingsPageComp
                userId={currentUserId}
                onBack={() => setCreatorView('dashboard')}
              />
            </ErrorBoundary>
          )}

          {adminView === 'waitlist' && user?.isWaitlistAdmin && !settingsView && !creatorView && (
            <ErrorBoundary>
              <WaitlistAdminPage onBack={() => { setAdminView(null); window.location.hash = ''; }} />
            </ErrorBoundary>
          )}

          {adminView === 'jobs' && user?.isWaitlistAdmin && !settingsView && !creatorView && (
            <ErrorBoundary>
              <JobsDashboard onBack={() => { setAdminView(null); window.location.hash = ''; }} />
            </ErrorBoundary>
          )}

          {adminView === 'analytics' && user?.isWaitlistAdmin && !settingsView && !creatorView && (
            <ErrorBoundary>
              <AnalyticsDashboard onBack={() => { setAdminView(null); window.location.hash = ''; }} />
            </ErrorBoundary>
          )}

          {settingsView && !adminView && !creatorView && (
            <ErrorBoundary>
              <AccountSettingsPageComp2
                userId={currentUserId}
                onBack={() => { setSettingsView(false); window.location.hash = ''; }}
                onSave={() => fetchData()}
                healthStatus={healthStatus}
                onCreatorNavigate={(view) => { setSettingsView(false); setCreatorView(view); }}
              />
            </ErrorBoundary>
          )}

        </Suspense>
        </motion.div>
        </AnimatePresence>
      </main>

      <footer className="relative z-[3] border-t border-rh-light-border/30 dark:border-rh-border/30 mt-4 py-4">
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
          <span>Nala AI</span>
        </div>
      </footer>

      {/* AccountSettingsModal removed — replaced by full-page AccountSettingsPage rendered in <main> */}
      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        initialTab={privacyModalTab}
      />
      {(showDailyReport || dailyReportHidden) && (
        <DailyReportModal
          onClose={() => { setShowDailyReport(false); setDailyReportHidden(false); }}
          hidden={dailyReportHidden}
          portfolio={portfolio}
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
