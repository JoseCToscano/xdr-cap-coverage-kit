// Package mockrpc serves Stellar RPC getLedgers (plus getHealth,
// getLatestLedger and getNetwork) from a Galexie data-lake directory, so an
// indexer that only speaks RPC reads corpus ledgers with no network.
package mockrpc

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/klauspost/compress/zstd"
)

type Server struct {
	Passphrase string
	ledgers    map[uint32][]byte // raw LedgerCloseMeta XDR
	seqs       []uint32
}

// Load reads every <dir>/**/*.xdr.zst object (one ledger per object).
func Load(dir, passphrase string) (*Server, error) {
	s := &Server{Passphrase: passphrase, ledgers: map[uint32][]byte{}}
	dec, _ := zstd.NewReader(nil)
	err := filepath.Walk(dir, func(p string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() || !strings.HasSuffix(p, ".xdr.zst") {
			return err
		}
		z, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		b, err := dec.DecodeAll(z, nil)
		if err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
		// LedgerCloseMetaBatch: start, end, count, LCM...
		if len(b) < 12 || binary.BigEndian.Uint32(b[8:12]) != 1 {
			return fmt.Errorf("%s: expected one LedgerCloseMeta per object", p)
		}
		seq := binary.BigEndian.Uint32(b[0:4])
		s.ledgers[seq] = b[12:]
		s.seqs = append(s.seqs, seq)
		return nil
	})
	sort.Slice(s.seqs, func(i, j int) bool { return s.seqs[i] < s.seqs[j] })
	return s, err
}

func (s *Server) Ledgers() []uint32 { return s.seqs }

type req struct {
	ID     json.RawMessage `json:"id"`
	Method string          `json:"method"`
	Params struct {
		StartLedger uint32 `json:"startLedger"`
		Pagination  *struct {
			Cursor string `json:"cursor"`
			Limit  int    `json:"limit"`
		} `json:"pagination"`
	} `json:"params"`
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var q req
	if err := json.Unmarshal(body, &q); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	lo, hi := s.seqs[0], s.seqs[len(s.seqs)-1]
	var result any
	switch q.Method {
	case "getHealth":
		result = map[string]any{"status": "healthy", "latestLedger": hi, "oldestLedger": lo, "ledgerRetentionWindow": hi - lo + 1}
	case "getNetwork":
		result = map[string]any{"passphrase": s.Passphrase, "protocolVersion": 30}
	case "getLatestLedger":
		result = map[string]any{"id": "", "sequence": hi, "protocolVersion": 30}
	case "getLedgers":
		start := q.Params.StartLedger
		limit := 1
		if q.Params.Pagination != nil {
			if q.Params.Pagination.Cursor != "" {
				c, _ := strconv.ParseUint(q.Params.Pagination.Cursor, 10, 32)
				start = uint32(c) + 1
			}
			if q.Params.Pagination.Limit > 0 {
				limit = q.Params.Pagination.Limit
			}
		}
		var out []map[string]any
		last := start
		for _, seq := range s.seqs {
			if seq < start || len(out) >= limit {
				continue
			}
			lcm := s.ledgers[seq]
			out = append(out, map[string]any{"hash": hex.EncodeToString(ledgerHash(lcm)), "sequence": seq, "ledgerCloseTime": "0",
				"headerXdr": "", "metadataXdr": base64.StdEncoding.EncodeToString(lcm)})
			last = seq
		}
		result = map[string]any{"ledgers": out, "latestLedger": hi, "latestLedgerCloseTime": 0, "oldestLedger": lo,
			"oldestLedgerCloseTime": 0, "cursor": strconv.FormatUint(uint64(last), 10)}
	default:
		writeJSON(w, map[string]any{"jsonrpc": "2.0", "id": q.ID, "error": map[string]any{"code": -32601, "message": "method not found"}})
		return
	}
	writeJSON(w, map[string]any{"jsonrpc": "2.0", "id": q.ID, "result": result})
}

// ledgerHash returns LedgerHeaderHistoryEntry.hash of a v1/v2 LedgerCloseMeta
// (union arm 4 bytes + ext 4 bytes, then the 32-byte hash).
func ledgerHash(lcm []byte) []byte {
	if len(lcm) >= 8+32 {
		return bytes.Clone(lcm[8 : 8+32])
	}
	return nil
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
