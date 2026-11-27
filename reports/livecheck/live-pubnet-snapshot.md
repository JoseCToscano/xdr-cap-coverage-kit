# Live checker: pubnet (live)

Snapshot of the live checker on pubnet, rendered by `node tools/livecheck/snapshot.mjs` from its public [status.json](https://status.xck-status.dev/status.json) (copy: [live-pubnet-status.json](live-pubnet-status.json)). Status generated 2026-11-26 09:49 CST (2026-11-26T15:49:08.777Z). Started 2026-11-16 13:10 CST at ledger 65514036; cursor 65682792; restarts 7.

| | |
|---|---|
| Ledgers checked | 168,757 (65514036 to 65682792), every ledger in order |
| Close times | 2026-11-16T19:10:22Z to 2026-11-26T13:33:47Z |
| Protocol | 29: 119,396, 30: 49,361 |
| Transactions | 55,365,005 |
| Segments compared (ledger + envelopes + result metas), 3 readers each | 110,898,767 |
| Checker time | 49.37 worker-hours |
| Lag at snapshot | 1743 ledgers (146.3 min) behind the network tip |
| Host pauses | 189 (99,023 s in total); the follower resumes from the archive, so no ledger is skipped |

## Readers

| Reader | Library | Decoded | Byte round-trip |
|---|---|---|---|
| JS | js-stellar-sdk 17.4.0 | 168,757 | 168,757 |
| Go | go-stellar-sdk 0.9.0 | 168,757 | 168,757 |
| Rust | rs-stellar-xdr 30.0.0 | 168,757 | 168,757 (SEP-51 JSON → XDR: 168,757) |

## Flags

| Flag | Count | Distinct txs | Meaning |
|---|---|---|---|
| `decode_failure` | 0 | 0 | a reader could not decode the ledger (localized per transaction) |
| `disagreement` | 0 | 0 | readers decoded the same bytes to different canonical values |
| `roundtrip_mismatch` | 0 | 0 | decode then encode was not byte-identical (Rust also checks SEP-51 JSON back to XDR) |
| `js_precision` | 0 | 0 | a 64-bit value at or above 2^53 surfaced as a JS number in the SDK's high-level objects |
| `first_seen` | 20 | 18 | union arm never seen in the mainnet baseline |
| `long_tail` | 62,397 | 43,880 | union arm seen in fewer than 100 per million baseline mainnet transactions |
| `bug_shape` | 763 | 761 | transaction has a shape behind a reproduced bug (frequency-study detectors) |
| `shape_first_seen` | 2 | 2 | corpus / bug shape with no transaction in the baseline |

No decode failures, disagreements, round-trip mismatches or JS precision hazards.

## Bug shapes (3)

| Shape | Txs | CAP (inferred) | Latest example txs |
|---|---|---|---|
| `muxed.id_ge_2^53 (JS-unsafe, #1785 shape)` | 662 | CAP-0027, CAP-0046, CAP-0067 | `3b0555a1d960…` (L65682504), `175bafb2e05d…` (L65682490), `e9326f1aa0ba…` (L65682208) |
| `soroban.creates_trustline (#731 shape)` | 99 | CAP-0046, CAP-0067 | `f4faca2d047f…` (L65681411), `682de754f84e…` (L65680018), `ab2587c87d87…` (L65679473) |
| `sac.trust_creates_trustline (#731 exact)` | 2 | CAP-0046, CAP-0067, CAP-0073 | `ab2587c87d87…` (L65679473), `ed565f922a9e…` (L65679471) |

## First-seen arms (20)

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
| `SorobanAuthorizedFunction.create_contract_host_fn` | `c54c90e873b1…` | 65634655 | 2026-11-23T18:42:01Z | CAP-0046 |
| `ScAddress.muxed_contract` | `a78a1000dbc1…` | 65636570 | 2026-11-23T21:21:38Z | CAP-0084 |
| `SetOptionsResult.cant_change` | `e657254b8e1c…` | 65661546 | 2026-11-25T08:03:07Z | – |
| `LiquidityPoolDepositResult.pool_full` | `e9b124fffb02…` | 65676864 | 2026-11-26T05:19:45Z | CAP-0038 |
| `EndSponsoringFutureReservesResult.not_sponsored` | `0381314f0311…` | 65682698 | 2026-11-26T13:25:57Z | CAP-0033 |

## Long-tail arms (87)

62,397 flags on 43,880 transactions.

| Arm | Txs | CAP (inferred) | Example tx |
|---|---|---|---|
| `ClawbackResult.not_clawback_enabled` | 1 | CAP-0035 | `3f2b64db85e7…` (L65668916) |
| `LiquidityPoolWithdrawResult.no_trust` | 1 | CAP-0038 | `b98171b45ba8…` (L65558509) |
| `SetTrustLineFlagsResult.no_trust_line` | 1 | – | `7fabf1d1198c…` (L65523406) |
| `ClaimClaimableBalanceResult.line_full` | 2 | CAP-0023 | `8572373ed84e…` (L65597570) |
| `ClaimPredicate.or` | 3 | – | `6bc5d92da949…` (L65532973) |
| `ScAddress.muxed_account` | 3 | CAP-0067 | `aaa7f7722255…` (L65573161) |
| `LiquidityPoolWithdrawResult.under_minimum` | 5 | CAP-0038 | `bd9e94445aeb…` (L65525380) |
| `LiquidityPoolDepositResult.no_trust` | 9 | CAP-0038 | `16d4b66ac7c6…` (L65549154) |
| `RevokeSponsorshipOp.signer` | 10 | CAP-0033 | `747237b67df0…` (L65517153) |
| `RevokeSponsorshipResult.only_transferable` | 10 | CAP-0033 | `d103a26e3af6…` (L65520631) |
| `ClawbackResult.underfunded` | 12 | CAP-0035 | `e638db9e7bcd…` (L65518615) |
| `ScErrorCode.unexpected_type` | 12 | – | `78e377ffe7d9…` (L65514441) |
| `RevokeSponsorshipResult.not_sponsor` | 14 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `LiquidityPoolDepositResult.underfunded` | 15 | CAP-0038 | `75125ee2b89f…` (L65569361) |
| `CreateClaimableBalanceResult.not_authorized` | 18 | CAP-0023 | `789d5c3c5807…` (L65524595) |
| `ClawbackClaimableBalanceResult.does_not_exist` | 22 | CAP-0023, CAP-0035 | `253efc81e868…` (L65523635) |
| `ManageDataResult.low_reserve` | 23 | – | `e881d7b04e02…` (L65521002) |
| `ClaimClaimableBalanceResult.not_authorized` | 24 | CAP-0023 | `fe6c51e171f5…` (L65523414) |
| `ContractIdPreimage.asset` | 29 | CAP-0046 | `eead9c43a76e…` (L65524175) |
| `PathPaymentStrictReceiveResult.offer_cross_self` | 31 | – | `6c3338b66fe0…` (L65559706) |
| `PathPaymentStrictSendResult.line_full` | 37 | – | `a85cd6c34b11…` (L65530997) |
| `AccountMergeResult.no_account` | 39 | – | `d5e2c177c1ae…` (L65523810) |
| `RevokeSponsorshipResult.success` | 39 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `PathPaymentStrictSendResult.not_authorized` | 45 | – | `91c26064968c…` (L65523195) |
| `ContractExecutable.stellar_asset` | 50 | CAP-0046 | `d0e26f2fce11…` (L65518856) |
| `ContractEventType.system` | 51 | CAP-0067 | `a1d773ef16d6…` (L65514367) |
| `RevokeSponsorshipOp.ledger_entry` | 51 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `OperationBody.revoke_sponsorship` | 54 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `OperationResultTr.revoke_sponsorship` | 54 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `AccountMergeResult.is_sponsor` | 59 | CAP-0033 | `9d930319faff…` (L65517915) |
| `ChangeTrustResult.cannot_delete` | 59 | – | `4cedbbbd1535…` (L65516352) |
| `HostFunction.create_contract` | 61 | CAP-0046 | `eead9c43a76e…` (L65524175) |
| `ClaimPredicate.and` | 72 | – | `0bb298354764…` (L65523699) |
| `PaymentResult.src_not_authorized` | 72 | – | `36c821b9c544…` (L65514412) |
| `ManageSellOfferResult.line_full` | 104 | – | `ac0ac7d0356c…` (L65548887) |
| `LedgerKey.liquidity_pool` | 111 | CAP-0038 | `2d372cf3bcf4…` (L65515102) |
| `ChangeTrustResult.no_issuer` | 115 | – | `ec5d628eae59…` (L65518604) |
| `PathPaymentStrictSendResult.src_not_authorized` | 128 | – | `5b4edabd0197…` (L65516591) |
| `ManageBuyOfferResult.sell_not_authorized` | 132 | – | `32de1526bdb3…` (L65524869) |
| `LiquidityPoolDepositResult.bad_price` | 171 | CAP-0038 | `f764c933f0f7…` (L65518639) |
| `HostFunction.upload_contract_wasm` | 179 | CAP-0046 | `2b716ef0a367…` (L65514214) |
| `ClaimClaimableBalanceResult.does_not_exist` | 180 | CAP-0023 | `91b5c10bfd01…` (L65515796) |
| `ExtendFootprintTtlResult.success` | 182 | CAP-0046 | `76bcc33a6b1c…` (L65517516) |
| `OperationBody.extend_footprint_ttl` | 182 | – | `76bcc33a6b1c…` (L65517516) |
| `OperationResultTr.extend_footprint_ttl` | 182 | – | `76bcc33a6b1c…` (L65517516) |
| `CreateClaimableBalanceResult.underfunded` | 183 | CAP-0023 | `822c1d3500b4…` (L65524292) |
| `CreateClaimableBalanceResult.low_reserve` | 184 | CAP-0023 | `404415251ef5…` (L65515480) |
| `OperationResult.op_too_many_subentries` | 185 | – | `88c7a14c2bd3…` (L65515017) |
| `ContractCodeEntryExt.v1` | 193 | – | `2b716ef0a367…` (L65514214) |
| `LedgerEntryData.contract_code` | 194 | – | `2b716ef0a367…` (L65514214) |
| `AccountMergeResult.has_sub_entries` | 209 | – | `1fbb913e09d1…` (L65516079) |
| `PathPaymentStrictSendResult.offer_cross_self` | 221 | – | `81463ff7262e…` (L65524078) |
| `InvokeHostFunctionResult.insufficient_refundable_fee` | 261 | CAP-0046 | `428555ae995b…` (L65516072) |
| `InvokeHostFunctionResult.entry_archived` | 314 | CAP-0046 | `1af1e4a6d254…` (L65523273) |
| `ScError.value` | 326 | – | `78e377ffe7d9…` (L65514441) |
| `LedgerKey.data` | 352 | – | `00bda212e436…` (L65515071) |
| `OperationResult.op_exceeded_work_limit` | 376 | – | `d2403e2e8c41…` (L65514249) |
| `CreateAccountResult.already_exist` | 378 | – | `43d96514a055…` (L65514513) |
| `LiquidityPoolWithdrawResult.success` | 430 | CAP-0038 | `724d699397b4…` (L65514130) |
| `OperationBody.liquidity_pool_withdraw` | 436 | CAP-0038 | `724d699397b4…` (L65514130) |
| `OperationResultTr.liquidity_pool_withdraw` | 436 | CAP-0038 | `724d699397b4…` (L65514130) |
| `SignerKey.pre_auth_tx` | 615 | – | `c285c1f07d32…` (L65514609) |
| `ManageBuyOfferResult.buy_no_trust` | 618 | – | `9d98ef29c26c…` (L65514099) |
| `ChangeTrustAsset.pool_share` | 643 | CAP-0038 | `724d699397b4…` (L65514130) |
| `LiquidityPoolParameters.liquidity_pool_constant_product` | 643 | CAP-0038 | `724d699397b4…` (L65514130) |
| `SetOptionsResult.low_reserve` | 671 | – | `7bc8fadb1571…` (L65523667) |
| `PaymentResult.src_no_trust` | 689 | – | `11a357ba3223…` (L65514425) |
| `BumpSequenceResult.success` | 783 | – | `ce09d1b1ad97…` (L65514333) |
| `OperationBody.bump_sequence` | 783 | – | `ce09d1b1ad97…` (L65514333) |
| `OperationResultTr.bump_sequence` | 783 | – | `ce09d1b1ad97…` (L65514333) |
| `HostFunction.create_contract_v2` | 1,165 | CAP-0046 | `8304f1579937…` (L65514216) |
| `SorobanAuthorizedFunction.create_contract_v2_host_fn` | 1,193 | CAP-0046 | `8304f1579937…` (L65514216) |
| `ContractIdPreimage.address` | 1,197 | CAP-0046 | `8304f1579937…` (L65514216) |
| `InvokeHostFunctionResult.resource_limit_exceeded` | 1,451 | CAP-0046 | `e69065f066e5…` (L65514944) |
| `ScError.budget` | 1,750 | – | `e69065f066e5…` (L65514944) |
| `ChangeTrustResult.low_reserve` | 1,753 | – | `037bface7b94…` (L65516256) |
| `ManageBuyOfferResult.cross_self` | 1,924 | – | `79d6a10b232b…` (L65514559) |
| `ManageSellOfferResult.sell_no_trust` | 2,060 | – | `9d98ef29c26c…` (L65514099) |
| `ManageSellOfferResult.buy_not_authorized` | 2,500 | – | `2782afa3a758…` (L65515774) |
| `PathPaymentStrictSendResult.no_destination` | 2,541 | – | `6168ce528b0c…` (L65514081) |
| `DataEntryExt.v0` | 3,009 | – | `78b633f543eb…` (L65514257) |
| `LedgerEntryData.data` | 3,009 | – | `78b633f543eb…` (L65514257) |
| `ScVal.i256` | 3,796 | CAP-0046 | `4be5d49c900e…` (L65514085) |
| `ScErrorCode.missing_value` | 4,475 | – | `8cd0a20c99f1…` (L65514416) |
| `Memo.return` | 5,400 | – | `dac11f666516…` (L65514054) |
| `LedgerEntryChange.restored` | 5,735 | – | `be9e9773b53a…` (L65514037) |
| `SorobanTransactionDataExt.v1` | 5,879 | CAP-0046 | `be9e9773b53a…` (L65514037) |
