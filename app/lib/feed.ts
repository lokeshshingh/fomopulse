/**
 * Builds the public storefront feed from stored events + shop settings.
 * Pure module: all message formatting happens here (server side) so the
 * storefront script stays tiny and never sees raw data it doesn't need.
 */
import { UTM_MEDIUM, UTM_SOURCE } from "./brand";
import type { WidgetSettings } from "./settings";

export interface StoredEvent {
  id: string;
  orderId: string;
  productId: string;
  productTitle: string;
  productHandle: string | null;
  imageUrl: string | null;
  firstName: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  occurredAt: Date;
}

export type FeedItemKind = "purchase" | "roundup";

export interface FeedItem {
  id: string;
  kind: FeedItemKind;
  /** Plain text. The widget renders it with textContent (never innerHTML). */
  message: string;
  /** Substring of `message` to emphasise (the product title). */
  highlight: string | null;
  url: string | null;
  image: string | null;
  /** ISO timestamp for "x minutes ago"; null for roundups. */
  at: string | null;
}

export interface FeedConfig {
  position: WidgetSettings["position"];
  theme: WidgetSettings["theme"];
  accentColor: string;
  initialDelaySec: number;
  displaySec: number;
  gapSec: number;
  randomizeGap: boolean;
  maxPerPage: number;
  hideOnMobile: boolean;
  excludedPaths: string[];
  showTimeAgo: boolean;
}

export interface FeedResponse {
  v: 1;
  enabled: boolean;
  config: FeedConfig;
  items: FeedItem[];
}

export const MAX_PURCHASE_ITEMS = 30;
export const MAX_ROUNDUP_ITEMS = 3;
/** A roundup is slotted in after every N purchase notifications. */
export const ROUNDUP_EVERY = 3;

export function formatName(firstName: string | null, s: WidgetSettings): string {
  if (!firstName || s.nameStyle === "anonymous") return s.anonymousLabel;
  if (s.nameStyle === "initial") return `${firstName.charAt(0)}.`;
  return firstName;
}

export function formatLocation(e: Pick<StoredEvent, "city" | "province" | "country">): string {
  if (e.city && e.province) return `${e.city}, ${e.province}`;
  return e.city ?? e.province ?? e.country ?? "";
}

export function formatWindow(hours: number): string {
  if (hours === 1) return "hour";
  if (hours < 48) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 7 ? "week" : `${days} days`;
}

/** Replace {{placeholders}}; drops "from/in {{location}}" cleanly when empty. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  if (!vars.location) {
    out = out.replace(/\s*\b(from|in|near)\s+\{\{\s*location\s*\}\}/gi, "");
  }
  out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
  return out.replace(/\s{2,}/g, " ").trim();
}

function productUrl(handle: string | null, kind: FeedItemKind): string | null {
  if (!handle) return null;
  const params = new URLSearchParams({
    utm_source: UTM_SOURCE,
    utm_medium: UTM_MEDIUM,
    utm_content: kind,
  });
  return `/products/${encodeURIComponent(handle)}?${params.toString()}`;
}

export function buildPurchaseItems(events: StoredEvent[], s: WidgetSettings, now: Date): FeedItem[] {
  const cutoff = now.getTime() - s.lookbackHours * 3600_000;
  const seenOrders = new Set<string>();
  return [...events]
    .filter((e) => e.occurredAt.getTime() >= cutoff && e.occurredAt.getTime() <= now.getTime() + 60_000)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .filter((e) => {
      // One notification per order keeps the feed varied.
      if (seenOrders.has(e.orderId)) return false;
      seenOrders.add(e.orderId);
      return true;
    })
    .slice(0, MAX_PURCHASE_ITEMS)
    .map((e) => ({
      id: `p_${e.id}`,
      kind: "purchase" as const,
      message: renderTemplate(s.purchaseTemplate, {
        name: formatName(e.firstName, s),
        location: s.showLocation ? formatLocation(e) : "",
        product: e.productTitle,
      }),
      highlight: e.productTitle,
      url: productUrl(e.productHandle, "purchase"),
      image: e.imageUrl,
      at: e.occurredAt.toISOString(),
    }));
}

export function buildRoundupItems(events: StoredEvent[], s: WidgetSettings, now: Date): FeedItem[] {
  if (!s.roundupsEnabled) return [];
  const cutoff = now.getTime() - s.roundupWindowHours * 3600_000;
  const byProduct = new Map<string, { latest: StoredEvent; orders: Set<string> }>();
  for (const e of events) {
    if (e.occurredAt.getTime() < cutoff) continue;
    const entry = byProduct.get(e.productId);
    if (!entry) {
      byProduct.set(e.productId, { latest: e, orders: new Set([e.orderId]) });
    } else {
      entry.orders.add(e.orderId);
      if (e.occurredAt > entry.latest.occurredAt) entry.latest = e;
    }
  }
  return [...byProduct.values()]
    .filter((g) => g.orders.size >= s.roundupMinCount)
    .sort((a, b) => b.orders.size - a.orders.size)
    .slice(0, MAX_ROUNDUP_ITEMS)
    .map(({ latest, orders }) => ({
      id: `r_${latest.productId}_${orders.size}`,
      kind: "roundup" as const,
      message: renderTemplate(s.roundupTemplate, {
        count: String(orders.size),
        product: latest.productTitle,
        window: formatWindow(s.roundupWindowHours),
      }),
      highlight: latest.productTitle,
      url: productUrl(latest.productHandle, "roundup"),
      image: latest.imageUrl,
      at: null,
    }));
}

/** Interleave roundups into the purchase stream: P P P R P P P R ... */
export function interleave(purchases: FeedItem[], roundups: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = [];
  const queue = [...roundups];
  purchases.forEach((p, i) => {
    out.push(p);
    if ((i + 1) % ROUNDUP_EVERY === 0 && queue.length) out.push(queue.shift()!);
  });
  return out.concat(queue);
}

export function buildFeed(events: StoredEvent[], s: WidgetSettings, now = new Date()): FeedResponse {
  const config: FeedConfig = {
    position: s.position,
    theme: s.theme,
    accentColor: s.accentColor,
    initialDelaySec: s.initialDelaySec,
    displaySec: s.displaySec,
    gapSec: s.gapSec,
    randomizeGap: s.randomizeGap,
    maxPerPage: s.maxPerPage,
    hideOnMobile: s.hideOnMobile,
    excludedPaths: s.excludedPaths.split("\n").filter(Boolean),
    showTimeAgo: s.showTimeAgo,
  };
  if (!s.enabled) return { v: 1, enabled: false, config, items: [] };
  return {
    v: 1,
    enabled: true,
    config,
    items: interleave(buildPurchaseItems(events, s, now), buildRoundupItems(events, s, now)),
  };
}
