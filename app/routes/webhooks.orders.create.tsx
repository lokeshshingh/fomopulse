import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { purgeOldEvents, recordOrder } from "../lib/events.server";
import type { OrderPayload } from "../lib/order-mapper";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);

  try {
    const saved = await recordOrder(shop, payload as OrderPayload, admin ?? null);
    if (saved) console.log(`[fomopulse] ${shop}: stored ${saved} event(s) from order ${(payload as OrderPayload).id}`);
    // Cheap housekeeping: occasionally purge events past the retention window.
    if (Math.random() < 0.02) await purgeOldEvents();
  } catch (err) {
    // Log and still return 200 so Shopify doesn't retry a payload we can't handle.
    console.error(`[fomopulse] failed to record order for ${shop}`, err);
  }
  return new Response();
};
