import type { Product, Transaction } from '@capgo/native-purchases';
import { isNative, platform } from './platform';
import {
  getApplePurchaseContext,
  verifyApplePurchase,
  restoreApplePurchases,
} from '../api';

/**
 * Apple StoreKit 2 client for iOS, via @capgo/native-purchases 8.1.2.
 *
 * ── THE RULE EVERYTHING HERE OBEYS ────────────────────────────────────────
 *
 *   StoreKit proves a purchase happened. The backend decides entitlement.
 *
 * Nothing in this file may set a plan, an expiry, premium access or a billing
 * source. `isActive`, `expirationDate`, `subscriptionState`, `willCancel` and
 * `productIdentifier` are display/diagnostic values only. The single authority
 * the UI reads is the authenticated `getBillingStatus()`.
 *
 * ── OWNERSHIP ─────────────────────────────────────────────────────────────
 *
 * The `appAccountToken` handed to StoreKit is ALWAYS the opaque UUID minted by
 * the server at POST /billing/apple-purchase-context. It is never derived on
 * the device. The plugin's own docblock recommends `uuidv5(userId)`; that is
 * deliberately ignored — a token the client can compute is a token an attacker
 * can compute, and the backend resolves purchase ownership by looking this
 * exact value up in `User.appleAppAccountToken`. Passing the Nala user id (what
 * this module used to do) resolves to no account at all.
 *
 * ── PLUGIN BEHAVIOUR MEASURED IN 8.1.2, NOT ASSUMED ───────────────────────
 *
 * Read from ios/Sources/NativePurchasesPlugin at the installed version:
 *
 *  - `purchaseProduct` honours `autoAcknowledgePurchases: false` and leaves the
 *    transaction unfinished (NativePurchasesPlugin.swift:125-130). This is the
 *    invariant that lets the backend durably record a purchase BEFORE the
 *    device drops it from the unfinished queue.
 *  - The native `Transaction.updates` loop calls `transaction.finish()`
 *    UNCONDITIONALLY before notifying JS (NativePurchasesPlugin.swift:52). See
 *    the note on the listener below — this one we cannot control.
 *  - `getPurchases()` already unions `Transaction.currentEntitlements` with
 *    `Transaction.all`, deduped by id (TransactionHelpers.swift:99-133), so
 *    full history is the default and no `onlyCurrentEntitlements` flag exists.
 *  - `getPurchases({ appAccountToken })` FILTERS by exact token match
 *    (TransactionHelpers.swift:105-106). We must never pass it: it would drop
 *    exactly the legacy tokenless purchases restore exists to recover.
 *  - `acknowledgePurchase` takes the iOS transaction id as a numeric string and
 *    rejects with "Transaction not found or already finished" when it is gone.
 *  - Cancellation surfaces as a rejection with the message "User cancelled"
 *    (NativePurchasesPlugin.swift:138); `.pending` rejects "Transaction pending".
 */

// Lazy-load so the native module is never pulled into the web bundle.
async function plugin() {
  const mod = await import('@capgo/native-purchases');
  return { NativePurchases: mod.NativePurchases, PURCHASE_TYPE: mod.PURCHASE_TYPE };
}

/** The backend's canonical Apple product ids. Store selection/display ONLY. */
export const PRODUCT_IDS = [
  'nala_pro_monthly',
  'nala_pro_yearly',
  'nala_premium_monthly',
  'nala_premium_yearly',
  'nala_elite_monthly',
  'nala_elite_yearly',
] as const;

export type AppleProductId = (typeof PRODUCT_IDS)[number];

/**
 * Which card the id belongs on. NOT an entitlement mapping.
 *
 * Spelled out rather than parsed out of the id: splitting on '_' would happily
 * invent a tier for an unrecognised product. An id that is not in this table is
 * not purchasable and unlocks nothing.
 */
const PRODUCT_DISPLAY: Record<AppleProductId, {
  tier: 'pro' | 'premium' | 'elite';
  period: 'monthly' | 'yearly';
}> = {
  nala_pro_monthly: { tier: 'pro', period: 'monthly' },
  nala_pro_yearly: { tier: 'pro', period: 'yearly' },
  nala_premium_monthly: { tier: 'premium', period: 'monthly' },
  nala_premium_yearly: { tier: 'premium', period: 'yearly' },
  nala_elite_monthly: { tier: 'elite', period: 'monthly' },
  nala_elite_yearly: { tier: 'elite', period: 'yearly' },
};

export function isKnownProductId(id: string): id is AppleProductId {
  return Object.prototype.hasOwnProperty.call(PRODUCT_DISPLAY, id);
}

export interface IAPProduct {
  id: AppleProductId;
  title: string;
  description: string;
  /** Localized StoreKit price string, e.g. "£9.99". Never a hardcoded price. */
  price: string;
  priceAmount: number;
  currencyCode: string;
  tier: 'pro' | 'premium' | 'elite';
  period: 'monthly' | 'yearly';
}

export interface AppleProductCatalog {
  products: IAPProduct[];
  /** Configured ids StoreKit did not return. Shown unavailable, not priced. */
  unavailable: AppleProductId[];
  loadFailed: boolean;
}

/** Native iOS only. A browser pretending to be an iPhone must not get here. */
export function isIAPAvailable(): boolean {
  return isNative && platform === 'ios';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Syntactic check only — the server decides what the token MEANS. */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Load the six subscriptions in ONE StoreKit request. */
export async function getProducts(): Promise<AppleProductCatalog> {
  if (!isIAPAvailable()) {
    return { products: [], unavailable: [], loadFailed: false };
  }

  try {
    const { NativePurchases, PURCHASE_TYPE } = await plugin();
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [...PRODUCT_IDS],
      productType: PURCHASE_TYPE.SUBS,
    });

    const mapped: IAPProduct[] = [];
    for (const p of products as Product[]) {
      // An id StoreKit returns that we do not recognise is ignored outright.
      if (!isKnownProductId(p.identifier)) continue;
      const display = PRODUCT_DISPLAY[p.identifier];
      const priceString = typeof p.priceString === 'string' ? p.priceString.trim() : '';
      // No localized price means no purchasable card: inventing "$X" here is
      // exactly the hardcoded pricing the contract forbids.
      if (!priceString) continue;
      mapped.push({
        id: p.identifier,
        title: p.title || p.identifier,
        description: p.description || '',
        price: priceString,
        priceAmount: typeof p.price === 'number' ? p.price : 0,
        currencyCode: p.currencyCode || '',
        tier: display.tier,
        period: display.period,
      });
    }

    const present = new Set(mapped.map((p) => p.id));
    return {
      products: mapped,
      unavailable: PRODUCT_IDS.filter((id) => !present.has(id)),
      loadFailed: false,
    };
  } catch {
    // Every product is unavailable, and none of them is purchasable.
    return { products: [], unavailable: [...PRODUCT_IDS], loadFailed: true };
  }
}

export type ApplePurchaseFailure =
  | 'cancelled'
  | 'not-available'
  | 'product-unavailable'
  | 'iap-disabled'
  | 'worker-unavailable'
  | 'billing-rail-conflict'
  | 'ownership-conflict'
  | 'verification-pending'
  | 'verification-failed'
  | 'missing-jws'
  /** A 2xx whose body is not the contract we froze. Treated as not-accepted. */
  | 'unexpected-response'
  | 'unknown';

export type SubmitOutcome =
  /** Backend durably queued reconciliation (202). Transaction finished. */
  | { status: 'accepted' }
  /**
   * 409 billing_rail_conflict from VERIFY. The backend contract guarantees the
   * Apple purchase was already durably enqueued before this conflict is
   * reported, so the transaction is finished — but nothing is unlocked.
   */
  | { status: 'charged-conflict' }
  /** Not accepted. Transaction deliberately left UNFINISHED for retry. */
  | { status: 'failed'; reason: ApplePurchaseFailure };

export type ApplePurchaseResult = SubmitOutcome;

export interface RestoreResult {
  status:
    | 'pending'                 // backend queued; refresh billing status
    | 'no-restorable-purchases' // NOT "plan = free"
    | 'incomplete'              // a recognised purchase had no JWS
    | 'too-many'                // above the backend cap; refuse to truncate
    | 'unavailable'
    | 'conflict'
    | 'retry-later'
    | 'failed';
  /**
   * The backend accepted at least one transaction (202 pending).
   *
   * Separate from `status` on purpose: "restore was incomplete" and "some of it
   * was queued" are both true at once when one purchase carried a JWS and
   * another did not. Collapsing them would either hide a partial success from
   * the entitlement refresh, or overstate an incomplete restore as a clean one.
   */
  queued?: boolean;
  /** Diagnostics only — never an entitlement. */
  count?: number;
}

/**
 * Classify a backend error. 400 and the transient 503 carry no `code`, so
 * status has to disambiguate those two; every other case is coded.
 *
 * A 409 is deliberately NOT mapped by status. Both Apple conflicts are 409 and
 * they require opposite handling, so an uncoded or unrecognised 409 must land
 * on `unknown` — the fail-CLOSED bucket. Guessing `billing-rail-conflict` here
 * would hand any future 409 permission to destroy an unfinished transaction.
 */
function classify(err: unknown): ApplePurchaseFailure {
  const e = err as { status?: number; code?: string } | undefined;
  const code = e?.code;
  if (code === 'apple_iap_disabled') return 'iap-disabled';
  if (code === 'apple_worker_unavailable') return 'worker-unavailable';
  if (code === 'billing_rail_conflict') return 'billing-rail-conflict';
  if (code === 'apple_ownership_conflict') return 'ownership-conflict';
  if (e?.status === 400) return 'verification-failed';
  if (e?.status === 503) return 'verification-pending';
  return 'unknown';
}

/**
 * The ONLY condition that may finish a transaction after a rejection.
 *
 * Read straight off the error rather than off `classify()`, so the permission
 * to discard a paid-for transaction cannot be widened by a future edit to the
 * classifier. The backend guarantees this specific code is only emitted after
 * the Apple purchase was durably enqueued.
 */
function isExplicitRailConflict(err: unknown): boolean {
  return (err as { code?: string } | undefined)?.code === 'billing_rail_conflict';
}

/** The frozen success contract for /billing/apple-verify: 202 {ok, pending}. */
function isAcceptedVerifyBody(body: unknown): boolean {
  const b = body as { ok?: unknown; status?: unknown } | undefined;
  return b?.ok === true && b?.status === 'pending';
}

/** The frozen success contract for /billing/apple-purchase-context. */
function isValidPurchaseContext(body: unknown): body is { appAccountToken: string } {
  const b = body as { ok?: unknown; appAccountToken?: unknown } | undefined;
  return b?.ok === true && isUuid(b?.appAccountToken);
}

/**
 * In-memory only, and deliberately so.
 *
 * `inFlight` stops purchaseProduct's return path and the transactionUpdated
 * listener racing the same transaction to the backend. `settled` skips repeats
 * of transactions already accepted this session. Failures are NOT retained —
 * a transient failure must stay retryable. None of this is durable ownership
 * state: after a restart, retrying is safe and the backend is idempotent.
 */
const inFlight = new Map<string, Promise<SubmitOutcome>>();
const settled = new Set<string>();

/**
 * Test seam: the module-level state outlives a single test otherwise.
 *
 * Must clear the listener lifecycle too. A test that abandons a start mid-flight
 * would otherwise leave `listenerStarting` true and silently turn every later
 * start into a no-op — which looks exactly like a passing "registered once" test.
 */
export function __resetAppleIapState(): void {
  inFlight.clear();
  settled.clear();
  listenerHandles = null;
  listenerStarting = false;
  listenerGeneration += 1;
}

async function finishTransaction(transactionId: string): Promise<void> {
  try {
    const { NativePurchases } = await plugin();
    await NativePurchases.acknowledgePurchase({ purchaseToken: transactionId });
  } catch {
    // "Transaction not found or already finished" is expected for anything
    // that arrived through Transaction.updates, which plugin 8.1.2 finishes
    // natively before we ever see it. Not an error worth surfacing.
  }
}

/**
 * The single path from a StoreKit transaction to the backend. Used by both the
 * purchase return and the crash-recovery listener so the acknowledgement rules
 * cannot drift between them.
 */
export async function submitTransaction(transaction: Transaction): Promise<SubmitOutcome> {
  const id = transaction.transactionId;

  if (settled.has(id)) return { status: 'accepted' };
  const existing = inFlight.get(id);
  if (existing) return existing;

  const run = (async (): Promise<SubmitOutcome> => {
    const jws = transaction.jwsRepresentation;
    // No signed payload means nothing verifiable. Do not finish it: leaving it
    // in StoreKit's queue is what makes a retry possible at all.
    if (typeof jws !== 'string' || jws.length === 0) {
      return { status: 'failed', reason: 'missing-jws' };
    }

    let body: unknown;
    try {
      body = await verifyApplePurchase(jws);
    } catch (err) {
      if (isExplicitRailConflict(err)) {
        // Apple already has the money and the backend already recorded the
        // purchase. Finishing is correct; unlocking is not.
        await finishTransaction(id);
        return { status: 'charged-conflict' };
      }
      // Everything else — 503 transient, 500, 400 permanent, ownership
      // conflict, and any 409 that did NOT carry the exact rail-conflict code —
      // keeps the transaction unfinished so it is not silently destroyed.
      return { status: 'failed', reason: classify(err) };
    }

    // A 2xx is not by itself acceptance. Finishing is irreversible, so it
    // requires the response we actually froze, not merely the absence of an
    // error: a proxy, a redirect or a future contract change must not be able
    // to discard a paid-for transaction.
    if (!isAcceptedVerifyBody(body)) {
      return { status: 'failed', reason: 'unexpected-response' };
    }

    await finishTransaction(id);
    return { status: 'accepted' };
  })();

  inFlight.set(id, run);
  try {
    const outcome = await run;
    if (outcome.status === 'accepted' || outcome.status === 'charged-conflict') settled.add(id);
    return outcome;
  } finally {
    inFlight.delete(id);
  }
}

/**
 * Buy a subscription.
 *
 * Purchase context is fetched immediately before EVERY attempt and never
 * cached: it is a live check of rollout state, worker availability and the
 * Stripe rail, not a value.
 */
export async function purchaseProduct(productId: string): Promise<ApplePurchaseResult> {
  if (!isIAPAvailable()) return { status: 'failed', reason: 'not-available' };
  if (!isKnownProductId(productId)) return { status: 'failed', reason: 'product-unavailable' };

  let appAccountToken: string;
  try {
    const context = await getApplePurchaseContext();
    // Both halves of the contract, not just a well-shaped string: a 2xx that
    // is not the frozen success body must not open a payment sheet.
    if (!isValidPurchaseContext(context)) {
      return { status: 'failed', reason: 'unexpected-response' };
    }
    appAccountToken = context.appAccountToken;
  } catch (err) {
    // Preflight said no: StoreKit must not open, and there is no Stripe
    // fallback inside the native app.
    return { status: 'failed', reason: classify(err) };
  }

  let transaction: Transaction;
  try {
    const { NativePurchases, PURCHASE_TYPE } = await plugin();
    transaction = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: PURCHASE_TYPE.SUBS,
      appAccountToken,
      // The whole point: the backend must durably accept the purchase before
      // the device drops it from the unfinished queue.
      autoAcknowledgePurchases: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? '');
    // Closing the sheet is a choice, not a failure.
    if (/user cancelled|usercancelled|cancell?ed/i.test(message)) {
      return { status: 'failed', reason: 'cancelled' };
    }
    if (/cannot find product/i.test(message)) {
      return { status: 'failed', reason: 'product-unavailable' };
    }
    return { status: 'failed', reason: 'unknown' };
  }

  return submitTransaction(transaction);
}

/** The backend rejects more than this outright (400), so we never send more. */
export const MAX_RESTORE_TRANSACTIONS = 50;

/**
 * Restore.
 *
 * Collects every ownership-qualifying signed transaction and lets the backend
 * decide which subscription is current. No expiry comparison, no "latest wins",
 * no array-order authority — that class of bug is precisely what the backend
 * rewrite removed.
 */
export async function restorePurchases(): Promise<RestoreResult> {
  if (!isIAPAvailable()) return { status: 'unavailable' };

  let purchases: Transaction[];
  try {
    const { NativePurchases, PURCHASE_TYPE } = await plugin();
    await NativePurchases.restorePurchases();
    // No appAccountToken filter: it would exclude legacy tokenless purchases,
    // which are the main reason restore exists.
    const result = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
    purchases = result.purchases as Transaction[];
  } catch {
    return { status: 'retry-later' };
  }

  const recognised = purchases.filter((p) => isKnownProductId(p.productIdentifier));
  const signed: string[] = [];
  let missingJws = false;
  for (const p of recognised) {
    if (typeof p.jwsRepresentation === 'string' && p.jwsRepresentation.length > 0) {
      signed.push(p.jwsRepresentation);
    } else {
      missingJws = true;
    }
  }

  // "We could not verify everything" must never be reported as "you own
  // nothing" — that is a statement about entitlement we are not entitled to make.
  if (missingJws && signed.length === 0) return { status: 'incomplete' };

  if (signed.length > MAX_RESTORE_TRANSACTIONS) {
    // Slicing the first/newest 50 would let array order decide what gets
    // restored. Refuse deterministically instead.
    return { status: 'too-many', count: signed.length };
  }

  if (signed.length === 0) return { status: 'no-restorable-purchases', count: 0 };

  try {
    const result = await restoreApplePurchases(signed);
    if (!result || result.ok !== true) return { status: 'failed', queued: false };

    if (result.status === 'no-restorable-purchases') {
      /**
       * The backend checked everything we were able to GIVE it. If a recognised
       * Nala purchase had no JWS, it was never checkable — so "nothing found"
       * is not a statement we are entitled to make, however the backend
       * answered about the rest.
       */
      return missingJws
        ? { status: 'incomplete', queued: false, count: signed.length }
        : { status: 'no-restorable-purchases', queued: false, count: 0 };
    }

    if (result.status === 'pending') {
      // Queued either way. When part of the set was unverifiable the caller is
      // told BOTH: refresh entitlement, and say the restore was incomplete.
      return missingJws
        ? { status: 'incomplete', queued: true, count: signed.length }
        : { status: 'pending', queued: true, count: signed.length };
    }

    // A 2xx we do not recognise claims nothing.
    return { status: 'failed', queued: false };
  } catch (err) {
    const reason = classify(err);
    if (reason === 'ownership-conflict') return { status: 'conflict' };
    if (reason === 'iap-disabled' || reason === 'worker-unavailable'
      || reason === 'verification-pending') return { status: 'retry-later' };
    return { status: 'failed' };
  }
}

/** Apple's own subscription management sheet. We never build our own. */
export async function openManageSubscriptions(): Promise<boolean> {
  if (!isIAPAvailable()) return false;
  try {
    const { NativePurchases } = await plugin();
    await NativePurchases.manageSubscriptions();
    return true;
  } catch {
    return false;
  }
}


/**
 * ── LISTENER LIFECYCLE ────────────────────────────────────────────────────
 *
 * A generation counter, not a boolean.
 *
 * Registration is asynchronous, so "am I started?" is not answerable with a
 * flag: a logout can land between claiming the slot and the native listeners
 * actually existing, and a naive implementation then installs listeners for a
 * session that has already ended. The callback carries no immutable user
 * identity, so a listener that outlives its session would submit transactions
 * under whichever account is authenticated later. The backend's ownership
 * checks would refuse to move entitlement, but leaving stale Apple listeners
 * across an account transition is not something to rely on being harmless.
 *
 * stop() bumps the generation, which invalidates any start still in flight;
 * that start then removes whatever it managed to create instead of publishing
 * it. Partial registration failures unwind the same way.
 */
let listenerGeneration = 0;
let listenerHandles: PluginHandle[] | null = null;
let listenerStarting = false;

interface PluginHandle { remove: () => Promise<void> }

async function removeHandles(handles: PluginHandle[]): Promise<void> {
  for (const h of handles) {
    try {
      await h.remove();
    } catch {
      // Nothing actionable if the native side is already gone.
    }
  }
}

/** Bounded retry for the one path Apple will not retry for us. */
async function submitWithRetry(transaction: Transaction): Promise<SubmitOutcome> {
  const delays = [0, 1500, 4000];
  let outcome: SubmitOutcome = { status: 'failed', reason: 'unknown' };
  for (const delay of delays) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    outcome = await submitTransaction(transaction);
    if (outcome.status !== 'failed') return outcome;
    // Only a transient condition is worth retrying; a permanent rejection or
    // an ownership conflict will answer the same way every time.
    if (outcome.reason !== 'verification-pending' && outcome.reason !== 'unknown') return outcome;
  }
  return outcome;
}

/**
 * Register the StoreKit listeners exactly once per authenticated app lifecycle.
 *
 * transactionUpdated is POST-CHARGE recovery: a purchase that completed while
 * the app was dying, plus every auto-renewal. Purchase-context is NOT called
 * for these — that is pre-charge authorization and the charge already happened.
 *
 * KNOWN PLUGIN LIMITATION (8.1.2): the native Transaction.updates loop calls
 * transaction.finish() BEFORE notifying JS (NativePurchasesPlugin.swift:52), so
 * by the time we see one of these StoreKit has already dropped it and will not
 * redeliver. That is why this path retries with a bounded backoff, and why
 * recoverUnverifiedPurchases() below exists as the durable safety net. We still
 * never finish on failure ourselves, so the frozen rule holds the moment the
 * plugin stops auto-finishing.
 */
export async function startAppleTransactionListeners(
  onBackendAccepted: () => void,
): Promise<void> {
  if (!isIAPAvailable()) return;
  if (listenerHandles || listenerStarting) return;

  listenerStarting = true;
  const generation = ++listenerGeneration;
  const created: PluginHandle[] = [];

  try {
    const { NativePurchases } = await plugin();

    const updated = await NativePurchases.addListener('transactionUpdated', (transaction) => {
      // A listener from a superseded session must do nothing at all.
      if (generation !== listenerGeneration) return;
      void (async () => {
        const outcome = await submitWithRetry(transaction);
        if (outcome.status === 'accepted' && generation === listenerGeneration) {
          onBackendAccepted();
        }
      })();
    });
    created.push(updated);

    const failed = await NativePurchases.addListener('transactionVerificationFailed', (payload) => {
      if (generation !== listenerGeneration) return;
      // Never grants access, never forwards the transaction as trusted, and
      // logs no identifiers or payloads.
      if (import.meta.env.DEV) {
        console.warn('[IAP] StoreKit reported an unverified transaction', {
          error: payload?.error ? 'present' : 'absent',
        });
      }
    });
    created.push(failed);

    if (generation !== listenerGeneration) {
      // stop() ran while we were registering. Do not publish these.
      await removeHandles(created);
      return;
    }
    listenerHandles = created;
  } catch {
    // Partial registration must not leak the handles it did create.
    await removeHandles(created);
    if (generation === listenerGeneration) listenerHandles = null;
  } finally {
    if (generation === listenerGeneration) listenerStarting = false;
  }
}

export async function stopAppleTransactionListeners(): Promise<void> {
  // Bumping first invalidates any start still in flight.
  listenerGeneration += 1;
  listenerStarting = false;
  const handles = listenerHandles;
  listenerHandles = null;
  if (handles) await removeHandles(handles);
}

/**
 * Authenticated startup sweep — the durable answer to the plugin limitation.
 *
 * The crash we designed recovery for: StoreKit charges, the app dies before we
 * POST the JWS, and on relaunch Capgo finishes the transaction before handing
 * it to JS. Transaction.updates will never offer it again. But
 * getPurchases() in 8.1.2 unions Transaction.currentEntitlements with
 * Transaction.all (TransactionHelpers.swift:99-133), so the transaction and its
 * JWS are still there to be found.
 *
 * So on every authenticated native startup we re-submit any recognised Nala
 * transaction that carries a JWS. No purchase-context: these are already
 * post-charge. No restorePurchases(): that is a user-initiated action which can
 * prompt for an Apple ID password, and this must stay silent.
 *
 * This recovers transaction FACTS. It does not choose a winner, read isActive,
 * compare expiry dates, or decide entitlement — the backend does that, and it
 * is idempotent, so replaying is safe.
 */
export async function recoverUnverifiedPurchases(
  onBackendAccepted?: () => void,
): Promise<number> {
  if (!isIAPAvailable()) return 0;

  let purchases: Transaction[];
  try {
    const { NativePurchases, PURCHASE_TYPE } = await plugin();
    // No appAccountToken filter: it would exclude legacy tokenless purchases.
    const result = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
    purchases = result.purchases as Transaction[];
  } catch {
    return 0;
  }

  let accepted = 0;
  for (const p of purchases) {
    if (!isKnownProductId(p.productIdentifier)) continue;
    if (typeof p.jwsRepresentation !== 'string' || p.jwsRepresentation.length === 0) continue;
    // submitTransaction dedupes, so anything already handled this session is
    // a no-op rather than a duplicate backend call.
    const outcome = await submitTransaction(p);
    if (outcome.status === 'accepted') accepted += 1;
  }

  if (accepted > 0 && onBackendAccepted) onBackendAccepted();
  return accepted;
}
