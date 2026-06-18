# Sentry SDK Boot Overhead on Next.js 14 — Findings

Minimal Next.js 14 (App Router) page rendering only "Hello World". `@sentry/nextjs@10.55.0`,
client `Sentry.init` with `tracesSampleRate: 0.01` + `thirdPartyErrorFilterIntegration` only —
no replay, no profiling, no explicit `browserTracingIntegration`.

Three variants: **baseline** (no Sentry), **with-sentry**, **with-sentry-deferred**
(`Sentry.init` moved into `setTimeout(0)`). All measurements are production builds
(`next build && next start`), Lighthouse navigation mode.

## TL;DR for the SDK team

1. **Real, reproducible cost — but smaller than a naive TTI read suggests.** Under real 4× CPU:
   **+40ms TBT, +132ms JS bootup (parse/compile), one ~88ms long task**, all in the Sentry
   vendor chunk. Tight variance (±6ms). The +532ms TTI from an early unthrottled run was a
   lantern quiet-window artifact, not blocking work — do not quote it.
2. **Sentry does not affect FCP/LCP/Speed Index** on this page, under *any* network profile.
   Static HTML paints before deferred scripts, so the SDK cost lands entirely on interactivity
   (TBT/TTI/bootup), never on first paint.
3. **Network cost of the bundle is ~390ms at Slow 4G**, confirmed two ways (measured TTI gap
   between network profiles = 401ms; modeled transfer of +71.5KB = 388ms).
4. **~20KB (parsed) of tracing + web-vitals/INP code ships by default** and is removable only
   via the build-time `__SENTRY_TRACING__` flag (`webpack.treeshake.removeTracing`), which the
   Next.js SDK does **not** set automatically — gated by the build flag, not by runtime config.

---

## 1. CPU / main-thread cost — real 4× CPU, DevTools throttling (5 runs, mean ± sd)

Profile: mobile, 4× CPU + 10 Mbps / 40ms RTT (real throttling). CPU 4× verified applied
(bootup scaled ~4× the unthrottled eval).

| Metric | baseline | with-sentry | with-sentry-deferred |
|---|---:|---:|---:|
| FCP / LCP / Speed Index (ms) | 94 ± 4 | 94 ± 2 | 94 ± 2 |
| **TBT (ms)** | **0 ± 0** | **40 ± 6** | **9 ± 1** |
| **TTI (ms)** | **94 ± 4** | **331 ± 6** | **301 ± 2** |
| **JS bootup (ms)** | **0 ± 0** | **132 ± 6** | **128 ± 2** |
| Perf score | 100 | 100 | 100 |
| JS transferred (KB) | 87.0 | 158.5 | 158.5 |

**Defer test verdict:** Deferring `init()` cuts **TBT 40 → 9ms (−78%)** and the long task
**88 → 59ms**, but leaves **bootup unchanged (132 → 128ms)**. So the cost decomposes as:
- **~130ms fixed** parse/compile of the +71KB bundle (cannot be deferred), plus
- **~30ms synchronous `init()` execution** (deferrable).

The bundle, not init timing, is the larger lever.

## 2. Long tasks (>50ms) — all attributed to the Sentry vendor chunk (`614`)

| Variant | tasks/run (throttled) | duration |
|---|---|---|
| baseline | [0,0,0,0,0] | none |
| with-sentry | [1,1,1,1,1] | ~88ms |
| with-sentry-deferred | [1,1,1,1,1] | ~59ms |

Unthrottled: baseline 0, with-sentry one ~82ms task. A single blocking chunk, not many small
tasks. Attribution note: in a production build Sentry is co-bundled into chunk `614`; baseline's
equivalent chunk is `117` (31.6KB) vs `614` (104KB) — the long task lives in the Sentry-bearing
chunk and has no baseline counterpart.

## 3. Network cost — simulated Slow 4G (lantern, deterministic; 5 runs, mean ± sd)

Profile: Lighthouse mobileSlow4G preset (1.6 Mbps / 750 Kbps / 150ms RTT, 4× CPU), `simulate`
method — immune to the localhost/DevTools throughput-passthrough unreliability.

| Metric | baseline | with-sentry | Δ |
|---|---:|---:|---:|
| FCP (ms) | 625 ± 22 | 615 ± 1 | −10 (noise) |
| LCP (ms) | 1379 ± 156 | 1177 ± 246 | overlapping CIs — **not significant** |
| **TTI (ms)** | **1434 ± 226** | **2071 ± 57** | **+638 (+44%)** |
| TBT (ms) | 14 ± 32 | 56 ± 37 | +42, but **noisy** (lantern) |
| JS bootup (ms) | 48 ± 108 | 173 ± 52 | +124 |
| JS transferred (KB) | 87.0 | 158.5 | +71.5 (+82%) |

**Download contribution ≈ 390ms at Slow 4G**, corroborated independently:
- Measured: TTI delta @Slow-4G (638ms) − TTI delta @Fast-4G/10Mbps (237ms) = **401ms**.
- Modeled: 71.5KB ÷ 1.475 Mbps effective = **388ms**.

Caveats (stated honestly): under lantern, **LCP is not significant** (error bars overlap) and
**TBT is noisy** (±30+). For TBT, trust the real-throttling run in §1 (40 ± 6). FCP/Speed Index
remain flat — Sentry never touches first paint.

## 4. Bundle composition (`@sentry/*`, production build)

| Package | Parsed (min) | Gzip |
|---|---:|---:|
| `@sentry/core` | 142.3 KB | 54.9 KB |
| `@sentry/browser` | 76.3 KB | 25.6 KB |
| `@sentry/nextjs` | 61.5 KB | 22.4 KB |
| `@sentry-internal/browser-utils` | 27.7 KB | 10.0 KB |
| `@sentry/react` | 0.3 KB | 0.1 KB |
| **Total `@sentry`** | **308 KB** | **~113 KB** |

(First-load transfer attributable to Sentry, measured by Lighthouse: **+71.5 KB**.)

## 5. Tree-shaking verdict — why tracing + web-vitals/INP ship unrequested

**Category: intentional, unconditional inclusion gated by a build-time flag. NOT a `sideEffects`
mislabel, NOT a webpack tree-shaking failure.**

- All five `@sentry/*` packages correctly declare `"sideEffects": false` → webpack is permitted
  to drop dead code.
- The code survives because it is **genuinely reachable from `init()`**. In
  `@sentry/nextjs/build/esm/client/index.js`:
  ```js
  import { browserTracingIntegration } from './browserTracingIntegration.js';   // static, line 10
  // inside getDefaultIntegrations(), always called by init():
  if (typeof __SENTRY_TRACING__ === "undefined" || __SENTRY_TRACING__) {
    customDefaultIntegrations.push(browserTracingIntegration());                  // line 89
  }
  ```
  `browserTracingIntegration()` statically pulls `@sentry/browser/tracing/*`,
  `@sentry/core/tracing/*`, and the full `@sentry-internal/browser-utils` web-vitals/INP graph.
- The flag is **left undefined in our build** — confirmed: `__SENTRY_TRACING__` is still present
  (unreplaced) in shipped chunk `614`, and the chunk contains live web-vitals observers
  (`largest-contentful-paint`, `first-input`, `layout-shift`, `interactionCount`).
- It is set to `false` in exactly one place — `config/webpack.js:556` — and **only** when the
  consumer opts in:
  ```js
  if (userSentryOptions.webpack?.treeshake?.removeTracing) { defines.__SENTRY_TRACING__ = false; }
  ```

**Consequence:** the tracing/web-vitals graph ships for every minimal-config consumer, gated only
by the build flag — **independent of the runtime `integrations` array or `tracesSampleRate`**.
It would ship even with `tracesSampleRate` removed. Escape hatch:
`withSentryConfig(config, { webpack: { treeshake: { removeTracing: true } } })`.

---

### Reproduce

```bash
npm install && npm run install:apps
npm --prefix with-sentry-deferred install
node benchmark.mjs            # original (Lighthouse default = simulated Slow 4G), 3 runs
node benchmark-throttled.mjs  # real 4x CPU + 10Mbps, 5 runs, 3 variants, long tasks
node benchmark-sim.mjs        # lantern mobileSlow4G, 5 runs, baseline vs sentry
ANALYZE=true npx --prefix with-sentry next build && node analyze-bundle.mjs   # bundle breakdown
```

All raw Lighthouse JSON reports and per-pass summaries are under `results/`.
