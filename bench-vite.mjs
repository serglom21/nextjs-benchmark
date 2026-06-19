#!/usr/bin/env node
/**
 * Lighthouse benchmark for the Vite + React + TanStack Router reproduction.
 *
 * Usage:
 *   node bench-vite.mjs --mode throttled --runs 5 vite-baseline vite-with-sentry vite-with-sentry-deferred
 *   node bench-vite.mjs --mode sim --runs 5 vite-baseline vite-with-sentry vite-with-sentry-deferred
 *
 * Each variant: `vite build` -> serve dist via static-server.mjs (gzip) -> N Lighthouse runs.
 * Reports mean ± sample stddev; saves per-run JSON + a per-mode summary.
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

const REGISTRY = {
  "vite-baseline": "vite-baseline",
  "vite-with-sentry": "vite-with-sentry",
  "vite-with-sentry-deferred": "vite-with-sentry-deferred",
};

const argv = process.argv.slice(2);
let RUNS = 5;
let MODE = "throttled";
const selected = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--runs") RUNS = Number(argv[++i]);
  else if (argv[i] === "--mode") MODE = argv[++i];
  else if (REGISTRY[argv[i]]) selected.push(argv[i]);
  else throw new Error(`Unknown arg/variant: ${argv[i]}`);
}
const keys = selected.length ? selected : Object.keys(REGISTRY);

const THROTTLED = {
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
const SIM = {
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
const LH_SETTINGS = MODE === "sim" ? SIM : THROTTLED;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
    child.on("error", reject);
    child.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${c}`))));
  });
}
async function waitForServer(url, { timeoutMs = 30_000, intervalMs = 300 } = {}) {
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
function startServer(distDir) {
  const child = spawn("node", [path.join(__dirname, "static-server.mjs"), distDir, String(PORT)], {
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
    setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); resolve(); }, 4000);
  });
}

function extract(lhr) {
  const a = lhr.audits;
  const items = a["resource-summary"]?.details?.items ?? [];
  const script = items.find((i) => i.resourceType === "script");
  const total = items.find((i) => i.resourceType === "total");
  const longTasks = (a["long-tasks"]?.details?.items ?? []).map((t) => ({
    url: (t.url || "").replace(/.*\/assets\//, "assets/").replace(/\?.*/, "") || "inline",
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
    totalBytes: total?.transferSize ?? 0,
    longTasks,
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
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const NUM = ["fcp", "lcp", "speedIndex", "tbt", "tti", "bootup", "perfScore", "jsBytes", "totalBytes"];

async function benchmark(key) {
  const dir = path.join(__dirname, REGISTRY[key]);
  const dist = path.join(dir, "dist");
  console.log(`\n=== ${key} (${MODE}) ===`);
  console.log(`[${key}] building...`);
  await run("npm", ["run", "build"], { cwd: dir });
  console.log(`[${key}] serving...`);
  const server = startServer(dist);
  const runs = [];
  try {
    await waitForServer(URL);
    for (let i = 1; i <= RUNS; i++) {
      console.log(`[${key}] ${MODE} run ${i}/${RUNS}...`);
      const { lhr, report } = await runLighthouse();
      await writeFile(path.join(RESULTS_DIR, `vite-${MODE}-${key}-run-${i}.json`), report);
      const m = extract(lhr);
      runs.push(m);
      console.log(`[${key}]   FCP=${m.fcp?.toFixed(0)} TBT=${m.tbt?.toFixed(0)} TTI=${m.tti?.toFixed(0)} bootup=${m.bootup?.toFixed(0)} JS=${(m.jsBytes/1024).toFixed(1)}KB longTasks=${m.longTasks.length}`);
    }
  } finally {
    console.log(`[${key}] stopping server...`);
    await stopServer(server);
  }
  const agg = {};
  for (const k of NUM) { const vals = runs.map((r) => r[k]).filter((v) => v != null); agg[k] = { mean: mean(vals), sd: sd(vals) }; }
  return { key, runs, agg };
}

const DEFS = [
  ["fcp", "FCP (ms)", "ms"], ["lcp", "LCP (ms)", "ms"], ["speedIndex", "Speed Index (ms)", "ms"],
  ["tbt", "TBT (ms)", "ms"], ["tti", "TTI (ms)", "ms"], ["bootup", "JS bootup (ms)", "ms"],
  ["perfScore", "Perf score", "score"], ["jsBytes", "JS transferred (KB)", "kb"], ["totalBytes", "Total transferred (KB)", "kb"],
];
const fmt = (v, u) => (u === "kb" ? (v / 1024).toFixed(1) : v.toFixed(0));
const cell = (s, u) => `${fmt(s.mean, u)} ± ${fmt(s.sd, u)}`;

async function main() {
  await mkdir(RESULTS_DIR, { recursive: true });
  const results = [];
  for (const k of keys) results.push(await benchmark(k));

  const cols = results.map((r) => r.key.replace("vite-", ""));
  const lines = [`| Metric | ${cols.join(" | ")} |`, `| --- | ${cols.map(() => "---:").join(" | ")} |`];
  for (const [k, label, u] of DEFS) lines.push(`| ${label} | ${results.map((r) => cell(r.agg[k], u)).join(" | ")} |`);

  const ltLines = [];
  for (const r of results) {
    const counts = r.runs.map((x) => x.longTasks.length);
    const durs = r.runs.map((x) => x.longTasks.reduce((a, b) => a + b.duration, 0));
    const idx = [...durs.keys()].sort((a, b) => durs[a] - durs[b])[Math.floor(durs.length / 2)];
    const rep = r.runs[idx].longTasks.sort((a, b) => b.duration - a.duration).map((t) => `${t.duration}ms @${t.startTime}ms [${t.url}]`);
    ltLines.push(`**${r.key.replace("vite-", "")}** — tasks/run: [${counts.join(", ")}], total/run (ms): [${durs.join(", ")}]\n  representative: ${rep.length ? rep.join("  |  ") : "(none)"}`);
  }

  const profile = MODE === "sim"
    ? "lantern **simulate**, mobileSlow4G (1.6 Mbps / 750 Kbps / 150ms RTT, 4x CPU)"
    : "**DevTools** real throttling, 4x CPU + 10 Mbps↓/1 Mbps↑/40ms RTT";
  const md = [
    `# Vite Benchmark (${MODE}) — Sentry on TanStack Router + @sentry/react`,
    "", `Profile: ${profile}. Mean ± sample stddev over ${RUNS} runs.`, "",
    lines.join("\n"), "", "## Long tasks (>50ms)", "", ltLines.join("\n\n"), "",
  ].join("\n");

  console.log("\n" + md);
  await writeFile(path.join(RESULTS_DIR, `vite-${MODE}-summary.md`), md);
  await writeFile(path.join(RESULTS_DIR, `vite-${MODE}-summary.json`), JSON.stringify(results, null, 2));
  console.log(`\nWritten to ${RESULTS_DIR}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
