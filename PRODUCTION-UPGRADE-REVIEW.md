# Production upgrade ready for approval

**Approved and published October 18, 2026.** The user approved this scope while keeping payments closed. See `qa/vercel-production-upgrade-deployment.json` and `qa/production-upgrade-live-review.json` for the final deployment and public verification. Recovery, mail, the private tarot queue and the authenticated five-minute worker are active. A later shipment-status wording correction reflects the existing transactional email queue; it changes no payment or fulfillment logic.

Subsequent real-order preparation added abandoned-hold cleanup to the same authenticated worker, with 25 passing relevant checks and a passing Production smoke check. Current deployment/evidence: `qa/vercel-production-maintenance-deployment.json`, `qa/production-maintenance-live-review.json`, and `qa/launch-maintenance-check.log`. Keianna’s real recovery email is confirmed. Payments remain closed.

The new package is prepared locally at `release/vercel-production-ready-2026-10-18`. Its 77 runtime files match the protected Preview that passed 118 checks. The public build completed, and a 257-file package audit found no saved payment keys, SMTP password, receipt/maintenance secrets or private environment files.

## Completed Production preparation

- Keianna’s real account has the approved one-year owner role; her desk loads with zero orders and zero configured candle availability.
- Her single-use tarot invitation was redeemed and gives self-guided access until November 17, 2026.
- The approved Live PayPal and Workspace SMTP credentials are now stored as sensitive Production-only Vercel settings, alongside separate receipt/maintenance secrets.
- Readback confirmed checkout, paid enrollment, email, recovery, personal requests and Sandbox controls are disabled. No new build, charge, agreement or email was created in this credential step.

## Proposed next step

1. Apply the tested additive personal-reading, subscription and recovery database migrations. These create structure, not customers, payments, credits or subscriptions.
2. Register the Live PayPal app’s signed payment/subscription callback at `https://www.keytothesoul.com/api/paypal-webhook`. No protection-bypass token is needed on this public domain.
3. Enable transactional email, account recovery and the private personal-reading room/owner queue. Email will send for customer-requested recovery and genuine order events; no new test email is proposed.
4. Publish the reviewed upgrade to `www.keytothesoul.com`. Add an authenticated background worker that runs every five minutes to deliver queued mail and reconcile memberships when billing is eventually enabled.
5. Verify owner access, empty Production queues, unauthenticated access restrictions, recovery availability, callback rejection of unsigned events and disabled checkout/enrollment.

**Real checkout and new paid subscriptions remain disabled.** No Live plan, agreement, charge or owner reading credit is created by this upgrade. Final availability, tax and policy decisions remain before a separately approved payment launch.

This step changes the public build and turns on customer-triggered account mail. It therefore needs approval beyond the completed credential-storage permission, which explicitly kept all services disabled.

Reviewed protected Preview: https://key-to-the-soul-bleklt7bx-saiyan-corp.vercel.app

Evidence: `qa/production-closed-settings-verified.json`, `qa/production-upgrade-review.json`, `qa/production-upgrade-package-audit.json`.
