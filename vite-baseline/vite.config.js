import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Baseline: React + TanStack Router only, no Sentry.
export default defineConfig({
  build: { target: "esnext", sourcemap: true },
  plugins: [react()],
});
