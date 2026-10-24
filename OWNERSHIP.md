# Code and asset ownership

The custom storefront, ritual bag, Ember Seal geometry, Moon Room, tarot SVG artwork, interpretations, account/session/invitation system and PayPal sandbox adapter are editable source in this project. There is no Shopify, hosted authentication service, hosted AI inference or proprietary storefront service.

Third-party software and model weights remain under their own licenses: Three.js and ONNX Runtime (MIT), Transformers.js and the selected Qwen/Kokoro models (Apache-2.0), Kokoro.js and its phonemizer (see bundled licenses), and the Google Fonts typefaces (SIL Open Font License). Self-hosting does not make those third-party components exclusive property. Keep their notices when distributing.

The original photographs and reference material were supplied with the project. Their rights were not independently verified. Generated Ember Seal stills have their prompts beside them. The site uses the original SVG/mesh and original code-drawn tarot cards; it does not copy a commercial tarot deck.

PayPal owns its payment interface and processes payments. All integration code, server-side pricing, schemas and reconciliation logic are in this repository; private runtime/test records are excluded from Git. Both Sandbox and Live adapters are implemented. Live credentials and callbacks are configured privately, while real checkout and new paid subscriptions remain disabled. See status.md for the current launch handoff; older sections below preserve setup history.

Vercel is the selected hosting infrastructure. The production account adapter uses standard PostgreSQL; its schema, migrations and all authentication logic remain in this project. Model files can be delivered from owner-controlled object storage, with inference staying in the browser. PostgreSQL hosting and model delivery require infrastructure connections; they do not transfer ownership of the custom store code. The pg driver is MIT licensed; PGlite is a development-only PostgreSQL test engine under its upstream licenses.

PayPal sandbox test-record code includes SQLite for local development and a portable PostgreSQL adapter for Vercel Preview. Live payment processing and automatic membership billing are still disabled.
