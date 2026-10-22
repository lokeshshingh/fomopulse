import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildFeed } from "../lib/feed";
import { getRecentEvents } from "../lib/events.server";
import { getSettings } from "../lib/settings.server";

/**
 * Public storefront feed, served via the Shopify App Proxy at
 *   https://<store>/apps/fomopulse/feed
 * Shopify signs every proxied request; authenticate.public.appProxy verifies it.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop;

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    // Short browser cache; the widget also caches per session.
    "Cache-Control": "public, max-age=60",
  };

  if (!shop) {
    return new Response(JSON.stringify({ v: 1, enabled: false, items: [] }), { headers });
  }

  const settings = await getSettings(shop);
  const window = Math.max(settings.lookbackHours, settings.roundupWindowHours);
  const events = settings.enabled ? await getRecentEvents(shop, window) : [];
  return new Response(JSON.stringify(buildFeed(events, settings)), { headers });
};
