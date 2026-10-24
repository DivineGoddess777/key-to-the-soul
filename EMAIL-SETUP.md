# Key to the Soul email

Configured October 17, 2026 (EDT), with the owner's explicit approval.

Both addresses deliver to Keianna's existing Google Workspace mailbox:

- keianna@keytothesoul.com
- support@keytothesoul.com

She continues signing in as keianna@saiyancorp.io. These are aliases, so no extra paid user was created. Saiyan Corp's existing Workspace administrators control this domain's mail. The primary Workspace domain remains saiyancorp.io.

## Verified configuration

- Domain: verified secondary domain; Gmail activated.
- MX: smtp.google.com, priority 1. Previous Porkbun forwarding MX records replaced together.
- SPF: v=spf1 include:_spf.google.com ~all. One SPF record only.
- DKIM: a unique 2048-bit Google key is published at google._domainkey.keytothesoul.com; Google reports "Authenticating email with DKIM."
- Website A and www CNAME, Vercel ownership records, and prior ACME records retained.
- Evidence: qa/workspace-mail-before.json, qa/workspace-mail-after.json, qa/workspace-aliases-saved.png, qa/workspace-dkim-active.png.

## Remaining mailbox checks

Google Workspace Email Log Search confirmed the owner's TEST message to support@keytothesoul.com was delivered to the Gmail mailbox on October 17 at 11:13:22 PM EDT. The sender was in the same Workspace (saiyancorp.io), so this proves alias delivery but does not replace an external inbound or outbound authentication test. Keianna confirmed receiving the message. Evidence: qa/workspace-support-delivered.png and qa/workspace-mail-after.json.

The owner subsequently reauthorized access limited to Gmail sender setup. Both keianna@keytothesoul.com and support@keytothesoul.com are now visible in Gmail Accounts → Send mail as. The owner added them in Gmail's separate popup. The agent enabled "Reply from the same address the message was sent to" and Gmail confirmed the preference was saved. New messages still default to keianna@saiyancorp.io; she can choose a new alias in the From selector. No password was changed. The owner later explicitly requested the outgoing email test described below. Evidence: qa/gmail-send-as-complete.png.

1. Send an external test to each alias and confirm both arrive in Keianna's existing inbox. Do not declare delivery tested until a message arrives.
2. Sender setup is complete for both aliases. Choose the intended address in the From selector when starting a new message; replies are configured to match the address contacted.
3. Outgoing test completed: support@keytothesoul.com sent the requested KTTS-1017 test to dakuwon@saiyancorp.io at October 17, 11:24:24 PM EDT. It arrived after 12 seconds. The received Original Message reports SPF PASS (primary-domain envelope sender) and DKIM PASS with keytothesoul.com signing, aligned with From. This recipient is in the same Workspace; independent external-domain delivery remains untested. Evidence: qa/email-outgoing-authentication.png.
4. DMARC remains unfinished: Gmail showed DMARC FAIL and no DMARC policy is published. Google recommends allowing SPF/DKIM to operate for 48 hours before DMARC rollout, initially monitoring with p=none. Review no earlier than October 19, 11:12 PM EDT. No reporting mailbox, enforcement policy or automation was invented.

Some recursive DNS caches still briefly showed the previous Porkbun SPF while the authoritative server and Google's Admin console showed the correct Google record. Google notes alias changes can take up to 24 hours; do not keep rewriting correct DNS during propagation.

Store transactional email is a separate integration. Setting up a human support mailbox does not yet send order confirmations or password-reset messages from the custom store.

## Store email implementation — October 18

The store now has a transactional outbox, copper receipt/shipment/payment-update templates and 30-day read-only receipt links. The SMTP adapter uses `smtp.gmail.com:465` over TLS, authenticates as the existing `keianna@saiyancorp.io` user and sends from the configured `support@keytothesoul.com` alias. It does not read the inbox. Synthetic delivery/lease/backoff tests pass. The subsequent hosted SMTP test is recorded below.

Private setup remains necessary. Google requires 2-Step Verification for app passwords, and organization policy can make them unavailable. Keianna must create the credential herself; do not enter her normal Google password into the store or paste any credential into chat. An app password is an account credential with broader mailbox capability than this send-only implementation uses. Saving it in Vercel requires explicit approval of that access and destination. If it is unavailable or unacceptable, use an approved OAuth mail integration rather than weakening account security. [Google app-password guidance](https://support.google.com/accounts/answer/185833).

Google documents authenticated Gmail SMTP with an app password on SSL port 465; sending limits and organization policy still apply. Before live checkout, configure the private credential and receipt secret, approve a specific test recipient, verify an actual receipt arrives, and configure the authenticated maintenance schedule. Keep Preview and Production settings separate. [Google Workspace app SMTP setup](https://knowledge.workspace.google.com/admin/gmail/send-email-from-a-printer-scanner-or-app).

Official instructions: [Google aliases](https://support.google.com/a/answer/33327), [Gmail Send mail as](https://support.google.com/mail/answer/22370), [Google MX](https://support.google.com/a/answer/87127), [Google DKIM](https://knowledge.workspace.google.com/admin/security/set-up-dkim).

## Approved Preview receipt test — sent October 18, 2026

The owner approved storing Keianna's Workspace app password in Vercel Preview and sending one test receipt to `support@keytothesoul.com`. Production SMTP is outside this approval. Google initially denied app-password creation because Keianna's 2-Step Verification was off. The owner enabled it, created the app password in Google, and saved it in the excluded `.env.store-mail.local` file. Authentication against Gmail SMTP succeeded; the credential was then installed privately in Vercel Preview only.

Preparation helpers under the excluded `.cache/` directory verify SMTP without sending, install only Preview settings after successful verification, and prepare one deterministic test receipt for the already refunded Sandbox order. The two original synthetic `.invalid` recipient jobs must be suppressed before dispatch; the helper refuses unexpected pending recipients. Repeating preparation cannot create a second approved receipt. A delivery attempt with an uncertain result requires review before retrying.

Sandbox emails explicitly say `[Sandbox test]` in the subject and state that there is no real order, charge or shipment. The five receipt tests pass with this labeling. The template was deployed to the protected Preview at `https://key-to-the-soul-7zlp60bzi-saiyan-corp.vercel.app`. Both checkout and subscription enrollment were verified closed before dispatch.

At 11:44 AM EDT, the authenticated maintenance endpoint sent exactly one test payment-update receipt for the already refunded Sandbox candle order. Gmail accepted it, and the outbox recorded one successful attempt with zero delivery failures. The two older `.invalid` jobs were suppressed without sending or falsifying delivery. Subject: `[Sandbox test] Key to the Soul · Payment update E3B66939`. Evidence: `qa/workspace-smtp-connection-check.json`, `qa/workspace-preview-smtp-configured.json`, `qa/vercel-smtp-preview-deployment.json`, and `qa/workspace-preview-test-receipt.json`.

The owner confirmed the receipt arrived and looks good. No inbox was read, no Production credential was installed, no recurring sender schedule was activated, and no real order or charge was created. This same-Workspace support test does not prove delivery to an independent external domain.

The owner subsequently approved one ordinary protected Preview recovery account and up to three account-security emails to support. Hosted email confirmation, password reset, replay rejection, old-session/password rejection and new-password sign-in passed. Gmail accepted exactly three Sandbox account emails on their first attempts, and the owner confirmed all three arrived and look good. No inbox was inspected; no owner or paid access was granted. QA sessions and challenges were cleared, and the recovery flag was restored to 0 for subsequent Preview deployments. See ACCOUNT-RECOVERY.md and qa/account-recovery-hosted-end-to-end.json.

## Approved Production activation — October 18

The owner explicitly approved storing the Workspace SMTP app password as a sensitive Production-only Vercel variable, then separately approved publishing the tested upgrade and enabling transactional email/recovery. Production now uses the same approved sender and aliases with separate receipt/maintenance secrets. Its authenticated worker is scheduled every five minutes. An authenticated empty-queue invocation passed with zero messages sent and zero failures. No new Production test email was sent, and no inbox was read. Customer-requested account verification/reset messages and genuine order events can now be dispatched. Keianna subsequently confirmed her real recovery link; read-only database verification found the correct confirmed address, one SENT message and zero outstanding challenges. Independent external-domain delivery and DMARC remain separate unfinished checks.
