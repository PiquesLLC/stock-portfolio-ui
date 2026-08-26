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

What this PR does about it:

- The **purchase** path is fully compliant — we own the finishing there.
- The listener still submits the JWS (that is how renewals and
  crash-window purchases reach the backend), and we still never call
  `acknowledgePurchase` ourselves on failure, so the rule holds the moment the
  plugin stops auto-finishing.
- Until then the real recovery path for a failed update is **Restore
  Purchases**, which reads full history and is therefore not affected.

This was not worked around silently, and no plugin patch was vendored.

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

| Backend response | Finish the transaction? | Unlock? |
|---|---|---|
| 202 `pending` | yes | no — wait for billing/status |
| 409 `billing_rail_conflict` (post-charge) | **yes** | no |
| 409 `apple_ownership_conflict` | no | no |
| 400 permanent verification failure | no | no |
| 503 transient / 500 | no | no |

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

## Platform scope

iOS only, gated on `Capacitor.isNativePlatform() && getPlatform() === 'ios'`.
Web keeps Stripe unchanged, Android is untouched, and a browser spoofing an
iPhone user-agent cannot reach native purchase code. There is no Stripe fallback
inside the native app after an Apple preflight rejection.

## Verification

49 new tests, each of the security-critical ones mutation-verified with a no-op
control mutation to prove the harness reports real kills: re-enabling automatic
finishing, deriving the token on-device, acknowledging after a backend
rejection, truncating restore at the cap, and filtering restore by account token
were all killed.

**No Xcode/iOS compile was performed** — development is on Windows.
`npx cap sync ios` succeeds and registers `@capgo/native-purchases@8.1.2`, but
that is not a native build.
