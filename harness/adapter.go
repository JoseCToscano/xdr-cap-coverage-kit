// Package harness replays corpus LedgerCloseMeta through an indexer and
// decides, from what the indexer stored, whether each corpus shape was
// handled. It never decides from a process exit code alone.
package harness

import "context"

// Verdict is the outcome for one corpus entry on one indexer build.
type Verdict string

const (
	// Pass: the indexer stored the expected row(s) with the expected values.
	Pass Verdict = "pass"
	// Mishandled: the indexer stored a row for the shape, but a value in it is wrong.
	Mishandled Verdict = "mishandled"
	// Dropped: the ledger was ingested (its transactions are stored) but the
	// row this shape should have produced is missing.
	Dropped Verdict = "dropped"
	// Halt: the indexer could not persist the ledger at all, so nothing for it
	// is stored and a live ingester would retry the same ledger forever.
	Halt Verdict = "halt"
)

// Case is one corpus entry replayed against one expectation.
type Case struct {
	EntryID string // corpus/entries/<id>.json
	Issue   string // upstream issue the case reproduces, e.g. "wallet-backend#729"
	Ledger  uint32 // ledger holding the entry's transaction
	TxIndex int    // index in tx_processing (apply order)
	// Expect is adapter-specific: what a correct indexer stores for this entry.
	Expect map[string]string
}

// IngestOutcome is what the ingest step itself reported for one ledger.
type IngestOutcome struct {
	Ledger uint32 `json:"ledger"`
	Stage  string `json:"stage"` // fetch | process | persist | commit
	Error  string `json:"error,omitempty"`
}

// Result is the verdict plus the evidence read back from the indexer's store.
type Result struct {
	Case     Case
	Build    string // e.g. "2c873353 (fix)"
	Verdict  Verdict
	Evidence []string // stored rows / values the verdict was decided from
	Ingest   IngestOutcome
}

// Adapter is implemented once per indexer. The harness drives it:
//
//	Prepare(build) -> IngestLedgers(ledgers) -> Verdict(case) for each case -> Close
//
// Ledgers come from a Source (Galexie data-lake directory first; mock RPC
// getLedgers second). Verdict must read the indexer's own stored state.
type Adapter interface {
	Name() string
	Prepare(ctx context.Context, build Build) error
	IngestLedgers(ctx context.Context, src Source, ledgers []uint32) ([]IngestOutcome, error)
	Verdict(ctx context.Context, c Case, ingest IngestOutcome) (Result, error)
	Close() error
}

// Build pins one indexer version.
type Build struct {
	Label  string // "pre-fix", "fix", "head"
	Commit string // git revision
	// Shim describes any change made to the checkout besides adding the
	// harness test file (for example a dependency bump needed to decode
	// Protocol 30 XDR). Empty means the checkout is unmodified.
	Shim string
}

// Source tells an adapter where to read ledgers.
type Source struct {
	Kind string // "galexie" or "rpc"
	URI  string // directory for galexie, base URL for rpc
	// Passphrase of the network the ledgers belong to; empty means testnet.
	Passphrase string
}
