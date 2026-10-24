import db from "../db.server";
import type { StoredEvent } from "./feed";
import { mapOrderToEvents, type OrderPayload, type ProofEventInput } from "./order-mapper";

/** Minimal shape of the Admin GraphQL client we use (works for webhook + admin contexts). */
export interface AdminGraphql {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

interface ProductMeta {
  handle: string | null;
  imageUrl: string | null;
}

const PRODUCT_META_QUERY = `#graphql
  query FomoPulseProductMeta($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        legacyResourceId
        handle
        featuredMedia {
          preview { image { url(transform: { maxWidth: 160, maxHeight: 160 }) } }
        }
      }
    }
  }`;

export async function fetchProductMeta(
  admin: AdminGraphql,
  productIds: string[],
): Promise<Map<string, ProductMeta>> {
  const meta = new Map<string, ProductMeta>();
  const ids = [...new Set(productIds)].slice(0, 50);
  if (!ids.length) return meta;
  try {
    const res = await admin.graphql(PRODUCT_META_QUERY, {
      variables: { ids: ids.map((id) => `gid://shopify/Product/${id}`) },
    });
    const json = (await res.json()) as {
      data?: { nodes?: Array<{
        legacyResourceId?: string;
        handle?: string;
        featuredMedia?: { preview?: { image?: { url?: string } | null } | null } | null;
      } | null> };
    };
    for (const node of json.data?.nodes ?? []) {
      if (!node?.legacyResourceId) continue;
      meta.set(node.legacyResourceId, {
        handle: node.handle ?? null,
        imageUrl: node.featuredMedia?.preview?.image?.url ?? null,
      });
    }
  } catch (err) {
    console.error("[fomopulse] product meta lookup failed", err);
  }
  return meta;
}

export async function saveEvents(
  shop: string,
  events: ProofEventInput[],
  meta: Map<string, ProductMeta>,
): Promise<number> {
  let saved = 0;
  for (const e of events) {
    const m = meta.get(e.productId);
    const data = { ...e, productHandle: m?.handle ?? null, imageUrl: m?.imageUrl ?? null };
    // Upsert makes webhook retries idempotent.
    await db.proofEvent.upsert({
      where: { shop_orderId_productId: { shop, orderId: e.orderId, productId: e.productId } },
      create: { shop, ...data },
      update: data,
    });
    saved++;
  }
  return saved;
}

export async function recordOrder(shop: string, order: OrderPayload, admin?: AdminGraphql | null) {
  const events = mapOrderToEvents(order, {
    includeTestOrders: process.env.FOMOPULSE_INCLUDE_TEST_ORDERS === "true",
  });
  if (!events.length) return 0;
  const meta = admin ? await fetchProductMeta(admin, events.map((e) => e.productId)) : new Map();
  return saveEvents(shop, events, meta);
}

// --- Backfill ---------------------------------------------------------------

const ORDER_FIELDS_WITH_PII = `
  shippingAddress { firstName city provinceCode countryCodeV2 }
    billingAddress { firstName city provinceCode countryCodeV2 }`;

const backfillQuery = (withPii: boolean) => `#graphql
  query FomoPulseBackfill($query: String!) {
    orders(first: 50, sortKey: CREATED_AT, reverse: true, query: $query) {
      nodes {
        legacyResourceId
        createdAt
        test
        ${withPii ? ORDER_FIELDS_WITH_PII : ""}
        lineItems(first: 5) {
          nodes { title isGiftCard product { legacyResourceId } }
        }
      }
    }
  }`;

type GqlAddress = { firstName?: string; city?: string; provinceCode?: string; countryCodeV2?: string } | null;
type GqlOrder = {
  legacyResourceId: string;
  createdAt: string;
  test: boolean;
  shippingAddress?: GqlAddress;
  billingAddress?: GqlAddress;
  customer?: { firstName?: string } | null;
  lineItems: { nodes: Array<{ title: string; isGiftCard: boolean; product: { legacyResourceId: string } | null }> };
};

const toAddress = (a: GqlAddress | undefined) =>
  a ? { first_name: a.firstName, city: a.city, province_code: a.provinceCode, country_code: a.countryCodeV2 } : null;

export function gqlOrderToPayload(o: GqlOrder): OrderPayload {
  return {
    id: o.legacyResourceId,
    created_at: o.createdAt,
    test: o.test,
    customer: o.customer ? { first_name: o.customer.firstName } : null,
    shipping_address: toAddress(o.shippingAddress),
    billing_address: toAddress(o.billingAddress),
    line_items: o.lineItems.nodes.map((li) => ({
      title: li.title,
      gift_card: li.isGiftCard,
      product_id: li.product?.legacyResourceId ?? null,
    })),
  };
}

/**
 * Import the most recent orders so the widget has content straight after install.
 * Customer name/address fields need Shopify "protected customer data" approval;
 * without it we retry without them and notifications fall back to the anonymous label.
 */
export async function backfillRecentOrders(admin: AdminGraphql, shop: string, lookbackHours: number) {
    const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString().slice(0, 10);
  const variables = { query: `created_at:>=${since}` };

  let orders: GqlOrder[] | undefined;
  let usedPii = true;
  for (const withPii of [true, false]) {
    try {
      const res = await admin.graphql(backfillQuery(withPii), { variables });
      const json = (await res.json()) as { data?: { orders?: { nodes: GqlOrder[] } }; errors?: unknown };
      if (json.data?.orders) {
        orders = json.data.orders.nodes;
        usedPii = withPii;
        break;
      }
    } catch (err) {
      console.warn(`[fomopulse] backfill query failed (withPii=${withPii})`, err);
    }
  }
  if (!orders) return { imported: 0, usedPii: false };
    console.log(`[fomopulse] backfill ${shop}: ${orders.length} order(s) since ${since}, test=${orders.filter((o) => o.test).length}`);

  let imported = 0;
  for (const o of orders) {
    imported += await recordOrder(shop, gqlOrderToPayload(o), admin);
  }
  return { imported, usedPii };
}

// --- Reads & privacy --------------------------------------------------------

export async function getRecentEvents(shop: string, sinceHours: number): Promise<StoredEvent[]> {
  return db.proofEvent.findMany({
    where: { shop, occurredAt: { gte: new Date(Date.now() - sinceHours * 3600_000) } },
    orderBy: { occurredAt: "desc" },
    take: 500,
  });
}

export async function countEventsSince(shop: string, sinceHours: number) {
  return db.proofEvent.count({
    where: { shop, occurredAt: { gte: new Date(Date.now() - sinceHours * 3600_000) } },
  });
}

export async function deleteEventsForOrders(shop: string, orderIds: Array<string | number>) {
  if (!orderIds.length) return 0;
  const { count } = await db.proofEvent.deleteMany({
    where: { shop, orderId: { in: orderIds.map(String) } },
  });
  return count;
}

/** Remove everything stored for a shop (uninstall / shop/redact). */
export async function deleteShopData(shop: string) {
  await db.proofEvent.deleteMany({ where: { shop } });
  await db.shopSettings.deleteMany({ where: { shop } });
}

/** Purge events older than the retention window (default 30 days). */
export async function purgeOldEvents(retentionDays = Number(process.env.FOMOPULSE_RETENTION_DAYS ?? 30)) {
  const { count } = await db.proofEvent.deleteMany({
    where: { occurredAt: { lt: new Date(Date.now() - retentionDays * 86400_000) } },
  });
  return count;
}
