# Vite Benchmark (throttled) — Sentry on TanStack Router + @sentry/react

Profile: **DevTools** real throttling, 4x CPU + 10 Mbps↓/1 Mbps↑/40ms RTT. Mean ± sample stddev over 5 runs.

| Metric | baseline | with-sentry | with-sentry-deferred |
| --- | ---: | ---: | ---: |
| FCP (ms) | 264 ± 17 | 323 ± 20 | 260 ± 8 |
| LCP (ms) | 264 ± 17 | 323 ± 20 | 260 ± 8 |
| Speed Index (ms) | 261 ± 16 | 323 ± 16 | 257 ± 8 |
| TBT (ms) | 0 ± 0 | 0 ± 0 | 13 ± 3 |
| TTI (ms) | 264 ± 17 | 323 ± 20 | 497 ± 10 |
| JS bootup (ms) | 24 ± 3 | 97 ± 30 | 51 ± 4 |
| Perf score | 100 ± 0 | 100 ± 0 | 100 ± 0 |
| JS transferred (KB) | 71.5 ± 0.0 | 228.5 ± 0.0 | 226.4 ± 0.0 |
| Total transferred (KB) | 72.0 ± 0.0 | 229.3 ± 0.1 | 227.2 ± 0.0 |

## Long tasks (>50ms)

**baseline** — tasks/run: [0, 0, 0, 0, 0], total/run (ms): [0, 0, 0, 0, 0]
  representative: (none)

**with-sentry** — tasks/run: [0, 0, 0, 0, 0], total/run (ms): [0, 0, 0, 0, 0]
  representative: (none)

**with-sentry-deferred** — tasks/run: [1, 1, 1, 1, 1], total/run (ms): [60, 62, 68, 60, 64]
  representative: 62ms @436ms [Unattributable]
