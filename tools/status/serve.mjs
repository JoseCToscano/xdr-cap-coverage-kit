#!/usr/bin/env node
// Minimal read-only HTTP server for the checker host: serves status.json (and the
// raw findings log as open data) with CORS so the static site can fetch it.
//   PORT=8080 XCK_PUBLIC_DIR=/data/public XCK_LIVE_DIR=/data/pubnet node tools/status/serve.mjs
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PORT = Number(process.env.PORT ?? 8080);
const PUB = process.env.XCK_PUBLIC_DIR ?? join(homedir(), ".local/share/xck-livecheck/public");
const LIVE = process.env.XCK_LIVE_DIR ?? join(homedir(), ".local/share/xck-livecheck/pubnet");
const ROUTES = {
  "/status.json": [() => join(PUB, "status.json"), "application/json; charset=utf-8", 30],
  "/findings.jsonl": [() => join(LIVE, "findings.jsonl"), "application/x-ndjson; charset=utf-8", 60],
  "/latest.md": [() => join(LIVE, "latest.md"), "text/markdown; charset=utf-8", 60],
};

createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Methods": "GET, HEAD", "Access-Control-Max-Age": "86400" }); return res.end(); }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  if (path === "/healthz") {
    const f = join(PUB, "status.json");
    const age = existsSync(f) ? (Date.now() - statSync(f).mtimeMs) / 1000 : Infinity;
    res.writeHead(age < 600 ? 200 : 503, { "content-type": "application/json" });
    return res.end(JSON.stringify({ status_age_s: Number.isFinite(age) ? Math.round(age) : null }));
  }
  const r = ROUTES[path];
  if (!r || !existsSync(r[0]())) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found\n"); }
  const f = r[0](); const st = statSync(f);
  res.writeHead(200, { "content-type": r[1], "content-length": st.size, "cache-control": `public, max-age=${r[2]}`, "last-modified": st.mtime.toUTCString() });
  if (req.method === "HEAD") return res.end();
  createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`serving ${PUB}/status.json and ${LIVE}/findings.jsonl on :${PORT}`));
