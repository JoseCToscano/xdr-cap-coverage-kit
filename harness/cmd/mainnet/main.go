// Command mainnet replays real mainnet transactions (harness/mainnet-cases.json)
// through wallet-backend into real PostgreSQL/TimescaleDB, on current main and
// on the pre-fix / fix commits of the reproduced issues, and decides verdicts
// from the stored rows. Ledgers come from SDF's public Galexie archive
// (pubnet), are cached in harness/.work/lake-pubnet and checked against the
// sha256 recorded in the case file.
//
// Unlike cmd/replay this is a probe: there is no expected verdict per build.
// It writes reports/replay-mainnet.md and reports/raw/replay-mainnet.json;
// with -check it fails if a verdict differs from the committed JSON.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	h "github.com/JoseCToscano/xdr-cap-coverage-kit/harness"
	"github.com/JoseCToscano/xdr-cap-coverage-kit/harness/walletbackend"
)

const passphrase = "Public Global Stellar Network ; September 2015"
const archive = "https://aws-public-blockchain.s3.us-east-2.amazonaws.com/v1.1/stellar/ledgers/pubnet"

type mcase struct {
	ID        string            `json:"id"`
	Group     string            `json:"group"`
	Note      string            `json:"note"`
	Ledger    uint32            `json:"ledger"`
	Tx        string            `json:"tx"`
	TxIndex   int               `json:"tx_index"`
	LedgerTxs int               `json:"ledger_txs"`
	ObjectKey string            `json:"object_key"`
	SHA256Zst string            `json:"sha256_zst"`
	Expect    map[string]string `json:"expect"`
}

type row struct {
	Case, Group, Tx, Ledger, Build, Commit, Shim, Verdict string
	Evidence                                              []string
	IngestStage, IngestError                              string
}

func fetch(lake string, c mcase) error {
	p := filepath.Join(lake, c.ObjectKey)
	b, err := os.ReadFile(p)
	if err != nil {
		resp, err := http.Get(archive + "/" + c.ObjectKey)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return fmt.Errorf("%s: HTTP %d", c.ObjectKey, resp.StatusCode)
		}
		if b, err = io.ReadAll(resp.Body); err != nil {
			return err
		}
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, b, 0o644); err != nil {
			return err
		}
	}
	if s := sha256.Sum256(b); hex.EncodeToString(s[:]) != c.SHA256Zst {
		return fmt.Errorf("%s: sha256 mismatch", c.ObjectKey)
	}
	return nil
}

func main() {
	root := flag.String("root", "..", "kit repository root")
	repo := flag.String("wallet-backend", os.Getenv("WALLET_BACKEND_REPO"), "local wallet-backend clone")
	dsn := flag.String("pg", os.Getenv("XCK_PG_ADMIN_DSN"), "admin DSN")
	only := flag.String("only", "", "comma-separated build labels to run (default all)")
	check := flag.Bool("check", false, "fail if a verdict differs from reports/raw/replay-mainnet.json")
	render := flag.Bool("render", false, "rewrite reports/replay-mainnet.md from reports/raw/replay-mainnet.json without replaying")
	flag.Parse()
	if *render {
		var cf0 struct{ Cases []mcase }
		var old struct{ Rows []row }
		cb, err := os.ReadFile(filepath.Join(*root, "harness/mainnet-cases.json"))
		must(err)
		must(json.Unmarshal(cb, &cf0))
		ob, err := os.ReadFile(filepath.Join(*root, "reports/raw/replay-mainnet.json"))
		must(err)
		must(json.Unmarshal(ob, &old))
		writeReports(*root, cf0.Cases, old.Rows)
		return
	}
	if *repo == "" || *dsn == "" {
		fmt.Fprintln(os.Stderr, "need -wallet-backend and -pg")
		os.Exit(2)
	}
	r, _ := filepath.Abs(*root)
	work := filepath.Join(r, "harness/.work")
	lake := filepath.Join(work, "lake-pubnet")
	must(os.MkdirAll(lake, 0o755))
	must(os.WriteFile(filepath.Join(lake, ".config.json"), []byte(`{"networkPassphrase":"`+passphrase+`","version":"1.0","compression":"zstd","ledgersPerBatch":1,"batchesPerPartition":64000}`), 0o644))

	var cf struct {
		Cases []mcase `json:"cases"`
	}
	b, err := os.ReadFile(filepath.Join(r, "harness/mainnet-cases.json"))
	must(err)
	must(json.Unmarshal(b, &cf))
	var ledgers []uint32
	seen := map[uint32]bool{}
	for _, c := range cf.Cases {
		must(fetch(lake, c))
		if !seen[c.Ledger] {
			seen[c.Ledger] = true
			ledgers = append(ledgers, c.Ledger)
		}
	}
	sort.Slice(ledgers, func(i, j int) bool { return ledgers[i] < ledgers[j] })

	builds := []h.Build{
		{Label: "head", Commit: "3e22515a"},        // wallet-backend main
		{Label: "pre-fix-716", Commit: "79ea2acd"}, // 6e5a5910^ (#693 fixes #716)
		{Label: "fix-716", Commit: "6e5a5910"},     // #693
		{Label: "pre-fix-729", Commit: "2a0a84ea"}, // 2c873353^
		{Label: "fix-729", Commit: "2c873353"},     // #729
		{Label: "pre-fix-731", Commit: "764a4f5b"}, // c152783c^ (#734 fixes #731)
		{Label: "fix-731", Commit: "c152783c"},     // #734
	}
	src := h.Source{Kind: "galexie", URI: lake, Passphrase: passphrase}
	ctx := context.Background()
	var rows []row
	for _, bd := range builds {
		if *only != "" && !strings.Contains(","+*only+",", ","+bd.Label+",") {
			continue
		}
		a := &walletbackend.Adapter{Repo: *repo, WorkDir: work, AdminDSN: *dsn}
		t0 := time.Now()
		fmt.Printf("== %s %s\n", bd.Label, bd.Commit)
		must(a.Prepare(ctx, bd))
		outs, err := a.IngestLedgers(ctx, src, ledgers)
		must(err)
		for _, c := range cf.Cases {
			var in h.IngestOutcome
			for _, o := range outs {
				if o.Ledger == c.Ledger {
					in = o
				}
			}
			hc := h.Case{EntryID: c.ID, Issue: c.Group, Ledger: c.Ledger, TxIndex: c.TxIndex, Expect: c.Expect}
			res, err := a.Verdict(ctx, hc, in)
			must(err)
			res.Evidence = append([]string{fmt.Sprintf("ledger has %d transactions", c.LedgerTxs)}, res.Evidence...)
			fmt.Printf("   %-40s %-10s\n", c.ID, res.Verdict)
			for _, e := range res.Evidence {
				fmt.Println("     -", e)
			}
			rows = append(rows, row{Case: c.ID, Group: c.Group, Tx: c.Tx, Ledger: fmt.Sprint(c.Ledger), Build: bd.Label, Commit: bd.Commit,
				Verdict: string(res.Verdict), Evidence: res.Evidence, IngestStage: in.Stage, IngestError: in.Error})
		}
		must(a.Close())
		fmt.Printf("   (%s)\n", time.Since(t0).Round(time.Second))
	}
	rawPath := filepath.Join(r, "reports/raw/replay-mainnet.json")
	if *check {
		var old struct{ Rows []row }
		ob, err := os.ReadFile(rawPath)
		must(err)
		must(json.Unmarshal(ob, &old))
		want := map[string]string{}
		for _, o := range old.Rows {
			want[o.Case+"@"+o.Build] = o.Verdict
		}
		bad := 0
		for _, x := range rows {
			if w, ok := want[x.Case+"@"+x.Build]; !ok || w != x.Verdict {
				fmt.Printf("verdict changed: %s on %s: committed %q, now %q\n", x.Case, x.Build, w, x.Verdict)
				bad++
			}
		}
		if bad > 0 {
			os.Exit(1)
		}
		fmt.Println("all verdicts match reports/raw/replay-mainnet.json")
		return
	}
	if *only == "" {
		writeReports(r, cf.Cases, rows)
	}
}

func writeReports(root string, cases []mcase, rows []row) {
	b, _ := json.MarshalIndent(map[string]any{"adapter": "stellar/wallet-backend", "network": "pubnet", "database": "PostgreSQL + TimescaleDB (real)", "rows": rows}, "", "  ")
	must(os.WriteFile(filepath.Join(root, "reports/raw/replay-mainnet.json"), append(b, '\n'), 0o644))
	var md strings.Builder
	md.WriteString("# Mainnet replay probe: wallet-backend\n\n<!-- generated by harness/cmd/mainnet; do not edit -->\n\n")
	md.WriteString("Real mainnet transactions picked by the frequency study (`reports/frequency.md`), ingested by unmodified wallet-backend checkouts ")
	md.WriteString("(its own `processLedger` + `insertIntoDB`) into a real PostgreSQL + TimescaleDB database. Ledgers: SDF's public Galexie archive (pubnet), ")
	md.WriteString("sha256-pinned in `harness/mainnet-cases.json`. Expectations are derived from the ledger by `tools/mainnet-cases.mjs` with the reference decoder. ")
	md.WriteString("Verdicts come from SQL over the stored rows.\n\n")
	// Summary: verdict counts per case kind and build.
	var builds []string
	seenB := map[string]string{}
	kinds := []string{}
	seenK := map[string]bool{}
	cnt := map[string]map[string]int{}
	for _, x := range rows {
		if _, ok := seenB[x.Build]; !ok {
			seenB[x.Build] = x.Commit
			builds = append(builds, x.Build)
		}
		k := x.Group
		if strings.HasSuffix(x.Case, "-trustline") {
			k += " (TRUSTLINE/ADD state change)"
		} else {
			k += " (tx row + participants)"
		}
		if !seenK[k] {
			seenK[k] = true
			kinds = append(kinds, k)
		}
		if cnt[k] == nil {
			cnt[k] = map[string]int{}
		}
		cnt[k][x.Build+"|"+x.Verdict]++
	}
	md.WriteString("## Summary\n\n| Cases | ")
	for _, b := range builds {
		md.WriteString(fmt.Sprintf("%s `%s` | ", b, seenB[b]))
	}
	md.WriteString("\n|---|" + strings.Repeat("---|", len(builds)) + "\n")
	for _, k := range kinds {
		md.WriteString("| " + k + " | ")
		for _, b := range builds {
			var parts []string
			for _, v := range []string{"pass", "mishandled", "dropped", "halt"} {
				if n := cnt[k][b+"|"+v]; n > 0 {
					parts = append(parts, fmt.Sprintf("%d %s", n, v))
				}
			}
			md.WriteString(strings.Join(parts, ", ") + " | ")
		}
		md.WriteString("\n")
	}
	md.WriteString("\n")
	md.WriteString("## Cases\n\n| Case | Group | Ledger | Tx | Expectation |\n|---|---|---|---|---|\n")
	for _, c := range cases {
		md.WriteString(fmt.Sprintf("| `%s` | %s | %d | `%s` | %s |\n", c.ID, c.Group, c.Ledger, c.Tx, c.Note))
	}
	md.WriteString("\n## Verdicts\n\n| Case | Build | Commit | Verdict | Evidence (stored rows) |\n|---|---|---|---|---|\n")
	for _, x := range rows {
		md.WriteString(fmt.Sprintf("| `%s` | %s | `%s` | **%s** | %s |\n", x.Case, x.Build, x.Commit, x.Verdict, strings.ReplaceAll(strings.Join(x.Evidence, "; "), "|", "\\|")))
	}
	md.WriteString("\nVerdicts: **pass** = expected rows stored with expected values; **mishandled** = a row is stored with a wrong value or an expected participant is missing; ")
	md.WriteString("**dropped** = ledger stored but the row for this shape is missing; **halt** = nothing for the ledger could be stored.\n")
	must(os.WriteFile(filepath.Join(root, "reports/replay-mainnet.md"), []byte(md.String()), 0o644))
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
