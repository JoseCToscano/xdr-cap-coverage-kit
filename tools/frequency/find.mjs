// Lists every transaction that has one of the given shapes in a ledger range
// (same decode + detectors as the frequency study, no arm walk). Reads the
// ledger cache that run.mjs fills, fetching any missing ledger.
// Usage: node tools/frequency/find.mjs <pubnet|testnet> <from> <to> <out.jsonl> <shape> [<shape> ...]
// Output: one JSON line per (ledger, tx, shape) with tx_index (apply order).
import { appendFileSync, writeFileSync } from "node:fs";
import { processChunk } from "./chunk.mjs";
const [net, from, to, out, ...shapes] = process.argv.slice(2);
const want = new Set(shapes);
writeFileSync(out, "");
const CH = 250;
for (let s = Number(from); s <= Number(to); s += CH) {
  const count = Math.min(CH, Number(to) - s + 1);
  await processChunk(null, { net, start: s, count, onShape: (shape, ledger, tx, txIndex) => {
    if (want.has(shape)) appendFileSync(out, JSON.stringify({ ledger, tx, tx_index: txIndex, shape }) + "\n");
  } });
}
appendFileSync(out, JSON.stringify({ done: true, from: Number(from), to: Number(to) }) + "\n");
