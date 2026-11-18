"use client";
import Link from "next/link";
import { useState } from "react";
import { Scene } from "./Scene";
import { Scramble } from "../Scramble";
import { Wire } from "../Wire";
import { useStatus } from "../StatusProvider";
import data from "@/data/static.json";
import { REPO, fmt, utc } from "@/lib/format";

const LINES: [string, string][] = [
  [`git clone ${REPO}`, ""],
  ["cd xdr-cap-coverage-kit && npm ci", ""],
  ["node tools/livecheck/test.mjs", "# three readers, fixture ledgers"],
  ["bash harness/run.sh --mainnet", "# wallet-backend replay, real Postgres"],
  ["node tools/frequency/run.mjs --check", "# frequency study, checked"],
];

export function Close() {
  const { status: s } = useStatus();
  const [step, setStep] = useState(0);
  const b = data.backfill;
  const bad = (s.flags.disagreement ?? 0) + (s.flags.decode_failure ?? 0) + (s.flags.roundtrip_mismatch ?? 0);
  return (
    <Scene id="reproduce" n={5} eyebrow="Reproduce it" light>
      {(seen) => (
        <div className="closewrap">
          <div className="closebox">
            <Scramble as="p" className="ctitle" text="XDR/CAP Coverage Kit" duration={1800} play={seen} onDone={() => setStep((x) => Math.max(x, 1))} />
            <Scramble as="p" className="ctag" text={"Rare but valid Stellar XDR, tagged by CAP, measured against mainnet and checked by three independent readers."} duration={1500} play={step >= 1} onDone={() => setStep((x) => Math.max(x, 2))} />
            <pre className="cmd" tabIndex={0} aria-label="Commands to reproduce">
              {LINES.map(([l, c], i) => (
                <div key={l}>
                  <Scramble text={`$ ${l}`} duration={700} play={step >= 2 + i} onDone={() => setStep((x) => Math.max(x, 3 + i))} />
                  {c && step >= 3 + i && <span className="c">  {c}</span>}
                </div>
              ))}
            </pre>
            <p className="cfoot">
              {fmt(b.ledgers)} ledgers backfilled · {fmt(b.txs)} txs · 3 readers · {fmt(b.flags.disagreement)} disagreements<br />
              Live on mainnet since {utc(s.checker.started_at)} · {fmt(s.checker.txs)} txs · {fmt(bad)} disagreements
            </p>
            <p className="clinks"><Link href="/reproduce/">Step by step →</Link> <a href={REPO} target="_blank" rel="noopener noreferrer">Source on GitHub →</a></p>
          </div>
          <Wire />
        </div>
      )}
    </Scene>
  );
}
