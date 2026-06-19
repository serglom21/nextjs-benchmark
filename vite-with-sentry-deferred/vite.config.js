import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  build: { target: "esnext", sourcemap: true },
  plugins: [
    react(),
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      silent: true,
    }),
    ...(process.env.ANALYZE
      ? [visualizer({ filename: "stats.json", template: "raw-data", gzipSize: true })]
      : []),
  ],
});
