import { describe, expect, it } from "vitest";
import { cleanFirstName, mapOrderToEvents, MAX_ITEMS_PER_ORDER } from "../app/lib/order-mapper";

const order = {
  id: 5001,
  created_at: "2026-10-20T10:00:00Z",
  customer: { first_name: "sarah jane" },
  shipping_address: { first_name: "Sarah", city: "Sydney", province_code: "NSW", country_code: "AU" },
  line_items: [
    { product_id: 1, title: "Rosé" },
    { product_id: 1, title: "Rosé (dup)" },
    { product_id: null, title: "Custom item" },
    { product_id: 9, title: "Gift card", gift_card: true },
    { product_id: 2, title: "Spritz" },
    { product_id: 3, title: "Third product" },
  ],
};

describe("cleanFirstName", () => {
  it("keeps only the first token and capitalises", () => {
    expect(cleanFirstName("  sarah jane smith ")).toBe("Sarah");
  });
  it("rejects junk and very short names", () => {
    expect(cleanFirstName("1234")).toBeNull();
    expect(cleanFirstName("J")).toBeNull();
    expect(cleanFirstName(null)).toBeNull();
  });
  it("supports non-latin letters", () => {
    expect(cleanFirstName("zoë")).toBe("Zoë");
  });
});

describe("mapOrderToEvents", () => {
  it("maps distinct real products and drops PII beyond first name + city", () => {
    const events = mapOrderToEvents(order);
    expect(events).toHaveLength(MAX_ITEMS_PER_ORDER);
    expect(events.map((e) => e.productId)).toEqual(["1", "2"]);
    expect(events[0]).toEqual({
      orderId: "5001",
      productId: "1",
      productTitle: "Rosé",
      firstName: "Sarah",
      city: "Sydney",
      province: "NSW",
      country: "AU",
      occurredAt: new Date("2026-10-20T10:00:00Z"),
    });
    expect(Object.keys(events[0])).not.toContain("email");
  });

  it("skips test orders unless asked", () => {
    expect(mapOrderToEvents({ ...order, test: true })).toEqual([]);
    expect(mapOrderToEvents({ ...order, test: true }, { includeTestOrders: true })).toHaveLength(2);
  });

  it("falls back to billing address / customer name", () => {
    const [e] = mapOrderToEvents({
      id: 1, created_at: "2026-10-20T10:00:00Z", shipping_address: null,
      billing_address: { first_name: "Liam", city: "Perth", province_code: "WA" },
      line_items: [{ product_id: 4, title: "Gin" }],
    });
    expect(e.firstName).toBe("Liam");
    expect(e.city).toBe("Perth");
  });

  it("ignores invalid dates", () => {
    expect(mapOrderToEvents({ ...order, created_at: "nope" })).toEqual([]);
  });
});
