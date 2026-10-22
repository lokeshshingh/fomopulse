import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteShopData } from "../lib/events.server";

/** GDPR: shop erased 48h after uninstall - delete everything. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  await deleteShopData(shop);
  console.log(`[fomopulse] shop/redact: deleted all data for ${shop}`);
  return new Response();
};
