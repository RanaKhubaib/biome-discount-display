// Shared slot definitions — imported by BOTH the server sync module and
// the settings page component. This file must stay free of server-only
// code (no *.server imports): React Router ships the settings component
// to the browser, and a server module import there breaks the build.
//
// One display slot per place a price can appear. `kind` decides which
// sub-settings the place has: "price" places rewrite a price (sale,
// struck original, badge); "static" places rewrite a price found inside
// button/label text; "badge" places only rewrite the % number inside an
// existing theme badge (the badge's shape and colours stay the theme's).
// `selectorKey` is the top-level settings key holding that slot's CSS
// selectors. The script reads slots from `settings.slots` (display
// settings) plus these selector lists.
export const SLOT_DEFS = [
  {
    id: "card",
    label: "Product cards",
    kind: "price",
    selectorKey: "cardSelectors",
    help: "Prices on collection and home page product cards.",
    defaultSelectors: [".price"],
  },
  {
    id: "product",
    label: "Product page",
    kind: "price",
    selectorKey: "productSelectors",
    help: "The main price on the product page. Only the one-time price is rewritten — when a buyer picks Subscribe, Appstle owns the price and this app leaves it alone.",
    defaultSelectors: [".price"],
  },
  {
    id: "landing",
    label: "Landing buy boxes",
    kind: "price",
    selectorKey: "landingSelectors",
    help: "One-time prices in landing-page buy boxes, including the buy-box price line. Never add a selector that matches a subscribe price.",
    defaultSelectors: [
      '.purchase-opt[data-purchase-opt="onetime"] .purchase-price',
      ".price-line .now",
    ],
  },
  {
    id: "widgetOneTime",
    label: "Appstle widget — one-time row",
    kind: "price",
    selectorKey: "widgetOneTimeSelectors",
    help: "The price in the Appstle widget's One-time purchase row on the product page. It is rewritten to the same layout as the Subscribe row: sale price, struck original, badge. The Subscribe row itself is never touched — Appstle owns it.",
    defaultSelectors: [".appstle_onetime_amount"],
  },
  {
    id: "cta",
    label: "Buttons & price text",
    kind: "static",
    selectorKey: "ctaSelectors",
    help: "Buttons and lines whose text contains a static price — hero and final CTA buttons, the add-to-cart price and the sticky bar. The app finds the price inside the text and rewrites it; the button label stays exactly as it is. A price matching the one-time price gets the one-time sale, a price matching the subscribe price gets the subscribe sale.",
    defaultSelectors: [
      '.cta-wrap a.btn[href="#buy"]',
      ".la-cta a.btn",
      'button[data-add="current"] .final-price',
      'button[data-add="current"] .sticky-price',
      ".ostrip",
    ],
  },
  {
    id: "burst",
    label: "Starburst badge",
    kind: "badge",
    selectorKey: "landingBadgeSelectors",
    help: "The SAVE % burst on landing pages. Only the % number is rewritten, to the selected purchase mode's % — the burst shape and colours stay exactly as the theme renders them.",
    defaultSelectors: [".burst"],
  },
  {
    id: "ctaPill",
    label: "CTA “Save %” pills",
    kind: "badge",
    selectorKey: "ctaBadgeSelectors",
    help: "The “Save 24% + Free Shipping” pills next to CTA buttons. Only the % number is rewritten, to the selected purchase mode's % — the pill shape and colours stay as the theme renders them.",
    defaultSelectors: [".cta-wrap .pill", ".oc-tag"],
  },
  {
    id: "global",
    label: "Global catch-all",
    kind: "price",
    selectorKey: "globalSelectors",
    help: "A fallback for any price element not covered by a place above. It only touches elements no other place has already rewritten. Leave empty to keep it off.",
    defaultSelectors: [],
  },
];
