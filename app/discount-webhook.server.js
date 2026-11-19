import { authenticate, unauthenticated } from "./shopify.server";
import { loadSettings, syncDiscounts } from "./discount-sync.server";

// Shared handler for discounts/create, discounts/update and
// discounts/delete. Re-syncs the merchant's SELECTED discount so the
// storefront follows admin without anyone opening the app. Always answers
// 200: a failed sync must not make Shopify retry the webhook into a loop.
export async function handleDiscountWebhook(request) {
  const {
    admin: webhookAdmin,
    topic,
    shop,
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  let admin = webhookAdmin;
  if (!admin) {
    try {
      admin = (await unauthenticated.admin(shop)).admin;
    } catch {
      console.log(`No admin context for ${shop}, skipping discount sync.`);
      return new Response();
    }
  }

  try {
    const settings = await loadSettings(admin);
    if (!settings.enabled) return new Response();
    const result = await syncDiscounts(admin, settings);
    console.log(
      `Discount sync after ${topic} for ${shop}: ${result.count} product(s)` +
        (result.cleared ? " (sale prices cleared)" : ""),
    );
  } catch (error) {
    console.error(`Discount sync failed after ${topic} for ${shop}:`, error);
  }
  return new Response();
}
