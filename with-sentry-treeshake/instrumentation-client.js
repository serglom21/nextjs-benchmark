import * as Sentry from "@sentry/nextjs";

// Faithful reproduction of the customer's actual client-side config.
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// Customer pattern: after the page goes idle, dynamically import @sentry/react
// (separate async chunk) and register the heavier tracing + breadcrumb integrations.
const onIdle = (cb) =>
  typeof requestIdleCallback === "function"
    ? requestIdleCallback(cb, { timeout: 2000 })
    : setTimeout(cb, 0);

onIdle(async () => {
  try {
    const { addIntegration, tanstackRouterBrowserTracingIntegration, breadcrumbsIntegration } =
      await import("@sentry/react");

    // The real app passes its TanStack Router instance. This repro has no router,
    // so we pass a minimal stub sufficient to instantiate the integration — we are
    // measuring the load/parse cost of the deferred chunk, not routing behaviour.
    const router = {
      subscribe: () => () => {},
      history: { subscribe: () => () => {} },
      state: { location: { pathname: "/" } },
    };

    addIntegration(tanstackRouterBrowserTracingIntegration(router));
    addIntegration(breadcrumbsIntegration({ fetch: true, history: true }));
  } catch (err) {
    // Don't let the repro's router stub break the page.
    console.warn("deferred integration load failed (expected in repro):", err?.message);
  }
});
