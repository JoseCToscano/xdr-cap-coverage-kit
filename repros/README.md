# Repros

Each repro pins a buggy and a fixed version of upstream code and runs the same corpus input on both. The scripts exit non-zero if the buggy one does not fail or the fixed one does not pass. Real output is committed next to each script in `RESULTS.txt` (recorded Nov 13, 2026).

| Sighting | Corpus entry | Buggy | Fixed | Result |
|---|---|---|---|---|
| [js-stellar-sdk #1789](https://github.com/stellar/js-stellar-sdk/issues/1789) scValToNative drops colliding map keys | `scval-map-key-collision` (synthetic) | 17.2.1 | 17.3.0 | 17.2.1 returns `{"1":20}` for a 2-entry map; 17.3.0 throws |
| [js-stellar-sdk #1785](https://github.com/stellar/js-stellar-sdk/issues/1785) muxed and offer IDs | `cap27-…` | 17.2.1 | 17.3.0 | 17.2.1: `id()` is `"0x10"` for ID 16, offer ID 2^53+1 encodes as 2^53; 17.3.0 rejects both |
| [js-stellar-sdk #1766](https://github.com/stellar/js-stellar-sdk/pull/1766) issuers ordered by strkey text | `cap38-…` (testnet ledger 5718666) | 17.2.0 | 17.2.1 | 17.2.0 rejects the pair core accepted; 17.2.1 accepts it and the pool ID equals the on-ledger `LB4JJ7LZ…A4QZ` |
| P30 probe (no issue): SAC transfer `to` = M / W | `cap67-…`, `cap84-…` | 17.2.1 | 17.3.0, 17.4.0 | 17.2.1 cannot decode `W` (`unknown enum value 5`); 17.3.0 and 17.4.0 return M and W unchanged |
| stellar-x402-policies merchant allowlist rejects a muxed recipient | `cap67-…` (`to` ScVal from the ledger) | `fd9c478` | `a1c5a03` | `fd9c478`: `Error(Contract, #3404)` = NotAllowed; `a1c5a03`: pass. soroban-sdk 28 cannot decode the `cap84` W argument on either (`error: Invalid`) |
| [wallet-backend #716](https://github.com/stellar/wallet-backend/issues/716) AddressBytea truncates | `cap27-…`, `cap40-…` | `79ea2acd` | `6e5a5910` | Column type: M with ID 2^64-1 reads back undecodable. Full replay: see below |
| [wallet-backend #729](https://github.com/stellar/wallet-backend/pull/729) P signer halts ingestion | `cap40-…` (ledger 4437357) | `2a0a84ea` | `2c873353` | Column type rejects the P signer. Full replay: see below |
| [wallet-backend #731](https://github.com/stellar/wallet-backend/issues/731) SAC `trust()` has no trustline state change | `cap73-…` (ledger 5718668) | `764a4f5b` | `c152783c` | Full replay: see below |

## wallet-backend full replay (`harness/`)

`repros/wallet-backend/RESULTS.txt` has two parts: the column-type repros (`run.sh`, calls the storage types directly) and the full replay (`bash harness/run.sh`): the corpus ledger goes through wallet-backend's own `processLedger` and `insertIntoDB` into real PostgreSQL 17.12 + TimescaleDB 2.28.2, and the verdict is read from the stored rows.

| Issue | Ledger | pre-fix | fix | HEAD `3e22515a` |
|---|---|---|---|---|
| #716 (P signer producer) | 4437357 | `79ea2acd` **mishandled**: signer stored as a 32-byte P key | `6e5a5910` **halt**: COPY fails, 0 of 12 txs stored | **pass** |
| #716 classic control (muxed payment) | 5699707 | `79ea2acd` (shim) **pass** | | **pass** |
| #729 | 4437357 | `2a0a84ea` **halt**: 0 of 12 txs stored | `2c873353` **pass**: full P key stored | **pass** |
| #731 | 5718668 | `764a4f5b` (shim) **dropped**: only BALANCE/DEBIT | `c152783c` (shim) **pass**: TRUSTLINE/ADD stored | **pass** |

HEAD also passes all four through the mock RPC `getLedgers` source. `764a4f5b` without the shim halts at fetch (`unknown union discriminant ... 3`): go-stellar-sdk v0.7.3 has no Protocol 30 XDR.

#716 producer 1 (Soroban op with a muxed source) cannot be reproduced from a ledger: testnet rejects such transactions with `tx_soroban_invalid` (`corpus/raw/wb716-soroban-muxed-tx-source.json`, `…-op-source.json`). Producer 2 (SEP-41 event with a muxed topic) needs a custom token contract and is planned for the corpus expansion (Milestone 3.1).

## Run

```sh
bash repros/js-stellar-sdk/run.sh
bash repros/x402-muxed-recipient/run.sh      # clones JoseCToscano/stellar-x402-policies (X402_SRC to reuse)
bash repros/wallet-backend/run.sh            # clones stellar/wallet-backend (WB_SRC to reuse)
bash harness/run.sh                          # needs XCK_PG_ADMIN_DSN or PG_BIN
```
