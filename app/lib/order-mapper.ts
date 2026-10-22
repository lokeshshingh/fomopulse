/**
 * Turns a Shopify `orders/create` webhook payload into anonymised proof events.
 * Pure module: privacy rules live here and are unit tested.
 *
 * Kept:   first name, city, province code, country code, product, time.
 * Dropped: surname, email, phone, street address, order value, everything else.
 */

export interface OrderAddress {
  first_name?: string | null;
  city?: string | null;
  province_code?: string | null;
  country_code?: string | null;
}

export interface OrderLineItem {
  product_id?: number | string | null;
  title?: string | null;
  gift_card?: boolean | null;
}

export interface OrderPayload {
  id: number | string;
  created_at?: string | null;
  test?: boolean | null;
  customer?: { first_name?: string | null } | null;
  billing_address?: OrderAddress | null;
  shipping_address?: OrderAddress | null;
  line_items?: OrderLineItem[] | null;
}

export interface ProofEventInput {
  orderId: string;
  productId: string;
  productTitle: string;
  firstName: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  occurredAt: Date;
}

/** Max distinct products recorded per order, so one big order can't flood the feed. */
export const MAX_ITEMS_PER_ORDER = 2;

/** Keep only a plausible first name: first token, letters only, max 20 chars. */
export function cleanFirstName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.trim().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[^\p{L}'-]/gu, "").slice(0, 20);
  if (cleaned.length < 2) return null;
  return cleaned.charAt(0).toLocaleUpperCase() + cleaned.slice(1);
}

function clean(raw: string | null | undefined, max = 60): string | null {
  const s = (raw ?? "").trim();
  return s ? s.slice(0, max) : null;
}

export function mapOrderToEvents(
  order: OrderPayload,
  opts: { includeTestOrders?: boolean } = {},
): ProofEventInput[] {
  if (order.test && !opts.includeTestOrders) return [];

  const address = order.shipping_address ?? order.billing_address ?? null;
  const firstName = cleanFirstName(
    address?.first_name ?? order.customer?.first_name ?? order.billing_address?.first_name,
  );
  const occurredAt = order.created_at ? new Date(order.created_at) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return [];

  const seen = new Set<string>();
  const events: ProofEventInput[] = [];

  for (const item of order.line_items ?? []) {
    if (events.length >= MAX_ITEMS_PER_ORDER) break;
    if (item.gift_card || item.product_id == null || !item.title) continue;
    const productId = String(item.product_id);
    if (seen.has(productId)) continue;
    seen.add(productId);
    events.push({
      orderId: String(order.id),
      productId,
      productTitle: item.title.slice(0, 120),
      firstName,
      city: clean(address?.city),
      province: clean(address?.province_code, 10),
      country: clean(address?.country_code, 2),
      occurredAt,
    });
  }
  return events;
}
