# Sentry SDK Boot Overhead — Lighthouse Benchmark

Measures the client-side initialization overhead of `@sentry/nextjs@10.55.0` on a
bare Next.js 14 (App Router) page that renders only "Hello World".

## Layout

```
baseline/       Minimal Next.js 14 app, no Sentry
with-sentry/    Identical app + Sentry.init (no replay/profiling/tracing integration)
benchmark.mjs   Lighthouse runner + comparison reporter
results/        Generated: per-run Lighthouse JSON + summary.md / summary.json
```

The two apps are byte-for-byte identical except:

- `with-sentry` depends on `@sentry/nextjs` and wraps `next.config.js` with
  `withSentryConfig({ widenClientFileUpload: false, disableServerWebpackPlugin: true })`.
- `with-sentry/instrumentation-client.js` calls `Sentry.init(...)` with the minimal
  config under test (only `thirdPartyErrorFilterIntegration`).

A dummy DSN is used, so no events are ever sent.

## Run it

```bash
# 1. Install benchmark deps (lighthouse, chrome-launcher)
npm install

# 2. Install both app dependencies
npm run install:apps

# 3. Build + start each app in production mode and run Lighthouse 3x each
npm run benchmark
```

Requires a local Chrome/Chromium install (used headlessly via `chrome-launcher`).

## What it measures

Each app is built (`next build`) and served (`next start`) in **production** mode —
never dev mode — then Lighthouse runs 3 navigation passes against
`http://localhost:3000`. The following are captured and averaged:

- Total Blocking Time (TBT)
- Time to Interactive (TTI)
- First Contentful Paint (FCP)
- Speed Index
- Lighthouse Performance Score
- JS transferred + total bytes transferred

Output is a markdown comparison table (baseline vs with-sentry, delta + % change)
printed to stdout and saved to `results/summary.md`. Full Lighthouse JSON reports
for every run are saved under `results/`.
