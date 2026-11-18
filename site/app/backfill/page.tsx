import type { Metadata } from "next";
import { Caps, Panel, PageHead, Stat, Tx } from "@/components/Ui";
import data from "@/data/static.json";
import { ISSUES, fmt, repoFile, utc } from "@/lib/format";

export const metadata: Metadata = { title: "Backfill" };

const RD = [
  ["js", "JS", "js-stellar-sdk 17.4.0"],
  ["go", "Go", "go-stellar-sdk 0.9.0"],
  ["rust", "Rust", "rs-stellar-xdr 30.0.0"],
] as const;

export default function Backfill() {
  const b = data.backfill;
  const proto = Object.entries(b.protocol).map(([p, n]) => `P${p}: ${fmt(n as number)}`).join(", ");
  return (
    <div className="page">
      <PageHead eyebrow="Backfill · archived mainnet" title={`${fmt(b.ledgers)} ledgers, ${fmt(b.flags.disagreement)} disagreements`}>
        <p>
          Ledgers {fmt(b.ledger_min)} to {fmt(b.ledger_max)} ({utc(b.close_time_min)} to {utc(b.close_time_max)}, {proto}), read from SDF&apos;s public
          Galexie export and checked by the same three readers as the live follower. Report:{" "}
          <a href={repoFile("reports/livecheck/backfill.md")} target="_blank" rel="noopener noreferrer">reports/livecheck/backfill.md</a>.
        </p>
      </PageHead>

      <div className="counters" role="group" aria-label="Backfill totals">
        <Stat n={b.txs} t="Transactions" sub={`${fmt(b.segments)} segments × 3 readers`} />
        <Stat n={b.flags.disagreement} t="Disagreements" zero={b.flags.disagreement === 0} />
        <Stat n={b.flags.decode_failure} t="Decode failures" zero={b.flags.decode_failure === 0} />
        <Stat n={b.flags.roundtrip_mismatch} t="Round-trip mismatches" zero={b.flags.roundtrip_mismatch === 0} />
        <Stat n={b.flags.js_precision} t="JS precision hazards" zero={b.flags.js_precision === 0} />
      </div>

      <Panel label="Readers" corner={`${fmt(b.worker_hours)} worker-hours`}>
        <table className="tbl">
          <thead><tr><th scope="col">Reader</th><th scope="col">Library</th><th scope="col" className="r">Ledgers decoded</th><th scope="col" className="r">Byte round-trip</th><th scope="col" className="r">SEP-51 JSON round-trip</th></tr></thead>
          <tbody>
            {RD.map(([k, n, lib]) => {
              const r = b.readers[k] as { ok: number; roundtrip_ok: number; json_roundtrip_ok?: number };
              return <tr key={k}><td>{n}</td><td className="mono">{lib}</td><td className="r">{fmt(r.ok)}</td><td className="r">{fmt(r.roundtrip_ok)}</td><td className="r">{r.json_roundtrip_ok != null ? fmt(r.json_roundtrip_ok) : "-"}</td></tr>;
            })}
          </tbody>
        </table>
      </Panel>

      <Panel label="Bug shapes" corner={`${fmt(b.flagged_txs.bug_shape)} txs`}>
        <table className="tbl">
          <thead><tr><th scope="col">Shape</th><th scope="col" className="r">Txs</th><th scope="col">CAPs (inferred)</th><th scope="col">Examples</th></tr></thead>
          <tbody>
            {b.bug_shapes.map((s) => {
              const i = ISSUES[s.name];
              return (
                <tr key={s.name}>
                  <td>{i ? <a href={i.url} target="_blank" rel="noopener noreferrer">{i.label}</a> : s.name}<div className="dim small">{i?.note}</div></td>
                  <td className="r">{fmt(s.txs)}</td>
                  <td><Caps caps={s.caps} /></td>
                  <td>{s.examples.map((e) => <div key={e.tx}><Tx tx={e.tx} /> <span className="dim">L{fmt(e.ledger)}</span></div>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel label="Long-tail arms" corner={`${b.long_tail.length} arms · ${fmt(b.flagged_txs.long_tail)} txs`}>
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th scope="col">Arm</th><th scope="col" className="r">Txs</th><th scope="col">CAPs</th><th scope="col">Example</th></tr></thead>
            <tbody>
              {b.long_tail.map((a) => (
                <tr key={a.name}><td className="mono">{a.name}</td><td className="r">{fmt(a.txs)}</td><td><Caps caps={a.caps} /></td>
                  <td>{a.examples[0] ? <><Tx tx={a.examples[0].tx} /> <span className="dim">L{fmt(a.examples[0].ledger)}</span></> : "-"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
