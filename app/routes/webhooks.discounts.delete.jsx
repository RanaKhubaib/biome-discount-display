import { handleDiscountWebhook } from "../discount-webhook.server";

export const action = async ({ request }) => handleDiscountWebhook(request);
