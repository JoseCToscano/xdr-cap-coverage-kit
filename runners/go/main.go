// Go conformance runner. Owner: Alejandro Mercado.
//
// For each corpus entry, with go-stellar-sdk/xdr:
//   - sha256 of the bytes, decode, byte-exact re-encode
//   - transaction hash recomputed under the entry's passphrase
//   - every `strkey` check: the expected strkey must be one of the addresses
//     the Go decode produces (MuxedAccount, AccountId, SCAddress incl. W,
//     SignerKey incl. P, PoolId). Go has no SEP-51 encoder, so pointer-level
//     `equals` checks are reported as n/a here and covered by JS and Rust.
//   - for entries with a LedgerCloseMeta: the Galexie object (zstd
//     LedgerCloseMetaBatch) decompresses to the recorded hashes, the LCM
//     re-encodes byte-exact, the entry's tx is at ledger.tx_index, the header
//     protocol matches, and Protocol 30 headers carry closeTimeMs with
//     closeTime == closeTimeMs/1000 (CAP-88).
//
// Writes ../../reports/raw/go.json. Exit 1 on any failure.
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
	"reflect"
	"sort"
	"strings"

	"github.com/klauspost/compress/zstd"
	"github.com/stellar/go-stellar-sdk/network"
	"github.com/stellar/go-stellar-sdk/strkey"
	"github.com/stellar/go-stellar-sdk/xdr"
)

type check struct {
	ID    string          `json:"id"`
	Path  string          `json:"path"`
	Op    string          `json:"op"`
	Value json.RawMessage `json:"value"`
}

type entry struct {
	ID      string `json:"id"`
	Network struct {
		Passphrase     string `json:"passphrase"`
		ExpectedTxHash string `json:"expected_tx_hash"`
	} `json:"network"`
	XDR struct {
		Type   string `json:"type"`
		Base64 string `json:"base64"`
		SHA256 string `json:"sha256"`
	} `json:"xdr"`
	Expected struct {
		Checks       []check `json:"checks"`
		LedgerChecks []check `json:"ledger_checks"`
	} `json:"expected"`
	Ledger *struct {
		Sequence        uint32 `json:"sequence"`
		ProtocolVersion uint32 `json:"protocol_version"`
		File            string `json:"file"`
		SHA256Zst       string `json:"sha256_zst"`
		SHA256LCM       string `json:"sha256_lcm"`
		TxIndex         *int   `json:"tx_index"`
	} `json:"ledger"`
}

type codec interface {
	UnmarshalBinary([]byte) error
	MarshalBinary() ([]byte, error)
}

func newValue(t string) (codec, bool) {
	switch t {
	case "TransactionEnvelope":
		return &xdr.TransactionEnvelope{}, true
	case "ScVal":
		return &xdr.ScVal{}, true
	case "LedgerCloseMeta":
		return &xdr.LedgerCloseMeta{}, true
	case "LedgerHeader":
		return &xdr.LedgerHeader{}, true
	}
	return nil, false
}

type row struct {
	Entry  string `json:"entry"`
	Step   string `json:"step"`
	OK     bool   `json:"ok"`
	NA     bool   `json:"na,omitempty"`
	Detail string `json:"detail,omitempty"`
}

var (
	rows  []row
	fails int
)

func report(id, step string, ok bool, detail string) {
	status := "ok  "
	if !ok {
		status = "FAIL"
		fails++
	}
	r := row{Entry: id, Step: step, OK: ok}
	if !ok {
		r.Detail = detail
	}
	rows = append(rows, r)
	fmt.Printf("%s %s [go] %s %s\n", status, id, step, map[bool]string{true: "", false: detail}[ok])
}

func na(id, step, why string) {
	rows = append(rows, row{Entry: id, Step: step, OK: true, NA: true, Detail: why})
	fmt.Printf("n/a  %s [go] %s (%s)\n", id, step, why)
}

// addresses walks any decoded XDR value and returns every strkey the Go SDK
// renders for the address-like types it meets.
func addresses(v any) map[string]bool {
	out := map[string]bool{}
	var walk func(r reflect.Value)
	walk = func(r reflect.Value) {
		if !r.IsValid() {
			return
		}
		if r.Kind() == reflect.Pointer || r.Kind() == reflect.Interface {
			if r.IsNil() {
				return
			}
			walk(r.Elem())
			return
		}
		if r.CanInterface() {
			switch x := r.Interface().(type) {
			case xdr.MuxedAccount:
				if s, err := x.GetAddress(); err == nil {
					out[s] = true
				}
			case xdr.AccountId:
				if x.Ed25519 != nil {
					out[x.Address()] = true
				}
			case xdr.ScAddress:
				if s, err := x.String(); err == nil {
					out[s] = true
				}
			case xdr.SignerKey:
				if s, err := x.GetAddress(); err == nil {
					out[s] = true
				}
			case xdr.PoolId:
				if s, err := strkey.Encode(strkey.VersionByteLiquidityPool, x[:]); err == nil {
					out[s] = true
				}
			}
		}
		switch r.Kind() {
		case reflect.Struct:
			for i := 0; i < r.NumField(); i++ {
				if r.Type().Field(i).IsExported() {
					walk(r.Field(i))
				}
			}
		case reflect.Slice:
			if r.Type().Elem().Kind() == reflect.Uint8 {
				return
			}
			for i := 0; i < r.Len(); i++ {
				walk(r.Index(i))
			}
		case reflect.Array:
			if r.Type().Elem().Kind() == reflect.Uint8 {
				return
			}
			for i := 0; i < r.Len(); i++ {
				walk(r.Index(i))
			}
		}
	}
	walk(reflect.ValueOf(v))
	return out
}

func strkeyChecks(id, prefix string, checks []check, found map[string]bool) {
	for _, c := range checks {
		if c.Op != "strkey" {
			na(id, prefix+c.ID, "pointer check; no SEP-51 encoder in Go")
			continue
		}
		var want string
		_ = json.Unmarshal(c.Value, &want)
		report(id, prefix+c.ID+" (strkey present in Go decode)", found[want], "Go decode does not produce "+want)
	}
}

func main() {
	root := "../.."
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	files, _ := filepath.Glob(filepath.Join(root, "corpus/entries/*.json"))
	sort.Strings(files)
	dec, _ := zstd.NewReader(nil)
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
		report(e.ID, "sha256", hex.EncodeToString(sum[:]) == e.XDR.SHA256, "")
		v, ok := newValue(e.XDR.Type)
		if !ok {
			report(e.ID, "decode", false, "type not wired: "+e.XDR.Type)
			continue
		}
		if err := v.UnmarshalBinary(b); err != nil {
			report(e.ID, "decode", false, err.Error())
			continue
		}
		out, err := v.MarshalBinary()
		report(e.ID, "re-encode byte-exact", err == nil && bytes.Equal(out, b), fmt.Sprint(err))
		if env, ok := v.(*xdr.TransactionEnvelope); ok && e.Network.ExpectedTxHash != "" {
			h, err := network.HashTransactionInEnvelope(*env, e.Network.Passphrase)
			report(e.ID, "tx hash", err == nil && hex.EncodeToString(h[:]) == e.Network.ExpectedTxHash, hex.EncodeToString(h[:]))
		}
		strkeyChecks(e.ID, "check ", e.Expected.Checks, addresses(v))

		if e.Ledger == nil {
			continue
		}
		zst, err := os.ReadFile(filepath.Join(root, e.Ledger.File))
		if err != nil {
			report(e.ID, "lcm read", false, err.Error())
			continue
		}
		zs := sha256.Sum256(zst)
		report(e.ID, "lcm object sha256", hex.EncodeToString(zs[:]) == e.Ledger.SHA256Zst, "")
		batchBytes, err := dec.DecodeAll(zst, nil)
		if err != nil {
			report(e.ID, "lcm zstd", false, err.Error())
			continue
		}
		var batch xdr.LedgerCloseMetaBatch
		if err := batch.UnmarshalBinary(batchBytes); err != nil {
			report(e.ID, "lcm batch decode", false, err.Error())
			continue
		}
		report(e.ID, "lcm batch range", uint32(batch.StartSequence) == e.Ledger.Sequence && uint32(batch.EndSequence) == e.Ledger.Sequence && len(batch.LedgerCloseMetas) == 1, "")
		lcm := batch.LedgerCloseMetas[0]
		lb, err := lcm.MarshalBinary()
		ls := sha256.Sum256(lb)
		report(e.ID, "lcm re-encode sha256", err == nil && hex.EncodeToString(ls[:]) == e.Ledger.SHA256LCM, "")
		hdr := lcm.LedgerHeaderHistoryEntry().Header
		report(e.ID, "lcm protocol", uint32(hdr.LedgerVersion) == e.Ledger.ProtocolVersion, fmt.Sprint(hdr.LedgerVersion))
		if hdr.LedgerVersion >= 30 {
			ms, ok := hdr.ScpValue.Ext.GetSignedMsValue()
			report(e.ID, "lcm CAP-88 closeTimeMs/1000 == closeTime", ok && uint64(ms.CloseTimeMs)/1000 == uint64(hdr.ScpValue.CloseTime), "")
		}
		if e.Ledger.TxIndex != nil {
			i := *e.Ledger.TxIndex
			var found map[string]bool
			if i < lcm.CountTransactions() {
				h := lcm.TransactionHash(i)
				report(e.ID, "lcm tx at tx_index", hex.EncodeToString(h[:]) == e.Network.ExpectedTxHash, hex.EncodeToString(h[:]))
				found = addresses(lcm.MustV2().TxProcessing[i])
			} else {
				report(e.ID, "lcm tx at tx_index", false, "index out of range")
			}
			strkeyChecks(e.ID, "ledger_check ", e.Expected.LedgerChecks, found)
		} else {
			strkeyChecks(e.ID, "ledger_check ", e.Expected.LedgerChecks, addresses(lcm))
		}
	}
	os.MkdirAll(filepath.Join(root, "reports/raw"), 0o755)
	js, _ := json.MarshalIndent(rows, "", " ")
	os.WriteFile(filepath.Join(root, "reports/raw/go.json"), append(js, '\n'), 0o644)
	if fails > 0 {
		fmt.Printf("\n%d failure(s)\n", fails)
		os.Exit(1)
	}
	fmt.Println("\nall entries pass")
	_ = strings.TrimSpace
}
