// Shared helpers for the corpus tools.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const hex = (u8) => Buffer.from(u8).toString("hex");

// Rust side: rs-stellar-xdr through the stellar CLI (`stellar xdr`).
export function rustDecode(type, b64) {
  const out = execFileSync("stellar", ["xdr", "decode", "--type", type, "--input", "single-base64", "--output", "json"], { input: b64 + "\n", maxBuffer: 1 << 30 });
  return JSON.parse(out.toString());
}
export function rustEncode(type, json) {
  const out = execFileSync("stellar", ["xdr", "encode", "--type", type, "--input", "json", "--output", "single-base64"], { input: JSON.stringify(json) + "\n", maxBuffer: 1 << 30 });
  return out.toString().trim();
}
export function rustXdrVersion() {
  return execFileSync("stellar", ["xdr", "version"]).toString().trim().replace(/\s+/g, " ");
}

// JSON Pointer lookup (RFC 6901).
export function at(obj, pointer) {
  if (pointer === "" || pointer === "/") return obj;
  return pointer.split("/").slice(1).reduce((o, k) => (o == null ? undefined : o[k.replace(/~1/g, "/").replace(/~0/g, "~")]), obj);
}

// Evaluate the semantic checks of an entry against a decoded JSON value.
export function runChecks(entry, json) {
  return evalChecks(entry.expected.checks, json);
}
export function evalChecks(checks, json) {
  return checks.map((c) => {
    const v = at(json, c.path);
    let ok;
    switch (c.op) {
      case "equals": case "strkey": ok = JSON.stringify(v) === JSON.stringify(c.value); break;
      case "length": case "not-dropped": ok = Array.isArray(v) && v.length === c.value; break;
      case "preserved": ok = v !== undefined; break;
      default: ok = false;
    }
    return { id: c.id, ok, got: v };
  });
}
