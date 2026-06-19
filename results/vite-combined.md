# Vite + React + TanStack Router — Sentry SDK Overhead

Client-rendered SPA (no SSR), single route. `@sentry/react@10.55.0`, customer client config.
Values are **mean ± sample stddev**.

## Real throttling — 4x CPU + 10 Mbps↓ / 40ms RTT (n=5)

| Metric | baseline | with-sentry (sync init) | deferred init |
| --- | ---: | ---: | ---: |
| FCP (ms) | 264 ± 17 | 323 ± 20 | 260 ± 8 |
| LCP (ms) | 264 ± 17 | 323 ± 20 | 260 ± 8 |
| TBT (ms) | 0 ± 0 | 0 ± 0 | 13 ± 3 |
| TTI (ms) | 264 ± 17 | 323 ± 20 | 497 ± 10 |
| JS bootup (ms) | 24 ± 3 | 97 ± 30 | 51 ± 4 |
| JS transferred (KB) | 71.5 ± 0.0 | 228.5 ± 0.0 | 226.4 ± 0.0 |
| Total transferred (KB) | 72.0 ± 0.0 | 229.3 ± 0.1 | 227.2 ± 0.0 |
| Long tasks (count) | 0.0 ± 0.0 | 0.0 ± 0.0 | 1.0 ± 0.0 |

## Simulated — Lighthouse lantern mobileSlow4G (n=5)

| Metric | baseline | with-sentry (sync init) | deferred init |
| --- | ---: | ---: | ---: |
| FCP (ms) | 1052 ± 1 | 1359 ± 0 | 1057 ± 1 |
| LCP (ms) | 1052 ± 1 | 1359 ± 0 | 1057 ± 1 |
| TBT (ms) | 0 ± 0 | 0 ± 0 | 9 ± 1 |
| TTI (ms) | 1052 ± 1 | 1359 ± 0 | 2199 ± 66 |
| JS bootup (ms) | 24 ± 1 | 84 ± 29 | 51 ± 1 |
| JS transferred (KB) | 71.5 ± 0.0 | 228.5 ± 0.0 | 226.4 ± 0.0 |
| Total transferred (KB) | 72.0 ± 0.0 | 229.3 ± 0.0 | 227.2 ± 0.0 |
| Long tasks (count) | 0.0 ± 0.0 | 0.0 ± 0.0 | 1.0 ± 0.0 |
