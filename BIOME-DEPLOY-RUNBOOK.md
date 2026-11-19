# Biome Discount Display — deploy runbook

Code is DONE (commit `4b314c5` in `~/workspace/discount-app-biome/`, handover in
`BIOME.md`). Tests 4/4 pass, production build succeeds with the Vercel preset.
Deploy is blocked on three account-access steps that need Khubaib / the main
agent (browser or re-authorisation). Nothing below is done yet — do the steps
in order.

## Blocker 1 — Fresh Shopify app record (Partner sign-in required)

The Shopify CLI cannot do this from this VM: `exec` has no PTY, and the CLI
refuses non-interactive use (`auth login` demands `--alias`,
`app config link` demands `--client-id`). There is no Partner org ID on file.

1. In a browser task, Khubaib signs in to the Partner dashboard
   (partners.shopify.com / dev.shopify.com) and creates a new app:
   - Name: **Biome Discount Display**
   - App URL (once step 2 exists): `https://biome-discount-display.vercel.app`
   - Redirect URL: `https://biome-discount-display.vercel.app/auth/callback`
   - API scopes: `read_discounts,read_products,write_products`
2. Note the new **client ID** and **client secret**. The secret must never go
   through chat — set it straight into the Vercel env var (step 2) and the
   local `.env` (step 3).
3. Update `~/workspace/discount-app-biome/shopify.app.toml`: `client_id` and
   `application_url` (`https://biome-discount-display.vercel.app`). Do NOT
   reuse the old "disocunt app" credentials (client_id `6e8ac5ba…`).
4. Write `~/workspace/discount-app-biome/.env` (never commit it):
   `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES=read_discounts,read_products,write_products`,
   `SHOPIFY_APP_URL=https://biome-discount-display.vercel.app`,
   `DATABASE_URL` (from step 2).
5. Run `shopify app deploy` from `~/workspace/discount-app-biome/` (real CLI
   is `/usr/bin/shopify`, v5.0.2 — `/opt/hatch/bin/shopify` is the connector
   wrapper, not the CLI). This registers the extension + webhook
   subscriptions. Re-run it after any `shopify.app.toml` change.

## Blocker 2 — Vercel team access + project + Postgres

The Vercel MCP connection is 403 on team-scoped calls: `list_projects` and
`create_project` both fail with "Not authorized: Trying to access resource
under scope khubaib-irfans-projects … You must re-authenticate to this
scope". The recovery tool named in the error (`authorize_team_access`) does
NOT exist in the Vercel MCP catalog, so this needs a re-connect of Vercel
with team access (or the Vercel CLI with a fresh login) by the main agent.

Once Vercel works (team `khubaib-irfans-projects`,
`team_0hm4VrlPUaz5C5YLYPcIMQ4b`, user khubaibrana71@gmail.com):

1. Create project **biome-discount-display**: framework `react-router`,
   build command `npm run vercel-build` (runs `prisma db push` + production
   build). URL will be `https://biome-discount-display.vercel.app`.
2. Create a **Postgres** store (Vercel Postgres / Neon) and link it to the
   project. There is NO MCP tool to create a Postgres store (only Blob), so
   this is a dashboard step. Copy its connection string as `DATABASE_URL`.
   SQLite is not acceptable (Vercel's filesystem is ephemeral).
3. Set env vars (production + preview): `SHOPIFY_API_KEY`,
   `SHOPIFY_API_SECRET`, `SCOPES=read_discounts,read_products,write_products`,
   `SHOPIFY_APP_URL=https://biome-discount-display.vercel.app`,
   `DATABASE_URL`.
4. Deploy. Confirm `/health` returns 200 `ok`.
   Note: this VM's egress proxy resets large Node-fetch downloads (Prisma
   engines) — use curl for those if a build fails the same way; Vercel's
   network should not have the issue.

## Blocker 3 (recommended, not strictly blocking) — GitHub repo for the fork

The local repo's remote is still the ORIGINAL repo
(`RanaKhubaib/shopify-discount-price-display`) — **never push the Biome fork
there**. Create a new repo (e.g. `RanaKhubaib/biome-discount-display`) via
the GitHub MCP (`create_repository` + `push_files`, 69 source files, 832K),
then link it to the Vercel project (`create_git_project`) for auto-deploys
on push. Alternative if GitHub is skipped: `create_deployment` with the
source files inlined (69 files, ~832K).

## Step 4 — Install on Biome Theory, configure, verify (pilot draft only)

Only after steps 1–2 are done:

1. Install the fresh app on **Biome Theory only** (`biometheory.shop`).
   Khubaib approves the install. Do not install on any other store.
2. In the app's Settings page: enable the display, pick the active discount
   **"Nov 18–25 One-Time 15% Off"**, badge forest `#42572A` background /
   white text / pill / medium, and the selectors for Biome's pages.
   Default landing selector: `.purchase-opt[data-purchase-opt="onetime"] .purchase-price`.
3. Enable the app embed ONLY in the pilot draft theme
   ("Copy of biometheory-live - GF subscription pilot",
   `gid://shopify/OnlineStoreTheme/169102147801`). NEVER the live MAIN theme
   (`168607187161`), NEVER publish — Khubaib publishes himself.
   Theme-file helper: `~/workspace/biome-pilot-rollout/theme_files.py`.
   Save a backup snapshot under `~/workspace/backups/biome-theory/` BEFORE
   any theme change, with before-values, after-values and exact revert steps.
4. Verify in the pilot preview (`preview_theme_id=169102147801`): product
   page (one-time $50.97 struck-through $59.97 + Save 15% badge; Subscribe
   still $47.98 with the 3 free gifts), all 8 landing pages
   (`/pages/biome-enzymes`, `/biome-gut-first`, `/biome-gut-health-2`,
   `/biome-probiotics-2`, `/biome-taste-2`, `/biome-caffeine-free`,
   `/biome-mom-story`, `/biome-routine` — one-time $50.97 + badge, Subscribe
   $47.98, toggle works both ways), and product cards. Empty the cart after
   any test add.

## Unchanged

- The Nov 26 cron (`biome-theory-nov-26-price-switch`, Thu 26 Nov 00:30 EST)
  stays untouched as the fallback until the app is live and verified.
- The app handles one-time prices only; subscription stays on the Appstle
  selling plan in the theme's Liquid code.

## Status — 2026-11-19 ~04:52 PKT (deploy coordinator, resumed after Vercel re-authorisation)

- Vercel MCP route is CLOSED even after the fresh re-authorisation:
  `list_teams` still returns an empty list; `list_projects` for team
  `khubaib-irfans-projects` still 403 ("You must re-authenticate to this
  scope"). The error names `authorize_team_access`, but that tool does NOT
  exist in the Vercel MCP catalog (verified via `list-tools`). Do not retry
  the MCP — use the dashboard / CLI routes below.
- GitHub route is also blocked from this VM: `create_repository` via the
  GitHub MCP fails 403 ("Resource not accessible by integration" — the
  Muse GitHub App cannot create repos); `gh` CLI is installed but NOT
  logged in (`gh auth login` needs a browser). No repo
  `RanaKhubaib/biome-discount-display` exists yet. `push_files` would work
  only once the repo exists AND the GitHub App installation covers it.
- Vercel CLI 66.2.0 IS installed at `/usr/bin/vercel` (global npm install),
  but logged out. `vercel login` needs a browser approval. Once logged in,
  the CLI can deploy the local folder directly (no GitHub repo needed).
  NOTE: `/opt/hatch/bin/vercel` is the MCP wrapper and shadows the CLI in
  PATH — call the real CLI by its full path `/usr/bin/vercel`.
- Local repo is committed and ready: `593942a` (new Partner app client_id
  + application_url in `shopify.app.toml`). Nothing deployed yet; no Vercel
  URL, no install, no verification yet.
- Remaining work needs the parent's browser tasks: (1) `vercel login`
  approval; (2) Postgres store creation in the Vercel dashboard (Neon) —
  no MCP/CLI path for it; (3) carry the Partner client secret from the
  Partner dashboard into the Vercel `SHOPIFY_API_SECRET` env var (never
  through chat/reports); (4) project creation + deploy + `/health` check;
  (5) `shopify app deploy`, install on Biome Theory, configure, pilot-draft
  verification (steps 4 in the runbook above).
