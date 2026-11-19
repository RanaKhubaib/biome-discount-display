import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const dir = dirname(fileURLToPath(import.meta.url));
const scriptSrc = readFileSync(join(dir, "assets", "discount-price.js"), "utf8");

const HANDLE = "biome-theory-super-greens-mango-flavour";
const VARIANT = "47678087266521";

function basePrices() {
  return {
    [HANDLE]: {
      variants: {
        [VARIANT]: { o: 59.97, s: 50.97, op: 15, sp: 47.98, spp: 20 },
      },
      o: 59.97,
      s: 50.97,
      op: 15,
      sp: 47.98,
      spp: 20,
      card: { o: 59.97, s: 50.97, op: 15, sp: 47.98, spp: 20 },
    },
  };
}

function baseSettings(overrides = {}) {
  return {
    enabled: true,
    showOnCards: true,
    showOnProductPage: true,
    showOnLandingPages: true,
    saleColor: "#000000",
    compareColor: "#6b7280",
    originalFirst: false,
    cardSelectors: [".price"],
    productSelectors: [".price"],
    landingSelectors: [
      '.purchase-opt[data-purchase-opt="onetime"] .purchase-price',
      ".price-line .now",
    ],
    widgetOneTimeSelectors: [".appstle_onetime_amount"],
    ctaSelectors: [
      '.cta-wrap a.btn[href="#buy"]',
      ".la-cta a.btn",
      'button[data-add="current"] .final-price',
      'button[data-add="current"] .sticky-price',
      ".ostrip",
    ],
    landingBadgeSelectors: [".burst"],
    ctaBadgeSelectors: [".cta-wrap .pill", ".oc-tag"],
    globalSelectors: [],
    slots: {},
    discountId: "gid://shopify/DiscountAutomaticNode/1577223291097",
    discountTitle: "15% Off",
    badgeEnabled: true,
    badgeStyle: "pill",
    badgeSize: "medium",
    badgeBg: "#42572A",
    badgeColor: "#ffffff",
    sellingPlanGroupId: "gid://shopify/SellingPlanGroup/3389751513",
    subPctFallback: null,
    customCss: "",
    ...overrides,
  };
}

// Builds a jsdom page, installs window.DiscountDisplay + window.Shopify,
// runs the storefront script as a <script> element (so it executes in the
// page's own context, exactly as the theme app embed loads it), and returns
// the dom. `setup` runs before the script is added (e.g. to set
// window.*_PRODUCTS).
function runPage(html, url, settings, prices, setup) {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });
  dom.window.Shopify = { currency: { active: "USD", rate: 1 } };
  dom.window.DiscountDisplay = { settings, prices };
  if (setup) setup(dom.window);
  const script = dom.window.document.createElement("script");
  script.textContent = scriptSrc;
  dom.window.document.head.appendChild(script);
  return dom;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Order of the rendered parts inside a rewritten price element:
// sale, struck original, badge.
function partOrder(el) {
  const wrap = el.querySelector(".dd-wrap");
  assert.ok(wrap, "expected a .dd-wrap in " + el.outerHTML);
  return [...wrap.children].map((child) => child.className);
}

// Same, for elements the app rewrites in place without a .dd-wrap
// (the Appstle widget's one-time row).
function directPartOrder(el) {
  return [...el.children].map((child) => child.className);
}

const PRODUCT_HTML = `
<div class="shopify-section">
  <div class="product">
    <div class="price">$59.97</div>
    <form action="/cart/add">
      <input type="hidden" name="id" value="${VARIANT}">
      <input type="radio" name="selling_plan" value="" checked>
      <input type="radio" name="selling_plan" value="6152224985">
    </form>
    <div class="appstle_subscription_wrapper">
      <div class="appstle_input_wrapper">
        <input type="radio" name="selling_plan" value="" checked>
        <label>
          One-time purchase
          <div class="appstle-selling-plan-detail-wrapper">
            <div class="appstle_span_wrapper">
              <span class="appstle_lowercase appstle_sellingPlan_price appstle_onetime_amount_compare">$59.97</span>
              <span class="appstle_lowercase appstle_sellingPlan_price appstle_onetime_amount">$59.97</span>
            </div>
          </div>
        </label>
      </div>
      <div class="appstle_input_wrapper">
        <input type="radio" name="selling_plan" value="6152224985">
        <label>
          Subscribe &amp; Save
          <div class="appstle-selling-plan-detail-wrapper">
            <div class="appstle_span_wrapper">
              <span class="appstle_lowercase appstle_sellingPlan_formattedCompareAtPrice appstle_price_block">$59.97</span>
              <span class="appstle_lowercase appstle_sellingPlan_price appstle_price_block">$47.98</span>
            </div>
          </div>
          <strong class="appstle-save-badge">SAVE 20%</strong>
        </label>
      </div>
    </div>
  </div>
</div>`;

test("product page: sale first, then struck original, then badge", () => {
  const dom = runPage(
    PRODUCT_HTML,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const price = dom.window.document.querySelector(".price");
    assert.deepEqual(partOrder(price), [
      "dd-sale",
      "dd-orig",
      "dd-badge dd-badge--pill dd-badge--medium",
    ]);
    assert.equal(price.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(price.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(price.querySelector(".dd-badge").textContent, "Save 15%");
  } finally {
    dom.window.close();
  }
});

test("product page: originalFirst flips the order for that slot only", () => {
  const settings = baseSettings({
    slots: {
      product: { originalFirst: true },
      card: { originalFirst: true, showBadge: false, saleColor: "#0000ff" },
    },
  });
  const html = `
  <div class="shopify-section"><div class="product">
    <div class="price">$59.97</div>
    <form action="/cart/add">
      <input type="hidden" name="id" value="${VARIANT}">
      <input type="radio" name="selling_plan" value="" checked>
    </form>
  </div></div>
  <ul><li><a href="/products/${HANDLE}">x</a><span class="price">$59.97</span></li></ul>`;
  const dom = runPage(
    html,
    `https://biometheory.shop/products/${HANDLE}`,
    settings,
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const productPrice = doc.querySelector(".product .price");
    assert.deepEqual(partOrder(productPrice), [
      "dd-orig",
      "dd-sale",
      "dd-badge dd-badge--pill dd-badge--medium",
    ]);
    // The card slot overrides: original first, no badge, blue sale price.
    const cardPrice = doc.querySelector("li .price");
    assert.deepEqual(partOrder(cardPrice), ["dd-orig", "dd-sale"]);
    assert.equal(cardPrice.querySelector(".dd-badge"), null);
    assert.match(
      cardPrice.querySelector(".dd-sale").getAttribute("style"),
      /#0000ff/,
    );
  } finally {
    dom.window.close();
  }
});

test("widget one-time row: same layout as the Subscribe row, subscribe row untouched", () => {
  const dom = runPage(
    PRODUCT_HTML,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const oneTime = doc.querySelector(".appstle_onetime_amount");
    assert.deepEqual(directPartOrder(oneTime), [
      "dd-sale",
      "dd-orig",
    ]);
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(oneTime.querySelector(".dd-badge"), null);
    // Appstle's own compare span is hidden while ours is shown.
    const compare = doc.querySelector(".appstle_onetime_amount_compare");
    assert.equal(compare.style.display, "none");
    // The Subscribe row is Appstle's — prices, badge and markup untouched.
    const subPrice = doc.querySelectorAll(".appstle_price_block")[1];
    assert.equal(subPrice.textContent, "$47.98");
    assert.equal(subPrice.querySelector(".dd-sale"), null);
    assert.equal(
      doc.querySelector(".appstle-save-badge").textContent,
      "SAVE 20%",
    );
    // The app no longer restyles Appstle's badges: no override stylesheet
    // and no inline badge styles written by the app.
    assert.equal(doc.getElementById("dd-appstle-badge"), null);
    assert.equal(
      doc.querySelector(".appstle-save-badge").style.backgroundColor,
      "",
    );
  } finally {
    dom.window.close();
  }
});

test("widget one-time row is rewritten even in Subscribe mode; main price is left to Appstle", async () => {
  const html = PRODUCT_HTML.replace(
    '<input type="radio" name="selling_plan" value="" checked>',
    '<input type="radio" name="selling_plan" value="">',
  ).replace(
    '<input type="radio" name="selling_plan" value="6152224985">',
    '<input type="radio" name="selling_plan" value="6152224985" checked>',
  );
  const dom = runPage(
    html,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    // The one-time row always shows the one-time price.
    const oneTime = doc.querySelector(".appstle_onetime_amount");
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    // The main .price is Appstle's subscribe price in this mode.
    assert.equal(doc.querySelector(".price").querySelector(".dd-wrap"), null);
    assert.equal(doc.querySelector(".price").textContent, "$59.97");
  } finally {
    dom.window.close();
  }
});

test("widget one-time row survives Appstle re-rendering its text", async () => {
  const dom = runPage(
    PRODUCT_HTML,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const oneTime = doc.querySelector(".appstle_onetime_amount");
    assert.ok(oneTime.querySelector(".dd-sale"));
    // Appstle wipes the span's content on variant change.
    oneTime.textContent = "$59.97";
    await sleep(150);
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-badge"), null);
  } finally {
    dom.window.close();
  }
});

const LANDING_HTML = `
<div class="shopify-section"><section class="bb gutter" id="buy">
  <div class="burst"><span>SAVE<br>20%</span></div>
  <div class="cta-wrap"><span class="pill">Save 24% + Free Shipping</span>
    <a class="btn" href="#buy">Start With Your Gut — $59.97</a></div>
  <div class="cta-wrap"><span class="pill">Save 24% + Free Shipping</span>
    <button class="btn" type="button" data-add="current">Add to Cart — <span class="sticky-price">$47.98</span></button></div>
  <div class="ostrip"><p>Super Greens: $59.97<s></s><small>About $2.40 a glass · Free shipping</small></p></div>
  <div class="purchase-opt" data-purchase-opt="onetime">
    <span class="purchase-price">$59.97</span><span class="save-badge">Save 24%</span>
  </div>
  <div class="purchase-opt" data-purchase-opt="subscribe">
    <span class="purchase-price">$47.98</span><span class="save-badge">Save 24%</span>
  </div>
  <div class="price-line" aria-label="Price: $59.97, was $78.93">
    <span class="now">$59.97</span><s class="was"></s>
  </div>
  <button class="btn light" type="button" data-add="current">Add to Cart — <span class="final-price">$59.97</span></button>
  <input type="radio" name="gf-purchase" value="onetime">
  <input type="radio" name="gf-purchase" value="subscribe" checked>
</section></div>`;

test("landing pages: buy box, price line, CTA buttons and pills go dynamic", async () => {
  const dom = runPage(
    LANDING_HTML,
    "https://biometheory.shop/pages/biome-gut-first",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.GF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    // Buy-box one-time row: sale first, struck original, badge.
    const buyPrice = doc.querySelector(
      '.purchase-opt[data-purchase-opt="onetime"] .purchase-price',
    );
    assert.deepEqual(partOrder(buyPrice), [
      "dd-sale",
      "dd-orig",
      "dd-badge dd-badge--pill dd-badge--medium",
    ]);
    // Subscribe row is never rewritten.
    const subPrice = doc.querySelector(
      '.purchase-opt[data-purchase-opt="subscribe"] .purchase-price',
    );
    assert.equal(subPrice.querySelector(".dd-wrap"), null);
    // Price line: a shared display, so it follows the SELECTED mode —
    // Subscribe is selected, so it shows the subscribe sale + badge.
    const now = doc.querySelector(".price-line .now");
    assert.equal(now.querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(now.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(now.querySelector(".dd-badge").textContent, "Save 20%");
    assert.equal(
      doc.querySelector(".price-line").getAttribute("aria-label"),
      "Price: $47.98, was $59.97",
    );
    // CTA button text: label kept, price token rewritten. Subscribe is
    // selected, so the shared CTA follows the selected mode (v13) and
    // shows the subscribe sale — not the one-time sale.
    const cta = doc.querySelector('.cta-wrap a.btn[href="#buy"]');
    assert.match(cta.textContent, /Start With Your Gut/);
    assert.equal(cta.querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(cta.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(cta.querySelector(".dd-badge").textContent, "Save 20%");
    // ATC price spans: the $47.98 subscribe token gets the subscribe sale.
    const sticky = doc.querySelector(".sticky-price");
    assert.equal(sticky.querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(sticky.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(sticky.querySelector(".dd-badge").textContent, "Save 20%");
    const final = doc.querySelector(".final-price");
    assert.equal(final.querySelector(".dd-sale").textContent, "$47.98");
    // Offer strip: price rewritten, the $2.40 per-glass figure untouched.
    const strip = doc.querySelector(".ostrip");
    assert.equal(strip.querySelector(".dd-sale").textContent, "$47.98");
    assert.match(strip.textContent, /\$2\.40 a glass/);
    // Burst + CTA pills follow the SELECTED mode (subscribe = 20%).
    assert.match(doc.querySelector(".burst").textContent, /20%/);
    assert.match(
      doc.querySelector(".cta-wrap .pill").textContent,
      /Save 20% \+ Free Shipping/,
    );
    // Buy-box row pills show their own mode's %.
    assert.equal(
      doc.querySelector(
        '.purchase-opt[data-purchase-opt="onetime"] .save-badge',
      ).textContent,
      "Save 15%",
    );
    assert.equal(
      doc.querySelector(
        '.purchase-opt[data-purchase-opt="subscribe"] .save-badge',
      ).textContent,
      "Save 20%",
    );

    // Switch to One-time: burst + pills follow to 15%, and the shared
    // price line follows to the one-time sale.
    doc.querySelector('input[name="gf-purchase"][value="onetime"]').checked = true;
    doc.querySelector('input[name="gf-purchase"][value="subscribe"]').checked = false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(150);
    assert.match(doc.querySelector(".burst").textContent, /15%/);
    assert.match(
      doc.querySelector(".cta-wrap .pill").textContent,
      /Save 15% \+ Free Shipping/,
    );
    const nowAfter = doc.querySelector(".price-line .now");
    assert.equal(nowAfter.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(nowAfter.querySelector(".dd-badge").textContent, "Save 15%");
    assert.equal(
      doc.querySelector(".price-line").getAttribute("aria-label"),
      "Price: $50.97, was $59.97",
    );
    // Shared CTAs follow the toggle too (v13): back to the one-time sale.
    const ctaAfter = doc.querySelector('.cta-wrap a.btn[href="#buy"]');
    assert.equal(ctaAfter.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(ctaAfter.querySelector(".dd-badge").textContent, "Save 15%");
    assert.equal(
      doc.querySelector(".final-price").querySelector(".dd-sale").textContent,
      "$50.97",
    );
    assert.equal(
      doc.querySelector(".ostrip").querySelector(".dd-sale").textContent,
      "$50.97",
    );
  } finally {
    dom.window.close();
  }
});

test("landing pages: hero link follows the purchase-mode toggle both ways (v13)", async () => {
  // Taste 2's hero CTA: <a class="btn" href="#buy" id="heroCta"> inside
  // .cta-wrap. It stayed at the one-time price in Subscribe mode because
  // the CTA rewrite was token-based, not mode-aware.
  const html = `
  <div class="shopify-section"><section class="bb gutter" id="buy">
    <div class="cta-wrap">
      <a class="btn" href="#buy" id="heroCta">Pick Your Flavor — $59.97</a>
    </div>
    <div class="price-line" aria-label="Price: $59.97, was $78.93">
      <span class="now">$59.97</span><s class="was"></s>
    </div>
    <input type="radio" name="taste2-purchase" value="onetime">
    <input type="radio" name="taste2-purchase" value="subscribe" checked>
  </section></div>`;
  const dom = runPage(
    html,
    "https://biometheory.shop/pages/biome-taste-2",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.TASTE2_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    const hero = doc.querySelector("#heroCta");
    // Subscribe selected on load: hero shows the subscribe sale.
    assert.equal(hero.querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(hero.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(hero.querySelector(".dd-badge").textContent, "Save 20%");
    assert.match(hero.textContent, /Pick Your Flavor/);

    // Toggle to One-time: hero re-derives to the one-time sale.
    doc.querySelector('input[name="taste2-purchase"][value="onetime"]').checked = true;
    doc.querySelector('input[name="taste2-purchase"][value="subscribe"]').checked = false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(150);
    assert.equal(hero.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(hero.querySelector(".dd-badge").textContent, "Save 15%");

    // Toggle back to Subscribe: hero returns to the subscribe sale.
    doc.querySelector('input[name="taste2-purchase"][value="subscribe"]').checked = true;
    doc.querySelector('input[name="taste2-purchase"][value="onetime"]').checked = false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(150);
    assert.equal(hero.querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(hero.querySelector(".dd-badge").textContent, "Save 20%");
  } finally {
    dom.window.close();
  }
});

test("landing pages: an old saved landing list still gets the price line", () => {
  // Saved settings from before the price line existed hold only the old
  // default selector. The script appends .price-line .now itself, so the
  // price line goes dynamic without waiting for a settings save.
  const settings = baseSettings({
    landingSelectors: [
      '.purchase-opt[data-purchase-opt="onetime"] .purchase-price',
    ],
  });
  const html = `
  <div class="shopify-section"><section class="bb gutter" id="buy">
    <div class="price-line" aria-label="Price: $59.97, was $78.93">
      <span class="now">$59.97</span><s class="was"></s>
    </div>
    <input type="radio" name="gf-purchase" value="onetime" checked>
  </section></div>`;
  const dom = runPage(
    html,
    "https://biometheory.shop/pages/biome-gut-first",
    settings,
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.GF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    const now = doc.querySelector(".price-line .now");
    assert.equal(now.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(now.querySelector(".dd-badge").textContent, "Save 15%");
    assert.equal(
      doc.querySelector(".price-line").getAttribute("aria-label"),
      "Price: $50.97, was $59.97",
    );
  } finally {
    dom.window.close();
  }
});

test("global catch-all rewrites only what no specific slot claimed", () => {
  const settings = baseSettings({
    globalSelectors: [".weird-price"],
    slots: { global: { showBadge: true } },
  });
  const html = `
  <ul>
    <li><a href="/products/${HANDLE}">x</a><span class="price">$59.97</span></li>
    <li><a href="/products/${HANDLE}">y</a><span class="weird-price">$59.97</span></li>
  </ul>`;
  const dom = runPage(
    html,
    "https://biometheory.shop/collections/all",
    settings,
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const card = doc.querySelector("li .price");
    assert.equal(card.querySelectorAll(".dd-wrap").length, 1);
    const weird = doc.querySelector(".weird-price");
    assert.equal(weird.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(weird.querySelector(".dd-badge").textContent, "Save 15%");
  } finally {
    dom.window.close();
  }
});

test("global catch-all does not double-rewrite a price a specific slot handled", () => {
  const settings = baseSettings({ globalSelectors: [".price"] });
  const html = `
  <ul><li><a href="/products/${HANDLE}">x</a><span class="price">$59.97</span></li></ul>`;
  const dom = runPage(
    html,
    "https://biometheory.shop/collections/all",
    settings,
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector(".price").querySelectorAll(".dd-wrap").length, 1);
  } finally {
    dom.window.close();
  }
});

test("custom CSS is injected and the app stays silent when disabled", () => {
  const dom = runPage(
    PRODUCT_HTML,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings({ customCss: ".dd-sale { font-weight: 700; }" }),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const css = doc.getElementById("dd-custom-css");
    assert.ok(css);
    assert.equal(css.textContent, ".dd-sale { font-weight: 700; }");
  } finally {
    dom.window.close();
  }

  const off = runPage(
    PRODUCT_HTML,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings({ enabled: false }),
    basePrices(),
  );
  try {
    assert.equal(
      off.window.document.querySelector(".price").querySelector(".dd-wrap"),
      null,
    );
  } finally {
    off.window.close();
  }
});

// The live failure: the Appstle widget's one-time row was not rewritten
// even though the selector, settings and prices were all correct. The
// structural fallback finds the one-time row by its radio (value="")
// and rewrites the price span inside it, even when that span does not
// carry the configured .appstle_onetime_amount class (some widget
// variants render it without that class). The Subscribe row is never
// touched: its radio carries a plan id and its price spans carry
// .appstle_price_block.
const PRODUCT_HTML_NO_ONETIME_CLASS = PRODUCT_HTML.replace(
  'appstle_sellingPlan_price appstle_onetime_amount">$59.97</span>',
  'appstle_sellingPlan_price">$59.97</span>',
);

test("widget one-time row is rewritten even when the price span lacks .appstle_onetime_amount", () => {
  const dom = runPage(
    PRODUCT_HTML_NO_ONETIME_CLASS,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    // The selector finds nothing now, so the structural fallback must
    // have done the rewrite.
    assert.equal(doc.querySelector(".appstle_onetime_amount"), null);
    const oneTime = doc.querySelector(
      ".appstle_input_wrapper .appstle_sellingPlan_price:not(.appstle_onetime_amount_compare)",
    );
    assert.ok(oneTime, "expected a one-time price span in the row");
    assert.deepEqual(directPartOrder(oneTime), [
      "dd-sale",
      "dd-orig",
    ]);
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(oneTime.querySelector(".dd-badge"), null);
    // Appstle's own compare span is hidden while ours is shown.
    const compare = doc.querySelector(".appstle_onetime_amount_compare");
    assert.equal(compare.style.display, "none");
    // The Subscribe row is Appstle's — prices, badge and markup untouched.
    const subPrice = doc.querySelectorAll(".appstle_price_block")[1];
    assert.equal(subPrice.textContent, "$47.98");
    assert.equal(subPrice.querySelector(".dd-sale"), null);
    assert.equal(
      doc.querySelector(".appstle-save-badge").textContent,
      "SAVE 20%",
    );
  } finally {
    dom.window.close();
  }
});

test("widget one-time row is rewritten when Appstle injects it late without the class", async () => {
  const html = `
  <div class="shopify-section">
    <div class="product">
      <div class="price">$59.97</div>
      <form action="/cart/add">
        <input type="hidden" name="id" value="${VARIANT}">
        <input type="radio" name="selling_plan" value="" checked>
        <input type="radio" name="selling_plan" value="6152224985">
      </form>
      <div id="appstle-slot"></div>
    </div>
  </div>`;
  const dom = runPage(
    html,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    await sleep(500);
    // Appstle renders the widget late, and its one-time price span has
    // no .appstle_onetime_amount class.
    doc.getElementById("appstle-slot").innerHTML = `
    <div class="appstle_subscription_wrapper">
      <div class="appstle_input_wrapper">
        <input type="radio" name="selling_plan" value="" checked>
        <label>One-time purchase
          <div class="appstle-selling-plan-detail-wrapper"><div class="appstle_span_wrapper">
            <span class="appstle_lowercase appstle_sellingPlan_price appstle_onetime_amount_compare">$59.97</span>
            <span class="appstle_lowercase appstle_sellingPlan_price">$59.97</span>
          </div></div>
        </label>
      </div>
      <div class="appstle_input_wrapper">
        <input type="radio" name="selling_plan" value="6152224985">
        <label>Subscribe &amp; Save
          <div class="appstle-selling-plan-detail-wrapper"><div class="appstle_span_wrapper">
            <span class="appstle_lowercase appstle_sellingPlan_formattedCompareAtPrice appstle_price_block">$59.97</span>
            <span class="appstle_lowercase appstle_sellingPlan_price appstle_price_block">$47.98</span>
          </div></div>
          <strong class="appstle-save-badge">SAVE 20%</strong>
        </label>
      </div>
    </div>`;
    await sleep(400);
    const oneTime = doc.querySelector(
      ".appstle_input_wrapper .appstle_sellingPlan_price:not(.appstle_onetime_amount_compare):not(.appstle_price_block)",
    );
    assert.ok(oneTime, "expected a one-time price span after late injection");
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-badge"), null);
    const subPrice = doc.querySelectorAll(".appstle_price_block")[1];
    assert.equal(subPrice.textContent, "$47.98");
    assert.equal(subPrice.querySelector(".dd-sale"), null);
  } finally {
    dom.window.close();
  }
});

test("widget one-time row survives Appstle replacing the whole span, even without the class", async () => {
  const dom = runPage(
    PRODUCT_HTML_NO_ONETIME_CLASS,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const pick = () =>
      doc.querySelector(
        ".appstle_input_wrapper .appstle_sellingPlan_price:not(.appstle_onetime_amount_compare)",
      );
    assert.ok(pick().querySelector(".dd-sale"), "expected the row rewritten on load");
    // Appstle re-renders the widget: the whole span is replaced by a
    // fresh one with no app markup and no data key.
    const fresh = doc.createElement("span");
    fresh.className = "appstle_lowercase appstle_sellingPlan_price";
    fresh.textContent = "$59.97";
    pick().parentNode.replaceChild(fresh, pick());
    await sleep(400);
    assert.equal(pick().querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(pick().querySelector(".dd-badge"), null);
  } finally {
    dom.window.close();
  }
});

// WIDGET_TYPE_2 — the live store's Appstle widget type. It is built
// programmatically by Appstle's JS, NOT from the Mustache template, so
// its one-time row has no .appstle_onetime_amount class and no
// .appstle_sellingPlan_price span: the radio is a direct child of
// .appstle_one_time_details_wrapper (the label is a SIBLING, not a
// parent) and the visible price is
// span.appstle_subscription_amount.transcy-money, with sr-only amount +
// compare spans beside it. The v9 structural fallback looked only for
// .appstle_input_wrapper / label and span.appstle_sellingPlan_price,
// so on this widget type closest() returned null and the row price was
// never rewritten.
const PRODUCT_HTML_WIDGET_TYPE_2 = `
<div class="shopify-section">
  <div class="product">
    <div class="price">$59.97</div>
    <form action="/cart/add">
      <input type="hidden" name="id" value="${VARIANT}">
      <input type="radio" name="selling_plan" value="" checked>
      <input type="radio" name="selling_plan" value="6152224985">
    </form>
    <div class="appstle_subscription_wrapper">
      <div class="appstle_subscription_wrapper_option appstle_subscription_wrapper_option__one_time">
        <div class="appstle_one_time_details_wrapper">
          <input type="radio" name="selling_plan" value="" id="appstle_selling_plan_label_1" checked>
          <label class="appstle_radio_label">
            <span class="appstle_circle"><span class="appstle_dot"></span></span>
            <span class="appstle_one_time_text">One Time Purchase</span>
          </label>
          <div class="appstle_one_time_price_wrapper has-compare-price">
            <span class="appstle_subscription_amount transcy-money" aria-hidden="true">$59.97</span>
            <span class="appstle_subscription_amount-appstle-sr-only transcy-money sr-only">Regular price $59.97</span>
            <span class="appstle_subscription_amount_compare_at_price transcy-money" aria-hidden="true"></span>
            <span class="appstle_subscription_amount_compare_at_price-appstle-sr-only transcy-money sr-only"></span>
            <div class="appstle_one_time_unit_price"></div>
          </div>
        </div>
        <span class="appstle_bundle_discount_amount one_time_discount"></span>
        <div class="appstle_one_time_description_text">Delivered once</div>
      </div>
      <div class="appstle_subscription_wrapper_option appstle_subscription_wrapper_option__subscription">
        <div class="appstle_subscription_details_wrapper">
          <input type="radio" name="selling_plan" value="6152224985" id="appstle_selling_plan_label_2">
          <label class="appstle_radio_label">
            <span class="appstle_circle"><span class="appstle_dot"></span></span>
            <span class="appstle_subscription_text">Subscribe &amp; Save</span>
          </label>
          <div class="appstle_subscription_amount_wrapper">
            <span class="appstle_subscription_amount transcy-money" aria-hidden="true">$47.98</span>
            <span class="appstle_subscription_amount-appstle-sr-only transcy-money sr-only">Sale price $47.98</span>
            <span class="appstle_subscription_compare_amount transcy-money" aria-hidden="true">$59.97</span>
            <span class="appstle_subscription_compare_amount-appstle-sr-only transcy-money sr-only">Regular price $59.97</span>
          </div>
        </div>
        <span class="appstle_bundle_discount_amount subscription_discount">SAVE 20%</span>
      </div>
    </div>
  </div>
</div>`;

test("widget one-time row (WIDGET_TYPE_2) is rewritten like the Subscribe row", () => {
  const dom = runPage(
    PRODUCT_HTML_WIDGET_TYPE_2,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    // The one-time visible price is rewritten to sale + struck original
    // + badge, in the same order as the Subscribe row.
    const oneTime = doc.querySelector(
      ".appstle_one_time_price_wrapper .appstle_subscription_amount",
    );
    assert.ok(oneTime, "expected a one-time price span in the row");
    assert.deepEqual(directPartOrder(oneTime), [
      "dd-sale",
      "dd-orig",
    ]);
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(oneTime.querySelector(".dd-badge"), null);
    // The sr-only text follows the visible rewrite, so a page-text read
    // shows the sale price, not the stale "Regular price $59.97".
    assert.equal(
      doc.querySelector(
        ".appstle_one_time_price_wrapper .appstle_subscription_amount-appstle-sr-only",
      ).textContent,
      "Sale price $50.97",
    );
    assert.equal(
      doc.querySelector(
        ".appstle_one_time_price_wrapper .appstle_subscription_amount_compare_at_price-appstle-sr-only",
      ).textContent,
      "Regular price $59.97",
    );
    // The WIDGET_TYPE_2 compare span stays hidden while ours is shown.
    assert.equal(
      doc.querySelector(
        ".appstle_one_time_price_wrapper .appstle_subscription_amount_compare_at_price",
      ).style.display,
      "none",
    );
    // The Subscribe row is Appstle's — price, badge and markup untouched.
    const subPrice = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_amount",
    );
    assert.equal(subPrice.textContent, "$47.98");
    assert.equal(subPrice.querySelector(".dd-sale"), null);
    assert.equal(
      doc.querySelector(".subscription_discount").textContent,
      "SAVE 20%",
    );
  } finally {
    dom.window.close();
  }
});

test("widget one-time row (WIDGET_TYPE_2) survives Appstle re-rendering its text", async () => {
  const dom = runPage(
    PRODUCT_HTML_WIDGET_TYPE_2,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const pick = () =>
      doc.querySelector(
        ".appstle_one_time_price_wrapper .appstle_subscription_amount",
      );
    assert.ok(pick().querySelector(".dd-sale"), "expected the row rewritten on load");
    // Appstle re-renders the price span's text (its .html() call wipes
    // our markup but leaves the data key behind).
    pick().innerHTML = "$59.97";
    await sleep(400);
    assert.equal(pick().querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(pick().querySelector(".dd-badge"), null);
    assert.equal(
      doc.querySelector(
        ".appstle_one_time_price_wrapper .appstle_subscription_amount-appstle-sr-only",
      ).textContent,
      "Sale price $50.97",
    );
    // Subscribe row still untouched after the re-render.
    const subPrice = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_amount",
    );
    assert.equal(subPrice.textContent, "$47.98");
    assert.equal(subPrice.querySelector(".dd-sale"), null);
  } finally {
    dom.window.close();
  }
});

// WIDGET_TYPE_2 with Appstle's bundle-discount pill filled in: the
// one-time row already carries Appstle's own "SAVE 15%" pill on the
// left (.appstle_bundle_discount_amount.one_time_discount), so the
// app's price rewrite must show sale + struck original with NO app
// badge on the right — exactly one badge per row, matching the
// Subscribe row (one left "SAVE 20%" pill, right side just the prices).
const PRODUCT_HTML_WIDGET_TYPE_2_BUNDLE_BADGE =
  PRODUCT_HTML_WIDGET_TYPE_2.replace(
    '<span class="appstle_bundle_discount_amount one_time_discount"></span>',
    '<span class="appstle_bundle_discount_amount one_time_discount">SAVE 15%</span>',
  );

test("widget one-time row (WIDGET_TYPE_2) shows no app badge when Appstle's bundle pill is already there", () => {
  const dom = runPage(
    PRODUCT_HTML_WIDGET_TYPE_2_BUNDLE_BADGE,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    // The one-time price is rewritten to sale + struck original, with
    // NO app badge — the row's one badge is Appstle's left pill.
    const oneTime = doc.querySelector(
      ".appstle_one_time_price_wrapper .appstle_subscription_amount",
    );
    assert.ok(oneTime, "expected a one-time price span in the row");
    assert.deepEqual(directPartOrder(oneTime), ["dd-sale", "dd-orig"]);
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(oneTime.querySelector(".dd-badge"), null);
    // Appstle's left pill is untouched and still reads SAVE 15%.
    assert.equal(
      doc.querySelector(
        ".appstle_bundle_discount_amount.one_time_discount",
      ).textContent,
      "SAVE 15%",
    );
    // The sr-only text still follows the visible rewrite.
    assert.equal(
      doc.querySelector(
        ".appstle_one_time_price_wrapper .appstle_subscription_amount-appstle-sr-only",
      ).textContent,
      "Sale price $50.97",
    );
    // The Subscribe row is Appstle's — price, badge and markup untouched.
    const subPrice = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_amount",
    );
    assert.equal(subPrice.textContent, "$47.98");
    assert.equal(subPrice.querySelector(".dd-sale"), null);
    assert.equal(
      doc.querySelector(".subscription_discount").textContent,
      "SAVE 20%",
    );
  } finally {
    dom.window.close();
  }
});

test("widget one-time row (WIDGET_TYPE_2) never adds an app badge even when Appstle's bundle pill is empty on load", async () => {
  const dom = runPage(
    PRODUCT_HTML_WIDGET_TYPE_2,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const pick = () =>
      doc.querySelector(
        ".appstle_one_time_price_wrapper .appstle_subscription_amount",
      );
    // Appstle's pill is still an empty placeholder on load, but the app
    // never adds its own badge in this row (the pill is the row's badge,
    // and Appstle fills it shortly after) — so the row shows sale +
    // struck original with no app badge from the first render.
    assert.ok(pick().querySelector(".dd-sale"), "expected the row rewritten on load");
    assert.equal(pick().querySelector(".dd-badge"), null);
    // Appstle fills its bundle pill after the app runs.
    doc.querySelector(
      ".appstle_bundle_discount_amount.one_time_discount",
    ).textContent = "SAVE 15%";
    await sleep(400);
    // The row still shows sale + struck with no app badge, and Appstle's
    // left pill is now the row's one badge.
    assert.equal(pick().querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(pick().querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(pick().querySelector(".dd-badge"), null);
    assert.equal(
      doc.querySelector(
        ".appstle_bundle_discount_amount.one_time_discount",
      ).textContent,
      "SAVE 15%",
    );
    // Subscribe row still untouched after the re-render.
    const subPrice = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_amount",
    );
    assert.equal(subPrice.textContent, "$47.98");
    assert.equal(subPrice.querySelector(".dd-sale"), null);
  } finally {
    dom.window.close();
  }
});

// Enzymes / Probiotics 2 / Taste 2 render their own struck compare-at
// (<s class="was">$59.97</s>) inside the price line, so the app's
// .price-line .now rewrite added a second struck $59.97. The app now
// hides the theme's <s class="was"> while its rewrite is active, so the
// line shows exactly one struck price.
const LANDING_HTML_DUP_WAS = LANDING_HTML.replace(
  '<s class="was"></s>',
  '<s class="was">$59.97</s>',
);

test("landing price line shows exactly one struck price when the theme already has <s class=was>", async () => {
  const dom = runPage(
    LANDING_HTML_DUP_WAS,
    "https://biometheory.shop/pages/biome-enzymes",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.GF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    const line = doc.querySelector(".price-line");
    // Subscribe is selected: the line shows the subscribe sale.
    const now = doc.querySelector(".price-line .now");
    assert.equal(now.querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(now.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(now.querySelector(".dd-badge").textContent, "Save 20%");
    // The theme's own struck compare-at is hidden, so there is exactly
    // one visible struck price in the line.
    const was = line.querySelector("s.was");
    assert.equal(was.textContent, "$59.97");
    assert.equal(was.style.display, "none");
    const visibleStruck = [...line.querySelectorAll("s")].filter(
      (s) => s.style.display !== "none",
    );
    assert.equal(visibleStruck.length, 1);

    // Switch to One-time: the line follows to the one-time sale and the
    // theme's struck price stays hidden.
    doc.querySelector('input[name="gf-purchase"][value="onetime"]').checked = true;
    doc.querySelector('input[name="gf-purchase"][value="subscribe"]').checked = false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(150);
    assert.equal(now.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(now.querySelector(".dd-badge").textContent, "Save 15%");
    assert.equal(was.style.display, "none");
    assert.equal(
      [...line.querySelectorAll("s")].filter((s) => s.style.display !== "none")
        .length,
      1,
    );
  } finally {
    dom.window.close();
  }
});

// v13 — black sale / grayish compare / 6px gap / badge colours.
// DEFECT: the one-time row rendered BOTH prices red and cramped
// ("$50.97$59.97"). Root cause: the struck .dd-orig had no colour of its
// own, so it inherited the red of Appstle's price span it sits inside,
// and the widget row + CTA text get no .dd-wrap, so the liquid .dd-wrap
// spacing never applied there. Fix: explicit inline colours on both
// prices + a 6px margin after each price, everywhere the app renders.
test("v13 colours: sale black, compare grayish, 6px gap, badge white on dark green", () => {
  const dom = runPage(
    PRODUCT_HTML,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const price = doc.querySelector(".price");
    const sale = price.querySelector(".dd-sale");
    const orig = price.querySelector(".dd-orig");
    const badge = price.querySelector(".dd-badge");
    assert.equal(sale.textContent, "$50.97");
    assert.match(sale.getAttribute("style"), /color:#000000/);
    assert.match(sale.getAttribute("style"), /margin-right:6px/);
    assert.equal(orig.textContent, "$59.97");
    assert.match(orig.getAttribute("style"), /color:#6b7280/);
    assert.match(orig.getAttribute("style"), /margin-right:6px/);
    // The badge is the app's own, from the settings: dark green bg,
    // white text — the single source of truth for badge colours.
    assert.match(badge.getAttribute("style"), /background:#42572a/i);
    assert.match(badge.getAttribute("style"), /color:#ffffff/);
    // No red anywhere in the rendered price.
    assert.doesNotMatch(price.innerHTML, /#d82c0d/);
  } finally {
    dom.window.close();
  }
});

test("v13 widget one-time row: compare grayish not red, gap present, exactly one badge", () => {
  const dom = runPage(
    PRODUCT_HTML_WIDGET_TYPE_2_BUNDLE_BADGE,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const oneTime = doc.querySelector(
      ".appstle_one_time_price_wrapper .appstle_subscription_amount",
    );
    assert.ok(oneTime, "expected a one-time price span in the row");
    assert.deepEqual(directPartOrder(oneTime), ["dd-sale", "dd-orig"]);
    const sale = oneTime.querySelector(".dd-sale");
    const orig = oneTime.querySelector(".dd-orig");
    assert.equal(sale.textContent, "$50.97");
    assert.match(sale.getAttribute("style"), /color:#000000/);
    assert.match(sale.getAttribute("style"), /margin-right:6px/);
    assert.equal(orig.textContent, "$59.97");
    assert.match(orig.getAttribute("style"), /color:#6b7280/);
    assert.match(orig.getAttribute("style"), /margin-right:6px/);
    assert.doesNotMatch(oneTime.innerHTML, /#d82c0d/);
    // No app badge in this row — the row's ONE badge is Appstle's own
    // left pill ("SAVE 15%").
    assert.equal(oneTime.querySelector(".dd-badge"), null);
    const option = doc.querySelector(
      ".appstle_subscription_wrapper_option__one_time",
    );
    assert.equal(
      option.querySelector(
        ".appstle_bundle_discount_amount.one_time_discount",
      ).textContent,
      "SAVE 15%",
    );
    assert.equal(option.querySelectorAll(".dd-badge").length, 0);
  } finally {
    dom.window.close();
  }
});

test("v13 subscribe row: colours come from CSS injection, values untouched", () => {
  const dom = runPage(
    PRODUCT_HTML_WIDGET_TYPE_2,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    // The app injects one <style> for the Subscribe row's colours,
    // scoped to the subscribe wrapper only and driven by the settings.
    const style = doc.getElementById("dd-subscribe-price-colors");
    assert.ok(style, "expected the subscribe-price-colours style element");
    assert.match(
      style.textContent,
      /\.appstle_subscription_amount_wrapper \.appstle_subscription_amount\{color:#000000 !important\}/,
    );
    // v14: the subscribe compare span is
    // .appstle_subscription_compare_amount — the v13 rule named
    // .appstle_subscription_amount_compare_at_price, which is the
    // ONE-TIME wrapper's compare class and does not exist in the
    // subscribe row (that is why the compare never went grayish).
    assert.match(
      style.textContent,
      /\.appstle_subscription_amount_wrapper \.appstle_subscription_compare_amount\{color:#6b7280 !important\}/,
    );
    // The v13 injection named .appstle_subscription_price_wrapper — a
    // class that does not exist anywhere in Appstle's JS — so its rules
    // matched nothing live. It must not come back.
    assert.doesNotMatch(
      style.textContent,
      /appstle_subscription_price_wrapper/,
    );
    // The Subscribe row's VALUES are Appstle's and unchanged — no app
    // markup inside them, and the sr-only text is untouched too.
    const subPrice = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_amount",
    );
    assert.equal(subPrice.textContent, "$47.98");
    assert.equal(subPrice.querySelector(".dd-sale"), null);
    assert.equal(subPrice.querySelector(".dd-orig"), null);
    const subCompare = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_compare_amount",
    );
    assert.equal(subCompare.textContent, "$59.97");
    assert.equal(
      doc.querySelector(
        ".appstle_subscription_amount_wrapper .appstle_subscription_amount-appstle-sr-only",
      ).textContent,
      "Sale price $47.98",
    );
    assert.equal(
      doc.querySelector(".subscription_discount").textContent,
      "SAVE 20%",
    );
    // The one-time row is NOT recoloured by this injection — it is
    // rewritten by the app itself, so it must not match these rules.
    assert.doesNotMatch(
      style.textContent,
      /appstle_one_time_price_wrapper/,
    );
  } finally {
    dom.window.close();
  }
});

test("v13: no hardcoded price, % or sale colour in the storefront script code", () => {
  // Comments describe the live prices ($50.97 etc.) — strip them, then
  // the executable code must contain no price, % or old red colour at
  // all, so a Nov 26 / Dec 2 change can never leave a stale value in
  // the script. Every price/% on the page comes from the synced
  // metafield (selected discount / selling plan) or the settings.
  const code = scriptSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
  assert.doesNotMatch(code, /\$\s?\d/);
  assert.doesNotMatch(code, /\b(50\.97|59\.97|47\.98|78\.93|12\.99|67\.97)\b/);
  assert.doesNotMatch(code, /#d82c0d/);
  assert.doesNotMatch(code, /Save 15%|Save 20%|SAVE 15%|SAVE 20%/);
  assert.doesNotMatch(code, /"15"|"20"/);
});

test("v13: an invalid selector in settings degrades that place only, it does not abort the run", async () => {
  // A typo'd selector used to throw inside querySelectorAll and abort
  // run() — the widget rewrite and everything after it never ran.
  const settings = baseSettings({
    landingSelectors: ["[broken"],
  });
  const dom = runPage(
    LANDING_HTML,
    "https://biometheory.shop/pages/biome-gut-first",
    settings,
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.GF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    await sleep(150);
    // The buy-box price was not rewritten (its selector is invalid) —
    // but the run continued: the shared CTA still follows the mode.
    const buyPrice = doc.querySelector(
      '.purchase-opt[data-purchase-opt="onetime"] .purchase-price',
    );
    assert.equal(buyPrice.querySelector(".dd-wrap"), null);
    const cta = doc.querySelector('.cta-wrap a.btn[href="#buy"]');
    assert.equal(cta.querySelector(".dd-sale").textContent, "$47.98");
  } finally {
    dom.window.close();
  }
});

// v14 FIX 1 — landing Subscribe row: the theme colours .purchase-price
// red (#d82c0d) on 7 pages, and the v13 colour injection only targeted
// Appstle classes that do not exist on landing pages (native replica buy
// boxes), so the Subscribe row's [data-sub-price] inherited red while
// the app-rewritten one-time row was black. Enzymes alone looked black
// because its buy section sets .purchase-price to dark green (#42572A).
// The injection now also covers the landing Subscribe row, scoped to the
// subscribe option only. jsdom cannot compute colours, so these tests
// assert the injected rule text (specificity + !important beats both the
// red and the dark-green theme rule) and that the row's values and the
// one-time row are untouched.
const LANDING_SUBSCRIBE_ROW_HTML = (themeColor) => `
<style>.purchase-price{display:flex;gap:4px 10px;font-weight:800;font-size:1.25rem;color:${themeColor}}</style>
<div class="shopify-section"><section class="bb gutter" id="buy">
  <div class="purchase-opt" data-purchase-opt="onetime" data-selected="false">
    <input type="radio" name="gf-purchase" value="onetime">
    <span class="purchase-main">
      <span class="purchase-title">One-time purchase</span>
      <span class="purchase-price"><span data-ot-price>$50.97</span><s data-ot-was>$59.97</s><span class="save-badge">Save 15%</span></span>
    </span>
  </div>
  <div class="purchase-opt" data-purchase-opt="subscribe" data-selected="true">
    <input type="radio" name="gf-purchase" value="subscribe" checked>
    <span class="purchase-main">
      <span class="purchase-title">Subscribe &amp; Save <span class="purchase-freq">Every Month</span></span>
      <span class="purchase-price"><span data-sub-price>$47.98</span><s data-sub-was>$59.97</s><span class="save-badge">Save 20%</span></span>
      <span class="purchase-note">Renews at <span data-renew-price>$50.97</span> every month</span>
    </span>
  </div>
  <div class="price-line" aria-label="Price: $59.97, was $59.97">
    <span class="now">$59.97</span><s class="was">$59.97</s>
  </div>
</section></div>`;

test("v14 landing Subscribe row is recoloured black/grayish on a red-theme page", () => {
  const dom = runPage(
    LANDING_SUBSCRIBE_ROW_HTML("#d82c0d"),
    "https://biometheory.shop/pages/biome-gut-first",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.GF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    const style = doc.getElementById("dd-subscribe-price-colors");
    assert.ok(style, "expected the subscribe-price-colours style element");
    // Two-class selectors + !important beat the theme's single-class
    // .purchase-price{color:#d82c0d} rule.
    assert.match(
      style.textContent,
      /\.purchase-opt\[data-purchase-opt="subscribe"\] \.purchase-price \[data-sub-price\]\{color:#000000 !important\}/,
    );
    assert.match(
      style.textContent,
      /\.purchase-opt\[data-purchase-opt="subscribe"\] \.purchase-price \[data-sub-was\]\{color:#6b7280 !important\}/,
    );
    // Values untouched, no app markup in the Subscribe row.
    const subPrice = doc.querySelector("[data-sub-price]");
    assert.equal(subPrice.textContent, "$47.98");
    assert.equal(subPrice.querySelector(".dd-sale"), null);
    assert.equal(doc.querySelector("[data-sub-was]").textContent, "$59.97");
    // The one-time row is NOT covered by these rules — it is rewritten
    // by the app itself (inline black sale + grayish compare + badge).
    assert.doesNotMatch(
      style.textContent,
      /data-purchase-opt="onetime"/,
    );
    const oneTime = doc.querySelector(
      '.purchase-opt[data-purchase-opt="onetime"] .purchase-price',
    );
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-badge").textContent, "Save 15%");
  } finally {
    dom.window.close();
  }
});

test("v14 landing Subscribe row is recoloured on Enzymes too (dark-green theme)", () => {
  // Enzymes sets .purchase-price{color:#42572A}, which reads as black —
  // the v14 rule recolours it to true black like every other page.
  const dom = runPage(
    LANDING_SUBSCRIBE_ROW_HTML("#42572A"),
    "https://biometheory.shop/pages/biome-enzymes",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.GF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    const style = doc.getElementById("dd-subscribe-price-colors");
    assert.ok(style, "expected the subscribe-price-colours style element");
    assert.match(
      style.textContent,
      /\.purchase-opt\[data-purchase-opt="subscribe"\] \.purchase-price \[data-sub-price\]\{color:#000000 !important\}/,
    );
    assert.equal(doc.querySelector("[data-sub-price]").textContent, "$47.98");
  } finally {
    dom.window.close();
  }
});

// v14 FIX 2 — final/bottom CTA: the theme rewrites .final-price and
// .sticky-price with plain text on every toggle and flavour change
// (syncCtaPrices in the *-base sections), so the app's saved "original"
// for those spans can itself be the subscribe price. A token equal to
// the subscribe sale then mapped token-wise back to the subscribe sale
// even in One-time mode, leaving the final CTA stuck on the subscribe
// price. The rewrite is now mode-direct: any recognised price token
// shows the selected mode's sale. This test replays the live sequence
// with the theme's plain-text writes included.
const FINAL_CTA_HTML = `
<div class="shopify-section"><section class="bb gutter" id="buy">
  <div class="cta-wrap"><span class="pill">Save 20% + Free Shipping</span>
    <a class="btn" href="#buy">Start With Your Gut — $59.97</a></div>
  <div class="purchase-opt" data-purchase-opt="onetime">
    <span class="purchase-price">$59.97</span><span class="save-badge">Save 15%</span>
  </div>
  <div class="purchase-opt" data-purchase-opt="subscribe">
    <span class="purchase-price">$47.98</span><span class="save-badge">Save 20%</span>
  </div>
  <button class="btn" type="button" data-add="current">Add to Cart — <span class="sticky-price">$59.97</span></button>
  <input type="radio" name="gf-purchase" value="onetime">
  <input type="radio" name="gf-purchase" value="subscribe" checked>
</section></div>
<section class="final gutter"><div class="page final-card">
  <div>
    <h2>Give Your Gut a Head Start Every Day.</h2>
    <button class="btn light" type="button" data-add="current">Start With Your Gut — <span class="final-price">$59.97</span></button>
  </div>
</div></section>`;

test("v14 final CTA follows the toggle both ways while the theme rewrites its price", async () => {
  const dom = runPage(
    FINAL_CTA_HTML,
    "https://biometheory.shop/pages/biome-gut-first",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.GF_PRODUCTS = { mango: { variant: VARIANT } };
      // The theme's init ran BEFORE the app loaded and already wrote
      // the subscribe price into the CTA spans as plain text.
      window.document.querySelector(".final-price").textContent = "$47.98";
      window.document.querySelector(".sticky-price").textContent = "$47.98";
    },
  );
  try {
    const doc = dom.window.document;
    const finalPrice = () => doc.querySelector(".final-price");
    const stickyPrice = () => doc.querySelector(".sticky-price");
    // Subscribe selected on load: both CTAs show the subscribe sale,
    // even though the theme had already overwritten their originals.
    await sleep(150);
    assert.equal(finalPrice().querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(finalPrice().querySelector(".dd-badge").textContent, "Save 20%");
    assert.equal(stickyPrice().querySelector(".dd-sale").textContent, "$47.98");

    // Toggle to One-time. The theme's change handler writes the
    // one-time price as plain text, wiping the app's spans.
    doc.querySelector('input[name="gf-purchase"][value="onetime"]').checked = true;
    doc.querySelector('input[name="gf-purchase"][value="subscribe"]').checked = false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    finalPrice().textContent = "$50.97";
    stickyPrice().textContent = "$50.97";
    await sleep(400);
    assert.equal(finalPrice().querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(finalPrice().querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(finalPrice().querySelector(".dd-badge").textContent, "Save 15%");
    assert.match(finalPrice().parentNode.textContent, /Start With Your Gut/);
    assert.equal(stickyPrice().querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(stickyPrice().querySelector(".dd-badge").textContent, "Save 15%");

    // Toggle back to Subscribe: the theme writes the subscribe price
    // as plain text again, and the CTAs must return to it.
    doc.querySelector('input[name="gf-purchase"][value="subscribe"]').checked = true;
    doc.querySelector('input[name="gf-purchase"][value="onetime"]').checked = false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    finalPrice().textContent = "$47.98";
    stickyPrice().textContent = "$47.98";
    await sleep(400);
    assert.equal(finalPrice().querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(finalPrice().querySelector(".dd-badge").textContent, "Save 20%");
    assert.equal(stickyPrice().querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(stickyPrice().querySelector(".dd-badge").textContent, "Save 20%");
  } finally {
    dom.window.close();
  }
});

// v14 FIX 3 — buy-box section heading: the head_2 theme setting (e.g.
// "Save 20% + Free Shipping.") is static copy in the buy section's <h2>,
// not a .pill, so the CTA-pill rewrite never touched it and it stayed on
// the subscribe % in One-time mode. It now follows the selected mode's
// % like the burst and pills. Only Gut First, Gut Health 2, Probiotics 2
// and Taste 2 have a % in their buy heading.
const HEADING_HTML = `
<div class="shopify-section"><section class="bb gutter" id="buy">
  <div class="page">
    <div class="bb-head center"><h2 class="h-xl">Start With Your Gut. <span class="green">Save 20% + Free Shipping.</span></h2></div>
    <div class="burst"><span>SAVE<br>20%</span></div>
    <div class="cta-wrap"><span class="pill">Save 20% + Free Shipping</span>
      <a class="btn" href="#buy">Start With Your Gut — $59.97</a></div>
    <div class="purchase-opt" data-purchase-opt="onetime">
      <span class="purchase-price">$59.97</span>
    </div>
    <div class="purchase-opt" data-purchase-opt="subscribe">
      <span class="purchase-price">$47.98</span>
    </div>
  </div>
  <input type="radio" name="gf-purchase" value="onetime">
  <input type="radio" name="gf-purchase" value="subscribe" checked>
</section></div>
<section><div class="sec-h"><h2 class="h-xl">Gut Support at <span class="green">Every Step of Digestion</span></h2></div></section>`;

test("v14 buy-box heading % follows the purchase-mode toggle", async () => {
  const dom = runPage(
    HEADING_HTML,
    "https://biometheory.shop/pages/biome-gut-first",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.GF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    const heading = () => doc.querySelector(".bb-head h2");
    // Subscribe selected on load: heading keeps its subscribe %.
    assert.match(heading().textContent, /Save 20% \+ Free Shipping\./);
    // Toggle to One-time: heading follows to the one-time %.
    doc.querySelector('input[name="gf-purchase"][value="onetime"]').checked = true;
    doc.querySelector('input[name="gf-purchase"][value="subscribe"]').checked = false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(200);
    assert.match(heading().textContent, /Save 15% \+ Free Shipping\./);
    assert.match(heading().textContent, /Start With Your Gut\./);
    // Toggle back: heading returns to the subscribe %.
    doc.querySelector('input[name="gf-purchase"][value="subscribe"]').checked = true;
    doc.querySelector('input[name="gf-purchase"][value="onetime"]').checked = false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(200);
    assert.match(heading().textContent, /Save 20% \+ Free Shipping\./);
    // A heading with no % is never touched.
    assert.equal(
      doc.querySelector(".sec-h h2").textContent,
      "Gut Support at Every Step of Digestion",
    );
  } finally {
    dom.window.close();
  }
});

test("v15 subscribe row: injection uses ID-scoped rules that beat Appstle's own stylesheet", () => {
  // v15 root cause (verified against the live pilot product page):
  // Appstle's own stylesheet colours the subscribe sale with an
  // ID-scoped rule — :is(#appstle_subscription_widget0,
  // [id^="appstle_subscription_widget"]) ...
  // .appstle_subscription_amount { color: var(--as-price-color) } —
  // specificity (1,1,0), and --as-price-color is #ff0303 (red) in
  // Appstle's theme settings. The v14 two-class rules (0,2,0) lost to
  // it, so the product-page Subscribe row stayed red live even though
  // the rules were correct (the landings passed because the theme's red
  // rule there is single-class). The ID-scoped rules below are (1,2,0)
  // and win regardless of style order.
  const dom = runPage(
    PRODUCT_HTML_WIDGET_TYPE_2,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const style = doc.getElementById("dd-subscribe-price-colors");
    assert.ok(style, "expected the subscribe-price-colours style element");
    const scope =
      ':is(#appstle_subscription_widget0, [id^="appstle_subscription_widget"])';
    // ID-scoped WIDGET_TYPE_2 rules (the fix) — sale and compare.
    assert.ok(
      style.textContent.includes(
        `${scope} .appstle_subscription_amount_wrapper .appstle_subscription_amount{color:#000000 !important}`,
      ),
      "expected the ID-scoped subscribe sale rule",
    );
    assert.ok(
      style.textContent.includes(
        `${scope} .appstle_subscription_amount_wrapper .appstle_subscription_compare_amount{color:#6b7280 !important}`,
      ),
      "expected the ID-scoped subscribe compare rule",
    );
    // ID-scoped Mustache rules too.
    assert.ok(
      style.textContent.includes(
        `${scope} .appstle_sellingPlan_price.appstle_price_block{color:#000000 !important}`,
      ),
      "expected the ID-scoped Mustache sale rule",
    );
    // Unscoped two-class rules kept as a fallback — they beat the
    // merchant's single-class #ff0000 rule if Appstle renames the id.
    assert.match(
      style.textContent,
      /\.appstle_subscription_amount_wrapper \.appstle_subscription_amount\{color:#000000 !important\}/,
    );
    // Values still untouched.
    assert.equal(
      doc.querySelector(
        ".appstle_subscription_amount_wrapper .appstle_subscription_amount",
      ).textContent,
      "$47.98",
    );
    assert.equal(
      doc.querySelector(
        ".appstle_subscription_amount_wrapper .appstle_subscription_compare_amount",
      ).textContent,
      "$59.97",
    );
  } finally {
    dom.window.close();
  }
});

test("v15 static text: expanded price is one group and a following comma stays attached (Caffeine Free hero)", async () => {
  // Caffeine Free's hero: "Try the 3pm Swap — $59.97, Free Shipping".
  // .btn is display:inline-flex with gap:10px, so the bare
  // ", Free Shipping" text node became an anonymous flex item and the
  // button rendered "Save 20% , Free Shipping" (gap before the comma).
  // The expanded price is now one .dd-static-price group and the comma
  // moves inside it, so the comma stays attached to the badge.
  const html = `
  <div class="shopify-section"><section class="bb gutter" id="buy">
    <div class="cta-wrap">
      <a class="btn" href="#buy" id="heroCta">Try the 3pm Swap — $59.97, Free Shipping</a>
    </div>
    <div class="price-line" aria-label="Price: $59.97, was $78.93">
      <span class="now">$59.97</span><s class="was"></s>
    </div>
    <input type="radio" name="cf-purchase" value="onetime">
    <input type="radio" name="cf-purchase" value="subscribe" checked>
  </section></div>`;
  const dom = runPage(
    html,
    "https://biometheory.shop/pages/biome-caffeine-free",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.CF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    const hero = doc.querySelector("#heroCta");
    // Subscribe selected on load.
    const group = hero.querySelector(".dd-static-price");
    assert.ok(
      group,
      "expected the expanded price in one .dd-static-price group",
    );
    assert.equal(group.querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(group.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(group.querySelector(".dd-badge").textContent, "Save 20%");
    // The comma is INSIDE the group, directly after the badge — no gap
    // can appear before it in a flex button.
    assert.match(group.textContent, /Save 20%,$/);
    // The full button text has no space before the comma.
    assert.match(hero.textContent, /Save 20%, Free Shipping/);
    assert.doesNotMatch(hero.textContent, /Save 20% ,/);
    // Toggle to One-time: group re-derives, comma still attached.
    doc.querySelector('input[name="cf-purchase"][value="onetime"]').checked =
      true;
    doc.querySelector('input[name="cf-purchase"][value="subscribe"]').checked =
      false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(150);
    const group2 = hero.querySelector(".dd-static-price");
    assert.equal(group2.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(group2.querySelector(".dd-badge").textContent, "Save 15%");
    assert.match(group2.textContent, /Save 15%,$/);
    assert.match(hero.textContent, /Save 15%, Free Shipping/);
  } finally {
    dom.window.close();
  }
});

test("v16 subscribe row: inline !important colours beat Appstle's layered stylesheet, values untouched", async () => {
  // v16 root cause (verified against the live pilot product page):
  // Appstle's colour rule lives inside `@layer appstle-design`, and
  // for !important declarations a layered rule beats an unlayered one
  // regardless of specificity (MDN `!important`) — specificity is only
  // evaluated after the layer is chosen. So the v13 (0,2,0), v14
  // (0,2,0) and v15 (1,2,0) stylesheet rules could never win on the
  // product page, even though the style element WAS injected, the rules
  // were correct, the selector matched the live span, and the live
  // settings had saleColor #000000 — the row still rendered #FF0303
  // (Appstle's --as-price-color). The mechanism that wins is an inline
  // !important style: MDN confirms inline !important takes precedence
  // over all other !important author styles, no matter the layer.
  // jsdom normalises hex colours to rgb() when read back.
  const dom = runPage(
    PRODUCT_HTML_WIDGET_TYPE_2,
    `https://biometheory.shop/products/${HANDLE}`,
    baseSettings(),
    basePrices(),
  );
  try {
    const doc = dom.window.document;
    const sale = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_amount",
    );
    const compare = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_compare_amount",
    );
    // Painted black / grayish, inline !important.
    assert.ok(["#000000", "rgb(0, 0, 0)"].includes(sale.style.getPropertyValue("color")));
    assert.equal(sale.style.getPropertyPriority("color"), "important");
    assert.ok(["#6b7280", "rgb(107, 114, 128)"].includes(compare.style.getPropertyValue("color")));
    assert.equal(compare.style.getPropertyPriority("color"), "important");
    // Guard attributes set (and re-paint if the settings colour changes).
    assert.equal(sale.getAttribute("data-dd-sub-color"), "#000000");
    assert.equal(compare.getAttribute("data-dd-sub-compare"), "#6b7280");
    // Values untouched, no app markup inside the spans.
    assert.equal(sale.textContent, "$47.98");
    assert.equal(sale.querySelector(".dd-sale"), null);
    assert.equal(compare.textContent, "$59.97");
    // The one-time row is never painted by this painter — its spans
    // live in .appstle_one_time_price_wrapper, a different wrapper.
    const oneTime = doc.querySelector(
      ".appstle_one_time_price_wrapper .appstle_subscription_amount",
    );
    assert.equal(oneTime.getAttribute("data-dd-sub-color"), null);
    assert.equal(oneTime.getAttribute("data-dd-sub-compare"), null);
    // Stylesheet fallback still injected (wins wherever Appstle's rule
    // is unlayered or absent).
    assert.ok(doc.getElementById("dd-subscribe-price-colors"));
    // Appstle re-renders the widget: the new spans are repainted by
    // the MutationObserver + retry timers (run() repaints every run).
    const wrap = doc.querySelector(".appstle_subscription_amount_wrapper");
    wrap.innerHTML =
      '<span class="appstle_subscription_amount transcy-money" aria-hidden="true">$47.98</span>' +
      '<span class="appstle_subscription_compare_amount transcy-money" aria-hidden="true">$59.97</span>';
    await sleep(400);
    const sale2 = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_amount",
    );
    const compare2 = doc.querySelector(
      ".appstle_subscription_amount_wrapper .appstle_subscription_compare_amount",
    );
    assert.ok(["#000000", "rgb(0, 0, 0)"].includes(sale2.style.getPropertyValue("color")));
    assert.equal(sale2.style.getPropertyPriority("color"), "important");
    assert.ok(["#6b7280", "rgb(107, 114, 128)"].includes(compare2.style.getPropertyValue("color")));
    assert.equal(compare2.style.getPropertyPriority("color"), "important");
  } finally {
    dom.window.close();
  }
});

test("v16 static text: a space before a following comma is removed, and the key is versioned", async () => {
  // The live Caffeine Free hero kept rendering "Save 20% , Free
  // Shipping" even though v15's wrapper is correct for a source with
  // the comma directly after the price (jsdom repro proves it). Two
  // robustness gaps remain: (1) a source with whitespace before the
  // comma ("$59.97 , Free Shipping") was not consumed, so the space
  // survived in front of the comma; (2) the static-text key was not
  // versioned, so an element rewritten by an older app version (e.g.
  // in a retained / back-forward cached page) kept its stale markup.
  // Both are fixed here.
  const html = `
  <div class="shopify-section"><section class="bb gutter" id="buy">
    <div class="cta-wrap">
      <a class="btn" href="#buy" id="heroCta">Try the 3pm Swap — $59.97 , Free Shipping</a>
    </div>
    <div class="price-line" aria-label="Price: $59.97, was $78.93">
      <span class="now">$59.97</span><s class="was"></s>
    </div>
    <input type="radio" name="cf-purchase" value="onetime">
    <input type="radio" name="cf-purchase" value="subscribe" checked>
  </section></div>`;
  const dom = runPage(
    html,
    "https://biometheory.shop/pages/biome-caffeine-free",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.CF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    const hero = doc.querySelector("#heroCta");
    // The space before the comma is gone, in both modes.
    assert.match(hero.textContent, /Save 20%, Free Shipping/);
    assert.doesNotMatch(hero.textContent, /Save 20% ,/);
    // The key is versioned, so a stale older-version rewrite is
    // re-derived instead of kept.
    assert.match(
      hero.getAttribute("data-dd-static-key") || "",
      /^v16\|/,
    );
    // Toggle to One-time: comma still attached, key still versioned.
    doc.querySelector('input[name="cf-purchase"][value="onetime"]').checked =
      true;
    doc.querySelector('input[name="cf-purchase"][value="subscribe"]').checked =
      false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(150);
    assert.match(hero.textContent, /Save 15%, Free Shipping/);
    assert.doesNotMatch(hero.textContent, /Save 15% ,/);
    assert.match(
      hero.getAttribute("data-dd-static-key") || "",
      /^v16\|/,
    );
  } finally {
    dom.window.close();
  }
});

test("v17 static text: badge carries margin-right:0 and the comma is the very next node after it (Caffeine Free hero)", async () => {
  // v17 root cause (verified from code + served HTML, not guessed):
  // the badge has NO margin-right anywhere — not in its inline style,
  // not in the liquid .dd-badge rule, not in the theme CSS, not in the
  // external stylesheets — and the jsdom DOM is clean (comma directly
  // after the badge, no whitespace). The v16 re-check still measured an
  // 8–10px strip of green button background between the pill and the
  // comma in the live browser, so the gap is a layout effect at the
  // inline/flex boundary, not a space or a margin in the markup. The
  // fix makes the .dd-static-price group an inline-flex container with
  // gap:0, so the badge and the comma are flex items with exactly 0 gap
  // between them by spec — and states the badge's margin-right:0 inline
  // so no stylesheet can ever put a margin after it. align-items:
  // baseline keeps the current baseline alignment.
  const html = `
  <div class="shopify-section"><section class="bb gutter" id="buy">
    <div class="cta-wrap">
      <a class="btn" href="#buy" id="heroCta">Try the 3pm Swap — $59.97, Free Shipping</a>
    </div>
    <div class="price-line" aria-label="Price: $59.97, was $78.93">
      <span class="now">$59.97</span><s class="was"></s>
    </div>
    <input type="radio" name="cf-purchase" value="onetime">
    <input type="radio" name="cf-purchase" value="subscribe" checked>
  </section></div>`;
  const dom = runPage(
    html,
    "https://biometheory.shop/pages/biome-caffeine-free",
    baseSettings(),
    basePrices(),
    (window) => {
      window.document.body.dataset.flavor = "mango";
      window.CF_PRODUCTS = { mango: { variant: VARIANT } };
    },
  );
  try {
    const doc = dom.window.document;
    const hero = doc.querySelector("#heroCta");
    const assertTight = (pct) => {
      const group = hero.querySelector(".dd-static-price");
      assert.ok(group, "expected a .dd-static-price group");
      const badge = group.querySelector(".dd-badge");
      assert.ok(badge, "expected a badge in the group");
      // The badge states margin-right:0 inline — no stylesheet can put
      // a margin after it.
      assert.match(
        badge.getAttribute("style") || "",
        /margin-right:\s*0/,
        "badge must carry margin-right:0 inline",
      );
      // The very next sibling node after the badge is the "," text node
      // — no whitespace node, no element, nothing between pill and comma.
      const kids = [...group.childNodes];
      const badgeIdx = kids.indexOf(badge);
      assert.ok(badgeIdx >= 0, "badge must be a direct child of the group");
      const next = kids[badgeIdx + 1];
      assert.ok(next, "expected a node right after the badge");
      assert.equal(next.nodeType, 3, "node after the badge must be text");
      assert.equal(next.nodeValue, ",", "text after the badge must be exactly ','");
      assert.match(hero.textContent, new RegExp(`Save ${pct}%, Free Shipping`));
      assert.doesNotMatch(hero.textContent, new RegExp(`Save ${pct}% ,`));
    };
    // Subscribe selected on load.
    assertTight(20);
    // Toggle to One-time: comma still tight.
    doc.querySelector('input[name="cf-purchase"][value="onetime"]').checked =
      true;
    doc.querySelector('input[name="cf-purchase"][value="subscribe"]').checked =
      false;
    doc.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(150);
    assertTight(15);
  } finally {
    dom.window.close();
  }
  // The liquid rule itself: inline-flex, baseline alignment, zero gap.
  const liquid = readFileSync(join(dir, "blocks", "discount-price.liquid"), "utf8");
  assert.match(
    liquid,
    /\.dd-static-price\s*\{\s*display:\s*inline-flex;\s*align-items:\s*baseline;\s*gap:\s*0;/,
    "liquid .dd-static-price must be inline-flex with gap:0",
  );
});
