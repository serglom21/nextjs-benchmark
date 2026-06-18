const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(nextConfig, {
  // Identical to with-sentry — only the init timing differs (see instrumentation-client.js).
  silent: true,
  widenClientFileUpload: false,
  disableServerWebpackPlugin: true,
});
