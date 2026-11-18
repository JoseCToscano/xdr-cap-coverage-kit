// Long-running Go and Rust reader processes (go/main.go, rust/src/main.rs)
// behind a framed request/response pipe: u32 BE len + JSON, u32 BE len + XDR.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "../..");
export const BIN = join(HERE, ".bin");
export const GO_BIN = process.env.XCK_LC_GO ?? join(BIN, "lc-go");
export const RUST_BIN = process.env.XCK_LC_RUST ?? join(ROOT, "runners/rust/target/release/xck-livecheck-rust");

export function buildReaders({ force = false } = {}) {
  mkdirSync(BIN, { recursive: true });
  if (force || !existsSync(GO_BIN)) execFileSync("go", ["build", "-o", GO_BIN, "."], { cwd: join(HERE, "go"), stdio: "inherit" });
  if (force || !existsSync(RUST_BIN)) execFileSync("cargo", ["build", "--release", "--locked"], { cwd: join(HERE, "rust"), stdio: "inherit",
    env: { ...process.env, CARGO_TARGET_DIR: join(ROOT, "runners/rust/target") } });
}

export class Reader {
  constructor(name, bin) {
    this.name = name; this.bin = bin; this.queue = []; this.buf = []; this.start();
  }
  start() {
    this.p = spawn(this.bin, [], { stdio: ["pipe", "pipe", "inherit"] });
    this.p.stdout.on("data", (d) => this.onData(d));
    this.p.on("exit", (code) => {
      const q = this.queue; this.queue = []; this.buf = [];
      for (const w of q) w.reject(new Error(`${this.name} reader exited (${code})`));
      if (!this.closing) this.start();
    });
    this.p.stdin.on("error", () => {});
  }
  onData(d) {
    let i;
    while ((i = d.indexOf(10)) >= 0) {
      this.buf.push(d.subarray(0, i));
      const line = Buffer.concat(this.buf).toString(); this.buf = [];
      d = d.subarray(i + 1);
      const w = this.queue.shift();
      if (w) { try { w.resolve(JSON.parse(line)); } catch (e) { w.reject(e); } }
    }
    if (d.length) this.buf.push(d);
  }
  request(req, payload) {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      const h = Buffer.from(JSON.stringify(req));
      const a = Buffer.alloc(4); a.writeUInt32BE(h.length);
      const b = Buffer.alloc(4); b.writeUInt32BE(payload.length);
      this.p.stdin.write(Buffer.concat([a, h, b, payload]));
    });
  }
  close() { this.closing = true; this.p.stdin.end(); }
}
