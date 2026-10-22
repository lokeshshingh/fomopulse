import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { APP_NAME, APP_SLUG } from "../lib/brand";
import { getSettings } from "../lib/settings.server";
import { backfillRecentOrders, countEventsSince, getRecentEvents } from "../lib/events.server";
import { buildFeed } from "../lib/feed";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getSettings(shop);
  const [last24h, last7d, events] = await Promise.all([
    countEventsSince(shop, 24),
    countEventsSince(shop, 24 * 7),
    getRecentEvents(shop, Math.max(settings.lookbackHours, settings.roundupWindowHours)),
  ]);
  const feed = buildFeed(events, settings);
  const storeHandle = shop.replace(".myshopify.com", "");
  return {
    shop,
    enabled: settings.enabled,
    last24h,
    last7d,
    preview: feed.items.slice(0, 8),
    themeEditorUrl: `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps&activateAppId=${process.env.SHOPIFY_API_KEY}/${APP_SLUG}-embed`,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);
  return backfillRecentOrders(admin, session.shop, settings.lookbackHours);
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const importing = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data) {
      shopify.toast.show(`Imported ${fetcher.data.imported} event(s)`);
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading={APP_NAME}>
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({}, { method: "POST" })}
        {...(importing ? { loading: true } : {})}
      >
        Import recent orders
      </s-button>

      {!data.enabled && (
        <s-banner tone="warning" heading="Notifications are turned off">
          <s-paragraph>
            Turn them on in <s-link href="/app/settings">Settings</s-link>.
          </s-paragraph>
        </s-banner>
      )}

      {fetcher.data && !fetcher.data.usedPii && (
        <s-banner tone="info" heading="Names and locations are hidden">
          <s-paragraph>
            Shopify only shares customer first names and cities with apps approved for protected
            customer data. Until then, notifications use your anonymous label (e.g. “Someone bought…”).
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="1. Turn on the widget in your theme">
        <s-paragraph>
          Enable the <s-text type="strong">{APP_NAME}</s-text> app embed in the theme editor, then
          save the theme.
        </s-paragraph>
        <s-button href={data.themeEditorUrl} target="_blank">
          Open theme editor
        </s-button>
      </s-section>

      <s-section heading="2. Activity">
        <s-stack direction="inline" gap="large-200">
          <s-box>
            <s-heading>{data.last24h}</s-heading>
            <s-text color="subdued">events in the last 24 hours</s-text>
          </s-box>
          <s-box>
            <s-heading>{data.last7d}</s-heading>
            <s-text color="subdued">events in the last 7 days</s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="What shoppers will see next">
        {data.preview.length === 0 ? (
          <s-paragraph>
            No notifications yet. New orders appear automatically, or click{" "}
            <s-text type="strong">Import recent orders</s-text>.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Type</s-table-header>
              <s-table-header>Message</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.preview.map((item) => (
                <s-table-row key={item.id}>
                  <s-table-cell>
                    <s-badge tone={item.kind === "roundup" ? "info" : "success"}>{item.kind}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{item.message}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Honest social proof">
        <s-paragraph>
          {APP_NAME} only shows real orders from your store. It stores a first name, city and product
          per order. It never stores emails, surnames or addresses, and it deletes everything when you
          uninstall.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
