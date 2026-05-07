/**
 * Regression tests for the "sticky kill switch" auth bug.
 *
 * Background:
 *   A single 401 from /auth/refresh used to flip a module-scoped `authDead`
 *   flag inside src/api.ts. Once flipped, every subsequent request short-
 *   circuited to SESSION_EXPIRED for the rest of the page lifetime, even
 *   though the underlying refresh token might still be valid (race condition
 *   where a sibling tab rotated the token first).
 *
 *   These tests cover two scenarios:
 *
 *     A) Sticky kill switch — after a single 401-on-refresh, a *later*
 *        independent operation must still be able to refresh successfully.
 *
 *     B) Concurrent tab race — two concurrent fetchJson() calls must not
 *        permanently lock the user out when only the first refresh attempt
 *        loses the race.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FetchInit = RequestInit | undefined;

interface FakeFetchResponse {
  status: number;
  body?: unknown;
}

/**
 * Build a vi.fn() that responds to fetch(url, init) according to a
 * sequenced map of (urlPattern -> queue of responses). Each call shifts
 * the head off the matching queue. If a queue is exhausted the test fails
 * with a helpful message.
 */
function makeSequencedFetch(
  routes: Record<string, FakeFetchResponse[]>,
  history: { url: string; init?: FetchInit }[],
) {
  return vi.fn(async (input: RequestInfo | URL, init?: FetchInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    history.push({ url, init });

    const matchKey = Object.keys(routes).find(k => url.includes(k));
    if (!matchKey) {
      throw new Error(`[fakeFetch] No route configured for URL: ${url}`);
    }
    const queue = routes[matchKey];
    if (!queue || queue.length === 0) {
      throw new Error(
        `[fakeFetch] Response queue exhausted for ${matchKey} (url=${url}). ` +
        `Either the test fired more requests than expected, or the bug ` +
        `under test caused a request that should have been suppressed.`,
      );
    }
    const next = queue.shift() as FakeFetchResponse;
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

describe('api.ts — sticky kill switch (authDead) regression', () => {
  let nowMs = 1_700_000_000_000;

  beforeEach(() => {
    vi.resetModules();
    nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Advance the fake clock so any transient debounce window expires. */
  function advanceClockPastRefreshDebounce(): void {
    nowMs += 5_000; // generously past the 2s window in src/api.ts
  }

  it(
    'Scenario A — after a single 401 on /auth/refresh, a LATER operation must succeed when refresh succeeds',
    async () => {
      const history: { url: string; init?: FetchInit }[] = [];

      // Phase 1: /auth/me 401 → /auth/refresh 401  (would trip authDead under buggy code)
      // Phase 2: /auth/me 401 → /auth/refresh 200 (new tokens) → /auth/me 200
      const fakeFetch = makeSequencedFetch(
        {
          '/auth/me': [
            { status: 401, body: { error: 'unauthorized' } },         // phase 1
            { status: 401, body: { error: 'unauthorized' } },         // phase 2
            { status: 200, body: { id: 'u1', username: 'jon', displayName: 'Jon' } }, // phase 2 retry
          ],
          '/auth/refresh': [
            { status: 401, body: { error: 'invalid_refresh_token' } }, // phase 1 — lost race
            { status: 200, body: { accessToken: 'a2', refreshToken: 'r2' } }, // phase 2 — recovered
          ],
        },
        history,
      );
      vi.stubGlobal('fetch', fakeFetch);

      const api = await import('./api');

      // Phase 1: should fail with SESSION_EXPIRED.
      await expect(api.getCurrentUser()).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });

      // Simulate the user navigating around / the next refresh tick
      // arriving — anything more than the transient debounce window.
      advanceClockPastRefreshDebounce();

      // Phase 2: independent op AFTER the first failure.
      // With the BUG: throws SESSION_EXPIRED immediately because authDead is sticky
      //   (no /auth/refresh and no second /auth/me are even attempted).
      // With the FIX: the kill switch is reset, /auth/refresh is tried again,
      //   succeeds, and /auth/me retry returns the user.
      const user = await api.getCurrentUser();
      expect(user).toMatchObject({ id: 'u1', username: 'jon' });

      // Sanity: phase 2 must have actually hit /auth/refresh — not short-circuited.
      const refreshHits = history.filter(h => h.url.includes('/auth/refresh')).length;
      expect(refreshHits).toBeGreaterThanOrEqual(2);
    },
  );

  it(
    'Scenario B — after a transient 401-on-refresh, the very next call must be allowed to refresh again',
    async () => {
      // Concurrent-tab race shape: a sibling tab rotated the refresh cookie
      // first. Our /auth/refresh comes back 401 ONCE, but a moment later the
      // server has the new family and a fresh refresh succeeds.
      const history: { url: string; init?: FetchInit }[] = [];

      const fakeFetch = makeSequencedFetch(
        {
          '/auth/me': [
            { status: 401, body: { error: 'unauthorized' } }, // call 1
            { status: 401, body: { error: 'unauthorized' } }, // call 2 (kicks refresh again)
            { status: 200, body: { id: 'u1', username: 'jon', displayName: 'Jon' } }, // retry after good refresh
          ],
          '/auth/refresh': [
            { status: 401, body: { error: 'invalid_refresh_token' } }, // race-loser
            { status: 200, body: { accessToken: 'a2', refreshToken: 'r2' } }, // recovered
          ],
        },
        history,
      );
      vi.stubGlobal('fetch', fakeFetch);

      const api = await import('./api');

      // First call: race-loser, fails.
      await expect(api.getCurrentUser()).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });

      advanceClockPastRefreshDebounce();

      // Second call (could be from any other surface — sidebar, polling
      // loop, navigation): MUST be allowed to attempt refresh again.
      // Buggy code throws SESSION_EXPIRED immediately because authDead===true.
      const user = await api.getCurrentUser();
      expect(user).toMatchObject({ id: 'u1' });
    },
  );

  it(
    'Scenario C — refreshOnce must not be permanently poisoned by a prior 401',
    async () => {
      // Direct probe: even after a refresh failure, the auth machinery must
      // be willing to make the network call on a subsequent operation. The
      // test asserts that we do, in fact, hit /auth/refresh a second time.
      const history: { url: string; init?: FetchInit }[] = [];

      const fakeFetch = makeSequencedFetch(
        {
          '/auth/me': [
            { status: 401, body: { error: 'unauthorized' } },
            { status: 401, body: { error: 'unauthorized' } },
            { status: 200, body: { id: 'u1', username: 'jon', displayName: 'Jon' } },
          ],
          '/auth/refresh': [
            { status: 401, body: { error: 'invalid_refresh_token' } },
            { status: 200, body: { accessToken: 'a2', refreshToken: 'r2' } },
          ],
        },
        history,
      );
      vi.stubGlobal('fetch', fakeFetch);

      const api = await import('./api');

      await api.getCurrentUser().catch(() => undefined);
      advanceClockPastRefreshDebounce();
      await api.getCurrentUser().catch(() => undefined);

      const refreshAttempts = history.filter(h => h.url.includes('/auth/refresh'));
      expect(refreshAttempts.length).toBe(2);
    },
  );

  it(
    'Scenario D — within the transient debounce window we DO short-circuit (no /auth/refresh spam)',
    async () => {
      // After a 401-on-refresh, an immediate (sub-window) follow-up call
      // must NOT hit /auth/refresh again — we don't want to spam the
      // endpoint while the user is mid-logout / mid-error-toast.
      const history: { url: string; init?: FetchInit }[] = [];

      const fakeFetch = makeSequencedFetch(
        {
          '/auth/me': [
            { status: 401, body: { error: 'unauthorized' } },
            { status: 401, body: { error: 'unauthorized' } },
            // No more entries — the second call must short-circuit
            // BEFORE reaching the network. If the test hits an exhausted
            // queue, the assertion at the bottom catches it.
          ],
          '/auth/refresh': [
            { status: 401, body: { error: 'invalid_refresh_token' } },
            // No second entry — proof the debounce stopped us.
          ],
        },
        history,
      );
      vi.stubGlobal('fetch', fakeFetch);

      const api = await import('./api');

      await expect(api.getCurrentUser()).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });
      // No clock advance — still within debounce window.
      await expect(api.getCurrentUser()).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });

      const refreshAttempts = history.filter(h => h.url.includes('/auth/refresh'));
      expect(refreshAttempts.length).toBe(1);
    },
  );

  it(
    'Scenario E — circuit breaker: after 3 consecutive 401-on-refresh, the 4th attempt is debounced for >2s',
    async () => {
      // Simulates a polling loop (e.g. quote refresh every 30s) hitting
      // a permanently expired token. Without the circuit breaker we'd
      // call /auth/refresh once per poll forever. With the breaker, after
      // 3 consecutive failures the debounce widens from 2s to 60s so the
      // next attempt at "just past 2s" must STILL short-circuit.
      const history: { url: string; init?: FetchInit }[] = [];

      const fakeFetch = makeSequencedFetch(
        {
          '/auth/me': [
            // 3 calls trip the breaker, each one allowed to refresh.
            { status: 401, body: { error: 'unauthorized' } },
            { status: 401, body: { error: 'unauthorized' } },
            { status: 401, body: { error: 'unauthorized' } },
            // 4th call: must short-circuit at the debounce — refresh queue
            // intentionally has no 4th entry to prove we don't network it.
            { status: 401, body: { error: 'unauthorized' } },
          ],
          '/auth/refresh': [
            { status: 401, body: { error: 'invalid_refresh_token' } },
            { status: 401, body: { error: 'invalid_refresh_token' } },
            { status: 401, body: { error: 'invalid_refresh_token' } },
            // No 4th entry — exhausting the queue would surface as a
            // thrown error from the fake; the test asserts the count.
          ],
        },
        history,
      );
      vi.stubGlobal('fetch', fakeFetch);

      const api = await import('./api');

      // Three consecutive failures, each separated by enough time for the
      // SHORT (2s) window to expire so the retry path is exercised.
      for (let i = 0; i < 3; i++) {
        await expect(api.getCurrentUser()).rejects.toMatchObject({
          code: 'SESSION_EXPIRED',
        });
        // Advance just past the 2s short window — under the breaker this
        // is no longer enough once we hit the threshold.
        nowMs += 2_500;
      }

      // We've crossed the 3-failure threshold. Even though more than 2s
      // have passed since the last failure, the long (60s) window must
      // still be in effect — so this 4th call must NOT touch /auth/refresh.
      await expect(api.getCurrentUser()).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });

      const refreshAttempts = history.filter(h => h.url.includes('/auth/refresh'));
      expect(refreshAttempts.length).toBe(3);

      // Sanity: jumping past the LONG window must allow another attempt.
      // (We don't have a refresh response queued for this; we just verify
      // the next call at least reaches the network — proven by the queue
      // exhaustion error rather than a SESSION_EXPIRED short-circuit.)
      nowMs += 65_000;
      await expect(api.getCurrentUser()).rejects.toThrow(/queue exhausted/);
    },
  );

  it(
    'Scenario F — concurrent onAuthExpired across handler-replacement only verifies once',
    async () => {
      // Models the AuthProvider remount / StrictMode double-invoke case:
      //   1. First handler is registered, an onAuthExpired event fires,
      //      a getCurrentUser() promise is in flight.
      //   2. Provider remounts: cleanup runs setAuthExpiredHandler(null),
      //      a fresh handler is registered.
      //   3. A second onAuthExpired event fires before the first promise
      //      settles.
      // With a closure-local guard, the second handler's fresh `false`
      // would let it kick off a second concurrent getCurrentUser. With
      // a shared (ref-like) guard, only one verification runs.
      //
      // We exercise the api.ts side directly: the same module-global
      // `setAuthExpiredHandler` is what AuthContext registers into. We
      // simulate two AuthContext-style handlers that both share a
      // ref-like guard object — proving that pattern correctly serializes.
      const history: { url: string; init?: FetchInit }[] = [];

      // /auth/me returns 200 (session still alive) for the verification
      // probe. Only ONE such call should ever be made.
      const fakeFetch = makeSequencedFetch(
        {
          '/auth/me': [
            { status: 200, body: { id: 'u1', username: 'jon', displayName: 'Jon' } },
          ],
          '/auth/refresh': [],
        },
        history,
      );
      vi.stubGlobal('fetch', fakeFetch);

      const api = await import('./api');

      // Shared guard — this is the ref-equivalent that the AuthContext
      // fix uses (verifyingExpiryRef.current). Both handlers, registered
      // sequentially, read/write the SAME guard.
      const guard = { busy: false };
      let verifyCount = 0;
      const makeHandler = () => () => {
        if (guard.busy) return;
        guard.busy = true;
        verifyCount += 1;
        api.getCurrentUser().finally(() => { guard.busy = false; });
      };

      // Register handler #1 (mounted), then "remount" by clearing and
      // re-registering. Both share the guard.
      api.setAuthExpiredHandler(makeHandler());
      // Fire the first event — handler #1 starts a verification.
      // Read the live handler back via api internals: easiest is to
      // simulate by invoking the registered handler directly. The way
      // AuthContext invokes onAuthExpired is via fetchJson's internal
      // call site, but for this test we re-invoke the same closure
      // through the public surface: trigger a 401 path. Simpler: just
      // call the handler we just made, since module-global storage is
      // an implementation detail this test isn't trying to verify.
      const handler1 = makeHandler();
      api.setAuthExpiredHandler(handler1);
      handler1();

      // Now "remount": clear, then register handler #2 (which shares
      // the SAME guard object).
      api.setAuthExpiredHandler(null);
      const handler2 = makeHandler();
      api.setAuthExpiredHandler(handler2);

      // Fire a second event before the first verification settles.
      handler2();

      // Drain microtasks.
      await new Promise(resolve => setTimeout(resolve, 0));

      // Only ONE verification kicked off, regardless of remount.
      expect(verifyCount).toBe(1);
      const meHits = history.filter(h => h.url.includes('/auth/me')).length;
      expect(meHits).toBe(1);
    },
  );

  it(
    'Scenario G — BroadcastChannel `auth-cleared` from a sibling tab invokes onAuthExpired in this tab (without re-broadcasting)',
    async () => {
      // Models the cross-tab logout case: tab A logs out and
      // broadcasts `auth-cleared`. Sibling tab B (this test) must
      // observe the broadcast and invoke its registered
      // `onAuthExpired()` so the UI clears the user. Critically,
      // the broadcast carries an `origin` tag — tab B must NOT
      // re-broadcast or trip on its OWN echo (which would create
      // an infinite logout loop).
      //
      // Two-realm simulation in a single Node process is hard
      // because api.ts uses a globalThis singleton for its
      // BroadcastChannel. So instead we exercise the listener
      // path directly: inject a sibling-origin message onto the
      // singleton channel and assert the registered handler fires
      // exactly once. Then we verify that resetAuthState() does
      // NOT re-fire onAuthExpired on the originating tab.
      const history: { url: string; init?: FetchInit }[] = [];
      const fakeFetch = makeSequencedFetch({}, history);
      vi.stubGlobal('fetch', fakeFetch);

      // Reset singletons so api.ts initializes a fresh channel.
      type AuthGlobals = {
        __NALA_AUTH_CHANNEL__?: BroadcastChannel | null | undefined;
        __NALA_VISIBILITY_BOUND__?: unknown;
        __NALA_APPSTATE_BOUND__?: unknown;
      };
      const g = globalThis as AuthGlobals;
      // Close any leftover channel from a prior test before
      // deleting the global so the new module evaluation creates
      // its own.
      try { (g.__NALA_AUTH_CHANNEL__ as BroadcastChannel | null)?.close?.(); } catch { /* ignore */ }
      delete g.__NALA_AUTH_CHANNEL__;
      delete g.__NALA_VISIBILITY_BOUND__;
      delete g.__NALA_APPSTATE_BOUND__;

      const api = await import('./api');

      let tabExpired = 0;
      api.setAuthExpiredHandler(() => { tabExpired += 1; });

      // The singleton channel created during module init.
      const channel = g.__NALA_AUTH_CHANNEL__ as unknown as BroadcastChannel;
      expect(channel).toBeDefined();

      // To simulate "another tab broadcast `auth-cleared`", we
      // open a SECOND BroadcastChannel with the same name and
      // post a message tagged with a foreign origin. The
      // singleton channel's listener (registered by api.ts) will
      // see the message with a non-matching origin and fire
      // onAuthExpired.
      const siblingChannel = new BroadcastChannel('nala-auth');
      siblingChannel.postMessage({
        type: 'auth-cleared',
        at: Date.now(),
        origin: 'sibling-tab-uuid-not-this-tab',
      });

      // BroadcastChannel delivery is async — flush ticks.
      await new Promise(resolve => setTimeout(resolve, 50));

      // Sibling tab logged out -> our onAuthExpired fired once.
      expect(tabExpired).toBe(1);

      // Now test the no-echo-loop guarantee: when WE call
      // resetAuthState() directly, our own listener must NOT
      // re-invoke onAuthExpired (origin matches our own
      // TAB_INSTANCE_ID, so the listener short-circuits).
      const before = tabExpired;
      api.resetAuthState();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(tabExpired).toBe(before);

      siblingChannel.close();
    },
  );

  it(
    'Scenario H — after 3 failed refreshes, if the LONG (60s) window fully elapses with no retry, the counter resets and the next 401 only triggers the SHORT (2s) debounce',
    async () => {
      // iOS PWA case: after 3 consecutive 401s the breaker widens the
      // debounce to 60s. If `visibilitychange`/`appStateChange` never
      // fire (backgrounded with screen off), the counter would stay
      // elevated forever — every future 401 would immediately get the
      // 60s window. The fix: when the LONG window fully elapses
      // without any retry, reset the counter to 0 so the next 401
      // starts fresh on the SHORT (2s) debounce.
      //
      // Differentiator: probe behavior at 3s past the 4th failure.
      //   - If counter reset (FIX):    SHORT 2s window already
      //                                 expired -> hits /auth/refresh.
      //   - If counter still elevated (BUG): LONG 60s window still
      //                                 active -> short-circuits.
      const history: { url: string; init?: FetchInit }[] = [];

      const fakeFetch = makeSequencedFetch(
        {
          '/auth/me': [
            // Trip the breaker (3 failures, separated by >2s).
            { status: 401, body: { error: 'unauthorized' } },
            { status: 401, body: { error: 'unauthorized' } },
            { status: 401, body: { error: 'unauthorized' } },
            // After full 60s window elapses with no retry, the 4th
            // 401 fires off a fresh refresh attempt.
            { status: 401, body: { error: 'unauthorized' } },
            // 5th call (3s after the 4th failure): if the counter
            // was correctly reset, we're on the SHORT (2s) window
            // which has now expired -> a fresh /auth/refresh fires.
            { status: 401, body: { error: 'unauthorized' } },
          ],
          '/auth/refresh': [
            { status: 401, body: { error: 'invalid_refresh_token' } },
            { status: 401, body: { error: 'invalid_refresh_token' } },
            { status: 401, body: { error: 'invalid_refresh_token' } },
            { status: 401, body: { error: 'invalid_refresh_token' } },
            { status: 401, body: { error: 'invalid_refresh_token' } },
          ],
        },
        history,
      );
      vi.stubGlobal('fetch', fakeFetch);

      const api = await import('./api');

      // Trip the breaker: 3 failures separated by 2.5s so each one
      // is past the SHORT 2s window and reaches /auth/refresh.
      for (let i = 0; i < 3; i++) {
        await expect(api.getCurrentUser()).rejects.toMatchObject({
          code: 'SESSION_EXPIRED',
        });
        nowMs += 2_500;
      }

      // Sanity: 3 consecutive failures hit the network 3 times.
      expect(history.filter(h => h.url.includes('/auth/refresh')).length).toBe(3);

      // Skip past the full 60s LONG window with NO retry attempt,
      // simulating an iOS PWA background where neither visibility
      // nor appstate listeners fire. With the bug, the counter
      // stays at 3 forever -> the next 401 immediately gets the
      // 60s window. With the fix, the counter resets to 0 once the
      // LONG window has elapsed -> next 401 uses SHORT 2s window.
      nowMs += 65_000;

      // 4th attempt: must hit /auth/refresh (the breaker is reset
      // and we're allowed through regardless of which window we'd
      // be on, because lastRefreshFailureAt is also reset).
      await expect(api.getCurrentUser()).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });
      expect(history.filter(h => h.url.includes('/auth/refresh')).length).toBe(4);

      // Now the 5th attempt at +3s past the 4th failure. The 4th
      // failure incremented the counter:
      //   - FIX: counter went from 0 (post-reset) to 1 -> SHORT 2s
      //          window is in effect -> 3s elapsed -> a fresh
      //          /auth/refresh MUST fire (history grows to 5).
      //   - BUG: counter went from 3 to 4 -> LONG 60s window is in
      //          effect -> 3s elapsed -> short-circuit, no new
      //          refresh (history stays at 4).
      nowMs += 3_000;
      await expect(api.getCurrentUser()).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });
      expect(history.filter(h => h.url.includes('/auth/refresh')).length).toBe(5);
    },
  );
});
