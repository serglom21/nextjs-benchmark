# Throttled Benchmark — All Variants (canonical combined table)

Profile: mobile, **4x CPU + 10 Mbps↓/1 Mbps↑/40ms RTT**, DevTools throttling.
Values are **mean ± sample stddev**. Run counts per variant shown in long-tasks section (n).

| Metric | baseline | with-sentry | with-sentry-deferred | with-sentry-actual | with-sentry-treeshake |
| --- | ---: | ---: | ---: | ---: | ---: |
| FCP (ms) | 94 ± 4 | 94 ± 2 | 94 ± 2 | 100 ± 10 | 106 ± 15 |
| LCP (ms) | 94 ± 4 | 94 ± 2 | 94 ± 2 | 100 ± 10 | 106 ± 15 |
| Speed Index (ms) | 94 ± 4 | 93 ± 2 | 94 ± 3 | 100 ± 10 | 106 ± 15 |
| TBT (ms) | 0 ± 0 | 40 ± 6 | 9 ± 1 | 42 ± 9 | 18 ± 7 |
| TTI (ms) | 94 ± 4 | 331 ± 6 | 301 ± 2 | 338 ± 14 | 297 ± 18 |
| JS bootup (ms) | 0 ± 0 | 132 ± 6 | 128 ± 2 | 135 ± 11 | 100 ± 11 |
| Perf score | 100 ± 0 | 100 ± 0 | 100 ± 0 | 100 ± 0 | 100 ± 0 |
| JS transferred (KB) | 87.0 ± 0.0 | 158.5 ± 0.0 | 158.5 ± 0.0 | 160.3 ± 0.0 | 141.1 ± 0.0 |
| Total transferred (KB) | 88.8 ± 0.0 | 160.9 ± 0.0 | 160.9 ± 0.0 | 162.7 ± 0.0 | 143.5 ± 0.0 |

## Long tasks (>50ms)

**baseline** (n=5) — tasks/run: [0, 0, 0, 0, 0], total/run (ms): [0, 0, 0, 0, 0]
  representative: (none)

**with-sentry** (n=5) — tasks/run: [1, 1, 1, 1, 1], total/run (ms): [101, 88, 88, 87, 88]
  representative: 88ms @242ms [chunks/614-3a4380f54bb97a72.js]

**with-sentry-deferred** (n=5) — tasks/run: [1, 1, 1, 1, 1], total/run (ms): [58, 59, 60, 58, 59]
  representative: 59ms @245ms [chunks/614-3a4380f54bb97a72.js]

**with-sentry-actual** (n=5) — tasks/run: [1, 1, 1, 1, 1], total/run (ms): [107, 91, 87, 88, 86]
  representative: 88ms @243ms [chunks/467-97a67b818b8ab61e.js]

**with-sentry-treeshake** (n=5) — tasks/run: [1, 1, 1, 1, 1], total/run (ms): [62, 67, 78, 70, 61]
  representative: 67ms @216ms [chunks/502-4410efbd1b40bb47.js]
