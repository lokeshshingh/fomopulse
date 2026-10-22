import { describe, expect, it } from "vitest";
import { buildFeed, formatWindow, interleave, renderTemplate, type StoredEvent } from "../app/lib/feed";
import { DEFAULT_SETTINGS, type WidgetSettings } from "../app/lib/settings";

const NOW = new Date("2026-10-22T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
let n = 0;
const ev = (o: Partial<StoredEvent> = {}): StoredEvent => ({
  id: `e${++n}`, orderId: `o${n}`, productId: "p1", productTitle: "Lyre's Spritz", productHandle: "lyres-spritz",
  imageUrl: "https://cdn.shopify.com/x.jpg", firstName: "Sarah", city: "Sydney", province: "NSW", country: "AU",
  occurredAt: hoursAgo(1), ...o,
});
const s = (o: Partial<WidgetSettings> = {}): WidgetSettings => ({ ...DEFAULT_SETTINGS, ...o });

describe("renderTemplate", () => {
  it("fills placeholders", () => {
    expect(renderTemplate("{{name}} from {{location}} bought {{product}}", { name: "Sarah", location: "Sydney, NSW", product: "Gin" }))
      .toBe("Sarah from Sydney, NSW bought Gin");
  });
  it("drops the location phrase cleanly when empty", () => {
    expect(renderTemplate("{{name}} from {{location}} bought {{product}}", { name: "Sarah", location: "", product: "Gin" }))
      .toBe("Sarah bought Gin");
  });
  it("blanks unknown placeholders", () => {
    expect(renderTemplate("Hi {{ nope }} there", {})).toBe("Hi there");
  });
});

describe("formatWindow", () => {
  it("is human friendly", () => {
    expect(formatWindow(1)).toBe("hour");
    expect(formatWindow(24)).toBe("24 hours");
    expect(formatWindow(168)).toBe("week");
    expect(formatWindow(72)).toBe("3 days");
  });
});

describe("buildFeed", () => {
  it("returns nothing when disabled but still ships config", () => {
    const f = buildFeed([ev()], s({ enabled: false }), NOW);
    expect(f.enabled).toBe(false);
    expect(f.items).toEqual([]);
    expect(f.config.position).toBe("bottom-left");
  });

  it("builds purchase items newest first with UTM links", () => {
    const f = buildFeed([ev({ occurredAt: hoursAgo(5), firstName: "Old" }), ev({ firstName: "New" })], s({ roundupsEnabled: false }), NOW);
    expect(f.items.map((i) => i.message)).toEqual([
      "New from Sydney, NSW bought Lyre's Spritz",
      "Old from Sydney, NSW bought Lyre's Spritz",
    ]);
    expect(f.items[0].url).toBe("/products/lyres-spritz?utm_source=fomopulse&utm_medium=social_proof&utm_content=purchase");
    expect(f.items[0].highlight).toBe("Lyre's Spritz");
  });

  it("respects the lookback window", () => {
    const f = buildFeed([ev({ occurredAt: hoursAgo(100) })], s({ lookbackHours: 72, roundupsEnabled: false }), NOW);
    expect(f.items).toHaveLength(0);
  });

  it("applies name styles and anonymous fallback", () => {
    expect(buildFeed([ev()], s({ nameStyle: "initial", roundupsEnabled: false }), NOW).items[0].message).toMatch(/^S\. from/);
    expect(buildFeed([ev({ firstName: null })], s({ roundupsEnabled: false }), NOW).items[0].message).toMatch(/^Someone from/);
    expect(buildFeed([ev()], s({ nameStyle: "anonymous", anonymousLabel: "A shopper", roundupsEnabled: false }), NOW).items[0].message)
      .toMatch(/^A shopper from/);
  });

  it("hides location when turned off", () => {
    expect(buildFeed([ev()], s({ showLocation: false, roundupsEnabled: false }), NOW).items[0].message).toBe("Sarah bought Lyre's Spritz");
  });

  it("shows one notification per order", () => {
    const f = buildFeed([ev({ orderId: "same", productId: "a" }), ev({ orderId: "same", productId: "b" })], s({ roundupsEnabled: false }), NOW);
    expect(f.items).toHaveLength(1);
  });

  it("creates roundups only above the minimum distinct-order count", () => {
    const events = [ev(), ev(), ev(), ev({ productId: "p2", productTitle: "Gin" })];
    const f = buildFeed(events, s({ roundupMinCount: 3 }), NOW);
    const roundups = f.items.filter((i) => i.kind === "roundup");
    expect(roundups).toHaveLength(1);
    expect(roundups[0].message).toBe("3 people bought Lyre's Spritz in the last 24 hours");
    expect(roundups[0].at).toBeNull();
  });
});

describe("interleave", () => {
  it("slots a roundup after every 3 purchases", () => {
    const p = (id: string) => ({ id, kind: "purchase" as const, message: id, highlight: null, url: null, image: null, at: null });
    const r = (id: string) => ({ ...p(id), kind: "roundup" as const });
    expect(interleave([p("1"), p("2"), p("3"), p("4")], [r("A"), r("B")]).map((i) => i.id)).toEqual(["1", "2", "3", "A", "4", "B"]);
  });
});
