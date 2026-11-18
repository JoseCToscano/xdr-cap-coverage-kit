"use client";
import { Scene } from "./Scene";
import { useStatus } from "../StatusProvider";
import data from "@/data/static.json";
import { ISSUES, fmt, repoFile, txUrl, utc } from "@/lib/format";

const big = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const TWO53 = "9007199254740992";

export function Catch() {
  const { status: s } = useStatus();
  const h = data.hero;
  const bf = (k: string) => data.backfill.bug_shapes.find((b) => b.name.includes(k))?.txs ?? 0;
  const live = (k: string) => s.bug_shapes.find((b) => b.shape.includes(k))?.txs ?? 0;
  const drift = BigInt(h.drift); const off = (drift < 0n ? -drift : drift).toString();
  const ex = data.ex731;
  const r = data.repro1785;
  return (
    <Scene id="catch" n={2} eyebrow="The catch · known bug shapes on mainnet">
      {(seen) => (
        <div className="grid2 catch">
          <article className={`ccard ${seen ? "flash" : ""}`}>
            <span className="badge">Bug shape · flagged live</span>
            <h3>Muxed ID above 2^53</h3>
            <div className="meta">
              <a href={ISSUES[h.shape].url} target="_blank" rel="noopener noreferrer">js-stellar-sdk #1785</a> shape · {h.caps.join(", ")}<br />
              tx <a href={txUrl(h.tx)} target="_blank" rel="noopener noreferrer">{h.tx}</a><br />
              ledger {fmt(h.ledger)} · closed {utc(h.close)} · flagged {utc(h.detected_at)}
            </div>
            <div className={`reveal ${seen ? "on" : ""}`}>
              <dl>
                <div className="ckv"><dt>Muxed ID on chain</dt><dd>{big(h.muxedId)}</dd></div>
                <div className="ckv"><dt>2^53</dt><dd>{big(TWO53)}</dd></div>
                <div className="ckv"><dt>As a JS number</dt><dd className="warn">{big(h.asNumber)} <span className="dim">(off by {off})</span></dd></div>
                <div className="ckv"><dt>Seen</dt><dd>{fmt(bf("#1785"))} in backfill · {fmt(live("#1785"))} live · {fmt(data.baseline_shapes.muxed_ge_2_53)} in baseline</dd></div>
                {r && <div className="ckv"><dt>Repro</dt><dd>{r.before.replace(":", "")} · {r.after.replace(":", "")}</dd></div>}
              </dl>
              <p className="cnote">
                The repro for #1785 fails on js-stellar-sdk {r?.before.split(":")[0]} and passes on {r?.after.split(":")[0]} (<a href={repoFile("reports/divergence-matrix.md")} target="_blank" rel="noopener noreferrer">divergence matrix</a>).
                The three readers agree on these bytes; the risk is any consumer that turns the ID into a JS number. The kit keeps it as a regression case.
              </p>
            </div>
          </article>
          <article className={`ccard ${seen ? "flash d2" : ""}`}>
            <span className="badge">Bug shape · backfill</span>
            <h3>Nested SAC trust() creates a trustline</h3>
            <div className="meta">
              <a href={ISSUES["soroban.creates_trustline (#731 shape)"].url} target="_blank" rel="noopener noreferrer">wallet-backend #731</a> shape · CAP-0046, CAP-0067<br />
              {ex && <>tx <a href={txUrl(ex.tx)} target="_blank" rel="noopener noreferrer">{ex.tx}</a><br />ledger {fmt(ex.ledger)} · </>}
              {fmt(bf("#731"))} in backfill · {fmt(live("#731"))} live · {fmt(data.baseline_shapes.creates_trustline_731)} in baseline
            </div>
            <div className={`reveal d2 ${seen ? "on" : ""}`}>
              <p className="meta mt">{data.replay731.txs} real mainnet txs replayed through wallet-backend into PostgreSQL 17 + TimescaleDB. Verdict read from stored rows: TRUSTLINE/ADD state change.</p>
              <table className="builds">
                <caption className="sr">wallet-backend builds and the #731 verdict</caption>
                <tbody>
                  {data.replay731.builds.map((b) => (
                    <tr key={b.build}><td>{b.build === "head" ? "HEAD" : b.build}</td><td className="c">{b.commit}</td>
                      <td className={`r ${b.pass === b.total ? "pass" : "drop"}`}>{b.pass === b.total ? `${b.pass}/${b.total} STORED` : `${b.total - b.pass}/${b.total} DROPPED`}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      )}
    </Scene>
  );
}
