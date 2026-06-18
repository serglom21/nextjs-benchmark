# Simulated Slow-4G Benchmark — Sentry SDK Overhead (network properly modeled)

Profile: mobile, **lantern simulate**, Lighthouse **mobileSlow4G** preset
(1.6 Mbps↓ / 750 Kbps↑ / 150ms RTT, **4x CPU**).
Values are **mean ± sample stddev** over **5 runs**.

| Metric | baseline | with-sentry | Δ (sentry − baseline) |
| --- | ---: | ---: | ---: |
| FCP (ms) | 625 ± 22 | 615 ± 1 | -10 (-2%) |
| LCP (ms) | 1379 ± 156 | 1177 ± 246 | -202 (-15%) |
| Speed Index (ms) | 625 ± 22 | 615 ± 1 | -10 (-2%) |
| TTI (ms) | 1434 ± 226 | 2071 ± 57 | +638 (+44%) |
| TBT (ms) | 14 ± 32 | 56 ± 37 | +42 (+292%) |
| Max Potential FID (ms) | 37 ± 47 | 106 ± 36 | +69 (+185%) |
| JS bootup (ms) | 48 ± 108 | 173 ± 52 | +124 (+256%) |
| Perf score | 100 ± 0 | 100 ± 0 | -0 (-0%) |
| JS transferred (KB) | 87.0 ± 0.0 | 158.5 ± 0.0 | +71.5 (+82%) |
| Total transferred (KB) | 88.8 ± 0.0 | 160.9 ± 0.0 | +72.1 (+81%) |
