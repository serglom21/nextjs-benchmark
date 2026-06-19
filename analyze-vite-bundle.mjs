// Aggregates rollup-plugin-visualizer raw-data (stats.json) for a Vite build into
// a @sentry-focused breakdown, split by chunk and labeled initial vs deferred
// (initial = the chunk referenced in dist/index.html; deferred = dynamic-import chunks).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const appDir = process.argv[2] || "vite-with-sentry";
const stats = JSON.parse(readFileSync(path.join(appDir, "stats.json"), "utf8"));
const html = readFileSync(path.join(appDir, "dist", "index.html"), "utf8");

const initialChunks = new Set(
  [...html.matchAll(/assets\/([^"']+\.js)/g)].map((m) => m[1])
);

// module id -> { chunkFile -> {rendered, gzip} }
const rows = [];
for (const uid of Object.keys(stats.nodeMetas)) {
  const meta = stats.nodeMetas[uid];
  for (const [chunkFull, partUid] of Object.entries(meta.moduleParts || {})) {
    const part = stats.nodeParts[partUid];
    if (!part) continue;
    const chunk = chunkFull.replace(/^assets\//, "");
    rows.push({
      id: meta.id,
      chunk,
      isInitial: initialChunks.has(chunk),
      rendered: part.renderedLength || 0,
      gzip: part.gzipLength || 0,
    });
  }
}

function pkgOf(id) {
  const m = id.match(/node_modules\/(@sentry(?:-internal)?\/[^/]+|@tanstack\/[^/]+|react-dom|react|web-vitals)/);
  if (m) return m[1];
  if (/@sentry/.test(id)) return "@sentry (other)";
  return "(app/other)";
}
const isSentry = (id) => /@sentry/.test(id);
const isTracingOrVitals = (id) =>
  /browserTracingIntegration|tracing\/|metrics\/(inp|browserMetrics|webVitalSpans|cls|lcp|fid)|web-vitals|tanstackrouter/i.test(
    id
  );

const kb = (b) => (b / 1024).toFixed(1);
const sum = (arr, sel) => arr.reduce((a, r) => a + sel(r), 0);

// Per-chunk totals.
const chunks = {};
for (const r of rows) {
  const c = (chunks[r.chunk] ??= { isInitial: r.isInitial, rendered: 0, gzip: 0, sentryRendered: 0, sentryGzip: 0 });
  c.rendered += r.rendered;
  c.gzip += r.gzip;
  if (isSentry(r.id)) {
    c.sentryRendered += r.rendered;
    c.sentryGzip += r.gzip;
  }
}

// @sentry by package, split initial vs deferred.
const byPkg = {};
for (const r of rows.filter((r) => isSentry(r.id))) {
  const p = pkgOf(r.id);
  const b = (byPkg[p] ??= { initialGzip: 0, deferredGzip: 0, initialRendered: 0, deferredRendered: 0 });
  if (r.isInitial) { b.initialGzip += r.gzip; b.initialRendered += r.rendered; }
  else { b.deferredGzip += r.gzip; b.deferredRendered += r.rendered; }
}

// Tracing / web-vitals placement.
const tracingRows = rows.filter((r) => isSentry(r.id) && isTracingOrVitals(r.id));
const tracingInitial = sum(tracingRows.filter((r) => r.isInitial), (r) => r.gzip);
const tracingDeferred = sum(tracingRows.filter((r) => !r.isInitial), (r) => r.gzip);

const out = { appDir, initialChunks: [...initialChunks], chunks, byPkg, tracingInitialGzipKB: +kb(tracingInitial), tracingDeferredGzipKB: +kb(tracingDeferred) };
writeFileSync(path.join("results", `vite-bundle-${path.basename(appDir)}.json`), JSON.stringify(out, null, 2));

console.log(`\n=== ${appDir} — chunk totals ===`);
for (const [name, c] of Object.entries(chunks)) {
  console.log(
    `  ${c.isInitial ? "INITIAL " : "deferred"} ${name.padEnd(22)} total ${kb(c.gzip).padStart(7)} KB gz | @sentry ${kb(c.sentryGzip).padStart(7)} KB gz`
  );
}
console.log(`\n=== @sentry by package (gzip KB: initial / deferred) ===`);
for (const [p, b] of Object.entries(byPkg).sort((a, b2) => b2[1].initialGzip + b2[1].deferredGzip - (a[1].initialGzip + a[1].deferredGzip))) {
  console.log(`  ${p.padEnd(34)} ${kb(b.initialGzip).padStart(7)} / ${kb(b.deferredGzip).padStart(7)}`);
}
console.log(`\n=== tracing + web-vitals + tanstack-router placement (gzip) ===`);
console.log(`  initial chunk:  ${kb(tracingInitial)} KB`);
console.log(`  deferred chunk: ${kb(tracingDeferred)} KB`);
