// Go conformance runner, starter version. Owner: Alejandro Mercado.
// For each corpus entry: decode the base64 with go-stellar-sdk/xdr,
// re-encode, and check the bytes and sha256 match. Expected-value checks
// against SEP-51 JSON come next (Go has no SEP-51 encoder, so the plan is
// a small Go-side projection of the fields each check names).
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/stellar/go-stellar-sdk/xdr"
)

type entry struct {
	ID  string `json:"id"`
	XDR struct {
		Type   string `json:"type"`
		Base64 string `json:"base64"`
		SHA256 string `json:"sha256"`
	} `json:"xdr"`
}

type codec interface {
	UnmarshalBinary([]byte) error
	MarshalBinary() ([]byte, error)
}

// One line per XDR type the corpus uses. Grows with the corpus.
func newValue(t string) (codec, bool) {
	switch t {
	case "TransactionEnvelope":
		return &xdr.TransactionEnvelope{}, true
	case "ScVal":
		return &xdr.ScVal{}, true
	case "LedgerCloseMeta":
		return &xdr.LedgerCloseMeta{}, true
	}
	return nil, false
}

func main() {
	dir := "../../corpus/entries"
	if len(os.Args) > 1 {
		dir = os.Args[1]
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.json"))
	sort.Strings(files)
	fails := 0
	report := func(id, step string, ok bool, msg string) {
		status := "ok  "
		if !ok {
			status = "FAIL"
			fails++
		}
		fmt.Printf("%s %s %s %s\n", status, id, step, msg)
	}
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			panic(err)
		}
		var e entry
		if err := json.Unmarshal(raw, &e); err != nil {
			report(f, "parse", false, err.Error())
			continue
		}
		b, err := base64.StdEncoding.DecodeString(e.XDR.Base64)
		if err != nil {
			report(e.ID, "base64", false, err.Error())
			continue
		}
		sum := sha256.Sum256(b)
		report(e.ID, "go sha256", hex.EncodeToString(sum[:]) == e.XDR.SHA256, "")
		v, ok := newValue(e.XDR.Type)
		if !ok {
			report(e.ID, "go decode", false, "type not wired yet: "+e.XDR.Type)
			continue
		}
		if err := v.UnmarshalBinary(b); err != nil {
			report(e.ID, "go decode", false, err.Error())
			continue
		}
		out, err := v.MarshalBinary()
		report(e.ID, "go re-encode", err == nil && bytes.Equal(out, b), "")
	}
	if fails > 0 {
		fmt.Printf("\n%d failure(s)\n", fails)
		os.Exit(1)
	}
	fmt.Println("\nall entries pass")
}
