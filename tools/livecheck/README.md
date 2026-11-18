# Live differential checker (`tools/livecheck/`)

Replaying bugs that someone already reported only proves the past. This tool
watches what the network actually sends: every ledger is decoded by three
independent XDR readers, each reader's result is projected to the same
canonical form, and anything they disagree on, cannot decode, cannot
re-encode, or have rarely or never seen before is flagged and turned into a
corpus candidate.

## Readers

| Reader | Library | Where |
|---|---|---|
| JS | js-stellar-sdk 17.4.0 (js-xdr 5 schemas), strkeys via the SDK's `StrKey`, `Address`, `SignerKey`, `encodeMuxedAccountToAddress`, 128/256-bit ints via `partsTo128BigInt` / `partsTo256BigInt` | `canon.mjs` (`jsProject`) |
| Go | go-stellar-sdk 0.9.0 `xdr`, strkeys via `MuxedAccount.GetAddress`, `ScAddress.String`, `SignerKey.GetAddress`, `ClaimableBalanceId.EncodeToStrkey`, `strkey.Encode` | `go/main.go` (long-running process) |
| Rust | rs-stellar-xdr 30.0.0 (the crate behind the stellar CLI): decode, re-encode, serde SEP-51 JSON, JSON back to XDR | `rust/src/main.rs` (long-running process); its JSON is projected by `canon.mjs` (`rustProject`) using the crate's own JSON schema |

## Canonical projection

A type-driven walk in XDR declaration order emits one token per value:
`U<n>` union discriminant, `E<n>` enum value, `I<n>` integer as an exact
decimal (64-bit values never pass through a float; 128/256-bit parts are folded
to one integer), `B0/B1`, `X<hex>` opaque and string bytes, `O0/O1` optional,
`N<n>` array length, `K<strkey>` for every account, muxed account (M), contract
(C), muxed contract (W), claimable balance (B), liquidity pool (L) and signer
key (G/T/X/P) encoded by that reader's own SDK, and `A<hex>` for asset codes.
That covers amounts, muxed IDs, addresses, asset issuer/code, ScVal maps and
vecs, authorization trees, events (topics and data), fees and close times,
because each is a value somewhere in the walk.

Tokens are grouped into segments: `L` (ledger level), one per
`TransactionEnvelope` and one per `TransactionResultMeta(V1)`. Each segment is
hashed (sha256 over the tokens) in every reader; only segments whose hashes
differ are dumped and compared token by token, which reports the first
differing token, the JSON path in the Rust decode, and the reader that is the
odd one out. Rust's SEP-51 arm and enum names are mapped to XDR numeric values
by matching them to the JS schema's case names (`buildTables`); the mapping
must be complete and one-to-one or the checker refuses to start.

## Flags

| Flag | Meaning |
|---|---|
| `decode_failure` | a reader cannot decode the ledger; localized by decoding each envelope / result meta slice on its own |
| `disagreement` | readers decode the same bytes to different canonical values |
| `roundtrip_mismatch` | decode then encode is not byte-identical (all three); Rust also SEP-51 JSON back to XDR |
| `js_precision` | a 64-bit value at or above 2^53 surfaces as a JS `number` in the SDK's high-level objects (`TransactionBuilder.fromXDR`, `humanizeEvents`); checked only for transactions that contain such a value |
| `first_seen` | a union arm absent from the mainnet baseline (`reports/raw/frequency.json`) |
| `long_tail` | a union arm seen in fewer than 100 per million baseline mainnet transactions |

Each flagged transaction becomes a candidate JSON with inferred CAP tags
(`check.mjs`, `CAP_RULES`; marked `caps_inferred`), the flags, tx hash, ledger,
close time, the source object URL, and the raw XDR of the envelope and its
`TransactionResultMetaV1`. Candidates are not corpus entries: they need review
and expected checks before they move to `corpus/entries`.

## Run it

```sh
node tools/livecheck/test.mjs                                 # fixtures, offline (also in CI)
node tools/livecheck/backfill.mjs --range 65450000-65499999   # resumable, .work/ per 250-ledger chunk
node tools/livecheck/backfill.mjs --name spread --every 58800000:65400000:100000:500
node tools/livecheck/backfill.mjs --report [--name spread]    # reports/livecheck/backfill[-spread].{md,json}
setsid nohup nice -n 10 bash tools/livecheck/run-live.sh pubnet \
  >> ~/.local/share/xck-livecheck/pubnet/live.log 2>&1 < /dev/null &   # live follower
```

The live follower polls SDF's public Galexie export on AWS Open Data for the
next ledger object (every 2.5 s), checks it, appends each flag to
`findings.jsonl`, writes candidates (at most 3 per arm, 50 per reader-finding
type), and rewrites `latest.md` once a minute, all under
`~/.local/share/xck-livecheck/<net>/`. The cursor is checkpointed after every
ledger in `state.json`, so a restart resumes at the next ledger; `run-live.sh`
restarts it if it exits. `XCK_RPC_URL` adds a Stellar RPC `getLedgers`
fallback for ledgers that have not reached the archive after 2 minutes.

Ledgers are fetched and checked by `XCK_LIVE_WORKERS` worker processes
(default 3; each runs its own JS checker and Go and Rust readers) up to
`XCK_LIVE_WINDOW` ledgers ahead of the cursor, and committed strictly in
ledger order: no ledger is skipped, and first-seen is decided at commit time,
so the findings are the same as a single sequential reader's. Behind the tip
this catches up at several times the network's ~10 ledgers per minute (about
250 per minute with 3 workers on an 8-core host); at the tip it polls for the
next object.

Lag is measured, not assumed. Once a minute the follower reads the network tip
from Horizon (`XCK_TIP_URL`) and writes `state.lag` and a "Lag behind tip"
line in `latest.md`: cursor, network tip, ledgers behind, minutes behind (from
the cursor ledger's own close time), catch-up rate and ETA to the tip.
`state.host_pauses` counts wall-clock gaps in which the process did not run at
all (a suspended host); the follower resumes at the next ledger after one.

## Limits

- Three readers can still share a mistake (for example a wrong XDR definition
  in all three); the checker only finds where they differ.
- The JS precision check scans the SDK's transaction and event objects, not
  every helper an app might call.
- First-seen and long-tail depend on the baseline sample; the recent backfill
  window is part of that baseline, so first-seen is zero there by construction.
- CAP tags on candidates are inferred from the arms a transaction touches.
