// Package xdrl002 implements XDRL002: recursion over a recursive XDR
// structure without a depth or size cap.
//
// ScVal (vec/map), SorobanAuthorizedInvocation (sub_invocations) and
// ClaimPredicate (and/or/not) nest arbitrarily in the XDR type. A reader that
// walks them recursively with no limit lets a crafted value drive its stack
// or CPU. The rule flags a function or function literal that
//
//  1. calls itself (directly, or through the variable a function literal is
//     assigned to), and
//  2. takes one of those types (value, pointer, or slice of them) from a
//     package whose import path ends in "/xdr", and
//  3. has no visible cap: no comparison in its body involving one of its
//     integer parameters, or an identifier or field named like
//     depth/level/limit/budget/remaining.
//
// It is a syntactic heuristic. It does not follow mutual recursion across
// functions, and a cap enforced by the caller is not visible to it.
package xdrl002

import (
	"go/ast"
	"go/token"
	"go/types"
	"regexp"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/inspect"
	"golang.org/x/tools/go/ast/inspector"
)

var Analyzer = &analysis.Analyzer{
	Name:     "xdrl002",
	Doc:      "XDRL002: recursion over ScVal, SorobanAuthorizedInvocation or ClaimPredicate without a depth or size cap",
	Requires: []*analysis.Analyzer{inspect.Analyzer},
	Run:      run,
}

// RecursiveTypes are the XDR types whose values can nest without bound.
var RecursiveTypes = map[string]bool{
	"ScVal": true, "ScVec": true, "ScMap": true, "ScMapEntry": true,
	"SorobanAuthorizedInvocation": true, "ClaimPredicate": true,
}

var capName = regexp.MustCompile(`(?i)depth|level|limit|budget|remaining|maxnest`)

// recursiveXDR returns the XDR type name if t is (a pointer to / slice of) a recursive XDR type.
func recursiveXDR(t types.Type) string {
	for {
		switch u := t.(type) {
		case *types.Pointer:
			t = u.Elem()
			continue
		case *types.Slice:
			t = u.Elem()
			continue
		case *types.Alias:
			t = types.Unalias(u)
			continue
		}
		break
	}
	n, ok := t.(*types.Named)
	if !ok || n.Obj().Pkg() == nil {
		return ""
	}
	if p := n.Obj().Pkg().Path(); (p == "xdr" || strings.HasSuffix(p, "/xdr")) && RecursiveTypes[n.Obj().Name()] {
		return n.Obj().Name()
	}
	return ""
}

func run(pass *analysis.Pass) (any, error) {
	ins := pass.ResultOf[inspect.Analyzer].(*inspector.Inspector)
	// Function declarations.
	ins.Preorder([]ast.Node{(*ast.FuncDecl)(nil)}, func(n ast.Node) {
		fd := n.(*ast.FuncDecl)
		if fd.Body == nil {
			return
		}
		obj, _ := pass.TypesInfo.Defs[fd.Name].(*types.Func)
		if obj == nil {
			return
		}
		check(pass, fd.Name.Pos(), fd.Name.Name, obj, obj.Type().(*types.Signature), fd.Body)
	})
	// Function literals assigned to a variable they call: walk = func(...) { ... walk(...) }
	ins.Preorder([]ast.Node{(*ast.AssignStmt)(nil), (*ast.ValueSpec)(nil)}, func(n ast.Node) {
		var lhs []ast.Expr
		var rhs []ast.Expr
		switch s := n.(type) {
		case *ast.AssignStmt:
			lhs, rhs = s.Lhs, s.Rhs
		case *ast.ValueSpec:
			for _, id := range s.Names {
				lhs = append(lhs, id)
			}
			rhs = s.Values
		}
		for i, r := range rhs {
			fl, ok := r.(*ast.FuncLit)
			if !ok || i >= len(lhs) {
				continue
			}
			id, ok := lhs[i].(*ast.Ident)
			if !ok {
				continue
			}
			v := pass.TypesInfo.ObjectOf(id)
			sig, _ := pass.TypesInfo.TypeOf(fl).(*types.Signature)
			if v == nil || sig == nil {
				continue
			}
			check(pass, fl.Pos(), id.Name, v, sig, fl.Body)
		}
	})
	return nil, nil
}

func check(pass *analysis.Pass, pos token.Pos, name string, self types.Object, sig *types.Signature, body *ast.BlockStmt) {
	// 2. takes a recursive XDR type
	var xt string
	var intParams = map[types.Object]bool{}
	vars := []*types.Var{}
	if sig.Recv() != nil {
		vars = append(vars, sig.Recv())
	}
	for i := 0; i < sig.Params().Len(); i++ {
		vars = append(vars, sig.Params().At(i))
	}
	for _, v := range vars {
		if t := recursiveXDR(v.Type()); t != "" && xt == "" {
			xt = t
		}
		if b, ok := v.Type().Underlying().(*types.Basic); ok && b.Info()&types.IsInteger != 0 {
			intParams[v] = true
		}
	}
	if xt == "" {
		return
	}
	// 1. calls itself
	recursive := false
	ast.Inspect(body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		var id *ast.Ident
		switch f := call.Fun.(type) {
		case *ast.Ident:
			id = f
		case *ast.SelectorExpr:
			id = f.Sel
		}
		if id != nil && pass.TypesInfo.Uses[id] == self {
			recursive = true
		}
		return !recursive
	})
	if !recursive {
		return
	}
	// 3. a cap is visible
	capped := false
	ast.Inspect(body, func(n ast.Node) bool {
		be, ok := n.(*ast.BinaryExpr)
		if !ok {
			return !capped
		}
		switch be.Op {
		case token.GTR, token.GEQ, token.LSS, token.LEQ, token.EQL:
		default:
			return true
		}
		for _, side := range []ast.Expr{be.X, be.Y} {
			ast.Inspect(side, func(m ast.Node) bool {
				switch e := m.(type) {
				case *ast.Ident:
					if o := pass.TypesInfo.Uses[e]; o != nil && intParams[o] {
						capped = true
					}
					if capName.MatchString(e.Name) {
						capped = true
					}
				}
				return !capped
			})
		}
		return !capped
	})
	if capped {
		return
	}
	pass.Reportf(pos, "XDRL002: %s recurses over xdr.%s with no depth or size cap; nested values come from the network and can be arbitrarily deep (pass a depth and stop at a limit)", name, xt)
}
