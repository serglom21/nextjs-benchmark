#!/usr/bin/env node
/**
 * Benchmark Sentry SDK initialization overhead on a minimal Next.js 14 app.
 *
 * For each app (baseline, with-sentry):
 *   1. `next build` (production)
 *   2. `next start -p 3000`
 *   3. Run Lighthouse (navigation mode) RUNS times against http://localhost:3000
 *   4. Tear the server down
 *
 * Then averages the runs, prints a markdown comparison table, and writes the
 * full Lighthouse JSON reports to ./results.
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
const RUNS = 3;
const RESULTS_DIR = path.join(__dirname, "results");

const APPS = [
  { key: "baseline", dir: path.join(__dirname, "baseline") },
  { key: "with-sentry", dir: path.join(__dirname, "with-sentry") },
];

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: false,
      ...opts,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function waitForServer(url, { timeoutMs = 60_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok || res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
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
    // Hard kill fallback.
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
      resolve();
    }, 5_000);
  });
}

// ---------------------------------------------------------------------------
// Lighthouse
// ---------------------------------------------------------------------------

function extractMetrics(lhr) {
  const audits = lhr.audits;
  const resourceSummary = audits["resource-summary"]?.details?.items ?? [];
  const scriptRow = resourceSummary.find((i) => i.resourceType === "script");
  const totalRow = resourceSummary.find((i) => i.resourceType === "total");

  return {
    tbt: audits["total-blocking-time"]?.numericValue ?? null,
    tti: audits["interactive"]?.numericValue ?? null,
    fcp: audits["first-contentful-paint"]?.numericValue ?? null,
    speedIndex: audits["speed-index"]?.numericValue ?? null,
    perfScore: (lhr.categories?.performance?.score ?? 0) * 100,
    jsBytes: scriptRow?.transferSize ?? 0,
    totalBytes:
      totalRow?.transferSize ?? audits["total-byte-weight"]?.numericValue ?? 0,
  };
}

async function runLighthouse() {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });
  try {
    const result = await lighthouse(
      URL,
      {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance"],
      },
      // Default config = navigation mode (mobile + simulated throttling).
      undefined
    );
    return { lhr: result.lhr, report: result.report };
  } finally {
    await chrome.kill();
  }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function averageMetrics(metricsList) {
  const keys = [
    "tbt",
    "tti",
    "fcp",
    "speedIndex",
    "perfScore",
    "jsBytes",
    "totalBytes",
  ];
  const out = {};
  for (const key of keys) {
    out[key] = average(metricsList.map((m) => m[key]).filter((v) => v != null));
  }
  return out;
}

async function benchmarkApp(app) {
  console.log(`\n=== ${app.key} ===`);
  console.log(`[${app.key}] Building (production)...`);
  await run("npx", ["next", "build"], { cwd: app.dir });

  console.log(`[${app.key}] Starting production server...`);
  const server = startServer(app.dir);
  const perRun = [];
  try {
    await waitForServer(URL);
    for (let i = 1; i <= RUNS; i++) {
      console.log(`[${app.key}] Lighthouse run ${i}/${RUNS}...`);
      const { lhr, report } = await runLighthouse();
      await writeFile(
        path.join(RESULTS_DIR, `${app.key}-run-${i}.json`),
        report
      );
      const metrics = extractMetrics(lhr);
      perRun.push(metrics);
      console.log(
        `[${app.key}]   TBT=${metrics.tbt?.toFixed(0)}ms ` +
          `TTI=${metrics.tti?.toFixed(0)}ms ` +
          `FCP=${metrics.fcp?.toFixed(0)}ms ` +
          `Score=${metrics.perfScore?.toFixed(0)}`
      );
    }
  } finally {
    console.log(`[${app.key}] Stopping server...`);
    await stopServer(server);
  }

  return { key: app.key, runs: perRun, avg: averageMetrics(perRun) };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const METRIC_DEFS = [
  { key: "tbt", label: "Total Blocking Time (ms)", unit: "ms", lowerBetter: true },
  { key: "tti", label: "Time to Interactive (ms)", unit: "ms", lowerBetter: true },
  { key: "fcp", label: "First Contentful Paint (ms)", unit: "ms", lowerBetter: true },
  { key: "speedIndex", label: "Speed Index (ms)", unit: "ms", lowerBetter: true },
  { key: "perfScore", label: "Performance Score", unit: "", lowerBetter: false },
  { key: "jsBytes", label: "JS Transferred (KB)", unit: "kb", lowerBetter: true },
  { key: "totalBytes", label: "Total Transferred (KB)", unit: "kb", lowerBetter: true },
];

function fmt(value, unit) {
  if (value == null || Number.isNaN(value)) return "n/a";
  if (unit === "kb") return (value / 1024).toFixed(1);
  if (unit === "ms") return value.toFixed(0);
  return value.toFixed(1);
}

function buildTable(baseline, sentry) {
  const lines = [];
  lines.push("| Metric | Baseline | With Sentry | Delta | % Change |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const def of METRIC_DEFS) {
    const b = baseline.avg[def.key];
    const s = sentry.avg[def.key];
    const delta = s - b;
    const sign = delta > 0 ? "+" : "";
    const pctStr =
      b !== 0 ? `${sign}${((delta / b) * 100).toFixed(1)}%` : "n/a";
    lines.push(
      `| ${def.label} | ${fmt(b, def.unit)} | ${fmt(s, def.unit)} | ` +
        `${sign}${fmt(delta, def.unit)} | ${pctStr} |`
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await mkdir(RESULTS_DIR, { recursive: true });

  const results = [];
  for (const app of APPS) {
    results.push(await benchmarkApp(app));
  }

  const baseline = results.find((r) => r.key === "baseline");
  const sentry = results.find((r) => r.key === "with-sentry");

  const table = buildTable(baseline, sentry);

  const md = [
    "# Sentry SDK Boot Overhead — Lighthouse Benchmark",
    "",
    `Next.js 14 (App Router) · production build · ${RUNS} Lighthouse navigation runs averaged.`,
    "",
    table,
    "",
  ].join("\n");

  console.log("\n" + md);
  await writeFile(path.join(RESULTS_DIR, "summary.md"), md);
  await writeFile(
    path.join(RESULTS_DIR, "summary.json"),
    JSON.stringify({ baseline, sentry }, null, 2)
  );
  console.log(`\nReports written to ${RESULTS_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
