# Sentry SDK Boot Overhead — Vite + React + TanStack Router

Reproduction matching the customer's actual stack: **Vite + React + TanStack Router +
`@sentry/react@10.55.0`**, client-rendered SPA (no SSR), single `/` route rendering
"Hello World". Built with `vite build` (+ `sentryVitePlugin`, no source-map upload),
served as static files. Lighthouse mobile, **5 runs per cell, mean ± sample stddev**.

This supersedes the earlier Next.js reproduction — the customer is not on Next.js, and
the SSR vs client-rendered distinction materially changes the conclusion (see below).

## Variants

| Variant | What it does |
| --- | --- |
| `vite-baseline` | React + TanStack Router only, no Sentry |
| `vite-with-sentry` | Customer config: **synchronous** `Sentry.init` (core + `browserApiErrorsIntegration({eventTarget:false})` + `thirdPartyErrorFilterIntegration`), then `requestIdleCallback` → dynamic `import('@sentry/react')` → `addIntegration(tanstackRouterBrowserTracingIntegration(router))` + `breadcrumbsIntegration` |
| `vite-with-sentry-deferred` | Same, but the **entire** `Sentry.init` is also moved into `requestIdleCallback` (nothing Sentry on the critical path) |

## Results — real throttling (4x CPU + 10 Mbps↓ / 40ms RTT)

| Metric | baseline | with-sentry (sync init) | deferred init |
| --- | ---: | ---: | ---: |
| FCP / LCP (ms) | 264 ± 17 | **323 ± 20** | 260 ± 8 |
| TBT (ms) | 0 | 0 | 13 ± 3 |
| TTI (ms) | 264 ± 17 | 323 ± 20 | **497 ± 10** |
| JS bootup (ms) | 24 ± 3 | **97 ± 30** | 51 ± 4 |
| JS transferred (KB, gzip) | 71.5 | **228.5** | 226.4 |
| Long tasks (>50ms) | 0 | 0 | 1 |

## Results — simulated Lighthouse lantern mobileSlow4G

| Metric | baseline | with-sentry (sync init) | deferred init |
| --- | ---: | ---: | ---: |
| FCP / LCP (ms) | 1052 ± 1 | **1359 ± 0** | 1057 ± 1 |
| TBT (ms) | 0 | 0 | 9 ± 1 |
| TTI (ms) | 1052 ± 1 | 1359 ± 0 | **2199 ± 66** |
| JS bootup (ms) | 24 ± 1 | **84 ± 29** | 51 ± 1 |
| JS transferred (KB, gzip) | 71.5 | 228.5 | 226.4 |
| Long tasks (>50ms) | 0 | 0 | 1 |

## What the numbers say

**1. In a client-rendered SPA, Sentry's synchronous `init` is on the first-paint critical
path.** Nothing renders until the entry bundle is downloaded, parsed, and executed, and
`Sentry.init` runs inside it. Adding Sentry costs:
- **FCP +59 ms** throttled (264 → 323), **+307 ms** on simulated Slow-4G (1052 → 1359)
- **JS bootup +73 ms** throttled (24 → 97)
- **JS transferred +157 KB gzip** (71.5 → 228.5)

This is the key difference from the Next.js reproduction: there the page was server-rendered,
so FCP was HTML-gated and Sentry barely moved it. Here FCP is JS-gated, so the SDK directly
delays first paint — which is what the customer actually experiences.

**2. Deferring `init` with `requestIdleCallback` removes the FCP cost but shifts it to TTI.**
FCP returns to baseline (260 / 1057 ≈ 264 / 1052), but the deferred chunk still has to
download and execute, creating a long task:
- TTI throttled **264 → 497 ms** (+233 vs baseline)
- TTI Slow-4G **1052 → 2199 ms** (+1147) — on a slow network the large deferred chunk
  downloads late and pushes interactivity out dramatically.

Deferral is therefore **not free**: it trades first-paint latency for time-to-interactive,
and the trade is bad on slow networks *because the deferred chunk is large*.

**3. The deferred chunk is much larger than it needs to be.** Bundle analysis
(`rollup-plugin-visualizer`, raw module data) of `vite-with-sentry`:

| | Initial chunk | Deferred chunk |
| --- | ---: | ---: |
| @sentry composition (per-module gzip estimate) | ~82 KB (core + browser + browser-utils) | ~216 KB |
| tracing + web-vitals + tanstack-router | ~5 KB | ~65 KB |

The deferred chunk drags in integrations the app **never configures**:
- `@sentry-internal/replay` (~60 KB), `@sentry-internal/feedback` (~21 KB),
  `@sentry-internal/replay-canvas` (~8 KB)
- a **second copy of `@sentry/core`** (~56 KB) — genuinely duplicated output: of the
  222 `@sentry/core` module-parts, 97 land in the initial chunk and 58 of the *same*
  modules are re-bundled into the deferred chunk (verified against the raw stats, not a
  visualizer artifact).

Cause: the deferred `await import('@sentry/react')` pulls the whole package namespace, which
defeats per-export tree-shaking, and the default Rollup chunking duplicates the shared core
into the async chunk.

> Note on byte figures: the per-module gzip numbers above are summed estimates from the
> bundle analyzer and overstate real over-the-wire bytes (whole-file gzip is more
> efficient). The authoritative transfer numbers are the Lighthouse **JS transferred** rows
> (71.5 / 228.5 / 226.4 KB). Use the analyzer figures for *composition / proportion*, not as
> absolute transfer sizes.

## Recommendations

1. **Shrink the deferred chunk — biggest win.** Import the specific integration factories
   (`tanstackRouterBrowserTracingIntegration`, `breadcrumbsIntegration`) rather than the full
   `@sentry/react` namespace, so Rollup can tree-shake Replay / Feedback / Canvas out of the
   async chunk. This is what makes the `requestIdleCallback` deferral actually pay off — it
   directly attacks the TTI regression seen above (worst on slow networks).
2. **De-duplicate `@sentry/core`** via a `build.rollupOptions.output.manualChunks` entry that
   puts `@sentry/*` in one shared chunk, so core isn't bundled twice (~56 KB estimated).
3. **Decide deliberately between sync vs deferred init.** Sync init costs first paint
   (FCP +59 ms / +307 ms) but captures errors from t=0. Deferred init protects first paint
   but leaves a startup error-reporting gap and currently worsens TTI. Deferral only wins
   once (1) is applied.
4. The unavoidable critical-path floor is the **~82 KB of `@sentry/core` + `@sentry/browser`**
   that synchronous `init` requires; the rest is tunable.

## Reproduce

```
# apps: vite-baseline/  vite-with-sentry/  vite-with-sentry-deferred/
npm --prefix vite-with-sentry install   # (and the other two)

# perf (each writes results/vite-<mode>-<variant>-run-N.json)
node bench-vite.mjs --mode throttled --runs 5 vite-baseline vite-with-sentry vite-with-sentry-deferred
node bench-vite.mjs --mode sim       --runs 5 vite-baseline vite-with-sentry vite-with-sentry-deferred
node report-vite.mjs                 # -> results/vite-combined.md

# bundle analysis (ANALYZE build emits stats.json, analyzer summarizes chunk/module placement)
node analyze-vite-bundle.mjs         # -> results/vite-bundle-*.json
```
