"use client";
import { useStatus } from "./StatusProvider";
import { Caps, Ident, Panel, Stat, Tx } from "./Ui";
import { ISSUES, duration, fmt, ledgerUrl, utc } from "@/lib/format";
import { HEALTH_LABEL, lagView } from "@/lib/lag";
import { ARM_MEANING } from "@/lib/meanings";
import data from "@/data/static.json";

export function FindingsFeed() {
  const { status: s, source, tip, now, error } = useStatus();
  const base = data.baseline;
  const lag = lagView(s, tip, now);
  const last = s.checker.last_ledger?.seq ?? s.checker.cursor;
  const F = s.flags;
  const fresh = source === "live" && lag.health !== "stale";
  const first = [...s.first_seen].sort((a, b) =>
    (Date.parse(b.detected_at ?? "") || 0) - (Date.parse(a.detected_at ?? "") || 0) || b.ledger - a.ledger || (a.arm ?? "").localeCompare(b.arm ?? ""));
  const firstTxs = new Set(first.map((f) => f.tx)).size;
  const ago = (iso?: string) => {
    const t = Date.parse(iso ?? "");
    if (Number.isNaN(t)) return null;
    const sec = Math.max(0, (now - t) / 1000);
    return sec < 86_400 ? duration(sec) : `${Math.floor(sec / 86_400)} d ${Math.floor((sec % 86_400) / 3600)} h`;
  };
  return (
    <>
      <p className="srcline">
        Source: {source === "live" ? "live feed" : "bundled snapshot"} written {utc(s.generated_at)}, ledgers {fmt(s.checker.first)} to {fmt(last)}. Refreshes every minute.
      </p>
      {error && <p className="srcline warn">{error}</p>}

      <div className="counters" role="group" aria-label="Live checker freshness">
        <Stat n={s.checker.ledgers} t="Ledgers checked" sub={`${fmt(s.checker.first)} to ${fmt(last)}, in order`} />
        <Stat n={s.checker.txs} t="Transactions" sub={`${fmt(s.checker.segments)} segments × 3 readers`} />
        <Stat n={lag.ledgersBehind ?? "-"} t="Ledgers behind tip" sub={`${HEALTH_LABEL[lag.health]}${lag.secondsBehind != null ? ` · ${duration(lag.secondsBehind)}` : ""}${lag.tip ? ` · tip ${fmt(lag.tip.ledger)}` : ""}`} />
        <Stat n={duration(lag.feedAgeSec)} t="Since last update" sub={utc(s.generated_at)} />
        <Stat n={F.disagreement} t="Disagreements" zero={F.disagreement === 0} sub={`across 3 readers · ${fmt(F.decode_failure)} decode failures · ${fmt(F.roundtrip_mismatch)} round-trip mismatches`} />
      </div>
      <div className={`livebar on h-${lag.health}`} role="status" aria-live="polite">
        <span>{fresh ? <><i className="dot" /><b>Live follower</b></> : <b>Live follower snapshot</b>}</span>
        <span>Since <b>{utc(s.checker.started_at)}</b></span>
        <span>Readers <b>{Object.values(s.readers).map((r) => r.lib).join(" · ")}</b></span>
        {lag.measuredBy && <span>Tip from <b>{lag.measuredBy === "browser" ? "your browser" : "the checker"}</b></span>}
      </div>

      <Panel label="First seen by our checker" corner={`${first.length} arms · ${firstTxs} txs`}>
        <p className="dim small">
          Union arms with zero occurrences in our {fmt(base.ledgers)}-ledger, {fmt(base.txs)}-transaction mainnet baseline, then seen by the live follower. Newest first. Not in our baseline does not mean never used on the network before.
        </p>
        {first.length === 0 ? <p className="dim">None yet.</p> : (
          <div className="tblwrap full">
            <table className="tbl findings-tbl">
              <thead><tr><th scope="col">Detected</th><th scope="col">Arm</th><th scope="col">Transaction</th><th scope="col" className="r">Ledger</th><th scope="col">CAPs (inferred)</th></tr></thead>
              <tbody>
                {first.map((f, i) => {
                  const meaning = f.arm ? ARM_MEANING[f.arm] : undefined;
                  const a = ago(f.detected_at);
                  return (
                    <tr key={f.tx + f.arm}>
                      <td className="nw">{utc(f.detected_at)}{a && <div className="dim small">{a} ago{i === 0 ? " · latest" : ""}</div>}</td>
                      <td><span className="mono ident"><Ident value={f.arm} /></span>{meaning && <div className="dim small meaning">{meaning}</div>}</td>
                      <td><Tx tx={f.tx} net={s.net} n={16} /></td>
                      <td className="r"><a href={ledgerUrl(f.ledger, s.net)} target="_blank" rel="noopener noreferrer">{fmt(f.ledger)}</a></td>
                      <td><Caps caps={f.caps} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="fine">Meanings paraphrase the Stellar XDR definitions. CAP tags are inferred from the arm. Each arm also has a corpus candidate in the repository under corpus/candidates/livecheck/pubnet-live.</p>
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
