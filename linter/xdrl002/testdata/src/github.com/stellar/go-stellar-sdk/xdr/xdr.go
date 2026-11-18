// Package xdr is a minimal stand-in for go-stellar-sdk/xdr with the same
// type names, so the fixtures type-check without the real module.
package xdr

type ScValType int32

type ScVec []ScVal

type ScMapEntry struct{ Key, Val ScVal }

type ScMap []ScMapEntry

type ScVal struct {
	Type ScValType
	Vec  **ScVec
	Map  **ScMap
}

type SorobanAuthorizedInvocation struct {
	SubInvocations []SorobanAuthorizedInvocation
}

type ClaimPredicate struct {
	AndPredicates *[]ClaimPredicate
	NotPredicate  **ClaimPredicate
}
