const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: false,
  disableServerWebpackPlugin: true,
});
