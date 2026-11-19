# xdr-cap-coverage-kit

A test kit for code that reads the Stellar ledger.

The kit keeps a corpus of rare but valid XDR, one entry per shape, each tagged with the CAP that introduced it, the values a reader must decode, and (for most entries) the real `LedgerCloseMeta` it came from. The same corpus runs through the JS, Go and Rust SDKs, through a replay harness that feeds the ledgers to a real indexer (wallet-backend) and a real PostgreSQL, and through a static-analysis linter. Every number below comes from a command in this repo; the outputs are committed under `reports/` and `repros/*/RESULTS.txt`.

The [live checker](https://xck.stratocaster.ventures) has been following mainnet since 2026-11-16 13:10 CST (ledger 65,514,036). A [1:54 walkthrough](https://youtu.be/UhD7Ucvz1Ik) shows the same page. To verify the kit yourself, use the [five-minute check](#five-minute-check) below.

## [Built now]

| Part | What it does | Result today |
|---|---|---|
| Corpus (`corpus/`, schema v0.2.0) | 20 entries; 19 carry a real `LedgerCloseMeta` in Galexie layout, fetched from SDF's public Galexie archive: 9 testnet (`corpus/datalake/testnet`) and 10 mainnet (`corpus/datalake/pubnet`, Protocol 29). Provenance says who made each one: `submitted_by_kit` (5), `mined_from_testnet_history` (4, incl. the CAP-88 header), `mined_from_mainnet_history` (10, found by the frequency study), `synthetic` (1) | Protocol 30: CAP-84 `W...` muxed contract (`cap84-…`), CAP-88 `close_time_ms` (`cap88-…`), CAP-67 / CAP-73 SAC shapes, CAP-21 max-length vectors, CAP-38 issuer order, CAP-46 depth-3 auth tree. Mainnet (`mainnet-*`): muxed ID above 2^53, depth-4 auth tree, deployment as an auth-tree root, P keys in `extra_signers`, CCTP `mint_and_forward` event with an M address, nested SAC `trust()`, `ClaimPredicate.or`, `RevokeSponsorshipOp.signer`, SAC deploy from asset, fee bump with inner `tx_bad_auth` |
| Validator (`tools/check-corpus.mjs`) | Schema, byte-exact round-trip in rs-stellar-xdr (stellar CLI 30.0.1) and js-stellar-sdk 17.4.0, tx hash, semantic checks; for LCM entries: file hashes, both decoders re-encode the LCM byte-exact, JS JSON == Rust JSON, tx at its index, ledger checks | 447 checks ok, `all entries pass` |
| Golden checks (`--check-lcm`, `tools/check-lcm.mjs`) | Each LCM against stellar-core's own P28/P29/P30 LCM test goldens (shape) and, for testnet entries, against a second copy from Stellar RPC `getLedgers` (bytes, then part by part) | core: 19 agrees; RPC: 8 diverges, 11 no_golden (10 of them mainnet entries, which have an archive copy only). See finding 1 below. [reports/lcm-golden.md](reports/lcm-golden.md) |
| Coverage (`tools/coverage-report.mjs`) | Union-arm and enum coverage against every union in the `LedgerCloseMeta` type graph, from the reference implementation's JSON schema | Entry scope: 127 of 376 union arms (33.8%) across 45 of 64 union types. Ledger scope: 198 (52.7%). [reports/coverage.md](reports/coverage.md) |
| Real-network frequency (`tools/frequency/`) | Every union arm and every corpus / bug shape counted over real ledgers: 83,500 mainnet ledgers (25,249,661 transactions, Protocols 23 to 29) and 10,000 testnet ledgers (Protocol 30), with first-seen ledger and example transactions | 252 of 376 arms occur on mainnet; 60 of them in fewer than 100 per million transactions, and the corpus covers 16 of those 60. Muxed IDs above 2^53: 353 mainnet txs. [reports/frequency.md](reports/frequency.md) |
| Runners (`runners/go`, `runners/rust`, JS in the validator) | One row per check per entry, merged into a divergence matrix | Go 197 ok + 61 n/a, Rust crate 233 ok, stellar CLI 175 ok, JS 194 ok, 0 failures, 0 disagreements. [reports/divergence-matrix.md](reports/divergence-matrix.md) |
| Live differential checker (`tools/livecheck/`) | Every mainnet ledger decoded by three independent readers (js-stellar-sdk 17.4.0, go-stellar-sdk 0.9.0, rs-stellar-xdr 30.0.0), projected to one canonical token stream and compared; decode, disagreement, round-trip and JS-precision checks, plus long-tail, first-seen and bug-shape flags from the frequency study. Backfill over archived ranges and a live follower on SDF's public Galexie export | Backfill of ledgers 65,450,000 to 65,499,999 (50,000 ledgers, 15,148,882 txs, 30,347,764 segments x 3 readers): 0 decode failures, 0 disagreements, 0 round-trip mismatches, 0 JS precision hazards; 270 bug-shape txs (264 muxed ID >= 2^53, the #1785 shape; 6 nested SAC `trust()`, the #731 shape), 14,067 long-tail txs over 82 arms. Live follower (ledgers 65,514,036 to 65,568,027, running since 2026-11-16 13:10 CST; snapshot of [status.json](https://status.xck-status.dev/status.json) generated 2026-11-19 16:10 CST, rendered by `node tools/livecheck/snapshot.mjs`): 53,992 ledgers, 18,073,771 transactions, 0 decode failures, 0 disagreements, 0 round-trip mismatches, 0 JS precision hazards; 241 bug-shape txs (225 muxed ID >= 2^53, the #1785 shape; 16 nested SAC `trust()`, the #731 shape); 11 first-seen arms in 9 txs; 13,690 long-tail txs over 83 arms. Together with the backfill: 33,222,653 transactions as of this snapshot. [reports/livecheck/backfill.md](reports/livecheck/backfill.md) · [reports/livecheck/live-pubnet-snapshot.md](reports/livecheck/live-pubnet-snapshot.md) · 21 curated candidates, pending review, in [corpus/candidates](corpus/candidates/README.md), including one per first-seen arm |
| Replay harness (`harness/`) | Go `Adapter` interface; Galexie file store and a mock RPC `getLedgers`; wallet-backend adapter that runs wallet-backend's own `processLedger` + `insertIntoDB` into real PostgreSQL 17 + TimescaleDB 2.28.2, then decides **pass / mishandled / dropped / halt** by SQL over the stored rows | #716, #729, #731 reproduced on pre-fix commits, passing on the fixes and on HEAD `3e22515a`; 16 of 16 verdicts as expected. [reports/replay-matrix.md](reports/replay-matrix.md) |
| Mainnet replay probe (`harness/cmd/mainnet`, `bash harness/run.sh --mainnet`) | Real mainnet transactions picked by the frequency study, replayed through the same wallet-backend adapter on HEAD and the #716 / #729 / #731 pre-fix and fix commits; expectations derived from the ledger by `tools/mainnet-cases.mjs` | 4 transactions with P keys in `extra_signers` (incl. the earliest, L65,300,015): pass on all 7 builds. The 7 Soroban transactions that created a trustline (all call SAC `trust()` nested in the auth tree): TRUSTLINE/ADD stored on HEAD and on the #731 fix, dropped on every earlier build; participants pass everywhere. [reports/replay-mainnet.md](reports/replay-mainnet.md) |
| SDK and app repros (`repros/`) | Pinned buggy vs fixed versions | js-stellar-sdk #1766, #1785, #1789 reproduced; P30 probe (17.2.1 cannot decode `W`); stellar-x402-policies muxed-recipient bug reproduced on `fd9c478`, fixed on `a1c5a03` |
| Linter (`linter/`, `xdrlint`) | `go/analysis` rule XDRL002: recursion over ScVal / SorobanAuthorizedInvocation / ClaimPredicate with no depth cap | analysistest: 5 seeded violations flagged, clean fixture 0. wallet-backend `3e22515a`: 1 finding, the uncapped recursion pattern reported as wallet-backend #820 ([linter/SCAN-wallet-backend.txt](linter/SCAN-wallet-backend.txt)) |
| Status site (`site/`, `tools/status/`) | Read-only Next.js static site: checker position against the network tip, the three readers' counters, first sightings, bug-shape hits, backfill, the 376-arm grid and the reproduce commands. Live data from a `status.json` the checker host rewrites every minute (`tools/status/status.mjs`), with the build-time snapshot as fallback. Docker image and deploy notes for the checker host in `deploy/` | Live at [xck.stratocaster.ventures](https://xck.stratocaster.ventures). [site/README.md](site/README.md) · [deploy/README.md](deploy/README.md) |
| CI (`.github/workflows/ci.yml`) | 7 jobs: corpus + freshness, live checker (three readers on fixture ledgers), status site (data freshness, static build), JS repros, x402 repro, wallet-backend (TimescaleDB service, incl. the mainnet replay probe), linter. `scripts/ci-local.sh` runs the same steps locally | All 21 local steps pass |

## Five-minute check

Needs Node 24, Go, git and Docker.

```sh
git clone https://github.com/JoseCToscano/xdr-cap-coverage-kit && cd xdr-cap-coverage-kit && npm ci
docker run -d --rm --name xck-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres timescale/timescaledb:2.28.2-pg17
until docker exec xck-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
XCK_PG_ADMIN_DSN='postgres://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable' bash harness/run.sh
node tools/frequency/run.mjs --check
```

You should see 16 verdicts marked OK, then all verdicts as expected, and `frequency report is fresh`. No Docker? Set `PG_BIN` to a local PostgreSQL 17 `bin/` directory with TimescaleDB and skip the DSN; the script starts and stops its own server.

Timing, measured Nov 16 with `PG_BIN` and a warm wallet-backend clone: replay 19 s, frequency check under 1 s. A cold run adds the clone and Go modules. The Docker lines use the same TimescaleDB image as the CI service.

## [Roadmap]

Planned work in three milestones. Parts of Milestone 2 already run in this repo (see the table above); the milestone delivers them to its completion checks.

### Milestone 1: MVP: corpus, manifest and dual-passphrase Rust generator

- **1.1 Schema v1, coverage manifest and initial core-emitted corpus.** Schema v1 (LedgerCloseMeta references, `check_lcm_golden`, generation records); per-CAP `coverage.json` for every Protocol 13 to 30 CAP that changed XDR or meta, with an explicit gap register; real core-emitted entries for every high-risk shape indexers are known to mishandle (issuer sort, muxed source and destination, muxed and offer IDs, max-length vectors, nested auth, colliding map keys) plus CAP-67, 71, 73, 84, 87, 88. *Done when:* Tagged release; every entry passes schema validation in CI; `coverage.json` has a row for every listed CAP with entry IDs or an explicit gap; every listed high-risk shape has at least one non-synthetic entry; CI green.
- **1.2 Rust core-emitted generator and `--check-lcm` golden verification.** Rust generator on rs-stellar-xdr that mines history and drives an isolated local stellar-core under both the testnet and mainnet passphrases; validator decodes stellar-core's `--check-lcm` goldens and checks matching corpus shapes field by field. *Done when:* One command regenerates the corpus on a clean runner for both passphrases; all entries round-trip byte-exact through rs-stellar-xdr; golden check runs in CI and reports agree / no-golden per entry; the generator refuses a deliberately corrupted fixture.

### Milestone 2: Replay harness, SDK conformance, Go linter and security plan

- **2.1 Streaming Galexie replay harness and wallet-backend reference adapter.** Harness that streams corpus ledgers in Galexie layout to local disk or local S3, a documented `Adapter` interface (`Name` / `Prepare` / `IngestLedgers` / `Verdict` / `Close`, [harness/adapter.go](harness/adapter.go)), and a wallet-backend adapter on Postgres that gives verdicts from stored rows. *Done when:* CI reproduces wallet-backend #729, #731 and #716 on pre-fix commits and passes on the fixed commits; the harness runs the full corpus under a fixed memory limit and fails if exceeded; adapter interface documented.
- **2.2 Cross-SDK conformance runner and divergence matrix.** Runners for js-stellar-sdk, go-stellar-sdk and rs-stellar-xdr across four layers (round-trip, transaction hash, domain helpers, ledger meta); merged divergence matrix; sibling-issue checklist. *Done when:* CI reproduces js-stellar-sdk #1766, #1785 and #1789 on pre-fix tags and passes on fixed tags; matrix published on every run; sibling-issue template and workflow in the repo.
- **2.3 Go static-analysis linter.** `go/analysis` analyzer with three rules: XDRL001 unvalidated fields, XDRL002 missing depth/size caps on recursive structures, XDRL003 participants from envelope instead of meta; seeded violation fixtures. *Done when:* `analysistest` fixtures pass with every seeded violation flagged by the right rule ID; the linter runs in CI against current wallet-backend with zero unresolved findings: every finding is either fixed upstream or documented and triaged in the findings report (security-relevant findings disclosed privately first).
- **2.4 STRIDE threat model and monitoring plan.** Threat model for the kit itself (no contracts deployed, no keys or funds held): corpus integrity, unbounded-recursion DoS against our own tools, CI isolation for fork PRs, private-first disclosure, protocol-upgrade monitoring. *Done when:* `SECURITY.md` and `docs/threat-model.md` merged; each mitigation linked to a CI check or test; scheduled upgrade-watch job running.

### Milestone 3: Production release, full upstream sweep, guide and user testing

- **3.1 Full Protocol 20 to 30 CAP expansion and upstream audit sweep.** Corpus expanded to all Protocol 20 to 30 shapes on both passphrases; full run against wallet-backend, stellar-etl and the three SDKs; every failure triaged and filed upstream, with sibling issues. *Done when:* `coverage.json` shows every P20 to P30 shape covered or justified as a gap; findings report with one row per finding linking a filed issue (security findings disclosed privately first); every failure maps to an issue.
- **3.2 Indexer-hardening guide.** MDX for developers.stellar.org: manifest-generated validated-vs-unvalidated field table, depth and size caps, participants from meta, SEP-23 muxed / signed-payload / `W` handling, checklist matching XDRL001 to XDRL003. *Done when:* PR opened to developers.stellar.org; CI check proves the field table equals the manifest; review requested from a stellar-core or platform engineer.
- **3.3 Reusable GitHub Action, upstream CI PRs and external maintainer testing.** A GitHub Action any SDK or indexer can add to run the corpus; PRs proposing it upstream; structured testing sessions with external maintainers. *Done when:* Action published and used in at least one external repo or open upstream PR; external feedback recorded with resulting issues closed or scheduled.
- **3.4 v1.0 release, protocol-upgrade watcher and maintenance runbook.** Tagged v1.0 with Protocol 30 coverage; watcher against new stellar-xdr tags and testnet upgrades; 12-month maintenance plan and upgrade runbook. *Done when:* v1.0 tag and release notes; CI green; watcher running on schedule; runbook exercised once against the latest stellar-xdr tag or release candidate.

## Findings from this run

1. **RPC and the Galexie archive do not serve the same bytes for a ledger, and RPC does not serve the same bytes twice.** For 8 testnet ledgers, 6 `getLedgers` requests returned 2 to 4 distinct byte strings, none equal to the archive copy (`corpus/datalake/rpc-variance.json`). Header, tx set, results and contract events match; the `LedgerCloseMetaExt` arm, the order of ledger-entry changes inside an operation (state/updated pairs stay together) and diagnostic events differ. Anything that hashes LCM bytes or depends on change order sees different data depending on the copy.
2. **wallet-backend #716 has a third outcome in between.** Replaying the CAP-40 P-signer ledger: before #693 the P key is stored truncated (`mishandled`, 32-byte payload); #693 turns that into an error that stops the ledger (`halt`, 0 of 12 transactions stored); #729 stores it (`pass`).
3. **Soroban transactions with a muxed source never reach a ledger.** Testnet rejected both a muxed transaction source and a muxed operation source on a SAC transfer with `tx_soroban_invalid` (`corpus/raw/wb716-soroban-muxed-*-source.json`), so #716's "Soroban op participants" producer is unreachable from valid ledgers.
4. **Commits pinned to go-stellar-sdk v0.7.3 cannot read any Protocol 30 ledger** (`xdr view: unknown union discriminant ... 3`, the `signed_ms` header). The replay runs P30 cases on those commits with a dependency-only shim (`go get github.com/stellar/go-stellar-sdk@v0.8.0`); every row says whether it was used.
5. **XDRL002 finds one unbounded auth-tree walk in wallet-backend** (`internal/indexer/processors/contract_deploy.go:116`), the uncapped recursion pattern reported as wallet-backend #820. Practical depth is limited upstream on the standard decode path (go-xdr default decode depth 1500 in the pinned version; transaction size limits apply; the lazy `xdr view` path was not checked), so this is hardening, not a halt.

### Private-first disclosure

Any finding that can crash an indexer or stop it from ingesting (a `halt` verdict on a current release) is reported privately to the maintainers through the project's security policy first, and only published after a fix or an agreed date. Everything in this README was already fixed upstream or is a hardening note; no issue has been filed from this run.

## Run it

Node 24, Go 1.27, Rust stable, the `stellar` CLI 30.0.1, and for the replay a PostgreSQL with TimescaleDB (`XCK_PG_ADMIN_DSN`, or `PG_BIN` for a local one).

```sh
npm ci
node tools/check-corpus.mjs --check-lcm     # corpus + golden checks (offline)
node tools/coverage-report.mjs              # reports/coverage.md
node tools/frequency/run.mjs                # reports/frequency.md (network: ~35 min on 8 cores, resumable)
(cd runners/go && go run .)                 # Go runner
(cd runners/rust && cargo run --release)    # Rust runner
node tools/divergence-matrix.mjs            # reports/divergence-matrix.md
bash repros/js-stellar-sdk/run.sh           # SDK repros + P30 probe
bash repros/x402-muxed-recipient/run.sh     # x402 policy repro
bash repros/wallet-backend/run.sh           # wallet-backend column-type repros
bash harness/run.sh                         # replay matrix into real Postgres
(cd linter && go test ./...)                # analysistest
bash linter/scan-wallet-backend.sh          # scan wallet-backend at a pinned commit
bash scripts/ci-local.sh                    # all of the above, PASS/FAIL per step
```

The checks run offline. Network is used only to clone wallet-backend / stellar-x402-policies, download modules, and by the capture tools (`tools/capture-testnet.mjs`, `tools/fetch-lcm.mjs`, `tools/check-lcm.mjs --fetch`), which use random Friendbot-funded keys held in memory and never written to disk.

## Caveats

- `scval-map-key-collision` is still synthetic (built with the SDK, no ledger).
- The P30 replay rows on pre-fix/fix commits for #716-classic and #731 use the SDK shim above; the HEAD rows and all #716/#729 rows run unmodified.
- soroban-sdk 28 (used by stellar-x402-policies) cannot decode a `W...` argument at all (`error: Invalid`), on both commits.
- The capture script was run several times while it was being fixed; failed runs left extra testnet transactions. Only the final run's transactions are in the corpus.
- The RPC copies in `corpus/datalake/testnet-rpc` are one of several byte strings RPC returned; see finding 1.

## License

Apache-2.0
