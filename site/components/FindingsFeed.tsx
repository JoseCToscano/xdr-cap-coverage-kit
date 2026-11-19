"use client";
import { useStatus } from "./StatusProvider";
import { Caps, Ident, Panel, Tx } from "./Ui";
import { ISSUES, fmt, ledgerUrl, utc } from "@/lib/format";
import data from "@/data/static.json";

export function FindingsFeed() {
  const { status: s, source } = useStatus();
  const base = data.baseline;
  return (
    <>
      <p className="srcline">
        Source: {source === "live" ? "live feed" : "bundled snapshot"} written {utc(s.generated_at)}, ledgers {fmt(s.checker.first)} to {fmt(s.checker.last_ledger?.seq ?? s.checker.cursor)}.
      </p>

      <Panel label="First sightings" corner={`${s.first_seen.length} arms`}>
        <p className="dim small">
          Union arms with zero occurrences in the {fmt(base.ledgers)}-ledger, {fmt(base.txs)}-transaction mainnet baseline, seen live for the first time.
        </p>
        <div className="cards">
          {s.first_seen.map((f) => (
            <article className="card" key={f.tx + f.arm}>
              <h3 className="arm big"><Ident value={f.arm} /></h3>
              <dl className="kv">
                <div><dt>Transaction</dt><dd><Tx tx={f.tx} net={s.net} n={16} /></dd></div>
                <div><dt>Ledger</dt><dd><a href={ledgerUrl(f.ledger, s.net)} target="_blank" rel="noopener noreferrer">{fmt(f.ledger)}</a></dd></div>
                <div><dt>Closed</dt><dd>{utc(f.close_time)}</dd></div>
                <div><dt>Detected</dt><dd>{utc(f.detected_at)}</dd></div>
                <div><dt>CAPs (inferred)</dt><dd><Caps caps={f.caps} /></dd></div>
                <div><dt>Baseline txs</dt><dd>0</dd></div>
              </dl>
            </article>
          ))}
          {!s.first_seen.length && <p className="dim">None yet.</p>}
        </div>
      </Panel>

      <Panel label="Reader findings" corner={`${s.reader_findings.length}`}>
        {s.reader_findings.length === 0 ? (
          <p className="okline">No disagreements, decode failures, round-trip mismatches or JS precision hazards across {fmt(s.checker.txs)} live transactions.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th scope="col">Type</th><th scope="col">Tx</th><th scope="col">Ledger</th><th scope="col">Detected</th></tr></thead>
            <tbody>{s.reader_findings.map((f) => <tr key={f.tx + f.type}><td>{f.type}</td><td><Tx tx={f.tx} net={s.net} /></td><td>{fmt(f.ledger)}</td><td>{utc(f.detected_at)}</td></tr>)}</tbody>
          </table>
        )}
      </Panel>

      <Panel label="Bug-shape hits" corner={`${fmt(s.flagged_txs.bug_shape)} txs`}>
        <p className="dim small">Transactions with the shape behind a bug the kit reproduces. They decode identically in all three readers; the risk is in what consumers do with them.</p>
        <div className="cards">
          {s.bug_shapes.map((b) => {
            const i = ISSUES[b.shape];
            const baseTxs = b.shape.includes("#1785") ? data.baseline_shapes.muxed_ge_2_53 : b.shape.includes("#731") ? data.baseline_shapes.creates_trustline_731 : null;
            return (
              <article className="card" key={b.shape}>
                <h3 className="arm">{i ? <a href={i.url} target="_blank" rel="noopener noreferrer">{i.label}</a> : <Ident value={b.shape} />}</h3>
                <p className="small">{i?.note ?? b.shape}</p>
                <dl className="kv">
                  <div><dt>Live txs</dt><dd>{fmt(b.txs)}</dd></div>
                  {baseTxs != null && <div><dt>Baseline txs</dt><dd>{fmt(baseTxs)} <span className="dim">of {fmt(base.txs)}</span></dd></div>}
                  <div><dt>CAPs (inferred)</dt><dd><Caps caps={b.caps} /></dd></div>
                </dl>
                <div className="k mt">Most recent</div>
                <ul className="txs">
                  {b.recent.slice(0, 8).map((f) => <li key={f.tx}><Tx tx={f.tx} net={s.net} /> <span className="dim">L{fmt(f.ledger)} · {utc(f.close_time)}</span></li>)}
                </ul>
              </article>
            );
          })}
        </div>
        <div className="replay">
          <div className="k">wallet-backend #731 replay on real mainnet transactions</div>
          <p className="small dim">{data.replay731.txs} mainnet transactions that create a trustline, ingested by wallet-backend into PostgreSQL + TimescaleDB on each build; the verdict is read from the stored rows.</p>
          <table className="tbl">
            <thead><tr><th scope="col">Build</th><th scope="col">Commit</th><th scope="col">Trustline stored</th><th scope="col">Verdict</th></tr></thead>
            <tbody>
              {data.replay731.builds.map((r) => (
                <tr key={r.build}><td>{r.build}</td><td className="mono hash" title={r.commit}>{r.commit}</td><td>{r.pass} / {r.total}</td><td className={r.verdicts.includes("pass") && r.verdicts.length === 1 ? "ok" : "warn"}>{r.verdicts.join(", ")}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel label="Long-tail arms" corner={`${fmt(s.long_tail.arms)} arms · ${fmt(s.long_tail.txs)} txs`}>
        <p className="dim small">Arms seen in fewer than 100 per million baseline mainnet transactions. Each links one example.</p>
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th scope="col">Arm</th><th scope="col" className="r">Live txs</th><th scope="col">CAPs</th><th scope="col">Example</th></tr></thead>
            <tbody>
              {s.long_tail.top.map((a) => (
                <tr key={a.arm}>
                  <td className="mono ident"><Ident value={a.arm} /></td>
                  <td className="r">{fmt(a.txs)}</td>
                  <td><Caps caps={a.caps} /></td>
                  <td>{a.example ? <><Tx tx={a.example.tx} net={s.net} /> <span className="dim">L{fmt(a.example.ledger)}</span></> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
