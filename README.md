# Key to the Soul

Start with [status.md](status.md) for the current plain-language handoff to Keianna and Orion, the decisions still needed before launch, and Orion’s requested adversarial review. The notes below retain the project’s development history; earlier “not implemented” statements describe earlier stages.

As of October 24, 2026, the public storefront is live at https://www.keytothesoul.com. Accounts/recovery, the owner desk, private tarot requests, mail and the five-minute maintenance worker are deployed. **Real checkout and new paid subscriptions remain closed.** Credentials, databases, private QA captures and downloaded model weights are intentionally excluded from Git. Keep runtime credentials in the correct private environment; never copy an account `.env` file into a commit.

The warm-copper storefront is in `index.html`. Keianna’s original page is preserved in `original-site.html`; `brand-studio.html` retains the logo explorations.

## Live local preview

With Node.js 24 installed, open a terminal in this folder and run:

```powershell
npm ci
npm run edge:build
npm run dev
```

- Copper storefront: http://127.0.0.1:5173/
- Original website: http://127.0.0.1:5173/original-site.html
- Brand studio: http://127.0.0.1:5173/brand-studio.html

The preview binds to this computer’s loopback interface. The two generated AI worker bundles are rebuilt from `edge/` and the locked dependencies rather than committed. `npm run build:vercel` also rebuilds them automatically. For local model weights, follow `SELF-HOSTING.md`; private runtime credentials are configured separately.

Edit `studio.css` to swap CSS in the browser without reloading. HTML, JavaScript, SVG, and photo edits automatically reload the page. Direction and ivory-view choices persist in the browser when local storage is available. Edit `index.html` to change the original site with automatic reload.

Stop with Ctrl+C. Set `PORT` to use another port if needed. `npm run check` checks JavaScript syntax.

## Brand exploration

The second study responds to Keianna’s reference: a circle of moon phases, with an original central symbol in place of the tree.

1. **The Eclipse Gate:** a keyhole cut out of a gold moon, encircled by eight phases; ink, antique gold, ivory.
2. **The Unbroken Thread:** a winding abstract key and open orbital lines, surrounded by eight phases; plum, dusty rose, parchment.
3. **The Ember Seal:** a flame becoming a key inside the lunar cycle; obsidian, candlelight, copper.

Choose each direction to apply it to the storefront concept, toggle an ivory background, or download the individual SVG marks. SVG files contain the symbols; the wordmarks remain editable HTML text. Google Fonts is optional; local serif and sans-serif fallbacks are provided.

The selected direction also updates the large hero seal and illustrative candle-label and wax-seal studies. Each identity has a separate `-compact.svg` companion for small uses. First-study symbols are retained in `logos/first-study/`. Regenerate the second-study SVG artwork with `python scripts/create-lunar-concepts.py`.

The preview uses an existing Love 333 photo. It does not accept orders or payments. Confirm product information, pricing, stock, fulfillment, contact details, and policies before implementing commerce.

## Current source

The supplied folder was an extracted project without `.git` history. The original `index.html` and product images were preserved during the first review and brand exploration.


## Sculpted Ember Seal (selected direction)

Open http://127.0.0.1:5173/ember-3d.html or the embedded viewer in the brand studio. Drag or use arrow keys to turn the seal; pause motion, inspect the side, change the metal finish, and save a transparent PNG of the current view. Reduced-motion preferences pause idle animation. Rendering stops offscreen or when the tab is hidden.

The actual mesh is built from the selected SVG: beveled moons, rounded contours, a raised inner flame, and separate depths. Three.js 0.186.1 is vendored locally with its MIT license; no npm installation or runtime CDN request is needed. The polished still artwork is a separate imagegen study, available through the artwork toggle and as a fallback when WebGL is unavailable. The original flat seal remains available for printing.

Built-in imagegen created images/ember-seal-sculpted.png. Its exact prompt is in images/ember-seal-sculpted.prompt.txt.


## Copper storefront

The homepage now uses the approved warm copper Ember Seal. Edit index.html, storefront.css, storefront.js and storefront-state.js. The four real candles are filterable by intention. Details open in accessible native dialogs. The ritual bag persists locally with validated quantities; it does not reserve stock or create orders. The ritual finder pairs a reflection with an existing candle and downloads a text ritual card. The quiet room is an optional 60-second timer with pause/resume and automatic pause when hidden. The copper 3D seal is directly interactive in the homepage hero; a full viewer opens on request. The hero pauses behind dialogs and when hidden, and respects reduced-motion preferences.

Online ordering is explicitly coming soon. Prices, sizes, stock, tested burn details, shipping/return policies, a working business contact, and a payment/order backend are still needed for launch. No prices or product specifications were invented. The product data in storefront-state.js is the place to add confirmed details.

Run node --test tests/storefront-state.test.mjs to check bag validation and catalog mappings. npm run check also checks JavaScript syntax.

The built-in imagegen tool created images/ember-seal-copper.png by recoloring the approved sculpture. Its exact prompt is saved in images/ember-seal-copper.prompt.txt. Candle-care copy links to the National Candle Association source: https://candles.org/candle-safety-tips/.


## Complete ritual bag

Adding a candle opens the copper bag drawer. It includes editable quantities, intention chips, each candle’s affirmation, a private 240-character note, and a downloadable plain-text summary. Removing a candle or clearing the bag can be undone during the visit; clearing items keeps the intention note. Saved selections migrate from the first bag format into a versioned local record. Multiple tabs synchronize the bag while preserving an actively edited note. No selections are transmitted, reserved, or charged. The bag can be opened directly at /#ritual-bag.

State and export logic is in ritual-bag.js; drawer behavior is in ritual-bag-ui.js. Keianna has now supplied general size-based price ranges. Exact per-product prices remain unconfirmed. Run node --test tests/storefront-state.test.mjs tests/ritual-bag.test.mjs.


## Earlier owner ranges (superseded by six-size list below)

Mini ritual candle (4 oz): $12–$15. Signature ritual candle (8 oz): $22–$28. Deluxe ritual candle (10–12 oz): $30–$38. All include herbs and crystals, as supplied by Keianna. Values are stored in integer cents in candle-sizes.js; exact charges remain unset.

catalog-collections.js contains the supplied intention names, all 12 Zodiac signs, and all 12 Angel Numbers. Existing photographed candles retain their IDs and can belong to multiple collections. New candles use labeled collection artwork until real photos are supplied. Keianna confirmed Healing and Release are separate candles.

Ritual bags now store product-and-size lines in version 3. Older notes and quantities migrate; old unsized items require an explicit size choice and are excluded from estimates until then. Identical product/size lines merge; an over-limit merge is rejected without dropping quantity. Estimates and downloads use only the owner-provided size ranges and exclude shipping and any applicable tax. The selections still are not orders or stock reservations. Product-specific size availability, exact pricing, scent/vessel details, stock, and checkout remain launch tasks.


## Current owner-confirmed six-size pricing

The later six-size list supersedes the earlier ranges: Mini 4 oz $12; Small 6 oz $18; Signature 8 oz $26; Large 10 oz $30; Deluxe 12 oz $36; Luxury 16 oz $44. The trailing s in $44s was treated as a typo. All candles include herbs and crystals. Healing and Release remain separate as already confirmed. Prices are in integer cents in candle-sizes.js. Shipping, any applicable tax, stock and fulfillment setup remain separate; checkout is not connected.

Bag version 4 stores the same size-aware line format. Mini and Signature retain their weights. Version-3 Deluxe represented 10–12 oz and now migrates to a distinct legacy-deluxe unpriced line requiring a fresh size choice. This preserves quantity even if a separate unsized line for the same candle exists. New Deluxe is exactly 12 oz. The UI and download now show a candle subtotal rather than a price range.


## The Moon Room

The main copper Ember Seal can be turned by dragging or arrow keys. Its doorway, the navigation button, and the quiet-minute section open the Moon Room in a native dialog. Direct entry is /#moon-room; the standalone experience is /moon-room.html. The full seal viewer remains available.

Moon Garden is an eight-moon arranging game with gentle snapping, no score, no failure, and a fresh-circle reset. Arrow keys choose an unsettled moon and Enter settles it; the Settle a moon button offers an equivalent action. Still Water supports touch/pointer tracing and a keyboard/button ripple action. Quiet Time offers one, three, and five minutes with pause/resume/reset, and automatically pauses when hidden, offscreen, or switching modes. Countdown timing is independent of decorative motion.

The optional reflection textarea is kept only in memory, never stored or transmitted by the application, and clears when released or when the Moon Room closes/leaves. No reflection content is rendered into markup. There is no audio autoplay, tracking, API dependency, score, or reward pressure. Reduced motion produces static ripples and no timer pulse; the visitor can choose to resume motion.

Game and timer state: zen-state.js. Canvas and interaction: moon-room.js. Storefront dialog and 3D motion coordination: zen-ui.js. Styles: moon-room.css. Tests cover immutable placements, responsive orbit positions, timing, touch/pointer and keyboard actions, mode changes, reduced-motion behavior, and clearing reflection text. Run npm run check for syntax checks and the full suite. Visual browser QA was completed at desktop and iPhone-sized viewports; actual iPhone Safari behavior still needs a device check.


## Phone and browser review — October 17, 2026

Checked the live Moon Room in the in-app browser at 1440×900, 390×844, 375×667, and 844×390 landscape. Verified real pointer dragging, keyboard placement, copper ripple tracing, three-minute selection, timer start/pause, and clearing a test reflection. The current page reported no browser errors or warnings.

Phone changes include a full-width dialog with a fixed 44px close control and safe-area spacing, a single-line title, a stage that fits shorter screens, readable controls, and 16px select/textarea text to avoid common iPhone input zoom. Timer digits scale with available height. The garden centerpiece has a copper bevel and glow. Moon positions now preserve their circular geometry across orientation changes, including settled positions. Short landscape layouts remain scrollable.

The local preview now prioritizes a full reload when a batch contains JavaScript or HTML changes, even if the last saved file was CSS. A live SSE probe verified this behavior. These checks simulate phone viewport dimensions; they do not claim physical-device or Safari verification.


## Current members’ tarot and self-hosted store

Open /tarot.html for The Ember Oracle: an original 78-card copper deck, Quick/Standard/Deep readings, optional reversals, downloadable readings, local model reflections and local narration. Our own Node/SQLite accounts and expiring invitations gate access on the server. The approved local preview account has one day of access; production packages exclude private databases.

See SELF-HOSTING.md for exact setup, model sizes, membership commands, the local preview and launch work still needed. OWNERSHIP.md explains our custom code and the licenses for dependencies/model weights. /paypal-sandbox.html is a separate, disabled-by-default developer checkout test. No live payments, subscriptions or customer orders are enabled.

The selected reader is Qwen3-0.6B q4f16; Kokoro q8 provides optional narration. Transformers.js 4.3.1 is shared by both workers. Smaller reader candidates were rejected. Fonts are now self-hosted in vendor/fonts with their OFL notices. The development dependency audit reports zero vulnerabilities. npm run check currently passes 52 tests.


## Deployment target: Vercel

Vercel replaces the earlier Droplet plan. See [VERCEL.md](VERCEL.md) for the prepared static build and our custom PostgreSQL account adapter. Run npm run build:vercel to prepare dist/. The large browser models use owner-controlled asset storage; they are excluded from function bundles. The existing domain can be connected after hosted preview verification. The protected preview is deployed in Saiyan Corp Pro. Neon Free provides standard PostgreSQL for our custom accounts, and a dedicated Vercel Blob store serves the pinned model pack. See qa/vercel-deployment.json for the current preview URL. The approved public storefront is now https://www.keytothesoul.com; the bare domain redirects there. Production uses a separate empty database within Neon Free. Email DNS remains intact. Online ordering remains closed. See qa/domain-connection-review.json.

The Vercel Preview sandbox now uses durable test records, exclusive processing claims and capture reconciliation. It remains disabled in Production. npm run package:vercel creates separate application and integrity-verified model upload folders; see VERCEL.md. The local reader is still an optional preview; malformed, repeated and ungrounded replies are hidden.
