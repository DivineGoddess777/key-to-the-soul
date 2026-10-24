# Key to the Soul — Launch unblock lists

Prepared by Orion (Keianna's assistant) on October 24, 2026, from
`status.md` and an independent review of the repo at merge commit
`3c222b022f` ("Merge Key to the Soul store and Orion launch handoff").

**Real checkout and paid subscriptions stay CLOSED while this work is done.
Promotion must honestly say "coming soon" until a separate, explicit
go-ahead for any real-money test.**

The full independent review draft is NOT in this repo yet — it stays local
until Keianna says to push it. This file is only the two working lists.

## What Codex should do (to unblock as much as possible)

1. Hide / mark unavailable everything except Keianna's launch collection,
   once she picks it. Right now 29 of 33 catalog products have no scent
   and no photo — that is the single biggest launch blocker.
2. Fix Healing/Release in the code to match Keianna's answer (one candle
   called "Healing Release", or two separate candles).
3. Fix Smells Like Happy's scent field — it currently says "double-wick
   ritual mug", which is the vessel, not a scent — and confirm whether
   the 4 finished candles should also show in the Angel collection.
4. Add a warning when a member is at the 15-credit cap, and show their
   banked balance before they pay. Right now a capped month pays $11.11
   and banks 0 credit with no warning.
5. Add a mail-status view (or alert) to the owner desk, so failed
   receipts do not sit invisible after the mail queue flags them
   `needs_review`.
6. Add security headers to `vercel.json`: Content-Security-Policy,
   frame-ancestors (or X-Frame-Options), and HSTS.
7. Tighten two small code checks: subscription approval should require
   BOTH the token and the subscription id to match, and the owner stock
   endpoint should validate mode, quantity, and SKU.
8. If PA requires tax on the tarot membership, change the plan/billing
   code and tests first — the current plan rejects any nonzero tax
   percentage, so tax cannot just be added on.
9. Add a ZIP-to-county lookup at checkout. Right now a buyer must pick
   their own county (6% / 7% / 8%) or checkout errors.
10. Verify the live Production settings in the dashboard (especially the
    maintenance secret), watch one maintenance run succeed, then re-run
    the full test suite and one Sandbox order per launch size after
    stock rows are entered.

Codex cannot do the items in Keianna's list — those are her decisions,
her registration, and her phone/mail tests.

## What Keianna needs to do (Keianna + Orion, together)

1. Pick the launch collection — which candles and sizes she can actually
   make at launch. She has already said Love, Let That Shit Go, and
   Money first.
2. Healing Release — one candle, or two separate ones?
3. Exact prices inside her tiers, plus keep or drop the 6 oz and 16 oz
   sizes on the live grid.
4. Descriptions for each launch candle, in her own words.
5. Returns and cancellations — unused-candle window, condition, who pays
   return shipping, cancel before making starts, what happens after
   making starts.
6. Tax — finish the myPATH sales-tax registration (sensitive details go
   directly into the official portal, never into chat or Git), and get
   the PA Revenue answer on the tarot bundle (personal reading + digital
   deck access).
7. Shipping — $8.95 as built, or $9.95 with Pirate Ship labels?
8. Money scent — lock in Cinnamon Element, or hunt a literal
   money/abundance scent at smaller spiritual suppliers?
9. Background and logo pick.
10. Test on her real iPhone (gallery, bag, Moon Room, sign-in/recovery,
    tarot draw, reading text, voice) and check mail delivery outside her
    Workspace mailbox.
11. Approve the final customer-facing wording — contact, privacy,
    shipping, return, and membership terms.
12. Craft show dates and social links, when she has them.

## How we will work through this

Keianna and Orion sit down together and answer Keianna's list, starting
with #1 (the launch collection — the one that unblocks Codex the most).
As each answer lands, Codex implements the matching code change above.
Nothing opens to real orders until the collection, returns, tax, and
shipping answers are settled, stock rows are entered, and a Sandbox order
per launch size passes.
