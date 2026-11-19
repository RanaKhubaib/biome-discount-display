import assert from "node:assert/strict";
import { test } from "node:test";
import { syncDiscounts } from "./discount-sync.server.js";

const productId = "gid://shopify/Product/1";
const discountNodeId = "gid://shopify/DiscountAutomaticNode/1";
const codeDiscountNodeId = "gid://shopify/DiscountCodeNode/2";
const planGroupId = "gid://shopify/SellingPlanGroup/3389751513";

function makeAdmin({
  items,
  variants,
  discountStatus = "ACTIVE",
  nodeId = discountNodeId,
  nodeField = "automaticDiscount",
  // Selling-plan group read: planPct is the "Every Month" % (whole number,
  // e.g. 20 = 20% off). planError simulates the group read failing.
  planPct = 20,
  planProductIds = [productId],
  planError = false,
}) {
  let savedPrices;

  return {
    getSavedPrices: () => savedPrices,
    async graphql(query, options) {
      let data;
      if (query.includes("SellingPlanGroup")) {
        if (planError) {
          throw new Error("Shopify could not load the selling plan group.");
        }
        data = {
          node: {
            id: planGroupId,
            products: { nodes: planProductIds.map((id) => ({ id })) },
            sellingPlans: {
              nodes: [
                {
                  id: "gid://shopify/SellingPlan/6152224985",
                  name: "Every Month",
                  pricingPolicies: [
                    {
                      __typename: "SellingPlanFixedPricingPolicy",
                      adjustmentType: "PERCENTAGE",
                      adjustmentValue: { percentage: planPct },
                    },
                  ],
                },
              ],
            },
          },
        };
      } else if (query.includes("node(id: $id)")) {
        data = {
          node: {
            id: nodeId,
            [nodeField]: {
              status: discountStatus,
              title: "Test discount",
              customerGets: {
                value: { percentage: 0.1 },
                items,
              },
            },
          },
        };
      } else if (query.includes("nodes(ids: $ids)")) {
        data = {
          nodes: [{ id: productId, handle: "sample-product", variants }],
        };
      } else if (query.includes("metafieldsSet(metafields:")) {
        data = { metafieldsSet: { userErrors: [] } };
        savedPrices = JSON.parse(options.variables.m[0].value);
      } else if (query.includes("shop {")) {
        data = { shop: { id: "gid://shopify/Shop/1" } };
      } else {
        throw new Error(`Unexpected GraphQL query: ${query}`);
      }

      return { json: async () => ({ data }) };
    },
  };
}

const settings = {
  discountId: discountNodeId,
  sellingPlanGroupId: planGroupId,
};

test("sync preserves undiscounted variant prices without making an unsafe card price", async () => {
  const admin = makeAdmin({
    items: {
      products: { nodes: [] },
      productVariants: {
        nodes: [
          {
            id: "gid://shopify/ProductVariant/101",
            product: { id: productId },
          },
        ],
      },
    },
    variants: {
      nodes: [
        { id: "gid://shopify/ProductVariant/101", price: "100.00" },
        { id: "gid://shopify/ProductVariant/102", price: "50.00" },
      ],
    },
  });

  await syncDiscounts(admin, settings);

  const entry = admin.getSavedPrices()["sample-product"];
  // One-time 10% off; subscribe 20% off from the plan (whole-number %).
  assert.deepEqual(entry.variants["101"], {
    o: 100,
    s: 90,
    op: 10,
    sp: 80,
    spp: 20,
  });
  // Variant 102 has no one-time sale, but it is subscribable, so it still
  // carries a subscribe price.
  assert.deepEqual(entry.variants["102"], { o: 50, s: 50, sp: 40, spp: 20 });
  assert.equal("card" in entry, false);
});

test("sync sets the card price from a real variant when every variant is discounted", async () => {
  const admin = makeAdmin({
    items: {
      products: { nodes: [{ id: productId }] },
      productVariants: { nodes: [] },
    },
    variants: {
      nodes: [
        { id: "gid://shopify/ProductVariant/101", price: "100.00" },
        { id: "gid://shopify/ProductVariant/102", price: "50.00" },
      ],
    },
  });

  await syncDiscounts(admin, settings);

  const entry = admin.getSavedPrices()["sample-product"];
  assert.deepEqual(entry.card, { o: 50, s: 45, op: 10, sp: 40, spp: 20 });
});

test("sync clears prices when no discount is selected", async () => {
  const admin = makeAdmin({
    items: {
      products: { nodes: [{ id: productId }] },
      productVariants: { nodes: [] },
    },
    variants: {
      nodes: [{ id: "gid://shopify/ProductVariant/101", price: "100.00" }],
    },
  });

  const result = await syncDiscounts(admin, { discountId: null });

  assert.equal(result.count, 0);
  assert.equal(result.cleared, true);
  assert.deepEqual(admin.getSavedPrices(), {});
});

test("sync clears prices when the selected discount is not active", async () => {
  const admin = makeAdmin({
    items: {
      products: { nodes: [{ id: productId }] },
      productVariants: { nodes: [] },
    },
    variants: {
      nodes: [{ id: "gid://shopify/ProductVariant/101", price: "100.00" }],
    },
    discountStatus: "SCHEDULED",
  });

  const result = await syncDiscounts(admin, settings);

  assert.equal(result.count, 0);
  assert.equal(result.cleared, true);
  assert.equal(result.inactive, true);
  assert.deepEqual(admin.getSavedPrices(), {});
});

test("sync applies a selected code discount via its codeDiscount field", async () => {
  const admin = makeAdmin({
    items: {
      products: { nodes: [{ id: productId }] },
      productVariants: { nodes: [] },
    },
    variants: {
      nodes: [{ id: "gid://shopify/ProductVariant/101", price: "100.00" }],
    },
    nodeId: codeDiscountNodeId,
    nodeField: "codeDiscount",
  });

  const result = await syncDiscounts(admin, {
    discountId: codeDiscountNodeId,
    sellingPlanGroupId: planGroupId,
  });

  assert.equal(result.count, 1);
  const entry = admin.getSavedPrices()["sample-product"];
  assert.deepEqual(entry.variants["101"], {
    o: 100,
    s: 90,
    op: 10,
    sp: 80,
    spp: 20,
  });
});

test("sync reports the subscribe % and its source from the selling plan", async () => {
  const admin = makeAdmin({
    items: {
      products: { nodes: [{ id: productId }] },
      productVariants: { nodes: [] },
    },
    variants: {
      nodes: [{ id: "gid://shopify/ProductVariant/101", price: "100.00" }],
    },
  });

  const result = await syncDiscounts(admin, settings);

  assert.equal(result.count, 1);
  assert.equal(result.subPct, 20);
  assert.equal(result.subPctSource, "plan");
});

test("sync falls back to the manual subscribe % when the plan cannot be read", async () => {
  const admin = makeAdmin(
    {
      items: {
        products: { nodes: [{ id: productId }] },
        productVariants: { nodes: [] },
      },
      variants: {
        nodes: [{ id: "gid://shopify/ProductVariant/101", price: "100.00" }],
      },
      planError: true,
    },
  );

  const result = await syncDiscounts(admin, {
    ...settings,
    subPctFallback: 25,
  });

  assert.equal(result.count, 1);
  assert.equal(result.subPct, 25);
  assert.equal(result.subPctSource, "fallback");
  const entry = admin.getSavedPrices()["sample-product"];
  assert.deepEqual(entry.variants["101"], {
    o: 100,
    s: 90,
    op: 10,
    sp: 75,
    spp: 25,
  });
});

test("sync omits subscribe data when no plan % and no fallback exist", async () => {
  const admin = makeAdmin(
    {
      items: {
        products: { nodes: [{ id: productId }] },
        productVariants: { nodes: [] },
      },
      variants: {
        nodes: [{ id: "gid://shopify/ProductVariant/101", price: "100.00" }],
      },
      planError: true,
    },
  );

  const result = await syncDiscounts(admin, settings);

  assert.equal(result.count, 1);
  assert.equal(result.subPct, null);
  assert.equal(result.subPctSource, null);
  const entry = admin.getSavedPrices()["sample-product"];
  assert.deepEqual(entry.variants["101"], { o: 100, s: 90, op: 10 });
});

test("sync omits subscribe data for products outside the selling-plan group", async () => {
  const admin = makeAdmin({
    items: {
      products: { nodes: [{ id: productId }] },
      productVariants: { nodes: [] },
    },
    variants: {
      nodes: [{ id: "gid://shopify/ProductVariant/101", price: "100.00" }],
    },
    planProductIds: ["gid://shopify/Product/999"],
  });

  const result = await syncDiscounts(admin, settings);

  assert.equal(result.count, 1);
  assert.equal(result.subPct, 20);
  assert.equal(result.subPctSource, "plan");
  const entry = admin.getSavedPrices()["sample-product"];
  assert.deepEqual(entry.variants["101"], { o: 100, s: 90, op: 10 });
});
