// Go reader for the live differential checker (tools/livecheck).
//
// Decodes LedgerCloseMeta with go-stellar-sdk/xdr and projects it to the
// checker's canonical token stream (see tools/livecheck/README.md): a
// type-driven walk in XDR declaration order that emits
//
//	U<n>  union discriminant      E<n>  enum value       I<n>  integer (exact, decimal)
//	B0/1  bool                    X<h>  opaque / string bytes (hex)
//	O0/1  optional absent/present N<n>  array length
//	K<s>  strkey, encoded by this SDK (G/M/C/B/L/T/X/P/W)
//	A<h>  asset code bytes, trailing NULs stripped
//
// with 128/256-bit parts folded to one exact integer. Tokens are grouped into
// segments: "L" (ledger-level), one per TransactionEnvelope in walk order and
// one per TransactionResultMeta(V1). Each segment is hashed; on request the
// raw tokens and the XDR bytes of a segment are returned.
//
// Protocol (stdin/stdout, one request per frame): u32 BE length + JSON request
// {"seq":n,"passphrase":"...","dump":["E3"],"slices":["P5"]}, u32 BE length +
// raw LedgerCloseMeta bytes. Reply: one JSON line.
package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"os"
	"reflect"
	"strconv"

	"github.com/stellar/go-stellar-sdk/network"
	"github.com/stellar/go-stellar-sdk/strkey"
	"github.com/stellar/go-stellar-sdk/xdr"
)

type request struct {
	Seq        uint32   `json:"seq"`
	Passphrase string   `json:"passphrase"`
	Dump       []string `json:"dump"`
	Slices     []string `json:"slices"`
	Single     string   `json:"single"` // decode the payload as one "TransactionEnvelope" / "TransactionResultMetaV1"
}

type reply struct {
	Seq       uint32              `json:"seq"`
	OK        bool                `json:"ok"`
	Err       string              `json:"err,omitempty"`
	RoundTrip bool                `json:"roundtrip"`
	L         string              `json:"L"`
	Env       []string            `json:"env"`
	EnvHash   []string            `json:"env_hash"`
	Proc      []string            `json:"proc"`
	ProcHash  []string            `json:"proc_hash"`
	Dump      map[string][]string `json:"dump,omitempty"`
	Slices    map[string]string   `json:"slices,omitempty"`
	Notes     []string            `json:"notes,omitempty"`
}

type seg struct {
	name string
	buf  bytes.Buffer
}

type walker struct {
	segs  []*seg
	stack []*seg
	nEnv  int
	nProc int
	envV  []reflect.Value
	procV []reflect.Value
	notes []string
}

func (w *walker) cur() *seg { return w.stack[len(w.stack)-1] }
func (w *walker) tok(s string) {
	b := &w.cur().buf
	b.WriteString(s)
	b.WriteByte('\n')
}
func (w *walker) push(name string) {
	s := &seg{name: name}
	w.segs = append(w.segs, s)
	w.stack = append(w.stack, s)
}
func (w *walker) pop() { w.stack = w.stack[:len(w.stack)-1] }

var (
	tMuxed      = reflect.TypeOf(xdr.MuxedAccount{})
	tAccountId  = reflect.TypeOf(xdr.AccountId{})
	tPublicKey  = reflect.TypeOf(xdr.PublicKey{})
	tNodeId     = reflect.TypeOf(xdr.NodeId{})
	tScAddress  = reflect.TypeOf(xdr.ScAddress{})
	tSignerKey  = reflect.TypeOf(xdr.SignerKey{})
	tCBId       = reflect.TypeOf(xdr.ClaimableBalanceId{})
	tPoolId     = reflect.TypeOf(xdr.PoolId{})
	tContractId = reflect.TypeOf(xdr.ContractId{})
	tAC4        = reflect.TypeOf(xdr.AssetCode4{})
	tAC12       = reflect.TypeOf(xdr.AssetCode12{})
	tAC         = reflect.TypeOf(xdr.AssetCode{})
	tI128       = reflect.TypeOf(xdr.Int128Parts{})
	tU128       = reflect.TypeOf(xdr.UInt128Parts{})
	tI256       = reflect.TypeOf(xdr.Int256Parts{})
	tU256       = reflect.TypeOf(xdr.UInt256Parts{})
	tEnv        = reflect.TypeOf(xdr.TransactionEnvelope{})
	tTRM        = reflect.TypeOf(xdr.TransactionResultMeta{})
	tTRMV1      = reflect.TypeOf(xdr.TransactionResultMetaV1{})
	tUnion      = reflect.TypeOf((*interface{ ArmForSwitch(int32) (string, bool) })(nil)).Elem()
	tEnum       = reflect.TypeOf((*interface{ ValidEnum(int32) bool })(nil)).Elem()
)

func stripNul(b []byte) string {
	n := len(b)
	for n > 0 && b[n-1] == 0 {
		n--
	}
	return hex.EncodeToString(b[:n])
}

func (w *walker) strk(s string, err error) {
	if err != nil {
		w.tok("K!" + err.Error())
		return
	}
	w.tok("K" + s)
}

func i128(hi int64, lo uint64) string {
	v := new(big.Int).Lsh(big.NewInt(hi), 64)
	return v.Or(v, new(big.Int).SetUint64(lo)).String()
}
func u128(hi, lo uint64) string {
	v := new(big.Int).Lsh(new(big.Int).SetUint64(hi), 64)
	return v.Or(v, new(big.Int).SetUint64(lo)).String()
}
func i256(hh int64, hl, lh, ll uint64) string {
	v := big.NewInt(hh)
	for _, p := range []uint64{hl, lh, ll} {
		v.Lsh(v, 64)
		v.Or(v, new(big.Int).SetUint64(p))
	}
	return v.String()
}

// special handles the collapsed types; returns true when v was consumed.
func (w *walker) special(v reflect.Value) bool {
	switch v.Type() {
	case tMuxed:
		m := v.Interface().(xdr.MuxedAccount)
		w.strk(m.GetAddress())
	case tAccountId:
		a := v.Interface().(xdr.AccountId)
		w.strk(a.GetAddress())
	case tPublicKey:
		a := xdr.AccountId(v.Interface().(xdr.PublicKey))
		w.strk(a.GetAddress())
	case tNodeId:
		a := xdr.AccountId(v.Interface().(xdr.NodeId))
		w.strk(a.GetAddress())
	case tScAddress:
		w.strk(v.Interface().(xdr.ScAddress).String())
	case tSignerKey:
		k := v.Interface().(xdr.SignerKey)
		w.strk(k.GetAddress())
	case tCBId:
		w.strk(v.Interface().(xdr.ClaimableBalanceId).EncodeToStrkey())
	case tPoolId:
		p := v.Interface().(xdr.PoolId)
		w.strk(strkey.Encode(strkey.VersionByteLiquidityPool, p[:]))
	case tContractId:
		c := v.Interface().(xdr.ContractId)
		w.strk(strkey.Encode(strkey.VersionByteContract, c[:]))
	case tAC4:
		c := v.Interface().(xdr.AssetCode4)
		w.tok("A" + stripNul(c[:]))
	case tAC12:
		c := v.Interface().(xdr.AssetCode12)
		w.tok("A" + stripNul(c[:]))
	case tAC:
		c := v.Interface().(xdr.AssetCode)
		if c.AssetCode4 != nil {
			w.tok("A" + stripNul(c.AssetCode4[:]))
		} else if c.AssetCode12 != nil {
			w.tok("A" + stripNul(c.AssetCode12[:]))
		}
	case tI128:
		p := v.Interface().(xdr.Int128Parts)
		w.tok("I" + i128(int64(p.Hi), uint64(p.Lo)))
	case tU128:
		p := v.Interface().(xdr.UInt128Parts)
		w.tok("I" + u128(uint64(p.Hi), uint64(p.Lo)))
	case tI256:
		p := v.Interface().(xdr.Int256Parts)
		w.tok("I" + i256(int64(p.HiHi), uint64(p.HiLo), uint64(p.LoHi), uint64(p.LoLo)))
	case tU256:
		p := v.Interface().(xdr.UInt256Parts)
		r := new(big.Int).SetUint64(uint64(p.HiHi))
		for _, x := range []uint64{uint64(p.HiLo), uint64(p.LoHi), uint64(p.LoLo)} {
			r.Lsh(r, 64)
			r.Or(r, new(big.Int).SetUint64(x))
		}
		w.tok("I" + r.String())
	default:
		return false
	}
	return true
}

func (w *walker) walk(v reflect.Value) {
	t := v.Type()
	switch t {
	case tEnv:
		w.push(fmt.Sprintf("E%d", w.nEnv))
		w.nEnv++
		w.envV = append(w.envV, v)
		defer w.pop()
	case tTRM, tTRMV1:
		w.push(fmt.Sprintf("P%d", w.nProc))
		w.nProc++
		w.procV = append(w.procV, v)
		defer w.pop()
	}
	if w.special(v) {
		return
	}
	switch t.Kind() {
	case reflect.Struct:
		if t.Implements(tUnion) {
			u := v.Interface().(interface {
				ArmForSwitch(int32) (string, bool)
				SwitchFieldName() string
			})
			sw := v.FieldByName(u.SwitchFieldName())
			d := int32(sw.Int())
			w.tok("U" + strconv.FormatInt(int64(d), 10))
			arm, ok := u.ArmForSwitch(d)
			if !ok {
				w.tok("U!badarm")
				return
			}
			if arm == "" {
				return
			}
			f := v.FieldByName(arm)
			if f.Kind() == reflect.Ptr {
				if f.IsNil() {
					w.tok("U!nilarm")
					return
				}
				f = f.Elem()
			}
			w.walk(f)
			return
		}
		for i := 0; i < t.NumField(); i++ {
			if !t.Field(i).IsExported() {
				continue
			}
			f := v.Field(i)
			if f.Kind() == reflect.Ptr {
				if f.IsNil() {
					w.tok("O0")
					continue
				}
				w.tok("O1")
				w.walk(f.Elem())
				continue
			}
			w.walk(f)
		}
	case reflect.Ptr:
		if v.IsNil() {
			w.tok("O0")
			return
		}
		w.tok("O1")
		w.walk(v.Elem())
	case reflect.Slice:
		if t.Elem().Kind() == reflect.Uint8 {
			w.tok("X" + hex.EncodeToString(v.Bytes()))
			return
		}
		w.tok("N" + strconv.Itoa(v.Len()))
		for i := 0; i < v.Len(); i++ {
			w.walk(v.Index(i))
		}
	case reflect.Array:
		if t.Elem().Kind() == reflect.Uint8 {
			b := make([]byte, v.Len())
			reflect.Copy(reflect.ValueOf(b), v)
			w.tok("X" + hex.EncodeToString(b))
			return
		}
		w.tok("N" + strconv.Itoa(v.Len()))
		for i := 0; i < v.Len(); i++ {
			w.walk(v.Index(i))
		}
	case reflect.String:
		w.tok("X" + hex.EncodeToString([]byte(v.String())))
	case reflect.Bool:
		if v.Bool() {
			w.tok("B1")
		} else {
			w.tok("B0")
		}
	case reflect.Int32:
		if t.Implements(tEnum) {
			w.tok("E" + strconv.FormatInt(v.Int(), 10))
		} else {
			w.tok("I" + strconv.FormatInt(v.Int(), 10))
		}
	case reflect.Int64, reflect.Int:
		w.tok("I" + strconv.FormatInt(v.Int(), 10))
	case reflect.Uint32, reflect.Uint64, reflect.Uint:
		w.tok("I" + strconv.FormatUint(v.Uint(), 10))
	default:
		w.tok("?" + t.String())
	}
}

func segHash(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:12]) }

func handle(req request, payload []byte) (r reply) {
	r.Seq = req.Seq
	defer func() {
		if p := recover(); p != nil {
			r.OK = false
			r.Err = fmt.Sprintf("panic: %v", p)
		}
	}()
	var root reflect.Value
	var reenc []byte
	var err error
	switch req.Single {
	case "TransactionEnvelope":
		var e xdr.TransactionEnvelope
		if err = e.UnmarshalBinary(payload); err == nil {
			reenc, err = e.MarshalBinary()
			root = reflect.ValueOf(e)
		}
	case "TransactionResultMetaV1":
		var e xdr.TransactionResultMetaV1
		if err = e.UnmarshalBinary(payload); err == nil {
			reenc, err = e.MarshalBinary()
			root = reflect.ValueOf(e)
		}
	default:
		var lcm xdr.LedgerCloseMeta
		if err = lcm.UnmarshalBinary(payload); err == nil {
			reenc, err = lcm.MarshalBinary()
			root = reflect.ValueOf(lcm)
		}
	}
	if err != nil {
		r.Err = err.Error()
		return
	}
	r.RoundTrip = bytes.Equal(reenc, payload)
	w := &walker{}
	w.push("L")
	w.walk(root)
	for _, s := range w.segs {
		h := segHash(s.buf.Bytes())
		switch s.name[0] {
		case 'L':
			r.L = h
		case 'E':
			r.Env = append(r.Env, h)
		case 'P':
			r.Proc = append(r.Proc, h)
		}
	}
	for _, ev := range w.envV {
		e := ev.Interface().(xdr.TransactionEnvelope)
		h, herr := network.HashTransactionInEnvelope(e, req.Passphrase)
		if herr != nil {
			r.EnvHash = append(r.EnvHash, "!"+herr.Error())
		} else {
			r.EnvHash = append(r.EnvHash, hex.EncodeToString(h[:]))
		}
	}
	for _, pv := range w.procV {
		switch m := pv.Interface().(type) {
		case xdr.TransactionResultMetaV1:
			r.ProcHash = append(r.ProcHash, hex.EncodeToString(m.Result.TransactionHash[:]))
		case xdr.TransactionResultMeta:
			r.ProcHash = append(r.ProcHash, hex.EncodeToString(m.Result.TransactionHash[:]))
		}
	}
	if len(req.Dump) > 0 {
		r.Dump = map[string][]string{}
		for _, name := range req.Dump {
			for _, s := range w.segs {
				if s.name == name {
					toks := bytes.Split(bytes.TrimSuffix(s.buf.Bytes(), []byte("\n")), []byte("\n"))
					out := make([]string, len(toks))
					for i, t := range toks {
						out[i] = string(t)
					}
					r.Dump[name] = out
				}
			}
		}
	}
	if len(req.Slices) > 0 {
		r.Slices = map[string]string{}
		for _, name := range req.Slices {
			var i int
			fmt.Sscanf(name[1:], "%d", &i)
			var m interface{ MarshalBinary() ([]byte, error) }
			if name[0] == 'E' && i < len(w.envV) {
				e := w.envV[i].Interface().(xdr.TransactionEnvelope)
				m = e
			} else if name[0] == 'P' && i < len(w.procV) {
				switch p := w.procV[i].Interface().(type) {
				case xdr.TransactionResultMetaV1:
					m = p
				case xdr.TransactionResultMeta:
					m = p
				}
			}
			if m != nil {
				if b, err := m.MarshalBinary(); err == nil {
					r.Slices[name] = base64.StdEncoding.EncodeToString(b)
				}
			}
		}
	}
	r.OK = true
	return
}

func readFrame(rd *bufio.Reader) ([]byte, error) {
	var n uint32
	if err := binary.Read(rd, binary.BigEndian, &n); err != nil {
		return nil, err
	}
	b := make([]byte, n)
	_, err := io.ReadFull(rd, b)
	return b, err
}

func main() {
	rd := bufio.NewReaderSize(os.Stdin, 1<<20)
	out := bufio.NewWriterSize(os.Stdout, 1<<20)
	enc := json.NewEncoder(out)
	for {
		hdr, err := readFrame(rd)
		if err != nil {
			if err == io.EOF {
				return
			}
			fmt.Fprintln(os.Stderr, "read:", err)
			os.Exit(1)
		}
		payload, err := readFrame(rd)
		if err != nil {
			fmt.Fprintln(os.Stderr, "read payload:", err)
			os.Exit(1)
		}
		var req request
		if err := json.Unmarshal(hdr, &req); err != nil {
			fmt.Fprintln(os.Stderr, "bad request:", err)
			os.Exit(1)
		}
		enc.Encode(handle(req, payload))
		out.Flush()
	}
}
