const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {};

// Identical to with-sentry-actual, plus the tree-shaking fix:
// removeTracing defines __SENTRY_TRACING__ = false, which drops
// browserTracingIntegration + the tracing/web-vitals graph from the bundle.
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: false,
  disableServerWebpackPlugin: true,
  webpack: {
    treeshake: {
      removeTracing: true,
    },
  },
});
