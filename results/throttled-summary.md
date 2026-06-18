# Throttled Lighthouse Benchmark — Sentry SDK Boot Overhead

Profile: mobile, **4x CPU** + **Slow 4G** (10 Mbps↓ / 1 Mbps↑ / 40ms RTT), DevTools throttling.
Values are **mean ± sample stddev** over **5 runs**.

| Metric | baseline | with-sentry | with-sentry-deferred |
| --- | ---: | ---: | ---: |
| FCP (ms) | 94 ± 4 | 94 ± 2 | 94 ± 2 |
| LCP (ms) | 94 ± 4 | 94 ± 2 | 94 ± 2 |
| Speed Index (ms) | 94 ± 4 | 93 ± 2 | 94 ± 3 |
| TBT (ms) | 0 ± 0 | 40 ± 6 | 9 ± 1 |
| TTI (ms) | 94 ± 4 | 331 ± 6 | 301 ± 2 |
| JS bootup (ms) | 0 ± 0 | 132 ± 6 | 128 ± 2 |
| Perf score | 100 ± 0 | 100 ± 0 | 100 ± 0 |
| JS transferred (KB) | 87.0 ± 0.0 | 158.5 ± 0.0 | 158.5 ± 0.0 |
| Total transferred (KB) | 88.8 ± 0.0 | 160.9 ± 0.0 | 160.9 ± 0.0 |

## Long tasks (>50ms)

**baseline** — long tasks/run: [0, 0, 0, 0, 0], total blocking-ish time/run (ms): [0, 0, 0, 0, 0]
  representative run #3: (none)

**with-sentry** — long tasks/run: [1, 1, 1, 1, 1], total blocking-ish time/run (ms): [101, 88, 88, 87, 88]
  representative run #3: 88ms @242ms [chunks/614-3a4380f54bb97a72.js]

**with-sentry-deferred** — long tasks/run: [1, 1, 1, 1, 1], total blocking-ish time/run (ms): [58, 59, 60, 58, 59]
  representative run #2: 59ms @245ms [chunks/614-3a4380f54bb97a72.js]
