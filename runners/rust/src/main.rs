//! Rust conformance runner on rs-stellar-xdr 30 (the crate, not the CLI).
//!
//! For each corpus entry: sha256, decode, byte-exact re-encode, SEP-51 JSON
//! (serde) equal to expected.json, tx hash under the entry's passphrase,
//! every check pointer; for LedgerCloseMeta entries the Galexie object is
//! decompressed (ruzstd), the batch decoded, the LCM re-encoded byte-exact and
//! every expected.ledger_checks pointer evaluated on its SEP-51 JSON.
//! Writes reports/raw/rust.json. Exit 1 on any failure.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use stellar_xdr::{
    LedgerCloseMetaBatch, LedgerHeader, Limits, ReadXdr, ScVal, TransactionEnvelope, WriteXdr,
};

struct Runner {
    rows: Vec<Value>,
    fails: usize,
}

impl Runner {
    fn row(&mut self, id: &str, step: &str, ok: bool, detail: &str) {
        if !ok {
            self.fails += 1;
        }
        println!("{} {} [rust] {}{}", if ok { "ok  " } else { "FAIL" }, id, step,
            if ok || detail.is_empty() { String::new() } else { format!(" - {detail}") });
        let mut r = json!({ "entry": id, "step": step, "ok": ok });
        if !ok && !detail.is_empty() {
            r["detail"] = json!(detail);
        }
        self.rows.push(r);
    }
    fn checks(&mut self, id: &str, prefix: &str, checks: &Value, doc: &Value) {
        for c in checks.as_array().into_iter().flatten() {
            let cid = c["id"].as_str().unwrap_or("?");
            let got = doc.pointer(c["path"].as_str().unwrap_or("")).cloned();
            let ok = match c["op"].as_str().unwrap_or("") {
                "equals" | "strkey" => got.as_ref() == Some(&c["value"]),
                "length" | "not-dropped" => got.as_ref().and_then(|v| v.as_array()).map(|a| json!(a.len()) == c["value"]).unwrap_or(false),
                "preserved" => got.is_some(),
                _ => false,
            };
            self.row(id, &format!("{prefix}{cid}"), ok, &format!("got {}", got.unwrap_or(Value::Null)));
        }
    }
}

fn sha(b: &[u8]) -> String {
    hex::encode(Sha256::digest(b))
}

fn roundtrip<T: ReadXdr + WriteXdr + serde::Serialize>(b: &[u8]) -> Result<(Vec<u8>, Value, T), String> {
    let v = T::from_xdr(b, Limits::none()).map_err(|e| e.to_string())?;
    let out = v.to_xdr(Limits::none()).map_err(|e| e.to_string())?;
    let j = serde_json::to_value(&v).map_err(|e| e.to_string())?;
    Ok((out, j, v))
}

fn main() {
    let root = PathBuf::from(std::env::args().nth(1).unwrap_or_else(|| "../..".into()));
    let mut files: Vec<PathBuf> = std::fs::read_dir(root.join("corpus/entries")).unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    files.sort();
    let mut r = Runner { rows: vec![], fails: 0 };
    for f in files {
        let e: Value = serde_json::from_slice(&std::fs::read(&f).unwrap()).unwrap();
        let id = e["id"].as_str().unwrap().to_string();
        let b = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, e["xdr"]["base64"].as_str().unwrap()).unwrap();
        r.row(&id, "sha256", sha(&b) == e["xdr"]["sha256"], "");
        let ty = e["xdr"]["type"].as_str().unwrap();
        let res: Result<(Vec<u8>, Value, Option<TransactionEnvelope>), String> = match ty {
            "TransactionEnvelope" => roundtrip::<TransactionEnvelope>(&b).map(|(o, j, v)| (o, j, Some(v))),
            "ScVal" => roundtrip::<ScVal>(&b).map(|(o, j, _)| (o, j, None)),
            "LedgerHeader" => roundtrip::<LedgerHeader>(&b).map(|(o, j, _)| (o, j, None)),
            other => Err(format!("type not wired: {other}")),
        };
        let (out, j, env) = match res {
            Ok(x) => x,
            Err(err) => { r.row(&id, "decode", false, &err); continue; }
        };
        r.row(&id, "re-encode byte-exact", out == b, "");
        r.row(&id, "decode == expected.json", j == e["expected"]["json"], "");
        if let (Some(env), Some(h)) = (env, e["network"]["expected_tx_hash"].as_str()) {
            let nid: [u8; 32] = Sha256::digest(e["network"]["passphrase"].as_str().unwrap().as_bytes()).into();
            let got = env.hash(nid).map(hex::encode).unwrap_or_default();
            r.row(&id, "tx hash", got == h, &got);
        }
        r.checks(&id, "check ", &e["expected"]["checks"], &j);

        let Some(l) = e.get("ledger") else { continue };
        let zst = std::fs::read(root.join(l["file"].as_str().unwrap())).unwrap();
        r.row(&id, "lcm object sha256", sha(&zst) == l["sha256_zst"], "");
        let mut batch_bytes = vec![];
        if let Err(err) = ruzstd::decoding::StreamingDecoder::new(zst.as_slice()).map_err(|e| e.to_string())
            .and_then(|mut d| d.read_to_end(&mut batch_bytes).map_err(|e| e.to_string())) {
            r.row(&id, "lcm zstd", false, &err);
            continue;
        }
        let batch = match LedgerCloseMetaBatch::from_xdr(&batch_bytes, Limits::none()) {
            Ok(x) => x,
            Err(err) => { r.row(&id, "lcm batch decode", false, &err.to_string()); continue; }
        };
        r.row(&id, "lcm batch re-encode byte-exact", batch.to_xdr(Limits::none()).map(|x| x == batch_bytes).unwrap_or(false), "");
        let lcm = &batch.ledger_close_metas[0];
        let lb = lcm.to_xdr(Limits::none()).unwrap();
        r.row(&id, "lcm sha256", sha(&lb) == l["sha256_lcm"], "");
        let lj = serde_json::to_value(lcm).unwrap();
        r.checks(&id, "ledger_check ", &e["expected"]["ledger_checks"], &lj);
    }
    let out = root.join("reports/raw/rust.json");
    std::fs::create_dir_all(out.parent().unwrap_or(Path::new("."))).unwrap();
    std::fs::write(&out, serde_json::to_string_pretty(&r.rows).unwrap() + "\n").unwrap();
    if r.fails > 0 {
        println!("\n{} failure(s)", r.fails);
        std::process::exit(1);
    }
    println!("\nall entries pass");
}
