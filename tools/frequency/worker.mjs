// Child process for run.mjs: receives chunks over IPC, writes each chunk's
// accumulator to its output path, replies when done.
import { writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { loadUniverse } from "../xdr-walk.mjs";
import { processChunk } from "./chunk.mjs";
const { defs } = loadUniverse();
process.on("message", async (job) => {
  if (job === "exit") process.exit(0);
  const t0 = Date.now();
  try {
    const acc = await processChunk(defs, job);
    acc.chunk = { ...job, out: undefined, ms: Date.now() - t0 };
    mkdirSync(dirname(job.out), { recursive: true });
    writeFileSync(job.out + ".tmp", JSON.stringify(acc));
    renameSync(job.out + ".tmp", job.out);
    process.send({ ok: true, job, ms: Date.now() - t0 });
  } catch (e) {
    process.send({ ok: false, job, error: String(e.stack ?? e).slice(0, 800) });
  }
});
process.send({ ready: true });
