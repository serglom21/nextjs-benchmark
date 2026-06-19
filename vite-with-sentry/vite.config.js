import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";

// Mirrors the customer's Vite setup. sentryVitePlugin runs without an auth token,
// so it injects debug IDs but performs no source-map upload (no network).
export default defineConfig({
  build: { target: "esnext", sourcemap: true },
  plugins: [
    react(),
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN, // undefined => upload skipped
      telemetry: false,
      silent: true,
    }),
    ...(process.env.ANALYZE
      ? [visualizer({ filename: "stats.json", template: "raw-data", gzipSize: true })]
      : []),
  ],
});
