// Package walletbackend adapts stellar/wallet-backend to the harness.
//
// For each Build it makes a git worktree of a local wallet-backend clone at
// the pinned commit, optionally applies a documented dependency shim, copies
// in zz_xck_ingest_test.go (wallet-backend's own processLedger + insertIntoDB
// against a real PostgreSQL/TimescaleDB database), runs it, then decides
// verdicts with SQL against the rows wallet-backend stored.
package walletbackend

import (
	"bufio"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/stellar/go-stellar-sdk/strkey"

	h "github.com/JoseCToscano/xdr-cap-coverage-kit/harness"
)

//go:embed zz_xck_ingest_test.go.txt
var ingestTest []byte

// SDKShim bumps go-stellar-sdk so commits pinned to v0.7.3 (no Protocol 30
// XDR) can decode P30 ledgers. No wallet-backend source file is changed.
const SDKShim = "go get github.com/stellar/go-stellar-sdk@v0.8.0"

type Adapter struct {
	Repo     string // local wallet-backend clone (read-only use: worktrees only)
	WorkDir  string // scratch dir for worktrees and outputs
	AdminDSN string // DSN to a maintenance DB; a fresh DB is created per build
	Log      func(string, ...any)

	build h.Build
	wt    string
	dsn   string
	conn  *pgx.Conn
}

func (a *Adapter) Name() string { return "stellar/wallet-backend" }

func run(dir string, env []string, name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir, cmd.Env = dir, append(os.Environ(), env...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%s %s: %w\n%s", name, strings.Join(args, " "), err, out)
	}
	return string(out), nil
}

func dbName(b h.Build) string {
	n := "xck_wb_" + strings.NewReplacer("^", "p", "~", "t", "-", "_").Replace(b.Label+"_"+b.Commit)
	if b.Shim != "" {
		n += "_shim"
	}
	return n
}

func (a *Adapter) Prepare(ctx context.Context, b h.Build) error {
	a.build = b
	a.wt = filepath.Join(a.WorkDir, "wt-"+dbName(b))
	_, _ = run(a.Repo, nil, "git", "worktree", "remove", "--force", a.wt)
	if _, err := run(a.Repo, nil, "git", "worktree", "add", "--detach", a.wt, b.Commit); err != nil {
		return err
	}
	if b.Shim != "" {
		if _, err := run(a.wt, []string{"GOFLAGS=-mod=mod"}, "sh", "-c", b.Shim); err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(a.wt, "internal/services/zz_xck_ingest_test.go"), ingestTest, 0o644); err != nil {
		return err
	}
	admin, err := pgx.Connect(ctx, a.AdminDSN)
	if err != nil {
		return err
	}
	defer admin.Close(ctx)
	name := dbName(b)
	if _, err := admin.Exec(ctx, "DROP DATABASE IF EXISTS "+name); err != nil {
		return err
	}
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		return err
	}
	cfg, err := pgx.ParseConfig(a.AdminDSN)
	if err != nil {
		return err
	}
	a.dsn = fmt.Sprintf("postgres://%s@%s:%d/%s?sslmode=disable", cfg.User, cfg.Host, cfg.Port, name)
	if cfg.Password != "" {
		a.dsn = fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable", cfg.User, cfg.Password, cfg.Host, cfg.Port, name)
	}
	return nil
}

func (a *Adapter) IngestLedgers(ctx context.Context, src h.Source, ledgers []uint32) ([]h.IngestOutcome, error) {
	out := filepath.Join(a.WorkDir, dbName(a.build)+".jsonl")
	var ls []string
	for _, l := range ledgers {
		ls = append(ls, strconv.FormatUint(uint64(l), 10))
	}
	env := []string{"XCK_DSN=" + a.dsn, "XCK_SOURCE=" + src.Kind + ":" + src.URI, "XCK_LEDGERS=" + strings.Join(ls, ","), "XCK_OUT=" + out}
	if a.build.Shim != "" {
		env = append(env, "GOFLAGS=-mod=mod")
	}
	if src.Passphrase != "" {
		env = append(env, "XCK_PASSPHRASE="+src.Passphrase)
	}
	if log, err := run(a.wt, env, "go", "test", "-count=1", "-run", "^TestXCKIngest$", "./internal/services/"); err != nil {
		return nil, fmt.Errorf("driver failed (this is a harness/build failure, not a verdict): %w\n%s", err, log)
	}
	f, err := os.Open(out)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var res []h.IngestOutcome
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<24)
	for sc.Scan() {
		var o h.IngestOutcome
		if err := json.Unmarshal(sc.Bytes(), &o); err != nil {
			return nil, err
		}
		res = append(res, o)
	}
	a.conn, err = pgx.Connect(ctx, a.dsn)
	return res, err
}

// addr decodes wallet-backend's AddressBytea (strkey version byte + payload).
func addr(b []byte) string {
	if len(b) < 2 {
		return fmt.Sprintf("<invalid %x>", b)
	}
	s, err := strkey.Encode(strkey.VersionByte(b[0]), b[1:])
	if err != nil {
		return fmt.Sprintf("<undecodable %x: %v>", b, err)
	}
	if want := map[byte]int{'G': 32, 'C': 32, 'M': 40}[s[0]]; want != 0 && len(b)-1 != want {
		return fmt.Sprintf("%s (%d-byte payload, expected %d)", s, len(b)-1, want)
	}
	if s[0] == 'P' && len(b)-1 < 32+4+4 {
		return fmt.Sprintf("%s (%d-byte payload, too short for a signed payload)", s, len(b)-1)
	}
	return s
}

// toID is wallet-backend's TOID for a transaction: ledger<<32 | (applyIndex+1)<<12.
func toID(ledger uint32, txIndex int) int64 {
	return int64(ledger)<<32 | int64(txIndex+1)<<12
}

func (a *Adapter) Verdict(ctx context.Context, c h.Case, in h.IngestOutcome) (h.Result, error) {
	r := h.Result{Case: c, Build: a.build.Label + " " + a.build.Commit, Ingest: in}
	var nTx int
	if err := a.conn.QueryRow(ctx, "SELECT count(*) FROM transactions WHERE ledger_number=$1", c.Ledger).Scan(&nTx); err != nil {
		return r, err
	}
	r.Evidence = append(r.Evidence, fmt.Sprintf("transactions stored for ledger %d: %d", c.Ledger, nTx))
	if nTx == 0 {
		r.Verdict = h.Halt
		r.Evidence = append(r.Evidence, fmt.Sprintf("ingest stopped at stage %q: %s", in.Stage, firstLine(in.Error)))
		return r, nil
	}
	tid := toID(c.Ledger, c.TxIndex)
	switch c.Expect["kind"] {
	case "signer": // SIGNER/ADD row for account with the full signer key
		rows, err := a.conn.Query(ctx, "SELECT encode(account_id,'hex'), signer_account_id FROM state_changes WHERE to_id=$1 AND state_change_category='SIGNER' AND state_change_reason='ADD'", tid)
		if err != nil {
			return r, err
		}
		var got []string
		for rows.Next() {
			var acct string
			var signer []byte
			if err := rows.Scan(&acct, &signer); err != nil {
				return r, err
			}
			got = append(got, addr(signer))
		}
		rows.Close()
		r.Evidence = append(r.Evidence, fmt.Sprintf("state_changes SIGNER/ADD signer_account_id: %v", got))
		switch {
		case len(got) == 0:
			r.Verdict = h.Dropped
		case contains(got, c.Expect["signer"]):
			r.Verdict = h.Pass
		default:
			r.Verdict = h.Mishandled
		}
	case "participants": // base G accounts of muxed source/destination are tx participants
		rows, err := a.conn.Query(ctx, "SELECT account_id FROM transactions_accounts WHERE tx_to_id=$1 ORDER BY 1", tid)
		if err != nil {
			return r, err
		}
		var got []string
		for rows.Next() {
			var b []byte
			if err := rows.Scan(&b); err != nil {
				return r, err
			}
			got = append(got, addr(b))
		}
		rows.Close()
		r.Evidence = append(r.Evidence, fmt.Sprintf("transactions_accounts.account_id: %v", got))
		want := strings.Split(c.Expect["accounts"], ",")
		missing := 0
		for _, w := range want {
			if !contains(got, w) {
				missing++
			}
		}
		bad := 0
		for _, g := range got {
			if strings.HasPrefix(g, "<") || !strings.HasPrefix(g, "G") {
				bad++
			}
		}
		switch {
		case len(got) == 0:
			r.Verdict = h.Dropped
		case missing == 0 && bad == 0:
			r.Verdict = h.Pass
		default:
			r.Verdict = h.Mishandled
		}
	case "trustline": // TRUSTLINE/ADD row for account
		var n int
		if err := a.conn.QueryRow(ctx, "SELECT count(*) FROM state_changes WHERE to_id=$1 AND state_change_category='TRUSTLINE' AND state_change_reason='ADD'", tid).Scan(&n); err != nil {
			return r, err
		}
		rows, err := a.conn.Query(ctx, "SELECT state_change_category||'/'||state_change_reason, account_id FROM state_changes WHERE to_id=$1 ORDER BY state_change_id", tid)
		if err != nil {
			return r, err
		}
		var all []string
		for rows.Next() {
			var k string
			var b []byte
			if err := rows.Scan(&k, &b); err != nil {
				return r, err
			}
			all = append(all, k+" "+addr(b))
		}
		rows.Close()
		r.Evidence = append(r.Evidence, fmt.Sprintf("state_changes for tx: %v", all))
		ok := false
		for _, s := range all {
			if s == "TRUSTLINE/ADD "+c.Expect["account"] {
				ok = true
			}
		}
		switch {
		case ok:
			r.Verdict = h.Pass
		case n > 0:
			r.Verdict = h.Mishandled
		default:
			r.Verdict = h.Dropped
		}
	case "tx": // generic: tx row stored with its hash, required participants present, no malformed address in any row for it
		var hash []byte
		var code string
		err := a.conn.QueryRow(ctx, "SELECT hash, result_code FROM transactions WHERE to_id=$1", tid).Scan(&hash, &code)
		if err == pgx.ErrNoRows {
			r.Verdict = h.Dropped
			r.Evidence = append(r.Evidence, fmt.Sprintf("no transactions row with to_id %d", tid))
			break
		} else if err != nil {
			return r, err
		}
		r.Evidence = append(r.Evidence, fmt.Sprintf("transactions row: hash %x, result_code %s", hash, code))
		got, err := a.addrs(ctx, "SELECT account_id FROM transactions_accounts WHERE tx_to_id=$1 ORDER BY 1", tid)
		if err != nil {
			return r, err
		}
		r.Evidence = append(r.Evidence, fmt.Sprintf("transactions_accounts.account_id: %v", got))
		bad := malformed(got)
		for _, q := range []string{
			"SELECT account_id FROM operations_accounts WHERE operation_id >= $1 AND operation_id < $1 + 4096",
			"SELECT account_id FROM state_changes WHERE to_id=$1",
			"SELECT signer_account_id FROM state_changes WHERE to_id=$1 AND signer_account_id IS NOT NULL",
		} {
			xs, err := a.addrs(ctx, q, tid)
			if err != nil {
				return r, err
			}
			bad = append(bad, malformed(xs)...)
		}
		var nSC int
		if err := a.conn.QueryRow(ctx, "SELECT count(*) FROM state_changes WHERE to_id=$1", tid).Scan(&nSC); err != nil {
			return r, err
		}
		r.Evidence = append(r.Evidence, fmt.Sprintf("state_changes rows for tx: %d", nSC))
		missing := []string{}
		for _, w := range strings.Split(c.Expect["accounts"], ",") {
			if w != "" && !contains(got, w) {
				missing = append(missing, w)
			}
		}
		if len(missing) > 0 {
			r.Evidence = append(r.Evidence, fmt.Sprintf("expected participants missing: %v", missing))
		}
		if len(bad) > 0 {
			r.Evidence = append(r.Evidence, fmt.Sprintf("malformed stored addresses: %v", bad))
		}
		switch {
		case fmt.Sprintf("%x", hash) != c.Expect["hash"] || len(bad) > 0 || len(missing) > 0:
			r.Verdict = h.Mishandled
		default:
			r.Verdict = h.Pass
		}
	default:
		return r, fmt.Errorf("unknown case kind %q", c.Expect["kind"])
	}
	if in.Error != "" {
		r.Evidence = append(r.Evidence, "ingest error: "+firstLine(in.Error))
	}
	return r, nil
}

// addrs runs a query returning one AddressBytea column and decodes every row.
func (a *Adapter) addrs(ctx context.Context, q string, args ...any) ([]string, error) {
	rows, err := a.conn.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var b []byte
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		out = append(out, addr(b))
	}
	return out, rows.Err()
}

// malformed returns the decoded addresses that addr() flagged (bad length,
// undecodable) or that are not an account / contract strkey.
func malformed(xs []string) []string {
	var bad []string
	for _, x := range xs {
		if strings.HasPrefix(x, "<") || strings.Contains(x, "payload") || !(strings.HasPrefix(x, "G") || strings.HasPrefix(x, "C")) {
			bad = append(bad, x)
		}
	}
	return bad
}

func (a *Adapter) Close() error {
	if a.conn != nil {
		a.conn.Close(context.Background())
		a.conn = nil
	}
	if a.wt != "" {
		_, _ = run(a.Repo, nil, "git", "worktree", "remove", "--force", a.wt)
	}
	return nil
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	if len(s) > 300 {
		s = s[:300] + "..."
	}
	return s
}
