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

## v9 — widget one-time row structural fallback (2026-11-19, app phase only)

Failing check: on the product page the Appstle widget's One-time row
showed ONLY $59.97 (red), with no $50.97, no struck-through $59.97 and
no Save 15% badge — while the Subscribe row ($47.98 + struck $59.97 +
SAVE 20% pill) and the main price were both correct. App data and
settings were all verified correct (discount "15% Off" selected, slot
enabled, selector `.appstle_onetime_amount`, prices {o: 59.97, s: 50.97,
op: 15, sp: 47.98, spp: 20}); the live v8 script was byte-identical to
local; jsdom repros of the rewrite all passed. So the live failure was a
live-runtime difference: the one-time price span in the live widget does
not always carry the `.appstle_onetime_amount` class (some widget
variants render it without that class), so the configured selector found
nothing. Appstle's JS itself never references that class (0x in
appstle-subscription.min.js) — it comes only from the Mustache template.
No shadow DOM (0x attachShadow/shadowRoot in Appstle's JS); the
attachShadow mentions in the page are a third-party bot-detection script
that does not patch MutationObserver.

Fix (ONE file — extensions/discount-price-embed/assets/discount-price.js):
1. STRUCTURAL FALLBACK in updateWidgetOneTime: in addition to the
   configured selector, the function now ALSO finds the one-time row by
   its radio (input[name="selling_plan"][value=""]) and rewrites the
   price span inside it (span.appstle_sellingPlan_price, excluding
   .appstle_onetime_amount_compare and .appstle_price_block, only when
   looksOneTime says it currently shows the one-time original/sale
   price). Only the one-time row is ever matched (the Subscribe row's
   radio carries a plan id, never ""); both paths can find the same span
   and applyWidgetOneTime's key + .dd-sale guard makes the second call a
   no-op. The Subscribe row is never touched.
2. OBSERVER-FIRST + safeRun: the MutationObserver and the
   change/click/shopify:section:load listeners are now set up BEFORE the
   first run() call, and run() is wrapped in a try/catch (safeRun) used
   by the retry timers too. Previously a throw in run() skipped the
   observer setup entirely, so a widget rendered later by Appstle was
   never caught. No Appstle badge override re-added (v8 deliberately
   removed it; the owner designs Appstle's badges himself).

Tests: node --check OK; smoke 13/13 (npm run test:smoke — 10 original +
3 new: fallback rewrites the row when the span lacks the class, late
injection without the class, whole-span replacement without the class;
all confirm the Subscribe row untouched); discount-sync 14/14;
production build OK. GitHub commit
7abfd1a51bf0dbce63491ea9dcc34051f70d19e6 (main, push_files only,
provenance-checked: remote head was 545ebf71, remote content matched the
v8 state, diff was exactly this fix). Deployed: extension
biome-discount-display-9
(https://dev.shopify.com/dashboard/140278598/apps/449145503745/versions/1247910526977).
CDN byte-check: pilot preview product page loads
.../biome-discount-display-9/assets/discount-price.js (34,068 bytes),
SHA-256 identical to local (c7e7feb7...), structural-fallback markers
present, Appstle-restyle markers 0. Deploy note: the CLI sat silent at
the release prompt for ~6 min (no log output) until Up+Enter was sent —
the prompt is the only interactive step; if a future deploy looks hung,
send Up+Enter rather than assuming it failed.

## v13 — Hero / section links follow the purchase-mode toggle (2026-11-19, app phase only, NOT yet deployed)

DEFECT (last open item from the 06:01 PKT "what's left" list, besides the
mobile check): hero and section links showed a static one-time price in
Subscribe mode — e.g. Taste 2's hero link stayed "Pick Your Flavor —
$50.97 $59.97 Save 15%" after toggling to Subscribe, while the flavour
cards and bottom button correctly reverted to $47.98 / Save 20%.
ROOT CAUSE (as recorded in the v11 OPEN note): the cta/static-text
rewrite was TOKEN-based, not mode-aware — a $59.97 token always mapped
to the one-time sale — and the data-dd-static-key guard returned early
on toggle because the key did not include the mode, so the price was
never re-derived. Not a selector gap: the hero link IS covered by the
cta selector (.cta-wrap a.btn[href="#buy"]).

FIX (ONE file — extensions/discount-price-embed/assets/discount-price.js,
+~25/-~5 lines):
1. staticTargetFor(n, lp, mode): when mode is "subscribe" and a subscribe
   sale exists, a token equal to the one-time original maps to the
   subscribe sale ($47.98 / 20%). Other mappings unchanged (a $47.98
   token still maps to the subscribe sale; a $59.97 token in One-time
   mode still maps to the one-time sale; "$2.40 a glass" untouched).
2. applyStaticText(el, lp, cfg, handled, mode): the selected mode is now
   part of the static key, so a toggle changes the key, restores the
   element to its original text and re-derives the price from the new
   mode instead of the key guard returning early with the stale price.
3. run(): the CTA loop passes landingSelectedMode() into
   applyStaticText. Buy-box per-row prices are untouched (subscribe row
   still never rewritten); only the shared CTA / strip / ATC-price
   displays follow the mode, like the price line. No Appstle badge
   override re-added; no theme file, discount, or Appstle plan touched.

TESTS (run 2026-11-19 ~11:05 PKT): node --check OK; smoke tests 19/19
pass (18 existing + 1 new: hero link follows the toggle both ways —
Subscribe $47.98/Save 20% on load, One-time $50.97/Save 15% after
toggle, back to $47.98/Save 20% on toggle back; Taste 2 hero markup
`<a class="btn" href="#buy" id="heroCta">`); the existing landing test
now asserts the mode-aware CTA too (it previously encoded the bug by
asserting $50.97 while Subscribe was selected). Discount-sync tests
14/14 pass; production build OK. File: 40,818 bytes, SHA-256
8b04f5a52eed150c3bc8507402d8ecf8556a20c74f67a88ba93e8c0979548828.

NOT YET DONE (needs the deploy + live-browser step): push via GitHub MCP
push_files only, provenance-checked (remote head must be b51dd666…,
the v12 commit — do NOT git-push: the local git remote is still the
ORIGINAL RanaKhubaib/shopify-discount-price-display repo, never push
the Biome fork there), deploy via Shopify CLI (will be
biome-discount-display-13), CDN byte-check, then browser-verify in the
pilot preview: Taste 2 hero link + other hero/section links show
$47.98/Save 20% in Subscribe mode and $50.97/Save 15% in One-time mode,
toggling both ways; buy boxes, price line, main price and Subscribe row
unchanged. Nothing published; live theme untouched.

PUSH BLOCKED 2026-11-19 ~11:15 PKT: the GitHub push_files call was
policy-denied (approval_id connector-attempt-11590ba3a4e760f0e001eeed45425c9b68177efb8ca8eab9078b37944a34d3d6)
— approval cannot be raised during proactive work, and the denial says
do not retry it or try another way. Provenance was verified clean
before the attempt (remote head b51dd666…, diff is exactly the v13
change; smoke 19/19 + sync tests re-run and passing). The push, deploy
and live verification now wait on Khubaib asking for it in chat, so the
approval can be raised there.

## v13 (part 2) — Black sale / grayish compare / 6px gap / Subscribe-row colours (2026-11-19, app phase only)

OWNER REPORT (screenshots ~11:22 PKT): one-time row showed BOTH prices
red and cramped ("$50.97$59.97", no gap); hero CTA button the same
("Add to Cart — $47.98$59.97 Save 20%", folded + cramped); Subscribe
row "$47.98 $59.97" (red sale, dark/gray struck compare, WITH a gap)
is the structure to match; main price "$47.98 $59.97 Save 20%" (red
sale, struck gray, gap, dark-green badge).

DEFECT 1 — ROOT CAUSE (verified in code, not guessed): the struck
`.dd-orig` had NO colour of its own — liquid CSS only set
`opacity: 0.6` — so it inherited the colour of the element around it.
Inside Appstle's widget rows that element is Appstle's own red price
span (the one-time row showed "$59.97 (red)" even before the app ran,
per the v9 notes), so both prices rendered red. DEFECT 2 — GAP: the
widget one-time row sets innerHTML directly (no `.dd-wrap`) and CTA
button text gets the price spans inline (also no `.dd-wrap`), so the
liquid `.dd-wrap > *` spacing never applied there — hence the cramp.
The Subscribe row has a gap because Appstle's own markup spaces it.

FIX (app only — 6 files):
1. NEW `compareColor` setting (global + per-slot, default `#6b7280`):
   `DEFAULT_SETTINGS` + `loadSettings` + `normalizeSlot` in
   `app/discount-sync.server.js`; global + per-slot colour fields in
   `app/routes/app.settings.jsx` (Price layout + each price slot card;
   preview struck price now uses it). `saleColor` default `#d82c0d` →
   `#000000` in the same three places (server default, settings-page
   action fallback, script fallback).
2. `discount-price.js`: `priceInnerHtml` now puts BOTH colours INLINE
   (sale `color:<saleColor>`, orig `color:<compareColor>`) and a
   `margin-right:6px` after EACH price — the gap now travels with the
   markup into the widget row and CTA buttons, matching the liquid 6px
   `.dd-wrap` spacing (liquid `.dd-wrap > *` 0.4em → 6px, `.dd-orig`
   `opacity: 0.6` → `color: #6b7280` fallback). `slotCfg` /
   `cfgSignature` carry `compareColor`, so a colour change re-renders
   (the old key would have returned early and kept the red). Badge
   rendering unchanged — it already used the settings (`bg #42572A`,
   `text #ffffff`) as the single source of truth everywhere.
3. SUBSCRIBE ROW COLOURS (new `injectSubscribePriceColors`, runs on
   every `run()`): the Subscribe row is Appstle's, values never
   rewritten — recoloured by CSS injection only, driven by the same
   sale/compare settings. Rules are scoped to the subscribe wrapper
   only (WIDGET_TYPE_2 `.appstle_subscription_price_wrapper ...` +
   Mustache `.appstle_price_block` spans), `!important`, in a
   `<style id="dd-subscribe-price-colors">`. The one-time wrapper
   classes are deliberately NOT matched. If Appstle renames the
   classes the rule silently stops matching (row falls back to
   Appstle's colours) — it can never break a price value. No Appstle
   badge override re-added.
4. BADGE AUDIT: app badges (product page one-time mode, cards,
   landing one-time rows + price line, CTA static badges) all render
   from the settings — bg `#42572a`, text `#ffffff`, pill/medium.
   Appstle's own badges are NOT the app's: Subscribe row left pill
   (`.appstle_bundle_discount_amount.subscription_discount`, "SAVE
   20%"), one-time row left pill (`.appstle_bundle_discount_amount.
   one_time_discount`, "SAVE 15%"), and the MAIN-PRICE "Save 20%"
   badge in Subscribe mode (`span.appstle_sellingPlan_discountText`,
   pale green from Appstle's merchant custom CSS `#78F39D`) — the
   main-price badge in Subscribe mode is Appstle's because the app
   unapplies its main-price rewrite in Subscribe mode. The app COULD
   recolour that badge via the same CSS-injection mechanism (v2/v5
   did, removed in v6 by owner direction) — flagged, NOT done; owner
   designs Appstle badges in Appstle. Same for the main price VALUE
   colour in Subscribe mode ($47.98 stays Appstle red): the CSS
   injection covers the widget Subscribe row only, not the main
   `.price` (too broad a selector to target safely from the app).
5. DYNAMIC AUDIT: no hardcoded price/%/colour left in the storefront
   script's executable code — the only `$xx.xx` strings are comments
   (new smoke test strips comments and asserts none remain, plus no
   `#d82c0d`, no `Save 15%`/`Save 20%` literals). Prices come from
   the synced metafield (selected discount / selling plan) and
   colours from settings. Nov 26 (25% one-time / 30% subscribe) and
   Dec 2 (back to $59.97) work by re-picking the discount — the app
   follows the SELECTED discount; no hardcoded 15%/20% anywhere.
   (Settings-page preview still shows $50.97/$59.97 as labelled
   example prices — display-only, not storefront.)
6. CODE REVIEW FIX: merchant-controlled selectors are now read through
   a `qsa()` helper (invalid selector → empty list). Before, one
   typo'd selector threw inside `querySelectorAll` and aborted the
   whole `run()` — the widget rewrite and everything after it never
   ran. RESIDUAL RISKS (not fixed): (a) Appstle's merchant custom CSS
   could beat the subscribe-colour injection if it uses a MORE
   specific `!important` rule on the same spans — live browser check
   will confirm; (b) the MutationObserver re-runs on every DOM
   mutation with up-to-2s retry timers — writes are key-guarded so it
   settles, but a theme/Appstle change that rewrites prices
   continuously would keep it busy; (c) subscribe % refreshes only
   on the next sync (settings save / discount webhook) — an Appstle
   plan change alone does not trigger one; (d) the Nov 26 switch
   depends on the NEW discount being the SELECTED one (cron/manual
   step, not the app's).

LIVE SAVED SETTINGS (read via GraphQL 2026-11-19, shop
gid://shopify/Shop/76869566681 — verified before the change):
sale `#d82c0d` top-level + slots card/product/landing/widgetOneTime/
cta/global (7 wells; burst/ctaPill already `#000000`, unused there);
badge pill/medium, bg `#42572a`, text `#ffffff` everywhere; discount
"15% Off" (1577223291097); selling-plan group 3389751513; custom CSS
`.dd-sale { font-weight: 700; }`. UPDATED 2026-11-19 via GraphQL
metafieldsSet (metafield gid://shopify/Metafield/72586627514585, no
user errors) to sale `#000000` + compare `#6b7280` (top-level + all 8
slots), every other key verified unchanged on re-read — backup of the
pre-change settings:
`~/workspace/backups/biome-theory/discount-display-settings-2026-11-19-before-v13.json`
(after-state saved alongside it). Sale goes black on the live v12
script immediately (it already reads `S.saleColor`); the grayish
compare needs the v13 script (new `compareColor` key).

TESTS (run 2026-11-19): node --check OK; smoke 24/24 (19 existing +
5 new: colours/gap/badge on the product page; widget one-time row
grayish + gap + exactly one badge; subscribe-row CSS injection with
values untouched; no hardcoded prices in script code; invalid
selector degrades one place only); discount-sync 15/15 (14 existing +
1 new defaults test; per-slot test now covers compareColor);
production build OK. Script 45,591 bytes, SHA-256
e1138a811ce9cb6a558e43222909478a82854403d87c4def9fb328b7c9304722.
PUSH: GitHub commit c966d67c5ce8badd9960c4cb64595e8df4b44275 on main
(7 files, push_files only, provenance-checked: remote head was
b51dd666…, diff is exactly the hero-toggle fix + this colour work;
slot-defs.js and package.json byte-identical to remote, not pushed;
all 7 files read back byte-identical). DEPLOY: extension
biome-discount-display-13
(https://dev.shopify.com/dashboard/140278598/apps/449145503745/versions/1248017514497).
CDN byte-check PASSED on the first fetch (no ~2 min cache delay this
time): pilot preview product page loads
.../biome-discount-display-13/assets/discount-price.js (45,591 bytes),
SHA-256 identical to local (e1138a81…); markers
dd-subscribe-price-colors ×2, compareColor ×8, margin-right:6px ×2,
sale default #000000 ×1, #d82c0d ×0, mode-aware staticTargetFor ×2,
rowHasAppstleBundleBadge ×0. The rendered pilot page also carries the
new liquid CSS (`.dd-wrap > * { margin-right: 6px; }`,
`.dd-orig { color: #6b7280; }`) and the live settings JSON
(`saleColor #000000`, `compareColor #6b7280`). Vercel /health 200
after the push (auto-redeploy from main).
parent runs it next: product page one-time row $50.97 BLACK + $59.97
struck GRAYISH with a gap + exactly one badge (Appstle's left pill);
Subscribe row $47.98 BLACK + $59.97 struck grayish, values unchanged;
main price one-time mode black/grayish + gap; hero CTA button prices
no longer cramped; landing buy boxes / price line / cards the same;
reload + toggle both ways. Nothing published; live theme, discounts
and Appstle plans untouched.

## v12 — One-time row: NEVER add an app badge in the widget one-time row (2026-11-19)

WHY v11 FAILED LIVE: v11's conditional logic (add the app badge only
when Appstle's bundle pill is empty, relying on the MutationObserver to
drop it when Appstle fills the pill late) did NOT work on the live
store. Two browser checks (10:27–10:28 and 10:29–10:30 PKT, after the
page cache cleared) both showed TWO badges in the One-time row on
first load and after reload, in both modes. The observer
(characterData: true, childList, subtree) does not reliably drop the
app badge — Appstle fills its pill after the app runs and the live
re-render does not remove the already-added app badge. FIX (app only,
ONE file: discount-price.js): `rowHasAppstleBundleBadge` removed
entirely; `applyWidgetOneTime` now forces `showBadge: false`
unconditionally — the widget one-time row's price rewrite renders
sale + struck original only ("$50.97 $59.97"), never its own badge.
The row's badge is Appstle's own left bundle-discount pill (matching
Subscribe's single left pill), so exactly one badge per row with no
race at all. Appstle's left pill untouched; Subscribe row untouched;
no Appstle badge override re-added; main price and landing-page
badges unaffected (they still render their badges).

TESTS: node --check OK; smoke tests 18/18 pass (8 widget one-time
row tests now expect NO .dd-badge; the 'drops the app badge' test was
renamed to 'never adds an app badge even when Appstle's bundle pill is
empty on load'); discount-sync tests 14/14 pass; production build OK.
PUSH: GitHub commit b51dd66680742515290b5fd189c6caed8b62ca4e on main
(2 files, MCP push_files only, provenance-checked: remote head was
1a39f93c70463d6ae089653927706c44d4e26e41, diff was exactly this fix —
js: rowHasAppstleBundleBadge function removed, effCfg now
unconditionally showBadge:false; test: 8 one-time-row assertions now
expect .dd-badge null, renamed test; read back byte-identical; sync
record updated, 14 entries). DEPLOY: extension version
biome-discount-display-12
(https://dev.shopify.com/dashboard/140278598/apps/449145503745/versions/1247952240641).
CDN byte-check PASSED: pilot preview product page loads
biome-discount-display-12/assets/discount-price.js (39,637 bytes),
SHA-256 64297d3b7b309cdc282f9a69a78af122cd839334dd7e129292fd31d1e13a663d
identical to local; markers showBadge: false ×1 (line 499, in
applyWidgetOneTime), rowHasAppstleBundleBadge ×0. Browser
verification NOT run by this subagent — no live-browser tool is
available in this subagent's toolset (parent runs it next): product
page One-time row must show $50.97 + $59.97 struck with EXACTLY ONE
badge (the left "SAVE 15%" pill) and no pill on the right, matching
Subscribe, on first load AND reload, in both modes; main price still
correct in both modes; Subscribe row untouched.

## v11 — One-time row: no app badge when Appstle's bundle pill is already there (2026-11-19)

DEFECT — One-time row carried TWO Save 15% badges ("SAVE 15%" next to
the label on the LEFT, "Save 15%" on the RIGHT beside the price) while
the Subscribe row has only ONE ("SAVE 20%" on the left, right side just
"$47.98 $59.97"). ROOT CAUSE (verified from Appstle's own JS): the LEFT
"SAVE 15%" pill is Appstle's bundle-discount slot
(.appstle_bundle_discount_amount.one_time_discount), filled by Appstle's
bundle logic (`querySelectorAll(".appstle_bundle_discount_amount.one_time_discount").forEach(t => t.innerHTML = ...)`).
The RIGHT "Save 15%" pill was the app's own badge from the
widgetOneTime price rewrite. FIX (app only, ONE file:
discount-price.js): new `rowHasAppstleBundleBadge(el)` — finds the
row's outer option wrapper (.appstle_subscription_wrapper_option on
WIDGET_TYPE_2, .appstle_input_wrapper / label on the Mustache
template; NOT .appstle_one_time_details_wrapper, which does NOT contain
the pill — the pill is a sibling of the details wrapper) and returns
true only when its .appstle_bundle_discount_amount has non-empty text
(Appstle renders the span empty and fills it later; an empty
placeholder means no visible Appstle pill yet, so the app badge still
renders). `applyWidgetOneTime` derives an effective cfg with
showBadge:false when the pill is present, so the price renders as
"$50.97 $59.97" with NO app badge — exactly one badge per row,
matching Subscribe. The badge decision is part of the data key, so if
Appstle fills its pill late the MutationObserver re-run (it observes
characterData + childList on document.body) re-renders the row without
the app badge. Appstle's left pill untouched; Subscribe row untouched;
no Appstle badge override re-added; main price and landing-page badges
unaffected (they still render their badges). Taste 2 hero link NOT
touched in this version (dropped per owner instruction to move fast;
see below).

TESTS: node --check OK; smoke tests 18/18 pass (16 existing + 2 new:
no app badge when Appstle's bundle pill is already there; drops the
app badge when Appstle fills its bundle pill late — both assert the
price is $50.97 + struck $59.97 with no .dd-badge, Appstle's left pill
still "SAVE 15%", Subscribe row untouched); discount-sync tests 14/14
pass; production build OK. PUSH: GitHub commit
1a39f93c70463d6ae089653927706c44d4e26e41 on main (2 files, MCP
push_files only, provenance-checked: remote head was e9751fbf, diff
was exactly this fix, +44/-2 js, +103/-0 test; read back
byte-identical; sync record updated, 13 entries). DEPLOY: extension
version biome-discount-display-11
(https://dev.shopify.com/dashboard/140278598/apps/449145503745/versions/1247946407937).
CDN byte-check: pilot preview product page loads
biome-discount-display-11/assets/discount-price.js (40,967 bytes),
SHA-256 46c0d861… identical to local; markers
rowHasAppstleBundleBadge ×2, effCfg ×4, appstle_bundle_discount_amount
×2, Appstle-restyle markers 0. Browser verification NOT run by the
subagent (parent runs it next): product page One-time row must show
$50.97 + $59.97 struck with EXACTLY ONE badge (the left "SAVE 15%"
pill) and no pill on the right, matching Subscribe, on first load AND
reload, in both modes; main price still correct; Subscribe untouched.

OPEN (dropped from this version per owner instruction, for a separate
fix): Taste 2 hero link ("Pick Your Flavor — $50.97 $59.97 Save 15%")
does not follow the One-time → Subscribe toggle — after toggling, the
flavour cards and bottom button correctly revert to $47.98 / Save 20%
but the hero link stays at $50.97 / Save 15%. Element: the hero CTA
`<a class="btn" href="#buy" id="heroCta">` inside `.cta-wrap` in
sections/biome-taste-2-hero.liquid (rendered text "Pick Your Flavor —
{{ taste2_mv.price | money }}"). It IS covered by the app's cta
selector (.cta-wrap a.btn[href="#buy"]) — it gets rewritten to the
one-time sale — so this is NOT a selector gap. It is a LOGIC gap: the
cta/static-text rewrite (applyStaticText + staticTargetFor) is
TOKEN-based, not mode-aware — a token equal to the one-time original
($59.97) always maps to the one-time sale, and once rewritten the
element's own .dd-sale/.dd-orig/.dd-badge spans are skipped by the
TreeWalker and the data-dd-static-key guard returns early, so the
toggle never re-derives the price from the selected mode. Fixing it
needs the cta rewrite to follow landingSelectedMode() (re-derive the
CTA price from the selected mode and include the mode in the static
key) — not a selector addition. Same gap was seen on other pages'
hero/section links (static one-time price in Subscribe mode).

## v10 — WIDGET_TYPE_2 one-time row + duplicate compare in price line + saved countdown subtext (2026-11-19)

Live verification of v9 (browser task 09:45–10:00 PKT) found three
defects; all three are fixed here. Nothing published; live theme,
discounts and Appstle plans untouched.

DEFECT 1 — One-time row price STILL did not show $50.97 (v9 fix
incomplete). ROOT CAUSE (verified from the live page HTML + Appstle's
own JS, not guessed): the store uses WIDGET_TYPE_2, not the Mustache
template. The global widget type setting is WIDGET_TYPE_2 and the
product has no WIDGET_TYPE tag, so the type falls back to the global
setting. WIDGET_TYPE_2 is built programmatically by Appstle's JS, NOT
rendered from the Mustache template (types 3/4/5/6 use the template).
Appstle's JS (appstle-subscription.min.js, 380,656 bytes) has ZERO
references to appstle_sellingPlan_price, appstle_sellingPlan_formatted
CompareAtPrice, appstle_price_block and appstle_onetime_amount — those
classes exist ONLY in the Mustache template (WIDGET_TYPE_6, embedded in
allWidgetTemplateHtml alongside WIDGET_TYPE_1); the template's
widgetTemplateHtml is empty. WIDGET_TYPE_2 renders the one-time price
in <span class="appstle_subscription_amount transcy-money"> inside
.appstle_one_time_details_wrapper, where the radio is a DIRECT child and
the label is a SIBLING (not a parent), with no .appstle_input_wrapper
ancestor. So v9's fallback — radio.closest(".appstle_input_wrapper,
label") — returned null, and the selector path found nothing either.
That is why the row price never changed while the badge (Appstle's own
bundle-discount slot, .appstle_bundle_discount_amount.one_time_discount,
filled by Appstle's bundle logic) sometimes appeared. The sr-only span
beside the visible price carried "Regular price $59.97" — that is the
page text the browser read as the cause.

Fix (ONE file — extensions/discount-price-embed/assets/discount-price.js):
1. The structural fallback now tries .appstle_one_time_details_wrapper
   FIRST (WIDGET_TYPE_2), then .appstle_input_wrapper /
   .appstle_subscription_wrapper_option / label (Mustache), and within
   the container tries span.appstle_subscription_amount (WIDGET_TYPE_2
   visible price — exact class, so it does NOT match the sr-only
   "appstle_subscription_amount-appstle-sr-only" span) first, then
   span.appstle_sellingPlan_price, excluding compare spans
   (.appstle_onetime_amount_compare,
   .appstle_subscription_amount_compare_at_price), sr-only spans and
   .appstle_price_block, and requiring looksOneTime. The Subscribe row
   is never touched (its radio carries a plan id, never "").
2. setOneTimeCompareHidden now also hides the WIDGET_TYPE_2 compare
   span (.appstle_subscription_amount_compare_at_price) and finds its
   container via .appstle_one_time_details_wrapper.
3. NEW setWidgetSrText keeps the sr-only amount/compare spans beside
   the visible price in sync ("Sale price $50.97" / "Regular price
   $59.97", Appstle's own format), with originals saved and restored
   when the rewrite is removed. No-op when the sr-only spans do not
   exist (Mustache template). No Appstle badge override re-added.

DEFECT 2 — Duplicated compare-at "$59.97" in the price line (Enzymes,
Probiotics 2, Taste 2): "$47.98 $59.97 Save 20% $59.97". ROOT CAUSE
(confirmed in the pilot draft files): each price line has BOTH
<span class="now"> AND a sibling <s class="was">{{ variant.price |
money }}</s>; the app's .price-line .now rewrite adds its own struck
original, so the theme's struck price remained as a second one. Gut
First, Gut Health 2, Caffeine Free, Mom Story and Routine have NO
.price-line element, which is why they did not show it. Fix is in the
APP (not the theme), so the theme's fallback survives the app being
off: NEW setPriceLineWasHidden hides the theme's <s class="was"> in the
same .price-line while the app's rewrite is active, and restores it
when the rewrite is removed. Each price line now shows exactly ONE
struck $59.97 in both modes.

DEFECT 3 — Product-page countdown block still showed "BLACK FRIDAY
SALE– Get 25% off now**". ROOT CAUSE: the block instance lives in
templates/product.mangoe-falvour.json (the Mango product's own
template — NOT templates/product.json, which has no countdown block),
nested at sections.main.blocks.product-details.blocks.
bt_countdown_4Y343p, with SAVED pre-rework values: subtext "Get 25%
off now**", code "BFCM25", count_color "#39FF14" (neon). The rework
changed the block schema defaults but never updated this saved
instance; the snippet renders subtext only when non-blank, so the old
text showed. Fix (THEME, pilot draft only): that block instance now has
subtext "", the orphaned "code" key removed (schema no longer declares
it), count_color "#FFFFFF" (white, per the clean rework). Uploaded to
the pilot draft and SHA-256 verified MATCH on re-read (0bac677f…).
The Berry template (product.berry-flavour.json) has NO countdown block
— left alone. No countdown logic, end date or layout changed.

Tests: node --check OK; smoke 16/16 (npm run test:smoke — 13 original
+ 3 new: WIDGET_TYPE_2 row rewritten like the Subscribe row (visible
price + sr-only text + compare hidden, Subscribe untouched),
WIDGET_TYPE_2 survives Appstle re-rendering its text, price line shows
exactly one struck price when the theme already has <s class="was">);
discount-sync 14/14; production build OK. GitHub commit
e9751fbf0932fe46e4a0085893d1ee3cbf46475a (main, push_files only,
provenance-checked: remote head was 7abfd1a5, remote content of both
files fetched and diffed — the diff was exactly this fix, no
divergence; read back byte-identical, SHA-256 ce257392…). Deployed:
extension biome-discount-display-10
(https://dev.shopify.com/dashboard/140278598/apps/449145503745/versions/1247937134593).
CDN byte-check: pilot preview product page loads
.../biome-discount-display-10/assets/discount-price.js (38,884 bytes),
SHA-256 identical to local (ce257392…), fix markers present
(appstle_one_time_details_wrapper x3, setPriceLineWasHidden x3,
setWidgetSrText x4), Appstle-restyle markers 0. Deploy notes: the
Shopify CLI had vanished from /usr/bin (VM replaced — /usr is
ephemeral); reinstalled with `npm install -g @shopify/cli` (5.0.2) and
the stored session under ~/.config/ was reused, no re-auth needed. The
release prompt defaults to "(n) No, cancel" — send Up + Enter to pick
Yes. The pilot page HTML is cached ~2 min after a deploy (first fetch
still served v9; re-fetch after a wait served v10). House rule
(AGENTS.md): use the Shopify AI Toolkit for Shopify API/platform work;
no tooling was added to this repo — this work used the existing CLI +
GitHub MCP path only.

LIVE BROWSER VERIFICATION STILL NEEDED (parent to arrange — a generic
subagent cannot run browser tasks): in the pilot preview
(?preview_theme_id=169102147801), product page One-time row shows
$50.97 + $59.97 struck + Save 15% badge (same layout as Subscribe) on
first load AND reload, in both modes, Subscribe untouched; Enzymes /
Probiotics 2 / Taste 2 price line shows exactly ONE struck $59.97 in
both modes; product-page countdown block shows heading + timer with no
"Get 25% off now**" text. Mobile width still NOT verified (needs the
user to narrow the browser to ~390 px or check on a phone).
NOT YET DONE (needs a browser task): live visual verification in the
pilot preview — product page One-time row shows $50.97 + struck $59.97
+ Save 15% badge in the exact layout/design/size as the Subscribe row;
main price still correct; Subscribe row untouched. Do NOT buy anything;
do NOT publish; do NOT touch the live theme.

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
