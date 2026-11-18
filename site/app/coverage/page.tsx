import type { Metadata } from "next";
import { CoverageGrid } from "@/components/CoverageGrid";
import { CoverageScene } from "@/components/scenes/Coverage";
import { Panel } from "@/components/Ui";
import data from "@/data/static.json";
import { fmt, repoFile, utc } from "@/lib/format";

export const metadata: Metadata = { title: "Coverage" };

export default function Coverage() {
  const b = data.baseline;
  return (
    <>
      <CoverageScene standalone />
      <div className="page">
        <Panel label="Arms by union type" corner={`${data.coverage.types} types`}>
          <p className="dim small" style={{ marginBottom: 12 }}>
            Data: <a href={repoFile("reports/frequency.md")} target="_blank" rel="noopener noreferrer">reports/frequency.md</a>, <a href={repoFile("reports/coverage.md")} target="_blank" rel="noopener noreferrer">reports/coverage.md</a>. Filter by class or corpus coverage; hover or focus a cell for its count.
          </p>
          <CoverageGrid types={data.types} baselineTxs={b.txs} />
        </Panel>
        <Panel label="Baseline samples">
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th scope="col">Sample</th><th scope="col">Network</th><th scope="col" className="r">Ledgers</th><th scope="col" className="r">Transactions</th><th scope="col">Close times</th><th scope="col">Description</th></tr></thead>
              <tbody>
                {b.samples.map((s) => (
                  <tr key={s.name}><td className="mono">{s.name}</td><td>{s.net}</td><td className="r">{fmt(s.ledgers)}</td><td className="r">{fmt(s.txs)}</td><td className="small nw">{utc(s.close_time_min).slice(0, 10)} to {utc(s.close_time_max).slice(0, 10)}</td><td className="small">{s.description}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dim small mt">Decoder: {data.xdr.split(" xdr:")[0]}. The grid uses the pubnet samples only.</p>
        </Panel>
      </div>
    </>
  );
}
