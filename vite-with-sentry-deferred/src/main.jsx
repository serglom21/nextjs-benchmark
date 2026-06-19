import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

// DEFER TEST: the entire Sentry import + init is pushed to requestIdleCallback.
// @sentry/react is referenced ONLY inside the dynamic import, so Rollup keeps
// all of it out of the initial chunk — nothing Sentry runs on the critical path.
const onIdle = (cb) =>
  typeof requestIdleCallback === "function"
    ? requestIdleCallback(cb, { timeout: 2000 })
    : setTimeout(cb, 0);

onIdle(async () => {
  try {
    const Sentry = await import("@sentry/react");
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
    Sentry.addIntegration(Sentry.tanstackRouterBrowserTracingIntegration(router));
    Sentry.addIntegration(Sentry.breadcrumbsIntegration({ fetch: true, history: true }));
  } catch (err) {
    console.warn("deferred sentry load failed:", err?.message);
  }
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
