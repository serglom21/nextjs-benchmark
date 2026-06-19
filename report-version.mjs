// Version comparison: JS transferred + JS bootup across @sentry/nextjs versions,
// reading throttled-<key>-run-*.json. with-sentry (10.55.0) reuses existing runs.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RESULTS_DIR = path.join(process.cwd(), "results");

// key -> display version label
const VERSIONS = [
  ["with-sentry-v10510", "10.51.0"],
  ["with-sentry", "10.55.0"],
  ["with-sentry-v10580", "10.58.0"],
];

function extract(lhr) {
  const a = lhr.audits;
  const items = a["resource-summary"]?.details?.items ?? [];
  const script = items.find((i) => i.resourceType === "script");
  return {
    jsBytes: script?.transferSize ?? 0,
    bootup: a["bootup-time"]?.numericValue ?? 0,
  };
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const files = readdirSync(RESULTS_DIR);
const rows = [];
for (const [key, label] of VERSIONS) {
  const runs = files
    .filter((f) => f.startsWith(`throttled-${key}-run-`) && f.endsWith(".json"))
    .sort()
    .map((f) => extract(JSON.parse(readFileSync(path.join(RESULTS_DIR, f), "utf8"))));
  if (!runs.length) {
    console.error(`WARNING: no runs found for ${key} (${label})`);
    continue;
  }
  const boot = runs.map((r) => r.bootup);
  const js = runs.map((r) => r.jsBytes / 1024);
  rows.push({
    label,
    n: runs.length,
    jsKB: median(js), // deterministic across runs
    bootRuns: boot.map((b) => Math.round(b)),
    bootMedian: median(boot),
    bootWarm: boot.length > 1 ? mean(boot.slice(1)) : boot[0], // exclude cold run 1
  });
}

const lines = [];
lines.push("| @sentry/nextjs | n | JS transferred (KB) | JS bootup median (ms) | JS bootup warm runs (ms) | per-run bootup |");
lines.push("| --- | ---: | ---: | ---: | ---: | --- |");
for (const r of rows) {
  lines.push(
    `| ${r.label} | ${r.n} | ${r.jsKB.toFixed(1)} | ${r.bootMedian.toFixed(0)} | ` +
      `${r.bootWarm.toFixed(0)} | [${r.bootRuns.join(", ")}] |`
  );
}

const md = [
  "# Version Comparison — @sentry/nextjs (minimal with-sentry config)",
  "",
  "Same minimal config across versions, throttled (4x CPU + 10 Mbps).",
  "JS transferred is deterministic (median shown). For bootup, the **first run after",
  "`next start` is a consistent cold-start outlier** — median and warm-runs (run 1 excluded)",
  "shown alongside raw per-run values for transparency.",
  "",
  lines.join("\n"),
  "",
].join("\n");

writeFileSync(path.join(RESULTS_DIR, "version-summary.md"), md);
writeFileSync(path.join(RESULTS_DIR, "version-summary.json"), JSON.stringify(rows, null, 2));
console.log(md);
