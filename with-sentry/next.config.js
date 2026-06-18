const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(nextConfig, {
  // Keep the focus on client-side runtime impact only.
  silent: true,
  widenClientFileUpload: false,
  disableServerWebpackPlugin: true,
  // No org/project/authToken => no source map upload is attempted.
});
