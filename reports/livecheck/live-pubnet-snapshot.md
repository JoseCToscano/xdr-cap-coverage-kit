# Live checker: pubnet (live)

Snapshot of the live checker on pubnet, rendered by `node tools/livecheck/snapshot.mjs` from its public [status.json](https://status.xck-status.dev/status.json) (copy: [live-pubnet-status.json](live-pubnet-status.json)). Status generated 2026-11-21 19:07 CST (2026-11-22T01:07:02.352Z). Started 2026-11-16 13:10 CST at ledger 65514036; cursor 65604713; restarts 7.

| | |
|---|---|
| Ledgers checked | 90,678 (65514036 to 65604713), every ledger in order |
| Close times | 2026-11-16T19:10:22Z to 2026-11-22T01:06:51Z |
| Protocol | 29: 90,678 |
| Transactions | 29,915,420 |
| Segments compared (ledger + envelopes + result metas), 3 readers each | 59,921,518 |
| Checker time | 34.8 worker-hours |
| Lag at snapshot | 0 ledgers (1 min) behind the network tip |
| Host pauses | 82 (47,974 s in total); the follower resumes from the archive, so no ledger is skipped |

## Readers

| Reader | Library | Decoded | Byte round-trip |
|---|---|---|---|
| JS | js-stellar-sdk 17.4.0 | 90,678 | 90,678 |
| Go | go-stellar-sdk 0.9.0 | 90,678 | 90,678 |
| Rust | rs-stellar-xdr 30.0.0 | 90,678 | 90,678 (SEP-51 JSON → XDR: 90,678) |

## Flags

| Flag | Count | Distinct txs | Meaning |
|---|---|---|---|
| `decode_failure` | 0 | 0 | a reader could not decode the ledger (localized per transaction) |
| `disagreement` | 0 | 0 | readers decoded the same bytes to different canonical values |
| `roundtrip_mismatch` | 0 | 0 | decode then encode was not byte-identical (Rust also checks SEP-51 JSON back to XDR) |
| `js_precision` | 0 | 0 | a 64-bit value at or above 2^53 surfaced as a JS number in the SDK's high-level objects |
| `first_seen` | 15 | 13 | union arm never seen in the mainnet baseline |
| `long_tail` | 31,199 | 20,960 | union arm seen in fewer than 100 per million baseline mainnet transactions |
| `bug_shape` | 428 | 428 | transaction has a shape behind a reproduced bug (frequency-study detectors) |
| `shape_first_seen` | 0 | 0 | corpus / bug shape with no transaction in the baseline |

No decode failures, disagreements, round-trip mismatches or JS precision hazards.

## Bug shapes (2)

| Shape | Txs | CAP (inferred) | Latest example txs |
|---|---|---|---|
| `muxed.id_ge_2^53 (JS-unsafe, #1785 shape)` | 394 | CAP-0027, CAP-0046, CAP-0067 | `ff2ce7643563…` (L65604603), `41deb82f7405…` (L65604153), `46000ee6ec78…` (L65603858) |
| `soroban.creates_trustline (#731 shape)` | 34 | CAP-0046, CAP-0067 | `1be3d93f5c7f…` (L65602943), `607a2073a7bd…` (L65596639), `d9a2c9eae1fc…` (L65593155) |

## First-seen arms (15)

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
| `AccountMergeResult.immutable_set` | `9cccf84615a0…` | 65578218 | 2026-11-20T12:18:54Z | – |
| `ContractCodeEntryExt.v0` | `620110f9b7ec…` | 65581923 | 2026-11-20T17:27:39Z | – |
| `ManageDataResult.name_not_found` | `4744ad15d963…` | 65597398 | 2026-11-21T14:57:16Z | – |
| `RevokeSponsorshipResult.low_reserve` | `533ebfbd2c67…` | 65597556 | 2026-11-21T15:10:26Z | CAP-0033 |

## Long-tail arms (86)

31,199 flags on 20,960 transactions.

| Arm | Txs | CAP (inferred) | Example tx |
|---|---|---|---|
| `ClaimPredicate.or` | 1 | – | `6bc5d92da949…` (L65532973) |
| `LiquidityPoolDepositResult.no_trust` | 1 | CAP-0038 | `16d4b66ac7c6…` (L65549154) |
| `LiquidityPoolWithdrawResult.no_trust` | 1 | CAP-0038 | `b98171b45ba8…` (L65558509) |
| `ScAddress.muxed_account` | 1 | CAP-0067 | `aaa7f7722255…` (L65573161) |
| `SetTrustLineFlagsResult.no_trust_line` | 1 | – | `7fabf1d1198c…` (L65523406) |
| `ClaimClaimableBalanceResult.line_full` | 2 | CAP-0023 | `8572373ed84e…` (L65597570) |
| `ManageDataResult.low_reserve` | 2 | – | `e881d7b04e02…` (L65521002) |
| `CreateClaimableBalanceResult.not_authorized` | 4 | CAP-0023 | `789d5c3c5807…` (L65524595) |
| `LiquidityPoolDepositResult.underfunded` | 4 | CAP-0038 | `75125ee2b89f…` (L65569361) |
| `LiquidityPoolWithdrawResult.under_minimum` | 5 | CAP-0038 | `bd9e94445aeb…` (L65525380) |
| `PathPaymentStrictReceiveResult.offer_cross_self` | 5 | – | `6c3338b66fe0…` (L65559706) |
| `ClawbackResult.underfunded` | 6 | CAP-0035 | `e638db9e7bcd…` (L65518615) |
| `PathPaymentStrictSendResult.line_full` | 7 | – | `a85cd6c34b11…` (L65530997) |
| `RevokeSponsorshipOp.signer` | 8 | CAP-0033 | `747237b67df0…` (L65517153) |
| `RevokeSponsorshipResult.only_transferable` | 9 | CAP-0033 | `d103a26e3af6…` (L65520631) |
| `ScErrorCode.unexpected_type` | 9 | – | `78e377ffe7d9…` (L65514441) |
| `RevokeSponsorshipResult.not_sponsor` | 10 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `ClaimClaimableBalanceResult.not_authorized` | 11 | CAP-0023 | `fe6c51e171f5…` (L65523414) |
| `ClawbackClaimableBalanceResult.does_not_exist` | 17 | CAP-0023, CAP-0035 | `253efc81e868…` (L65523635) |
| `AccountMergeResult.no_account` | 19 | – | `d5e2c177c1ae…` (L65523810) |
| `ContractIdPreimage.asset` | 21 | CAP-0046 | `eead9c43a76e…` (L65524175) |
| `PathPaymentStrictSendResult.offer_cross_self` | 26 | – | `81463ff7262e…` (L65524078) |
| `CreateClaimableBalanceResult.underfunded` | 29 | CAP-0023 | `822c1d3500b4…` (L65524292) |
| `RevokeSponsorshipResult.success` | 31 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `ChangeTrustResult.cannot_delete` | 33 | – | `4cedbbbd1535…` (L65516352) |
| `ContractExecutable.stellar_asset` | 33 | CAP-0046 | `d0e26f2fce11…` (L65518856) |
| `ContractEventType.system` | 36 | CAP-0067 | `a1d773ef16d6…` (L65514367) |
| `HostFunction.create_contract` | 37 | CAP-0046 | `eead9c43a76e…` (L65524175) |
| `ManageSellOfferResult.buy_not_authorized` | 41 | – | `2782afa3a758…` (L65515774) |
| `RevokeSponsorshipOp.ledger_entry` | 41 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `OperationBody.revoke_sponsorship` | 44 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `OperationResultTr.revoke_sponsorship` | 44 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `PathPaymentStrictSendResult.not_authorized` | 44 | – | `91c26064968c…` (L65523195) |
| `PaymentResult.src_not_authorized` | 45 | – | `36c821b9c544…` (L65514412) |
| `ClaimPredicate.and` | 47 | – | `0bb298354764…` (L65523699) |
| `AccountMergeResult.is_sponsor` | 48 | CAP-0033 | `9d930319faff…` (L65517915) |
| `LedgerKey.liquidity_pool` | 49 | CAP-0038 | `2d372cf3bcf4…` (L65515102) |
| `AccountMergeResult.has_sub_entries` | 61 | – | `1fbb913e09d1…` (L65516079) |
| `ManageBuyOfferResult.sell_not_authorized` | 72 | – | `32de1526bdb3…` (L65524869) |
| `ScErrorCode.missing_value` | 75 | – | `8cd0a20c99f1…` (L65514416) |
| `ManageSellOfferResult.line_full` | 76 | – | `ac0ac7d0356c…` (L65548887) |
| `ChangeTrustResult.no_issuer` | 80 | – | `ec5d628eae59…` (L65518604) |
| `ClaimClaimableBalanceResult.does_not_exist` | 87 | CAP-0023 | `91b5c10bfd01…` (L65515796) |
| `PathPaymentStrictSendResult.src_not_authorized` | 95 | – | `5b4edabd0197…` (L65516591) |
| `LiquidityPoolDepositResult.bad_price` | 97 | CAP-0038 | `f764c933f0f7…` (L65518639) |
| `OperationResult.op_too_many_subentries` | 98 | – | `88c7a14c2bd3…` (L65515017) |
| `CreateClaimableBalanceResult.low_reserve` | 125 | CAP-0023 | `404415251ef5…` (L65515480) |
| `HostFunction.upload_contract_wasm` | 127 | CAP-0046 | `2b716ef0a367…` (L65514214) |
| `ExtendFootprintTtlResult.success` | 129 | CAP-0046 | `76bcc33a6b1c…` (L65517516) |
| `OperationBody.extend_footprint_ttl` | 129 | – | `76bcc33a6b1c…` (L65517516) |
| `OperationResultTr.extend_footprint_ttl` | 129 | – | `76bcc33a6b1c…` (L65517516) |
| `InvokeHostFunctionResult.insufficient_refundable_fee` | 137 | CAP-0046 | `428555ae995b…` (L65516072) |
| `ContractCodeEntryExt.v1` | 138 | – | `2b716ef0a367…` (L65514214) |
| `LedgerEntryData.contract_code` | 139 | – | `2b716ef0a367…` (L65514214) |
| `LedgerKey.data` | 178 | – | `00bda212e436…` (L65515071) |
| `LiquidityPoolWithdrawResult.success` | 240 | CAP-0038 | `724d699397b4…` (L65514130) |
| `OperationBody.liquidity_pool_withdraw` | 246 | CAP-0038 | `724d699397b4…` (L65514130) |
| `OperationResultTr.liquidity_pool_withdraw` | 246 | CAP-0038 | `724d699397b4…` (L65514130) |
| `CreateAccountResult.already_exist` | 248 | – | `43d96514a055…` (L65514513) |
| `SetOptionsResult.low_reserve` | 281 | – | `7bc8fadb1571…` (L65523667) |
| `HostFunction.create_contract_v2` | 293 | CAP-0046 | `8304f1579937…` (L65514216) |
| `InvokeHostFunctionResult.entry_archived` | 300 | CAP-0046 | `1af1e4a6d254…` (L65523273) |
| `ContractIdPreimage.address` | 309 | CAP-0046 | `8304f1579937…` (L65514216) |
| `ScError.value` | 309 | – | `78e377ffe7d9…` (L65514441) |
| `SorobanAuthorizedFunction.create_contract_v2_host_fn` | 309 | CAP-0046 | `8304f1579937…` (L65514216) |
| `SignerKey.pre_auth_tx` | 313 | – | `c285c1f07d32…` (L65514609) |
| `ChangeTrustAsset.pool_share` | 374 | CAP-0038 | `724d699397b4…` (L65514130) |
| `LiquidityPoolParameters.liquidity_pool_constant_product` | 374 | CAP-0038 | `724d699397b4…` (L65514130) |
| `OperationResult.op_exceeded_work_limit` | 376 | – | `d2403e2e8c41…` (L65514249) |
| `ManageBuyOfferResult.buy_no_trust` | 410 | – | `9d98ef29c26c…` (L65514099) |
| `PaymentResult.src_no_trust` | 425 | – | `11a357ba3223…` (L65514425) |
| `BumpSequenceResult.success` | 699 | – | `ce09d1b1ad97…` (L65514333) |
| `OperationBody.bump_sequence` | 699 | – | `ce09d1b1ad97…` (L65514333) |
| `OperationResultTr.bump_sequence` | 699 | – | `ce09d1b1ad97…` (L65514333) |
| `InvokeHostFunctionResult.resource_limit_exceeded` | 821 | CAP-0046 | `e69065f066e5…` (L65514944) |
| `ManageBuyOfferResult.cross_self` | 910 | – | `79d6a10b232b…` (L65514559) |
| `ScError.budget` | 983 | – | `e69065f066e5…` (L65514944) |
| `ChangeTrustResult.low_reserve` | 1,046 | – | `037bface7b94…` (L65516256) |
| `PathPaymentStrictSendResult.no_destination` | 1,359 | – | `6168ce528b0c…` (L65514081) |
| `DataEntryExt.v0` | 1,531 | – | `78b633f543eb…` (L65514257) |
| `LedgerEntryData.data` | 1,531 | – | `78b633f543eb…` (L65514257) |
| `ManageSellOfferResult.sell_no_trust` | 1,824 | – | `9d98ef29c26c…` (L65514099) |
| `ScVal.i256` | 1,980 | CAP-0046 | `4be5d49c900e…` (L65514085) |
| `Memo.return` | 2,828 | – | `dac11f666516…` (L65514054) |
| `LedgerEntryChange.restored` | 3,200 | – | `be9e9773b53a…` (L65514037) |
| `SorobanTransactionDataExt.v1` | 3,292 | CAP-0046 | `be9e9773b53a…` (L65514037) |
