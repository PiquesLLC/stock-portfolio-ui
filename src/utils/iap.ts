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
  /** Diagnostics only — never an entitlement. */
  count?: number;
}

/**
 * Classify a backend error. 400 and the transient 503 carry no `code`, so
 * status has to disambiguate them; every other case is coded.
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
  if (e?.status === 409) return 'billing-rail-conflict';
  return 'unknown';
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

/** Test seam: the module-level maps outlive a single test otherwise. */
export function __resetAppleIapState(): void {
  inFlight.clear();
  settled.clear();
  listenerHandles = null;
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

    try {
      await verifyApplePurchase(jws);
    } catch (err) {
      const reason = classify(err);
      if (reason === 'billing-rail-conflict') {
        // Apple already has the money and the backend already recorded the
        // purchase. Finishing is correct; unlocking is not.
        await finishTransaction(id);
        return { status: 'charged-conflict' };
      }
      // 503 transient, 500, 400 permanent, ownership conflict: all keep the
      // transaction unfinished so it is not silently dropped.
      return { status: 'failed', reason };
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
    if (!isUuid(context?.appAccountToken)) {
      return { status: 'failed', reason: 'unknown' };
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
    if (result?.status === 'no-restorable-purchases') {
      return { status: 'no-restorable-purchases', count: 0 };
    }
    return missingJws
      ? { status: 'incomplete', count: signed.length }
      : { status: 'pending', count: signed.length };
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

let listenerHandles: { remove: () => Promise<void> }[] | null = null;

/**
 * Register the StoreKit listeners exactly once per authenticated app lifecycle.
 *
 * `transactionUpdated` is POST-CHARGE recovery: a purchase that succeeded while
 * the app was dying, and every auto-renewal. Purchase-context is NOT called for
 * these — that is pre-charge authorization and the charge already happened.
 *
 * KNOWN LIMITATION, plugin 8.1.2: the native Transaction.updates loop calls
 * `transaction.finish()` before it notifies JS
 * (NativePurchasesPlugin.swift:52). So for this path the "leave it unfinished
 * on transient failure" rule is not achievable on the device — StoreKit has
 * already dropped it by the time we see it, and it will not be redelivered.
 * We still never finish on failure ourselves, so the rule holds the moment the
 * plugin stops doing that. Until then the real recovery path for a failed
 * update is Restore Purchases, which reads full history.
 */
export async function startAppleTransactionListeners(
  onBackendAccepted: () => void,
): Promise<void> {
  if (!isIAPAvailable() || listenerHandles) return;
  // Claim the slot before awaiting so two concurrent calls cannot both register.
  listenerHandles = [];

  try {
    const { NativePurchases } = await plugin();

    const updated = await NativePurchases.addListener('transactionUpdated', (transaction) => {
      void (async () => {
        const outcome = await submitTransaction(transaction);
        if (outcome.status === 'accepted') onBackendAccepted();
      })();
    });

    const failed = await NativePurchases.addListener('transactionVerificationFailed', (payload) => {
      // Never grants access, never forwards the transaction as trusted, and
      // logs no identifiers or payloads.
      if (import.meta.env.DEV) {
        console.warn('[IAP] StoreKit reported an unverified transaction', {
          error: payload?.error ? 'present' : 'absent',
        });
      }
    });

    listenerHandles = [updated, failed];
  } catch {
    listenerHandles = null;
  }
}

export async function stopAppleTransactionListeners(): Promise<void> {
  const handles = listenerHandles;
  listenerHandles = null;
  if (!handles) return;
  for (const h of handles) {
    try {
      await h.remove();
    } catch {
      // Nothing actionable if the native side is already gone.
    }
  }
}
