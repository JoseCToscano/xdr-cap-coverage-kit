// Command xdrlint runs the kit's go/analysis rules.
//
//	go run ./cmd/xdrlint ./...            (from inside the module to scan)
//	go vet -vettool=$(which xdrlint) ./...
package main

import (
	"github.com/JoseCToscano/xdr-cap-coverage-kit/linter/xdrl002"
	"golang.org/x/tools/go/analysis/multichecker"
)

func main() { multichecker.Main(xdrl002.Analyzer) }
