import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, toWidgetSettings } from "../app/lib/settings";

describe("parseSettings", () => {
  it("clamps numbers and rejects bad enums/colours", () => {
    const s = parseSettings({
      enabled: "on", position: "middle", theme: "dark", accentColor: "red",
      displaySec: "999", gapSec: "-5", maxPerPage: "abc", nameStyle: "initial",
    });
    expect(s.enabled).toBe(true);
    expect(s.position).toBe(DEFAULT_SETTINGS.position);
    expect(s.theme).toBe("dark");
    expect(s.accentColor).toBe(DEFAULT_SETTINGS.accentColor);
    expect(s.displaySec).toBe(60);
    expect(s.gapSec).toBe(2);
    expect(s.maxPerPage).toBe(DEFAULT_SETTINGS.maxPerPage);
    expect(s.nameStyle).toBe("initial");
  });

  it("treats missing checkboxes as false", () => {
    const s = parseSettings({});
    expect(s.enabled).toBe(false);
    expect(s.showLocation).toBe(false);
  });

  it("keeps only valid excluded paths", () => {
    expect(parseSettings({ excludedPaths: "/cart\r\nfoo\n /account \n" }).excludedPaths).toBe("/cart\n/account");
  });

  it("caps template length", () => {
    expect(parseSettings({ purchaseTemplate: "x".repeat(500) }).purchaseTemplate).toHaveLength(200);
  });
});

describe("toWidgetSettings", () => {
  it("fills defaults and strips db-only fields", () => {
    const s = toWidgetSettings({ theme: "dark", shop: "x.myshopify.com" } as never);
    expect(s.theme).toBe("dark");
    expect(s.position).toBe("bottom-left");
    expect(s).not.toHaveProperty("shop");
  });
});
