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

  function run() {
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
