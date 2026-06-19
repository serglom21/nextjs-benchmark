import * as Sentry from "@sentry/nextjs";

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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
