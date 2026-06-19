# Version Comparison — @sentry/nextjs (minimal with-sentry config)

Same minimal config across versions, throttled (4x CPU + 10 Mbps).
JS transferred is deterministic (median shown). For bootup, the **first run after
`next start` is a consistent cold-start outlier** — median and warm-runs (run 1 excluded)
shown alongside raw per-run values for transparency.

| @sentry/nextjs | n | JS transferred (KB) | JS bootup median (ms) | JS bootup warm runs (ms) | per-run bootup |
| --- | ---: | ---: | ---: | ---: | --- |
| 10.51.0 | 3 | 157.2 | 135 | 133 | [211, 135, 132] |
| 10.55.0 | 5 | 158.5 | 130 | 130 | [144, 129, 131, 130, 128] |
| 10.58.0 | 3 | 158.9 | 142 | 140 | [209, 138, 142] |
