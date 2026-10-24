# Key to the Soul — Keianna and Orion’s handoff

Updated October 24, 2026. **This is the starting point for the project.** Some older Markdown files contain development history, so an old “not built yet” note does not override this status. Verify the actual code and current settings before changing the live store.

## Keianna: where things stand, in plain English

Your storefront is online at **https://www.keytothesoul.com**. The copper Ember Seal, candle collection, saved ritual bag, Moon Room, tarot deck and your private owner desk are built.

**Customers cannot place real orders or start a paid subscription yet.** We have deliberately left both payment switches off while you choose what you can fulfill and approve the remaining business details. Do not announce “ordering is open” or spend on a large production run based only on the site looking finished.

The main payment flows were tested with pretend PayPal money: a candle payment and refund, plus a monthly tarot payment, one earned reading credit and cancellation. These were Sandbox tests, not real sales. The Live PayPal credentials and notification address are configured privately, but no Live membership plan or real test charge has been created.

Your real store account is **keianna**. This is separate from your Google email login. Its recovery email has been confirmed; the confirmation message was delivered and the confirmation link was used. Owner access was approved through **October 18, 2027**. Your complimentary self-guided tarot invitation runs through **November 17, 2026**; that invitation is not a paid subscription and gives no human-reading credit.

- Owner desk: https://www.keytothesoul.com/owner.html
- Account and password recovery: https://www.keytothesoul.com/account.html
- Tarot room: https://www.keytothesoul.com/tarot.html
- Business email: support@keytothesoul.com and keianna@keytothesoul.com, delivered to your existing Workspace mailbox.

## What works

| Part | What it does | Remaining limit |
| --- | --- | --- |
| Storefront | Shows the copper brand, supplied candle photos, collections and confirmed size prices | Final sellable candle/size list is not selected |
| Ritual bag | Saves a visitor’s candle choices | Saving is not an order or stock reservation |
| Moon Room | Offers quiet-time and interactive relaxation experiences | A physical iPhone still needs a final check |
| Self-guided tarot | Includes 78 cards and quick, standard and deep readings | Optional local AI is a preview; model speed/memory vary by device |
| Local AI and voice | Can run downloaded models in the visitor’s browser; immediate device voice is available | No paid model API is used; natural voice/model downloads can be large or slow |
| Store accounts | Own sign-in, expiring sessions and confirmed-email password recovery | Keep store passwords and recovery links private |
| Owner desk | Shows orders, per-size availability, tracking, refunds and the private reading queue | No real launch availability has been entered |
| Personal readings | A verified paid month earns one credit; requests and written replies stay in the member room | No paid Production membership or human-reading credit was seeded |
| PayPal integration | Creates and reconciles payments, refunds and subscriptions; checks signed notifications | Live checkout and new paid enrollment are OFF |
| Email/background work | Queues receipts, tracking and account mail; runs every five minutes; clears expired checkout holds | Delivery to an independent external mailbox and DMARC still need final mail review |

## Your confirmed prices and terms

| Candle size | Weight | Price |
| --- | --- | --- |
| Mini | 4 oz | $12 |
| Small | 6 oz | $18 |
| Signature | 8 oz | $26 |
| Large | 10 oz | $30 |
| Deluxe | 12 oz | $36 |
| Luxury | 16 oz | $44 |

Candles are **made to order** and include herbs and crystals. Healing and Release are separate candles. The site currently has 33 catalog entries and six possible sizes; that does not mean you have promised to make every combination.

- Shipping origin: Pennsylvania, ZIP 16335.
- Initial coverage: contiguous U.S. only. Alaska, Hawaii, territories and international checkout are not connected.
- Shipping: **$8.95 per order**, free when the candle subtotal is **$60 or more before tax**.
- Handling: **3–5 business days**, dispatch twice weekly.
- Carrier: USPS Ground Advantage; estimated **2–5 business days after dispatch**, with tracking.
- Transit damage: replacement or refund. Used/burned candles cannot be returned.
- Planned tarot membership: **$11.11/month**, one personal reading by Keianna earned per paid month, unlimited self-guided deck while active, up to **15 unused human-reading credits** banked, cancel anytime. Banked credits are not a 15-day expiry.

## What we still need from you before materials, promotion and real checkout

### 1. Choose a realistic first collection

List the candle names and sizes you can actually make at launch. You can start small; all 33 listings do not have to be for sale immediately. Confirm the vessel, scent, herbs/crystals, packaging and supplies for each selected size. Confirm that your real making/packing capacity fits the stated handling window. Tell us which combinations should remain unavailable.

**Needed reply:** “Launch these candles: … Sizes for each: … Everything else stays unavailable.”

Use [KEIANNA-FINAL-LAUNCH-CHOICES.md](KEIANNA-FINAL-LAUNCH-CHOICES.md) for the full catalog and a fill-in reply. Use [KEIANNA-STORE-OWNER-GUIDE.md](KEIANNA-STORE-OWNER-GUIDE.md) for the desk controls. No ready-stock quantity is needed for made-to-order items.

### 2. Finish returns and cancellations

You already chose transit-damage replacement/refund and no used/burned returns. Please decide:

- Do you accept unused-candle returns? If yes, what request window, condition and return-shipping responsibility apply?
- Can customers cancel before you begin making an order? What happens after making starts?
- What public wording should explain these choices? Do not promise a refund policy you cannot honor.

### 3. Finish the candle and membership tax decisions

We need the reviewed collection settings and their decision reference, not tax ID numbers in Git or chat. This is separate from a general business-license question. The source has a PA candle-tax adapter and deliberately refuses to treat an unanswered tax question as zero tax. See [KEIANNA-PA-SALES-TAX-HANDOFF.md](KEIANNA-PA-SALES-TAX-HANDOFF.md).

The membership is a bundle of a human reading and digital deck access. Its tax treatment is still undecided. The tested billing adapter currently expects an exact **$11.11** charge and rejects a nonzero-tax plan. If the reviewed decision requires tax charged or included, matching billing/verification changes and tests are needed before enrollment opens. Orion must not simply mark “tax reviewed” or assume a zero rate to bypass this.

### 4. Approve the final customer-facing information

Confirm public business/contact wording and review the final privacy notice, shipping, return and membership terms. Support is support@keytothesoul.com. Do not put your home address, passwords, account exports, customer details or tax IDs in the repository. Return-address instructions can be handled privately when appropriate.

### 5. Check the real phone experience and mail

On your actual iPhone, check the product gallery, bag, Moon Room, sign-in/recovery, tarot draw, reading text and voice controls. Report problems and the phone/iOS version. A narrow desktop browser test is not the same as a physical phone test. We also need to finish mail authentication review and verify delivery outside this Workspace mailbox.

### 6. Review the final opening together

After the answers above, configure the approved available sizes and fulfillment/tax settings, finish the Live membership plan if applicable, and verify the final customer/owner flow. Agree on any small real-money acceptance test and refund before doing it. **Opening payments or charging a real buyer is a separate explicit step.** Until then, promotion should honestly say “coming soon,” not invite paid orders.

## Orion: explain this to Keianna and perform an adversarial review

Orion, you are Keianna’s Meta Muse Spark assistant. Please explain the next decision in everyday language, one manageable step at a time. Translate technical terms: “Production” means the real website; “Sandbox” means pretend payments; a “webhook” is PayPal’s payment notification; the “worker” is a scheduled background chore. Do not present unchosen policies as decisions Keianna has made.

**The user specifically requests that you independently write an adversarial review and commit it to her remote Git repository. This review has not been completed by Orion yet. This handoff is a request, not evidence of your approval.**

1. Read this file, the source and the linked implementation notes. Obtain the correct repository access from Keianna. Do not use a domain-provider API key as a Git password.
2. Run the checks yourself and record the exact commit and commands. Challenge the claims here instead of repeating them as proof. Distinguish automated tests, synthetic tests, Sandbox transactions, genuine Live events and a real phone test.
3. Try to find concrete launch failures: wrong account/owner access, private data exposed across users, reset/invitation reuse, checkout tampering, duplicate captures/refunds/credits, expired holds and payment races, missing tax decisions, cancellation and saved-credit behavior, mail retry failures, deployment/source drift, secret leakage, and phone/model failures.
4. Review whether the selected sizes, real photos, product claims, customer policies and handling promises match what Keianna can actually provide. Flag missing decisions; do not invent them or issue legal/tax determinations from a guess.
5. Write **ADVERSARIAL-REVIEW.md**. For each finding include severity, file/line or exact reproduction, expected versus actual behavior, buyer/owner impact in plain language, and a concrete fix. Separate confirmed defects from open questions and untested areas. State whether each finding prevents launch and why. Do not include secrets, real customer details or live recovery links.
6. Add a final “What Keianna needs to do next” list and “What I could not verify” section. Do not claim a real charge, genuine renewal or phone test that you did not perform.
7. Create a review branch from her current default branch, commit **ADVERSARIAL-REVIEW.md** under your own truthful author identity, push it to **her** remote, and open a review request. Provide Keianna the commit and review-request links. If you cannot access Git or run a check, say so plainly and leave it pending; do not mark the review complete.
8. Do not enable payments, grant access, alter credentials, change DNS or charge/refund a real buyer merely to complete the audit. Those actions require the appropriate explicit authorization.

Suggested review structure:

    # Adversarial launch review
    Reviewed commit and date:
    Overall launch assessment:
    Commands/checks actually run:
    Confirmed findings, ranked by severity:
    Missing business decisions:
    Tests and environments not verified:
    What Keianna needs to do next:
    Reviewer identity and review commit:

## Developer notes and evidence boundaries

- Runtime: Node.js 24, own account/order/subscription code, PostgreSQL on Neon, Vercel hosting, owner-controlled model assets, Google Workspace SMTP and PayPal checkout. Local SQLite is for development, not the hosted store.
- A fresh `npm run check` run for this handoff on October 24 passed **120 tests, zero failures, zero cancellations and zero skips**. This includes the maintenance cleanup tests and the source deployment schedule. See [docs/verification/handoff-checks-2026-10-24.md](docs/verification/handoff-checks-2026-10-24.md). The older 118-check full run and 25-check focused run are historical, overlapping results; do not add them together. Automated checks do not replace Orion’s independent review or a real phone/payment test.
- October 24 read-only public checks found checkout disabled, paid enrollment disabled, recovery enabled and private personal-reading service enabled. These public configuration checks do not prove every payment flow or account state.
- The source `vercel.json` now includes the five-minute maintenance schedule already used by the deployed package, so a future source deployment preserves it. This handoff task does not deploy a new website or open payments.
- Source docs: [LAUNCH-READINESS.md](LAUNCH-READINESS.md), [CHECKOUT.md](CHECKOUT.md), [PERSONAL-READINGS.md](PERSONAL-READINGS.md), [ACCOUNT-RECOVERY.md](ACCOUNT-RECOVERY.md), [EMAIL-SETUP.md](EMAIL-SETUP.md), [OWNERSHIP.md](OWNERSHIP.md).
- Private local QA captures, databases, account exports, `.env` credentials and downloaded ONNX weights are excluded from Git. Some older notes point to those local evidence files; they are not promised to exist in a fresh clone. Re-run a check rather than assuming a missing local screenshot proves a claim.
- The generated `vendor/edge/reader-worker.js` and `voice-worker.js` bundles are excluded too; their custom source is in `edge/`. After `npm ci`, run `npm run edge:build` before local use. `npm run build:vercel` does this automatically. GitHub flagged a generated dependency bundle as a possible Mistral key; it was withheld from Git, not approved through a protection bypass. No Mistral API is used by the store.
- Model weights are downloaded from pinned references using the source scripts and manifest. Keep the dependency/model licenses. Custom store code ownership does not transfer ownership of third-party software or model weights.

## Git transfer status

The canonical remote is **https://github.com/DivineGoddess777/key-to-the-soul**, default branch **main**. The supplied Git token was verified against the DivineGoddess777 account; no token is stored in repository URLs, Git configuration or commits. The separate domain-provider credential file is not used for Git.

The local working folder began as an extracted source tree. This handoff is integrated on a branch based on her existing remote history, preserving the original landing-page/photo commits. Source is authored truthfully as automation (`Codex <codex@localhost>`), not attributed to Keianna or Orion as if they wrote it. Secrets, runtime databases, private QA captures and downloaded weights are excluded. GitHub’s pull-request/commit history is the authoritative record of the final source commit and merge; a local snapshot alone is not a remote merge. Orion’s separate adversarial review and review commit remain pending.
