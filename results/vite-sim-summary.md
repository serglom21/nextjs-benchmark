# Vite Benchmark (sim) — Sentry on TanStack Router + @sentry/react

Profile: lantern **simulate**, mobileSlow4G (1.6 Mbps / 750 Kbps / 150ms RTT, 4x CPU). Mean ± sample stddev over 5 runs.

| Metric | baseline | with-sentry | with-sentry-deferred |
| --- | ---: | ---: | ---: |
| FCP (ms) | 1052 ± 1 | 1359 ± 0 | 1057 ± 1 |
| LCP (ms) | 1052 ± 1 | 1359 ± 0 | 1057 ± 1 |
| Speed Index (ms) | 1052 ± 1 | 1359 ± 0 | 1057 ± 1 |
| TBT (ms) | 0 ± 0 | 0 ± 0 | 9 ± 1 |
| TTI (ms) | 1052 ± 1 | 1359 ± 0 | 2199 ± 66 |
| JS bootup (ms) | 24 ± 1 | 84 ± 29 | 51 ± 1 |
| Perf score | 100 ± 0 | 100 ± 0 | 100 ± 0 |
| JS transferred (KB) | 71.5 ± 0.0 | 228.5 ± 0.0 | 226.4 ± 0.0 |
| Total transferred (KB) | 72.0 ± 0.0 | 229.3 ± 0.0 | 227.2 ± 0.0 |

## Long tasks (>50ms)

**baseline** — tasks/run: [0, 0, 0, 0, 0], total/run (ms): [0, 0, 0, 0, 0]
  representative: (none)

**with-sentry** — tasks/run: [0, 0, 0, 0, 0], total/run (ms): [0, 0, 0, 0, 0]
  representative: (none)

**with-sentry-deferred** — tasks/run: [1, 1, 1, 1, 1], total/run (ms): [59, 61, 58, 58, 59]
  representative: 59ms @2111ms [Unattributable]
