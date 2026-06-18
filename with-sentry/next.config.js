const { withSentryConfig } = require("@sentry/nextjs");

const analyze = process.env.ANALYZE === "true";
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: analyze,
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit client source maps only for the analyze build, so source-map-explorer
  // can attribute bundled bytes back to specific @sentry modules. This does NOT
  // affect the benchmark builds (ANALYZE is unset there).
  productionBrowserSourceMaps: analyze,
};

module.exports = withBundleAnalyzer(
  withSentryConfig(nextConfig, {
    // Keep the focus on client-side runtime impact only.
    silent: true,
    widenClientFileUpload: false,
    disableServerWebpackPlugin: true,
    // No org/project/authToken => no source map upload is attempted.
    // Keep maps on disk during the ANALYZE build so source-map-explorer can read them.
    sourcemaps: { deleteSourcemapsAfterUpload: false },
  })
);
