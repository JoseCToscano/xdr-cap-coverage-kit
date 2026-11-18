// Clean code: nothing here may be flagged.
package clean

import (
	"errors"

	"github.com/stellar/go-stellar-sdk/xdr"
)

const maxDepth = 64

var errTooDeep = errors.New("too deep")

// Depth parameter compared against a limit.
func countScVal(v xdr.ScVal, depth int) (int, error) {
	if depth > maxDepth {
		return 0, errTooDeep
	}
	n := 1
	if v.Vec != nil && *v.Vec != nil {
		for _, c := range **v.Vec {
			m, err := countScVal(c, depth+1)
			if err != nil {
				return 0, err
			}
			n += m
		}
	}
	return n, nil
}

// Budget carried on the receiver.
type walker struct{ remaining int }

func (w *walker) walkAuth(inv *xdr.SorobanAuthorizedInvocation) error {
	w.remaining--
	if w.remaining < 0 {
		return errTooDeep
	}
	for i := range inv.SubInvocations {
		if err := w.walkAuth(&inv.SubInvocations[i]); err != nil {
			return err
		}
	}
	return nil
}

// Iterative traversal with an explicit stack: not recursive.
func countIter(root xdr.SorobanAuthorizedInvocation) int {
	stack := []xdr.SorobanAuthorizedInvocation{root}
	n := 0
	for len(stack) > 0 {
		top := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		n++
		stack = append(stack, top.SubInvocations...)
	}
	return n
}

// Recursion over a non-XDR type is out of scope.
type tree struct{ kids []tree }

func size(t tree) int {
	n := 1
	for _, k := range t.kids {
		n += size(k)
	}
	return n
}

// Non-recursive use of ScVal.
func isVec(v xdr.ScVal) bool { return v.Vec != nil }
