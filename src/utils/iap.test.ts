import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Apple StoreKit client behaviour.
 *
 * The rule under test throughout: StoreKit proves a purchase happened, the
 * backend decides entitlement. Most of these tests exist to prove a *negative*
 * — that we do not acknowledge, do not unlock, and do not choose.
 */

const { mockPlugin, platformState } = vi.hoisted(() => ({
  mockPlugin: {
    getProducts: vi.fn(),
    purchaseProduct: vi.fn(),
    acknowledgePurchase: vi.fn(),
    restorePurchases: vi.fn(),
    getPurchases: vi.fn(),
    manageSubscriptions: vi.fn(),
    addListener: vi.fn(),
  },
  platformState: { isNative: true, platform: 'ios' },
}));

vi.mock('@capgo/native-purchases', () => ({
  NativePurchases: mockPlugin,
  PURCHASE_TYPE: { INAPP: 'inapp', SUBS: 'subs' },
}));

vi.mock('./platform', () => ({
  get isNative() { return platformState.isNative; },
  get platform() { return platformState.platform; },
  isNativePlatform: () => platformState.isNative,
}));

vi.mock('../api', () => ({
  getApplePurchaseContext: vi.fn(),
  verifyApplePurchase: vi.fn(),
  restoreApplePurchases: vi.fn(),
}));

import {
  getProducts,
  purchaseProduct,
  restorePurchases,
  submitTransaction,
  startAppleTransactionListeners,
  stopAppleTransactionListeners,
  recoverUnverifiedPurchases,
  openManageSubscriptions,
  isIAPAvailable,
  __resetAppleIapState,
  PRODUCT_IDS,
  MAX_RESTORE_TRANSACTIONS,
} from './iap';
import { getApplePurchaseContext, verifyApplePurchase, restoreApplePurchases } from '../api';

const TOKEN = '3f1b7c2e-8a4d-4f6b-9c1e-2d5a7b8c9e01';

const httpError = (status: number, code?: string) => {
  const e = new Error(code ?? `HTTP ${status}`) as Error & { status: number; code?: string };
  e.status = status;
  if (code) e.code = code;
  return e;
};

const txn = (over: Partial<Record<string, unknown>> = {}) => ({
  transactionId: '2000001043762129',
  productIdentifier: 'nala_pro_monthly',
  jwsRepresentation: 'jws.signed.payload',
  purchaseDate: '2026-08-01T00:00:00Z',
  willCancel: null,
  ...over,
}) as never;

beforeEach(() => {
  vi.clearAllMocks();
  __resetAppleIapState();
  platformState.isNative = true;
  platformState.platform = 'ios';
  (getApplePurchaseContext as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, appAccountToken: TOKEN });
  (verifyApplePurchase as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 'pending' });
  (restoreApplePurchases as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 'pending' });
  mockPlugin.purchaseProduct.mockResolvedValue(txn());
  mockPlugin.acknowledgePurchase.mockResolvedValue(undefined);
  mockPlugin.restorePurchases.mockResolvedValue(undefined);
  mockPlugin.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
  mockPlugin.manageSubscriptions.mockResolvedValue(undefined);
  mockPlugin.getProducts.mockResolvedValue({
    products: PRODUCT_IDS.map((id) => ({
      identifier: id, title: id, description: 'd', price: 9.99,
      priceString: '£9.99', currencyCode: 'GBP',
    })),
  });
  mockPlugin.getPurchases.mockResolvedValue({ purchases: [] });
});

describe('purchase context', () => {
  it('is requested immediately before every purchase and never cached', async () => {
    await purchaseProduct('nala_pro_monthly');
    await purchaseProduct('nala_pro_yearly');
    expect(getApplePurchaseContext).toHaveBeenCalledTimes(2);
  });

  it('passes the SERVER token to StoreKit, byte for byte', async () => {
    await purchaseProduct('nala_pro_monthly');
    expect(mockPlugin.purchaseProduct).toHaveBeenCalledWith(
      expect.objectContaining({ appAccountToken: TOKEN }),
    );
  });

  it('refuses a token that is not syntactically a UUID', async () => {
    (getApplePurchaseContext as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, appAccountToken: 'user-42' });
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'unexpected-response' });
    expect(mockPlugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it.each([
    ['ok missing', { appAccountToken: TOKEN }],
    ['ok false', { ok: false, appAccountToken: TOKEN }],
    ['token missing', { ok: true }],
    ['empty body', {}],
  ])('never opens StoreKit when the success body is not the contract (%s)', async (_l, body) => {
    (getApplePurchaseContext as ReturnType<typeof vi.fn>).mockResolvedValue(body);
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'unexpected-response' });
    expect(mockPlugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it('never opens StoreKit when the rollout is disabled (503)', async () => {
    (getApplePurchaseContext as ReturnType<typeof vi.fn>).mockRejectedValue(httpError(503, 'apple_iap_disabled'));
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'iap-disabled' });
    expect(mockPlugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it('never opens StoreKit when the worker is unavailable (503)', async () => {
    (getApplePurchaseContext as ReturnType<typeof vi.fn>).mockRejectedValue(httpError(503, 'apple_worker_unavailable'));
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'worker-unavailable' });
    expect(mockPlugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it('never opens StoreKit on a Stripe rail conflict (409), and offers no Stripe fallback', async () => {
    (getApplePurchaseContext as ReturnType<typeof vi.fn>).mockRejectedValue(httpError(409, 'billing_rail_conflict'));
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'billing-rail-conflict' });
    expect(mockPlugin.purchaseProduct).not.toHaveBeenCalled();
  });
});

describe('purchase', () => {
  it('buys as a subscription with automatic acknowledgement DISABLED', async () => {
    await purchaseProduct('nala_pro_monthly');
    expect(mockPlugin.purchaseProduct).toHaveBeenCalledWith({
      productIdentifier: 'nala_pro_monthly',
      productType: 'subs',
      appAccountToken: TOKEN,
      autoAcknowledgePurchases: false,
    });
  });

  it('sends only the JWS to the backend — no plan, expiry or ownership claim', async () => {
    await purchaseProduct('nala_pro_monthly');
    expect(verifyApplePurchase).toHaveBeenCalledWith('jws.signed.payload');
    expect(verifyApplePurchase).toHaveBeenCalledTimes(1);
  });

  it('acknowledges only after the backend durably accepts (202)', async () => {
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'accepted' });
    expect(mockPlugin.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: '2000001043762129' });
  });

  it('does NOT acknowledge when StoreKit returned no JWS', async () => {
    mockPlugin.purchaseProduct.mockResolvedValue(txn({ jwsRepresentation: undefined }));
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'missing-jws' });
    expect(verifyApplePurchase).not.toHaveBeenCalled();
    expect(mockPlugin.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it.each([
    ['transient verification (503)', httpError(503), 'verification-pending'],
    ['permanent verification (400)', httpError(400), 'verification-failed'],
    ['ownership conflict (409)', httpError(409, 'apple_ownership_conflict'), 'ownership-conflict'],
    ['server error (500)', httpError(500), 'unknown'],
  ])('leaves the transaction UNFINISHED on %s', async (_label, err, reason) => {
    (verifyApplePurchase as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason });
    expect(mockPlugin.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it('finishes but grants nothing on a POST-CHARGE billing rail conflict', async () => {
    (verifyApplePurchase as ReturnType<typeof vi.fn>).mockRejectedValue(httpError(409, 'billing_rail_conflict'));
    const result = await purchaseProduct('nala_pro_monthly');
    // Apple already took the money and the backend already enqueued it, so the
    // transaction is finished — but the outcome is not "accepted".
    expect(result).toEqual({ status: 'charged-conflict' });
    expect(mockPlugin.acknowledgePurchase).toHaveBeenCalledTimes(1);
  });

  /**
   * Finishing is irreversible. Only the exact billing_rail_conflict code earns
   * it, because only that backend path guarantees the purchase was durably
   * enqueued first. Everything else must fail CLOSED.
   */
  it.each([
    ['409 with no code at all', httpError(409)],
    ['409 with an unrecognised code', httpError(409, 'some_future_conflict')],
    ['409 with an empty code', httpError(409, '')],
  ])('does NOT finish on %s', async (_label, err) => {
    (verifyApplePurchase as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'unknown' });
    expect(mockPlugin.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it.each([
    ['ok missing', { status: 'pending' }],
    ['ok false', { ok: false, status: 'pending' }],
    ['status missing', { ok: true }],
    ['unexpected status', { ok: true, status: 'activated' }],
    ['empty body', {}],
    ['null body', null],
  ])('does NOT finish when a 2xx body is not the contract (%s)', async (_label, body) => {
    (verifyApplePurchase as ReturnType<typeof vi.fn>).mockResolvedValue(body);
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'unexpected-response' });
    expect(mockPlugin.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it('treats closing the sheet as a cancellation, not a failure', async () => {
    mockPlugin.purchaseProduct.mockRejectedValue(new Error('User cancelled'));
    const result = await purchaseProduct('nala_pro_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'cancelled' });
    expect(verifyApplePurchase).not.toHaveBeenCalled();
  });

  it('refuses an unknown product id outright', async () => {
    const result = await purchaseProduct('nala_ultra_monthly');
    expect(result).toEqual({ status: 'failed', reason: 'product-unavailable' });
    expect(getApplePurchaseContext).not.toHaveBeenCalled();
    expect(mockPlugin.purchaseProduct).not.toHaveBeenCalled();
  });
});

describe('crash recovery', () => {
  it('registers each StoreKit listener exactly once, even if started twice', async () => {
    await startAppleTransactionListeners(() => {});
    await startAppleTransactionListeners(() => {});
    const events = mockPlugin.addListener.mock.calls.map((c) => c[0]);
    expect(events).toEqual(['transactionUpdated', 'transactionVerificationFailed']);
  });

  it('submits a redelivered transaction and acknowledges it once accepted', async () => {
    const onAccepted = vi.fn();
    await startAppleTransactionListeners(onAccepted);
    const handler = mockPlugin.addListener.mock.calls.find((c) => c[0] === 'transactionUpdated')![1];

    handler(txn({ transactionId: '999' }));
    await vi.waitFor(() => expect(onAccepted).toHaveBeenCalled());
    expect(verifyApplePurchase).toHaveBeenCalledWith('jws.signed.payload');
    expect(mockPlugin.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: '999' });
  });

  it('does not acknowledge a redelivered transaction the backend rejected transiently', async () => {
    (verifyApplePurchase as ReturnType<typeof vi.fn>).mockRejectedValue(httpError(503));
    const outcome = await submitTransaction(txn({ transactionId: '777' }));
    expect(outcome).toEqual({ status: 'failed', reason: 'verification-pending' });
    expect(mockPlugin.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it('never calls purchase-context for an already-charged transaction', async () => {
    await submitTransaction(txn({ transactionId: '555' }));
    expect(getApplePurchaseContext).not.toHaveBeenCalled();
  });

  it('cannot process the same transaction twice concurrently', async () => {
    let release: (v: unknown) => void = () => {};
    (verifyApplePurchase as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => { release = resolve; }),
    );

    const a = submitTransaction(txn({ transactionId: '424242' }));
    const b = submitTransaction(txn({ transactionId: '424242' }));
    release({ ok: true, status: 'pending' });
    const [ra, rb] = await Promise.all([a, b]);

    expect(verifyApplePurchase).toHaveBeenCalledTimes(1);
    expect(mockPlugin.acknowledgePurchase).toHaveBeenCalledTimes(1);
    expect(ra).toEqual({ status: 'accepted' });
    expect(rb).toEqual({ status: 'accepted' });
  });

  it('retries safely after a restart — the dedupe is not durable state', async () => {
    await submitTransaction(txn({ transactionId: '313' }));
    expect(verifyApplePurchase).toHaveBeenCalledTimes(1);

    __resetAppleIapState();          // simulates a fresh app launch
    await submitTransaction(txn({ transactionId: '313' }));
    expect(verifyApplePurchase).toHaveBeenCalledTimes(2);
  });

  it('retries a previously FAILED transaction within the same session', async () => {
    (verifyApplePurchase as ReturnType<typeof vi.fn>).mockRejectedValueOnce(httpError(503));
    await submitTransaction(txn({ transactionId: '616' }));
    await submitTransaction(txn({ transactionId: '616' }));
    expect(verifyApplePurchase).toHaveBeenCalledTimes(2);
  });
});

describe('restore', () => {
  const purchase = (over: Record<string, unknown> = {}) => ({
    transactionId: '1', productIdentifier: 'nala_pro_monthly',
    jwsRepresentation: 'jws-a', willCancel: null, purchaseDate: '2026-01-01T00:00:00Z', ...over,
  });

  it('asks StoreKit to restore, then reads subscriptions WITHOUT an account-token filter', async () => {
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase()] });
    await restorePurchases();

    expect(mockPlugin.restorePurchases).toHaveBeenCalledTimes(1);
    expect(mockPlugin.getPurchases).toHaveBeenCalledWith({ productType: 'subs' });
    // A token filter would drop legacy tokenless purchases — the very ones
    // restore exists to recover.
    expect(mockPlugin.getPurchases.mock.calls[0][0]).not.toHaveProperty('appAccountToken');
  });

  it('sends EVERY qualifying JWS, not the newest or the longest-lived', async () => {
    mockPlugin.getPurchases.mockResolvedValue({
      purchases: [
        purchase({ transactionId: '1', jwsRepresentation: 'jws-old', expirationDate: '2020-01-01T00:00:00Z', isActive: false }),
        purchase({ transactionId: '2', jwsRepresentation: 'jws-new', expirationDate: '2099-01-01T00:00:00Z', isActive: true }),
        purchase({ transactionId: '3', jwsRepresentation: 'jws-mid', productIdentifier: 'nala_elite_yearly' }),
      ],
    });
    const result = await restorePurchases();
    expect(restoreApplePurchases).toHaveBeenCalledWith(['jws-old', 'jws-new', 'jws-mid']);
    expect(result.status).toBe('pending');
  });

  it('is unaffected by array order — reversing the input sends the same set', async () => {
    const forward = [purchase({ transactionId: '1', jwsRepresentation: 'a' }), purchase({ transactionId: '2', jwsRepresentation: 'b' })];
    mockPlugin.getPurchases.mockResolvedValue({ purchases: forward });
    await restorePurchases();
    const first = [...((restoreApplePurchases as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[])].sort();

    vi.clearAllMocks();
    __resetAppleIapState();
    (restoreApplePurchases as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 'pending' });
    mockPlugin.restorePurchases.mockResolvedValue(undefined);
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [...forward].reverse() });
    await restorePurchases();
    const second = [...((restoreApplePurchases as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[])].sort();

    expect(second).toEqual(first);
  });

  it('ignores products that are not ours', async () => {
    mockPlugin.getPurchases.mockResolvedValue({
      purchases: [purchase({ productIdentifier: 'some_other_app_sub', jwsRepresentation: 'nope' }), purchase({ jwsRepresentation: 'ours' })],
    });
    await restorePurchases();
    expect(restoreApplePurchases).toHaveBeenCalledWith(['ours']);
  });

  it('refuses to truncate above the backend cap instead of slicing', async () => {
    mockPlugin.getPurchases.mockResolvedValue({
      purchases: Array.from({ length: MAX_RESTORE_TRANSACTIONS + 1 }, (_, i) =>
        purchase({ transactionId: String(i), jwsRepresentation: `jws-${i}` })),
    });
    const result = await restorePurchases();
    expect(result.status).toBe('too-many');
    expect(restoreApplePurchases).not.toHaveBeenCalled();
  });

  it('sends exactly the cap without complaint', async () => {
    mockPlugin.getPurchases.mockResolvedValue({
      purchases: Array.from({ length: MAX_RESTORE_TRANSACTIONS }, (_, i) =>
        purchase({ transactionId: String(i), jwsRepresentation: `jws-${i}` })),
    });
    const result = await restorePurchases();
    expect(result.status).toBe('pending');
    expect((restoreApplePurchases as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(MAX_RESTORE_TRANSACTIONS);
  });

  it('does not turn "we could not verify" into "you have no purchases"', async () => {
    mockPlugin.getPurchases.mockResolvedValue({
      purchases: [purchase({ jwsRepresentation: undefined })],
    });
    const result = await restorePurchases();
    expect(result.status).toBe('incomplete');
    expect(result.status).not.toBe('no-restorable-purchases');
  });

  it('reports incomplete when only SOME recognised purchases carry a JWS', async () => {
    mockPlugin.getPurchases.mockResolvedValue({
      purchases: [purchase({ transactionId: '1', jwsRepresentation: 'ok' }), purchase({ transactionId: '2', jwsRepresentation: undefined })],
    });
    const result = await restorePurchases();
    expect(restoreApplePurchases).toHaveBeenCalledWith(['ok']);
    expect(result.status).toBe('incomplete');
  });

  it('passes a backend "no restorable purchases" through without inventing a plan', async () => {
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase()] });
    (restoreApplePurchases as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 'no-restorable-purchases' });
    const result = await restorePurchases();
    expect(result).toEqual({ status: 'no-restorable-purchases', queued: false, count: 0 });
    expect(JSON.stringify(result)).not.toContain('free');
  });

  /**
   * "I checked everything and found nothing" is a different statement from
   * "I could not check everything". A purchase with no JWS was never checkable,
   * so the backend's answer about the REST cannot be reported as complete.
   */
  it('never reports "no purchases" when a recognised purchase was unverifiable', async () => {
    mockPlugin.getPurchases.mockResolvedValue({
      purchases: [
        purchase({ transactionId: '1', jwsRepresentation: 'jws-a' }),
        purchase({ transactionId: '2', jwsRepresentation: undefined }),
      ],
    });
    (restoreApplePurchases as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 'no-restorable-purchases' });

    const result = await restorePurchases();
    expect(restoreApplePurchases).toHaveBeenCalledWith(['jws-a']);
    expect(result.status).toBe('incomplete');
    expect(result.status).not.toBe('no-restorable-purchases');
    expect(result.queued).toBe(false);
  });

  it('reports a partial restore as incomplete AND queued, so entitlement still refreshes', async () => {
    mockPlugin.getPurchases.mockResolvedValue({
      purchases: [
        purchase({ transactionId: '1', jwsRepresentation: 'jws-a' }),
        purchase({ transactionId: '2', jwsRepresentation: undefined }),
      ],
    });
    (restoreApplePurchases as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 'pending', queued: 1 });

    const result = await restorePurchases();
    expect(result.status).toBe('incomplete');
    // Both facts are true at once, and the caller needs both.
    expect(result.queued).toBe(true);
  });

  it('claims nothing when restore returns a 2xx body it does not recognise', async () => {
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase()] });
    (restoreApplePurchases as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 'something-new' });
    expect((await restorePurchases()).status).toBe('failed');
  });

  it('does not claim a purchase on an ownership conflict', async () => {
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase()] });
    (restoreApplePurchases as ReturnType<typeof vi.fn>).mockRejectedValue(httpError(409, 'apple_ownership_conflict'));
    expect((await restorePurchases()).status).toBe('conflict');
  });

  it('asks the user to retry when restore is temporarily unavailable', async () => {
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase()] });
    (restoreApplePurchases as ReturnType<typeof vi.fn>).mockRejectedValue(httpError(503, 'apple_worker_unavailable'));
    expect((await restorePurchases()).status).toBe('retry-later');
  });
});

describe('products', () => {
  it('loads all six ids in ONE StoreKit request, as subscriptions', async () => {
    await getProducts();
    expect(mockPlugin.getProducts).toHaveBeenCalledTimes(1);
    expect(mockPlugin.getProducts).toHaveBeenCalledWith({
      productIdentifiers: [...PRODUCT_IDS],
      productType: 'subs',
    });
  });

  it('uses the localized StoreKit price string', async () => {
    const { products } = await getProducts();
    expect(products[0].price).toBe('£9.99');
  });

  it('marks a product StoreKit did not return as unavailable, and never prices it', async () => {
    mockPlugin.getProducts.mockResolvedValue({
      products: [{ identifier: 'nala_pro_monthly', title: 't', description: 'd', price: 1, priceString: '$1.00', currencyCode: 'USD' }],
    });
    const catalog = await getProducts();
    expect(catalog.products.map((p) => p.id)).toEqual(['nala_pro_monthly']);
    expect(catalog.unavailable).toContain('nala_elite_yearly');
  });

  it('drops a product with no localized price rather than inventing one', async () => {
    mockPlugin.getProducts.mockResolvedValue({
      products: [{ identifier: 'nala_pro_monthly', title: 't', description: 'd', price: 9.99, priceString: '', currencyCode: 'USD' }],
    });
    const catalog = await getProducts();
    expect(catalog.products).toHaveLength(0);
    expect(catalog.unavailable).toContain('nala_pro_monthly');
  });

  it('ignores an unrecognised product id StoreKit returns', async () => {
    mockPlugin.getProducts.mockResolvedValue({
      products: [{ identifier: 'nala_ultra_monthly', title: 't', description: 'd', price: 1, priceString: '$1', currencyCode: 'USD' }],
    });
    const catalog = await getProducts();
    expect(catalog.products).toHaveLength(0);
  });

  it('reports a total load failure without pricing anything', async () => {
    mockPlugin.getProducts.mockRejectedValue(new Error('StoreKit unavailable'));
    const catalog = await getProducts();
    expect(catalog).toEqual({ products: [], unavailable: [...PRODUCT_IDS], loadFailed: true });
  });
});

describe('platform boundaries', () => {
  it('never touches NativePurchases on the web', async () => {
    platformState.isNative = false;
    platformState.platform = 'web';

    expect(isIAPAvailable()).toBe(false);
    expect(await getProducts()).toEqual({ products: [], unavailable: [], loadFailed: false });
    expect(await purchaseProduct('nala_pro_monthly')).toEqual({ status: 'failed', reason: 'not-available' });
    expect((await restorePurchases()).status).toBe('unavailable');
    expect(await openManageSubscriptions()).toBe(false);
    await startAppleTransactionListeners(() => {});

    expect(mockPlugin.getProducts).not.toHaveBeenCalled();
    expect(mockPlugin.purchaseProduct).not.toHaveBeenCalled();
    expect(mockPlugin.restorePurchases).not.toHaveBeenCalled();
    expect(mockPlugin.addListener).not.toHaveBeenCalled();
    expect(getApplePurchaseContext).not.toHaveBeenCalled();
  });

  it('never runs the Apple purchase path on Android', async () => {
    platformState.isNative = true;
    platformState.platform = 'android';

    expect(isIAPAvailable()).toBe(false);
    expect(await purchaseProduct('nala_pro_monthly')).toEqual({ status: 'failed', reason: 'not-available' });
    expect((await restorePurchases()).status).toBe('unavailable');

    expect(mockPlugin.purchaseProduct).not.toHaveBeenCalled();
    expect(mockPlugin.restorePurchases).not.toHaveBeenCalled();
    expect(getApplePurchaseContext).not.toHaveBeenCalled();
  });

  it('a browser merely claiming to be an iPhone is still web', async () => {
    platformState.isNative = false;
    platformState.platform = 'web';
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', configurable: true,
    });
    expect(isIAPAvailable()).toBe(false);
    await purchaseProduct('nala_pro_monthly');
    expect(mockPlugin.purchaseProduct).not.toHaveBeenCalled();
  });
});

describe('startup recovery sweep', () => {
  const purchase = (over = {}) => ({
    transactionId: '1', productIdentifier: 'nala_pro_monthly',
    jwsRepresentation: 'jws-a', willCancel: null, purchaseDate: '2026-01-01T00:00:00Z', ...over,
  });

  /**
   * The crash this exists for: StoreKit charges, the app dies before we POST
   * the JWS, and on relaunch Capgo 8.1.2 finishes the transaction BEFORE the
   * JS listener sees it. Transaction.updates will never offer it again, but
   * getPurchases() still has it.
   */
  it('re-submits a recognised purchase Capgo already finished', async () => {
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase({ transactionId: '900' })] });
    const onAccepted = vi.fn();

    const accepted = await recoverUnverifiedPurchases(onAccepted);

    expect(verifyApplePurchase).toHaveBeenCalledWith('jws-a');
    expect(accepted).toBe(1);
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('reads full history WITHOUT a token filter, and never prompts a restore', async () => {
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase()] });
    await recoverUnverifiedPurchases();

    expect(mockPlugin.getPurchases).toHaveBeenCalledWith({ productType: 'subs' });
    expect(mockPlugin.getPurchases.mock.calls[0][0]).not.toHaveProperty('appAccountToken');
    // restorePurchases() can prompt for an Apple ID password. A silent startup
    // sweep must never do that.
    expect(mockPlugin.restorePurchases).not.toHaveBeenCalled();
  });

  it('never calls purchase-context - these transactions are already charged', async () => {
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase()] });
    await recoverUnverifiedPurchases();
    expect(getApplePurchaseContext).not.toHaveBeenCalled();
  });

  it('ignores foreign products and entries with no JWS', async () => {
    mockPlugin.getPurchases.mockResolvedValue({
      purchases: [
        purchase({ transactionId: '1', productIdentifier: 'other_app_sub', jwsRepresentation: 'x' }),
        purchase({ transactionId: '2', jwsRepresentation: undefined }),
        purchase({ transactionId: '3', jwsRepresentation: 'mine' }),
      ],
    });
    await recoverUnverifiedPurchases();
    expect(verifyApplePurchase).toHaveBeenCalledTimes(1);
    expect(verifyApplePurchase).toHaveBeenCalledWith('mine');
  });

  it('does not double-submit something the purchase path already handled', async () => {
    mockPlugin.purchaseProduct.mockResolvedValue(txn({ transactionId: '4242' }));
    await purchaseProduct('nala_pro_monthly');
    expect(verifyApplePurchase).toHaveBeenCalledTimes(1);

    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase({ transactionId: '4242' })] });
    await recoverUnverifiedPurchases();
    expect(verifyApplePurchase).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge anything the backend refused', async () => {
    (verifyApplePurchase as ReturnType<typeof vi.fn>).mockRejectedValue(httpError(400));
    mockPlugin.getPurchases.mockResolvedValue({ purchases: [purchase({ transactionId: '55' })] });
    expect(await recoverUnverifiedPurchases()).toBe(0);
    expect(mockPlugin.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it('is silent on web and Android', async () => {
    platformState.platform = 'android';
    expect(await recoverUnverifiedPurchases()).toBe(0);
    expect(mockPlugin.getPurchases).not.toHaveBeenCalled();
  });
});

describe('listener lifecycle', () => {
  const handle = () => ({ remove: vi.fn().mockResolvedValue(undefined) });

  it('does not leave a listener installed when logout lands mid-registration', async () => {
    const first = handle();
    const second = handle();
    let releaseFirst: () => void = () => {};
    mockPlugin.addListener
      .mockImplementationOnce(() => new Promise((res) => { releaseFirst = () => res(first); }))
      .mockImplementationOnce(async () => second);

    const starting = startAppleTransactionListeners(() => {});
    // Wait until registration is genuinely in flight, otherwise the deferred is
    // released before it exists and this proves nothing.
    await vi.waitFor(() => expect(mockPlugin.addListener).toHaveBeenCalled());
    // Logout lands here — mid-registration.
    await stopAppleTransactionListeners();
    releaseFirst();
    await starting;

    // Whatever got created must have been torn down, not published.
    expect(first.remove).toHaveBeenCalledTimes(1);
    expect(second.remove).toHaveBeenCalledTimes(1);
  });

  it('logging back in after that still registers exactly one pair', async () => {
    const a = handle();
    const b = handle();
    let release: () => void = () => {};
    mockPlugin.addListener
      .mockImplementationOnce(() => new Promise((res) => { release = () => res(a); }))
      .mockImplementationOnce(async () => b);

    const stale = startAppleTransactionListeners(() => {});
    await vi.waitFor(() => expect(mockPlugin.addListener).toHaveBeenCalled());
    await stopAppleTransactionListeners();
    release();
    await stale;

    mockPlugin.addListener.mockReset();
    mockPlugin.addListener.mockResolvedValue(handle());
    await startAppleTransactionListeners(() => {});
    expect(mockPlugin.addListener).toHaveBeenCalledTimes(2);
  });

  it('removes an already-registered listener when the second registration throws', async () => {
    const first = handle();
    mockPlugin.addListener
      .mockImplementationOnce(async () => first)
      .mockImplementationOnce(async () => { throw new Error('native failure'); });

    await startAppleTransactionListeners(() => {});

    // Otherwise the handle leaks and a retry installs a second copy.
    expect(first.remove).toHaveBeenCalledTimes(1);
  });

  it('can retry cleanly after a partial registration failure', async () => {
    mockPlugin.addListener
      .mockImplementationOnce(async () => handle())
      .mockImplementationOnce(async () => { throw new Error('native failure'); });
    await startAppleTransactionListeners(() => {});

    mockPlugin.addListener.mockReset();
    mockPlugin.addListener.mockResolvedValue(handle());
    await startAppleTransactionListeners(() => {});
    expect(mockPlugin.addListener).toHaveBeenCalledTimes(2);
  });

  it('a superseded listener does nothing if it still fires', async () => {
    const onAccepted = vi.fn();
    await startAppleTransactionListeners(onAccepted);
    const handler = mockPlugin.addListener.mock.calls.find((c) => c[0] === 'transactionUpdated')![1];

    await stopAppleTransactionListeners();
    handler(txn({ transactionId: '31337' }));
    await new Promise((r) => setTimeout(r, 10));

    expect(verifyApplePurchase).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });
});

describe('bounded retry on a redelivered transaction', () => {
  it('retries a transient backend failure, since Apple will not redeliver', async () => {
    vi.useFakeTimers();
    try {
      (verifyApplePurchase as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(httpError(503))
        .mockResolvedValueOnce({ ok: true, status: 'pending' });

      const onAccepted = vi.fn();
      await startAppleTransactionListeners(onAccepted);
      const handler = mockPlugin.addListener.mock.calls.find((c) => c[0] === 'transactionUpdated')![1];

      handler(txn({ transactionId: '7001' }));
      await vi.advanceTimersByTimeAsync(8000);

      expect(verifyApplePurchase).toHaveBeenCalledTimes(2);
      expect(onAccepted).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT retry a permanent rejection', async () => {
    vi.useFakeTimers();
    try {
      (verifyApplePurchase as ReturnType<typeof vi.fn>).mockRejectedValue(httpError(400));
      await startAppleTransactionListeners(() => {});
      const handler = mockPlugin.addListener.mock.calls.find((c) => c[0] === 'transactionUpdated')![1];

      handler(txn({ transactionId: '7002' }));
      await vi.advanceTimersByTimeAsync(8000);

      expect(verifyApplePurchase).toHaveBeenCalledTimes(1);
      expect(mockPlugin.acknowledgePurchase).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('source boundaries', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const service = () => read('utils/iap.ts');
  const paywall = () => read('components/NativePaywall.tsx');
  const listener = () => read('hooks/useAppleTransactions.ts');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('derives no account token on the device', () => {
    for (const src of [service(), paywall(), listener()]) {
      const code = stripComments(src);
      expect(code).not.toMatch(/uuidv5|uuidV5|generateUuid|randomUUID/);
      expect(code).not.toMatch(/appAccountToken\s*[:=]\s*(user|userId|user\?\.id|email)/);
    }
  });

  it('never writes a plan or entitlement from the Apple path', () => {
    const code = stripComments(service());
    expect(code).not.toMatch(/\bsetPlan\b|\bplan\s*=\s*['"]/);
    expect(code).not.toMatch(/planExpiresAt|applePurchaseSource/);
  });

  it('never uses StoreKit local state as access authority', () => {
    const code = stripComments(service()) + stripComments(paywall());
    // Reading these to DECIDE access is the forbidden pattern.
    expect(code).not.toMatch(/\.isActive\b/);
    expect(code).not.toMatch(/\.expirationDate\b/);
    expect(code).not.toMatch(/\.subscriptionState\b/);
    expect(code).not.toMatch(/onlyCurrentEntitlements/);
  });

  it('never logs the JWS, the account token or Apple identifiers', () => {
    for (const src of [service(), paywall(), listener()]) {
      const code = stripComments(src);
      const logs = code.match(/console\.(log|warn|error|info)\([^)]*\)/g) ?? [];
      for (const line of logs) {
        expect(line).not.toMatch(/jws|signedTransaction|appAccountToken|originalTransactionId|receipt/i);
      }
    }
  });

  it('keeps the six canonical product ids in sync with the backend', () => {
    expect([...PRODUCT_IDS]).toEqual([
      'nala_pro_monthly', 'nala_pro_yearly',
      'nala_premium_monthly', 'nala_premium_yearly',
      'nala_elite_monthly', 'nala_elite_yearly',
    ]);
  });
});
