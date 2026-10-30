import type { NextConfig } from "next";

/** Security headers on every page. Strict transport security only on the
 * customers' site (NEXT_PUBLIC_APP_ENV=production), once it is on https for
 * good: browsers remember it for two years. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  ...(process.env.NEXT_PUBLIC_APP_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // HarfBuzz's loader (the Text Tool's shaping engine) names Node's `module`
  // on a path the browser never takes: give browser bundles an empty stand-in.
  turbopack: {
    resolveAlias: {
      module: { browser: "./lib/emptyModule.ts" },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer)
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        module: false,
      };
    return config;
  },
};

export default nextConfig;
