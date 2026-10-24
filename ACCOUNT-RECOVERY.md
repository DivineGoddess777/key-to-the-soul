# Owned account recovery

Implemented October 18, 2026. Public deployment remains closed pending launch review. The owner separately approved a protected Preview test with one ordinary QA account and up to three account emails to support. That test passed, and the owner confirmed all three arrived and look good. The earlier receipt was independently confirmed received and looking good.

## Customer flow

`account.html` is linked from the tarot navigation and member dialog. Existing usernames/passwords continue to work. While signed in, a customer enters a recovery email and re-enters the current store password. The address becomes usable for recovery only after the customer explicitly confirms a single-use inbox link. Addresses already confirmed by another account are not reassigned. A confirmed address change queues an alert to the previous address.

Forgot password accepts a previously confirmed email and returns the same message for known and unknown addresses. It never assigns a new recovery address or grants paid access. A valid reset requires a matching pair of new passwords, 12–128 characters long. Success invalidates existing sessions and outstanding challenges, retains memberships/credits, queues a change notification, and requires an ordinary sign-in. Concurrent login work using the old password cannot mint a session after reset.

Links use 256-bit random tokens, stored hashed in challenges and encrypted with AES-256-GCM in the email queue. The mail key is derived from the receipt secret with an account-specific HMAC label. Encryption binds the environment. Tokens expire after 30 minutes and are consumed transactionally once. Link fragments are removed from the address before API calls, and the account document has a no-referrer policy. GET requests never consume links. Passwords and raw mail/SQL errors are not returned by the recovery API.

Requests have same-origin checks, bounded JSON bodies, persistent IP/account rate limits and neutral reset responses with a response-time floor. Email rendering uses the configured origin, escapes account text, fixes the sender to support, and labels Sandbox messages. Pending mail uses leases, bounded retries and expiry. Successful delivery clears the encrypted payload; expired/superseded challenges cannot be dispatched. SMTP cannot guarantee exactly-once delivery when acknowledgments are lost.

## Configuration

Apply `scripts/migrate-recovery.mjs` after the member schema. Preview and Production migrations have completed. Production recovery and transactional email were explicitly approved, configured and published on October 18. Recovery requires the mail settings, private receipt secret and durable database; no SMTP password belongs in client code. Production setup creates no test email.

The authenticated maintenance worker dispatches account emails only when recovery is enabled. The approved Production schedule runs every five minutes; an empty-queue authenticated invocation passed without sending email. The local SQLite development server deliberately keeps email recovery closed; use synthetic PostgreSQL fixtures for verification. Live paid enrollment rejects accounts without a confirmed recovery email. After the approved hosted test, the Preview recovery flag was restored to 0 for subsequent deployments; the immutable enabled test deployment remains protected and has no scheduled sender.

## Verification and remaining checks

- Full store suite: 118 passing checks, zero failures. Evidence: `qa/account-recovery-full-check.log`.
- Genuine Preview PostgreSQL: concurrent verification/reset consumes a link once; a concurrent old-password login cannot create a session. The disposable QA schema was removed. Evidence: `qa/account-recovery-postgres-concurrency.json`.
- Browser fixture: sign-in, confirmation request, email confirmation, forgot-password request and reset-form opening worked without real email. The token disappeared from the address. Password changes themselves were exercised through synthetic API/database tests. Evidence: `qa/account-recovery-browser-review.json`.
- No horizontal overflow at 320, 375 or 430 CSS pixels; 16px inputs with 52px control heights. Physical iPhone Safari still requires verification.
- Hosted API/SMTP recovery passed on `https://key-to-the-soul-b5ro6k7hq-saiyan-corp.vercel.app`: a new ordinary QA account confirmed its support recovery email, reset its password, rejected both token replays, revoked the old session/password and signed in with the new password. Browser sign-in with that new password also passed and displayed the confirmed address. The test used private tokens from the app's own encrypted outbox; no inbox was read, and it does not claim a human clicked the inbox links.
- Gmail accepted exactly three approved Sandbox messages to `support@keytothesoul.com`: confirmation, reset and password-change notice. Each outbox entry was recorded sent on its first attempt. The owner confirmed all three arrived and look good; no inbox was inspected. Evidence: `qa/account-recovery-hosted-end-to-end.json` and `qa/account-recovery-hosted-signed-in.png`.
- Cleanup verified zero active QA sessions, zero outstanding QA challenges and zero owner/invitation/paid-access grants. The ordinary test account remains in Preview, with its credential excluded from deployment. Production recovery is subsequently configured and published. Keianna confirmed her own inbox link; read-only verification on October 18 found the correct confirmed address, one SENT mail record and zero outstanding challenges, with her owner/member access retained. No inbox, password or token was read. See qa/keianna-production-recovery-confirmed.json.

Final closed review Preview: `https://key-to-the-soul-bleklt7bx-saiyan-corp.vercel.app`. Recovery sending, checkout and paid enrollment all report disabled. The successful enabled test deployment is retained as protected evidence; no recurring sender was activated. See `qa/account-recovery-hosted-review.json` and `qa/vercel-recovery-completed-preview-deployment.json`.

Design references: [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP email verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html).
