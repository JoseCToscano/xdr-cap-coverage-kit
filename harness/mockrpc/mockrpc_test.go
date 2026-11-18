package mockrpc

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

// The mock must serve exactly the LedgerCloseMeta bytes recorded in
// corpus/datalake/SOURCES.json for every ledger in each network's data lake.
func TestServesDataLakeBytes(t *testing.T) {
	for _, n := range []struct{ lake, passphrase string }{
		{"testnet", "Test SDF Network ; September 2015"},
		{"pubnet", "Public Global Stellar Network ; September 2015"},
	} {
		t.Run(n.lake, func(t *testing.T) { servesLake(t, n.lake, n.passphrase) })
	}
}

func servesLake(t *testing.T, lake, passphrase string) {
	s, err := Load("../../corpus/datalake/"+lake, passphrase)
	if err != nil {
		t.Fatal(err)
	}
	var all map[string]struct {
		Ledger    uint32 `json:"ledger"`
		SHA256LCM string `json:"sha256_lcm"`
		Network   string `json:"network"`
	}
	b, err := os.ReadFile("../../corpus/datalake/SOURCES.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &all); err != nil {
		t.Fatal(err)
	}
	sources := map[string]struct {
		Ledger    uint32 `json:"ledger"`
		SHA256LCM string `json:"sha256_lcm"`
		Network   string `json:"network"`
	}{}
	for k, v := range all {
		net := v.Network
		if net == "" {
			net = "testnet"
		}
		if net == lake {
			sources[k] = v
		}
	}
	if len(s.Ledgers()) != len(sources) || len(sources) == 0 {
		t.Fatalf("%s data lake has %d ledgers, SOURCES.json %d", lake, len(s.Ledgers()), len(sources))
	}
	srv := httptest.NewServer(s)
	defer srv.Close()
	for _, src := range sources {
		body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "getLedgers",
			"params": map[string]any{"startLedger": src.Ledger, "pagination": map[string]any{"limit": 1}}})
		resp, err := http.Post(srv.URL, "application/json", bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		var out struct {
			Result struct {
				Ledgers []struct {
					Sequence    uint32 `json:"sequence"`
					MetadataXdr string `json:"metadataXdr"`
				} `json:"ledgers"`
			} `json:"result"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&out)
		resp.Body.Close()
		if len(out.Result.Ledgers) != 1 || out.Result.Ledgers[0].Sequence != src.Ledger {
			t.Fatalf("ledger %d: got %+v", src.Ledger, out.Result.Ledgers)
		}
		raw, _ := base64.StdEncoding.DecodeString(out.Result.Ledgers[0].MetadataXdr)
		sum := sha256.Sum256(raw)
		if hex.EncodeToString(sum[:]) != src.SHA256LCM {
			t.Errorf("ledger %d: sha256 %x, SOURCES.json %s", src.Ledger, sum, src.SHA256LCM)
		}
	}
}
