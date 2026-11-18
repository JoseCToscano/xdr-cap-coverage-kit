// Seeded violations: every function here must be flagged.
package seeded

import "github.com/stellar/go-stellar-sdk/xdr"

func countScVal(v xdr.ScVal) int { // want `XDRL002: countScVal recurses over xdr.ScVal`
	n := 1
	if v.Vec != nil && *v.Vec != nil {
		for _, c := range **v.Vec {
			n += countScVal(c)
		}
	}
	if v.Map != nil && *v.Map != nil {
		for _, e := range **v.Map {
			n += countScVal(e.Key) + countScVal(e.Val)
		}
	}
	return n
}

func walkAuth(inv *xdr.SorobanAuthorizedInvocation, visit func(*xdr.SorobanAuthorizedInvocation)) { // want `XDRL002: walkAuth recurses over xdr.SorobanAuthorizedInvocation`
	visit(inv)
	for i := range inv.SubInvocations {
		walkAuth(&inv.SubInvocations[i], visit)
	}
}

type flattener struct{ out []xdr.ClaimPredicate }

func (f *flattener) flatten(p xdr.ClaimPredicate) { // want `XDRL002: flatten recurses over xdr.ClaimPredicate`
	f.out = append(f.out, p)
	if p.AndPredicates != nil {
		for _, q := range *p.AndPredicates {
			f.flatten(q)
		}
	}
}

func closure(root xdr.ScVal) int {
	var walk func(xdr.ScVal) int
	walk = func(v xdr.ScVal) int { // want `XDRL002: walk recurses over xdr.ScVal`
		if v.Vec == nil || *v.Vec == nil {
			return 1
		}
		n := 1
		for _, c := range **v.Vec {
			n += walk(c)
		}
		return n
	}
	return walk(root)
}

// A depth parameter that is passed along but never compared is not a cap.
func unusedDepth(v xdr.ScVal, depth int) int { // want `XDRL002: unusedDepth recurses over xdr.ScVal`
	if v.Vec == nil || *v.Vec == nil {
		return depth
	}
	for _, c := range **v.Vec {
		unusedDepth(c, depth+1)
	}
	return depth
}
