import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import * as Sentry from "@sentry/react";
import { router } from "./router";

// Customer's actual client config — synchronous init with the core integrations.
Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
  sampleRate: 0.01,
  tracesSampleRate: 0.01,
  integrations: [
    Sentry.browserApiErrorsIntegration({ eventTarget: false }),
    Sentry.thirdPartyErrorFilterIntegration({
      filterKeys: ["x-web"],
      behaviour: "drop-error-if-exclusively-contains-third-party-frames",
    }),
  ],
});

// Heavy integrations registered after idle, via a dynamic import. The
// tanstack-router tracing + breadcrumbs code (and the web-vitals graph they
// pull) are only referenced here, so Rollup splits them into a deferred chunk.
const onIdle = (cb) =>
  typeof requestIdleCallback === "function"
    ? requestIdleCallback(cb, { timeout: 2000 })
    : setTimeout(cb, 0);

onIdle(async () => {
  try {
    const { addIntegration, tanstackRouterBrowserTracingIntegration, breadcrumbsIntegration } =
      await import("@sentry/react");
    addIntegration(tanstackRouterBrowserTracingIntegration(router));
    addIntegration(breadcrumbsIntegration({ fetch: true, history: true }));
  } catch (err) {
    console.warn("deferred integration load failed:", err?.message);
  }
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
