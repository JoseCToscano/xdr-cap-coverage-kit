# Live checker: pubnet (live)

Rolling summary of the live checker on pubnet. Started 2026-11-16T19:10:23.239Z at ledger 65514036; cursor 65517000; updated 2026-11-16T23:17:26.553Z; restarts 4.
Findings log: `~/.local/share/xck-livecheck/pubnet/findings.jsonl`; candidates: `~/.local/share/xck-livecheck/pubnet/candidates`.

| | |
|---|---|
| Ledgers checked | 2,965 (65514036–65517000) |
| Close times | 2026-11-16T19:10:22Z – 2026-11-16T23:17:22Z |
| Protocol | 29: 2,965 |
| Transactions | 1,070,409 |
| Segments compared (ledger + envelopes + result metas), 3 readers each | 2,143,783 |
| Checker time | 2.10 worker-hours |

## Readers

| Reader | Library | Decoded | Byte round-trip |
|---|---|---|---|
| JS | js-stellar-sdk 17.4.0 (js-xdr 5) | 2,965 | 2,965 |
| Go | go-stellar-sdk 0.9.0 xdr | 2,965 | 2,965 |
| Rust | rs-stellar-xdr 30.0.0 | 2,965 | 2,965 (SEP-51 JSON → XDR: 2,965) |

## Flags

| Flag | Count | Distinct txs | Meaning |
|---|---|---|---|
| `decode_failure` | 0 | 0 | a reader could not decode the ledger (localized per transaction) |
| `disagreement` | 0 | 0 | readers decoded the same bytes to different canonical values |
| `roundtrip_mismatch` | 0 | 0 | decode then encode was not byte-identical (Rust also checks SEP-51 JSON back to XDR) |
| `js_precision` | 0 | 0 | a 64-bit value at or above 2^53 surfaced as a JS number in the SDK's high-level objects |
| `first_seen` | 1 | 1 | union arm never seen in the mainnet baseline |
| `long_tail` | 1,161 | 897 | union arm seen in fewer than 100 per million baseline mainnet transactions |
| `bug_shape` | 11 | 11 | transaction has a shape behind a reproduced bug (frequency-study detectors) |
| `shape_first_seen` | 0 | 0 | corpus / bug shape with no transaction in the baseline |

No decode failures, disagreements, round-trip mismatches or JS precision hazards.

## Bug shapes (1)

| Shape | Txs | CAP (inferred) | Example txs |
|---|---|---|---|
| `muxed.id_ge_2^53 (JS-unsafe, #1785 shape)` | 11 | CAP-0027, CAP-0046, CAP-0067 | `85c45efe781f…` (L65514195), `27d285d59b0e…` (L65514527), `52a0729bbda4…` (L65514538) |

## First-seen shapes (0)

None.

## First-seen arms (1)

| Arm | Txs | CAP (inferred) | Example txs |
|---|---|---|---|
| `ClawbackResult.no_trust` | 1 | CAP-0035 | `57f7b9eeddbf…` (L65516147) |

## Long-tail arms (51)

| Arm | Txs | CAP (inferred) | Example txs |
|---|---|---|---|
| `ClaimClaimableBalanceResult.does_not_exist` | 1 | CAP-0023 | `91b5c10bfd01…` (L65515796) |
| `InvokeHostFunctionResult.insufficient_refundable_fee` | 1 | CAP-0046 | `428555ae995b…` (L65516072) |
| `OperationBody.revoke_sponsorship` | 1 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `OperationResultTr.revoke_sponsorship` | 1 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `RevokeSponsorshipOp.ledger_entry` | 1 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `RevokeSponsorshipResult.not_sponsor` | 1 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `RevokeSponsorshipResult.success` | 1 | CAP-0033 | `d44dd51043d7…` (L65516073) |
| `ScError.value` | 1 | – | `78e377ffe7d9…` (L65514441) |
| `ScErrorCode.unexpected_type` | 1 | – | `78e377ffe7d9…` (L65514441) |
| `ChangeTrustResult.cannot_delete` | 2 | – | `4cedbbbd1535…` (L65516352), `3ee0294406af…` (L65516362) |
| `ChangeTrustResult.low_reserve` | 2 | – | `037bface7b94…` (L65516256), `c5b205887a98…` (L65516376) |
| `LedgerKey.liquidity_pool` | 2 | CAP-0038 | `2d372cf3bcf4…` (L65515102), `30aeb7ce2ac4…` (L65516375) |
| `OperationResult.op_too_many_subentries` | 2 | – | `88c7a14c2bd3…` (L65515017), `4bc8e6e5832b…` (L65515022) |
| `PathPaymentStrictSendResult.src_not_authorized` | 2 | – | `5b4edabd0197…` (L65516591), `c0742ca82555…` (L65516638) |
| `AccountMergeResult.has_sub_entries` | 3 | – | `1fbb913e09d1…` (L65516079), `8a14be6e6e1b…` (L65516758), `b0fb84f3fb35…` (L65516990) |
| `ContractEventType.system` | 3 | CAP-0067 | `a1d773ef16d6…` (L65514367), `5b8f64f187e5…` (L65514427), `91a365e1595a…` (L65514477) |
| `ContractIdPreimage.address` | 3 | CAP-0046 | `8304f1579937…` (L65514216), `9469c151d7a8…` (L65516014), `23151694753f…` (L65516047) |
| `HostFunction.create_contract_v2` | 3 | CAP-0046 | `8304f1579937…` (L65514216), `9469c151d7a8…` (L65516014), `23151694753f…` (L65516047) |
| `LedgerKey.data` | 3 | – | `00bda212e436…` (L65515071), `df0d1d90068a…` (L65515319), `6fe44878d341…` (L65515332) |
| `SorobanAuthorizedFunction.create_contract_v2_host_fn` | 3 | CAP-0046 | `8304f1579937…` (L65514216), `9469c151d7a8…` (L65516014), `23151694753f…` (L65516047) |
| `ContractCodeEntryExt.v1` | 4 | – | `2b716ef0a367…` (L65514214), `b22bcf7e413e…` (L65514366), `802632eaa2aa…` (L65514400) |
| `HostFunction.upload_contract_wasm` | 4 | CAP-0046 | `2b716ef0a367…` (L65514214), `b22bcf7e413e…` (L65514366), `802632eaa2aa…` (L65514400) |
| `LedgerEntryData.contract_code` | 4 | – | `2b716ef0a367…` (L65514214), `b22bcf7e413e…` (L65514366), `802632eaa2aa…` (L65514400) |
| `PaymentResult.src_not_authorized` | 4 | – | `36c821b9c544…` (L65514412), `7b8b42fc12b5…` (L65514415), `1fbb913e09d1…` (L65516079) |
| `ScErrorCode.missing_value` | 4 | – | `8cd0a20c99f1…` (L65514416), `3520aa5744b9…` (L65514575), `b0416ec8bded…` (L65514884) |
| `PaymentResult.src_no_trust` | 5 | – | `11a357ba3223…` (L65514425), `be3bca8a1a53…` (L65514457), `eb86b13a3d37…` (L65515535) |
| `CreateClaimableBalanceResult.low_reserve` | 6 | CAP-0023 | `404415251ef5…` (L65515480), `ec46a073ad82…` (L65515486), `26682ebee328…` (L65515618) |
| `LiquidityPoolWithdrawResult.success` | 7 | CAP-0038 | `724d699397b4…` (L65514130), `2d372cf3bcf4…` (L65515102), `0adb3c2260da…` (L65516277) |
| `OperationBody.liquidity_pool_withdraw` | 7 | CAP-0038 | `724d699397b4…` (L65514130), `2d372cf3bcf4…` (L65515102), `0adb3c2260da…` (L65516277) |
| `OperationResultTr.liquidity_pool_withdraw` | 7 | CAP-0038 | `724d699397b4…` (L65514130), `2d372cf3bcf4…` (L65515102), `0adb3c2260da…` (L65516277) |
| `BumpSequenceResult.success` | 8 | – | `ce09d1b1ad97…` (L65514333), `c7474909e822…` (L65514334), `c00c7cca0f84…` (L65514335) |
| `OperationBody.bump_sequence` | 8 | – | `ce09d1b1ad97…` (L65514333), `c7474909e822…` (L65514334), `c00c7cca0f84…` (L65514335) |
| `OperationResultTr.bump_sequence` | 8 | – | `ce09d1b1ad97…` (L65514333), `c7474909e822…` (L65514334), `c00c7cca0f84…` (L65514335) |
| `SignerKey.pre_auth_tx` | 9 | – | `c285c1f07d32…` (L65514609), `91ff3623ba95…` (L65515110), `fd6ce119767c…` (L65515445) |
| `InvokeHostFunctionResult.resource_limit_exceeded` | 10 | CAP-0046 | `e69065f066e5…` (L65514944), `0cc8de2ec156…` (L65515323), `255cb83ea048…` (L65515347) |
| `ChangeTrustAsset.pool_share` | 11 | CAP-0038 | `724d699397b4…` (L65514130), `9a261f1c17d3…` (L65514447), `2d372cf3bcf4…` (L65515102) |
| `LiquidityPoolParameters.liquidity_pool_constant_product` | 11 | CAP-0038 | `724d699397b4…` (L65514130), `9a261f1c17d3…` (L65514447), `2d372cf3bcf4…` (L65515102) |
| `ScError.budget` | 11 | – | `e69065f066e5…` (L65514944), `0cc8de2ec156…` (L65515323), `255cb83ea048…` (L65515347) |
| `ManageSellOfferResult.buy_not_authorized` | 13 | – | `2782afa3a758…` (L65515774), `3ac8f26b8d8e…` (L65515777), `70ef195059d5…` (L65515786) |
| `DataEntryExt.v0` | 20 | – | `78b633f543eb…` (L65514257), `ec281660f0a9…` (L65514281), `4229d0395491…` (L65514907) |
| `LedgerEntryData.data` | 20 | – | `78b633f543eb…` (L65514257), `ec281660f0a9…` (L65514281), `4229d0395491…` (L65514907) |
| `ManageBuyOfferResult.cross_self` | 21 | – | `79d6a10b232b…` (L65514559), `393678fe42c4…` (L65514565), `37958a949e42…` (L65514721) |
| `ScVal.i256` | 34 | CAP-0046 | `4be5d49c900e…` (L65514085), `77999e389f13…` (L65514095), `d339635c89fe…` (L65514123) |
| `CreateAccountResult.already_exist` | 40 | – | `43d96514a055…` (L65514513), `323e6b5abf30…` (L65514514), `46f227491546…` (L65514515) |
| `PathPaymentStrictSendResult.no_destination` | 45 | – | `6168ce528b0c…` (L65514081), `999a8c99f500…` (L65514146), `96612f68b903…` (L65514212) |
| `ManageBuyOfferResult.buy_no_trust` | 69 | – | `9d98ef29c26c…` (L65514099), `96268ff19044…` (L65514308), `b282078887cf…` (L65514325) |
| `ManageSellOfferResult.sell_no_trust` | 78 | – | `9d98ef29c26c…` (L65514099), `96268ff19044…` (L65514308), `b282078887cf…` (L65514325) |
| `Memo.return` | 92 | – | `dac11f666516…` (L65514054), `e8c28a72e5ec…` (L65514084), `9bd84ca13a8a…` (L65514086) |
| `LedgerEntryChange.restored` | 95 | – | `be9e9773b53a…` (L65514037), `5e5853fb9a16…` (L65514078), `ea945f7e890b…` (L65514083) |
| `SorobanTransactionDataExt.v1` | 95 | CAP-0046 | `be9e9773b53a…` (L65514037), `5e5853fb9a16…` (L65514078), `ea945f7e890b…` (L65514083) |
| `OperationResult.op_exceeded_work_limit` | 374 | – | `d2403e2e8c41…` (L65514249), `8561ad059527…` (L65514249), `42ad925b2de6…` (L65514249) |

