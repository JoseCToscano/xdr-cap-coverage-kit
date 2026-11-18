// Turns a flagged transaction into a corpus *candidate* (not a corpus entry):
// CAP tags (inferred), flags, tx hash, ledger, and the raw XDR slices of the
// envelope and its TransactionResultMetaV1 as decoded from the archive.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { urlOf } from "./lake.mjs";
import { CHECKER_VERSION, NETWORKS } from "./check.mjs";

export async function writeCandidate(dir, checker, { net, seq, lcm, closeTime, tx, segments, flags, caps }) {
  const names = segments.filter(Boolean);
  const sl = await checker.slices(seq, lcm, names);
  const kind = flags[0].type, key = flags[0].arm ?? (flags[0].shape ? flags[0].shape.split(" ")[0] : null) ?? flags[0].path ?? flags[0].reader ?? "";
  const slug = `${kind}-${String(key).replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 60)}-${tx.slice(0, 12)}`;
  const xdrOf = (pfx, type) => names.filter((n) => n[0] === pfx && sl[n]).map((n) => ({ type, segment: n, base64: sl[n],
    sha256: createHash("sha256").update(Buffer.from(sl[n], "base64")).digest("hex") }));
  const c = {
    candidate_version: "0.1", id: slug, status: "candidate (not reviewed, not in corpus/entries)",
    caps, caps_inferred: true, flags,
    network: { name: net, passphrase: NETWORKS[net].passphrase },
    tx_hash: tx, ledger: seq, ledger_close_time: closeTime ? new Date(closeTime * 1000).toISOString() : null,
    xdr: [...xdrOf("E", "TransactionEnvelope"), ...xdrOf("P", "TransactionResultMetaV1")],
    provenance: { kind: net, origin: "observed_on_network", source_url: urlOf(net, seq), detected_by: CHECKER_VERSION, detected_at: new Date().toISOString() },
  };
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${slug}.json`);
  if (!existsSync(p)) writeFileSync(p, JSON.stringify(c, null, 1) + "\n");
  return p;
}
