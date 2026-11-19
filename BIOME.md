# Discount Display — Biome Theory fork

A fork of Khubaib's `RanaKhubaib/shopify-discount-price-display`, adapted for
the Biome Theory store (`biometheory.shop`). It shows the store's selected
Shopify discount on the storefront: struck-through original price, sale
price, and a "Save %" badge. **One-time purchase prices only** — subscription
prices stay driven by the Appstle selling plan in the theme's Liquid code;
this app never touches them.

## How it works

1. The merchant picks ONE discount in the app's Settings page (automatic or
   code). Only that discount is ever shown — other discounts in admin still
   apply at checkout, they just don't change the displayed price.
2. The server syncs the selected discount (GraphQL) and writes sale prices
   per product/variant to the shop metafield `discount_display.prices`
   (`{ handle: { variants: { <id>: { o, s } }, o, s, card? } }`).
   Settings live in `discount_display.settings`.
3. The theme app extension (`discount-price-embed`, target `body`) injects
   `window.DiscountDisplay` and `discount-price.js`, which rewrites price
   elements matching the merchant's selectors.
4. `discounts/create`, `discounts/update` and `discounts/delete` webhooks
   re-run the sync automatically, so creating or changing the selected
   discount in admin updates the storefront with no manual step.

## What changed vs the original app

- `app/discount-sync.server.js` — sync uses ONLY the selected discount
  (`settings.discountId`); no selection / inactive / missing discount clears
  the storefront prices. New `listDiscounts()` for the picker. New settings:
  `discountId`, `discountTitle`, `badgeEnabled`, `badgeStyle`
  (pill/rounded/square), `badgeSize` (small/medium/large), `badgeBg`,
  `badgeColor`, `showOnLandingPages`, `landingSelectors`.
  Badge defaults match the theme's `.save-badge` (forest `#42572A`, white
  text, pill, medium).
- `app/routes/app.settings.jsx` — discount picker (active first, with type,
  status, dates, value), badge design controls with a live preview, and
  editable selectors for cards, product pages and landing pages.
- `extensions/discount-price-embed/assets/discount-price.js` — renders the
  badge (percentage computed from original/sale, never typed in) and is
  mode-aware: it rewrites one-time prices only. On landing-page buy boxes it
  follows the One-time / Subscribe switch (skips subscribe mode, re-applies
  after toggle/flavour changes via the existing MutationObserver). Variant
  resolution uses `body[data-flavor]` + the theme's `window.*_PRODUCTS`
  table, with a product-handle fallback.
- `extensions/discount-price-embed/blocks/discount-price.liquid` — badge
  CSS (pill/rounded/square, small/medium/large).
- `app/discount-webhook.server.js` + `app/routes/webhooks.discounts.*.jsx`
  — the three discount webhooks (declared in `shopify.app.toml`).
- `react-router.config.ts` — `@vercel/react-router` preset.
  `package.json` gains a `vercel-build` script
  (`prisma db push` + production build).
- `app/discount-sync.server.test.js` — updated for the selected-discount
  sync, plus no-selection and inactive-discount cases. Run with
  `npm run test:discount-sync`.

## Deploy (Vercel) — still to do

This fork is built for a FRESH Shopify app record for Biome Theory (do not
reuse the old "disocunt app" credentials). Steps:

1. Create the app in the Shopify Partner dashboard (Khubaib signs in) or via
   `shopify app init` — this produces a fresh client ID + client secret.
   Update `shopify.app.toml` (`client_id`, `application_url`) with the new
   values.
2. Create a Vercel project from this repo. Set these env vars BEFORE the
   first build (the Prisma client is generated for the DATABASE_URL provider
   at build time):
   - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` (from the new app record)
   - `SCOPES=read_discounts,read_products,write_products`
   - `SHOPIFY_APP_URL` (the Vercel URL, no trailing slash)
   - `DATABASE_URL` (Postgres — Vercel Postgres or any hosted Postgres.
     SQLite is not acceptable: it sleeps/wipes on free hosts and Vercel's
     filesystem is ephemeral.)
3. Build command: `npm run vercel-build` (runs `prisma db push` to create
   the Session table, then the production build).
4. `shopify app deploy` to push the extension + webhook subscriptions, then
   install the app on Biome Theory from the install link.
5. In the app's Settings page: enable the display, pick the active discount
   (e.g. "Nov 18–25 One-Time 15% Off"), set the badge design and selectors.
   Default landing selector:
   `.purchase-opt[data-purchase-opt="onetime"] .purchase-price`.
6. Enable the app embed ONLY in the pilot draft theme
   ("Copy of biometheory-live - GF subscription pilot",
   `gid://shopify/OnlineStoreTheme/169102147801`). Never enable it on the
   live MAIN theme and never publish — Khubaib publishes himself.
7. Verify in the pilot preview: product page one-time $50.97 struck-through
   $59.97 + badge, Subscribe still $47.98 with gifts; all 8 landing pages;
   product cards. Empty the cart after any test add.

## Local notes

- `npm ci --ignore-scripts` then `npm rebuild` is the reliable install
  here: Node's fetch through this VM's egress proxy gets ECONNRESET on
  large downloads, while curl works. If Prisma engine downloads fail, fetch
  the two binaries with curl and place them in
  `node_modules/@prisma/engines/` (`libquery_engine-debian-openssl-3.0.x.so.node`,
  `schema-engine-debian-openssl-3.0.x`), plus a copy of the libquery binary
  in `node_modules/prisma/`, then re-run `npm rebuild` / `prisma generate`.
- The `start` script (`react-router-serve ./build/server/index.js`) no longer
  matches the Vercel preset's output path
  (`build/server/nodejs_eyJydW50aW1lIjoibm9kZWpzIn0/index.js`). Serve that
  path directly for local smoke tests; Vercel does not use `start`.

## v6 — sale-first prices, widget one-time row, dynamic CTAs, per-place settings (2026-11-19, app phase only)

Owner direction: NO Appstle subscription integration. The app stays a
discount-display app — it does not manage subscriptions and does not
override Appstle's badges. The owner designs the one-time and
subscription badges himself in Appstle. The app's own badge defaults
match Appstle's badge design (#42572A bg, white text, pill, medium) so
the two look the same side by side.

What changed:
1. PRICE ORDER (discount-price.js + discount-price.liquid). Everywhere
   the app renders a price it is now SALE first, then the struck-through
   ORIGINAL, then the badge — the Appstle Subscribe-row layout. Was
   original first. Applies to product pages, cards and landing pages.
   The liquid CSS now spaces the parts with `.dd-wrap > *` margins so
   both orders lay out correctly.
2. NO MORE APPSTLE BADGE OVERRIDE. The v2/v5 restyle of Appstle's own
   badges (the `<style id="dd-appstle-badge">` injection + inline
   `setProperty(..., "important")` on `.appstle_subscription_save`,
   `.appstle-save-badge`, `.appstle_sellingPlan_discountText`) is
   REMOVED. Appstle's badges are now entirely Appstle's/owner's. (Note:
   Appstle's merchant custom CSS still sets the row pill to #78F39D —
   the owner fixes that in Appstle, not here.)
3. WIDGET ONE-TIME ROW (new slot `widgetOneTime`, default selector
   `.appstle_onetime_amount`). Verified in the live widget template
   fetched from the product page HTML 2026-11-19: the one-time row price
   is `<span class="appstle_sellingPlan_price appstle_onetime_amount">`
   with an optional struck sibling `.appstle_onetime_amount_compare`
   (in one widget variant the compare span is nested INSIDE the amount
   span). The script rewrites it to $50.97 + struck $59.97 + Save 15%
   badge — the exact Subscribe-row layout — and hides Appstle's own
   compare span while ours shows (it comes back if the discount is
   cleared). The Subscribe row (`.appstle_price_block`, `SAVE 20%`
   pill) is never touched. The rewrite survives Appstle re-rendering
   the span's text on variant change (MutationObserver re-applies;
   the guard requires our markup to still be present, not just the key).
   Runs whatever purchase mode is selected, because the row always
   shows the one-time price.
4. STATIC PRICES DYNAMIC (new slot `cta`, text-node rewrite). CTA
   buttons, ATC price spans and the offer strip that showed static
   prices from customizer settings are now rewritten by the app:
   `.cta-wrap a.btn[href="#buy"]`, `.la-cta a.btn`,
   `button[data-add="current"] .final-price`,
   `button[data-add="current"] .sticky-price`, `.ostrip`. Only the
   price token inside the text is swapped (label untouched); a token
   equal to the one-time original gets the one-time sale, a token equal
   to the subscribe price gets the subscribe sale. Other numbers
   (e.g. "$2.40 a glass") are left alone. Verified against the live
   landing HTML (theme t/21): hero/mid/final CTAs
   ("Start With Your Gut — $59.97" etc.), `.final-price` /
   `.sticky-price` spans, `.ostrip` "Super Greens: $59.97". After Nov
   25, changing the discount updates every price/badge automatically.
   The buy-box price line (`.price-line .now`, added to the landing
   selectors) is a shared display so it follows the SELECTED mode:
   Subscribe selected shows the subscribe sale, One-time shows the
   one-time sale; its aria-label is updated too (the stale
   "was $78.93" is gone). Per-row buy-box prices stay one-time-only.
   CTA "Save %" pills (`.cta-wrap .pill`, `.oc-tag`, new slot
   `ctaPill`) now get their % rewritten to the selected mode's %,
   like the burst. Headings that say "Save 24% + Free Shipping" and
   the per-serving "$2.40 a glass" line are NOT touched — theme copy,
   for the theme worker / owner.
5. PER-PLACE SETTINGS (app/slot-defs.js — shared module, NOT *.server,
   because the settings page ships to the browser — importing SLOT_DEFS
   from discount-sync.server.js broke the production build). 8 slots:
   cards, product page, landing buy boxes, widget one-time, buttons &
   price text, starburst, CTA pills, global catch-all. Each price/static
   slot has its own original-price position (first/second), show-badge
   toggle, sale colour, badge bg/text colours, badge style/size; badge
   slots have a show-badge toggle (only the % is rewritten, the theme
   owns the badge's look). Unset slot values inherit the global
   defaults. The global catch-all only touches elements no specific
   slot already rewrote. Settings page restructured into Discount /
   Price layout (with live sale-first preview) / Badge design /
   Subscription prices (display only) / Where prices appear (one card
   per slot) / Custom CSS, with a short help text under EVERY option.
   Existing settings are preserved: loadSettings migrates saved
   landing selectors that still hold exactly the old default (appends
   `.price-line .now`); a merchant-edited list is left alone; an
   explicitly emptied selector list stays empty (slot off).
6. TESTS. `npm run test:discount-sync` 14/14 (5 new: slot defaults,
   landing migration, merchant-edited list, saved per-slot settings,
   emptied list). New jsdom smoke test
   `extensions/discount-price-embed/discount-price.smoke.test.js`
   (`npm run test:smoke`, jsdom added as a devDependency) 9/9: price
   order, per-slot overrides, widget one-time layout + subscribe row
   untouched + Appstle re-render survival, landing buy box / price
   line / CTA / pills with a mode switch, global catch-all (incl. no
   double-rewrite), custom CSS + disabled state. Production build OK.

DEPLOY:
- Push 1: GitHub commit e3fa7030d67326a20e4b0174c896da7a4933732b (main,
  provenance checked: remote head was 6d6a66c063e6ea083628e7e15cfb0387279c4ade
  — NOTE the brief said head 17d9ecf2, but live head was one commit ahead,
  6d6a66c "Fix row pill restyle"; remote content matched local git HEAD
  byte-for-byte on every path, no divergence). Deployed via
  `shopify app deploy` (CLI reinstalled, PTY): extension version
  biome-discount-display-7,
  https://dev.shopify.com/dashboard/140278598/apps/449145503745/versions/1247810387969
  . CDN-verified: pilot preview loads
  .../biome-discount-display-7/assets/discount-price.js (31,649 bytes),
  SHA-256 identical to the local file; all new markers present, all
  Appstle-restyle markers gone. (The live saved settings in the
  metafield differ from the brief: badgeStyle "square", badgeSize
  "large", saleColor "#000000" — preserved as saved, NOT changed; the
  app defaults are still pill/medium/#d82c0d. Owner call if those should
  change. The saved landingSelectors also still hold the old default —
  the script now appends .price-line .now itself, see push 2.)
- Push 2: script-side landing migration (old saved landing list gets
  .price-line .now without a settings save) + smoke test for it.
  GitHub commit f3645b7a9467c49efd7348505752c3086f599140 (main).
  Deployed via `shopify app deploy`: extension version
  biome-discount-display-8,
  https://dev.shopify.com/dashboard/140278598/apps/449145503745/versions/1247820611585
  . CDN-verified: pilot preview loads
  https://cdn.shopify.com/extensions/01a1f1fa-9e3d-7cec-9e9f-d92a43a1dc6d/biome-discount-display-8/assets/discount-price.js
  (32,236 bytes), SHA-256 identical to the local file; all new markers
  present (applyStaticText, slotCfg, appstle_onetime_amount, price-line),
  all Appstle-restyle markers gone. (Note: the CDN instance id in the
  URL changes per version — the -7 URL's id does NOT work for -8; read
  the script URL from the rendered pilot page HTML, don't guess it.
  The pilot page HTML is cached briefly after a deploy; the -8 URL
  appeared ~2 min after the deploy. The preview fetch needs a cookie
  jar: `curl -c cookies.txt -b cookies.txt ...?preview_theme_id=...`,
  otherwise Shopify strips the param and serves the live theme.)
  Vercel /health 200 ok after the GitHub push (auto-redeploy).
- Live browser verification still needed (parent): product page
  one-time row ($50.97 + struck $59.97 + Save 15% badge, same size as
  Appstle's Subscribe badge), Subscribe row untouched, all 8 landing
  pages (CTA buttons, price line, burst + pills on toggle), cards.
  Do NOT buy anything; do NOT change theme files.

## v2 — dynamic badges everywhere (2026-11-19, app phase only)

GitHub commit 24c47f9b49f85e177e50510732fbff6dcac814d4 (main). Extension
version biome-discount-display-4 (released via `shopify app deploy` from
this VM; app renamed from "disocunt app" to "Biome Discount Display" in
shopify.app.toml — the name change rode along in this deploy).

What changed:
1. SUBSCRIBE % IN THE SYNC (app/discount-sync.server.js). The sync now
   also reads the Appstle selling-plan group (gid 3389751513) via GraphQL
   and stores the subscribe sale price + % per variant. Selling plans are
   read under the read_products scope (verified: two independent sources +
   live GraphQL read of the group — "Every Month" plan 6152224985, single
   FixedPricingPolicy PERCENTAGE 20, whole-number % unlike discount
   fractions). Per-variant record is now {o, s, op, sp, spp} (op = one-time
   % off, sp = subscribe sale price, spp = subscribe % off); entry + card
   carry the same fields for the lowest variant. Subscribe prices are
   gated to products the group covers (Mango + Berry). If the group read
   fails, a manual "Subscribe % fallback" setting (0-100) is used; if
   neither exists, subscribe data is omitted (one-time still syncs).
   Sync result now reports subPct + subPctSource ("plan"/"fallback"/null).
   Tests 9/9 pass (incl. plan, fallback, no-subscribe, outside-group).
   NOTE: the subscribe % refreshes on the next sync (settings save or
   discount webhook). Changing the Appstle plan alone does NOT trigger a
   sync — save settings or change a discount to refresh it.
2. MODE-AWARE LANDING BADGE (discount-price.js). The starburst
   (.burst, configurable via new landingBadgeSelectors setting, default
   [".burst"]) now shows the SELECTED mode's dynamic % — 15% when
   One-time is picked, 20% when Subscribe & Save is picked — on load AND
   on every toggle (change/click + MutationObserver re-run). Only the %
   number is rewritten; the burst shape/text is untouched. Each buy-box
   row's own Save pill shows its own mode's dynamic % (one-time row is
   usually already the app's own badge; the subscribe row's theme pill is
   updated to the dynamic spp). Writes are guarded (only when the text
   changes) so the MutationObserver loop settles. jsdom smoke test
   18/18 pass (burst switches 20→15→20, pills, custom CSS, Appstle
   restyle); original smoke test 19/19 still pass.
3. PRODUCT-PAGE BADGE STYLE. One-time price + badge already used the
   app's settings (sale colour + badge design). Appstle's subscribe badge
   (span.appstle_sellingPlan_discountText, "Save 20%") is now restyled to
   the app's badge colours: its pale green comes from Appstle's own widget
   custom CSS (#78F39D !important). The app overrides it with a
   higher-specificity stylesheet rule (body span... !important) + an
   inline style on every run (setProperty with 'important'). Only
   background/color/border-radius change; position/size/layout, the badge
   text, prices and widget behaviour are untouched. Verified safe in
   jsdom; live visual check still needed.
4. CUSTOM CSS (settings). New "Custom CSS" textarea, stored as
   customCss in discount_display.settings, injected by the script as a
   <style id="dd-custom-css"> element (textContent, not innerHTML) on
   every page where the embed runs. Empty = nothing injected.
5. SETTINGS UI. New "Subscription" section (selling plan group ID +
   subscribe % fallback), "Landing page badge selectors" field, "Custom
   CSS" section. Success banner now reports the subscribe % + source.

DEPLOYED + VERIFIED (curl): extension biome-discount-display-4 live on
the CDN (18,530 bytes; all new markers present). Vercel /health 200.
NOT YET DONE (needs a browser task): the metafield still holds only
{o, s} — a RE-SYNC is required (open the app Settings page, click "Save
and sync discounts") so the new sync code writes op/sp/spp. Only then
will the burst switch. Then visually verify in the pilot preview:
product page (one-time $50.97 + Save 15% in app style; subscribe $47.98
+ Save 20% with the Appstle badge now dark green), /collections/all
cards, Enzymes + Gut First toggle test (burst 15% ↔ 20%), custom CSS
field saves + injects. Do NOT buy anything; do NOT change theme files.
