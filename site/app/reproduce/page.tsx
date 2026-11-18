import type { Metadata } from "next";
import { CopyBlock } from "@/components/CopyBlock";
import { PageHead, Panel } from "@/components/Ui";
import { REPO, repoFile } from "@/lib/format";

export const metadata: Metadata = { title: "Reproduce" };

const STEPS: { label: string; code: string; note: string }[] = [
  {
    label: "1 · Clone and install",
    note: "Node 24, Go 1.27, Rust stable. The stellar CLI 30.0.1 is only needed for the corpus checks.",
    code: `git clone ${REPO}.git\ncd xdr-cap-coverage-kit\nnpm ci`,
  },
  {
    label: "2 · Three-reader fixture tests (offline)",
    note: "Builds the Go and Rust readers, decodes the fixture ledgers in all three, and checks that injected divergences are caught. Same step as CI.",
    code: "node tools/livecheck/test.mjs",
  },
  {
    label: "3 · Re-run a slice of the backfill",
    note: "Reads ledger objects from SDF's public Galexie export on AWS Open Data. Resumable, one work file per 250-ledger chunk. A named sample keeps its own work dir and report. The published run covers 65450000-65499999.",
    code: "node tools/livecheck/backfill.mjs --name slice --range 65450000-65450249\nnode tools/livecheck/backfill.mjs --name slice --report   # reports/livecheck/backfill-slice.md",
  },
  {
    label: "4 · Follow mainnet live",
    note: "Polls the public export for the next ledger, checks it, appends flags to findings.jsonl and checkpoints state.json after every ledger.",
    code: "mkdir -p ~/.local/share/xck-livecheck/pubnet\nbash tools/livecheck/run-live.sh pubnet",
  },
  {
    label: "5 · Publish your own status.json",
    note: "The same file this site reads. --tip adds the network tip from Horizon so the lag is measured, not assumed.",
    code: "node tools/status/status.mjs --tip --out status.json\n# or keep it fresh every 60 s\nnode tools/status/status.mjs --tip --watch 60 --out /srv/status/status.json",
  },
  {
    label: "6 · Everything CI runs",
    note: "Every CI job, locally, PASS/FAIL per step.",
    code: "bash scripts/ci-local.sh",
  },
];

export default function Reproduce() {
  return (
    <div className="page">
      <PageHead eyebrow="Do not trust, reproduce" title="Run the same check yourself">
        <p>
          The live checker, the backfill and the numbers on this site come from the open-source kit. Details: <a href={repoFile("tools/livecheck/README.md")} target="_blank" rel="noopener noreferrer">tools/livecheck/README.md</a>.
        </p>
      </PageHead>
      <div className="steps">
        {STEPS.map((s) => (
          <Panel key={s.label}>
            <CopyBlock label={s.label} code={s.code} />
            <p className="dim small mt">{s.note}</p>
          </Panel>
        ))}
      </div>
      <Panel label="Limits">
        <ul className="bullets small">
          <li>Three readers can still share a mistake, for example a wrong XDR definition in all three. The checker only finds where they differ.</li>
          <li>Bug-shape hits mark transactions that exercise a known consumer bug. They are not failures of the readers.</li>
          <li>Long-tail and first-seen classes are relative to the recorded mainnet baseline in <code>reports/raw/frequency.json</code>.</li>
        </ul>
      </Panel>
    </div>
  );
}
