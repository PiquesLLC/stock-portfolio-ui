import { CapacitorHttp } from '@capacitor/core';
import { API_BASE_URL } from './config';
import { isNative, isNativePlatform } from './utils/platform';
import { nativeLog } from './utils/nativeDebug';
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
  PostData,
  CommentData,
  FeedItem,
  SocialNotificationData,
  TrendingTicker,
  BillionaireEntry,
  BillionaireProfile,
  BillionaireChartData,
  BillionaireMovers,
} from './types';

// Typed API error codes — callers check .code instead of string matching on .message
export type ApiErrorCode = 'SESSION_EXPIRED' | 'SERVER_UNAVAILABLE' | 'HTTP_ERROR' | 'NETWORK_ERROR';

export class ApiError extends Error {
  code: ApiErrorCode;
  status?: number;
  constructor(message: string, code: ApiErrorCode, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

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

const NATIVE_AUTH_STORAGE_KEY = 'nala_native_auth';

// Capacitor Preferences (native persistent storage) — survives iOS WKWebView
// localStorage purges that happen when the app is backgrounded under memory pressure.
// We lazy-import to avoid blocking web startup.
let _prefsModule: typeof import('@capacitor/preferences') | null = null;
async function getPrefs() {
  if (!isNativePlatform()) return null;
  if (!_prefsModule) {
    try { _prefsModule = await import('@capacitor/preferences'); } catch { return null; }
  }
  return _prefsModule.Preferences;
}

// Sync native storage to Capacitor Preferences (write-through)
async function persistNativeAuth(session: NativeAuthSession | null): Promise<void> {
  const Prefs = await getPrefs();
  if (!Prefs) return;
  try {
    if (!session) {
      await Prefs.remove({ key: NATIVE_AUTH_STORAGE_KEY });
    } else {
      await Prefs.set({ key: NATIVE_AUTH_STORAGE_KEY, value: JSON.stringify(session) });
    }
  } catch { /* ignore */ }
}

// Read from Capacitor Preferences (fallback when localStorage is wiped)
async function readPersistedNativeAuth(): Promise<NativeAuthSession | null> {
  const Prefs = await getPrefs();
  if (!Prefs) return null;
  try {
    const { value } = await Prefs.get({ key: NATIVE_AUTH_STORAGE_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<NativeAuthSession>;
    if (!parsed.refreshToken) return null;
    return { ...(parsed.accessToken ? { accessToken: parsed.accessToken } : {}), refreshToken: parsed.refreshToken };
  } catch { return null; }
}

// Emit boot diagnostics immediately
nativeLog('INIT', 'api.ts loaded', {
  isNative,
  isNativePlatform: isNativePlatform(),
  API_BASE_URL,
  isSameOrigin: isSameOriginApi(),
  protocol: typeof window !== 'undefined' ? window.location.protocol : 'N/A',
  origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
});

type NativeAuthSession = {
  accessToken?: string;
  refreshToken: string;
};

function readStoredNativeRefreshToken(): string | null {
  if (!isNativePlatform() || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(NATIVE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NativeAuthSession>;
    return typeof parsed.refreshToken === 'string' && parsed.refreshToken.length > 0
      ? parsed.refreshToken
      : null;
  } catch {
    return null;
  }
}

function readNativeAuthSession(): NativeAuthSession | null {
  if (!isNativePlatform() || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(NATIVE_AUTH_STORAGE_KEY);
    if (!raw) {
      // localStorage was wiped (iOS WKWebView background purge) — recover from Capacitor Preferences
      readPersistedNativeAuth().then(session => {
        if (session) {
          // Restore to localStorage for fast synchronous reads
          try { localStorage.setItem(NATIVE_AUTH_STORAGE_KEY, JSON.stringify(session)); } catch {}
        }
      });
      return null; // First call returns null; next call will have it restored
    }
    const parsed = JSON.parse(raw) as Partial<NativeAuthSession>;
    if (!parsed.refreshToken) return null;
    return {
      ...(parsed.accessToken ? { accessToken: parsed.accessToken } : {}),
      refreshToken: parsed.refreshToken,
    };
  } catch {
    return null;
  }
}

function writeNativeAuthSession(session: NativeAuthSession | null): void {
  if (!isNativePlatform() || typeof window === 'undefined') return;
  try {
    if (!session) {
      localStorage.removeItem(NATIVE_AUTH_STORAGE_KEY);
    } else {
      localStorage.setItem(NATIVE_AUTH_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore storage failures
  }
  // Write-through to Capacitor Preferences (persists even if localStorage is wiped)
  persistNativeAuth(session);
}

export function setNativeAuthSession(accessToken?: string | null, refreshToken?: string | null): void {
  nativeLog('AUTH', 'setNativeAuthSession called', {
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    accessTokenLen: accessToken?.length ?? 0,
    refreshTokenLen: refreshToken?.length ?? 0,
  });
  if (!accessToken || !refreshToken) {
    nativeLog('AUTH', 'setNativeAuthSession SKIPPED — missing tokens');
    return;
  }
  writeNativeAuthSession({ accessToken, refreshToken });
  // Verify write
  const verify = readNativeAuthSession();
  nativeLog('AUTH', 'setNativeAuthSession verify', { stored: !!verify });
}

export function clearNativeAuthSession(): void {
  writeNativeAuthSession(null);
}

export function hasNativeAuthSession(): boolean {
  return readNativeAuthSession() !== null;
}

export function hasNativeRefreshSession(): boolean {
  return readStoredNativeRefreshToken() !== null;
}

export function setNativeRefreshSession(refreshToken?: string | null): void {
  if (!isNativePlatform() || typeof window === 'undefined') return;
  if (!refreshToken) return;
  nativeLog('AUTH', 'setNativeRefreshSession fallback', {
    hasRefreshToken: true,
    refreshTokenLen: refreshToken.length,
  });
  writeNativeAuthSession({ refreshToken });
}

function getBrowserOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
}

export function isSameOriginApi(): boolean {
  if (typeof window === 'undefined') return true;
  if (!API_BASE_URL || API_BASE_URL.startsWith('/')) return true;
  try {
    const origin = getBrowserOrigin();
    const url = new URL(API_BASE_URL, origin);
    return url.origin === origin;
  } catch {
    return true;
  }
}

// Refresh token mutex: only one refresh at a time, others wait
let refreshPromise: Promise<boolean> | null = null;
// Once refresh fails, stop retrying until next successful login
let authDead = false;


async function tryRefreshToken(): Promise<boolean> {
  try {
    let nativeSession = readNativeAuthSession();
    const nativeRuntime = isNativePlatform();

    // If localStorage was wiped (iOS background purge), recover from Capacitor Preferences
    if (!nativeSession && nativeRuntime) {
      const persisted = await readPersistedNativeAuth();
      if (persisted) {
        nativeSession = persisted;
        // Restore to localStorage for future synchronous reads
        try { localStorage.setItem(NATIVE_AUTH_STORAGE_KEY, JSON.stringify(persisted)); } catch {}
        nativeLog('REFRESH', 'Recovered auth from Capacitor Preferences');
      }
    }

    const refreshToken = nativeSession?.refreshToken ?? readStoredNativeRefreshToken();
    nativeLog('REFRESH', 'tryRefreshToken', {
      nativeRuntime,
      hasRefreshToken: !!refreshToken,
      refreshTokenLen: refreshToken?.length ?? 0,
    });

    const url = `${API_BASE_URL}/auth/refresh`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(nativeRuntime ? { 'X-Nala-Native': '1' } : {}),
    };
    const body = refreshToken ? { refreshToken } : {};

    let status: number;
    let data: Record<string, unknown>;

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      ...(refreshToken ? { body: JSON.stringify(body) } : {}),
    });
    nativeLog('REFRESH', `← ${res.status}`);
    status = res.status;
    data = await res.json().catch(() => ({} as Record<string, unknown>));

    if (status >= 200 && status < 300) {
      if (nativeRuntime) {
        const accessToken =
          typeof data.accessToken === 'string'
            ? data.accessToken
            : (typeof data.token === 'string' ? data.token : null);
        const newRefresh = typeof data.refreshToken === 'string' ? data.refreshToken : null;
        nativeLog('REFRESH', 'tokens in response', { hasAccess: !!accessToken, hasRefresh: !!newRefresh });
        if (accessToken && newRefresh) {
          setNativeAuthSession(accessToken, newRefresh);
        }
      }
      authDead = false;
      return true;
    }
    // Only mark auth dead on 401 (definitive token failure).
    // Other 4xx (e.g. 429 rate-limit, 400 validation) are NOT terminal auth failures.
    if (status === 401) {
      nativeLog('REFRESH', 'FAILED 401 — marking authDead');
      nativeLog('REFRESH', 'error body', data);
      authDead = true;
    }
    return false;
  } catch (err) {
    nativeLog('REFRESH', 'NETWORK ERROR', { message: (err as Error)?.message });
    // Network error (server down, timeout) — don't kill auth,
    // the session may still be valid once the server comes back
    return false;
  }
}

async function refreshOnce(): Promise<boolean> {
  if (authDead) return false;
  if (refreshPromise) return refreshPromise;
  refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

/** Reset auth-dead flag after successful login */
export function resetAuthState(): void {
  nativeLog('AUTH', 'resetAuthState — clearing authDead + native session');
  authDead = false;
  clearNativeAuthSession();
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const shortUrl = url.replace(API_BASE_URL, '');
  const doFetch = async () => {
    const nativeSession = readNativeAuthSession();
    const nativeRuntime = isNativePlatform();
    const refreshToken = nativeSession?.refreshToken ?? readStoredNativeRefreshToken();
    const hasBearer = !!nativeSession?.accessToken;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      ...(nativeRuntime ? { 'X-Nala-Native': '1' } : {}),
      ...(nativeSession?.accessToken ? { Authorization: `Bearer ${nativeSession.accessToken}` } : {}),
      ...(options?.headers as Record<string, string> || {}),
    };
    nativeLog('FETCH', `→ ${options?.method || 'GET'} ${shortUrl}`, {
      nativeRuntime,
      hasBearer,
      hasNativeSession: !!refreshToken,
      authDead,
    });
    return fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    });
  };

  let response = await doFetch();
  nativeLog('FETCH', `← ${response.status} ${shortUrl}`);

  // On 401, try refreshing tokens once then retry the original request
  if (response.status === 401 && !url.includes('/auth/refresh') && !url.includes('/auth/login')) {
    nativeLog('FETCH', `401 on ${shortUrl} — attempting refresh`, { authDead });
    if (authDead) {
      nativeLog('FETCH', 'authDead=true, throwing SESSION_EXPIRED immediately');
      throw new ApiError('Session expired', 'SESSION_EXPIRED', 401);
    }
    const refreshed = await refreshOnce();
    if (refreshed) {
      nativeLog('FETCH', `refresh OK — retrying ${shortUrl}`);
      response = await doFetch();
      nativeLog('FETCH', `← ${response.status} ${shortUrl} (retry)`);
    } else if (authDead) {
      nativeLog('FETCH', 'refresh failed (authDead) — SESSION_EXPIRED');
      // Refresh failed with a definitive auth error (4xx) — session is dead.
      if (onAuthExpired && isSameOriginApi()) {
        onAuthExpired();
      }
      throw new ApiError('Session expired', 'SESSION_EXPIRED', 401);
    } else {
      nativeLog('FETCH', 'refresh failed (network) — SERVER_UNAVAILABLE');
      // Refresh failed due to network error (server down, timeout).
      // Session may still be valid once the server comes back.
      throw new ApiError('Server unavailable', 'SERVER_UNAVAILABLE');
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

    // 403 email verification required — hard-gated at App.tsx level now
    if (response.status === 403 && typeof error.error === 'string' && (error.error.toLowerCase().includes('email verification required') || error.error === 'email_verification_required')) {
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

async function fetchJsonPublic<T>(url: string, options?: RequestInit): Promise<T> {
  const nativeRuntime = isNativePlatform();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(nativeRuntime ? { 'X-Nala-Native': '1' } : {}),
    ...options?.headers,
  };

  if (nativeRuntime) {
    console.log('[fetchJsonPublic] native request:', options?.method || 'GET', url);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (nativeRuntime) {
      console.log('[fetchJsonPublic] fetch response:', response.status, response.headers.get('content-type'), url);
    }

    // Guard against non-JSON responses (HTML error pages, redirects) —
    // Safari/WebKit throws "The string did not match the expected pattern"
    // when .json() is called on non-JSON content.
    const ct = response.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');

    if (!response.ok) {
      if (isJson) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      const text = await response.text().catch(() => '');
      if (nativeRuntime) {
        console.error('[fetchJsonPublic] non-JSON error response:', response.status, text.slice(0, 200));
      }
      throw new Error(`HTTP ${response.status}: server returned non-JSON response`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    if (!isJson) {
      const text = await response.text().catch(() => '');
      if (nativeRuntime) {
        console.error('[fetchJsonPublic] 200 but non-JSON content-type:', ct, text.slice(0, 200));
      }
      throw new Error('Server returned non-JSON response (got HTML or text instead)');
    }

    return response.json();
  } catch (fetchError) {
    if (nativeRuntime) {
      const e = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      console.error('[fetchJsonPublic] fetch path error:', e.name, e.message, url);
    }

    if (!nativeRuntime) {
      throw fetchError;
    }

    // Native fallback: use CapacitorHttp when fetch fails (e.g. CORS on WKWebView)
    const method = options?.method || 'GET';
    const rawBody = options?.body;
    let data: unknown = undefined;

    if (typeof rawBody === 'string' && rawBody.length > 0) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = rawBody;
      }
    }

    if (nativeRuntime) {
      console.log('[fetchJsonPublic] falling back to CapacitorHttp:', method, url);
    }

    const response = await CapacitorHttp.request({
      url,
      method,
      headers: headers as Record<string, string>,
      data,
      responseType: 'json',
    });

    if (nativeRuntime) {
      console.log('[fetchJsonPublic] CapacitorHttp response:', response.status, typeof response.data);
    }

    if (response.status < 200 || response.status >= 300) {
      const errorData = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      if (nativeRuntime) {
        console.error('[fetchJsonPublic] CapacitorHttp error:', response.status, JSON.stringify(errorData).slice(0, 200));
      }
      throw new Error(
        typeof errorData.error === 'string' ? errorData.error : `HTTP ${response.status}`,
      );
    }

    return response.data as T;
  }
}

/** Like fetchJson but for FormData uploads — handles 401 refresh + retry */
async function fetchFormData<T>(url: string, formData: FormData, errorLabel = 'Upload failed'): Promise<T> {
  const doFetch = () => fetch(url, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
      'Bypass-Tunnel-Reminder': 'true',
      ...(isNative ? { 'X-Nala-Native': '1' } : {}),
    },
  });

  let response = await doFetch();
  if (response.status === 401) {
    if (authDead) throw new ApiError('Session expired', 'SESSION_EXPIRED', 401);
    const refreshed = await refreshOnce();
    if (refreshed) {
      response = await doFetch();
    } else if (authDead) {
      if (onAuthExpired && isSameOriginApi()) onAuthExpired();
      throw new ApiError('Session expired', 'SESSION_EXPIRED', 401);
    } else {
      throw new ApiError('Server unavailable', 'SERVER_UNAVAILABLE');
    }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `${errorLabel} (${response.status})`);
  }
  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// Waitlist API
// ═══════════════════════════════════════════════════════════════════════════

export async function joinWaitlist(email: string): Promise<{ success: boolean }> {
  return fetchJson(`${API_BASE_URL}/waitlist/join`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
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
  accessToken?: string;
  refreshToken?: string;
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

async function hydrateNativeAuthTokens<T extends { accessToken?: string; refreshToken?: string }>(response: T): Promise<T> {
  if (!isNativePlatform()) return response;
  if (typeof response.accessToken === 'string' && response.accessToken.length > 0) return response;
  if (typeof response.refreshToken !== 'string' || response.refreshToken.length === 0) return response;

  nativeLog('AUTH', 'native auth response missing accessToken — hydrating via refresh', {
    hasAccessToken: !!response.accessToken,
    hasRefreshToken: !!response.refreshToken,
    refreshTokenLen: response.refreshToken.length,
  });

  try {
    const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Nala-Native': '1',
      },
      body: JSON.stringify({ refreshToken: response.refreshToken }),
    });

    nativeLog('AUTH', 'native auth hydration refresh response', { status: refreshResponse.status });

    if (!refreshResponse.ok) {
      const errorBody = await refreshResponse.json().catch(() => ({}));
      nativeLog('AUTH', 'native auth hydration refresh failed', errorBody);
      return response;
    }

    const hydrated = await refreshResponse.json().catch(() => ({} as Record<string, unknown>));
    const accessToken =
      typeof hydrated.accessToken === 'string'
        ? hydrated.accessToken
        : (typeof hydrated.token === 'string' ? hydrated.token : undefined);
    const refreshToken = typeof hydrated.refreshToken === 'string' ? hydrated.refreshToken : response.refreshToken;

    nativeLog('AUTH', 'native auth hydration tokens', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
    });

    if (!accessToken) return response;
    return { ...response, accessToken, refreshToken };
  } catch (error) {
    nativeLog('AUTH', 'native auth hydration threw', {
      message: error instanceof Error ? error.message : String(error),
    });
    return response;
  }
}

export async function login(username: string, password: string): Promise<LoginResult> {
  // Login sets httpOnly cookie automatically - no token in response body
  // May return MFA challenge instead if user has MFA enabled
  const response = await fetchJson<LoginResult>(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return isMfaChallenge(response) ? response : hydrateNativeAuthTokens(response);
}

// ─── OAuth API ───────────────────────────────────────────

export interface OAuthLoginResponse {
  user: { id: string; username: string; displayName: string };
  isNewUser: boolean;
  accessToken?: string;
  refreshToken?: string;
}

export type OAuthLoginResult = OAuthLoginResponse | MfaChallengeResponse;

export async function oauthGoogleLogin(accessToken: string): Promise<OAuthLoginResult> {
  const response = await fetchJson<OAuthLoginResult>(`${API_BASE_URL}/auth/oauth/google/callback`, {
    method: 'POST',
    body: JSON.stringify({ access_token: accessToken }),
  });
  return isMfaChallenge(response) ? response : hydrateNativeAuthTokens(response);
}

export async function oauthAppleLogin(
  idToken: string,
  user?: { firstName?: string; lastName?: string },
  nonce?: string,
): Promise<OAuthLoginResult> {
  const response = await fetchJson<OAuthLoginResult>(`${API_BASE_URL}/auth/oauth/apple/callback`, {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken, user, ...(nonce ? { nonce } : {}) }),
  });
  return isMfaChallenge(response) ? response : hydrateNativeAuthTokens(response);
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
  const response = await fetchJson<LoginResponse>(`${API_BASE_URL}/auth/mfa/verify`, {
    method: 'POST',
    body: JSON.stringify({ challengeToken, code, method }),
  });
  return hydrateNativeAuthTokens(response);
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
  consent?: { acceptedPrivacyPolicy: boolean; acceptedTerms: boolean },
  referralCode?: string
): Promise<SignupResponse> {
  const response = await fetchJson<SignupResponse>(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    body: JSON.stringify({
      username,
      displayName,
      password,
      email,
      acceptedPrivacyPolicy: consent?.acceptedPrivacyPolicy,
      acceptedTerms: consent?.acceptedTerms,
      ...(referralCode ? { referralCode } : {}),
    }),
  });
  return hydrateNativeAuthTokens(response);
}

export interface ReferralStats {
  totalReferrals: number;
  verifiedReferrals: number;
  activeReferrals: number;
  conversionRate: number;
  recentReferrals: Array<{
    id: string;
    username: string;
    displayName: string;
    status: string;
    joinedAt: string;
  }>;
}

export async function getReferralStats(): Promise<ReferralStats> {
  return fetchJson<ReferralStats>(`${API_BASE_URL}/referral/stats`);
}

export async function validateReferralCode(code: string): Promise<{ valid: boolean; displayName?: string }> {
  return fetchJson<{ valid: boolean; displayName?: string }>(`${API_BASE_URL}/referral/validate/${encodeURIComponent(code)}`);
}

export class EmailVerifyError extends Error {
  remainingAttempts: number;
  isLockout: boolean;
  constructor(message: string, remainingAttempts: number, isLockout: boolean) {
    super(message);
    this.remainingAttempts = remainingAttempts;
    this.isLockout = isLockout;
  }
}

export async function verifySignupEmail(_email: string, code: string): Promise<{ message: string }> {
  // email param kept for API compat but server resolves from authenticated session
  const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Verification failed' }));
    const remaining = typeof data.remainingAttempts === 'number' ? data.remainingAttempts : -1;
    const isLockout = response.status === 429 || remaining === 0;
    throw new EmailVerifyError(data.error || 'Verification failed', remaining, isLockout);
  }
  return response.json();
}

export async function resendSignupVerification(email: string): Promise<{ message: string }> {
  return fetchJson(`${API_BASE_URL}/auth/resend-verification`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return fetchJsonPublic(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function forgotUsername(email: string): Promise<{ message: string }> {
  return fetchJsonPublic(`${API_BASE_URL}/auth/forgot-username`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<{ message: string }> {
  return fetchJsonPublic(`${API_BASE_URL}/auth/reset-password`, {
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

export async function getPortfolio(userId?: string, portfolioId?: string): Promise<Portfolio> {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (portfolioId) params.set('portfolioId', portfolioId);
  const qs = params.toString();
  const url = qs ? `${API_BASE_URL}/portfolio?${qs}` : `${API_BASE_URL}/portfolio`;
  return fetchJson<Portfolio>(url);
}

export async function getProjections(
  mode: ProjectionMode = 'sp500',
  lookback: LookbackPeriod = '1y',
  portfolioId?: string
): Promise<ProjectionResponse> {
  const params = new URLSearchParams({ mode });
  if (mode === 'realized') {
    params.append('lookback', lookback);
  }
  if (portfolioId) {
    params.append('portfolioId', portfolioId);
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
  const { portfolioId, ...body } = holding;
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  await fetchJson(`${API_BASE_URL}/portfolio/holdings${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteHolding(ticker: string, portfolioId?: string): Promise<void> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  await fetchJson(`${API_BASE_URL}/portfolio/holdings/${ticker}${qs}`, {
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
export async function getPerformanceSummary(portfolioId?: string): Promise<PerformanceSummary> {
  const url = portfolioId
    ? `${API_BASE_URL}/portfolio/summary?portfolioId=${portfolioId}`
    : `${API_BASE_URL}/portfolio/summary`;
  return fetchJson<PerformanceSummary>(url);
}

// Insights endpoints
export async function getHealthScore(portfolioId?: string): Promise<HealthScore> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<HealthScore>(`${API_BASE_URL}/insights/health${qs}`);
}

export async function getAttribution(window: AttributionWindow = '1d', portfolioId?: string): Promise<Attribution> {
  let url = `${API_BASE_URL}/insights/attribution?window=${window}`;
  if (portfolioId) url += `&portfolioId=${encodeURIComponent(portfolioId)}`;
  return fetchJson<Attribution>(url);
}

export async function getLeakDetector(portfolioId?: string): Promise<LeakDetectorResult> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<LeakDetectorResult>(`${API_BASE_URL}/insights/leak-detector${qs}`);
}

export async function getRiskForecast(portfolioId?: string): Promise<RiskForecast> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<RiskForecast>(`${API_BASE_URL}/insights/risk-forecast${qs}`);
}

export async function getIncomeInsights(window: IncomeWindow = 'today', portfolioId?: string): Promise<IncomeInsightsResponse> {
  let url = `${API_BASE_URL}/insights/income?window=${window}`;
  if (portfolioId) url += `&portfolioId=${encodeURIComponent(portfolioId)}`;
  return fetchJson<IncomeInsightsResponse>(url);
}

export interface YtdDividendEntry {
  dividendEventId: string;
  ticker: string;
  payDate: string;
  amountPerShare: number;
  shares: number;
  income: number;
  dividendType: string;
  dismissed: boolean;
}

export interface YtdDividendBreakdown {
  entries: YtdDividendEntry[];
  totalIncome: number;
  totalDismissed: number;
  netIncome: number;
}

export async function getYtdDividendBreakdown(portfolioId?: string): Promise<YtdDividendBreakdown> {
  let url = `${API_BASE_URL}/insights/income/ytd-breakdown`;
  if (portfolioId) url += `?portfolioId=${encodeURIComponent(portfolioId)}`;
  return fetchJson<YtdDividendBreakdown>(url);
}

export async function dismissDividendEvent(dividendEventId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/insights/income/dismiss-dividend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dividendEventId }),
  });
}

export async function restoreDividendEvent(dividendEventId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/insights/income/restore-dividend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dividendEventId }),
  });
}

export async function getDailyReport(portfolioId?: string): Promise<DailyReportResponse> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<DailyReportResponse>(`${API_BASE_URL}/insights/daily-report${qs}`);
}

export async function regenerateDailyReport(portfolioId?: string): Promise<DailyReportResponse> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<DailyReportResponse>(`${API_BASE_URL}/insights/daily-report/regenerate${qs}`, {
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

export async function getEarningsSummary(portfolioId?: string): Promise<{ results: EarningsSummaryItem[]; partial: boolean }> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<{ results: EarningsSummaryItem[]; partial: boolean }>(`${API_BASE_URL}/insights/earnings-summary${qs}`);
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
  trades?: { date: string; ticker: string; type: string; shares: number; price: number; rowIndex?: number; sourceBroker?: string; rawAction?: string }[];
  ledgerEvents?: { eventType: string; effectiveDate: string; settleDate?: string | null; ticker?: string | null; shares?: number | null; price?: number | null; amount: number; fees?: number; rowIndex?: number; sourceBroker?: string; rawAction?: string }[];
  totalRows: number;
  validRows: number;
  skippedRows: number;
  warning?: string;
  partialHistory?: boolean;
}

export async function uploadPortfolioCsv(file: File): Promise<CsvParseResult> {
  const formData = new FormData();
  formData.append('file', file);
  return fetchFormData<CsvParseResult>(`${API_BASE_URL}/portfolio/import/csv`, formData, 'Upload failed');
}

export async function uploadPortfolioScreenshot(file: File): Promise<CsvParseResult> {
  const formData = new FormData();
  formData.append('file', file);
  return fetchFormData<CsvParseResult>(`${API_BASE_URL}/portfolio/import/screenshot`, formData, 'Screenshot upload failed');
}

// Mapped CSV import (column-mapping wizard)
export interface ColumnMappings {
  ticker: string;
  date?: string;
  price?: string;
  shares?: string;
  totalAmount?: string;
  action?: string;
}

export interface MappedTrade {
  date: string;
  ticker: string;
  type: string;
  shares: number;
  price: number;
  rowIndex: number;
  sourceBroker: string;
  rawAction: string;
}

export interface ImportTelemetry {
  rowsParsed: number;
  rowsSkipped: number;
  skipReasons: Record<string, number>;
  brokerDetected: string | null;
  parseDurationMs: number;
}

export interface MappedCsvResult extends CsvParseResult {
  trades: MappedTrade[];
  telemetry: ImportTelemetry;
  reviewRequired: boolean;
  editableFields: string[];
}

export async function submitMappedCsv(
  file: File,
  mappings: ColumnMappings,
  excludedRows?: number[],
): Promise<MappedCsvResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mappings', JSON.stringify(mappings));
  if (excludedRows && excludedRows.length > 0) {
    formData.append('excludedRows', JSON.stringify(excludedRows));
  }
  formData.append('sourceBroker', 'mapped');
  return fetchFormData<MappedCsvResult>(`${API_BASE_URL}/portfolio/import/csv/mapped`, formData, 'Mapped CSV upload failed');
}

export async function confirmPortfolioImport(
  holdings: { ticker: string; shares: number; averageCost: number }[],
  mode: 'replace' | 'merge' | 'incremental' | 'history',
  trades?: { date: string; ticker: string; type: string; shares: number; price: number; sourceBroker?: string; rawAction?: string }[],
  marginDebt?: number,
  ledgerEvents?: CsvParseResult['ledgerEvents'],
): Promise<{ added: number; updated: number; removed: number; skippedDuplicates?: number; tradesRecorded?: number; ledgerEventsRecorded?: number }> {
  return fetchJson<{ added: number; updated: number; removed: number; skippedDuplicates?: number; tradesRecorded?: number; ledgerEventsRecorded?: number }>(
    `${API_BASE_URL}/portfolio/import/confirm`,
    { method: 'POST', body: JSON.stringify({ holdings, mode, trades, marginDebt, ledgerEvents }) }
  );
}

export async function clearPortfolio(): Promise<{ cleared: boolean; holdingsRemoved: number }> {
  return fetchJson<{ cleared: boolean; holdingsRemoved: number }>(
    `${API_BASE_URL}/portfolio/clear`,
    { method: 'POST', body: JSON.stringify({ confirmation: 'CLEAR' }) }
  );
}

export async function seedSamplePortfolio(): Promise<{ seeded: boolean; holdings: number }> {
  return fetchJson<{ seeded: boolean; holdings: number }>(
    `${API_BASE_URL}/portfolio/seed-sample`,
    { method: 'POST' }
  );
}

// Goals endpoints
export async function getGoals(portfolioId?: string): Promise<Goal[]> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<Goal[]>(`${API_BASE_URL}/goals${qs}`);
}

export async function createGoal(input: GoalInput, portfolioId?: string): Promise<Goal> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<Goal>(`${API_BASE_URL}/goals${qs}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateGoal(id: string, input: Partial<GoalInput>, portfolioId?: string): Promise<Goal> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<Goal>(`${API_BASE_URL}/goals/${id}${qs}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteGoal(id: string, portfolioId?: string): Promise<void> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  await fetchJson(`${API_BASE_URL}/goals/${id}${qs}`, {
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
export async function getCurrentPace(window: PaceWindow = '1M', portfolioId?: string): Promise<CurrentPaceResponse> {
  const params = new URLSearchParams({ window });
  if (portfolioId) {
    params.append('portfolioId', portfolioId);
  }
  return fetchJson<CurrentPaceResponse>(`${API_BASE_URL}/portfolio/projections/current-pace?${params}`);
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
  window: IntelligenceWindow = '1d',
  portfolioId?: string
): Promise<PortfolioIntelligenceResponse> {
  let url = `${API_BASE_URL}/intelligence?window=${window}`;
  if (portfolioId) url += `&portfolioId=${encodeURIComponent(portfolioId)}`;
  return fetchJson<PortfolioIntelligenceResponse>(url);
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

// Username lookup for shareable profile URLs (public, no auth required)
export async function getUserByUsername(username: string): Promise<{ id: string; username: string; displayName: string; profilePublic: boolean } | null> {
  try {
    return await fetchJson<{ id: string; username: string; displayName: string; profilePublic: boolean }>(
      `${API_BASE_URL}/users/by-username/${encodeURIComponent(username)}`
    );
  } catch {
    return null;
  }
}

// Social endpoints
export async function getUserProfile(userId: string, viewerId?: string): Promise<UserProfile> {
  const params = viewerId ? `?viewerId=${viewerId}` : '';
  return fetchJson<UserProfile>(`${API_BASE_URL}/users/${userId}/profile${params}`);
}

export async function deleteActivityEvent(eventId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/social/activity/${eventId}`, { method: 'DELETE' });
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
  ytdBaselineValue?: number | null;
  marginDebt?: number | null;
  annualSalary?: number | null;
  priceSpikePct?: number;
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
  ytdBaselineValue?: number | null;
  marginDebt?: number | null;
  annualSalary?: number | null;
  priceSpikePct?: number;
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

export async function followUser(targetUserId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${targetUserId}/follow`, {
    method: 'POST',
  });
}

export async function unfollowUser(targetUserId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${targetUserId}/follow`, {
    method: 'DELETE',
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

export async function getIntradayCandlesWithPrevClose(ticker: string): Promise<{ candles: IntradayCandle[]; previousClose: number | null }> {
  const resp = await fetchJson<{ ticker: string; candles: IntradayCandle[]; previousClose?: number }>(`${API_BASE_URL}/market/stock/${ticker}/intraday`);
  return { candles: resp.candles, previousClose: resp.previousClose ?? null };
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

export async function getPortfolioChart(period: PortfolioChartPeriod = '1D', userId?: string, portfolioId?: string): Promise<PortfolioChartData> {
  const params = new URLSearchParams({ period });
  if (userId) params.append('userId', userId);
  if (portfolioId) params.append('portfolioId', portfolioId);
  return fetchJson<PortfolioChartData>(`${API_BASE_URL}/portfolio/history/chart?${params}`);
}

export async function getUserChart(userId: string, period: PortfolioChartPeriod = '1D'): Promise<PortfolioChartData> {
  return fetchJson<PortfolioChartData>(`${API_BASE_URL}/users/${userId}/chart?period=${period}`);
}

// Performance comparison endpoint
export async function getPerformance(
  window: PerformanceWindow = '1M',
  benchmark: string = 'SPY',
  portfolioId?: string
): Promise<PerformanceData> {
  let url = `${API_BASE_URL}/portfolio/performance?window=${window}&benchmark=${benchmark}`;
  if (portfolioId) url += `&portfolioId=${portfolioId}`;
  return fetchJson<PerformanceData>(url);
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
  holdingReturns?: Record<string, number>;
}

export async function getPortfolioBriefing(portfolioId?: string, period?: string): Promise<PortfolioBriefingResponse> {
  const params = new URLSearchParams();
  if (portfolioId) params.set('portfolioId', portfolioId);
  if (period) params.set('period', period);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return fetchJson<PortfolioBriefingResponse>(`${API_BASE_URL}/insights/briefing${qs}`);
}

export interface BriefingExplainResponse {
  explanation: string;
  citations: string[];
  cached: boolean;
}

export async function explainBriefingSection(title: string, body: string): Promise<BriefingExplainResponse> {
  return fetchJson<BriefingExplainResponse>(`${API_BASE_URL}/insights/briefing/explain`, {
    method: 'POST',
    body: JSON.stringify({ title, body }),
  });
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

export async function getBehaviorInsights(portfolioId?: string): Promise<BehaviorInsightsResponse> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<BehaviorInsightsResponse>(`${API_BASE_URL}/insights/behavior${qs}`);
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

// Performance Report
export async function getPerformanceReport(period: PerformanceWindow, benchmark: string = 'SPY', theme: 'light' | 'dark' = 'light', portfolioId?: string): Promise<string> {
  let url = `${API_BASE_URL}/portfolio/report?period=${period}&benchmark=${benchmark}&theme=${theme}`;
  if (portfolioId) url += `&portfolioId=${encodeURIComponent(portfolioId)}`;
  const headers: Record<string, string> = {
    'Bypass-Tunnel-Reminder': 'true',
    ...(isNative ? { 'X-Nala-Native': '1' } : {}),
  };
  const doFetch = () => fetch(url, { credentials: 'include', headers });

  let response = await doFetch();
  if (response.status === 401 && !authDead) {
    const refreshed = await refreshOnce();
    if (refreshed) response = await doFetch();
    else throw new ApiError('Session expired', 'SESSION_EXPIRED', 401);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Failed to generate report' }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.text();
}

export async function emailPerformanceReport(period: PerformanceWindow, benchmark: string = 'SPY', theme: 'light' | 'dark' = 'light'): Promise<{ sent: boolean; to: string }> {
  return fetchJson<{ sent: boolean; to: string }>(`${API_BASE_URL}/portfolio/report/email`, {
    method: 'POST',
    body: JSON.stringify({ period, benchmark, theme }),
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
export type MarketIndex = 'SP500' | 'DOW30' | 'NASDAQ100' | 'THEMES' | 'ETF';

export async function getMarketHeatmap(period: HeatmapPeriod = '1D', index?: MarketIndex): Promise<import('./types').HeatmapResponse> {
  const params = new URLSearchParams({ period });
  if (index) params.set('index', index);
  return fetchJson<import('./types').HeatmapResponse>(`${API_BASE_URL}/market/heatmap?${params}`);
}

// Market Sentiment
export interface MarketSentiment {
  score: number;
  label: string;
  signals: Record<string, { value: number; signal: number }>;
  timestamp: string;
}

export async function getMarketSentiment(): Promise<MarketSentiment> {
  return fetchJson<MarketSentiment>(`${API_BASE_URL}/market/sentiment`);
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
  dividendYield: number | null;
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

export async function getDividendGrowthRates(portfolioId?: string): Promise<DividendGrowthResponse> {
  let url = `${API_BASE_URL}/dividends/growth-rates?excludeCurrentYear=true`;
  if (portfolioId) url += `&portfolioId=${encodeURIComponent(portfolioId)}`;
  return fetchJson<DividendGrowthResponse>(url);
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
export async function getTaxHarvestSuggestions(portfolioId?: string): Promise<TaxHarvestResponse | null> {
  try {
    const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
    return await fetchJson<TaxHarvestResponse>(`${API_BASE_URL}/insights/tax-harvest${qs}`);
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
export async function getEtfOverlap(portfolioId?: string): Promise<EtfOverlapResponse | null> {
  try {
    const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
    return await fetchJson<EtfOverlapResponse>(`${API_BASE_URL}/portfolio/etf-overlap${qs}`);
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

// Earnings Preview (Elite)
export interface EarningsPreviewAi {
  whatToWatch: string;
  analystSentiment: string;
  catalysts: string[];
  riskFactors: string[];
}

export interface EarningsPreviewItem {
  ticker: string;
  reportDate: string;
  daysUntil: number;
  estimatedEPS: number | null;
  beatRate: number;
  avgSurprisePct: number;
  currentStreak: { type: 'beat' | 'miss' | 'meet' | 'none'; count: number };
  consistencyScore: number;
  recentQuarters: { fiscalDate: string; reportedDate: string; reportedEPS: number | null; estimatedEPS: number | null; surprise: number | null; surprisePct: number | null; beat: boolean | null }[];
  preview: EarningsPreviewAi | null;
  citations: string[];
  generatedAt: string;
}

export interface EarningsPreviewResponse {
  results: EarningsPreviewItem[];
  partial: boolean;
}

export async function getEarningsPreviews(portfolioId?: string): Promise<EarningsPreviewResponse> {
  const qs = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : '';
  return fetchJson<EarningsPreviewResponse>(`${API_BASE_URL}/insights/earnings-preview${qs}`);
}

// ── Account History ──────────────────────────────────────────────

export interface AccountHistoryEntry {
  id: string;
  source: 'activity' | 'trade' | 'ledger';
  category: 'trade' | 'cash' | 'adjustment';
  type: string;
  ticker: string | null;
  shares: number | null;
  price: number | null;
  amount: number | null;
  date: string;
  description: string;
  sourceBroker: string | null;
}

export async function getAccountHistory(params?: {
  limit?: number;
  cursor?: string;
  category?: string;
  ticker?: string;
}): Promise<{ entries: AccountHistoryEntry[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.category) qs.set('category', params.category);
  if (params?.ticker) qs.set('ticker', params.ticker);
  const query = qs.toString();
  return fetchJson<{ entries: AccountHistoryEntry[]; nextCursor: string | null }>(
    `${API_BASE_URL}/portfolio/account-history${query ? '?' + query : ''}`
  );
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

// Creator Discovery
export interface DiscoverCreatorEntry {
  userId: string;
  username: string;
  displayName: string;
  pitch: string | null;
  pricingCents: number | null;
  subscriberCount: number;
  returnPct: number | null;
  isVerified: boolean;
  isCreator: boolean;
  sectionsUnlocked: string[];
  createdAt: string;
  // Streak data (optional — API may not provide yet)
  rolling5dPct?: number | null;
  streakDays?: number | null;
  dataPointCount?: number;
  lastUpdatedAt?: string | null;
}

export async function discoverCreators(params?: {
  limit?: number;
  cursor?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}): Promise<{ creators: DiscoverCreatorEntry[]; nextCursor: string | null; total: number | null }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.minPrice) qs.set('minPrice', String(params.minPrice));
  if (params?.maxPrice) qs.set('maxPrice', String(params.maxPrice));
  if (params?.search) qs.set('search', params.search);
  const query = qs.toString();
  return fetchJson<{ creators: DiscoverCreatorEntry[]; nextCursor: string | null; total: number }>(
    `${API_BASE_URL}/creator/discover${query ? '?' + query : ''}`
  );
}

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

export interface CreatorSetupStatus {
  hasApplied: boolean;
  hasSetPrice: boolean;
  hasConnectedStripe: boolean;
  hasConfiguredVisibility: boolean;
  status: string | null;
}

export async function getCreatorSetupStatus(): Promise<CreatorSetupStatus> {
  return fetchJson<CreatorSetupStatus>(`${API_BASE_URL}/creator/setup-status`);
}

export async function selfActivateCreator(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`${API_BASE_URL}/creator/self-activate`, {
    method: 'POST',
  });
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

export async function reportUser(
  userId: string,
  reason: string,
  description?: string,
  context?: string
): Promise<{ id: string }> {
  return fetchJson<{ id: string }>(`${API_BASE_URL}/users/${userId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, description, context }),
  });
}

// ── Themes Heatmap ──────────────────────────────────────────────

export async function getThemesHeatmap(period: HeatmapPeriod = '1D'): Promise<import('./types').HeatmapResponse> {
  return fetchJson(`${API_BASE_URL}/market/themes/heatmap?period=${period}`);
}

export async function getEtfHeatmap(period: HeatmapPeriod = '1D'): Promise<import('./types').HeatmapResponse> {
  return fetchJson(`${API_BASE_URL}/market/etf/heatmap?period=${period}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Sector Performance
// ═══════════════════════════════════════════════════════════════════════════

export interface SectorPerformanceItem {
  ticker: string;
  name: string;
  changePercent: number;
  sparkline: number[];
  timestamps: string[];
  lastPrice: number;
  previousClose: number;
}

export interface SectorPerformanceResponse {
  sectors: SectorPerformanceItem[];
  benchmark: {
    ticker: string;
    changePercent: number;
    sparkline: number[];
    timestamps: string[];
  };
  asOf: string;
  period: string;
  error?: string;
}

export async function getSectorPerformance(period: '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' = '1D'): Promise<SectorPerformanceResponse> {
  return fetchJson(`${API_BASE_URL}/market/sectors/performance?period=${period}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Waitlist Admin API
// ═══════════════════════════════════════════════════════════════════════════

export interface WaitlistEntry {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  approvedBy: string | null;
  convertedAt: string | null;
}

export interface WaitlistResponse {
  entries: WaitlistEntry[];
  total: number;
  approved: number;
  pending: number;
}

export async function getWaitlistEntries(status?: string): Promise<WaitlistResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson<WaitlistResponse>(`${API_BASE_URL}/waitlist${qs}`);
}

export async function approveWaitlistEntry(id: string): Promise<{ entry: WaitlistEntry }> {
  return fetchJson<{ entry: WaitlistEntry }>(`${API_BASE_URL}/waitlist/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
  });
}

export async function rejectWaitlistEntry(id: string): Promise<{ entry: WaitlistEntry }> {
  return fetchJson<{ entry: WaitlistEntry }>(`${API_BASE_URL}/waitlist/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
  });
}

export async function resendWaitlistEmail(id: string): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>(`${API_BASE_URL}/waitlist/${encodeURIComponent(id)}/resend`, {
    method: 'POST',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// NALA AI Deep Research
// ═══════════════════════════════════════════════════════════════════════════

export interface DeepResearchReport {
  executiveSummary: string;
  bullCase: string;
  baseCase: string;
  bearCase: string;
  keyRisks: string[];
  keyCatalysts: string[];
  valuation: {
    method: string;
    comparables: string[];
    summary: string;
  };
  citations: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  confidenceNotes: string;
}

export interface DeepResearchJobSummary {
  id: string;
  ticker: string | null;
  prompt: string;
  researchType: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export interface ThinkingSummary {
  text: string;
  timestamp: string;
  index: number;
}

export interface DeepResearchJobStatus {
  id: string;
  status: string;
  researchType: string;
  ticker: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  pollCount: number;
  estimatedTimeRemainingMs: number | null;
  errorMessage: string | null;
  thinkingSummaries: ThinkingSummary[];
}

export interface DeepResearchJobResult {
  id: string;
  status: string;
  ticker: string | null;
  researchType: string;
  report: DeepResearchReport | null;
  resultText: string | null;
  parseError: string | null;
  costTelemetry: {
    inputTokens: number | null;
    outputTokens: number | null;
    searchCalls: number | null;
    costUsdEstimate: number | null;
    modelUsed: string | null;
  };
  completedAt: string | null;
}

export interface DeepResearchListResponse {
  jobs: DeepResearchJobSummary[];
  total: number;
  page: number;
  limit: number;
}

export async function startDeepResearch(
  prompt: string,
  opts?: { ticker?: string; researchType?: string; clientRequestId?: string }
): Promise<{ jobId: string; status: string }> {
  return fetchJson(`${API_BASE_URL}/nala/deep-research/start`, {
    method: 'POST',
    body: JSON.stringify({ prompt, ...opts }),
  });
}

export async function listDeepResearchJobs(
  opts?: { page?: number; limit?: number; status?: string }
): Promise<DeepResearchListResponse> {
  const qs = new URLSearchParams();
  if (opts?.page) qs.set('page', String(opts.page));
  if (opts?.limit) qs.set('limit', String(opts.limit));
  if (opts?.status) qs.set('status', opts.status);
  const query = qs.toString();
  return fetchJson<DeepResearchListResponse>(
    `${API_BASE_URL}/nala/deep-research${query ? '?' + query : ''}`
  );
}

export async function getDeepResearchStatus(jobId: string): Promise<DeepResearchJobStatus> {
  return fetchJson<DeepResearchJobStatus>(
    `${API_BASE_URL}/nala/deep-research/${encodeURIComponent(jobId)}/status`
  );
}

export async function getDeepResearchResult(jobId: string): Promise<DeepResearchJobResult> {
  return fetchJson<DeepResearchJobResult>(
    `${API_BASE_URL}/nala/deep-research/${encodeURIComponent(jobId)}/result`
  );
}

export async function submitDeepResearchFollowUp(
  jobId: string,
  question: string
): Promise<{ jobId: string; status: string }> {
  return fetchJson(`${API_BASE_URL}/nala/deep-research/${encodeURIComponent(jobId)}/followup`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export async function cancelDeepResearch(jobId: string): Promise<{ id: string; status: string }> {
  return fetchJson(`${API_BASE_URL}/nala/deep-research/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}

// ─── Multi-Portfolio Management ─────────────────────────────────────

export interface PortfolioRecord {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  cashBalance: number;
  marginDebt: number;
  dripEnabled: boolean;
  holdingsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePortfolioInput {
  name: string;
  type?: string;
}

export async function listPortfolios(): Promise<PortfolioRecord[]> {
  return fetchJson<PortfolioRecord[]>(`${API_BASE_URL}/portfolios`);
}

export async function createPortfolio(input: CreatePortfolioInput): Promise<PortfolioRecord> {
  return fetchJson<PortfolioRecord>(`${API_BASE_URL}/portfolios`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updatePortfolio(id: string, input: Partial<CreatePortfolioInput>): Promise<PortfolioRecord> {
  return fetchJson<PortfolioRecord>(`${API_BASE_URL}/portfolios/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deletePortfolio(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/portfolios/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function setDefaultPortfolio(id: string): Promise<{ id: string; name: string; isDefault: boolean }> {
  return fetchJson(`${API_BASE_URL}/portfolios/${encodeURIComponent(id)}/default`, {
    method: 'PATCH',
  });
}

// ─── Job Admin ────────────────────────────────────────────────────────────

export type JobAlertSeverity = 'none' | 'warning' | 'critical';
export type JobFailureCategory = 'TRANSIENT' | 'PERMANENT' | 'RATE_LIMITED' | 'DATA_QUALITY' | 'UNKNOWN';

export interface JobMetricsResponse {
  period: { hours: number; since: string };
  runs: {
    total: number;
    running: number;
    success: number;
    failed: number;
    deadLettered: number;
    successRate: number;
    failureRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
  };
  idempotency: { activeKeys: number; duplicateHits: number };
  deadLetters: { unresolved: number };
  jobs: Array<{
    jobName: string;
    total: number;
    success: number;
    failed: number;
    deadLettered: number;
    failureRate: number;
    alertSeverity: JobAlertSeverity;
    alertThresholds: { warning: number; critical: number };
  }>;
}

export interface JobSummaryJob {
  jobName: string;
  runCount: number;
  successCount: number;
  failureCount: number;
  failRatePercent: number;
  lastRun: string | null;
  alertStatus: JobAlertSeverity;
  alertThresholds: { warning: number; critical: number };
  avgDurationMs: number;
  lastError: string | null;
}

export interface JobSummaryResponse {
  generatedAt: string;
  totalJobs: number;
  jobs: JobSummaryJob[];
}

export interface JobStatsResponse {
  summary: {
    totalJobs: number;
    totalRuns: number;
    totalFailed: number;
    totalDeadLettered: number;
    failureRate: string;
    alert: {
      failureRate: number;
      warningThreshold: number;
      criticalThreshold: number;
      severity: JobAlertSeverity;
    };
  };
  jobs: Array<{
    jobName: string;
    total: number;
    success: number;
    failed: number;
    deadLettered: number;
    failureRate: number;
    alertSeverity: JobAlertSeverity;
    alertThresholds: { warning: number; critical: number };
    failureCategories: Record<JobFailureCategory, number>;
    avgDurationMs: number;
    lastRun: string | null;
    lastError: string | null;
  }>;
}

export interface DeadLetterEntry {
  id: string;
  jobName: string;
  error: string;
  attempts: number;
  context: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

export interface DeadLetterPaginatedResponse {
  entries: DeadLetterEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface SnapshotHealthEntry {
  userId: string;
  username: string;
  lastSnapshotAge: number | null;
  snapshotsLast24h: number;
  gapCount: number;
  longestGapMinutes: number;
  status: 'healthy' | 'stale' | 'gaps' | 'critical';
}

export interface StuckJobEntry {
  id: string;
  jobName: string;
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  durationMs: number | null;
}

export interface HealStuckJobsResponse {
  target: 'stuck_jobs';
  dryRun: boolean;
  thresholdMinutes: number;
  wouldHeal?: number;
  healed?: number;
  details?: Array<{ id: string; jobName: string; action: string }>;
  message?: string;
}

export function getJobMetrics(hours = 24): Promise<JobMetricsResponse> {
  return fetchJson<JobMetricsResponse>(`${API_BASE_URL}/health/job-metrics?hours=${hours}`);
}

export function getJobSummary(): Promise<JobSummaryResponse> {
  return fetchJson<JobSummaryResponse>(`${API_BASE_URL}/admin/jobs/summary`);
}

export function getJobStats(jobName?: string): Promise<JobStatsResponse> {
  const qs = jobName ? `?jobName=${encodeURIComponent(jobName)}` : '';
  return fetchJson<JobStatsResponse>(`${API_BASE_URL}/admin/jobs/stats${qs}`);
}

export function getDeadLetterEntries(opts?: { resolved?: boolean; page?: number; pageSize?: number }): Promise<DeadLetterPaginatedResponse> {
  const params = new URLSearchParams();
  if (opts?.resolved) params.set('resolved', 'true');
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
  const qs = params.toString();
  return fetchJson<DeadLetterPaginatedResponse>(`${API_BASE_URL}/admin/jobs/dead-letter${qs ? `?${qs}` : ''}`);
}

export function retryDeadLetterEntry(id: string): Promise<{ retried: boolean; entry: DeadLetterEntry }> {
  return fetchJson(`${API_BASE_URL}/admin/jobs/dead-letter/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
  });
}

export function resolveDeadLetterEntry(id: string): Promise<{ entry: DeadLetterEntry }> {
  return fetchJson(`${API_BASE_URL}/admin/jobs/dead-letter/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
  });
}

export function getSnapshotHealth(): Promise<{ summary: Record<string, number>; reports: SnapshotHealthEntry[] }> {
  return fetchJson(`${API_BASE_URL}/admin/jobs/snapshot-health`);
}

export function getStuckJobs(thresholdMinutes = 30): Promise<{ stuck: StuckJobEntry[]; count: number }> {
  return fetchJson(`${API_BASE_URL}/admin/jobs/stuck?thresholdMinutes=${thresholdMinutes}`);
}

export function healStuckJobs(opts?: { dryRun?: boolean; thresholdMinutes?: number }): Promise<HealStuckJobsResponse> {
  const dryRun = opts?.dryRun ?? true;
  const thresholdMinutes = opts?.thresholdMinutes ?? 30;
  return fetchJson(`${API_BASE_URL}/admin/jobs/heal`, {
    method: 'POST',
    body: JSON.stringify({ target: 'stuck_jobs', dryRun, thresholdMinutes }),
  });
}

export function pruneOldJobRuns(): Promise<{ deleted: number; message: string }> {
  return fetchJson(`${API_BASE_URL}/admin/jobs/prune`, { method: 'POST' });
}

// ═══════════════════════════════════════════════════════════════════════════
// Analytics API
// ═══════════════════════════════════════════════════════════════════════════

export interface AnalyticsDashboardFeature {
  feature: string;
  views: number;
  uniqueUsers: number;
  totalTimeMs: number;
  avgTimeMs: number;
  pctOfTotal: number;
}

export interface AnalyticsDashboardResponse {
  overview: {
    totalEvents: number;
    uniqueUsers: number;
    totalSessions: number;
    avgSessionDurationMs: number;
  };
  featureUsage: AnalyticsDashboardFeature[];
  userEngagement: {
    registeredUsers: number;
    activeUsers: number;
    portfoliosCreated: number;
    holdingsCount: number;
    watchlistsCount: number;
  };
  dauTrend: Array<{ date: string; count: number }>;
}

export function getAnalyticsDashboard(period = '7d'): Promise<AnalyticsDashboardResponse> {
  return fetchJson<AnalyticsDashboardResponse>(`${API_BASE_URL}/admin/analytics/dashboard?period=${encodeURIComponent(period)}`);
}

// ── Congressional Trades (NALA Signals) ────────────────────────

export interface CongressTrade {
  id: string;
  politician: string;
  chamber: string;
  ticker: string;
  transactionType: string;
  amountFrom: number;
  amountTo: number;
  tradeDate: string;
  filingDate: string;
  assetName?: string;
  ownerType?: string;
}

export function getCongressTrades(options?: { ticker?: string; limit?: number; offset?: number }): Promise<{ trades: CongressTrade[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.ticker) params.set('ticker', options.ticker);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  return fetchJson(`${API_BASE_URL}/signals/congress?${params}`);
}

export function getCongressTradesForPortfolio(): Promise<{ trades: CongressTrade[]; total: number; tickers: string[] }> {
  return fetchJson(`${API_BASE_URL}/signals/congress/portfolio`);
}

export function getCongressTradesForTicker(ticker: string): Promise<{ trades: CongressTrade[]; ticker: string }> {
  return fetchJson(`${API_BASE_URL}/signals/congress/ticker/${encodeURIComponent(ticker)}`);
}

export function getCongressStats(): Promise<{ mostBought: { ticker: string; count: number }[]; mostSold: { ticker: string; count: number }[]; topTraders: { politician: string; count: number }[] }> {
  return fetchJson(`${API_BASE_URL}/signals/congress/stats`);
}

// ── Posts API ──────────────────────────────────────────────────

export async function createPost(content: string, ticker?: string, type?: string, attachmentType?: string, attachmentData?: { ticker?: string; period?: string; action?: string; shares?: number; price?: number }): Promise<PostData> {
  return fetchJson<PostData>(`${API_BASE_URL}/posts`, {
    method: 'POST',
    body: JSON.stringify({ content, ticker, type, attachmentType, attachmentData }),
  });
}

export async function getEnhancedFeed(limit?: number, before?: string): Promise<FeedItem[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  const qs = params.toString();
  const data = await fetchJson<{ items: FeedItem[] }>(`${API_BASE_URL}/posts/feed${qs ? `?${qs}` : ''}`);
  return data.items ?? [];
}

export async function getUserPosts(userId: string, limit?: number, before?: string): Promise<PostData[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  const qs = params.toString();
  const data = await fetchJson<{ posts: PostData[] }>(`${API_BASE_URL}/posts/user/${userId}${qs ? `?${qs}` : ''}`);
  return data.posts ?? [];
}

export async function getPost(postId: string): Promise<PostData> {
  return fetchJson<PostData>(`${API_BASE_URL}/posts/${postId}`);
}

export async function deletePost(postId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/posts/${postId}`, { method: 'DELETE' });
}

export async function createComment(postId: string, content: string): Promise<CommentData> {
  return fetchJson<CommentData>(`${API_BASE_URL}/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function getComments(postId: string, limit?: number): Promise<CommentData[]> {
  const qs = limit ? `?limit=${limit}` : '';
  const data = await fetchJson<{ comments: CommentData[] }>(`${API_BASE_URL}/posts/${postId}/comments${qs}`);
  return data.comments ?? [];
}

export async function deleteComment(commentId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/posts/comments/${commentId}`, { method: 'DELETE' });
}

export async function toggleLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  return fetchJson<{ liked: boolean; likeCount: number }>(`${API_BASE_URL}/posts/${postId}/like`, { method: 'POST' });
}

export async function getSocialNotifications(limit?: number): Promise<SocialNotificationData[]> {
  const qs = limit ? `?limit=${limit}` : '';
  const data = await fetchJson<{ notifications: SocialNotificationData[] }>(`${API_BASE_URL}/posts/notifications${qs}`);
  return data.notifications ?? [];
}

export async function getUnreadSocialNotifCount(): Promise<{ count: number }> {
  return fetchJson<{ count: number }>(`${API_BASE_URL}/posts/notifications/unread`);
}

export async function markSocialNotifRead(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/posts/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllSocialNotifsRead(): Promise<void> {
  await fetchJson(`${API_BASE_URL}/posts/notifications/read-all`, { method: 'POST' });
}

export async function getTrendingTickers(): Promise<TrendingTicker[]> {
  const data = await fetchJson<{ tickers: TrendingTicker[] }>(`${API_BASE_URL}/posts/trending-tickers`);
  return data.tickers ?? [];
}

export async function getCommunityTrades(): Promise<{ mostBought: TrendingTicker[]; mostSold: TrendingTicker[] }> {
  return fetchJson<{ mostBought: TrendingTicker[]; mostSold: TrendingTicker[] }>(`${API_BASE_URL}/posts/community-trades`);
}

// ── Billionaire API ───────────────────────────────────────

export async function getBillionaireLeaderboard(): Promise<BillionaireEntry[]> {
  const data = await fetchJson<{ billionaires: BillionaireEntry[] }>(`${API_BASE_URL}/billionaires`);
  return data.billionaires ?? [];
}

export async function getBillionaireProfile(slug: string): Promise<BillionaireProfile> {
  return fetchJson<BillionaireProfile>(`${API_BASE_URL}/billionaires/${slug}`);
}

export async function getBillionaireChart(slug: string, period: string = '1M'): Promise<BillionaireChartData> {
  return fetchJson<BillionaireChartData>(`${API_BASE_URL}/billionaires/${slug}/chart?period=${period}`);
}

export async function getBillionaireMovers(): Promise<BillionaireMovers> {
  return fetchJson<BillionaireMovers>(`${API_BASE_URL}/billionaires/movers`);
}

// ── Portfolio News API ───────────────────────────────────────

export interface PortfolioNewsItem {
  id: number;
  headline: string;
  source: string;
  url: string;
  summary: string;
  image: string;
  datetime: number;
  category: string;
  related: string;
  matchedTickers: string[];
  portfolioRelevance: number;
}

export interface MacroSummary {
  overview: string;
  portfolioImpact: string;
  outlook: string;
  keyThemes: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  citations: string[];
  generatedAt: string;
  cached: boolean;
}

export interface PortfolioNewsResponse {
  items: PortfolioNewsItem[];
  summary?: MacroSummary;
  holdingCount: number;
  tickersFetched: string[];
  generatedAt: string;
}

export async function getPortfolioNews(limit = 30): Promise<PortfolioNewsResponse> {
  return fetchJson<PortfolioNewsResponse>(`${API_BASE_URL}/portfolio/news?limit=${limit}`);
}

// Economic Calendar
export interface EconomicCalendarEvent {
  event: string;
  date: string;
  time: string;
  country: string;
  impact: 'high' | 'medium' | 'low';
  actual?: number;
  estimate?: number;
  previous?: number;
}

export async function getEconomicCalendar(): Promise<{ events: EconomicCalendarEvent[] }> {
  return fetchJsonPublic<{ events: EconomicCalendarEvent[] }>(`${API_BASE_URL}/market/economic-calendar`);
}
