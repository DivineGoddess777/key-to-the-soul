# Orders and owner desk

Order infrastructure and the new guest checkout connection are implemented and tested with synthetic fixtures. Live ordering remains closed. The earlier genuine PayPal sandbox receipts tested the payment adapter before shipping-aware store orders were added; the new customer workflow still needs its own hosted payment test.

## What works

- Catalog-priced snapshots of candles and sizes, customer contact/address, processing time, policy version and a trusted shipping/tax quote.
- Transactional stock reservations with expiry/cancellation, explicit ready-stock or made-to-order availability per variant, and separate sandbox/live inventories.
- Idempotent capture application. The PayPal order ID, local custom ID, capture ID, status, currency and exact amount must agree. A paid order's stock is deducted once. Payments arriving after reservations expire go to PAYMENT_REVIEW without taking another buyer's stock.
- Owner desk at /owner.html: account sign-in, recent orders, customer/address and item details, stock management, hold cleanup and actual shipment carrier/tracking entry. Browser access is separately authorized from tarot membership, expires, and uses the existing secure session cookie. Regular members cannot use owner endpoints. No owner has been automatically granted Production access.
- PayPal webhook signature verification through PayPal's fixed API, durable verified-event ledger, deduplication, worker leases and retry recovery. A capture notification triggers a fresh PayPal order read before applying payment. The /api/paypal-webhook route is implemented but remains disabled without its private webhook ID; it is not registered or verified with genuine hosted event delivery. Refund/reversal reconciliation is still pending.
- Guest checkout at /checkout.html: server-priced delivery review, per-browser private order access, fixed shipping address sent to PayPal, durable payment retry leases, idempotent request IDs and receipt reconciliation. Address and contact information are not saved in localStorage. The ritual note stays in the browser. See CHECKOUT.md.

## Verification

The local browser owner desk uses an isolated in-memory QA database and clearly labeled sample orders. Its capture payload is synthetic: no PayPal payment, real customer or shipment was created. Owner sign-in, order details, stock update and shipment recording passed. At 390 px viewport width, body and scroll widths were both 375 px. See qa/order-desk-desktop.png, qa/order-desk-phone.png and qa/order-desk-review.json.

PGlite tests cover stock rollback, cancellation/expiry, session isolation, immutable snapshots, duplicate captures, late-payment review, made-to-order setup, webhook authenticity/retries and owner authorization. A separate real PostgreSQL test on an isolated transient schema in Preview confirmed simultaneous buyers cannot oversell one candle and duplicate capture confirmations deduct once. That temporary schema was removed; see qa/order-postgres-concurrency.json.

## Explicit owner administration

Load the intended database environment privately before running these commands. Run the member migration for the owner-expiry column and the order migration for order/stock/event tables. Neither grants access, configures stock nor enables payments.

```text
node --env-file=.env.vercel.local scripts/migrate-members.mjs
node --env-file=.env.vercel.local scripts/migrate-orders.mjs
node --env-file=.env.vercel.local scripts/owner-access.mjs status USERNAME
node --env-file=.env.vercel.local scripts/owner-access.mjs grant USERNAME HOURS
node --env-file=.env.vercel.local scripts/owner-access.mjs revoke USERNAME
node --env-file=.env.vercel.local scripts/orders.mjs --mode sandbox list
```

Owner grants expose customer order details and allow stock/shipment changes. Get the owner's explicit authorization before granting real account access. Production administration must explicitly load .env.production.local instead; --mode live requires KTTS_PRODUCTION=1. Do not copy Preview test users or stock into Production. The show command includes customer information; keep its output private.

## Still required for real orders

- Unused-return/cancellation details, per-variant availability and tax setup. Confirmed: made-to-order candles; PA 16335 shipping origin; $8.95 contiguous-U.S. shipping, free at $60 and up, twice-weekly dispatch after 3–5 business days handling, USPS Ground Advantage, damaged-transit replacement/refund and no used/burned returns.
- Complete reviewed shipping/tax configuration. The server uses the confirmed flat rate and never accepts browser totals; missing tax treatment keeps checkout closed. Initial configuration supports explicitly approved U.S. regions with no-tax treatment only.
- A genuine hosted payment through the new shipping-aware checkout; then private live credentials and separately approved live launch.
- Register the signature-verified webhook endpoint and test genuine PayPal event delivery, replay and lost-return recovery. Protected Vercel Preview authentication must not be weakened casually or bypass credentials shared in a callback URL.
- Refund/reversal handling, customer receipt/fulfillment emails, password recovery, pagination/search beyond the latest 100 orders, and a complete hosted owner/customer workflow test.
- Physical iPhone Safari check. The local phone-width browser review is not a physical-device test.

Personal reading queue and delivery are implemented; see PERSONAL-READINGS.md. The owner can prepare and save a written response in the member’s private room once the feature is enabled. This creates no email or payment. The request endpoints and paid enrollment remain closed by default.
