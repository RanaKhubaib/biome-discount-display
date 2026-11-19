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
    saleColor: "#d82c0d",
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
      "dd-badge dd-badge--pill dd-badge--medium",
    ]);
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(oneTime.querySelector(".dd-badge").textContent, "Save 15%");
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
    assert.equal(oneTime.querySelector(".dd-badge").textContent, "Save 15%");
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
    // CTA button text: label kept, price token rewritten.
    const cta = doc.querySelector('.cta-wrap a.btn[href="#buy"]');
    assert.match(cta.textContent, /Start With Your Gut/);
    assert.equal(cta.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(cta.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(cta.querySelector(".dd-badge").textContent, "Save 15%");
    // ATC price spans: the $47.98 subscribe token gets the subscribe sale.
    const sticky = doc.querySelector(".sticky-price");
    assert.equal(sticky.querySelector(".dd-sale").textContent, "$47.98");
    assert.equal(sticky.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(sticky.querySelector(".dd-badge").textContent, "Save 20%");
    const final = doc.querySelector(".final-price");
    assert.equal(final.querySelector(".dd-sale").textContent, "$50.97");
    // Offer strip: price rewritten, the $2.40 per-glass figure untouched.
    const strip = doc.querySelector(".ostrip");
    assert.equal(strip.querySelector(".dd-sale").textContent, "$50.97");
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
      "dd-badge dd-badge--pill dd-badge--medium",
    ]);
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(oneTime.querySelector(".dd-badge").textContent, "Save 15%");
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
    assert.equal(oneTime.querySelector(".dd-badge").textContent, "Save 15%");
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
    assert.equal(pick().querySelector(".dd-badge").textContent, "Save 15%");
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
          <div class="appstle_subscription_price_wrapper">
            <span class="appstle_subscription_amount transcy-money" aria-hidden="true">$47.98</span>
            <span class="appstle_subscription_amount-appstle-sr-only transcy-money sr-only">Sale price $47.98</span>
            <span class="appstle_subscription_amount_compare_at_price transcy-money" aria-hidden="true">$59.97</span>
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
      "dd-badge dd-badge--pill dd-badge--medium",
    ]);
    assert.equal(oneTime.querySelector(".dd-sale").textContent, "$50.97");
    assert.equal(oneTime.querySelector(".dd-orig").textContent, "$59.97");
    assert.equal(oneTime.querySelector(".dd-badge").textContent, "Save 15%");
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
      ".appstle_subscription_price_wrapper .appstle_subscription_amount",
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
    assert.equal(pick().querySelector(".dd-badge").textContent, "Save 15%");
    assert.equal(
      doc.querySelector(
        ".appstle_one_time_price_wrapper .appstle_subscription_amount-appstle-sr-only",
      ).textContent,
      "Sale price $50.97",
    );
    // Subscribe row still untouched after the re-render.
    const subPrice = doc.querySelector(
      ".appstle_subscription_price_wrapper .appstle_subscription_amount",
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
