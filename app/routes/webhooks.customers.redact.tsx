import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteEventsForOrders } from "../lib/events.server";

/** GDPR: erase events for the customer's orders. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const orderIds = ((payload as { orders_to_redact?: Array<number | string> }).orders_to_redact ?? []);
  const count = await deleteEventsForOrders(shop, orderIds);
  console.log(`[fomopulse] customers/redact for ${shop}: deleted ${count} event(s)`);
  return new Response();
};
