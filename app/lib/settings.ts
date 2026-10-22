/**
 * Widget settings: types, defaults and validation.
 * Pure module (no server imports) so it can be unit tested and shared with the UI.
 */

export const POSITIONS = ["bottom-left", "bottom-right", "top-left", "top-right"] as const;
export const THEMES = ["light", "dark"] as const;
export const NAME_STYLES = ["first", "initial", "anonymous"] as const;

export type Position = (typeof POSITIONS)[number];
export type Theme = (typeof THEMES)[number];
export type NameStyle = (typeof NAME_STYLES)[number];

export interface WidgetSettings {
  enabled: boolean;
  position: Position;
  theme: Theme;
  accentColor: string;
  initialDelaySec: number;
  displaySec: number;
  gapSec: number;
  randomizeGap: boolean;
  maxPerPage: number;
  hideOnMobile: boolean;
  excludedPaths: string;
  lookbackHours: number;
  nameStyle: NameStyle;
  anonymousLabel: string;
  showLocation: boolean;
  showTimeAgo: boolean;
  purchaseTemplate: string;
  roundupsEnabled: boolean;
  roundupWindowHours: number;
  roundupMinCount: number;
  roundupTemplate: string;
}

export const DEFAULT_SETTINGS: WidgetSettings = {
  enabled: true,
  position: "bottom-left",
  theme: "light",
  accentColor: "#111111",
  initialDelaySec: 4,
  displaySec: 8,
  gapSec: 12,
  randomizeGap: true,
  maxPerPage: 5,
  hideOnMobile: false,
  excludedPaths: "/cart\n/checkouts\n/account",
  lookbackHours: 72,
  nameStyle: "first",
  anonymousLabel: "Someone",
  showLocation: true,
  showTimeAgo: true,
  purchaseTemplate: "{{name}} from {{location}} bought {{product}}",
  roundupsEnabled: true,
  roundupWindowHours: 24,
  roundupMinCount: 3,
  roundupTemplate: "{{count}} people bought {{product}} in the last {{window}}",
};

/** Numeric limits enforced on save. */
export const LIMITS = {
  initialDelaySec: [0, 120],
  displaySec: [3, 60],
  gapSec: [2, 600],
  maxPerPage: [1, 50],
  lookbackHours: [1, 24 * 60],
  roundupWindowHours: [1, 24 * 30],
  roundupMinCount: [2, 1000],
} as const satisfies Partial<Record<keyof WidgetSettings, readonly [number, number]>>;

const HEX = /^#[0-9a-fA-F]{6}$/;

function clampInt(raw: unknown, [min, max]: readonly [number, number], fallback: number) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

function text(raw: unknown, fallback: string, maxLen: number) {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s ? s.slice(0, maxLen) : fallback;
}

function bool(raw: unknown) {
  return raw === true || raw === "true" || raw === "on" || raw === "1";
}

/**
 * Parse untrusted form input into valid settings. Unknown or invalid values
 * fall back to defaults; numbers are clamped into safe ranges.
 */
export function parseSettings(input: Record<string, unknown>): WidgetSettings {
  const d = DEFAULT_SETTINGS;
  return {
    enabled: bool(input.enabled),
    position: oneOf(input.position, POSITIONS, d.position),
    theme: oneOf(input.theme, THEMES, d.theme),
    accentColor: HEX.test(String(input.accentColor)) ? String(input.accentColor) : d.accentColor,
    initialDelaySec: clampInt(input.initialDelaySec, LIMITS.initialDelaySec, d.initialDelaySec),
    displaySec: clampInt(input.displaySec, LIMITS.displaySec, d.displaySec),
    gapSec: clampInt(input.gapSec, LIMITS.gapSec, d.gapSec),
    randomizeGap: bool(input.randomizeGap),
    maxPerPage: clampInt(input.maxPerPage, LIMITS.maxPerPage, d.maxPerPage),
    hideOnMobile: bool(input.hideOnMobile),
    excludedPaths: (typeof input.excludedPaths === "string" ? input.excludedPaths : "")
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p.startsWith("/"))
      .slice(0, 50)
      .join("\n"),
    lookbackHours: clampInt(input.lookbackHours, LIMITS.lookbackHours, d.lookbackHours),
    nameStyle: oneOf(input.nameStyle, NAME_STYLES, d.nameStyle),
    anonymousLabel: text(input.anonymousLabel, d.anonymousLabel, 40),
    showLocation: bool(input.showLocation),
    showTimeAgo: bool(input.showTimeAgo),
    purchaseTemplate: text(input.purchaseTemplate, d.purchaseTemplate, 200),
    roundupsEnabled: bool(input.roundupsEnabled),
    roundupWindowHours: clampInt(input.roundupWindowHours, LIMITS.roundupWindowHours, d.roundupWindowHours),
    roundupMinCount: clampInt(input.roundupMinCount, LIMITS.roundupMinCount, d.roundupMinCount),
    roundupTemplate: text(input.roundupTemplate, d.roundupTemplate, 200),
  };
}

/** Pick only WidgetSettings keys from a DB row (drops shop/updatedAt). */
export function toWidgetSettings(row: Partial<WidgetSettings> | null | undefined): WidgetSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (!row) return out;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof WidgetSettings)[]) {
    if (row[key] !== undefined && row[key] !== null) {
      (out as Record<string, unknown>)[key] = row[key];
    }
  }
  return out;
}
