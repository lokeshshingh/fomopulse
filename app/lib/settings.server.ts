import db from "../db.server";
import { toWidgetSettings, type WidgetSettings } from "./settings";

export async function getSettings(shop: string): Promise<WidgetSettings> {
  const row = await db.shopSettings.findUnique({ where: { shop } });
  return toWidgetSettings(row as Partial<WidgetSettings> | null);
}

export async function saveSettings(shop: string, settings: WidgetSettings) {
  await db.shopSettings.upsert({
    where: { shop },
    create: { shop, ...settings },
    update: settings,
  });
}
