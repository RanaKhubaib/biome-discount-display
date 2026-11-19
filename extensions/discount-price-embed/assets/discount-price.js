// Biome Discount Display — storefront price rewriting.
//
// Price order everywhere the app renders a price: SALE price first, then
// the struck-through ORIGINAL price, then the "Save %" badge — the same
// layout Appstle shows on its Subscribe row ($47.98, struck $59.97,
// badge). Each place a price can appear is a "slot" (product cards,
// product page, landing buy boxes, the Appstle widget's one-time row,
// buttons & price text, the starburst, CTA pills, and a global catch-all),
// and each slot has its own display settings in the app: whether the
// original price shows first or second, whether the badge shows, and the
// sale/badge colours and badge size. A slot setting left unset inherits
// the global badge/price defaults from the app settings.
//
// What this app NEVER does: it does not manage subscriptions and it does
// not touch Appstle's own badges or prices. Appstle's Subscribe row and
// its badges are the owner's to design in Appstle. This app only rewrites
// ONE-TIME prices (plus the static text that shows them), and its own
// badges default to Appstle's badge design (#42572A background, white
// text, pill) so the two look the same side by side.
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var saleColor = validHex(S.saleColor, "#d82c0d");
  var badgeBg = validHex(S.badgeBg, "#42572A");
  var badgeColor = validHex(S.badgeColor, "#ffffff");
  var badgeStyleGlobal =
    S.badgeStyle === "rounded"
      ? "rounded"
      : S.badgeStyle === "square"
        ? "square"
        : "pill";
  var badgeSizeGlobal =
    S.badgeSize === "small"
      ? "small"
      : S.badgeSize === "large"
        ? "large"
        : "medium";

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

  // ---- Per-slot display settings -------------------------------------
  // Selectors live in top-level settings keys (cardSelectors,
  // productSelectors, ...); the display sub-settings live in
  // settings.slots[slotId]. Anything a slot leaves unset inherits the
  // global badge/price defaults above.
  var SLOT_SELECTOR_KEYS = {
    card: "cardSelectors",
    product: "productSelectors",
    landing: "landingSelectors",
    widgetOneTime: "widgetOneTimeSelectors",
    cta: "ctaSelectors",
    burst: "landingBadgeSelectors",
    ctaPill: "ctaBadgeSelectors",
    global: "globalSelectors",
  };
  var SLOT_SELECTOR_DEFAULTS = {
    card: [".price"],
    product: [".price"],
    landing: [
      '.purchase-opt[data-purchase-opt="onetime"] .purchase-price',
      ".price-line .now",
    ],
    widgetOneTime: [".appstle_onetime_amount"],
    cta: [
      '.cta-wrap a.btn[href="#buy"]',
      ".la-cta a.btn",
      'button[data-add="current"] .final-price',
      'button[data-add="current"] .sticky-price',
      ".ostrip",
    ],
    burst: [".burst"],
    ctaPill: [".cta-wrap .pill", ".oc-tag"],
    global: [],
  };

  function slotSelectors(id) {
    var key = SLOT_SELECTOR_KEYS[id];
    var list = key ? S[key] : null;
    if (Array.isArray(list) && list.length) {
      // Saved settings that still hold the old landing default (from
      // before the buy-box price line was added) get the price line
      // appended — the same migration the server applies on save — so
      // the price line goes dynamic without waiting for a settings save.
      // A merchant-edited list is left exactly as saved.
      if (
        id === "landing" &&
        list.length === 1 &&
        list[0] ===
          '.purchase-opt[data-purchase-opt="onetime"] .purchase-price'
      ) {
        return list.concat([".price-line .now"]);
      }
      return list;
    }
    return SLOT_SELECTOR_DEFAULTS[id] || [];
  }

  function slotCfg(id) {
    var base = {
      originalFirst: S.originalFirst === true,
      showBadge: S.badgeEnabled !== false,
      saleColor: saleColor,
      badgeBg: badgeBg,
      badgeColor: badgeColor,
      badgeStyle: badgeStyleGlobal,
      badgeSize: badgeSizeGlobal,
    };
    var slot = S.slots && S.slots[id];
    if (!slot || typeof slot !== "object") return base;
    return {
      originalFirst:
        typeof slot.originalFirst === "boolean"
          ? slot.originalFirst
          : base.originalFirst,
      showBadge:
        typeof slot.showBadge === "boolean" ? slot.showBadge : base.showBadge,
      saleColor: validHex(slot.saleColor, base.saleColor),
      badgeBg: validHex(slot.badgeBg, base.badgeBg),
      badgeColor: validHex(slot.badgeColor, base.badgeColor),
      badgeStyle:
        slot.badgeStyle === "rounded" ||
        slot.badgeStyle === "square" ||
        slot.badgeStyle === "pill"
          ? slot.badgeStyle
          : base.badgeStyle,
      badgeSize:
        slot.badgeSize === "small" ||
        slot.badgeSize === "large" ||
        slot.badgeSize === "medium"
          ? slot.badgeSize
          : base.badgeSize,
    };
  }

  function cfgSignature(cfg) {
    return [
      cfg.originalFirst ? "1" : "0",
      cfg.showBadge ? "1" : "0",
      cfg.saleColor,
      cfg.badgeBg,
      cfg.badgeColor,
      cfg.badgeStyle,
      cfg.badgeSize,
    ].join("|");
  }

  function selectorList(selectors, legacySelector) {
    var list = Array.isArray(selectors) ? selectors : [legacySelector];
    return list
      .filter(function (selector) {
        return typeof selector === "string" && selector.trim();
      })
      .join(", ");
  }

  function badgeHtml(o, s, cfg) {
    if (!cfg.showBadge) return "";
    var pct = Math.round((1 - s / o) * 100);
    if (!(pct > 0)) return "";
    return (
      '<span class="dd-badge dd-badge--' +
      cfg.badgeStyle +
      " dd-badge--" +
      cfg.badgeSize +
      '" style="background:' +
      cfg.badgeBg +
      ";color:" +
      cfg.badgeColor +
      '">Save ' +
      pct +
      "%</span>"
    );
  }

  // Sale price FIRST, then the struck original, then the badge — unless
  // this slot is set to show the original first.
  function priceInnerHtml(o, s, cfg) {
    var sale =
      '<span class="dd-sale" style="color:' +
      cfg.saleColor +
      '">' +
      money(s) +
      "</span>";
    var orig = '<s class="dd-orig">' + money(o) + "</s>";
    var badge = badgeHtml(o, s, cfg);
    return cfg.originalFirst ? orig + sale + badge : sale + orig + badge;
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

  function apply(el, o, s, cfg, handled) {
    if (s >= o) {
      unapply(el);
      return;
    }

    var key = o + "|" + s + "|" + cfgSignature(cfg);
    if (!needsApply(el, key)) {
      if (handled) handled.add(el);
      return;
    }
    // Remember what the theme rendered, so unapply() can put it back.
    if (el._ddOriginal === undefined) el._ddOriginal = el.innerHTML;
    el.innerHTML =
      '<span class="dd-wrap" data-key="' +
      key +
      '">' +
      priceInnerHtml(o, s, cfg) +
      "</span>";
    if (handled) handled.add(el);
  }

  function unapply(el) {
    var wrap = el.querySelector(".dd-wrap");
    if (!wrap) return;
    if (el._ddOriginal !== undefined) el.innerHTML = el._ddOriginal;
    delete el._ddOriginal;
  }

  // ---- Static price text (CTA buttons, strips, ATC price spans) ------
  // These elements hold a price inside longer text ("Start With Your Gut
  // — $59.97", "Add to Cart — $47.98"), so the whole element cannot be
  // replaced. Instead the price token itself is swapped for the dynamic
  // sale + struck original + badge, and the rest of the text is untouched.
  // Which sale applies is read from the token: a token equal to the
  // one-time original gets the one-time sale, a token equal to the
  // subscribe price gets the subscribe sale. Nothing else is rewritten —
  // other numbers (e.g. "$2.40 a glass") are left alone.
  function staticTargetFor(n, lp) {
    if (Math.abs(n - lp.o) < 0.011) {
      return { sale: lp.s, pct: lp.op || Math.round((1 - lp.s / lp.o) * 100) };
    }
    if (lp.sp != null && Math.abs(n - lp.sp) < 0.011) {
      return { sale: lp.sp, pct: lp.spp || 0 };
    }
    return null;
  }

  function restoreStatic(el) {
    if (el._ddStaticOriginal !== undefined) {
      el.innerHTML = el._ddStaticOriginal;
      delete el._ddStaticOriginal;
    }
    el.removeAttribute("data-dd-static-key");
  }

  function applyStaticText(el, lp, cfg, handled) {
    if (!lp || lp.s >= lp.o) {
      restoreStatic(el);
      return;
    }
    var key =
      lp.o + "|" + lp.s + "|" + (lp.sp || "") + "|" + (lp.spp || "") + "|" + cfgSignature(cfg);
    // Appstle / theme JS can wipe our spans by setting textContent; the
    // key survives that, so also require our markup to still be present.
    if (
      el.getAttribute("data-dd-static-key") === key &&
      el.querySelector(".dd-sale")
    ) {
      if (handled) handled.add(el);
      return;
    }
    if (
      el.getAttribute("data-dd-static-key") &&
      el.getAttribute("data-dd-static-key") !== key
    ) {
      restoreStatic(el);
    }
    if (el._ddStaticOriginal === undefined) el._ddStaticOriginal = el.innerHTML;

    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);
    var changed = false;
    nodes.forEach(function (tn) {
      var parent = tn.parentNode;
      if (!parent || parent.closest(".dd-sale, .dd-orig, .dd-badge")) return;
      if (/^(SCRIPT|STYLE)$/.test(parent.nodeName)) return;
      var text = tn.nodeValue;
      var re = /\$[\d,]+\.\d{2}/g;
      var m;
      var last = 0;
      var html = "";
      var nodeChanged = false;
      while ((m = re.exec(text))) {
        var n = parseFloat(m[0].slice(1).replace(/,/g, ""));
        var target = staticTargetFor(n, lp);
        if (!target) continue;
        html += escapeHtml(text.slice(last, m.index));
        // priceInnerHtml derives the badge % from original/sale, which
        // is the token's own % (one-time % or subscribe %) — never typed in.
        html += priceInnerHtml(lp.o, target.sale, cfg);
        last = m.index + m[0].length;
        nodeChanged = true;
      }
      if (!nodeChanged) return;
      html += escapeHtml(text.slice(last));
      var tmp = document.createElement("span");
      tmp.innerHTML = html;
      var frag = document.createDocumentFragment();
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      tn.parentNode.replaceChild(frag, tn);
      changed = true;
    });
    if (changed) {
      el.setAttribute("data-dd-static-key", key);
      if (handled) handled.add(el);
    }
  }

  // ---- Appstle widget: one-time row ------------------------------------
  // The widget's one-time row price element, verified in the live widget
  // template on the product page:
  //   <span class="appstle_lowercase appstle_sellingPlan_price
  //         appstle_onetime_amount">{{{oneTimePuchaseAmount}}}</span>
  // with an optional struck compare sibling
  //   <span class="... appstle_onetime_amount_compare">…</span>
  // (in one widget variant the compare span is nested INSIDE the amount
  // span instead). The Subscribe row uses .appstle_price_block and is
  // never matched here. Only this row is rewritten, to the same layout as
  // the Subscribe row: sale price, struck original, badge. Appstle's own
  // compare span is hidden while ours is shown (it comes back if the
  // discount is cleared), so the row never shows two struck prices.
  function isOneTimeWidgetPrice(el) {
    if (el.classList && el.classList.contains("appstle_onetime_amount")) {
      return true;
    }
    var wrap = el.closest
      ? el.closest(".appstle_input_wrapper, label")
      : null;
    if (!wrap) return false;
    var radio = wrap.querySelector
      ? wrap.querySelector('input[name="selling_plan"][value=""]')
      : null;
    return !!radio;
  }

  function setOneTimeCompareHidden(el, hidden) {
    var container =
      (el.closest &&
        (el.closest(".appstle_one_time_details_wrapper") ||
          el.closest("label") ||
          el.closest(".appstle_input_wrapper"))) ||
      el.parentNode;
    if (!container || !container.querySelectorAll) return;
    // Mustache template compare span + WIDGET_TYPE_2 compare span
    // (.appstle_subscription_amount_compare_at_price). Both are hidden
    // while our rewrite is active so the theme/Appstle struck price
    // never duplicates the one our markup already shows.
    container
      .querySelectorAll(
        ".appstle_onetime_amount_compare, .appstle_subscription_amount_compare_at_price",
      )
      .forEach(function (cmp) {
        cmp.style.display = hidden ? "none" : "";
      });
  }

  // Screen-reader text beside the visible one-time price. WIDGET_TYPE_2
  // renders an sr-only amount + compare span next to the visible price;
  // keep them in sync with the visible rewrite so the row's accessible
  // text matches what sighted users see (and so a page-text read shows
  // "Sale price $50.97", not the stale "Regular price $59.97").
  // No-op when the sr-only spans do not exist (Mustache template).
  function setWidgetSrText(el, s, o, restore) {
    var parent = el.parentNode;
    if (!parent || !parent.querySelector) return;
    var amount = parent.querySelector(
      ".appstle_subscription_amount-appstle-sr-only",
    );
    var compare = parent.querySelector(
      ".appstle_subscription_amount_compare_at_price-appstle-sr-only",
    );
    if (restore) {
      if (amount && el._ddWidgetSrAmountOriginal !== undefined) {
        amount.textContent = el._ddWidgetSrAmountOriginal;
        delete el._ddWidgetSrAmountOriginal;
      }
      if (compare && el._ddWidgetSrCompareOriginal !== undefined) {
        compare.textContent = el._ddWidgetSrCompareOriginal;
        delete el._ddWidgetSrCompareOriginal;
      }
      return;
    }
    if (amount) {
      if (el._ddWidgetSrAmountOriginal === undefined) {
        el._ddWidgetSrAmountOriginal = amount.textContent;
      }
      amount.textContent = "Sale price " + money(s);
    }
    if (compare) {
      if (el._ddWidgetSrCompareOriginal === undefined) {
        el._ddWidgetSrCompareOriginal = compare.textContent;
      }
      compare.textContent = "Regular price " + money(o);
    }
  }

  // Hide/restore the theme's own struck compare-at (<s class="was">)
  // inside a buy-box price line while the app's rewrite is active.
  // Enzymes, Probiotics 2 and Taste 2 render their own <s class="was">
  // in the price line; the app's .price-line .now rewrite adds a second
  // struck original, so the line read "$47.98 $59.97 Save 20% $59.97".
  // Hiding the theme's while ours is active leaves exactly one struck
  // price; restoring it when the rewrite is removed keeps the theme's
  // fallback when the app is off. Gut First, Gut Health 2, Caffeine
  // Free, Mom Story and Routine have no .price-line, so this is a no-op
  // there.
  function setPriceLineWasHidden(line, hidden) {
    if (!line || !line.querySelectorAll) return;
    line.querySelectorAll("s.was").forEach(function (was) {
      was.style.display = hidden ? "none" : "";
    });
  }

  function applyWidgetOneTime(el, o, s, cfg, handled) {
    if (s >= o) {
      if (el._ddWidgetOriginal !== undefined) {
        el.innerHTML = el._ddWidgetOriginal;
        delete el._ddWidgetOriginal;
      }
      el.removeAttribute("data-dd-widget-key");
      setOneTimeCompareHidden(el, false);
      setWidgetSrText(el, s, o, true);
      return;
    }
    // The widget one-time row's badge is Appstle's own bundle-discount
    // pill on the left (matching Subscribe's single left pill), so the
    // app's price rewrite NEVER adds its own badge here — sale + struck
    // original only. (v11 added the badge only when Appstle's pill was
    // empty, but Appstle fills its pill after the app runs and the live
    // re-render does not reliably drop the app badge, leaving two
    // badges. Never adding the badge removes the race entirely.)
    var effCfg = {
      originalFirst: cfg.originalFirst,
      showBadge: false,
      saleColor: cfg.saleColor,
      badgeBg: cfg.badgeBg,
      badgeColor: cfg.badgeColor,
      badgeStyle: cfg.badgeStyle,
      badgeSize: cfg.badgeSize,
    };
    var key = o + "|" + s + "|" + cfgSignature(effCfg);
    // Appstle re-renders this span's text on variant change, which wipes
    // our spans but leaves the key attribute — require our markup too.
    if (
      el.getAttribute("data-dd-widget-key") === key &&
      el.querySelector(".dd-sale")
    ) {
      setOneTimeCompareHidden(el, true);
      setWidgetSrText(el, s, o, false);
      if (handled) handled.add(el);
      return;
    }
    if (el._ddWidgetOriginal === undefined) el._ddWidgetOriginal = el.innerHTML;
    el.innerHTML = priceInnerHtml(o, s, effCfg);
    el.setAttribute("data-dd-widget-key", key);
    setOneTimeCompareHidden(el, true);
    setWidgetSrText(el, s, o, false);
    if (handled) handled.add(el);
  }

  function updateWidgetOneTime(prices, handled) {
    if (!prices) return;
    var cfg = slotCfg("widgetOneTime");
    var selector = selectorList(slotSelectors("widgetOneTime"), null);
    if (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        if (!isOneTimeWidgetPrice(el)) return;
        applyWidgetOneTime(el, prices.o, prices.s, cfg, handled);
      });
    }
    // Structural fallback: Appstle renders the one-time row differently
    // across widget types, so the price span may not carry the
    // configured .appstle_onetime_amount class at all — the selector
    // above then finds nothing and the row is never rewritten. Find the
    // one-time row by its radio (selling_plan value="") and rewrite the
    // price span inside it. Only the one-time row is ever matched (the
    // Subscribe row's radio carries a plan id, never ""), and only a span
    // currently showing the one-time original/sale price is rewritten.
    // Widget types:
    //   - Mustache template (WIDGET_TYPE_3/4/5/6): the radio sits inside
    //     .appstle_input_wrapper / a label, and the price is
    //     span.appstle_sellingPlan_price.
    //   - Programmatic widget (WIDGET_TYPE_2, the live store's type):
    //     the radio is a direct child of
    //     .appstle_one_time_details_wrapper (the label is a SIBLING, not
    //     a parent, and there is no .appstle_input_wrapper), and the
    //     visible price is span.appstle_subscription_amount.transcy-money.
    //     The v9 fallback used only the Mustache path, so on
    //     WIDGET_TYPE_2 closest() returned null and nothing was ever
    //     rewritten — that is why the row price never changed even though
    //     the badge (Appstle's own bundle-discount slot) sometimes
    //     appeared. The selector path and this path can both find the
    //     same span; applyWidgetOneTime's key + .dd-sale guard makes the
    //     second call a no-op, so nothing is ever rewritten twice.
    document
      .querySelectorAll('input[name="selling_plan"][value=""]')
      .forEach(function (radio) {
        var wrap = radio.closest
          ? radio.closest(
              ".appstle_one_time_details_wrapper, .appstle_input_wrapper, .appstle_subscription_wrapper_option, label",
            )
          : null;
        if (!wrap || !wrap.querySelectorAll) return;
        wrap
          .querySelectorAll(
            "span.appstle_subscription_amount, span.appstle_sellingPlan_price",
          )
          .forEach(function (el) {
            if (
              el.classList &&
              (el.classList.contains("appstle_onetime_amount_compare") ||
                el.classList.contains("appstle_price_block") ||
                el.classList.contains(
                  "appstle_subscription_amount_compare_at_price",
                ) ||
                el.classList.contains(
                  "appstle_subscription_amount_compare_at_price-appstle-sr-only",
                ) ||
                el.classList.contains(
                  "appstle_subscription_amount-appstle-sr-only",
                ) ||
                el.classList.contains("sr-only"))
            ) {
              return;
            }
            if (!looksOneTime(el, prices.o, prices.s)) return;
            applyWidgetOneTime(el, prices.o, prices.s, cfg, handled);
          });
      });
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

  function maybeApply(el, prices, cfg, handled) {
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
    apply(el, o, s, cfg, handled);
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

  // Rewrite only the % number inside a theme badge (the starburst, or a
  // "Save 24% + Free Shipping" pill). The badge shape, text and position
  // are never changed — just the number.
  function setPctInElements(selector, pct) {
    if (!(pct > 0) || !selector) return;
    document.querySelectorAll(selector).forEach(function (el) {
      var target = el.querySelector("span") || el;
      var html = target.innerHTML;
      if (!/(\d+(?:\.\d+)?)%/.test(html)) return;
      var next = html.replace(/(\d+(?:\.\d+)?)%/, pct + "%");
      if (next !== html) target.innerHTML = next;
    });
  }

  // Landing-page badges follow the selected purchase mode, using the
  // dynamic % from the synced metafield (never a hardcoded number):
  //  - the starburst and the CTA "Save %" pills show the SELECTED mode's
  //    % (one-time % when One-time is picked, subscribe % when Subscribe
  //    & Save is picked);
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
    if (burstPct) {
      if (slotCfg("burst").showBadge) {
        setPctInElements(
          selectorList(slotSelectors("burst"), ".burst"),
          burstPct,
        );
      }
      if (slotCfg("ctaPill").showBadge) {
        setPctInElements(
          selectorList(slotSelectors("ctaPill"), null),
          burstPct,
        );
      }
    }
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

  // Global catch-all: resolve the price for an element no specific slot
  // claimed, the same way the specific slots do (card link, product form,
  // then landing prices). Specific slots always win — run() passes the
  // set of elements they already rewrote.
  function maybeApplyGlobal(el, cfg, handled) {
    if (handled.has(el)) return;
    var a = cardLinkFor(el);
    if (a) {
      var h = handleFromUrl(a.getAttribute("href"));
      if (h && P[h]) {
        var variantId = variantIdFromUrl(a.href);
        var cardPrices = variantId
          ? priceFor(P[h], variantId)
          : P[h].card || null;
        if (cardPrices) {
          maybeApply(el, cardPrices, cfg, handled);
          return;
        }
      }
    }
    var pageHandle = handleFromUrl(location.pathname);
    if (pageHandle && P[pageHandle]) {
      var entry = P[pageHandle];
      var pf = productFormFor(entry);
      if (pf) {
        var idInput = pf.form.querySelector('[name="id"]');
        var vid =
          (idInput && idInput.value) || variantIdFromUrl(location.href);
        var prices = priceFor(entry, vid);
        if (prices) {
          maybeApply(el, prices, cfg, handled);
          return;
        }
      }
    }
    if (S.showOnLandingPages) {
      var lp = landingPrices();
      if (lp) maybeApply(el, lp, cfg, handled);
    }
  }

  function run() {
    injectCustomCss();
    updateLandingBadges();

    // Elements a specific slot already rewrote this run — the global
    // catch-all below skips them, so no price is ever rewritten twice.
    var handled = new Set();

    // Landing pages (buy boxes, static CTA text, price line).
    if (S.showOnLandingPages) {
      var lp = landingPrices();
      var landingSelector = selectorList(slotSelectors("landing"), null);
      if (landingSelector && lp) {
        var landingCfg = slotCfg("landing");
        document.querySelectorAll(landingSelector).forEach(function (el) {
          // The buy-box price line (.price-line .now) is a single shared
          // display, not a per-row price: it follows the SELECTED mode.
          // One-time selected shows the one-time sale; Subscribe selected
          // shows the subscribe sale (struck original + its badge, the
          // same layout as the row). Per-row prices below keep the
          // one-time-only rule — a subscribe row's price is never touched.
          var line = el.closest ? el.closest(".price-line") : null;
          var isPriceLine =
            line && el.classList && el.classList.contains("now");
          if (isPriceLine) {
            var lineMode = landingSelectedMode();
            var lineSale =
              lineMode === "subscribe" && lp.sp != null ? lp.sp : lp.s;
            apply(el, lp.o, lineSale, landingCfg, handled);
            if (el.querySelector(".dd-wrap")) {
              line.setAttribute(
                "aria-label",
                "Price: " + money(lineSale) + ", was " + money(lp.o),
              );
              // Hide the theme's own <s class="was"> while our rewrite
              // is active (Enzymes / Probiotics 2 / Taste 2 render one
              // in this line, which otherwise duplicates our struck
              // price). Restored below when the rewrite is removed.
              setPriceLineWasHidden(line, true);
            } else {
              setPriceLineWasHidden(line, false);
            }
            return;
          }
          maybeApply(el, lp, landingCfg, handled);
        });
      }
      var ctaSelector = selectorList(slotSelectors("cta"), null);
      if (ctaSelector) {
        var ctaCfg = slotCfg("cta");
        document.querySelectorAll(ctaSelector).forEach(function (el) {
          applyStaticText(el, lp, ctaCfg, handled);
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
        var productSelector = selectorList(slotSelectors("product"), ".price");
        if (productSelector && prices) {
          var mode = productPageMode();
          var productCfg = slotCfg("product");
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
              maybeApply(el, prices, productCfg, handled);
            });
        }
        // Appstle widget one-time row — rewritten whatever mode is
        // selected, because the row always shows the one-time price.
        if (prices) updateWidgetOneTime(prices, handled);
      }
    }

    // Product cards
    if (S.showOnCards) {
      var cardSelector = selectorList(slotSelectors("card"), ".price");
      // This theme's /collections/all grid is a custom section whose price
      // is .bt-collection-grid__price, not .price — include it alongside
      // the merchant-configured selectors so those cards get the discount
      // too (their links carry no ?variant=, so the card-level price
      // fallback in the loop below applies).
      if (cardSelector) {
        cardSelector += ", .bt-collection-grid__price";
      }
      if (cardSelector) {
        var cardCfg = slotCfg("card");
        document.querySelectorAll(cardSelector).forEach(function (el) {
          var a = cardLinkFor(el);
          if (!a) return;
          var h = handleFromUrl(a.getAttribute("href"));
          if (!h || !P[h]) return;

          var variantId = variantIdFromUrl(a.href);
          var cardPrices = variantId
            ? priceFor(P[h], variantId)
            : P[h].card || null;
          if (cardPrices) maybeApply(el, cardPrices, cardCfg, handled);
        });
      }
    }

    // Global catch-all — only elements no specific slot claimed.
    var globalSelector = selectorList(slotSelectors("global"), null);
    if (globalSelector) {
      var globalCfg = slotCfg("global");
      document.querySelectorAll(globalSelector).forEach(function (el) {
        maybeApplyGlobal(el, globalCfg, handled);
      });
    }
  }

  var timers = [];
  function safeRun() {
    try {
      run();
    } catch (e) {}
  }
  function later() {
    timers.forEach(clearTimeout);
    timers = [];
    // Theme JS (and Appstle's sellingPlanChanged burst) often rewrites the
    // price after our first pass — retry a few times, longer than the burst.
    [50, 150, 350, 700, 1200, 2000].forEach(function (ms) {
      timers.push(setTimeout(safeRun, ms));
    });
  }

  // Observer + listeners FIRST: they must stay active even if a run()
  // throws. Previously a throw in run() skipped this setup entirely, so
  // a widget rendered later by Appstle was never caught.
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

  safeRun();
})();
