import * as Sentry from "@sentry/nextjs";

// DEFER TEST variant.
//
// The SDK is still statically imported, so its code is downloaded and parsed
// as part of the bundle exactly like `with-sentry`. The ONLY difference is that
// Sentry.init() is pushed out of the critical path via setTimeout(0), so its
// synchronous execution cost no longer blocks the main thread during load.
//
// If TBT/TTI drop vs `with-sentry`, the cost is in synchronous init execution.
// If they don't, the cost is in download/parse of the bundle, not init timing.
setTimeout(() => {
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
}, 0);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
