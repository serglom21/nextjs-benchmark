// Builds combined throttled + simulated tables for the Vite stack from
// results/vite-<mode>-<key>-run-*.json. Mean ± sample stddev.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RESULTS_DIR = path.join(process.cwd(), "results");
const ORDER = ["vite-baseline", "vite-with-sentry", "vite-with-sentry-deferred"];
const LABEL = {
  "vite-baseline": "baseline",
  "vite-with-sentry": "with-sentry (sync init)",
  "vite-with-sentry-deferred": "deferred init",
};

function extract(lhr) {
  const a = lhr.audits;
  const items = a["resource-summary"]?.details?.items ?? [];
  const script = items.find((i) => i.resourceType === "script");
  const total = items.find((i) => i.resourceType === "total");
  return {
    fcp: a["first-contentful-paint"]?.numericValue ?? null,
    lcp: a["largest-contentful-paint"]?.numericValue ?? null,
    tbt: a["total-blocking-time"]?.numericValue ?? null,
    tti: a["interactive"]?.numericValue ?? null,
    bootup: a["bootup-time"]?.numericValue ?? null,
    jsBytes: script?.transferSize ?? 0,
    totalBytes: total?.transferSize ?? 0,
    longTasks: (a["long-tasks"]?.details?.items ?? []).length,
  };
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

function loadMode(mode) {
  const files = readdirSync(RESULTS_DIR);
  const data = {};
  for (const key of ORDER) {
    const runs = files
      .filter((f) => f.startsWith(`vite-${mode}-${key}-run-`) && f.endsWith(".json"))
      .sort()
      .map((f) => extract(JSON.parse(readFileSync(path.join(RESULTS_DIR, f), "utf8"))));
    if (runs.length) data[key] = runs;
  }
  return data;
}

const NUM = ["fcp", "lcp", "tbt", "tti", "bootup", "jsBytes", "totalBytes", "longTasks"];
const DEFS = [
  ["fcp", "FCP (ms)", "ms"],
  ["lcp", "LCP (ms)", "ms"],
  ["tbt", "TBT (ms)", "ms"],
  ["tti", "TTI (ms)", "ms"],
  ["bootup", "JS bootup (ms)", "ms"],
  ["jsBytes", "JS transferred (KB)", "kb"],
  ["totalBytes", "Total transferred (KB)", "kb"],
  ["longTasks", "Long tasks (count)", "n"],
];
const fmt = (v, u) => (u === "kb" ? (v / 1024).toFixed(1) : u === "n" ? v.toFixed(1) : v.toFixed(0));

function table(data) {
  const present = ORDER.filter((k) => data[k]);
  const agg = {};
  for (const key of present) {
    agg[key] = {};
    for (const k of NUM) {
      const vals = data[key].map((r) => r[k]).filter((v) => v != null);
      agg[key][k] = { mean: mean(vals), sd: sd(vals), n: vals.length };
    }
  }
  const n = present.length ? data[present[0]].length : 0;
  const lines = [`| Metric | ${present.map((k) => LABEL[k]).join(" | ")} |`];
  lines.push(`| --- | ${present.map(() => "---:").join(" | ")} |`);
  for (const [k, label, u] of DEFS) {
    lines.push(
      `| ${label} | ${present
        .map((key) => `${fmt(agg[key][k].mean, u)} ± ${fmt(agg[key][k].sd, u)}`)
        .join(" | ")} |`
    );
  }
  return { md: lines.join("\n"), n };
}

const thr = loadMode("throttled");
const sim = loadMode("sim");
const t1 = table(thr);
const t2 = table(sim);

const md = [
  "# Vite + React + TanStack Router — Sentry SDK Overhead",
  "",
  "Client-rendered SPA (no SSR), single route. `@sentry/react@10.55.0`, customer client config.",
  "Values are **mean ± sample stddev**.",
  "",
  `## Real throttling — 4x CPU + 10 Mbps↓ / 40ms RTT (n=${t1.n})`,
  "",
  t1.md,
  "",
  `## Simulated — Lighthouse lantern mobileSlow4G (n=${t2.n})`,
  "",
  t2.md,
  "",
].join("\n");

writeFileSync(path.join(RESULTS_DIR, "vite-combined.md"), md);
console.log(md);
