// txhash reads one LedgerCloseMeta (raw XDR) on stdin and prints, as a JSON
// array, the hash of every transaction envelope in tx-set order (phases,
// then components / execution stages / clusters, in XDR order). This is the
// same order in which `stellar xdr decode` lists envelopes, so the frequency
// walker can attribute envelope-level hits to a transaction hash.
// Usage: txhash <network passphrase> < ledger.lcm
package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/stellar/go-stellar-sdk/network"
	"github.com/stellar/go-stellar-sdk/xdr"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: txhash <network passphrase> < ledger.lcm")
		os.Exit(2)
	}
	b, err := io.ReadAll(os.Stdin)
	if err != nil {
		panic(err)
	}
	var lcm xdr.LedgerCloseMeta
	if err := lcm.UnmarshalBinary(b); err != nil {
		fmt.Fprintln(os.Stderr, "decode:", err)
		os.Exit(1)
	}
	envs := lcm.TransactionEnvelopes()
	out := make([]string, 0, len(envs))
	for _, e := range envs {
		h, err := network.HashTransactionInEnvelope(e, os.Args[1])
		if err != nil {
			fmt.Fprintln(os.Stderr, "hash:", err)
			os.Exit(1)
		}
		out = append(out, hex.EncodeToString(h[:]))
	}
	json.NewEncoder(os.Stdout).Encode(out)
}
