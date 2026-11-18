// Command replay runs the wallet-backend replay matrix: corpus ledgers from
// the Galexie data lake (or the mock RPC) -> real wallet-backend ingest ->
// real PostgreSQL/TimescaleDB -> verdicts read from stored rows.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/stellar/go-stellar-sdk/xdr"

	h "github.com/JoseCToscano/xdr-cap-coverage-kit/harness"
	"github.com/JoseCToscano/xdr-cap-coverage-kit/harness/mockrpc"
	"github.com/JoseCToscano/xdr-cap-coverage-kit/harness/walletbackend"
)

const passphrase = "Test SDF Network ; September 2015"

type entry struct {
	ID     string `json:"id"`
	Ledger struct {
		Sequence uint32 `json:"sequence"`
		TxIndex  int    `json:"tx_index"`
	} `json:"ledger"`
	Expected struct {
		JSON map[string]any `json:"json"`
	} `json:"expected"`
}

func ptr(v any, path ...any) any {
	for _, p := range path {
		switch k := p.(type) {
		case string:
			v = v.(map[string]any)[k]
		case int:
			v = v.([]any)[k]
		}
	}
	return v
}

func base(m string) string {
	ma, err := xdr.AddressToMuxedAccount(m)
	if err != nil {
		panic(err)
	}
	a := ma.ToAccountId()
	return a.Address()
}

func loadEntry(root, prefix string) entry {
	ms, _ := filepath.Glob(filepath.Join(root, "corpus/entries", prefix+"*.json"))
	if len(ms) != 1 {
		panic("entry " + prefix)
	}
	b, err := os.ReadFile(ms[0])
	if err != nil {
		panic(err)
	}
	var e entry
	if err := json.Unmarshal(b, &e); err != nil {
		panic(err)
	}
	return e
}

type row struct {
	Issue, Entry, Ledger, Build, Commit, Shim, Source, Expected, Got string
	Evidence                                                         []string
	IngestStage, IngestError                                         string
}

func main() {
	root := flag.String("root", "..", "kit repository root")
	repo := flag.String("wallet-backend", os.Getenv("WALLET_BACKEND_REPO"), "local wallet-backend clone")
	dsn := flag.String("pg", os.Getenv("XCK_PG_ADMIN_DSN"), "admin DSN (postgres://user@host:port/postgres?sslmode=disable)")
	only := flag.String("only", "", "comma-separated build labels to run (default all)")
	flag.Parse()
	if *repo == "" || *dsn == "" {
		fmt.Fprintln(os.Stderr, "need -wallet-backend and -pg (or WALLET_BACKEND_REPO / XCK_PG_ADMIN_DSN)")
		os.Exit(2)
	}
	r, _ := filepath.Abs(*root)
	lake := filepath.Join(r, "corpus/datalake/testnet")
	work := filepath.Join(r, "harness/.work")
	_ = os.MkdirAll(work, 0o755)

	// Mock RPC getLedgers over the same data lake.
	srv, err := mockrpc.Load(lake, passphrase)
	must(err)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	must(err)
	go http.Serve(ln, srv)
	rpcURL := "http://" + ln.Addr().String()

	cap40, cap27, cap73 := loadEntry(r, "cap40-"), loadEntry(r, "cap27-"), loadEntry(r, "cap73-")
	tx27 := ptr(cap27.Expected.JSON, "tx", "tx").(map[string]any)
	cases := map[string]h.Case{
		"729": {EntryID: cap40.ID, Issue: "wallet-backend#729", Ledger: cap40.Ledger.Sequence, TxIndex: cap40.Ledger.TxIndex,
			Expect: map[string]string{"kind": "signer", "signer": ptr(cap40.Expected.JSON, "tx", "tx", "operations", 0, "body", "set_options", "signer", "key").(string)}},
		// wallet-backend#716 lists three producers of over-long AddressBytea
		// values. Producer 3 (signed-payload signers) is on a real ledger: the
		// CAP-40 entry. Producer 1 (Soroban op with a muxed source) cannot land:
		// testnet rejects it (corpus/raw/wb716-soroban-muxed-*-source.json).
		"716": {EntryID: cap40.ID, Issue: "wallet-backend#716", Ledger: cap40.Ledger.Sequence, TxIndex: cap40.Ledger.TxIndex,
			Expect: map[string]string{"kind": "signer", "signer": ptr(cap40.Expected.JSON, "tx", "tx", "operations", 0, "body", "set_options", "signer", "key").(string)}},
		// Control: classic payment with muxed source and destination (CAP-27).
		// The classic path already reduced M to G before #693.
		"716-classic": {EntryID: cap27.ID, Issue: "wallet-backend#716 (classic control)", Ledger: cap27.Ledger.Sequence, TxIndex: cap27.Ledger.TxIndex,
			Expect: map[string]string{"kind": "participants", "accounts": base(tx27["source_account"].(string)) + "," + base(ptr(tx27, "operations", 0, "body", "payment", "destination").(string))}},
		"731": {EntryID: cap73.ID, Issue: "wallet-backend#731", Ledger: cap73.Ledger.Sequence, TxIndex: cap73.Ledger.TxIndex,
			Expect: map[string]string{"kind": "trustline", "account": ptr(cap73.Expected.JSON, "tx", "tx", "source_account").(string)}},
	}
	shim := walletbackend.SDKShim
	type run struct {
		b      h.Build
		src    h.Source
		cases  []string
		expect []h.Verdict
	}
	gal := h.Source{Kind: "galexie", URI: lake}
	rpc := h.Source{Kind: "rpc", URI: rpcURL}
	runs := []run{
		// 79ea2acd = 6e5a5910^ (#693 fixes #716); 2a0a84ea = 2c873353^ (#729); 764a4f5b = c152783c^ (#734 fixes #731).
		{h.Build{Label: "pre-fix", Commit: "79ea2acd"}, gal, []string{"716"}, []h.Verdict{h.Mishandled}},
		{h.Build{Label: "fix", Commit: "6e5a5910"}, gal, []string{"716"}, []h.Verdict{h.Halt}},
		{h.Build{Label: "pre-fix", Commit: "79ea2acd", Shim: shim}, gal, []string{"716-classic"}, []h.Verdict{h.Pass}},
		{h.Build{Label: "pre-fix", Commit: "2a0a84ea"}, gal, []string{"729"}, []h.Verdict{h.Halt}},
		{h.Build{Label: "fix", Commit: "2c873353"}, gal, []string{"729"}, []h.Verdict{h.Pass}},
		{h.Build{Label: "pre-fix", Commit: "764a4f5b", Shim: shim}, gal, []string{"731"}, []h.Verdict{h.Dropped}},
		{h.Build{Label: "fix", Commit: "c152783c", Shim: shim}, gal, []string{"731"}, []h.Verdict{h.Pass}},
		{h.Build{Label: "pre-fix-unshimmed", Commit: "764a4f5b"}, gal, []string{"731"}, []h.Verdict{h.Halt}},
		{h.Build{Label: "head", Commit: "3e22515a"}, gal, []string{"716", "716-classic", "729", "731"}, []h.Verdict{h.Pass, h.Pass, h.Pass, h.Pass}},
		{h.Build{Label: "head-via-mock-rpc", Commit: "3e22515a"}, rpc, []string{"716", "716-classic", "729", "731"}, []h.Verdict{h.Pass, h.Pass, h.Pass, h.Pass}},
	}
	ctx := context.Background()
	var rows []row
	fail := 0
	for _, rn := range runs {
		if *only != "" && !strings.Contains(","+*only+",", ","+rn.b.Label+",") {
			continue
		}
		a := &walletbackend.Adapter{Repo: *repo, WorkDir: work, AdminDSN: *dsn}
		t0 := time.Now()
		fmt.Printf("== %s %s (shim=%q, source=%s)\n", rn.b.Label, rn.b.Commit, rn.b.Shim, rn.src.Kind)
		must(a.Prepare(ctx, rn.b))
		var ledgers []uint32
		seen := map[uint32]bool{}
		for _, k := range rn.cases {
			if l := cases[k].Ledger; !seen[l] {
				seen[l] = true
				ledgers = append(ledgers, l)
			}
		}
		outs, err := a.IngestLedgers(ctx, rn.src, ledgers)
		must(err)
		for i, k := range rn.cases {
			c := cases[k]
			var in h.IngestOutcome
			for _, o := range outs {
				if o.Ledger == c.Ledger {
					in = o
				}
			}
			res, err := a.Verdict(ctx, c, in)
			must(err)
			mark := "OK"
			if res.Verdict != rn.expect[i] {
				mark = "UNEXPECTED"
				fail++
			}
			fmt.Printf("   %-20s ledger %d: %-10s (expected %s) %s\n", c.Issue, c.Ledger, res.Verdict, rn.expect[i], mark)
			for _, e := range res.Evidence {
				fmt.Println("     -", e)
			}
			rows = append(rows, row{Issue: c.Issue, Entry: c.EntryID, Ledger: fmt.Sprint(c.Ledger), Build: rn.b.Label, Commit: rn.b.Commit,
				Shim: rn.b.Shim, Source: rn.src.Kind, Expected: string(rn.expect[i]), Got: string(res.Verdict), Evidence: res.Evidence,
				IngestStage: in.Stage, IngestError: in.Error})
		}
		must(a.Close())
		fmt.Printf("   (%s)\n", time.Since(t0).Round(time.Second))
	}
	if *only == "" {
		writeReports(r, rows)
	}
	if fail > 0 {
		fmt.Printf("%d unexpected verdict(s)\n", fail)
		os.Exit(1)
	}
	fmt.Println("all verdicts as expected")
}

func writeReports(root string, rows []row) {
	b, _ := json.MarshalIndent(map[string]any{"adapter": "stellar/wallet-backend", "database": "PostgreSQL + TimescaleDB (real)", "rows": rows}, "", "  ")
	must(os.WriteFile(filepath.Join(root, "reports/raw/replay.json"), append(b, '\n'), 0o644))
	sort.SliceStable(rows, func(i, j int) bool { return issueKey(rows[i].Issue) < issueKey(rows[j].Issue) })
	var md strings.Builder
	md.WriteString("# Replay matrix: wallet-backend\n\n<!-- generated by harness/cmd/replay; do not edit -->\n\n")
	md.WriteString("Each row: one corpus ledger from `corpus/datalake/testnet` ingested by an unmodified wallet-backend checkout ")
	md.WriteString("(its own `processLedger` + `insertIntoDB`) into a real PostgreSQL + TimescaleDB database. ")
	md.WriteString("The verdict is decided by SQL over the rows wallet-backend stored, not by exit codes.\n\n")
	md.WriteString("| Issue | Corpus entry | Ledger | Build | Commit | SDK shim | Source | Expected | Verdict | Evidence (stored rows) |\n|---|---|---|---|---|---|---|---|---|---|\n")
	for _, r := range rows {
		s := "none"
		if r.Shim != "" {
			s = "go-stellar-sdk v0.8.0"
		}
		md.WriteString(fmt.Sprintf("| %s | `%s` | %s | %s | `%s` | %s | %s | %s | **%s** | %s |\n", r.Issue, r.Entry, r.Ledger, r.Build, r.Commit, s, r.Source, r.Expected, r.Got,
			strings.ReplaceAll(strings.Join(r.Evidence, "; "), "|", "\\|")))
	}
	md.WriteString("\nVerdicts: **pass** = expected row stored with expected values; **mishandled** = row stored with a wrong value; ")
	md.WriteString("**dropped** = ledger stored but the row for this shape is missing; **halt** = nothing for the ledger could be stored.\n\n")
	md.WriteString("SDK shim: the pre-fix and fix commits for #716 and #731 pin go-stellar-sdk v0.7.3, which has no Protocol 30 XDR and cannot decode any P30 ledger ")
	md.WriteString("(see the `pre-fix-unshimmed` row). For those rows the harness runs `" + walletbackend.SDKShim + "` in the worktree; no wallet-backend source file is changed. ")
	md.WriteString("#716 and #729 use a Protocol 28 ledger and run on unmodified commits.\n\n")
	md.WriteString("#716 lists three producers of over-long `AddressBytea` values. This matrix replays producer 3 (signed-payload signer) from a real ledger: ")
	md.WriteString("before #693 the P key is silently truncated (mishandled); #693 turns that into an error (halt); #729 stores it (pass). ")
	md.WriteString("Producer 1 (Soroban op with a muxed source account) cannot reach a ledger: testnet rejected both a muxed transaction source and a muxed operation source ")
	md.WriteString("on a Soroban transaction with `tx_soroban_invalid` (`corpus/raw/wb716-soroban-muxed-tx-source.json`, `corpus/raw/wb716-soroban-muxed-op-source.json`). ")
	md.WriteString("Producer 2 (SEP-41 event with a muxed address in a topic) is not in the corpus yet: SAC events put the base G in topics (CAP-67), so it needs a custom token contract.\n")
	must(os.WriteFile(filepath.Join(root, "reports/replay-matrix.md"), []byte(md.String()), 0o644))
}

func issueKey(s string) string {
	for _, p := range []string{"#716", "#729", "#731"} {
		if strings.Contains(s, p) {
			return p + s
		}
	}
	return s
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
