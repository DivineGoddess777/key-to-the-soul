# Key to the Soul — local development and owned store code

Vercel is now the deployment target. See [VERCEL.md](VERCEL.md) for the prepared serverless build, durable PostgreSQL accounts, model delivery and domain connection. The SQLite setup below is for the local hot-swapping preview.

## Current architecture

Node.js 24+ serves the site and streams model files in 64 KB chunks. SQLite holds our own accounts, hashed sessions and expiring membership invitations in .data/members.sqlite. Browser workers run the optional language and narration models. No model API credentials are needed.

The Ember Oracle is /tarot.html. Its original 78-card meanings work immediately after member sign-in. Quick, Standard and Deep draw 1, 3 and 5 unique cards. Optional reversed cards have separate meanings. Readings remain in memory unless the visitor chooses a text download.

Selected local models: Qwen3-0.6B q4f16 (about 579 MB including tokenizer) and Kokoro-82M with af_heart: q8 for standard WASM (about 93 MB) or fp16 for WebGPU (about 164 MB). The deployment pack contains both voice variants, about 835 MB total with the reader, plus the browser runtime. Visitors download only the selected variant unless graphics initialization requires a fallback. Both are pinned to commits and checked against upstream file sizes and LFS SHA-256. See models/manifest.json. Earlier smaller text candidates failed quality checks and are excluded from deployment packages.

Models download only after the visitor requests them. CacheStorage can reuse them, subject to browser storage limits/eviction. A clear-cache control is provided. A Web Locks guard prevents simultaneous model jobs across tabs where supported; each room also permits only one job at a time. The reader and voice prefer WebGPU when shader-f16 is supported. The voice falls back to the standard local model if graphics loading or generation fails. Browser/device support and speed vary; actual iPhone Safari testing is still required. The written reading remains usable if a model fails. The standard WASM narration took several minutes in browser QA to prepare a 50.5-second reading; the graphics path completed substantially faster. Natural narration can take minutes; an installed local English device voice is offered when available. Neither method records the microphone.

No reading prompt or narration text is sent to an AI provider. Runtime weights, tokenizer, voice style, fonts, Three.js and inference runtime are served by this site. The PayPal SDK is loaded only on the explicitly enabled sandbox page.

## Local work

Run npm install, npm run models:download and npm run edge:build when preparing assets from source. npm run dev starts the hot-swapping browser preview. npm run check runs the suite. npm run start also reads .env.local if present.

Account creation is separate from access. An account alone does not unlock tarot. From the server owner's terminal:

    node scripts/members.mjs invite --days 30 --uses 1 --expires-days 30
    node scripts/members.mjs grant USERNAME --days 30
    node scripts/members.mjs revoke USERNAME

Give an invitation privately to its intended recipient. The one-day ember_preview_1017 grant was explicitly approved for local QA and expires automatically. The production package excludes that database.

Membership currently uses invitations while paid enrollment stays closed. Recurring billing, signed PayPal callbacks and password recovery are implemented; the billing flow passed Sandbox payment/cancellation tests, and Production recovery is configured. Live enrollment still needs final tax/business settings, a matching Live plan and an explicitly approved opening. See status.md for the current handoff rather than treating older development notes as launch status.

## PayPal developer sandbox

Open /paypal-sandbox.html. It restores this browser's saved ritual bag and uses the six owner-confirmed size prices on the server. It creates no customer order or shipment. Shipping and tax are intentionally omitted from this developer test.

Copy .env.example to .env.local locally and set KTTS_PAYPAL_SANDBOX=1 plus PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET from an owner-controlled PayPal sandbox app. The client ID is public; the secret stays on the server. Restart the server. Never put the secret into browser JavaScript or commit the env file.

The adapter always calls api-m.sandbox.paypal.com, uses request idempotency, binds test orders to their checkout session, and verifies completed USD amounts before marking a local test complete. Sandbox mode is disabled when KTTS_PRODUCTION=1. Unit tests mock PayPal; no real PayPal sandbox transaction has been tested because credentials have not been supplied.

## Deployment

The earlier Droplet plan is superseded. Use VERCEL.md; do not upload a release/store archive as a Vercel deployment. scripts/package-store.mjs remains an optional conventional Node-server export for portability. It is not the active hosting plan.

Vercel accounts use the custom PostgreSQL adapter, while local development uses SQLite. PayPal sandbox also supports a member-gated Vercel Preview with durable PostgreSQL test records. Production checkout stays closed. The protected Vercel Preview, an approved Neon Free database and approved usage-billed model Blob store have been created. The approved public storefront is connected at https://www.keytothesoul.com. Production data is separated from Preview within Neon Free. No live payment has been performed.
