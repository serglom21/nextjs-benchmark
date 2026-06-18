#!/usr/bin/env node
/**
 * Simulated (lantern) Slow 4G benchmark — deterministic network modeling.
 *
 * Uses throttlingMethod: "simulate" with Lighthouse's built-in mobileSlow4G
 * preset (1.6 Mbps down / 750 Kbps up / 150ms RTT, 4x CPU). Lantern models
 * throughput from the trace rather than shaping real sockets, so it is immune
 * to the localhost/DevTools throughput-passthrough unreliability — this is the
 * defensible way to measure the DOWNLOAD contribution of the +71 KB bundle.
 *
 * Variants: baseline, with-sentry. 5 runs each; mean ± sample stddev.
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
const RUNS = 5;
const RESULTS_DIR = path.join(__dirname, "results");

const VARIANTS = [
  { key: "baseline", dir: path.join(__dirname, "baseline") },
  { key: "with-sentry", dir: path.join(__dirname, "with-sentry") },
];

// Lighthouse's mobileSlow4G preset, applied via lantern simulation.
const LH_SETTINGS = {
  formFactor: "mobile",
  throttlingMethod: "simulate",
  throttling: {
    rttMs: 150,
    throughputKbps: 1638.4,
    requestLatencyMs: 150 * 3.75,
    downloadThroughputKbps: 1638.4 * 0.9,
    uploadThroughputKbps: 750 * 0.9,
    cpuSlowdownMultiplier: 4,
  },
  screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  onlyCategories: ["performance"],
  logLevel: "error",
  output: "json",
};

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
    child.on("error", reject);
    child.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${c}`))));
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
  // Modeled load-time of the largest script chunk (download contribution proxy).
  const netItems = a["network-requests"]?.details?.items ?? [];
  const scripts = netItems
    .filter((r) => (r.resourceType === "Script" || /\.js(\?|$)/.test(r.url || "")))
    .map((r) => ({ url: (r.url || "").replace(/.*\/chunks\//, "chunks/").replace(/\?.*/, ""), bytes: r.transferSize || 0 }))
    .sort((x, y) => y.bytes - x.bytes);
  return {
    fcp: a["first-contentful-paint"]?.numericValue ?? null,
    lcp: a["largest-contentful-paint"]?.numericValue ?? null,
    speedIndex: a["speed-index"]?.numericValue ?? null,
    tbt: a["total-blocking-time"]?.numericValue ?? null,
    tti: a["interactive"]?.numericValue ?? null,
    bootup: a["bootup-time"]?.numericValue ?? null,
    maxFid: a["max-potential-fid"]?.numericValue ?? null,
    perfScore: (lhr.categories?.performance?.score ?? 0) * 100,
    jsBytes: script?.transferSize ?? 0,
    totalBytes: total?.transferSize ?? a["total-byte-weight"]?.numericValue ?? 0,
    biggestScript: scripts[0] ?? null,
  };
}

async function runLighthouse() {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
  try {
    const result = await lighthouse(URL, { port: chrome.port, ...LH_SETTINGS });
    return { lhr: result.lhr, report: result.report };
  } finally {
    await chrome.kill();
  }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stddev = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

const NUMERIC_KEYS = ["fcp", "lcp", "speedIndex", "tbt", "tti", "bootup", "maxFid", "perfScore", "jsBytes", "totalBytes"];

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
      console.log(`[${v.key}] sim run ${i}/${RUNS}...`);
      const { lhr, report } = await runLighthouse();
      await writeFile(path.join(RESULTS_DIR, `sim-${v.key}-run-${i}.json`), report);
      const m = extractMetrics(lhr);
      runs.push(m);
      console.log(`[${v.key}]   FCP=${m.fcp?.toFixed(0)} LCP=${m.lcp?.toFixed(0)} TTI=${m.tti?.toFixed(0)} TBT=${m.tbt?.toFixed(0)} score=${m.perfScore?.toFixed(0)}`);
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

const METRIC_DEFS = [
  { key: "fcp", label: "FCP (ms)", unit: "ms" },
  { key: "lcp", label: "LCP (ms)", unit: "ms" },
  { key: "speedIndex", label: "Speed Index (ms)", unit: "ms" },
  { key: "tti", label: "TTI (ms)", unit: "ms" },
  { key: "tbt", label: "TBT (ms)", unit: "ms" },
  { key: "maxFid", label: "Max Potential FID (ms)", unit: "ms" },
  { key: "bootup", label: "JS bootup (ms)", unit: "ms" },
  { key: "perfScore", label: "Perf score", unit: "score" },
  { key: "jsBytes", label: "JS transferred (KB)", unit: "kb" },
  { key: "totalBytes", label: "Total transferred (KB)", unit: "kb" },
];

function cell(s, unit) {
  const f = (v) => (unit === "kb" ? (v / 1024).toFixed(1) : v.toFixed(0));
  return `${f(s.mean)} ± ${f(s.sd)}`;
}

function deltaRow(def, b, s) {
  const db = b.agg[def.key].mean, ds = s.agg[def.key].mean;
  const d = ds - db;
  const pct = db !== 0 ? `${d > 0 ? "+" : ""}${((d / db) * 100).toFixed(0)}%` : "n/a";
  const f = (v) => (def.unit === "kb" ? (v / 1024).toFixed(1) : v.toFixed(0));
  return `${d > 0 ? "+" : ""}${f(d)} (${pct})`;
}

async function main() {
  await mkdir(RESULTS_DIR, { recursive: true });
  const results = [];
  for (const v of VARIANTS) results.push(await benchmarkVariant(v));
  const [b, s] = results;

  const lines = [];
  lines.push("| Metric | baseline | with-sentry | Δ (sentry − baseline) |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const def of METRIC_DEFS) {
    lines.push(`| ${def.label} | ${cell(b.agg[def.key], def.unit)} | ${cell(s.agg[def.key], def.unit)} | ${deltaRow(def, b, s)} |`);
  }

  const md = [
    "# Simulated Slow-4G Benchmark — Sentry SDK Overhead (network properly modeled)",
    "",
    "Profile: mobile, **lantern simulate**, Lighthouse **mobileSlow4G** preset",
    "(1.6 Mbps↓ / 750 Kbps↑ / 150ms RTT, **4x CPU**).",
    `Values are **mean ± sample stddev** over **${RUNS} runs**.`,
    "",
    lines.join("\n"),
    "",
  ].join("\n");

  console.log("\n" + md);
  await writeFile(path.join(RESULTS_DIR, "sim-summary.md"), md);
  await writeFile(path.join(RESULTS_DIR, "sim-summary.json"), JSON.stringify(results, null, 2));
  console.log(`\nWritten to ${RESULTS_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
