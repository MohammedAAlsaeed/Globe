/**
 * Where this copy of the site runs, from its environment variables (see
 * .env.example and ../deploy/README.md):
 *
 *   NEXT_PUBLIC_SITE_URL  the site's own address (https://example.com)
 *   NEXT_PUBLIC_APP_ENV   "production" for the customers' site (master);
 *                         anything else ("develop", "local") is kept out of
 *                         search engines, so the develop copy never competes
 *                         with the real one.
 *
 * NEXT_PUBLIC_ values are fixed when the site is built: set them in the
 * host's settings for each environment, then build.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? "local";

/** The customers' site: indexed by search engines, strict transport security. */
export const IS_PRODUCTION = APP_ENV === "production";

export const SITE_NAME = "Al-Idrisi Atelier";
