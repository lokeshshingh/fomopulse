import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * GDPR: customer data request.
 * FomoPulse stores no customer identifiers (no email, no customer ID) - only an
 * anonymised first name + city per order. Nothing to export, so we acknowledge.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[fomopulse] ${topic} for ${shop}: no customer-identifiable data stored`);
  return new Response();
};
