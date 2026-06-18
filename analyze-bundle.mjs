// Aggregates the webpack-bundle-analyzer module tree (extracted from the
// ANALYZE build's client.html) into a @sentry-focused breakdown.
import { readFileSync, writeFileSync } from "node:fs";

const chart = JSON.parse(readFileSync("/tmp/chartData.json", "utf8"));

// Walk the tree, yielding leaf modules with their parsedSize and full path.
function* leaves(node, prefix = "") {
  const path = prefix + (node.label || "");
  if (node.groups && node.groups.length) {
    for (const g of node.groups) yield* leaves(g, path + "/");
  } else {
    yield { path, parsedSize: node.parsedSize || 0, statSize: node.statSize || 0, gzipSize: node.gzipSize || 0 };
  }
}

const all = [];
for (const chunk of chart) for (const leaf of leaves(chunk)) all.push(leaf);

const totalParsed = all.reduce((a, b) => a + b.parsedSize, 0);

// Classify each leaf.
function classify(p) {
  const m = p.match(/node_modules\/(@sentry(?:-internal)?\/[^/]+)/);
  if (m) return { group: m[1], sentry: true };
  return { group: "(app/next/react/other)", sentry: false };
}

const byGroup = new Map();
let sentryTotal = 0;
for (const leaf of all) {
  const { group, sentry } = classify(leaf.path);
  const cur = byGroup.get(group) || { parsed: 0, gzip: 0, count: 0, sentry };
  cur.parsed += leaf.parsedSize;
  cur.gzip += leaf.gzipSize;
  cur.count += 1;
  byGroup.set(group, cur);
  if (sentry) sentryTotal += leaf.parsedSize;
}

// Integration-level detail: find @sentry leaves whose filename hints at integrations.
const integrationHits = all
  .filter((l) => /@sentry/.test(l.path) && /integration|thirdpartyerrorfilter|breadcrumb|globalhandlers|dedupe|httpcontext|browserapierrors|functiontostring|inboundfilters|linkederrors/i.test(l.path))
  .map((l) => ({ path: l.path.replace(/.*node_modules\//, ""), parsed: l.parsedSize }))
  .sort((a, b) => b.parsed - a.parsed);

const sentryGroups = [...byGroup.entries()]
  .filter(([, v]) => v.sentry)
  .map(([k, v]) => ({ pkg: k, parsedBytes: v.parsed, gzipBytes: v.gzip, modules: v.count }))
  .sort((a, b) => b.parsedBytes - a.parsedBytes);

const out = {
  totalParsedBytes: totalParsed,
  sentryParsedBytes: sentryTotal,
  sentryShareOfBundlePct: +((sentryTotal / totalParsed) * 100).toFixed(1),
  bySentryPackage: sentryGroups,
  integrationModules: integrationHits,
};

writeFileSync("results/bundle-breakdown.json", JSON.stringify(out, null, 2));

const kb = (b) => (b / 1024).toFixed(1);
console.log(`Total parsed bundle:   ${kb(totalParsed)} KB`);
console.log(`@sentry parsed total:  ${kb(sentryTotal)} KB  (${out.sentryShareOfBundlePct}% of bundle)\n`);
console.log("By @sentry package (parsed / gzip):");
for (const g of sentryGroups) {
  console.log(`  ${g.pkg.padEnd(28)} ${kb(g.parsedBytes).padStart(7)} KB   ${kb(g.gzipBytes).padStart(6)} KB gz   (${g.modules} modules)`);
}
console.log("\nNotable integration / feature modules (parsed):");
for (const i of integrationHits.slice(0, 15)) {
  console.log(`  ${kb(i.parsed).padStart(6)} KB   ${i.path}`);
}
