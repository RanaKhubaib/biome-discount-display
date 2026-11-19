const NS = "discount_display";

const BADGE_STYLES = ["pill", "rounded", "square"];
const BADGE_SIZES = ["small", "medium", "large"];

// One discount, fetched by its node id (DiscountAutomaticNode /
// DiscountCodeNode). The list query below returns these ids for the picker.
const DISCOUNT_NODE_QUERY = `#graphql
query ($id: ID!) {
  node(id: $id) {
    id
    ... on DiscountAutomaticNode {
      automaticDiscount {
        ... on DiscountAutomaticBasic {
          status
          title
          startsAt
          endsAt
          customerGets {
            value {
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } }
            }
            items {
              ... on DiscountProducts {
                products(first: 100) { nodes { id } }
                productVariants(first: 100) { nodes { id product { id } } }
              }
              ... on DiscountCollections {
                collections(first: 100) { nodes { id } }
              }
            }
          }
        }
      }
    }
    ... on DiscountCodeNode {
      codeDiscount {
        ... on DiscountCodeBasic {
          status
          title
          startsAt
          endsAt
          customerGets {
            value {
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } }
            }
            items {
              ... on DiscountProducts {
                products(first: 100) { nodes { id } }
                productVariants(first: 100) { nodes { id product { id } } }
              }
              ... on DiscountCollections {
                collections(first: 100) { nodes { id } }
              }
            }
          }
        }
      }
    }
  }
}`;

const DISCOUNTS_QUERY = `#graphql
query ($after: String) {
  discountNodes(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      __typename
      discount {
        ... on DiscountAutomaticBasic {
          status
          title
          startsAt
          endsAt
          customerGets {
            value {
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } }
            }
          }
        }
        ... on DiscountCodeBasic {
          status
          title
          startsAt
          endsAt
          customerGets {
            value {
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } }
            }
          }
        }
      }
    }
  }
}`;

const COLLECTION_PRODUCTS_QUERY = `#graphql
query ($id: ID!, $cursor: String) {
  collection(id: $id) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id }
    }
  }
}`;

const PRODUCTS_QUERY = `#graphql
query ($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id
      handle
      variants(first: 100) { nodes { id price } }
    }
  }
}`;

// The subscription selling-plan group (Appstle's "Every Month" plan). Read
// to get the live subscribe % — selling plans are read under the
// read_products scope, which this app has. Selling-plan percentages are
// WHOLE numbers (20 = 20%), unlike discount percentages which are
// fractions (0.15 = 15%). The Fixed pricing policy is the first-order
// price; a Recurring policy (if any) is the renewal price and is ignored
// here — the subscribe price shown is always the first-order price.
const SELLING_PLAN_GROUP_QUERY = `#graphql
query ($id: ID!) {
  node(id: $id) {
    id
    ... on SellingPlanGroup {
      products(first: 100) { nodes { id } }
      sellingPlans(first: 50) {
        nodes {
          id
          name
          pricingPolicies {
            __typename
            ... on SellingPlanFixedPricingPolicy {
              adjustmentType
              adjustmentValue {
                ... on SellingPlanPricingPolicyPercentageValue { percentage }
              }
            }
            ... on SellingPlanRecurringPricingPolicy {
              adjustmentType
              adjustmentValue {
                ... on SellingPlanPricingPolicyPercentageValue { percentage }
              }
            }
          }
        }
      }
    }
  }
}`;

const SHOP_QUERY = `#graphql
query {
  shop {
    id
    metafield(namespace: "${NS}", key: "settings") { value }
  }
}`;

const SET_MUTATION = `#graphql
mutation ($m: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $m) {
    userErrors { field message }
  }
}`;

export const DEFAULT_SETTINGS = {
  enabled: false,
  showOnCards: true,
  showOnProductPage: true,
  showOnLandingPages: true,
  saleColor: "#d82c0d",
  cardSelectors: [".price"],
  productSelectors: [".price"],
  // Landing-page buy boxes: the one-time purchase row only. Never add a
  // selector that matches a subscribe price — the app never rewrites those.
  landingSelectors: [
    '.purchase-opt[data-purchase-opt="onetime"] .purchase-price',
  ],
  // The one discount the app shows. Null = no sale prices on the storefront.
  discountId: null,
  discountTitle: "",
  badgeEnabled: true,
  badgeStyle: "pill",
  badgeSize: "medium",
  // Matches the theme's .save-badge (forest green, white text).
  badgeBg: "#42572A",
  badgeColor: "#ffffff",
  // The subscription selling-plan group to read the live subscribe % from
  // (Appstle's group). The subscribe price follows this plan automatically.
  sellingPlanGroupId: "gid://shopify/SellingPlanGroup/3389751513",
  // Manual subscribe % (0-100, e.g. 20 = 20% off). Used ONLY when the
  // selling-plan group cannot be read (scope, deleted group, no percentage).
  // Null = no fallback; subscribe data is then omitted.
  subPctFallback: null,
  // Landing-page starburst badge(s) — the "SAVE 20%" burst on the product
  // image in hero + final sections. The script rewrites only the % number
  // to the selected purchase mode's dynamic %.
  landingBadgeSelectors: [".burst"],
  // Merchant custom CSS, injected as a <style> element on every page where
  // the embed runs. Empty = nothing injected.
  customCss: "",
};

const numId = (gid) => gid.split("/").pop();

function validHex(value, fallback) {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim())
    ? value.trim()
    : fallback;
}

// A subscribe % as a whole number (20 = 20% off). Accepts a number or a
// numeric string; anything else (or 0 / over 100) means "not set".
function parseSubPct(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    value = Number(trimmed);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > 100) return null;
  return Math.round(value * 100) / 100;
}

function validCustomCss(value) {
  if (typeof value !== "string") return "";
  // Cap it so a pasted stylesheet cannot bloat the settings metafield.
  return value.slice(0, 20000);
}

async function readGraphQL(admin, query, variables) {
  const response = variables
    ? await admin.graphql(query, { variables })
    : await admin.graphql(query);
  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }
  if (!json.data)
    throw new Error("Shopify returned no data for a GraphQL request.");
  return json.data;
}

function getSelectors(settings, pluralKey, legacyKey, fallback) {
  const saved = settings[pluralKey];
  const values = Array.isArray(saved) ? saved : [settings[legacyKey]];
  const selectors = values
    .filter((selector) => typeof selector === "string")
    .map((selector) => selector.trim())
    .filter(Boolean);
  return selectors.length ? selectors : fallback;
}

export async function loadSettings(admin) {
  const data = await readGraphQL(admin, SHOP_QUERY);
  const raw = data.shop.metafield?.value;
  const saved = raw ? JSON.parse(raw) : {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    discountId:
      typeof saved.discountId === "string" && saved.discountId.trim()
        ? saved.discountId.trim()
        : null,
    discountTitle:
      typeof saved.discountTitle === "string" ? saved.discountTitle : "",
    badgeEnabled: saved.badgeEnabled !== false,
    badgeStyle: BADGE_STYLES.includes(saved.badgeStyle)
      ? saved.badgeStyle
      : DEFAULT_SETTINGS.badgeStyle,
    badgeSize: BADGE_SIZES.includes(saved.badgeSize)
      ? saved.badgeSize
      : DEFAULT_SETTINGS.badgeSize,
    badgeBg: validHex(saved.badgeBg, DEFAULT_SETTINGS.badgeBg),
    badgeColor: validHex(saved.badgeColor, DEFAULT_SETTINGS.badgeColor),
    saleColor: validHex(saved.saleColor, DEFAULT_SETTINGS.saleColor),
    showOnLandingPages: saved.showOnLandingPages !== false,
    cardSelectors: getSelectors(
      saved,
      "cardSelectors",
      "cardSelector",
      DEFAULT_SETTINGS.cardSelectors,
    ),
    productSelectors: getSelectors(
      saved,
      "productSelectors",
      "productSelector",
      DEFAULT_SETTINGS.productSelectors,
    ),
    landingSelectors: getSelectors(
      saved,
      "landingSelectors",
      null,
      DEFAULT_SETTINGS.landingSelectors,
    ),
    sellingPlanGroupId:
      typeof saved.sellingPlanGroupId === "string" &&
      saved.sellingPlanGroupId.trim()
        ? saved.sellingPlanGroupId.trim()
        : DEFAULT_SETTINGS.sellingPlanGroupId,
    subPctFallback: parseSubPct(saved.subPctFallback),
    landingBadgeSelectors: getSelectors(
      saved,
      "landingBadgeSelectors",
      null,
      DEFAULT_SETTINGS.landingBadgeSelectors,
    ),
    customCss: validCustomCss(saved.customCss),
  };
}

export async function saveSettings(admin, settings) {
  const data = await readGraphQL(admin, SHOP_QUERY);
  const result = await readGraphQL(admin, SET_MUTATION, {
    m: [
      {
        ownerId: data.shop.id,
        namespace: NS,
        key: "settings",
        type: "json",
        value: JSON.stringify(settings),
      },
    ],
  });
  const errors = result.metafieldsSet?.userErrors || [];
  if (errors.length)
    throw new Error(errors.map((error) => error.message).join(", "));
  if (!result.metafieldsSet)
    throw new Error("Shopify did not save the discount settings.");
}

function discountSummary(value) {
  if (!value) return "";
  if (value.percentage !== undefined)
    return `${Math.round(value.percentage * 100)}% off`;
  if (value.amount)
    return `${value.amount.amount} ${value.amount.currencyCode || ""} off`.trim();
  return "";
}

// The discounts a merchant can pick from, for the settings-page picker.
// Every discount in admin is listed (active first); the sync only ever
// applies the one the merchant selected.
export async function listDiscounts(admin) {
  const out = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const data = await readGraphQL(admin, DISCOUNTS_QUERY, { after: cursor });
    const connection = data.discountNodes;
    if (!connection) throw new Error("Shopify did not return discount data.");

    for (const node of connection.nodes) {
      const discount = node.discount;
      if (!discount) continue;
      out.push({
        id: node.id,
        title: discount.title || "(untitled discount)",
        type:
          node.__typename === "DiscountCodeNode" ? "code" : "automatic",
        status: discount.status,
        startsAt: discount.startsAt || null,
        endsAt: discount.endsAt || null,
        summary: discountSummary(discount.customerGets?.value),
      });
    }

    hasMore = connection.pageInfo.hasNextPage;
    if (hasMore) {
      cursor = connection.pageInfo.endCursor;
      if (!cursor) {
        throw new Error("Shopify returned no cursor for additional discounts.");
      }
    }
  }

  // Active discounts first, then the rest, each group by title.
  const rank = (d) => (d.status === "ACTIVE" ? 0 : 1);
  return out.sort(
    (a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title),
  );
}

function applyValue(price, value) {
  if (value.percentage !== undefined) return price * (1 - value.percentage);
  if (value.amount) return Math.max(0, price - parseFloat(value.amount.amount));
  return price;
}

async function productsInCollection(admin, collectionId, maxProducts = 500) {
  const ids = [];
  let cursor = null;
  while (ids.length < maxProducts) {
    const data = await readGraphQL(admin, COLLECTION_PRODUCTS_QUERY, {
      id: collectionId,
      cursor,
    });
    const connection = data.collection?.products;
    if (!connection) {
      throw new Error(
        `Shopify could not load products for collection ${collectionId}.`,
      );
    }
    for (const p of connection.nodes) {
      if (p?.id) ids.push(p.id);
      if (ids.length >= maxProducts) break;
    }
    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
    if (!cursor)
      throw new Error(
        `Shopify returned no product cursor for collection ${collectionId}.`,
      );
  }
  return ids;
}

// Turns one discount's customerGets into a pricing rule. Returns null when
// the discount has no usable value or applies to nothing.
async function extractRule(admin, discount, collectionCache) {
  if (!discount || !discount.customerGets) return null;
  const value = discount.customerGets.value;
  if (!value || (value.percentage === undefined && !value.amount)) return null;

  const items = discount.customerGets.items;
  if (!items) return null;

  const productIds = [];
  const variantIds = [];
  const variantProductIds = [];

  if (items.products) {
    for (const product of items.products.nodes || []) {
      if (product?.id) productIds.push(product.id);
    }
    for (const variant of items.productVariants.nodes || []) {
      if (!variant?.id) continue;
      variantIds.push(variant.id);
      if (variant.product?.id) variantProductIds.push(variant.product.id);
    }
  }

  if (items.collections) {
    for (const collection of items.collections.nodes || []) {
      if (!collection?.id) continue;
      let ids = collectionCache.get(collection.id);
      if (!ids) {
        ids = await productsInCollection(admin, collection.id);
        collectionCache.set(collection.id, ids);
      }
      productIds.push(...ids);
    }
  }

  if (!productIds.length && !variantIds.length) return null;
  return { value, productIds, variantIds, variantProductIds };
}

// Reads the live subscribe % for the storefront. Prefers the selling-plan
// group's "Every Month" plan (first Fixed pricing policy with a percentage);
// falls back to the merchant's manual subscribe % setting; returns null
// when neither is available. Also returns the product ids the group is
// attached to, so subscribe prices are only computed for products that are
// actually subscribable. A failed group read never throws — it degrades to
// the fallback (or to no subscribe data), so a plan problem cannot break
// the one-time sync.
async function resolveSubPct(admin, settings) {
  const groupId =
    typeof settings.sellingPlanGroupId === "string" &&
    settings.sellingPlanGroupId.trim()
      ? settings.sellingPlanGroupId.trim()
      : DEFAULT_SETTINGS.sellingPlanGroupId;
  if (groupId) {
    try {
      const data = await readGraphQL(admin, SELLING_PLAN_GROUP_QUERY, {
        id: groupId,
      });
      const group = data.node;
      const plans = group?.sellingPlans?.nodes || [];
      const plan =
        plans.find((p) => /every month/i.test(p.name || "")) || plans[0];
      if (plan) {
        const policies = plan.pricingPolicies || [];
        // Prefer the Fixed policy (first-order price); any percentage
        // policy is a fallback within the plan.
        const ordered = [
          ...policies.filter(
            (p) => p.__typename === "SellingPlanFixedPricingPolicy",
          ),
          ...policies.filter(
            (p) => p.__typename !== "SellingPlanFixedPricingPolicy",
          ),
        ];
        for (const policy of ordered) {
          if (
            policy.adjustmentType === "PERCENTAGE" &&
            typeof policy.adjustmentValue?.percentage === "number"
          ) {
            const pct = parseSubPct(policy.adjustmentValue.percentage);
            if (pct !== null) {
              const productIds = (group.products?.nodes || [])
                .map((p) => p?.id)
                .filter(Boolean);
              return { pct, source: "plan", productIds };
            }
          }
        }
      }
    } catch (error) {
      // Fall through to the manual fallback below.
    }
  }
  const fallback = parseSubPct(settings.subPctFallback);
  if (fallback !== null) return { pct: fallback, source: "fallback", productIds: null };
  return { pct: null, source: null, productIds: null };
}

// One variant's storefront prices. o/s are the one-time original/sale
// (kept for backwards compatibility); op is the one-time % off; sp/spp
// are the subscribe sale price / subscribe % off, added only when a
// subscribe % is known AND the product is subscribable.
function variantRecord(orig, sale, subPct, subscribable) {
  const record = { o: orig, s: sale };
  if (sale < orig) record.op = Math.round((1 - sale / orig) * 100);
  if (subPct && subscribable) {
    record.sp = Math.round(orig * (1 - subPct / 100) * 100) / 100;
    record.spp = subPct;
  }
  return record;
}

async function savePrices(admin, out) {
  const shopData = await readGraphQL(admin, SHOP_QUERY);
  const saveResult = await readGraphQL(admin, SET_MUTATION, {
    m: [
      {
        ownerId: shopData.shop.id,
        namespace: NS,
        key: "prices",
        type: "json",
        value: JSON.stringify(out),
      },
    ],
  });
  const errors = saveResult.metafieldsSet?.userErrors || [];
  if (errors.length) throw new Error(errors.map((e) => e.message).join(", "));
  if (!saveResult.metafieldsSet)
    throw new Error("Shopify did not save the synced prices.");
}

// Syncs ONLY the discount the merchant selected in settings. With no
// selection, or when the selected discount is gone or not active, the
// storefront prices are cleared so no stale sale shows.
export async function syncDiscounts(admin, settings = {}) {
  const discountId =
    typeof settings.discountId === "string" ? settings.discountId.trim() : "";

  if (!discountId) {
    await savePrices(admin, {});
    return { count: 0, cleared: true };
  }

  const data = await readGraphQL(admin, DISCOUNT_NODE_QUERY, { id: discountId });
  const node = data.node;
  // DiscountAutomaticNode / DiscountCodeNode have NO `discount` field —
  // the discount lives under `automaticDiscount` / `codeDiscount`. (The
  // picker is different: discountNodes returns DiscountNode objects, which
  // DO have a `discount` field — that's why the picker worked while the
  // sync failed with "Field 'discount' doesn't exist on type
  // 'DiscountAutomaticNode'" in Admin API 2026-10.)
  const discount = node?.automaticDiscount || node?.codeDiscount;
  if (!node || !discount) {
    await savePrices(admin, {});
    return { count: 0, cleared: true, notFound: true };
  }
  if (discount.status !== "ACTIVE") {
    await savePrices(admin, {});
    return {
      count: 0,
      cleared: true,
      inactive: true,
      discountTitle: discount.title || "",
    };
  }

  const rule = await extractRule(admin, discount, new Map());
  if (!rule) {
    await savePrices(admin, {});
    return {
      count: 0,
      cleared: true,
      discountTitle: discount.title || "",
    };
  }

  // Collect all product ids the rule touches.
  const allIds = new Set();
  rule.productIds.forEach((id) => allIds.add(id));
  rule.variantProductIds.forEach((id) => allIds.add(id));
  const ids = [...allIds];

  // Load product prices (50 at a time).
  const products = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = await readGraphQL(admin, PRODUCTS_QUERY, {
      ids: ids.slice(i, i + 50),
    });
    chunk.nodes.forEach((product) => product && products.push(product));
  }

  // Calculate sale prices from the selected discount only.
  // The subscribe % is resolved once per sync (plan first, manual fallback).
  const sub = await resolveSubPct(admin, settings);

  const out = {};
  for (const p of products) {
    // Subscribe prices only for products the selling-plan group covers.
    // When the plan could not be read (fallback %), apply to every
    // discounted product — the merchant set the % knowing the catalogue.
    const subscribable =
      sub.productIds !== null ? sub.productIds.includes(p.id) : true;
    const variants = {};
    let discountedVariantCount = 0;
    for (const v of p.variants.nodes) {
      const orig = parseFloat(v.price);
      const applies =
        rule.productIds.includes(p.id) || rule.variantIds.includes(v.id);
      const sale = applies
        ? Math.round(applyValue(orig, rule.value) * 100) / 100
        : orig;
      const finalSale = sale < orig ? sale : orig;
      if (finalSale < orig) discountedVariantCount++;
      variants[numId(v.id)] = variantRecord(
        orig,
        finalSale,
        sub.pct,
        subscribable,
      );
    }
    const list = Object.values(variants);
    if (discountedVariantCount === 0) continue;
    const discounted = list.filter((variant) => variant.s < variant.o);
    const lowest = discounted.reduce((a, b) => (b.s < a.s ? b : a));
    // Entry and card carry the lowest variant's prices (one-time + subscribe).
    const entry = { variants, ...lowest };
    if (discountedVariantCount === list.length) {
      entry.card = { ...lowest };
    }
    out[p.handle] = entry;
  }

  await savePrices(admin, out);
  return {
    count: Object.keys(out).length,
    discountTitle: discount.title || "",
    subPct: sub.pct,
    subPctSource: sub.source,
  };
}
