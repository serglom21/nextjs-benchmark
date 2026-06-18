import * as Sentry from "@sentry/nextjs";

// This file runs in the browser and is what we want to measure the impact of.
// Config intentionally minimal: no Replay, no Profiling, no browserTracingIntegration.
Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
  tracesSampleRate: 0.01,
  integrations: [
    Sentry.thirdPartyErrorFilterIntegration({
      filterKeys: ["xweb-lite"],
      behaviour: "drop-error-if-contains-third-party-frames",
    }),
  ],
});

// Required by @sentry/nextjs v10 for App Router navigation instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
