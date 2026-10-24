# Vercel deployment handoff

## Current live site — October 17, 2026

https://www.keytothesoul.com is public on the approved Production build. The bare keytothesoul.com domain redirects there with HTTP 308. HTTPS, public page delivery, custom-domain account API access and the live Moon Garden interaction were verified. Vercel marks both domains Valid Configuration. Ordering and live payments remain closed. See qa/domain-connection-review.json.

Production now uses the empty ktts_production database inside the existing Neon Free project. Preview stays on neondb with its sandbox data. No QA account, access grant or sandbox order was copied into Production. Private Production settings use the canonical HTTPS origin and KTTS_PRODUCTION=1. PayPal credentials remain Preview-only.

Vercel replaces the earlier Droplet plan. The local preview remains unchanged: `npm run dev` runs the editable storefront at http://127.0.0.1:5173.

## Latest photo and sandbox update

All four featured candle photos and the Love story image now use the supplied warm copper photos on the public domain. Prosperity also has an accurately labeled original alternate view. Phone-width review had 375 px body/scroll widths and no horizontal overflow. Production deployment: dpl_36sZC37GQuHt5oi1YPHmaFEkusGJ.

The latest protected Preview is https://key-to-the-soul-ctcjgovqk-saiyan-corp.vercel.app (dpl_5skoZWUvZMMTdbRt36WThKXCKmRe). All 62 checks pass. Its payment APIs still reject visitors without active member access. With separate owner approval, the existing hosted QA member was renewed for one hour for the completed hosted sandbox test; see qa/hosted-qa-renewal.json. No Production access was granted.

## Tarot visibility and membership status

The live homepage now has a copper tarot feature after the candle collection, an Explore the tarot room hero link, and explicit Tarot readings navigation, including the phone menu. The public reader is https://www.keytothesoul.com/tarot.html. Local member sign-in, a fresh Standard three-card reading, and immediate voice start/stop were rechecked; the earlier hosted local-model/natural-voice evidence remains in qa/vercel-hosted-review.json. Invitation access works. Paid membership purchase and automatic activation are not yet connected, and membership price/duration are awaiting Keianna’s decision. See qa/tarot-discovery-review.json.

## What is prepared

- `vercel.json`: static storefront output and one Node 24 API function.
- `npm run build:vercel`: copies an explicit public-file list into `dist/`. Private databases, credentials, server source, QA screenshots, rejected model candidates and model weights are excluded.
- `server/membership-postgres.mjs`: our own account/session/invitation code using standard PostgreSQL. Passwords remain scrypt hashes; sessions are hashed, expiring and HttpOnly/Secure. Invitations lock transactionally; rate limits persist across function instances.
- `server/members-schema.sql` and `npm run db:migrate`: explicit schema setup; neither creates an account nor grants membership.
- The member API serves the small protected tarot modules after checking membership. Large pinned model files receive a member-checked redirect to owner-controlled asset storage.
- Unconfigured membership returns a safe unavailable response. The storefront and Moon Room still work. Live checkout remains closed. PayPal developer testing supports both local development and a member-gated Vercel Preview with durable test records.

## When access is needed

No Vercel login or domain change is needed for local development. When the preview is ready to publish, connect the project using the owner's existing signed-in Vercel account. The owner already has Pro. The project key-to-the-soul now exists in Saiyan Corp. The owner approved Neon Free (Neon built-in auth disabled) and Vercel Blob usage for the protected preview.

The deploy root is the folder containing `package.json` and `vercel.json`: the inner `key-to-the-soul-main` folder in the supplied download. Select Framework Preset **Other**, Node **24.x**, build command **npm run build:vercel**, output **dist**. The root config provides these build settings.

This download currently has no Git history or remote. We can connect an owner-controlled Git repository or use the Vercel CLI when deployment is authorized. Do not upload the entire Downloads directory. `.vercelignore` excludes private local data and the large model directories.

## Durable storage and environment

Vercel functions cannot persist the local SQLite file. Connect a standard PostgreSQL database with a suitable pooled connection string. This is infrastructure for our custom code, not hosted authentication. The adapters use parameterized SQL and small connection pools for accounts and PayPal test records. Choose its provider, region, retention/backups and costs with the owner before provisioning. Set these privately in Vercel:

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | Private PostgreSQL connection URL; use provider-required TLS and pooling |
| KTTS_ORIGIN | Exact HTTPS storefront origin, with no trailing slash |
| KTTS_MODEL_BASE_URL | HTTPS public asset-pack base URL, ending in a slash |

The Neon integration originally connected neondb to both environments. With explicit owner approval, Production DATABASE_URL now points to the separate ktts_production database; Preview remains on neondb. This separation was checked through database queries and a public invalid-login probe that exercised the Production connection. The owner chose changing preview addresses: when KTTS_ORIGIN is absent, the adapter uses only Vercel-provided VERCEL_URL on VERCEL=1 / VERCEL_ENV=preview, validated as a single vercel.app hostname. Production requires an explicit exact HTTPS KTTS_ORIGIN. Never trust a request Host header. Vercel Authentication remains enabled for the preview.

Run `npm run db:migrate` from a trusted terminal with the selected database connection available privately. Runtime traffic does not run schema migrations. The owner commands use Postgres when DATABASE_URL is set and local SQLite otherwise:

```text
npm run members -- invite --days 30 --uses 1 --expires-days 30
npm run members -- grant USERNAME --days 30
npm run members -- revoke USERNAME
npm run members -- cleanup
```

Invitations are private access credentials. Cleanup deletes expired sessions/rate-limit records and spent or expired invitations; it does not delete accounts. The local QA account and its approved one-day access are not uploaded. A separate ember_hosted_qa_1017 test account has the owner-approved one hour of hosted access; its password is private and the database stores only its hash.

## AI asset delivery

Inference stays in the visitor's browser; no model API key is needed. The selected pinned pack is approximately 835 MB before the browser runtime. It contains Qwen3-0.6B q4f16 plus both Kokoro voice variants; visitors download only what they request.

Upload only the files listed in `models/manifest.json` to owner-controlled object storage/CDN, preserving paths after `models/`. For example, the base URL plus `reading-qwen3/onnx/model_q4f16.onnx` must serve the corresponding manifest file. Use the manifest hashes/sizes to verify the upload. The CDN must serve binary data directly, allow cross-origin GET/HEAD and Range requests from the store, and use immutable, versioned asset-pack URLs. Test a full download, cancellation, cache reuse and voice playback on the hosted preview before launch.

Model files are open-license public assets at their final CDN URLs. The application checks membership before issuing their redirect; this is not DRM over a visitor's downloaded models. The original tarot meanings and member session API stay server protected. Public worker/runtime code contains no credentials.

No 580 MB model is buffered through a Vercel function, and no model weight is included in its bundle. Hosting, storage and bandwidth still have costs even though there is no per-reading model API bill. The selected asset pack is now uploaded to the dedicated key-to-the-soul-models Vercel Blob store, under its manifest-hash version. Only public model assets were uploaded; credentials and private readings are excluded. The upload credential stays local and is not needed by runtime functions. qa/vercel-model-upload.json records sizes, hashes and URLs. CDN-compressed streams use the pinned decoded byte count so the browser model loader can allocate one buffer and report meaningful progress. Large model downloads use bounded 8 MiB ranges with interrupted-part retries; cancellation aborts their requests. Servers that ignore ranges retain the regular full-response fallback.

## PayPal sandbox connection

The unlinked developer page is /paypal-sandbox.html. On Vercel, the sandbox requires an active member and VERCEL_ENV=preview. Set KTTS_PAYPAL_SANDBOX=1, PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET **only in Preview**. KTTS_PRODUCTION=1 also disables the sandbox. Production never enables it, even if these settings are copied there accidentally.

Use the owner-controlled PayPal sandbox developer app and a sandbox buyer. The client ID is public; the secret stays in private environment settings. Never paste the secret into chat, frontend source or Git. Locally, the same values go in .env.local. No live credentials are needed for this stage.

The PostgreSQL migration includes durable sandbox test records. Server pricing ignores client totals. Database claims prevent overlapping create/capture calls; request IDs are reused for retry. Capture retries first read the PayPal order so a payment whose response was lost can be reconciled without a second capture. A stale unfinished create attempt stops after six hours. No real order, shipment, paid membership or customer fulfillment is created.

Automated tests use mocked PayPal responses with a local PostgreSQL engine. The owner's sandbox app has been connected privately in Vercel Preview only. Real sandbox OAuth and idempotent order creation passed locally; the hosted Preview also created and persisted a $12 sandbox order. The popup issue is addressed by a same-tab approval option using PayPal’s returned sandbox link and fixed same-origin return/cancel URLs. The owner created a separate Sandbox Personal buyer and approved a $12.00 USD Mini candle payment. The full same-tab local browser flow completed for order 9LX09244D1840181L, capture 57P96990AJ2947645. Both PayPal order/capture statuses were read back as COMPLETED, and the local SQLite record matches the IDs, candle, quantity and amount. The hosted Vercel end-to-end test subsequently completed as well: order 16U88322NC8410915, capture 42S083309L834712R, $12.00 USD. The protected Preview browser returned with a completed receipt, PostgreSQL persisted the same capture, and a separate PayPal Sandbox readback confirmed both statuses COMPLETED. No real charge, production account, shipment or customer order was created. See qa/paypal-vercel-completed-payment.json and qa/paypal-vercel-completed.png. See qa/paypal-sandbox-completed-payment.json and qa/paypal-sandbox-completed.png. A normal PayPal login is used only for the Developer Dashboard, not as the sandbox buyer. Confirmed captures render a test receipt with the order/capture IDs and server-verified amount. Interrupted captures can resume after a reload and reuse the same order. See qa/paypal-sandbox-checkout-review.json. Do not enable live checkout until shipping/tax, inventory, durable customer order workflows and verified webhooks are finished.

## Upload packages

Run npm run package:vercel after npm run check and npm run build:vercel. It creates two new folders under release/ and records them in release/latest-vercel-package.json:

- vercel-TIMESTAMP contains the deploy source, prebuilt browser assets and a minimal pg dependency list. Private local data, secrets and model weights are excluded.
- model-pack-TIMESTAMP contains only the selected model files. Every byte count and SHA-256 is checked while copying. Keep its folder as an immutable asset-pack version.

Vercel installs only the small server dependency from the deploy package. The source project retains its full development setup. Model upload goes to owner-controlled storage, separate from the function bundle.

## Her domain

Use a Vercel preview address to test first. Then add her existing domain to the Vercel project and follow Vercel's current DNS instructions at her domain registrar/DNS host. The domain need not be transferred. At that stage we need its name and authorized access to its DNS settings. Confirm both the chosen main address and any www redirect, HTTPS, and the exact production KTTS_ORIGIN.

Review the existing DNS records before changing only the records required for the website; retain any mail records. Account cookies are scoped to the current site, so visitors sign in again after switching from the preview address to the final domain.

## Verification and remaining work

`npm run check` runs the existing store tests plus PostgreSQL-engine tests through local PGlite and serverless Request/Response integration tests. These check hashes/session expiry, atomic invitation use, shared limits, async membership handling, model redirect restrictions and public-build exclusions. PGlite tests do not replace a connected production-Postgres concurrency test.

Protected Preview deployment is ready; see qa/vercel-deployment.json for the current address. Neon Free is connected and migrated, hosted account sign-in and protected deck delivery passed, device narration passed, and the hosted PayPal adapter completed a buyer-approved sandbox capture with matching PostgreSQL and PayPal readback. Unauthenticated deck/model requests return 403/no-store. Hosted WebGPU reader inference, a cached reader retry, the full reader SHA-256 and two natural narration/playback passes succeeded; see the QA reports. Physical iPhone Safari testing remains pending. Live payments and paid membership billing remain unperformed. The approved production publication and DNS connection are recorded in the current live-site section above.

Live commerce still needs real inventory/availability, remaining shipping/tax decisions, genuine hosted testing of the new shipping-aware checkout, registered webhook delivery, refund/reversal reconciliation, transactional email, final policies and membership billing/password recovery. Durable order records and the owner stock/shipment desk are implemented and tested with synthetic data. Physical iPhone Safari model and audio testing remains necessary.

Official references: [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [SQLite limitation](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [Hobby plan](https://vercel.com/docs/plans/hobby), [domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## Domain review

The owner supplied www.keytothesoul.com. Read-only DNS review on October 17 found an apex A record 216.198.79.1, www CNAME 1cd3c2c330e91c86.vercel-dns-017.com, and Porkbun forwarding MX records fwd1.porkbun.com/fwd2.porkbun.com. The domain already points toward Vercel but is not accessible under the Saiyan Corp team in the CLI. Verify current ownership/project association before changing it. Porkbun was still at sign-in; no DNS records were changed. The current domain serves the earlier Key to the Soul handmade-crafts placeholder, which remains in place. Preserve email records.

Domain connection completed with separate owner approvals for the bare-domain redirect, Free production database and public production publication. DNS changes were limited to the apex A record, www CNAME and two _vercel ownership TXT records. Porkbun nameservers, MX, SPF and prior ACME records were preserved. Older domain-review paragraphs describe the pre-connection state. Production owner CLI commands must load .env.production.local explicitly; do not use the local preview SQLite database or Preview credentials for real member administration.

## Google Workspace mail

With explicit owner approval, keytothesoul.com was subsequently added as a verified secondary domain in the existing Saiyan Corp Workspace. Gmail is activated. The aliases keianna@keytothesoul.com and support@keytothesoul.com are saved on the existing keianna@saiyancorp.io user. No user or paid license was added; saiyancorp.io remains primary. Porkbun's bulk Google Workspace preset replaced both forwarding MX records with priority 1 smtp.google.com and the single SPF record with v=spf1 include:_spf.google.com ~all. Google's unique 2048-bit DKIM public key is published at google._domainkey; Google reports Authenticating email with DKIM. Authoritative DNS verification confirms website A/CNAME records are preserved. Google logged successful support-alias delivery and Keianna confirmed receipt. Both Gmail Send mail as addresses are verified in Accounts settings, and replies are configured to use the address contacted. See qa/workspace-mail-after.json and EMAIL-SETUP.md. The requested outgoing support test was received with SPF PASS and aligned keytothesoul.com DKIM PASS. DMARC remains unfinished, and independent external-domain delivery remains untested; see EMAIL-SETUP.md and qa/email-outgoing-authentication.png.

## Shipping-aware checkout and owner desk — October 18

Guest checkout, immutable order snapshots, atomic stock holds, payment retry leases and the owner desk are implemented. Protected Preview owner sign-in, stock saving, order details and shipment recording passed with a synthetic order; unauthenticated order requests return 401. No Production owner grant or live payment was made. The new shipping-aware checkout has isolated browser and automated tests but still needs a genuine hosted sandbox transaction. The prior USD 12 hosted sandbox receipt is proof of the earlier adapter only.

The confirmed shipping/return and $11.11 monthly tarot terms are recorded in LAUNCH-READINESS.md. Shipping origin is PA 16335; candles are made to order. Tax treatment, per-variant availability and final policies still need configuration. CHECKOUT.md documents explicit flags and configuration gates. The new customer checkout and webhook callback remain closed without those settings. Webhook registration/delivery, refunds/reversals and automated order email remain unfinished.Runtime PostgreSQL connections qualify the fixed application table names with `public` at the connection boundary. Migration commands use a direct Neon connection with TLS verification and transaction-local `search_path`; core stores remain schema-neutral for isolated tests. Do not use session-level `SET search_path` on transaction-pooled connections. See https://neon.com/docs/connect/connection-pooling. A former test helper left a schema setting on Preview pool connections; the corrected helper and application qualification were verified, and the leftover synthetic schema was removed. No customer data was changed by that test.

Public shipping/photo update verified at https://www.keytothesoul.com on October 18, 2026. Production deployment: https://key-to-the-soul-p11dux5zp-saiyan-corp.vercel.app (dpl_8dV7scoxyiUP9DtHLfFzSPSsK2ZD). Current protected Preview: https://key-to-the-soul-3phbqswnd-saiyan-corp.vercel.app. Production customer checkout config reports enabled=false; sandbox config reports enabled=false; unauthenticated owner orders return 401. See qa/production-shipping-review.json and qa/vercel-production-shipping-deployment.json. No live credentials, live launch flags or Production owner grants were added.

## Personal reading bank — October 18

The owner confirmed PA 16335 shipping origin, contiguous-U.S. flat shipping, free shipping at $60 and up, and the tarot plan: $11.11/month, one Keianna reading earned monthly, unlimited self-guided deck and up to 15 unused readings banked. Personal credit/request/delivery infrastructure is implemented and locally browser-tested with synthetic data. It stays closed behind KTTS_PERSONAL_READINGS_READY until its paid subscription integration is finished. No real credits, paid subscription or expanded QA access were created. PERSONAL-READINGS.md records the boundaries and test evidence.## Current Production upgrade — October 18With separate explicit approvals, `keianna` has one year of owner access; Live PayPal/Workspace SMTP credentials and separate receipt/maintenance secrets are sensitive Production-only settings; and the tested store upgrade is published at https://www.keytothesoul.com. The additive schemas are ready, Live signed callbacks are registered, and recovery, transactional email and the empty private reading queue are enabled. Production cron invokes the authenticated maintenance endpoint every five minutes. Public API checks and an authenticated empty-worker invocation passed. Real checkout and paid enrollment remain disabled, and no Live plan, charge or agreement was created. No Production test email was sent. See LAUNCH-READINESS.md and qa/production-upgrade-live-review.json for current evidence; earlier sections describe historical setup stages.
