import { API_BASE_URL } from './config';
import { isNative } from './utils/platform';
import {
  Portfolio,
  ProjectionResponse,
  MetricsResponse,
  HoldingInput,
  DividendEvent,
  DividendEventInput,
  DividendCredit,
  DividendSummary,
  DividendReinvestment,
  DividendTimeline,
  ProjectionMode,
  LookbackPeriod,
  PerformanceSummary,
  BaselineInput,
  BrokerLifetimeInput,
  Settings,
  SettingsUpdateInput,
  HealthScore,
  Attribution,
  AttributionWindow,
  LeakDetectorResult,
  RiskForecast,
  Goal,
  GoalInput,
  SymbolSearchResponse,
  PortfolioIntelligenceResponse,
  IntelligenceWindow,
  CurrentPaceResponse,
  PaceWindow,
  YtdSettings,
  LeaderboardWindow,
  LeaderboardRegion,
  LeaderboardResponse,
  UserInfo,
  UserProfile,
  ActivityEvent,
  StockDetailsResponse,
  PortfolioChartData,
  PortfolioChartPeriod,
  PerformanceData,
  PerformanceWindow,
  Transaction,
  AlertConfig,
  AlertEvent as AlertEventType,
  IncomeInsightsResponse,
  IncomeWindow,
  ETFHoldingsData,
  AssetAbout,
  PriceAlert,
  PriceAlertEvent,
  CreatePriceAlertInput,
  UpdatePriceAlertInput,
  DailyReportResponse,
  HistoricalCAGR,
} from './types';

// Global API error callback — set by ToastProvider to show error toasts
let onApiError: ((message: string) => void) | null = null;
export function setApiErrorHandler(handler: ((message: string) => void) | null) {
  onApiError = handler;
}

// Global auth expiry callback — set by AuthProvider to force logout on unrecoverable 401
let onAuthExpired: (() => void) | null = null;
export function setAuthExpiredHandler(handler: (() => void) | null) {
  onAuthExpired = handler;
}

export function isSameOriginApi(): boolean {
  if (typeof window === 'undefined') return true;
  if (!API_BASE_URL || API_BASE_URL.startsWith('/')) return true;
  try {
    const url = new URL(API_BASE_URL, window.location.origin);
    return url.origin === window.location.origin;
  } catch {
    return true;
  }
}

// Refresh token mutex: only one refresh at a time, others wait
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function refreshOnce(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const doFetch = () => fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      ...(isNative ? { 'X-Capacitor': 'true' } : {}),
      ...options?.headers,
    },
  });

  let response = await doFetch();

  // On 401, try refreshing tokens once then retry the original request
  if (response.status === 401 && !url.includes('/auth/refresh') && !url.includes('/auth/login')) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      response = await doFetch();
    } else if (onAuthExpired) {
      // Refresh failed — session is dead, kick to login
      if (isSameOriginApi()) {
        onAuthExpired();
      } else {
        console.warn('[Auth] 401 with cross-origin API base — cookies likely blocked. Skipping auto-logout.');
      }
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const msg = error.error || `HTTP ${response.status}`;

    // 403 plan gating — throw a typed error so components can show upgrade prompts
    if (response.status === 403 && (error.error === 'upgrade_required' || error.error === 'limit_reached')) {
      const planError = new Error(msg) as Error & { status: number; requiredPlan?: string; limit?: number };
      planError.status = 403;
      planError.requiredPlan = error.requiredPlan || error.plan || 'pro';
      planError.limit = error.limit;
      throw planError;
    }

    // 403 email verification required — dispatch event so App shows verify modal
    if (response.status === 403 && typeof error.error === 'string' && error.error.toLowerCase().includes('email verification required')) {
      window.dispatchEvent(new CustomEvent('email-verify-needed'));
      throw new Error(msg);
    }

    // Notify global toast for non-auth errors
    if (onApiError && !url.includes('/auth/')) {
      onApiError(msg);
    }
    throw new Error(msg);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// Authentication API
// ═══════════════════════════════════════════════════════════════════════════

export interface LoginResponse {
  user: {
    id: string;
    username: string;
    displayName: string;
  };
}

export interface MfaChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
  methods: string[];
  maskedEmail: string | null;
}

export type LoginResult = LoginResponse | MfaChallengeResponse;

export function isMfaChallenge(result: LoginResult): result is MfaChallengeResponse {
  return 'mfaRequired' in result && result.mfaRequired === true;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  // Login sets httpOnly cookie automatically - no token in response body
  // May return MFA challenge instead if user has MFA enabled
  return fetchJson<LoginResult>(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

// ─── MFA API ─────────────────────────────────────────────

export interface MfaStatus {
  methods: { type: string; enabled: boolean; verifiedAt: string | null }[];
  email: string | null;
  emailVerified: boolean;
  backupCodesRemaining: number;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  return fetchJson<MfaStatus>(`${API_BASE_URL}/auth/mfa/status`);
}

export async function verifyMfa(challengeToken: string, code: string, method: 'totp' | 'email' | 'backup'): Promise<LoginResponse> {
  return fetchJson<LoginResponse>(`${API_BASE_URL}/auth/mfa/verify`, {
    method: 'POST',
    body: JSON.stringify({ challengeToken, code, method }),
  });
}

export async function sendMfaEmailOtp(challengeToken: string): Promise<{ sent: boolean }> {
  return fetchJson<{ sent: boolean }>(`${API_BASE_URL}/auth/mfa/email/send`, {
    method: 'POST',
    body: JSON.stringify({ challengeToken }),
  });
}

export async function setupTotp(): Promise<{ qrCodeDataUrl: string; secret: string; issuer: string; accountName: string }> {
  return fetchJson(`${API_BASE_URL}/auth/mfa/totp/setup`, { method: 'POST' });
}

export async function verifyTotpSetup(code: string): Promise<{ enabled: boolean; backupCodes: string[] }> {
  return fetchJson(`${API_BASE_URL}/auth/mfa/totp/verify-setup`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function disableTotp(password: string): Promise<{ disabled: boolean }> {
  return fetchJson(`${API_BASE_URL}/auth/mfa/totp/disable`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function updateMfaEmail(email: string): Promise<{ email: string; verified: boolean }> {
  return fetchJson(`${API_BASE_URL}/auth/mfa/email`, {
    method: 'PUT',
    body: JSON.stringify({ email }),
  });
}

export async function verifyMfaEmail(code: string): Promise<{ verified: boolean }> {
  return fetchJson(`${API_BASE_URL}/auth/mfa/email/verify`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function setupEmailOtp(): Promise<{ codeSent: boolean }> {
  return fetchJson(`${API_BASE_URL}/auth/mfa/email-otp/setup`, { method: 'POST' });
}

export async function verifyEmailOtpSetup(code: string): Promise<{ enabled: boolean; backupCodes: string[] }> {
  return fetchJson(`${API_BASE_URL}/auth/mfa/email-otp/verify-setup`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function disableEmailOtp(password: string): Promise<{ disabled: boolean }> {
  return fetchJson(`${API_BASE_URL}/auth/mfa/email-otp/disable`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function regenerateBackupCodes(password: string): Promise<{ backupCodes: string[] }> {
  return fetchJson(`${API_BASE_URL}/auth/mfa/backup-codes/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  await fetchJson<{ message: string }>(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
  });
}

export async function getCurrentUser(): Promise<{ id: string; username: string; displayName: string; email?: string; emailVerified?: boolean; plan?: string; planExpiresAt?: string | null }> {
  return fetchJson(`${API_BASE_URL}/auth/me`);
}

export async function setPassword(username: string, password: string): Promise<{ message: string }> {
  return fetchJson(`${API_BASE_URL}/auth/set-password`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function checkHasPassword(username: string): Promise<{ hasPassword: boolean }> {
  return fetchJson(`${API_BASE_URL}/auth/has-password/${encodeURIComponent(username)}`);
}

export interface SignupResponse extends LoginResponse {
  emailVerificationRequired?: boolean;
}

export async function signup(
  username: string,
  displayName: string,
  password: string,
  email: string,
  consent?: { acceptedPrivacyPolicy: boolean; acceptedTerms: boolean }
): Promise<SignupResponse> {
  return fetchJson<SignupResponse>(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    body: JSON.stringify({
      username,
      displayName,
      password,
      email,
      acceptedPrivacyPolicy: consent?.acceptedPrivacyPolicy,
      acceptedTerms: consent?.acceptedTerms,
    }),
  });
}

export async function verifySignupEmail(email: string, code: string): Promise<{ message: string }> {
  return fetchJson(`${API_BASE_URL}/auth/verify-email`, {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function resendSignupVerification(email: string): Promise<{ message: string }> {
  return fetchJson(`${API_BASE_URL}/auth/resend-verification`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return fetchJson(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<{ message: string }> {
  return fetchJson(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword }),
  });
}

export async function checkUsernameAvailable(username: string): Promise<{ available: boolean }> {
  return fetchJson(`${API_BASE_URL}/auth/check-username/${encodeURIComponent(username)}`);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return fetchJson(`${API_BASE_URL}/auth/change-password`, {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function deleteAccount(password: string): Promise<{ message: string }> {
  return fetchJson(`${API_BASE_URL}/auth/delete-account`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}

export async function getPortfolio(userId?: string): Promise<Portfolio> {
  const url = userId
    ? `${API_BASE_URL}/portfolio?userId=${encodeURIComponent(userId)}`
    : `${API_BASE_URL}/portfolio`;
  return fetchJson<Portfolio>(url);
}

export async function getProjections(
  mode: ProjectionMode = 'sp500',
  lookback: LookbackPeriod = '1y'
): Promise<ProjectionResponse> {
  const params = new URLSearchParams({ mode });
  if (mode === 'realized') {
    params.append('lookback', lookback);
  }
  return fetchJson<ProjectionResponse>(`${API_BASE_URL}/portfolio/projections?${params}`);
}

export async function getMetrics(lookback: LookbackPeriod = '1y'): Promise<MetricsResponse> {
  return fetchJson<MetricsResponse>(`${API_BASE_URL}/portfolio/metrics?lookback=${lookback}`);
}

export async function getHistoricalCAGR(tickers: string[]): Promise<{ cagrs: HistoricalCAGR[] }> {
  const params = new URLSearchParams({ tickers: tickers.join(',') });
  return fetchJson<{ cagrs: HistoricalCAGR[] }>(`${API_BASE_URL}/market/historical-cagr?${params}`);
}

export async function updateCashBalance(cashBalance: number): Promise<{ cashBalance: number }> {
  return fetchJson<{ cashBalance: number }>(`${API_BASE_URL}/portfolio/cash`, {
    method: 'PUT',
    body: JSON.stringify({ cashBalance }),
  });
}

export async function addHolding(holding: HoldingInput): Promise<void> {
  await fetchJson(`${API_BASE_URL}/portfolio/holdings`, {
    method: 'POST',
    body: JSON.stringify(holding),
  });
}

export async function deleteHolding(ticker: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/portfolio/holdings/${ticker}`, {
    method: 'DELETE',
  });
}

// Dividend endpoints
export async function getDividendEvents(ticker?: string): Promise<DividendEvent[]> {
  const params = ticker ? `?ticker=${encodeURIComponent(ticker)}` : '';
  return fetchJson<DividendEvent[]>(`${API_BASE_URL}/dividends/events${params}`);
}

export async function getUpcomingDividends(): Promise<DividendEvent[]> {
  return fetchJson<DividendEvent[]>(`${API_BASE_URL}/dividends/events/upcoming`);
}

export async function addDividendEvent(input: DividendEventInput): Promise<DividendEvent> {
  return fetchJson<DividendEvent>(`${API_BASE_URL}/dividends/events`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteDividendEvent(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/dividends/events/${id}`, {
    method: 'DELETE',
  });
}

export async function getDividendCredits(ticker?: string): Promise<DividendCredit[]> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  const qs = params.toString();
  return fetchJson<DividendCredit[]>(`${API_BASE_URL}/dividends/credits${qs ? `?${qs}` : ''}`);
}

export async function getDividendSummary(): Promise<DividendSummary> {
  return fetchJson<DividendSummary>(`${API_BASE_URL}/dividends/summary`);
}

export async function syncDividends(ticker?: string): Promise<any> {
  return fetchJson(`${API_BASE_URL}/dividends/sync`, {
    method: 'POST',
    body: JSON.stringify(ticker ? { ticker } : {}),
  });
}

// DRIP (Dividend Reinvestment) endpoints
export async function getDividendTimeline(creditId: string): Promise<DividendTimeline> {
  return fetchJson<DividendTimeline>(`${API_BASE_URL}/dividends/credits/${creditId}/timeline`);
}

export async function reinvestDividend(creditId: string): Promise<DividendReinvestment> {
  return fetchJson<DividendReinvestment>(`${API_BASE_URL}/dividends/credits/${creditId}/reinvest`, {
    method: 'POST',
  });
}

export async function getDividendReinvestments(ticker?: string): Promise<DividendReinvestment[]> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  const qs = params.toString();
  return fetchJson<DividendReinvestment[]>(`${API_BASE_URL}/dividends/reinvestments${qs ? `?${qs}` : ''}`);
}

export async function getDripSettings(): Promise<{ enabled: boolean }> {
  return fetchJson<{ enabled: boolean }>(`${API_BASE_URL}/dividends/drip`);
}

export async function updateDripSettings(enabled: boolean): Promise<{ enabled: boolean }> {
  return fetchJson<{ enabled: boolean }>(`${API_BASE_URL}/dividends/drip`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

// Settings endpoints
export async function getSettings(): Promise<Settings> {
  return fetchJson<Settings>(`${API_BASE_URL}/settings`);
}

export async function updateSettings(input: SettingsUpdateInput): Promise<Settings> {
  return fetchJson<Settings>(`${API_BASE_URL}/settings`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function setBaseline(input: BaselineInput): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/baseline`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function setBrokerLifetime(input: BrokerLifetimeInput): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/broker-lifetime`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function clearBrokerLifetime(): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/broker-lifetime`, {
    method: 'DELETE',
  });
}

// Performance summary endpoint
export async function getPerformanceSummary(): Promise<PerformanceSummary> {
  return fetchJson<PerformanceSummary>(`${API_BASE_URL}/portfolio/summary`);
}

// Insights endpoints
export async function getHealthScore(): Promise<HealthScore> {
  return fetchJson<HealthScore>(`${API_BASE_URL}/insights/health`);
}

export async function getAttribution(window: AttributionWindow = '1d'): Promise<Attribution> {
  return fetchJson<Attribution>(`${API_BASE_URL}/insights/attribution?window=${window}`);
}

export async function getLeakDetector(): Promise<LeakDetectorResult> {
  return fetchJson<LeakDetectorResult>(`${API_BASE_URL}/insights/leak-detector`);
}

export async function getRiskForecast(): Promise<RiskForecast> {
  return fetchJson<RiskForecast>(`${API_BASE_URL}/insights/risk-forecast`);
}

export async function getIncomeInsights(window: IncomeWindow = 'today'): Promise<IncomeInsightsResponse> {
  return fetchJson<IncomeInsightsResponse>(`${API_BASE_URL}/insights/income?window=${window}`);
}

export async function getDailyReport(): Promise<DailyReportResponse> {
  return fetchJson<DailyReportResponse>(`${API_BASE_URL}/insights/daily-report`);
}

export async function regenerateDailyReport(): Promise<DailyReportResponse> {
  return fetchJson<DailyReportResponse>(`${API_BASE_URL}/insights/daily-report/regenerate`, {
    method: 'POST',
  });
}

// Earnings summary (batch endpoint)
export interface EarningsSummaryItem {
  ticker: string;
  reportDate: string;
  estimatedEPS: number | null;
  reportedEPS: number | null;
  daysUntil: number;
}

export async function getEarningsSummary(): Promise<{ results: EarningsSummaryItem[]; partial: boolean }> {
  return fetchJson<{ results: EarningsSummaryItem[]; partial: boolean }>(`${API_BASE_URL}/insights/earnings-summary`);
}

// Portfolio import endpoints
export interface CsvParsedRow {
  rowNumber: number;
  ticker: string;
  shares: number;
  averageCost: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface CsvParseResult {
  parsed: CsvParsedRow[];
  warnings: { rowNumber: number; message: string; line?: string }[];
  totalRows: number;
  validRows: number;
  skippedRows: number;
  warning?: string;
}

export async function uploadPortfolioCsv(file: File): Promise<CsvParseResult> {
  const formData = new FormData();
  formData.append('file', file);

  const doFetch = () => fetch(`${API_BASE_URL}/portfolio/import/csv`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
      'Bypass-Tunnel-Reminder': 'true',
      ...(isNative ? { 'X-Capacitor': 'true' } : {}),
    },
  });

  let response = await doFetch();
  if (response.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) response = await doFetch();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${response.status})`);
  }
  return response.json();
}

export async function uploadPortfolioScreenshot(file: File): Promise<CsvParseResult> {
  const formData = new FormData();
  formData.append('file', file);

  const url = `${API_BASE_URL}/portfolio/import/screenshot`;

  const doFetch = () => fetch(url, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
      'Bypass-Tunnel-Reminder': 'true',
      ...(isNative ? { 'X-Capacitor': 'true' } : {}),
    },
  });

  let response = await doFetch();
  if (response.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) response = await doFetch();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Screenshot upload failed (${response.status})`);
  }
  const data = await response.json();
  return data;
}

export async function confirmPortfolioImport(
  holdings: { ticker: string; shares: number; averageCost: number }[],
  mode: 'replace' | 'merge'
): Promise<{ added: number; updated: number; removed: number }> {
  return fetchJson<{ added: number; updated: number; removed: number }>(
    `${API_BASE_URL}/portfolio/import/confirm`,
    { method: 'POST', body: JSON.stringify({ holdings, mode }) }
  );
}

export async function clearPortfolio(): Promise<{ cleared: boolean; holdingsRemoved: number }> {
  return fetchJson<{ cleared: boolean; holdingsRemoved: number }>(
    `${API_BASE_URL}/portfolio/clear`,
    { method: 'POST', body: JSON.stringify({ confirmation: 'CLEAR' }) }
  );
}

// Goals endpoints
export async function getGoals(): Promise<Goal[]> {
  return fetchJson<Goal[]>(`${API_BASE_URL}/goals`);
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  return fetchJson<Goal>(`${API_BASE_URL}/goals`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateGoal(id: string, input: Partial<GoalInput>): Promise<Goal> {
  return fetchJson<Goal>(`${API_BASE_URL}/goals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteGoal(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/goals/${id}`, {
    method: 'DELETE',
  });
}

// Symbol search endpoint
export async function searchSymbols(
  query: string,
  heldTickers: string[] = []
): Promise<SymbolSearchResponse> {
  if (!query.trim()) {
    return {
      results: [],
      meta: { query: '', count: 0, partial: false, cached: false, advPending: [] },
    };
  }

  let url = `${API_BASE_URL}/market/search?q=${encodeURIComponent(query.trim())}`;

  // Add held tickers to help with ranking
  if (heldTickers.length > 0) {
    url += `&held=${encodeURIComponent(heldTickers.join(','))}`;
  }

  return fetchJson<SymbolSearchResponse>(url);
}

// Current Pace endpoint
export async function getCurrentPace(window: PaceWindow = '1M'): Promise<CurrentPaceResponse> {
  return fetchJson<CurrentPaceResponse>(`${API_BASE_URL}/portfolio/projections/current-pace?window=${window}`);
}

// YTD Settings endpoints
export async function getYtdSettings(): Promise<YtdSettings> {
  return fetchJson<YtdSettings>(`${API_BASE_URL}/settings/ytd`);
}

export async function setYtdSettings(input: { ytdStartEquity: number; netContributionsYTD?: number }): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/ytd`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function clearYtdSettings(): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/ytd`, {
    method: 'DELETE',
  });
}

// Portfolio Intelligence endpoint
export async function getPortfolioIntelligence(
  window: IntelligenceWindow = '1d'
): Promise<PortfolioIntelligenceResponse> {
  return fetchJson<PortfolioIntelligenceResponse>(
    `${API_BASE_URL}/intelligence?window=${window}`
  );
}

// Leaderboard endpoints
export async function getLeaderboard(window: LeaderboardWindow = '1M', region: LeaderboardRegion = 'world'): Promise<LeaderboardResponse> {
  return fetchJson<LeaderboardResponse>(`${API_BASE_URL}/leaderboard?window=${window}&region=${region}`);
}

export async function getUsers(): Promise<UserInfo[]> {
  return fetchJson<UserInfo[]>(`${API_BASE_URL}/users`);
}

export async function getUserPortfolio(userId: string): Promise<Portfolio> {
  return fetchJson<Portfolio>(`${API_BASE_URL}/users/${userId}/portfolio`);
}

// Social endpoints
export async function getUserProfile(userId: string, viewerId?: string): Promise<UserProfile> {
  const params = viewerId ? `?viewerId=${viewerId}` : '';
  return fetchJson<UserProfile>(`${API_BASE_URL}/users/${userId}/profile${params}`);
}

export async function updateUserRegion(userId: string, region: string | null, showRegion: boolean): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${userId}/region`, {
    method: 'PUT',
    body: JSON.stringify({ region, showRegion }),
  });
}

export async function updateHoldingsVisibility(userId: string, holdingsVisibility: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${userId}/holdings-visibility`, {
    method: 'PUT',
    body: JSON.stringify({ holdingsVisibility }),
  });
}

// User Settings
export interface UserSettings {
  id: string;
  username: string;
  displayName: string;
  profilePublic: boolean;
  region: string | null;
  showRegion: boolean;
  holdingsVisibility: 'all' | 'top5' | 'sectors' | 'hidden';
  bio?: string | null;
  dripEnabled: boolean;
  cashInterestRate?: number | null;
  createdAt: string;
}

export interface UserSettingsUpdate {
  displayName?: string;
  profilePublic?: boolean;
  region?: string | null;
  showRegion?: boolean;
  holdingsVisibility?: 'all' | 'top5' | 'sectors' | 'hidden';
  bio?: string | null;
  dripEnabled?: boolean;
  cashInterestRate?: number | null;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  return fetchJson<UserSettings>(`${API_BASE_URL}/users/${userId}/settings`);
}

export async function updateUserSettings(userId: string, settings: UserSettingsUpdate): Promise<UserSettings> {
  return fetchJson<UserSettings>(`${API_BASE_URL}/users/${userId}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function followUser(targetUserId: string, followerId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${targetUserId}/follow`, {
    method: 'POST',
    body: JSON.stringify({ followerId }),
  });
}

export async function unfollowUser(targetUserId: string, followerId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${targetUserId}/follow`, {
    method: 'DELETE',
    body: JSON.stringify({ followerId }),
  });
}

// ── Stock follows ─────────────────────────────────────────────
export async function followStock(symbol: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/stock-follows/${symbol}`, { method: 'POST' });
}

export async function unfollowStock(symbol: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/stock-follows/${symbol}`, { method: 'DELETE' });
}

export async function getStockFollowStatus(symbol: string): Promise<{ following: boolean; followerCount: number }> {
  return fetchJson<{ following: boolean; followerCount: number }>(`${API_BASE_URL}/stock-follows/${symbol}/status`);
}

export async function getMostFollowedStocks(): Promise<{ symbol: string; followerCount: number }[]> {
  return fetchJson<{ symbol: string; followerCount: number }[]>(`${API_BASE_URL}/stock-follows/most-followed`);
}

export async function getMyFollowedStocks(): Promise<string[]> {
  return fetchJson<string[]>(`${API_BASE_URL}/stock-follows/mine`);
}

export async function getFeed(userId: string, before?: string): Promise<{ events: ActivityEvent[] }> {
  const params = new URLSearchParams({ userId });
  if (before) params.append('before', before);
  return fetchJson<{ events: ActivityEvent[] }>(`${API_BASE_URL}/social/feed?${params}`);
}

export async function getFollowers(userId: string): Promise<{ id: string; username: string; displayName: string }[]> {
  return fetchJson(`${API_BASE_URL}/users/${userId}/followers`);
}

export async function getFollowingList(userId: string): Promise<{ id: string; username: string; displayName: string }[]> {
  return fetchJson(`${API_BASE_URL}/users/${userId}/following`);
}

export async function getStockDetails(ticker: string): Promise<StockDetailsResponse> {
  return fetchJson<StockDetailsResponse>(`${API_BASE_URL}/market/stock/${ticker}/details`);
}

export async function getETFHoldings(ticker: string): Promise<ETFHoldingsData | null> {
  try {
    return await fetchJson<ETFHoldingsData>(`${API_BASE_URL}/market/stock/${ticker}/etf-holdings`);
  } catch {
    return null;
  }
}

export async function getAssetAbout(ticker: string): Promise<AssetAbout | null> {
  try {
    return await fetchJson<AssetAbout>(`${API_BASE_URL}/market/stock/${ticker}/about`);
  } catch {
    return null;
  }
}

export async function getStockQuote(ticker: string): Promise<StockDetailsResponse['quote']> {
  return fetchJson<StockDetailsResponse['quote']>(`${API_BASE_URL}/market/quote/${ticker}`);
}

/**
 * Fast quote using Yahoo Finance directly - no queue delays.
 * Used for progressive loading to show price immediately.
 */
export async function getFastQuote(ticker: string): Promise<StockDetailsResponse['quote']> {
  return fetchJson<StockDetailsResponse['quote']>(`${API_BASE_URL}/market/fast-quote/${ticker}`);
}

export interface IntradayCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getIntradayCandles(ticker: string): Promise<IntradayCandle[]> {
  const resp = await fetchJson<{ ticker: string; candles: IntradayCandle[] }>(`${API_BASE_URL}/market/stock/${ticker}/intraday`);
  return resp.candles;
}

export async function getHourlyCandles(ticker: string, period: '1W' | '1M' | 'YTD'): Promise<IntradayCandle[]> {
  const resp = await fetchJson<{ ticker: string; candles: IntradayCandle[] }>(`${API_BASE_URL}/market/stock/${ticker}/hourly?period=${period}`);
  return resp.candles;
}

export async function getDailyCandles(ticker: string, period: '3M' | 'YTD' | '1Y' | 'ALL'): Promise<IntradayCandle[]> {
  const resp = await fetchJson<{ ticker: string; candles: IntradayCandle[] }>(`${API_BASE_URL}/market/stock/${ticker}/daily?period=${period}`);
  return resp.candles;
}

export interface BenchmarkCandle {
  date: string;
  time: number;
  close: number;
}

export async function getBenchmarkCloses(ticker: string = 'SPY'): Promise<BenchmarkCandle[]> {
  const resp = await fetchJson<{ ticker: string; candles: BenchmarkCandle[] }>(`${API_BASE_URL}/market/benchmark/${ticker}/closes`);
  return resp.candles;
}

export async function getPortfolioChart(period: PortfolioChartPeriod = '1D', userId?: string): Promise<PortfolioChartData> {
  const params = new URLSearchParams({ period });
  if (userId) params.append('userId', userId);
  return fetchJson<PortfolioChartData>(`${API_BASE_URL}/portfolio/history/chart?${params}`);
}

export async function getUserChart(userId: string, period: PortfolioChartPeriod = '1D'): Promise<PortfolioChartData> {
  return fetchJson<PortfolioChartData>(`${API_BASE_URL}/users/${userId}/chart?period=${period}`);
}

// Performance comparison endpoint
export async function getPerformance(
  window: PerformanceWindow = '1M',
  benchmark: string = 'SPY'
): Promise<PerformanceData> {
  return fetchJson<PerformanceData>(
    `${API_BASE_URL}/portfolio/performance?window=${window}&benchmark=${benchmark}`
  );
}

// Ticker activity (buy/sell/update events for a specific stock)
export async function getTickerActivity(ticker: string): Promise<ActivityEvent[]> {
  return fetchJson<ActivityEvent[]>(`${API_BASE_URL}/portfolio/activity/${encodeURIComponent(ticker)}`);
}

// Transaction endpoints
export async function getTransactions(): Promise<Transaction[]> {
  return fetchJson<Transaction[]>(`${API_BASE_URL}/transactions`);
}

export async function addTransaction(input: { type: 'deposit' | 'withdrawal'; amount: number; date: string }): Promise<Transaction> {
  return fetchJson<Transaction>(`${API_BASE_URL}/transactions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/transactions/${id}`, { method: 'DELETE' });
}

// Alert endpoints
export async function getAlerts(userId: string): Promise<AlertConfig[]> {
  return fetchJson<AlertConfig[]>(`${API_BASE_URL}/alerts?userId=${userId}`);
}

export async function updateAlertConfig(id: string, data: { threshold?: number | null; enabled?: boolean }): Promise<AlertConfig> {
  return fetchJson<AlertConfig>(`${API_BASE_URL}/alerts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getAlertEvents(userId: string): Promise<AlertEventType[]> {
  return fetchJson<AlertEventType[]>(`${API_BASE_URL}/alerts/events?userId=${userId}`);
}

export async function getUnreadAlertCount(userId: string): Promise<{ count: number }> {
  return fetchJson<{ count: number }>(`${API_BASE_URL}/alerts/events/unread-count?userId=${userId}`);
}

export async function markAlertRead(eventId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/alerts/events/${eventId}/read`, { method: 'POST' });
}

export async function markAllAlertsRead(userId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/alerts/events/read-all?userId=${userId}`, { method: 'POST' });
}

export async function getUserIntelligence(
  userId: string,
  window: IntelligenceWindow = '1d'
): Promise<PortfolioIntelligenceResponse> {
  return fetchJson<PortfolioIntelligenceResponse>(
    `${API_BASE_URL}/users/${userId}/intelligence?window=${window}`
  );
}

export interface MarketNewsItem {
  id: number;
  headline: string;
  source: string;
  url: string;
  summary: string;
  image: string;
  datetime: number;
  related: string;
  category: string;
}

export async function getMarketNews(limit = 20): Promise<MarketNewsItem[]> {
  return fetchJson<MarketNewsItem[]>(`${API_BASE_URL}/market/news?limit=${limit}`);
}

export async function getTickerNews(ticker: string, limit = 30): Promise<MarketNewsItem[]> {
  return fetchJson<MarketNewsItem[]>(`${API_BASE_URL}/market/stock/${encodeURIComponent(ticker)}/news?limit=${limit}`);
}

// Perplexity AI-powered events
export interface AIEvent {
  date: string;
  type: 'EARNINGS' | 'ANALYST' | 'NEWS' | 'DIVIDEND';
  label: string;
  insight: string;
  sentiment: number;
  source_url?: string;
}

export interface AIEventsResponse {
  ticker: string;
  events: AIEvent[];
}

export async function getAIEvents(ticker: string, days = 90): Promise<AIEventsResponse> {
  return fetchJson<AIEventsResponse>(`${API_BASE_URL}/market/stock/${encodeURIComponent(ticker)}/ai-events?days=${days}`);
}

// Stock Q&A (Perplexity AI)
export interface StockQAResponse {
  ticker: string;
  question: string;
  answer: string;
  citations: string[];
  answeredAt: string;
}

export async function askStockQuestion(ticker: string, question: string): Promise<StockQAResponse> {
  return fetchJson<StockQAResponse>(`${API_BASE_URL}/market/stock/${encodeURIComponent(ticker)}/ask`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

// Portfolio Briefing (Perplexity AI)
export interface BriefingSection {
  title: string;
  takeaway: string;
  body: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface PortfolioBriefingResponse {
  generatedAt: string;
  verdict: string;
  headline: string;
  sections: BriefingSection[];
  holdingCount: number;
  cached: boolean;
}

export async function getPortfolioBriefing(): Promise<PortfolioBriefingResponse> {
  return fetchJson<PortfolioBriefingResponse>(`${API_BASE_URL}/insights/briefing`);
}

export interface BriefingExplainResponse {
  explanation: string;
  citations: string[];
  cached: boolean;
}

export async function explainBriefingSection(title: string, body: string): Promise<BriefingExplainResponse> {
  const resp = await fetch(`${API_BASE_URL}/insights/briefing/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
  if (!resp.ok) throw new Error(`Failed to explain briefing section`);
  return resp.json();
}

// Behavior Insights (Perplexity AI)
export interface BehaviorInsight {
  category: 'concentration' | 'timing' | 'sizing' | 'diversification' | 'general';
  title: string;
  observation: string;
  suggestion: string;
  severity: 'info' | 'warning' | 'positive';
}

export interface BehaviorInsightsResponse {
  generatedAt: string;
  summary: string;
  insights: BehaviorInsight[];
  activityCount: number;
  holdingCount: number;
  cached: boolean;
}

export async function getBehaviorInsights(): Promise<BehaviorInsightsResponse> {
  return fetchJson<BehaviorInsightsResponse>(`${API_BASE_URL}/insights/behavior`);
}

export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

export async function getPrices(tickers: string[]): Promise<Record<string, PriceData>> {
  const resp = await fetchJson<{ prices: Record<string, PriceData> }>(
    `${API_BASE_URL}/market/prices?tickers=${tickers.join(',')}`
  );
  return resp.prices;
}

// Price Alert endpoints
export async function getPriceAlerts(ticker?: string, userId?: string): Promise<PriceAlert[]> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  if (userId) params.set('userId', userId);
  const qs = params.toString();
  return fetchJson<PriceAlert[]>(`${API_BASE_URL}/price-alerts${qs ? `?${qs}` : ''}`);
}

export async function getPriceAlert(id: string): Promise<PriceAlert> {
  return fetchJson<PriceAlert>(`${API_BASE_URL}/price-alerts/${id}`);
}

export async function createPriceAlert(input: CreatePriceAlertInput): Promise<PriceAlert> {
  return fetchJson<PriceAlert>(`${API_BASE_URL}/price-alerts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updatePriceAlert(id: string, data: UpdatePriceAlertInput): Promise<PriceAlert> {
  return fetchJson<PriceAlert>(`${API_BASE_URL}/price-alerts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePriceAlert(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/price-alerts/${id}`, { method: 'DELETE' });
}

export async function getPriceAlertEvents(userId?: string, limit?: number): Promise<PriceAlertEvent[]> {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return fetchJson<PriceAlertEvent[]>(`${API_BASE_URL}/price-alerts/events${qs ? `?${qs}` : ''}`);
}

export async function markPriceAlertEventRead(eventId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/price-alerts/events/${eventId}/read`, { method: 'POST' });
}

export async function getUnreadPriceAlertCount(userId?: string): Promise<{ count: number }> {
  const params = userId ? `?userId=${userId}` : '';
  return fetchJson<{ count: number }>(`${API_BASE_URL}/price-alerts/events/unread-count${params}`);
}

// Analyst events
import { AnalystEvent } from './types';

export async function getAnalystEvents(limit?: number, ticker?: string): Promise<AnalystEvent[]> {
  const qs = new URLSearchParams();
  if (limit) qs.set('limit', String(limit));
  if (ticker) qs.set('ticker', ticker);
  const params = qs.toString();
  return fetchJson<AnalystEvent[]>(`${API_BASE_URL}/analyst/events${params ? `?${params}` : ''}`);
}

export async function markAnalystEventRead(eventId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/analyst/events/${eventId}/read`, { method: 'POST' });
}

export async function markAllAnalystEventsRead(): Promise<void> {
  await fetchJson(`${API_BASE_URL}/analyst/events/read-all`, { method: 'POST' });
}

export async function getUnreadAnalystCount(): Promise<{ count: number }> {
  return fetchJson<{ count: number }>(`${API_BASE_URL}/analyst/events/unread-count`);
}

// Alpha Vantage Fundamentals / Earnings / Economic endpoints
import { EconomicDashboardResponse, InternationalEconomicResponse, PortfolioMacroImpactResponse, FundamentalsResponse, EarningsResponse } from './types';

export async function getEconomicDashboard(): Promise<EconomicDashboardResponse> {
  return fetchJson<EconomicDashboardResponse>(`${API_BASE_URL}/fundamentals/economic`);
}

export async function getInternationalEconomic(): Promise<InternationalEconomicResponse> {
  return fetchJson<InternationalEconomicResponse>(`${API_BASE_URL}/fundamentals/economic/international`);
}

export async function getPortfolioMacroImpact(): Promise<PortfolioMacroImpactResponse> {
  return fetchJson<PortfolioMacroImpactResponse>(`${API_BASE_URL}/fundamentals/economic/portfolio-impact`);
}

export async function getFundamentals(ticker: string): Promise<FundamentalsResponse> {
  return fetchJson<FundamentalsResponse>(`${API_BASE_URL}/fundamentals/${encodeURIComponent(ticker)}`);
}

export async function getEarnings(ticker: string): Promise<EarningsResponse> {
  return fetchJson<EarningsResponse>(`${API_BASE_URL}/fundamentals/${encodeURIComponent(ticker)}/earnings`);
}

// Milestone events (52-week high/low, all-time high/low)
import { MilestoneEvent } from './types';

export async function getMilestoneEvents(limit?: number): Promise<MilestoneEvent[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return fetchJson<MilestoneEvent[]>(`${API_BASE_URL}/milestones/events${qs ? `?${qs}` : ''}`);
}

export async function getUnreadMilestoneCount(): Promise<{ count: number }> {
  return fetchJson<{ count: number }>(`${API_BASE_URL}/milestones/events/unread-count`);
}

export async function markMilestoneEventRead(eventId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/milestones/events/${eventId}/read`, { method: 'POST' });
}

export async function markAllMilestoneEventsRead(): Promise<void> {
  await fetchJson(`${API_BASE_URL}/milestones/events/read-all`, { method: 'POST' });
}

// ── Nala AI Research ──────────────────────────────────────────────

export interface NalaStockMetrics {
  peRatio: number | null;
  roe: number | null;
  debtToEquity: number | null;
  dividendYield: number | null;
  revenueGrowthYoY: number | null;
  profitMargin: number | null;
  freeCashFlowYield: number | null;
  marketCapB: number | null;
  beta: number | null;
  pegRatio: number | null;
}

export interface NalaLocalDataMatch {
  ticker: string;
  isHeld: boolean;
  localMetrics: {
    peRatio: number | null;
    roe: number | null;
    dividendYield: number | null;
    profitMargin: number | null;
    marketCap: number | null;
    beta: number | null;
  };
  deviations: string[];
}

export interface NalaStockResult {
  ticker: string;
  companyName: string;
  sector: string;
  currentPrice: number | null;
  metrics: NalaStockMetrics;
  confidenceScore: number;
  explanation: string;
  risks: string;
  localData: NalaLocalDataMatch | null;
}

export interface NalaStrategyInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
}

export interface NalaResearchResponse {
  question: string;
  strategy: NalaStrategyInfo | null;
  stocks: NalaStockResult[];
  strategyExplanation: string;
  citations: string[];
  generatedAt: string;
  cached: boolean;
}

export interface NalaSuggestion {
  text: string;
  icon: string;
}

export interface NalaSuggestionsResponse {
  suggestions: NalaSuggestion[];
}

export async function askNala(question: string, signal?: AbortSignal): Promise<NalaResearchResponse> {
  return fetchJson<NalaResearchResponse>(`${API_BASE_URL}/nala/ask`, {
    method: 'POST',
    body: JSON.stringify({ question }),
    signal,
  });
}

export async function getNalaSuggestions(): Promise<NalaSuggestionsResponse> {
  return fetchJson<NalaSuggestionsResponse>(`${API_BASE_URL}/nala/suggestions`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Watchlist API
// ═══════════════════════════════════════════════════════════════════════════

import {
  WatchlistSummary,
  WatchlistDetail,
  WatchlistInput,
  WatchlistHoldingInput,
} from './types';

export async function getWatchlists(): Promise<WatchlistSummary[]> {
  return fetchJson<WatchlistSummary[]>(`${API_BASE_URL}/watchlists`);
}

export async function getWatchlistDetail(id: string): Promise<WatchlistDetail> {
  return fetchJson<WatchlistDetail>(`${API_BASE_URL}/watchlists/${id}`);
}

export async function getWatchlistChart(watchlistId: string, period: PortfolioChartPeriod = '1D'): Promise<PortfolioChartData> {
  return fetchJson<PortfolioChartData>(`${API_BASE_URL}/watchlists/${watchlistId}/chart?period=${period}`);
}

export async function createWatchlist(input: WatchlistInput): Promise<WatchlistSummary> {
  return fetchJson<WatchlistSummary>(`${API_BASE_URL}/watchlists`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateWatchlist(id: string, input: Partial<WatchlistInput>): Promise<WatchlistSummary> {
  return fetchJson<WatchlistSummary>(`${API_BASE_URL}/watchlists/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteWatchlist(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/watchlists/${id}`, { method: 'DELETE' });
}

export async function addWatchlistHolding(watchlistId: string, input: WatchlistHoldingInput): Promise<void> {
  await fetchJson(`${API_BASE_URL}/watchlists/${watchlistId}/holdings`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateWatchlistHolding(
  watchlistId: string,
  ticker: string,
  input: { shares?: number; averageCost?: number }
): Promise<void> {
  await fetchJson(`${API_BASE_URL}/watchlists/${watchlistId}/holdings/${encodeURIComponent(ticker)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function removeWatchlistHolding(watchlistId: string, ticker: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/watchlists/${watchlistId}/holdings/${encodeURIComponent(ticker)}`, {
    method: 'DELETE',
  });
}

// Health / Status
export interface ProviderStatus {
  configured: boolean;
  lastSuccessMs: number;
  rateLimitedUntil?: number;
  hasPremiumAccess?: boolean | null;
  cookieExpiryMs?: number;
  cache?: Record<string, number>;
}

export interface HealthStatus {
  status: string;
  timestamp: string;
  uptime: number;
  providers: Record<string, ProviderStatus>;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  return fetchJson<HealthStatus>(`${API_BASE_URL}/health/status`);
}

// Discover / Heatmap
export type HeatmapPeriod = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';
export type MarketIndex = 'SP500' | 'DOW30' | 'NASDAQ100';

export async function getMarketHeatmap(period: HeatmapPeriod = '1D', index?: MarketIndex): Promise<import('./types').HeatmapResponse> {
  const params = new URLSearchParams({ period });
  if (index) params.set('index', index);
  return fetchJson<import('./types').HeatmapResponse>(`${API_BASE_URL}/market/heatmap?${params}`);
}

// Cash Interest
export interface CashInterestAccrual {
  cashBalance: number;
  cashInterestRate: number;
  dailyAccrual: number;
  annualAccrual: number;
  asOf: string;
}

export async function getCashInterestAccrual(): Promise<CashInterestAccrual> {
  return fetchJson<CashInterestAccrual>(`${API_BASE_URL}/settings/cash-interest/accrual`);
}

// Notification Status
export interface NotificationStatus {
  earnings: {
    lastSentAt: string | null;
    lastStatus: string | null;
    lastMessage: string | null;
    lastRefKey: string | null;
  };
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  return fetchJson<NotificationStatus>(`${API_BASE_URL}/notifications/status`);
}

// Dividend Growth Rates
export interface DividendGrowthHistory {
  year: number;
  totalPerShare: number;
}

export interface HoldingGrowthData {
  ticker: string;
  currentAnnualDividend: number;
  dividendYield: number;
  growthRates: {
    '1yr': number | null;
    '3yr': number | null;
    '5yr': number | null;
  };
  consecutiveYearsGrowth: number;
  lastIncreaseDate: string | null;
  lastIncreasePct: number | null;
  history: DividendGrowthHistory[];
}

export interface DividendGrowthResponse {
  holdings: HoldingGrowthData[];
  portfolio: {
    weightedAvgGrowthRate: number;
    totalAnnualIncome: number;
    totalMonthlyIncome: number;
  };
}

export async function getDividendGrowthRates(): Promise<DividendGrowthResponse> {
  return fetchJson<DividendGrowthResponse>(`${API_BASE_URL}/dividends/growth-rates?excludeCurrentYear=true`);
}

// Earnings Track Record
import { EarningsTrackResult, TaxHarvestResponse } from './types';

export async function getEarningsTrack(ticker: string): Promise<EarningsTrackResult | null> {
  try {
    return await fetchJson<EarningsTrackResult>(
      `${API_BASE_URL}/market/stock/${encodeURIComponent(ticker)}/earnings-track`
    );
  } catch {
    return null;
  }
}

// Tax-Loss Harvesting
export async function getTaxHarvestSuggestions(): Promise<TaxHarvestResponse | null> {
  try {
    return await fetchJson<TaxHarvestResponse>(`${API_BASE_URL}/insights/tax-harvest`);
  } catch {
    return null;
  }
}

// Dividend Calendar Export
export function downloadDividendCalendar(months?: number, ticker?: string): void {
  const params = new URLSearchParams();
  if (months) params.set('months', String(months));
  if (ticker) params.set('ticker', ticker);
  const qs = params.toString();
  window.open(`${API_BASE_URL}/dividends/calendar.ics${qs ? `?${qs}` : ''}`, '_blank');
}

// Nala Score
import { NalaScoreResponse, EtfOverlapResponse, AnomalyEvent } from './types';

export async function getNalaScore(ticker: string): Promise<NalaScoreResponse | null> {
  try {
    return await fetchJson<NalaScoreResponse>(
      `${API_BASE_URL}/market/stock/${encodeURIComponent(ticker)}/nala-score`
    );
  } catch {
    return null;
  }
}

// ETF Overlap
export async function getEtfOverlap(): Promise<EtfOverlapResponse | null> {
  try {
    return await fetchJson<EtfOverlapResponse>(`${API_BASE_URL}/portfolio/etf-overlap`);
  } catch {
    return null;
  }
}

// Anomaly Detection
export async function getAnomalies(limit = 50): Promise<AnomalyEvent[]> {
  try {
    return await fetchJson<AnomalyEvent[]>(`${API_BASE_URL}/insights/anomalies?limit=${limit}`);
  } catch {
    return [];
  }
}

export async function getUnreadAnomalyCount(): Promise<{ count: number }> {
  try {
    return await fetchJson<{ count: number }>(`${API_BASE_URL}/insights/anomalies/unread-count`);
  } catch {
    return { count: 0 };
  }
}

export async function markAnomalyRead(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/insights/anomalies/${id}/read`, { method: 'PATCH' });
}

export async function markAllAnomaliesRead(): Promise<void> {
  await fetchJson(`${API_BASE_URL}/insights/anomalies/mark-all-read`, { method: 'POST' });
}

// ── Plaid ──────────────────────────────────────────────

export interface PlaidAccount {
  id: string;
  plaidAccountId: string;
  name: string | null;
  officialName: string | null;
  type: string | null;
  subtype: string | null;
  mask: string | null;
}

export interface PlaidItem {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  status: string;
  consentExpiresAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  plaidAccounts: PlaidAccount[];
}

export interface PlaidHolding {
  ticker: string | null;
  name: string | null;
  quantity: number;
  costBasis: number | null;
  currentValue: number | null;
  currentPrice: number | null;
  accountId: string;
  type: string | null;
}

export async function createPlaidLinkToken(): Promise<{ linkToken: string }> {
  return fetchJson(`${API_BASE_URL}/plaid/link-token`, { method: 'POST' });
}

export interface PlaidSyncResult {
  created: number;
  updated: number;
  skipped: number;
  tickers: string[];
  skippedDetails: Array<{ ticker: string | null; name: string | null; reason: string }>;
}

export async function exchangePlaidToken(publicToken: string): Promise<{ itemId: string; accounts: Array<{ id: string; name: string | null; mask: string | null; type: string | null }>; sync: PlaidSyncResult | null }> {
  return fetchJson(`${API_BASE_URL}/plaid/exchange-token`, {
    method: 'POST',
    body: JSON.stringify({ publicToken }),
  });
}

export async function getPlaidItems(): Promise<{ items: PlaidItem[] }> {
  return fetchJson(`${API_BASE_URL}/plaid/items`);
}

export async function getPlaidHoldings(itemId: string): Promise<{ holdings: PlaidHolding[] }> {
  return fetchJson(`${API_BASE_URL}/plaid/items/${itemId}/holdings`);
}

export async function disconnectPlaidItem(itemId: string): Promise<{ success: boolean }> {
  return fetchJson(`${API_BASE_URL}/plaid/items/${itemId}`, { method: 'DELETE' });
}

// ─── Billing ────────────────────────────────────────────────────────────────

export interface BillingStatus {
  plan: 'free' | 'pro' | 'premium';
  planExpiresAt: string | null;
  planStartedAt: string | null;
  stripeCustomerId: string | null;
  subscriptionStatus?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
  isGracePeriod?: boolean;
  graceEndsAt?: string | null;
}

export async function getBillingStatus(): Promise<BillingStatus> {
  return fetchJson(`${API_BASE_URL}/billing/status`);
}

export async function createCheckoutSession(priceId: string): Promise<{ url: string }> {
  return fetchJson(`${API_BASE_URL}/billing/checkout`, {
    method: 'POST',
    body: JSON.stringify({ priceId }),
  });
}

export async function createPortalSession(): Promise<{ url: string }> {
  return fetchJson(`${API_BASE_URL}/billing/portal`, {
    method: 'POST',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Creator Monetization API
// ═══════════════════════════════════════════════════════════════════════════

import {
  CreatorProfile,
  CreatorEntitlement,
  CreatorDashboard,
  CreatorSubscriptionInfo,
  CreatorSettingsUpdate,
  CreatorLedgerResponse,
  CreatorLedgerEntryType,
} from './types';

export async function applyAsCreator(pitch?: string): Promise<CreatorProfile> {
  return fetchJson<CreatorProfile>(`${API_BASE_URL}/creator/apply`, {
    method: 'POST',
    body: JSON.stringify({ pitch }),
  });
}

export async function getCreatorProfile(userId: string): Promise<CreatorProfile> {
  return fetchJson<CreatorProfile>(`${API_BASE_URL}/creator/${userId}`);
}

export async function getCreatorEntitlement(creatorUserId: string): Promise<CreatorEntitlement> {
  return fetchJson<CreatorEntitlement>(`${API_BASE_URL}/creator/${creatorUserId}/entitlement`);
}

export async function getCreatorLockedContent(
  creatorUserId: string,
  section: string
): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>(
    `${API_BASE_URL}/creator/${creatorUserId}/locked-content?section=${encodeURIComponent(section)}`
  );
}

export async function getCreatorDashboard(): Promise<CreatorDashboard> {
  return fetchJson<CreatorDashboard>(`${API_BASE_URL}/creator/dashboard`);
}

export async function updateCreatorSettings(settings: CreatorSettingsUpdate): Promise<CreatorProfile> {
  return fetchJson<CreatorProfile>(`${API_BASE_URL}/creator/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function createCreatorConnectOnboarding(): Promise<{ url: string }> {
  return fetchJson<{ url: string }>(`${API_BASE_URL}/creator/connect-onboarding`, {
    method: 'POST',
  });
}

export async function requestCreatorPayout(): Promise<{ payoutId: string; amountCents: number }> {
  return fetchJson<{ payoutId: string; amountCents: number }>(`${API_BASE_URL}/creator/payout`, {
    method: 'POST',
  });
}

export async function getMyCreatorSubscriptions(): Promise<CreatorSubscriptionInfo[]> {
  return fetchJson<CreatorSubscriptionInfo[]>(`${API_BASE_URL}/creator/my-subscriptions`);
}

export async function subscribeToCreator(creatorUserId: string): Promise<{ url: string }> {
  return fetchJson<{ url: string }>(`${API_BASE_URL}/creator/${creatorUserId}/subscribe`, {
    method: 'POST',
  });
}

export async function cancelCreatorSubscription(creatorUserId: string): Promise<{ canceledAt: string }> {
  return fetchJson<{ canceledAt: string }>(`${API_BASE_URL}/creator/${creatorUserId}/subscribe`, {
    method: 'DELETE',
  });
}

export async function getCreatorLedger(params?: {
  limit?: number;
  cursor?: string;
  type?: CreatorLedgerEntryType;
  from?: string;
  to?: string;
}): Promise<CreatorLedgerResponse> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.type) qs.set('type', params.type);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const query = qs.toString();
  return fetchJson<CreatorLedgerResponse>(
    `${API_BASE_URL}/creator/ledger${query ? '?' + query : ''}`
  );
}

export async function reportCreator(
  creatorUserId: string,
  reason: string,
  description?: string
): Promise<{ reportId: string }> {
  return fetchJson<{ reportId: string }>(`${API_BASE_URL}/creator/${creatorUserId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, description }),
  });
}
