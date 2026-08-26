# iOS StoreKit client integration

Client half of the Apple IAP work. The backend contract (API PRs #38–#42) is
frozen and unchanged by this PR. `APPLE_IAP_ENABLED` and
`APPLE_RECONCILIATION_WORKER_ENABLED` stay false in production, so every path
here is inert until they are turned on.

## The rule

> StoreKit proves a purchase happened. The backend decides entitlement.

`isActive`, `expirationDate`, `subscriptionState`, `willCancel` and
`productIdentifier` are display and diagnostic values. The only authority the UI
reads is the authenticated `getBillingStatus()` / `refreshUser()`.

## What the previous implementation did

`src/utils/iap.ts` already existed and was wrong in ways that mattered:

| Old behaviour | Problem |
|---|---|
| `appAccountToken: userId` | The forbidden token. Under PR #42 the backend resolves ownership by looking the token up in `User.appleAppAccountToken` — a Nala user id matches **no** account, so every purchase would have bound to nobody. |
| No purchase-context call | No rollout gate, no worker check, no Stripe-rail check. StoreKit opened regardless. |
| `autoAcknowledgePurchases` unset (defaults true) | StoreKit finished the transaction before the backend had recorded anything. A crash in that window lost the purchase silently. |
| Restore posted `signedTransactions: []` | Sent nothing and expected the server to "check Apple's records". The frozen contract requires the actual signed transactions. |
| Read `data.plan` from `/apple-verify` | Client-side entitlement authority through the response body. |
| Raw `fetch` + `credentials: 'include'` | Bypassed `fetchJson`, so no native auth handling and no refresh-on-401. |

All of it is replaced rather than added alongside.

## Plugin behaviour, measured not assumed

Read from `node_modules/@capgo/native-purchases@8.1.2/ios/Sources`:

- **`purchaseProduct` honours `autoAcknowledgePurchases: false`**
  (`NativePurchasesPlugin.swift:125-130`). This is the load-bearing invariant:
  the backend durably accepts the purchase before the device drops it from the
  unfinished queue.
- **`getPurchases()` already returns full history** — it unions
  `Transaction.currentEntitlements` with `Transaction.all`, deduped by id
  (`TransactionHelpers.swift:99-133`). The contract asked for
  `onlyCurrentEntitlements: false`; **that option does not exist in 8.1.2**, and
  it is unnecessary because full history is the default.
- **`getPurchases({ appAccountToken })` filters by exact token match**
  (`TransactionHelpers.swift:105-106`). We must never pass it — it would exclude
  exactly the legacy tokenless purchases restore exists to recover.
- **`acknowledgePurchase` takes the iOS transaction id as a numeric string** and
  rejects with *"Transaction not found or already finished"* when it is gone.
  That rejection is swallowed as benign.
- **Cancellation** surfaces as a rejection with the message `"User cancelled"`
  (`NativePurchasesPlugin.swift:138`); `.pending` rejects `"Transaction pending"`.
- `productType` is Android-only for `getProducts`/`getPurchases`; passing
  `SUBS` is harmless and kept for cross-platform clarity.

### Known limitation — `Transaction.updates` finishes transactions itself

`NativePurchasesPlugin.swift:52` calls `await transaction.finish()`
**unconditionally**, before notifying JavaScript:

```swift
case .verified(let transaction):
    let payload = await TransactionHelpers.buildTransactionResponse(...)
    await transaction.finish()        // ← before notifyListeners
```

So for the crash-recovery path the contract's *"a transient backend failure
leaves it unfinished"* rule **cannot be honoured on-device in 8.1.2**: by the
time our listener runs, StoreKit has already dropped the transaction and will
not redeliver it.

Concretely, the crash we designed recovery for — charge succeeds, app dies
before we POST the JWS, relaunch delivers the transaction, our backend happens
to answer 503 — ends with StoreKit having already dropped it.

What this PR does about it, without forking the plugin:

- The **purchase** path is fully compliant: we own the finishing there.
- The listener retries a transient backend failure with a **bounded backoff**
  (0 / 1.5s / 4s), because Apple will not retry it for us. Permanent rejections
  and ownership conflicts are not retried — the answer would not change.
- **A startup recovery sweep is the durable safety net.** On every authenticated
  native launch, after the listeners are registered, `recoverUnverifiedPurchases()`
  calls `getPurchases({ productType: SUBS })` — no token filter, and
  deliberately **not** `restorePurchases()`, which can prompt for an Apple ID
  password and must not fire silently at startup. Any recognised Nala
  transaction carrying a JWS is re-submitted through the same safe path. No
  purchase-context: these are already post-charge. The backend is idempotent, so
  replay is safe, and the in-memory dedupe means anything already handled this
  session is a no-op.
- We still never call `acknowledgePurchase` ourselves on failure, so the frozen
  rule holds the moment the plugin stops auto-finishing.

This recovers transaction **facts**. It reads no `isActive`, compares no expiry,
and picks no winner — the backend decides entitlement.

No plugin patch was vendored and nothing was worked around silently.

## Listener lifecycle

Registration is asynchronous, so "am I started?" cannot be a boolean: a logout
can land between claiming the slot and the native listeners actually existing.
The callback carries no immutable user identity, so a listener that outlived its
session would submit transactions under whichever account authenticates next.
The backend's ownership checks would refuse to move entitlement, but stale Apple
listeners across an account transition are not something to rely on being
harmless.

So the module uses a **generation counter**. `stop()` bumps it, which invalidates
any start still in flight; that start then removes whatever it created instead of
publishing it. A partial registration failure — second `addListener` throws after
the first succeeded — unwinds the same way rather than leaking a handle that a
retry would duplicate. A superseded handler that still fires does nothing.

## Ownership

`POST /billing/apple-purchase-context` is called immediately before **every**
purchase and never cached — it is a live check of rollout state, worker
availability and the Stripe rail, not a value. Its opaque server-issued UUID is
the only thing passed to StoreKit as `.appAccountToken(...)`.

The plugin's own docblock recommends `uuidv5(userId)`. That is deliberately
ignored: a token the client can compute is a token an attacker can compute, and
the repo already ships a `generateUuid()` that would have been the easy wrong
answer. A source-boundary test asserts no device-side derivation exists.

Only the token's *syntax* is validated client-side. What it means is the
server's business.

## Acknowledgement policy

Finishing a transaction is irreversible, so it **fails closed**: it happens only
for a response we positively recognise, never merely for the absence of an error.

| Backend response | Finish the transaction? | Unlock? |
|---|---|---|
| 202 `{ ok: true, status: 'pending' }` | yes | no — wait for billing/status |
| 409 with **exactly** `code: billing_rail_conflict` | **yes** | no |
| 409 with no code, or any other code | **no** | no |
| 409 `apple_ownership_conflict` | no | no |
| 400 permanent verification failure | no | no |
| 503 transient / 500 | no | no |
| any 2xx whose body is not the frozen contract | **no** | no |

Two details make that real rather than aspirational:

- The permission to finish is read **straight off the error's `code`**, not off
  the classifier, so a future edit to `classify()` cannot widen it. `classify()`
  itself deliberately does not map a bare 409 by status — both Apple conflicts
  are 409 and they require opposite handling, so an unrecognised one lands in
  the fail-closed bucket.
- A 2xx is not acceptance. `verify` must return `{ ok: true, status: 'pending' }`
  and purchase-context must return `{ ok: true, appAccountToken: <uuid> }`
  before either is acted on; anything else is `unexpected-response`, which never
  finishes a transaction and never opens a payment sheet.

The 409 split is why `fetchJson` now carries the backend's `code` alongside
`status`: both conflicts are 409 and they require opposite handling. That is the
only shared-helper change, and it is additive.

## Restore

Every ownership-qualifying signed transaction is sent. No expiry comparison, no
"latest wins", no array-order authority. Above the backend's cap of 50 the
client returns a deterministic support state rather than slicing — truncating
would reintroduce exactly the array-order bug the backend rewrite removed.

A recognised purchase with no JWS reports `incomplete`, never
`no-restorable-purchases`; and an empty result never sets `plan = free`.

That holds **regardless of what the backend answered about the rest**. If one
purchase carried a JWS and another did not, the backend's "no restorable
purchases" is a statement about the transactions it was given — the unverifiable
one was never checkable, so the client cannot present the answer as complete.

Because "incomplete" and "some of it was queued" are both true at once, the
result carries a separate `queued` flag. Collapsing them would either hide a
partial success from the entitlement refresh, or overstate an incomplete restore
as a clean one. The paywall refreshes billing status whenever `queued` is true,
including on the `incomplete` path.

## Platform scope

iOS only, gated on `Capacitor.isNativePlatform() && getPlatform() === 'ios'`.
Web keeps Stripe unchanged, Android is untouched, and a browser spoofing an
iPhone user-agent cannot reach native purchase code. There is no Stripe fallback
inside the native app after an Apple preflight rejection.

## Verification

79 new tests, each of the security-critical ones mutation-verified with a no-op
control mutation to prove the harness reports real kills. Killed mutations:
re-enabling automatic finishing; deriving the token on-device; acknowledging
after a backend rejection; truncating restore at the cap; filtering restore by
account token; letting any 409 authorise finishing; trusting any 2xx from
verify; checking only the token shape instead of the contract; disabling the
recovery sweep; and publishing listeners without the generation guard.

**No Xcode/iOS compile was performed** — development is on Windows.
`npx cap sync ios` succeeds and registers `@capgo/native-purchases@8.1.2`, but
that is not a native build.
