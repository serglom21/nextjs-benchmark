// Builds the canonical multi-variant throttled comparison table by reading all
// results/throttled-<key>-run-*.json files. Decoupled from the runner so it can
// combine variants measured across separate sessions (same profile/machine).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RESULTS_DIR = path.join(process.cwd(), "results");

const ORDER = [
  "baseline",
  "with-sentry",
  "with-sentry-deferred",
  "with-sentry-actual",
  "with-sentry-treeshake",
];

function extract(lhr) {
  const a = lhr.audits;
  const items = a["resource-summary"]?.details?.items ?? [];
  const script = items.find((i) => i.resourceType === "script");
  const total = items.find((i) => i.resourceType === "total");
  const longTasks = (a["long-tasks"]?.details?.items ?? []).map((t) => ({
    url: (t.url || "").replace(/.*\/chunks\//, "chunks/").replace(/\?.*/, "") || "inline",
    duration: Math.round(t.duration),
    startTime: Math.round(t.startTime),
  }));
  return {
    fcp: a["first-contentful-paint"]?.numericValue ?? null,
    lcp: a["largest-contentful-paint"]?.numericValue ?? null,
    speedIndex: a["speed-index"]?.numericValue ?? null,
    tbt: a["total-blocking-time"]?.numericValue ?? null,
    tti: a["interactive"]?.numericValue ?? null,
    bootup: a["bootup-time"]?.numericValue ?? null,
    perfScore: (lhr.categories?.performance?.score ?? 0) * 100,
    jsBytes: script?.transferSize ?? 0,
    totalBytes: total?.transferSize ?? a["total-byte-weight"]?.numericValue ?? 0,
    longTasks,
  };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

const files = readdirSync(RESULTS_DIR);
const present = [];
const data = {};
for (const key of ORDER) {
  const runs = files
    .filter((f) => f.startsWith(`throttled-${key}-run-`) && f.endsWith(".json"))
    .sort()
    .map((f) => extract(JSON.parse(readFileSync(path.join(RESULTS_DIR, f), "utf8"))));
  if (runs.length) {
    present.push(key);
    data[key] = runs;
  }
}

const NUM = ["fcp", "lcp", "speedIndex", "tbt", "tti", "bootup", "perfScore", "jsBytes", "totalBytes"];
const agg = {};
for (const key of present) {
  agg[key] = {};
  for (const k of NUM) {
    const vals = data[key].map((r) => r[k]).filter((v) => v != null);
    agg[key][k] = { mean: mean(vals), sd: sd(vals), n: vals.length };
  }
}

const DEFS = [
  ["fcp", "FCP (ms)", "ms"],
  ["lcp", "LCP (ms)", "ms"],
  ["speedIndex", "Speed Index (ms)", "ms"],
  ["tbt", "TBT (ms)", "ms"],
  ["tti", "TTI (ms)", "ms"],
  ["bootup", "JS bootup (ms)", "ms"],
  ["perfScore", "Perf score", "score"],
  ["jsBytes", "JS transferred (KB)", "kb"],
  ["totalBytes", "Total transferred (KB)", "kb"],
];
const fmt = (v, u) => (u === "kb" ? (v / 1024).toFixed(1) : v.toFixed(0));
const cell = (s, u) => `${fmt(s.mean, u)} ± ${fmt(s.sd, u)}`;

const lines = [];
lines.push(`| Metric | ${present.join(" | ")} |`);
lines.push(`| --- | ${present.map(() => "---:").join(" | ")} |`);
for (const [k, label, u] of DEFS) {
  lines.push(`| ${label} | ${present.map((key) => cell(agg[key][k], u)).join(" | ")} |`);
}

// Long-task summary per present variant.
const ltLines = [];
for (const key of present) {
  const counts = data[key].map((r) => r.longTasks.length);
  const durs = data[key].map((r) => r.longTasks.reduce((a, b) => a + b.duration, 0));
  const idx = [...durs.keys()].sort((a, b) => durs[a] - durs[b])[Math.floor(durs.length / 2)];
  const rep = data[key][idx].longTasks
    .sort((a, b) => b.duration - a.duration)
    .map((t) => `${t.duration}ms @${t.startTime}ms [${t.url}]`);
  ltLines.push(
    `**${key}** (n=${data[key].length}) — tasks/run: [${counts.join(", ")}], total/run (ms): [${durs.join(", ")}]\n` +
      `  representative: ${rep.length ? rep.join("  |  ") : "(none)"}`
  );
}

const nRuns = Math.max(...present.map((k) => data[k].length));
const md = [
  "# Throttled Benchmark — All Variants (canonical combined table)",
  "",
  "Profile: mobile, **4x CPU + 10 Mbps↓/1 Mbps↑/40ms RTT**, DevTools throttling.",
  `Values are **mean ± sample stddev**. Run counts per variant shown in long-tasks section (n).`,
  "",
  lines.join("\n"),
  "",
  "## Long tasks (>50ms)",
  "",
  ltLines.join("\n\n"),
  "",
].join("\n");

writeFileSync(path.join(RESULTS_DIR, "throttled-combined.md"), md);
writeFileSync(path.join(RESULTS_DIR, "throttled-combined.json"), JSON.stringify({ present, agg }, null, 2));
console.log(md);
