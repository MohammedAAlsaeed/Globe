import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // HarfBuzz's loader (the Text Tool's shaping engine) names Node's `module`
  // on a path the browser never takes: give browser bundles an empty stand-in.
  turbopack: {
    resolveAlias: {
      module: { browser: "./lib/emptyModule.ts" },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) config.resolve.fallback = { ...(config.resolve.fallback ?? {}), module: false };
    return config;
  },
};

export default nextConfig;
