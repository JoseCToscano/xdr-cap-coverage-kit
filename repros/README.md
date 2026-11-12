# Repros

Each repro pins a buggy version and a fixed version of the upstream code and runs the same check on both. Expected: the buggy one fails, the fixed one passes. The scripts exit non-zero if that is not what happens. Real output is saved next to each script in `RESULTS.txt` (recorded Nov 12, 2026).

| Sighting | Buggy pin | Fixed pin | Result |
|---|---|---|---|
| [js-stellar-sdk #1789](https://github.com/stellar/js-stellar-sdk/issues/1789) scValToNative drops colliding map keys | @stellar/stellar-sdk 17.2.1 | 17.3.0 (PR #1778) | Reproduced. 17.2.1 returns `{"1":20}` for a 2-entry map. 17.3.0 throws a TypeError. |
| [js-stellar-sdk #1785](https://github.com/stellar/js-stellar-sdk/issues/1785) muxed and offer IDs that encode a different ID | 17.2.1 | 17.3.0 (PR #1780) | Reproduced. 17.2.1: `id()` returns `"0x10"` for the M-address of ID 16, and offer ID 2^53+1 encodes as 2^53. 17.3.0 rejects both. |
| [js-stellar-sdk #1766](https://github.com/stellar/js-stellar-sdk/pull/1766) issuers ordered by strkey text | 17.2.0 | 17.2.1 | Reproduced. 17.2.0 rejects a valid pool asset pair ("Assets are not in lexicographic order"). 17.2.1 accepts it. |
| [wallet-backend #716](https://github.com/stellar/wallet-backend/issues/716) AddressBytea truncates muxed addresses | `6e5a5910^` | `6e5a5910` (#693) | Reproduced at the storage type. The M-address with ID 2^64-1 reads back as `...WCWA`, which fails to decode ("invalid payload length 32, expected 40"). |
| [wallet-backend #729](https://github.com/stellar/wallet-backend/pull/729) P signer halts ingestion | `2c873353^` | `2c873353` | Reproduced at the storage type. The signer column type rejects the testnet P signer (40-byte payload). In ingestion that error fails the COPY and the ledger is retried. |
| [wallet-backend #731](https://github.com/stellar/wallet-backend/issues/731) SAC `trust()` trustline has no state change | | | **Not reproduced yet.** It needs real LedgerCloseMeta from a CAP-73 `trust()` call fed through the indexer and a check of the `state_changes` rows. This is the first job for the replay harness. |

Limits, stated plainly:

- The wallet-backend repros call the storage types directly with real addresses from the corpus. They show the root cause on the pinned commits. They do not run a full ledger through ingestion. The replay harness will.
- #716 stayed open after #693 for two more producers (SEP-41 muxed addresses and P signers). The P signer part is covered by the #729 repro.
