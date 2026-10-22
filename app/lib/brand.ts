/**
 * Single source of truth for the app's public name.
 * Rename the project here (plus shopify.app.toml / the extension handle).
 */
export const APP_NAME = "FomoPulse";
export const APP_SLUG = "fomopulse";
/** Storefront path served through the Shopify App Proxy: /apps/<subpath>/feed */
export const PROXY_SUBPATH = APP_SLUG;
/** UTM tags appended to every notification link. */
export const UTM_SOURCE = APP_SLUG;
export const UTM_MEDIUM = "social_proof";
