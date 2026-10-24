# Keianna's personal reading room

Confirmed by the owner October 18, 2026: $11.11/month, one personal reading by Keianna earned per paid month, unlimited self-guided deck access while membership is active, up to 15 unused personal readings banked, cancel anytime. The bank is a maximum of 15 unused credits, not a 15-day expiry. No expiry was invented for purchased personal-reading credits.

## Implemented

- A per-member, environment-scoped bank and immutable monthly payment ledger. An internal verified-payment application earns one credit, once, and extends paid deck access through that paid period. Duplicate payment IDs or billing periods cannot earn again. Renewals never raise the unused balance above 15.
- Personal request form in the tarot room, with a server-enforced debit of one credit. Request retries are idempotent and two requests cannot spend the same last credit. Questions and completed readings are private to the signed-in account. The form clearly says the request is shared with Keianna.
- Owner queue in /owner.html, requiring separately granted, unexpired owner access. Keianna can mark a request in progress, write the personal response and deliver it to the member's room. Delivered text is immutable except an identical safe retry. Self-guided deck draws and optional local AI reflections never enter this queue or consume personal credits.
- Paid deck access is separate from invitation access and the reading bank. Ending deck access does not delete saved readings or banked credits. CLI deck-access revocation is not subscription cancellation and does not stop any future billing.

The current delivery format is written text inside the private member room. No video, live appointment, voice recording, delivery-time promise or outbound email was invented.

## Sandbox verified; live billing closed

Recurring PayPal enrollment, payment reconciliation and cancellation passed the hosted Sandbox test. Buyer-approved agreement I-7D1JBUK8XSD0 produced completed USD 11.11 transaction 5JG43347CK847754U, earned exactly one personal reading credit and unlocked the deck. A full self-guided reading opened without spending that credit. Cancellation was confirmed by a fresh PayPal read and its genuine signed callback; the paid period and one unused credit remained. This involved no real money. A future monthly renewal was tested synthetically, not by waiting for or charging another real cycle. See qa/paypal-tarot-end-to-end-review.json.

`applyPaidMonth` remains an internal store method, not an HTTP grant action. Only verified PayPal plan/payment evidence may invoke it. No browser claim can grant credits. Live credentials, account recovery and Production owner setup are now configured. Membership tax treatment, final business decisions, a Live plan and explicit paid-enrollment approval remain launch work.

`KTTS_PERSONAL_READINGS_READY=1` enables the request/owner endpoints only after deployment setup. It does not create credits, enable PayPal billing or grant owner access. Default is closed. Migration adds tables and the paid deck-expiry column only:

The Production schema and this flag were explicitly approved and enabled on October 18. Keianna’s signed-in owner desk displays the empty private queue. No Production payment, personal-reading credit or request was seeded; new paid enrollment remains closed.

The current tested plan validator requires an exact USD 11.11 charge and rejects nonzero plan taxes or subscription plan overrides. A reviewed membership tax decision is therefore required before creating the Live plan. If tax must be charged or included, the billing adapter, payment verification, customer terms and tax recordkeeping need matching implementation and tests; setting the tax-review flag alone is insufficient. This describes the current code boundary, not a tax determination. Keianna’s real owner account now has a confirmed recovery address.

```text
node --env-file=.env.vercel.local scripts/migrate-members.mjs
node --env-file=.env.vercel.local scripts/migrate-personal-readings.mjs
```

Production migrations must explicitly load .env.production.local. Never seed real accounts from QA fixtures or extend a test account beyond its approved duration. No hosted test-account credit or Production owner grant was created for these tests.

## Verification

Automated tests exercise the bank cap, duplicate renewals, per-member privacy, request replay, the last credit, immutable delivery, role/origin checks and serverless POST handling. The complete local member → request → owner → delivery → member workflow passed with clearly labeled synthetic data. At 390 px viewport width, body and scroll widths were both 375 px; a physical iPhone remains untested.

The real PostgreSQL concurrency test uses transaction-local schema selection, required for the pooled connection. It creates and removes a disposable schema; its synthetic users are not application accounts. An earlier test-harness failure was corrected and audited: no synthetic users or credits appeared in public application tables. See qa/personal-reading-postgres-concurrency.json, qa/personal-reading-isolation-audit.json and qa/personal-reading-*.png.

PayPal API references: [Subscriptions API](https://developer.paypal.com/api/subscriptions/v1), [published schema](https://developer.paypal.com/api/subscriptions/v1/schema.json). The Sandbox agreement was approved, paid and canceled. No live agreement or live charge was created.

## Billing integration

`server/subscriptions-*`, `server/subscription-core.mjs`, `server/subscription-reconcile.mjs` and `server/paypal-subscriptions.mjs` own account binding, consent, one-open-agreement enforcement, remote operation leases and monthly payment reconciliation. Approval does not grant access. Only an exact USD 11.11 completed transaction for the configured monthly plan can earn a credit. UTC calendar boundaries preserve month-end anchors. Cancellation is confirmed through a fresh PayPal read and preserves the paid period and unused credits. Duplicate notifications and payment IDs do not earn twice.

Each granted credit now records its funding payment. A full refund or verified reversal removes that unused credit; already requested, undelivered work is held for payment review. Saved completed readings remain visible. Partial refunds are recorded without inventing a policy that deletes purchased access. A reversal arriving before completion creates a non-spendable payment record, preventing a late completion from resurrecting it.

Sandbox setup record: `.data/paypal-sandbox-membership-setup.json` (private local metadata, excluded from deployment). No live product, plan or buyer agreement was created. Preview needs `PAYPAL_SANDBOX_TAROT_PLAN_ID`, `PAYPAL_SANDBOX_WEBHOOK_ID`, `KTTS_SUBSCRIPTIONS_SANDBOX=1` and existing Sandbox credentials. Live billing requires separate live credentials/plan/webhook, `KTTS_LIVE_SUBSCRIPTIONS=1`, `KTTS_PRODUCTION=1`, private `CRON_SECRET` and reviewed membership tax treatment. No live flags are enabled.

`GET /api/store-maintenance`, authenticated only with the private cron bearer, checks due subscriptions and dispatches queued store email. Add the Vercel runtime schedule when private Production setup is verified; no schedule is enabled yet. Webhooks are the primary renewal path. Member refresh also reconciles payment history. The specifically approved temporary callback token was revoked after testing, and a request using it now returns to Vercel authentication. The pre-existing CLI token remains intact. New Sandbox enrollment is closed on the final Preview; existing paid access and banked credits remain. Do not reuse the revoked token or treat the old callback as launch configuration.

The hosted test exposed two provider cases now fixed: pending agreements have no transaction-history resource, and renewal UTC hours differ from signup hours. Pending lifecycle events process without granting access. New paid periods use the verified scheduled billing hour; existing funded periods remain immutable on replay. Calendar-boundary, early-hour renewal, legacy-period replay and duplicate-credit tests pass. The final full suite passed 110 checks.
