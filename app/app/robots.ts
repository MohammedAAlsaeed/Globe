import type { MetadataRoute } from "next";
import { IS_PRODUCTION, SITE_URL } from "@/lib/site";

/** Search engines: the customers' site only; the develop copy is closed. */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Accounts, the admin panel and people's maps aren't for search results.
      disallow: [
        "/admin",
        "/maps",
        "/editor",
        "/settings",
        "/auth",
        "/reset-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
