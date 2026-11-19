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
