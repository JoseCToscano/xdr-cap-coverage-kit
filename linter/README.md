# xdrlint

A `go/analysis` analyzer for code that reads Stellar XDR.

| Rule | What it flags | Status |
|---|---|---|
| XDRL002 | A function (or function literal) that calls itself, takes `xdr.ScVal`, `ScVec`, `ScMap`, `ScMapEntry`, `SorobanAuthorizedInvocation` or `ClaimPredicate` (value, pointer or slice), and shows no cap: no comparison on an integer parameter or on a name like depth/level/limit/budget/remaining | Built |
| XDRL001 | Unvalidated passthrough fields (memo, auth trees, muxed IDs) used as trusted values | Milestone 2 |
| XDRL003 | Participants built from the envelope instead of the meta | Milestone 2 |

XDRL002 is a syntactic heuristic: it does not follow mutual recursion across functions, and a cap enforced by the caller is invisible to it.

```sh
cd linter && go test ./...          # analysistest: testdata/src/seeded (5 wants) and testdata/src/clean (0)
go run ./cmd/xdrlint ./...          # from inside any Go module
bash linter/scan-wallet-backend.sh  # clean wallet-backend checkout at 3e22515a -> SCAN-wallet-backend.txt
```

## Results (Nov 13, 2026)

- `TestSeeded` PASS (all 5 seeded violations reported, including a closure and a method), `TestClean` PASS (depth-capped, budget-capped, iterative and non-XDR recursion are not reported). Mutation check: with reporting disabled, `TestSeeded` fails with 5 "no diagnostic was reported" errors.
- wallet-backend `3e22515a`: **1 finding**, `internal/indexer/processors/contract_deploy.go:116` `walkInvocation` recurses over `SorobanAuthorizedInvocation` with no cap. The tree comes from the transaction's auth entries; on the standard decode path its depth is already bounded by go-xdr's decode depth limit (1500 in the pinned version) and by transaction size, so this is a hardening note, not an ingestion halt. Not filed upstream.
