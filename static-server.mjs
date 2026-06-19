// Minimal static file server with gzip + SPA fallback, for serving a Vite
// production `dist/`. Gzips compressible responses so Lighthouse's measured
// transfer size reflects real-world compressed bytes (like a CDN), not raw.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const dir = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".ico": "image/x-icon",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".map"]);

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let fp = path.join(dir, urlPath);
    let st = await stat(fp).catch(() => null);
    if (st && st.isDirectory()) {
      fp = path.join(fp, "index.html");
      st = await stat(fp).catch(() => null);
    }
    if (!st) {
      // SPA fallback
      fp = path.join(dir, "index.html");
    }
    let data = await readFile(fp);
    const ext = path.extname(fp);
    const headers = { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": "no-store" };
    const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    if (acceptsGzip && COMPRESSIBLE.has(ext)) {
      data = gzipSync(data);
      headers["content-encoding"] = "gzip";
      headers["vary"] = "Accept-Encoding";
    }
    headers["content-length"] = data.length;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

server.listen(port, () => console.log(`serving ${dir} on http://localhost:${port}`));
