# Live checker: pubnet (live)

Snapshot of the live checker on pubnet, rendered by `node tools/livecheck/snapshot.mjs` from its public [status.json](https://status.xck-status.dev/status.json) (copy: [live-pubnet-status.json](live-pubnet-status.json)). Status generated 2026-11-19 09:44 CST (2026-11-19T15:44:46.730Z). Started 2026-11-16 13:10 CST at ledger 65514036; cursor 65563403; restarts 7.

| | |
|---|---|
| Ledgers checked | 49,368 (65514036 to 65563403), every ledger in order |
| Close times | 2026-11-16T19:10:22Z to 2026-11-19T15:44:18Z |
| Protocol | 29: 49,368 |
| Transactions | 16,451,520 |
| Segments compared (ledger + envelopes + result metas), 3 readers each | 32,952,408 |
| Checker time | 26.88 worker-hours |
| Lag at snapshot | 11 ledgers (1 min) behind the network tip |
| Host pauses | 16 (12,332 s in total); the follower resumes from the archive, so no ledger is skipped |

## Readers

| Reader | Library | Decoded | Byte round-trip |
|---|---|---|---|
| JS | js-stellar-sdk 17.4.0 | 49,368 | 49,368 |
| Go | go-stellar-sdk 0.9.0 | 49,368 | 49,368 |
| Rust | rs-stellar-xdr 30.0.0 | 49,368 | 49,368 (SEP-51 JSON → XDR: 49,368) |

## Flags

| Flag | Count | Distinct txs | Meaning |
|---|---|---|---|
| `decode_failure` | 0 | 0 | a reader could not decode the ledger (localized per transaction) |
| `disagreement` | 0 | 0 | readers decoded the same bytes to different canonical values |
| `roundtrip_mismatch` | 0 | 0 | decode then encode was not byte-identical (Rust also checks SEP-51 JSON back to XDR) |
| `js_precision` | 0 | 0 | a 64-bit value at or above 2^53 surfaced as a JS number in the SDK's high-level objects |
| `first_seen` | 11 | 9 | union arm never seen in the mainnet baseline |
| `long_tail` | 19,297 | 12,653 | union arm seen in fewer than 100 per million baseline mainnet transactions |
| `bug_shape` | 210 | 210 | transaction has a shape behind a reproduced bug (frequency-study detectors) |
| `shape_first_seen` | 0 | 0 | corpus / bug shape with no transaction in the baseline |

No decode failures, disagreements, round-trip mismatches or JS precision hazards.

## Bug shapes (2)

| Shape | Txs | CAP (inferred) | Latest example txs |
|---|---|---|---|
| `muxed.id_ge_2^53 (JS-unsafe, #1785 shape)` | 199 | CAP-0027, CAP-0046, CAP-0067 | `fbba264ac50d…` (L65563293), `600bf61f23df…` (L65563276), `73c2fecf7a05…` (L65562799) |
| `soroban.creates_trustline (#731 shape)` | 11 | CAP-0046, CAP-0067 | `d7023b23562e…` (L65559854), `08f35c150ef3…` (L65557360), `e3e8d4629f82…` (L65547063) |

## First-seen arms (11)

Union arms the 83,500-ledger mainnet baseline never contained. Each has a corpus candidate in [corpus/candidates/livecheck/pubnet-live](../../corpus/candidates/livecheck/pubnet-live).

| Arm | Tx | Ledger | Close time (UTC) | CAP (inferred) |
|---|---|---|---|---|
| `ClawbackResult.no_trust` | `57f7b9eeddbf…` | 65516147 | 2026-11-16T22:06:17Z | CAP-0035 |
| `ClawbackClaimableBalanceResult.not_issuer` | `278a90f5b7db…` | 65520888 | 2026-11-17T04:41:22Z | CAP-0023, CAP-0035 |
| `AllowTrustResult.no_trust_line` | `b0c9502ab0f2…` | 65525625 | 2026-11-17T11:16:07Z | – |
| `ScError.crypto` | `5462367b08a6…` | 65529218 | 2026-11-17T16:15:32Z | – |
| `PathPaymentStrictReceiveResult.src_not_authorized` | `d565024a8087…` | 65531602 | 2026-11-17T19:34:12Z | – |
| `SetOptionsResult.too_many_signers` | `2c66fa3e7019…` | 65532215 | 2026-11-17T20:25:17Z | – |
| `OperationBody.restore_footprint` | `4cbe7adf59c1…` | 65547102 | 2026-11-18T17:05:53Z | – |
| `OperationResultTr.restore_footprint` | `4cbe7adf59c1…` | 65547102 | 2026-11-18T17:05:53Z | – |
| `RestoreFootprintResult.success` | `4cbe7adf59c1…` | 65547102 | 2026-11-18T17:05:53Z | CAP-0046 |
| `ChangeTrustResult.not_auth_maintain_liabilities` | `16d4b66ac7c6…` | 65549154 | 2026-11-18T19:56:53Z | – |
| `ClawbackClaimableBalanceResult.not_clawback_enabled` | `55184a235934…` | 65551328 | 2026-11-18T22:58:03Z | CAP-0023, CAP-0035 |

## Long-tail arms (83)

19,297 flags on 12,653 transactions.

| Arm | Txs | CAP (inferred) | Example tx |
|---|---|---|---|
| `ClaimPredicate.or` | 1 | – | `6bc5d92da949…` (L65532973) |
| `LiquidityPoolDepositResult.no_trust` | 1 | CAP-0038 | `16d4b66ac7c6…` (L65549154) |
| `LiquidityPoolWithdrawResult.no_trust` | 1 | CAP-0038 | `b98171b45ba8…` (L65558509) |
| `LiquidityPoolWithdrawResult.under_minimum` | 1 | CAP-0038 | `bd9e94445aeb…` (L65525380) |
| `SetTrustLineFlagsResult.no_trust_line` | 1 | – | `7fabf1d1198c…` (L65523406) |
| `ManageDataResult.low_reserve` | 2 | – | `e881d7b04e02…` (L65521002) |
| `PathPaymentStrictReceiveResult.offer_cross_self` | 2 | – | `6c3338b66fe0…` (L65559706) |
| `ClawbackResult.underfunded` | 4 | CAP-0035 | `e638db9e7bcd…` (L65518615) |
| `CreateClaimableBalanceResult.not_authorized` | 4 | CAP-0023 | `789d5c3c5807…` (L65524595) |
| `PathPaymentStrictSendResult.line_full` | 4 | – | `a85cd6c34b11…` (L65530997) |
| `ScErrorCode.unexpected_type` | 5 | – | `78e377ffe7d9…` (L65514441) |
| `ClaimClaimableBalanceResult.not_authorized` | 6 | CAP-0023 | `fe6c51e171f5…` (L65523414) |
| `RevokeSponsorshipOp.signer` | 6 | CAP-0033 | `747237b67df0…` (L65517153) |
| `AccountMergeResult.no_account` | 7 | – | `d5e2c177c1ae…` (L65523810) |
| `RevokeSponsorshipResult.not_sponsor` | 8 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `ContractEventType.system` | 9 | CAP-0067 | `a1d773ef16d6…` (L65514367) |
| `RevokeSponsorshipResult.only_transferable` | 9 | CAP-0033 | `d103a26e3af6…` (L65520631) |
| `ClawbackClaimableBalanceResult.does_not_exist` | 13 | CAP-0023, CAP-0035 | `253efc81e868…` (L65523635) |
| `ChangeTrustResult.cannot_delete` | 15 | – | `4cedbbbd1535…` (L65516352) |
| `ContractIdPreimage.asset` | 17 | CAP-0046 | `eead9c43a76e…` (L65524175) |
| `CreateClaimableBalanceResult.underfunded` | 18 | CAP-0023 | `822c1d3500b4…` (L65524292) |
| `RevokeSponsorshipResult.success` | 19 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `PathPaymentStrictSendResult.offer_cross_self` | 21 | – | `81463ff7262e…` (L65524078) |
| `PaymentResult.src_not_authorized` | 22 | – | `36c821b9c544…` (L65514412) |
| `ManageSellOfferResult.line_full` | 23 | – | `ac0ac7d0356c…` (L65548887) |
| `LedgerKey.liquidity_pool` | 25 | CAP-0038 | `2d372cf3bcf4…` (L65515102) |
| `RevokeSponsorshipOp.ledger_entry` | 26 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `ContractExecutable.stellar_asset` | 27 | CAP-0046 | `d0e26f2fce11…` (L65518856) |
| `ClaimPredicate.and` | 28 | – | `0bb298354764…` (L65523699) |
| `HostFunction.create_contract` | 29 | CAP-0046 | `eead9c43a76e…` (L65524175) |
| `OperationBody.revoke_sponsorship` | 29 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `OperationResultTr.revoke_sponsorship` | 29 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `ManageSellOfferResult.buy_not_authorized` | 30 | – | `2782afa3a758…` (L65515774) |
| `AccountMergeResult.has_sub_entries` | 34 | – | `1fbb913e09d1…` (L65516079) |
| `ManageBuyOfferResult.sell_not_authorized` | 41 | – | `32de1526bdb3…` (L65524869) |
| `PathPaymentStrictSendResult.not_authorized` | 41 | – | `91c26064968c…` (L65523195) |
| `AccountMergeResult.is_sponsor` | 43 | CAP-0033 | `9d930319faff…` (L65517915) |
| `CreateClaimableBalanceResult.low_reserve` | 43 | CAP-0023 | `404415251ef5…` (L65515480) |
| `ClaimClaimableBalanceResult.does_not_exist` | 44 | CAP-0023 | `91b5c10bfd01…` (L65515796) |
| `ScErrorCode.missing_value` | 44 | – | `8cd0a20c99f1…` (L65514416) |
| `LiquidityPoolDepositResult.bad_price` | 47 | CAP-0038 | `f764c933f0f7…` (L65518639) |
| `OperationResult.op_too_many_subentries` | 49 | – | `88c7a14c2bd3…` (L65515017) |
| `PathPaymentStrictSendResult.src_not_authorized` | 49 | – | `5b4edabd0197…` (L65516591) |
| `InvokeHostFunctionResult.insufficient_refundable_fee` | 52 | CAP-0046 | `428555ae995b…` (L65516072) |
| `ChangeTrustResult.no_issuer` | 55 | – | `ec5d628eae59…` (L65518604) |
| `HostFunction.upload_contract_wasm` | 75 | CAP-0046 | `2b716ef0a367…` (L65514214) |
| `ContractCodeEntryExt.v1` | 79 | – | `2b716ef0a367…` (L65514214) |
| `LedgerEntryData.contract_code` | 79 | – | `2b716ef0a367…` (L65514214) |
| `ExtendFootprintTtlResult.success` | 98 | CAP-0046 | `76bcc33a6b1c…` (L65517516) |
| `OperationBody.extend_footprint_ttl` | 98 | – | `76bcc33a6b1c…` (L65517516) |
| `OperationResultTr.extend_footprint_ttl` | 98 | – | `76bcc33a6b1c…` (L65517516) |
| `LedgerKey.data` | 108 | – | `00bda212e436…` (L65515071) |
| `LiquidityPoolWithdrawResult.success` | 118 | CAP-0038 | `724d699397b4…` (L65514130) |
| `OperationBody.liquidity_pool_withdraw` | 120 | CAP-0038 | `724d699397b4…` (L65514130) |
| `OperationResultTr.liquidity_pool_withdraw` | 120 | CAP-0038 | `724d699397b4…` (L65514130) |
| `SetOptionsResult.low_reserve` | 136 | – | `7bc8fadb1571…` (L65523667) |
| `CreateAccountResult.already_exist` | 141 | – | `43d96514a055…` (L65514513) |
| `SignerKey.pre_auth_tx` | 215 | – | `c285c1f07d32…` (L65514609) |
| `HostFunction.create_contract_v2` | 221 | CAP-0046 | `8304f1579937…` (L65514216) |
| `ChangeTrustAsset.pool_share` | 226 | CAP-0038 | `724d699397b4…` (L65514130) |
| `LiquidityPoolParameters.liquidity_pool_constant_product` | 226 | CAP-0038 | `724d699397b4…` (L65514130) |
| `ContractIdPreimage.address` | 233 | CAP-0046 | `8304f1579937…` (L65514216) |
| `SorobanAuthorizedFunction.create_contract_v2_host_fn` | 233 | CAP-0046 | `8304f1579937…` (L65514216) |
| `ManageBuyOfferResult.buy_no_trust` | 265 | – | `9d98ef29c26c…` (L65514099) |
| `InvokeHostFunctionResult.entry_archived` | 279 | CAP-0046 | `1af1e4a6d254…` (L65523273) |
| `ScError.value` | 284 | – | `78e377ffe7d9…` (L65514441) |
| `PaymentResult.src_no_trust` | 316 | – | `11a357ba3223…` (L65514425) |
| `OperationResult.op_exceeded_work_limit` | 376 | – | `d2403e2e8c41…` (L65514249) |
| `InvokeHostFunctionResult.resource_limit_exceeded` | 379 | CAP-0046 | `e69065f066e5…` (L65514944) |
| `ManageBuyOfferResult.cross_self` | 386 | – | `79d6a10b232b…` (L65514559) |
| `ScError.budget` | 440 | – | `e69065f066e5…` (L65514944) |
| `ChangeTrustResult.low_reserve` | 526 | – | `037bface7b94…` (L65516256) |
| `BumpSequenceResult.success` | 589 | – | `ce09d1b1ad97…` (L65514333) |
| `OperationBody.bump_sequence` | 589 | – | `ce09d1b1ad97…` (L65514333) |
| `OperationResultTr.bump_sequence` | 589 | – | `ce09d1b1ad97…` (L65514333) |
| `PathPaymentStrictSendResult.no_destination` | 748 | – | `6168ce528b0c…` (L65514081) |
| `ScVal.i256` | 920 | CAP-0046 | `4be5d49c900e…` (L65514085) |
| `DataEntryExt.v0` | 1,223 | – | `78b633f543eb…` (L65514257) |
| `LedgerEntryData.data` | 1,223 | – | `78b633f543eb…` (L65514257) |
| `Memo.return` | 1,508 | – | `dac11f666516…` (L65514054) |
| `ManageSellOfferResult.sell_no_trust` | 1,586 | – | `9d98ef29c26c…` (L65514099) |
| `LedgerEntryChange.restored` | 1,706 | – | `be9e9773b53a…` (L65514037) |
| `SorobanTransactionDataExt.v1` | 1,757 | CAP-0046 | `be9e9773b53a…` (L65514037) |
