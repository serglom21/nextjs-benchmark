#!/usr/bin/env node
/**
 * Throttled Lighthouse benchmark — defensible device profile.
 *
 * Profile: Moto G Power class mobile, 4x CPU slowdown + Slow 4G
 * (10 Mbps down / 1 Mbps up / 40ms RTT), applied via DevTools (real) throttling
 * so the recorded trace — and therefore the long-tasks list — reflects the
 * throttled main thread rather than a lantern estimate.
 *
 * Variants: baseline, with-sentry, with-sentry-deferred.
 * 5 navigation runs each; reports mean and sample standard deviation (n-1).
 * Per-run long-tasks (>50ms) are extracted and aggregated.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3000;
const URL = `http://localhost:${PORT}`;
const RESULTS_DIR = path.join(__dirname, "results");

// All known variants. Select which to run via argv; default to the original 3.
// Override run count with --runs N (default 5).
const REGISTRY = {
  baseline: "baseline",
  "with-sentry": "with-sentry",
  "with-sentry-deferred": "with-sentry-deferred",
  "with-sentry-actual": "with-sentry-actual",
  "with-sentry-treeshake": "with-sentry-treeshake",
  "with-sentry-v10510": "with-sentry-v10510",
  "with-sentry-v10580": "with-sentry-v10580",
};

const argv = process.argv.slice(2);
let RUNS = 5;
const selectedKeys = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--runs") RUNS = Number(argv[++i]);
  else if (REGISTRY[argv[i]]) selectedKeys.push(argv[i]);
  else throw new Error(`Unknown variant: ${argv[i]} (known: ${Object.keys(REGISTRY).join(", ")})`);
}
const keys = selectedKeys.length ? selectedKeys : ["baseline", "with-sentry", "with-sentry-deferred"];
const VARIANTS = keys.map((key) => ({ key, dir: path.join(__dirname, REGISTRY[key]) }));

// 4x CPU + Slow 4G, real (DevTools) throttling.
const LH_SETTINGS = {
  formFactor: "mobile",
  throttlingMethod: "devtools",
  throttling: {
    rttMs: 40,
    throughputKbps: 10 * 1024,
    requestLatencyMs: 40,
    downloadThroughputKbps: 10 * 1024,
    uploadThroughputKbps: 1 * 1024,
    cpuSlowdownMultiplier: 4,
  },
  screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  onlyCategories: ["performance"],
  logLevel: "error",
  output: "json",
};

// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))
    );
  });
}

async function waitForServer(url, { timeoutMs = 60_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Server ${url} not ready in ${timeoutMs}ms`);
}

function startServer(dir) {
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

async function stopServer(child) {
  if (!child || child.killed) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
      resolve();
    }, 5_000);
  });
}

function extractMetrics(lhr) {
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

async function runLighthouse() {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });
  try {
    const result = await lighthouse(URL, { port: chrome.port, ...LH_SETTINGS });
    return { lhr: result.lhr, report: result.report };
  } finally {
    await chrome.kill();
  }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function stddev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

const NUMERIC_KEYS = ["fcp", "lcp", "speedIndex", "tbt", "tti", "bootup", "perfScore", "jsBytes", "totalBytes"];

async function benchmarkVariant(v) {
  console.log(`\n=== ${v.key} ===`);
  console.log(`[${v.key}] building...`);
  await run("npx", ["next", "build"], { cwd: v.dir });
  console.log(`[${v.key}] starting server...`);
  const server = startServer(v.dir);
  const runs = [];
  try {
    await waitForServer(URL);
    for (let i = 1; i <= RUNS; i++) {
      console.log(`[${v.key}] throttled run ${i}/${RUNS}...`);
      const { lhr, report } = await runLighthouse();
      await writeFile(path.join(RESULTS_DIR, `throttled-${v.key}-run-${i}.json`), report);
      const m = extractMetrics(lhr);
      runs.push(m);
      console.log(
        `[${v.key}]   FCP=${m.fcp?.toFixed(0)} TBT=${m.tbt?.toFixed(0)} TTI=${m.tti?.toFixed(0)} ` +
          `bootup=${m.bootup?.toFixed(0)} longTasks=${m.longTasks.length}`
      );
    }
  } finally {
    console.log(`[${v.key}] stopping server...`);
    await stopServer(server);
  }

  const agg = {};
  for (const k of NUMERIC_KEYS) {
    const vals = runs.map((r) => r[k]).filter((x) => x != null);
    agg[k] = { mean: mean(vals), sd: stddev(vals) };
  }
  return { key: v.key, runs, agg };
}

// ---------------------------------------------------------------------------

const METRIC_DEFS = [
  { key: "fcp", label: "FCP (ms)", unit: "ms" },
  { key: "lcp", label: "LCP (ms)", unit: "ms" },
  { key: "speedIndex", label: "Speed Index (ms)", unit: "ms" },
  { key: "tbt", label: "TBT (ms)", unit: "ms" },
  { key: "tti", label: "TTI (ms)", unit: "ms" },
  { key: "bootup", label: "JS bootup (ms)", unit: "ms" },
  { key: "perfScore", label: "Perf score", unit: "score" },
  { key: "jsBytes", label: "JS transferred (KB)", unit: "kb" },
  { key: "totalBytes", label: "Total transferred (KB)", unit: "kb" },
];

function cell(stat, unit) {
  const f = (v) =>
    unit === "kb" ? (v / 1024).toFixed(1) : unit === "score" ? v.toFixed(0) : v.toFixed(0);
  return `${f(stat.mean)} ± ${f(stat.sd)}`;
}

function buildTable(results) {
  const cols = results.map((r) => r.key);
  const lines = [];
  lines.push(`| Metric | ${cols.join(" | ")} |`);
  lines.push(`| --- | ${cols.map(() => "---:").join(" | ")} |`);
  for (const def of METRIC_DEFS) {
    const cells = results.map((r) => cell(r.agg[def.key], def.unit));
    lines.push(`| ${def.label} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function longTaskSummary(results) {
  const lines = [];
  for (const r of results) {
    const counts = r.runs.map((x) => x.longTasks.length);
    const durs = r.runs.map((x) => x.longTasks.reduce((a, b) => a + b.duration, 0));
    // Representative run = median by total long-task time.
    const idx = [...durs.keys()].sort((a, b) => durs[a] - durs[b])[Math.floor(durs.length / 2)];
    const rep = r.runs[idx].longTasks
      .sort((a, b) => b.duration - a.duration)
      .map((t) => `${t.duration}ms @${t.startTime}ms [${t.url}]`);
    lines.push(
      `**${r.key}** — long tasks/run: [${counts.join(", ")}], ` +
        `total blocking-ish time/run (ms): [${durs.join(", ")}]\n` +
        `  representative run #${idx + 1}: ${rep.length ? rep.join("  |  ") : "(none)"}`
    );
  }
  return lines.join("\n\n");
}

async function main() {
  await mkdir(RESULTS_DIR, { recursive: true });
  const results = [];
  for (const v of VARIANTS) results.push(await benchmarkVariant(v));

  const table = buildTable(results);
  const lt = longTaskSummary(results);

  const md = [
    "# Throttled Lighthouse Benchmark — Sentry SDK Boot Overhead",
    "",
    "Profile: mobile, **4x CPU** + **Slow 4G** (10 Mbps↓ / 1 Mbps↑ / 40ms RTT), DevTools throttling.",
    `Values are **mean ± sample stddev** over **${RUNS} runs**.`,
    "",
    table,
    "",
    "## Long tasks (>50ms)",
    "",
    lt,
    "",
  ].join("\n");

  console.log("\n" + md);
  // Per-run JSONs (throttled-<key>-run-N.json) are the source of truth; the
  // canonical multi-variant table is built by report-throttled.mjs. Only write
  // the original combined summary when running the default 3-variant set, so
  // ad-hoc partial runs don't clobber it.
  const isDefaultSet =
    keys.length === 3 &&
    keys.every((k) => ["baseline", "with-sentry", "with-sentry-deferred"].includes(k));
  if (isDefaultSet) {
    await writeFile(path.join(RESULTS_DIR, "throttled-summary.md"), md);
    await writeFile(
      path.join(RESULTS_DIR, "throttled-summary.json"),
      JSON.stringify(results, null, 2)
    );
  }
  console.log(`\nWritten to ${RESULTS_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
