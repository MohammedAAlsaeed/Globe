import type { MetadataRoute } from "next";
import { IS_PRODUCTION, SITE_URL } from "@/lib/site";

/** The public pages, for search engines (empty outside production). */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!IS_PRODUCTION) return [];
  return [
    { path: "/", priority: 1 },
    { path: "/print", priority: 0.8 },
    { path: "/library", priority: 0.6 },
    { path: "/register", priority: 0.5 },
    { path: "/login", priority: 0.3 },
  ].map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority,
  }));
}
