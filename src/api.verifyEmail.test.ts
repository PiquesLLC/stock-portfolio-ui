/**
 * Regression tests for native email verification (iOS Mac/Xcode acceptance gate).
 *
 * Background — the real production failure:
 *   Pressing "Verify" in the iOS simulator with a CORRECT 6-digit OTP returned
 *
 *       403 {"error":"Forbidden: missing Origin header"}
 *
 *   `verifySignupEmail()` was the one authenticated mutation in src/api.ts that
 *   used raw `fetch()` with `credentials: 'include'` instead of the centralized
 *   native transport. On native that means:
 *
 *     - CapacitorHttp (globally enabled in capacitor.config.ts) sends NO Origin
 *       header, but DOES carry the cookie jar set at signup, and
 *     - the request carried neither `Authorization: Bearer …` nor
 *       `X-Nala-Native: 1`.
 *
 *   The backend CSRF middleware (stock-portfolio-api src/app.ts) exempts
 *   Bearer-token requests and `X-Nala-Native: 1` requests, then rejects any
 *   remaining cookie-bearing mutation that has no Origin. The request matched
 *   the reject branch and died in global middleware, BEFORE verifyEmailHandler.
 *
 * The fix routes verifySignupEmail through `authedRequest` — the same transport
 * fetchJson uses — while keeping its own EmailVerifyError mapping, because
 * fetchJson's generic error mapping would discard remainingAttempts/lockout.
 *
 * These tests lock down both halves: the transport (so the 403 cannot return)
 * and the error contract (so the metadata cannot be flattened).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NATIVE_AUTH_STORAGE_KEY = 'nala_native_auth';
const ACCESS_TOKEN = 'native-access-token-abc';
const REFRESH_TOKEN = 'native-refresh-token-xyz';

/** Mutable platform state — flipped per test BEFORE importing src/api.ts. */
const cap = vi.hoisted(() => ({ native: false }));

/** Captures every CapacitorHttp.request() call so we can assert on headers. */
const capHttp = vi.hoisted(() => ({
  request: vi.fn(),
  calls: [] as Array<{ url: string; method?: string; headers?: Record<string, string>; data?: unknown }>,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => cap.native,
    getPlatform: () => (cap.native ? 'ios' : 'web'),
  },
  CapacitorHttp: {
    request: (opts: { url: string; method?: string; headers?: Record<string, string>; data?: unknown }) => {
      capHttp.calls.push(opts);
      return capHttp.request(opts);
    },
  },
}));

/** Queue a single CapacitorHttp response. */
function nativeResponds(status: number, data: unknown): void {
  capHttp.request.mockResolvedValueOnce({ status, data, headers: {}, url: '' });
}

/** Load a fresh copy of src/api.ts under the current platform state. */
async function loadApi() {
  vi.resetModules();
  return import('./api');
}

/** The single CapacitorHttp call made during the test. */
function onlyNativeCall() {
  expect(capHttp.calls).toHaveLength(1);
  return capHttp.calls[0];
}

describe('verifySignupEmail — native transport (403 "missing Origin header" regression)', () => {
  beforeEach(() => {
    cap.native = true;
    capHttp.calls.length = 0;
    capHttp.request.mockReset();
    localStorage.clear();
    // The session signup stored on this device (AuthContext calls
    // setNativeAuthSession with the tokens the backend returns to native).
    localStorage.setItem(
      NATIVE_AUTH_STORAGE_KEY,
      JSON.stringify({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('sends the X-Nala-Native marker (CSRF exemption #2)', async () => {
    nativeResponds(200, { message: 'Email verified' });
    const api = await loadApi();

    await api.verifySignupEmail('qa@example.com', '123456');

    expect(onlyNativeCall().headers?.['X-Nala-Native']).toBe('1');
  });

  it('authenticates with the stored native bearer session (CSRF exemption #1)', async () => {
    nativeResponds(200, { message: 'Email verified' });
    const api = await loadApi();

    await api.verifySignupEmail('qa@example.com', '123456');

    expect(onlyNativeCall().headers?.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('does not depend on an Origin header or cookie-only auth — goes through CapacitorHttp, not raw fetch', async () => {
    // If this ever regresses to raw fetch(), the native request loses BOTH
    // exemption headers and the backend 403s before the handler runs.
    const rawFetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', rawFetch);
    nativeResponds(200, { message: 'Email verified' });
    const api = await loadApi();

    await api.verifySignupEmail('qa@example.com', '123456');

    const call = onlyNativeCall();
    expect(rawFetch).not.toHaveBeenCalled();
    expect(call.url).toContain('/auth/verify-email');
    expect(call.method).toBe('POST');
    // No Origin is sent, and none is needed: the two exemption markers are what
    // carry the request past the CSRF middleware.
    expect(call.headers?.Origin).toBeUndefined();
    expect(call.headers?.['X-Nala-Native']).toBe('1');
    expect(call.headers?.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('sends the OTP as the request body and resolves on success', async () => {
    nativeResponds(200, { message: 'Email verified' });
    const api = await loadApi();

    await expect(api.verifySignupEmail('qa@example.com', '123456')).resolves.toEqual({
      message: 'Email verified',
    });
    expect(onlyNativeCall().data).toEqual({ code: '123456' });
  });

  it('preserves remainingAttempts on an invalid code (not flattened into ApiError)', async () => {
    nativeResponds(400, { error: 'Invalid verification code', remainingAttempts: 3 });
    const api = await loadApi();

    const err = await api.verifySignupEmail('qa@example.com', '000000').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(api.EmailVerifyError);
    expect(err).not.toBeInstanceOf(api.ApiError);
    expect(err).toMatchObject({
      message: 'Invalid verification code',
      remainingAttempts: 3,
      isLockout: false,
    });
  });

  it('treats remainingAttempts === 0 as a lockout', async () => {
    nativeResponds(400, { error: 'Too many attempts', remainingAttempts: 0 });
    const api = await loadApi();

    const err = await api.verifySignupEmail('qa@example.com', '000000').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(api.EmailVerifyError);
    expect(err).toMatchObject({ remainingAttempts: 0, isLockout: true });
  });

  it('treats HTTP 429 as a lockout even without remainingAttempts', async () => {
    nativeResponds(429, { error: 'Too many requests' });
    const api = await loadApi();

    const err = await api.verifySignupEmail('qa@example.com', '000000').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(api.EmailVerifyError);
    expect(err).toMatchObject({ remainingAttempts: -1, isLockout: true });
  });

  it('falls back to a generic message when the error body is unparseable', async () => {
    nativeResponds(500, undefined);
    const api = await loadApi();

    const err = await api.verifySignupEmail('qa@example.com', '123456').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(api.EmailVerifyError);
    expect(err).toMatchObject({ remainingAttempts: -1, isLockout: false });
  });

  // Acceptance criterion 12 — resendSignupVerification already used fetchJson,
  // which routes through the same transport. Pinned so it stays that way.
  it('resendSignupVerification carries the same native markers', async () => {
    nativeResponds(200, { message: 'Sent' });
    const api = await loadApi();

    await api.resendSignupVerification('qa@example.com');

    const call = onlyNativeCall();
    expect(call.url).toContain('/auth/resend-verification');
    expect(call.headers?.['X-Nala-Native']).toBe('1');
    expect(call.headers?.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });
});

describe('verifySignupEmail — web behaviour must not regress', () => {
  beforeEach(() => {
    cap.native = false;
    capHttp.calls.length = 0;
    capHttp.request.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('uses cookie-authenticated fetch with no native headers', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const rawFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ message: 'Email verified' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', rawFetch);
    const api = await loadApi();

    await expect(api.verifySignupEmail('qa@example.com', '123456')).resolves.toEqual({
      message: 'Email verified',
    });

    expect(capHttp.request).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain('/auth/verify-email');
    expect(init?.method).toBe('POST');
    // Cookie auth is still how the browser authenticates this call.
    expect(init?.credentials).toBe('include');
    expect(init?.body).toBe(JSON.stringify({ code: '123456' }));
    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    // The native markers must NOT appear on web — the browser sends a real
    // Origin header and the CSRF middleware validates it against the allowlist.
    expect(headers['X-Nala-Native']).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it('still surfaces remainingAttempts on web', async () => {
    const rawFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Invalid verification code', remainingAttempts: 2 }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', rawFetch);
    const api = await loadApi();

    const err = await api.verifySignupEmail('qa@example.com', '000000').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(api.EmailVerifyError);
    expect(err).toMatchObject({ remainingAttempts: 2, isLockout: false });
  });
});
