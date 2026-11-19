(function () {
  var D = window.DiscountDisplay;
  if (!D || !D.settings || !D.settings.enabled) return;
  var S = D.settings;
  var P = D.prices || {};

  var shopify = window.Shopify || {};
  var currency = (shopify.currency && shopify.currency.active) || "USD";
  var rate = (shopify.currency && parseFloat(shopify.currency.rate)) || 1;
  var fmt;
  try {
    fmt = new Intl.NumberFormat(document.documentElement.lang || undefined, {
      style: "currency",
      currency: currency,
    });
  } catch (e) {
    fmt = {
      format: function (n) {
        return n.toFixed(2);
      },
    };
  }
  function money(n) {
    return fmt.format(n * rate);
  }

  function validHex(value, fallback) {
    return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value)
      ? value
      : fallback;
  }

  var saleColor = validHex(S.saleColor, "#d82c0d");
  var badgeBg = validHex(S.badgeBg, "#42572A");
  var badgeColor = validHex(S.badgeColor, "#ffffff");
  var badgeRadius =
    S.badgeStyle === "rounded" ? "6px" : S.badgeStyle === "square" ? "2px" : "999px";

  // Merchant custom CSS (settings > Custom CSS). Injected once as a
  // <style> element whose text content is the CSS, so it styles anything
  // on the page. Re-applied on every run so a settings change takes
  // effect without a reload; removed again when the field is emptied.
  function injectCustomCss() {
    var css = typeof S.customCss === "string" ? S.customCss : "";
    var el = document.getElementById("dd-custom-css");
    if (!css.trim()) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = "dd-custom-css";
      document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }

  // Appstle's subscribe badges are styled by Appstle's own widget CSS —
  // currently pale green — and must be restyled to this app's badge colours
  // so the product page's badges match. There are two different badges,
  // and the v2 override missed both because it targeted only
  // span.appstle_sellingPlan_discountText, a class that exists in
  // Appstle's Mustache template but is never rendered by the live widget
  // (the live JS has zero references to it):
  //  (a) the MAIN-PRICE badge in Subscribe mode:
  //      <span class="appstle_subscription_element appstle_subscription_save">
  //      rendered by Appstle's JS when it rewrites the theme price. Its CSS
  //      is `.appstle_subscription_save { color: #78f39d !important; }`
  //      plus `border: 1px solid currentColor` — pale green text on white
  //      with a pale green border. (Verified in Appstle's JS/CSS.)
  //  (b) the ROW pill on the Subscribe option:
  //      <strong class="appstle-save-badge"> — NOTE it is a <strong>,
  //      NOT a <span>. The v5 selector used span.appstle-save-badge
  //      (copied from Appstle's merchant custom CSS, whose
  //      span.appstle-save-badge rule also never matches the live pill),
  //      so it never matched and the pill stayed pale. The pale fill
  //      comes from the unqualified .appstle-save-badge rule (#78F39D)
  //      and the --as-badge-bg variable (#5a941d39).
  //      (Verified in Appstle's JS template — two occurrences, both
  //      <strong> — and the live page HTML; zero <span> occurrences.)
  // Both are restyled here. Only colours + corner radius are changed;
  // position, size and layout are left to Appstle, and the badge text,
  // prices and widget behaviour are never touched.
  // The inline style (setProperty with "important") beats any stylesheet,
  // including Appstle's ID-based rules, and is re-applied on every run
  // (the MutationObserver below re-invokes run() whenever Appstle
  // re-renders the badge). A stylesheet rule is injected as well so the
  // restyle is present from the first paint.
  // NOTE on border-color: .appstle_subscription_save has
  // `border: 1px solid currentColor`, so once its text colour is set to
  // white the border would render as a white outline around the dark
  // pill. Setting border-color to the badge background blends that 1px
  // border into the pill (a colour-only change; the border itself, and
  // the element's layout, are untouched).
  // Use UNQUALIFIED class selectors (no `span` element qualifier):
  // the row pill is a <strong>, the main-price badge is a <span>, and
  // the template pill's tag is unverified — the class alone matches all
  // of them regardless of tag. (The v5 span-qualified selector is what
  // left the row pill pale: it never matched the <strong>.)
  var APPSTLE_BADGE_SELECTOR =
    ".appstle_subscription_save, .appstle-save-badge, .appstle_sellingPlan_discountText";
  function injectAppstleBadgeCss() {
    if (!S.badgeEnabled) return;
    var el = document.getElementById("dd-appstle-badge");
    var css =
      APPSTLE_BADGE_SELECTOR +
      "{background-color:" +
      badgeBg +
      " !important;color:" +
      badgeColor +
      " !important;border-color:" +
      badgeBg +
      " !important;border-radius:" +
      badgeRadius +
      " !important;}";
    if (!el) {
      el = document.createElement("style");
      el.id = "dd-appstle-badge";
      document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }

  function restyleAppstleBadge() {
    if (!S.badgeEnabled) return;
    document.querySelectorAll(APPSTLE_BADGE_SELECTOR).forEach(function (el) {
      el.style.setProperty("background-color", badgeBg, "important");
      el.style.setProperty("color", badgeColor, "important");
      el.style.setProperty("border-color", badgeBg, "important");
      el.style.setProperty("border-radius", badgeRadius, "important");
    });
  }

  function selectorList(selectors, legacySelector) {
    var list = Array.isArray(selectors) ? selectors : [legacySelector];
    return list
      .filter(function (selector) {
        return typeof selector === "string" && selector.trim();
      })
      .join(", ");
  }

  function badgeHtml(o, s) {
    if (!S.badgeEnabled) return "";
    var pct = Math.round((1 - s / o) * 100);
    if (!(pct > 0)) return "";
    var style =
      S.badgeStyle === "rounded"
        ? "rounded"
        : S.badgeStyle === "square"
          ? "square"
          : "pill";
    var size =
      S.badgeSize === "small"
        ? "small"
        : S.badgeSize === "large"
          ? "large"
          : "medium";
    return (
      '<span class="dd-badge dd-badge--' +
      style +
      " dd-badge--" +
      size +
      '" style="background:' +
      badgeBg +
      ";color:" +
      badgeColor +
      '">Save ' +
      pct +
      "%</span>"
    );
  }

  function needsApply(el, key) {
    var wrap = el.querySelector(".dd-wrap");
    if (!wrap || wrap.getAttribute("data-key") !== key) return true;
    // Theme often re-injects the regular price as a sibling text node after our wrap.
    var clone = el.cloneNode(true);
    var w = clone.querySelector(".dd-wrap");
    if (w) w.remove();
    return !!(clone.textContent || "").replace(/\s+/g, "").length;
  }

  function apply(el, o, s) {
    if (s >= o) {
      unapply(el);
      return;
    }

    var key = o + "|" + s;
    if (!needsApply(el, key)) return;
    // Remember what the theme rendered, so unapply() can put it back.
    if (el._ddOriginal === undefined) el._ddOriginal = el.innerHTML;
    el.innerHTML =
      '<span class="dd-wrap" data-key="' +
      key +
      '">' +
      '<s class="dd-orig">' +
      money(o) +
      "</s>" +
      '<span class="dd-sale" style="color:' +
      saleColor +
      '">' +
      money(s) +
      "</span>" +
      badgeHtml(o, s) +
      "</span>";
  }

  function unapply(el) {
    var wrap = el.querySelector(".dd-wrap");
    if (!wrap) return;
    if (el._ddOriginal !== undefined) el.innerHTML = el._ddOriginal;
    delete el._ddOriginal;
  }

  // Which purchase mode is this price element showing? Landing-page buy
  // boxes have a One-time / Subscribe switch; the app only ever rewrites
  // one-time prices, and must leave subscribe prices exactly as the theme
  // (or the subscription app) rendered them.
  // Returns "onetime", "subscribe", or null when there is no switch here.
  function purchaseModeFor(el) {
    if (!el.closest) return null;
    // Inside one of the switch's own option rows: the row never changes.
    var opt = el.closest("[data-purchase-opt]");
    if (opt) {
      var v = opt.getAttribute("data-purchase-opt");
      if (v === "subscribe" || v === "onetime") return v;
    }
    // Anywhere else on a page with the switch: follow the checked option.
    var scope = el.closest("section") || document;
    var checked = scope.querySelector(
      'input[type="radio"][name$="-purchase"]:checked',
    );
    if (!checked) {
      checked = document.querySelector(
        'input[type="radio"][name$="-purchase"]:checked',
      );
    }
    if (checked && (checked.value === "subscribe" || checked.value === "onetime")) {
      return checked.value;
    }
    return null;
  }

  // Product page: Appstle's widget radios are named selling_plan — value
  // "" is One-time, a plan id is Subscribe. The URL also gains/loses
  // ?selling_plan= as the option changes. Returns "onetime", "subscribe",
  // or null when neither signal is readable yet.
  function productPageMode() {
    var checked = document.querySelector(
      'input[name="selling_plan"]:checked',
    );
    if (checked) return checked.value ? "subscribe" : "onetime";
    try {
      if (new URL(location.href).searchParams.get("selling_plan")) {
        return "subscribe";
      }
    } catch (e) {}
    var sp = document.querySelector(
      'form[action*="/cart/add"] input[name="selling_plan"]',
    );
    if (sp && sp.value) return "subscribe";
    return null;
  }

  // No switch on this page (product page, cards): only rewrite the element
  // when it is currently showing a one-time price — i.e. the variant's
  // original or sale price. A subscription price (or anything else) means
  // hands off.
  function looksOneTime(el, o, s) {
    var clone = el.cloneNode(true);
    var w = clone.querySelector(".dd-wrap");
    if (w) w.remove();
    var m = (clone.textContent || "").match(/[\d]+(?:[.,]\d+)?/);
    if (!m) return false;
    var n = parseFloat(m[0].replace(/,/g, ""));
    return Math.abs(n - o) < 0.011 || Math.abs(n - s) < 0.011;
  }

  function maybeApply(el, prices) {
    if (!prices) return;
    var o = prices.o,
      s = prices.s;
    if (s >= o) {
      unapply(el);
      return;
    }
    var mode = purchaseModeFor(el);
    if (mode === "subscribe") return;
    if (mode === null && !looksOneTime(el, o, s)) return;
    apply(el, o, s);
  }

  function handleFromUrl(url) {
    var m = (url || "").match(/\/products\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function variantIdFromUrl(url) {
    try {
      return new URL(url, location.origin).searchParams.get("variant");
    } catch (e) {
      return null;
    }
  }

  function normalizedVariantId(id) {
    return id ? String(id).split("/").pop() : null;
  }

  function priceFor(entry, vid) {
    var id = normalizedVariantId(vid);
    return id && entry.variants ? entry.variants[id] || null : null;
  }

  function cardLinkFor(el) {
    var box = el.closest(
      "li, article, .card-wrapper, .product-card, .grid__item, .product-item",
    );
    return box && box.querySelector('a[href*="/products/"]');
  }

  function productFormFor(entry) {
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    var candidates = [];
    forms.forEach(function (form) {
      if (
        form.closest(
          "li, article, .card-wrapper, .product-card, .grid__item, .product-item",
        )
      ) {
        return;
      }
      // Shopify renders a section as <div class="shopify-section"> in this
      // theme (there is no <section> tag), so fall back to it — otherwise
      // no scope is found and the whole product-page branch is skipped.
      var scope =
        form.closest("section") ||
        form.closest(".shopify-section") ||
        form.closest(".product");
      if (!scope) return;
      var idInput = form.querySelector('[name="id"]');
      candidates.push({
        form: form,
        scope: scope,
        variantId: idInput ? idInput.value : null,
      });
    });
    return (
      candidates.find(function (candidate) {
        return priceFor(entry, candidate.variantId);
      }) ||
      candidates[0] ||
      null
    );
  }

  // Landing pages: the buy box keeps its flavour in body[data-flavor] and
  // the theme exposes per-flavour variant ids in a window.*_PRODUCTS table.
  var productsTable = null;
  function themeProductsTable() {
    if (productsTable) return productsTable;
    for (var k in window) {
      if (/_PRODUCTS$/.test(k)) {
        var t = window[k];
        if (t && typeof t === "object") {
          productsTable = t;
          return t;
        }
      }
    }
    return null;
  }

  function landingPrices() {
    var flavour =
      (document.body && document.body.dataset.flavor) || "";
    if (flavour) {
      var table = themeProductsTable();
      if (table && table[flavour] && table[flavour].variant) {
        var vid = String(table[flavour].variant);
        for (var h in P) {
          var entry = P[h];
          if (entry.variants && entry.variants[vid]) {
            return entry.variants[vid];
          }
        }
      }
      // Fallback: match the flavour name against product handles
      // (e.g. "mango" -> biome-theory-super-greens-mango-flavour).
      var f = flavour.toLowerCase();
      for (var h2 in P) {
        if (h2.toLowerCase().indexOf(f) !== -1) {
          var e2 = P[h2];
          if (e2.card) return e2.card;
          if (e2.variants) {
            var ids = Object.keys(e2.variants);
            if (ids.length) return e2.variants[ids[0]];
          }
        }
      }
    }
    // Last resort: a single discounted product in the whole store.
    var handles = Object.keys(P);
    if (handles.length === 1 && P[handles[0]].card) return P[handles[0]].card;
    return null;
  }

  // Which purchase mode is currently selected in a landing-page buy box?
  // Prefers the checked One-time / Subscribe radio; falls back to the row
  // the theme marks selected. Subscribe is the theme's pre-selected mode,
  // so the radio is the source of truth on load.
  function landingSelectedMode() {
    var checked = document.querySelector(
      'input[type="radio"][name$="-purchase"]:checked',
    );
    if (
      checked &&
      (checked.value === "subscribe" || checked.value === "onetime")
    ) {
      return checked.value;
    }
    var sel = document.querySelector('.purchase-opt[data-selected="true"]');
    if (sel) {
      var v = sel.getAttribute("data-purchase-opt");
      if (v === "subscribe" || v === "onetime") return v;
    }
    return "onetime";
  }

  // Rewrite only the % number inside a starburst badge
  // (<div class="burst"><span>SAVE<br>20%</span></div>). The shape, text
  // and position are never changed — just the number.
  function setBurstPct(pct) {
    if (!(pct > 0)) return;
    var badgeSelector = selectorList(S.landingBadgeSelectors, ".burst");
    if (!badgeSelector) return;
    document.querySelectorAll(badgeSelector).forEach(function (el) {
      var target = el.querySelector("span") || el;
      var html = target.innerHTML;
      if (!/(\d+(?:\.\d+)?)%/.test(html)) return;
      var next = html.replace(/(\d+(?:\.\d+)?)%/, pct + "%");
      if (next !== html) target.innerHTML = next;
    });
  }

  // Landing-page badges follow the selected purchase mode, using the
  // dynamic % from the synced metafield (never a hardcoded number):
  //  - the starburst shows the SELECTED mode's % (one-time % when
  //    One-time is picked, subscribe % when Subscribe & Save is picked);
  //  - each buy-box row's own Save pill shows its own mode's dynamic %.
  // Runs on load and on every purchase-type change (run() is re-invoked
  // by the change/click listeners and the MutationObserver below).
  function updateLandingBadges() {
    if (!S.showOnLandingPages) return;
    var lp = landingPrices();
    if (!lp) return;
    var mode = landingSelectedMode();
    var burstPct =
      mode === "subscribe" ? lp.spp || null : lp.op || null;
    if (!burstPct) burstPct = lp.op || lp.spp || null;
    if (burstPct) setBurstPct(burstPct);
    // Each row's Save pill shows its own mode's dynamic %. (The one-time
    // row is usually already rewritten by the app into its own badge, in
    // which case there is no theme pill left here to update.) Only write
    // when the text actually changes — an unconditional write would fire
    // the MutationObserver on every run and never settle.
    document
      .querySelectorAll(
        '.purchase-opt[data-purchase-opt="onetime"] .save-badge',
      )
      .forEach(function (el) {
        if (lp.op) {
          var wantOt = "Save " + lp.op + "%";
          if (el.textContent !== wantOt) el.textContent = wantOt;
        }
      });
    document
      .querySelectorAll(
        '.purchase-opt[data-purchase-opt="subscribe"] .save-badge',
      )
      .forEach(function (el) {
        if (lp.spp) {
          var wantSub = "Save " + lp.spp + "%";
          if (el.textContent !== wantSub) el.textContent = wantSub;
        }
      });
  }

  function run() {
    injectCustomCss();
    injectAppstleBadgeCss();
    restyleAppstleBadge();
    updateLandingBadges();

    // Landing pages (buy boxes and other one-time prices).
    if (S.showOnLandingPages) {
      var landingSelector = selectorList(S.landingSelectors, null);
      if (landingSelector) {
        var lp = landingPrices();
        document.querySelectorAll(landingSelector).forEach(function (el) {
          maybeApply(el, lp);
        });
      }
    }

    // Main product page
    var pageHandle = handleFromUrl(location.pathname);
    if (pageHandle && P[pageHandle]) {
      var entry = P[pageHandle];
      var productForm = productFormFor(entry);
      if (S.showOnProductPage && productForm) {
        var form = productForm.form;
        var idInput = form.querySelector('[name="id"]');
        var vid = (idInput && idInput.value) || variantIdFromUrl(location.href);
        var prices = priceFor(entry, vid);
        var productSelector = selectorList(
          S.productSelectors,
          S.productSelector || ".price",
        );
        if (productSelector && prices) {
          var mode = productPageMode();
          productForm.scope
            .querySelectorAll(productSelector)
            .forEach(function (el) {
              if (cardLinkFor(el)) return;
              // Subscribe: Appstle owns the price ($47.98 / Save 20%).
              // Restore anything we wrote and leave it alone.
              if (mode === "subscribe") {
                unapply(el);
                return;
              }
              maybeApply(el, prices);
            });
        }
      }
    }

    // Product cards
    if (S.showOnCards) {
      var cardSelector = selectorList(
        S.cardSelectors,
        S.cardSelector || ".price",
      );
      // This theme's /collections/all grid is a custom section whose price
      // is .bt-collection-grid__price, not .price — include it alongside
      // the merchant-configured selectors so those cards get the discount
      // too (their links carry no ?variant=, so the card-level price
      // fallback in the loop below applies).
      if (cardSelector) {
        cardSelector += ", .bt-collection-grid__price";
      }
      if (!cardSelector) return;
      document.querySelectorAll(cardSelector).forEach(function (el) {
        var a = cardLinkFor(el);
        if (!a) return;
        var h = handleFromUrl(a.getAttribute("href"));
        if (!h || !P[h]) return;

        var variantId = variantIdFromUrl(a.href);
        var cardPrices = variantId
          ? priceFor(P[h], variantId)
          : P[h].card || null;
        if (cardPrices) maybeApply(el, cardPrices);
      });
    }
  }

  var timers = [];
  function later() {
    timers.forEach(clearTimeout);
    timers = [];
    // Theme JS (and Appstle's sellingPlanChanged burst) often rewrites the
    // price after our first pass — retry a few times, longer than the burst.
    [50, 150, 350, 700, 1200, 2000].forEach(function (ms) {
      timers.push(setTimeout(run, ms));
    });
  }

  run();
  new MutationObserver(function () {
    later();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  document.addEventListener("change", later, true);
  document.addEventListener("click", later, true);
  document.addEventListener("shopify:section:load", later);
})();
