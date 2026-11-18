//! Rust reader for the live differential checker (tools/livecheck).
//!
//! Frames on stdin: u32 BE length + JSON request {"seq":n,"single":"..."?},
//! u32 BE length + raw XDR. For each frame: decode with rs-stellar-xdr 30
//! (the crate behind the stellar CLI), re-encode and compare bytes
//! ("roundtrip"), serialize to SEP-51 JSON with serde, parse that JSON back
//! and re-encode ("json_roundtrip"). Reply: one line
//! {"seq":n,"ok":bool,"err":..,"roundtrip":bool,"json_roundtrip":bool,"json":<SEP-51>}.
//! The canonical token projection of the JSON is done by tools/livecheck/rust-json.mjs.
use std::io::{BufWriter, Read, Write};
use stellar_xdr::{LedgerCloseMeta, Limits, ReadXdr, TransactionEnvelope, TransactionResultMetaV1, WriteXdr};

fn frame(r: &mut impl Read) -> Option<Vec<u8>> {
    let mut n = [0u8; 4];
    r.read_exact(&mut n).ok()?;
    let mut b = vec![0u8; u32::from_be_bytes(n) as usize];
    r.read_exact(&mut b).ok()?;
    Some(b)
}

fn run<T>(bytes: &[u8]) -> Result<(bool, bool, String), String>
where
    T: ReadXdr + WriteXdr + serde::Serialize + serde::de::DeserializeOwned,
{
    let v = T::from_xdr(bytes, Limits::none()).map_err(|e| format!("decode: {e}"))?;
    let re = v.to_xdr(Limits::none()).map_err(|e| format!("encode: {e}"))?;
    let json = serde_json::to_string(&v).map_err(|e| format!("json: {e}"))?;
    let jrt = match serde_json::from_str::<T>(&json) {
        Ok(back) => back.to_xdr(Limits::none()).map(|b| b == bytes).unwrap_or(false),
        Err(_) => false,
    };
    Ok((re == bytes, jrt, json))
}

fn main() {
    let mut stdin = std::io::stdin().lock();
    let mut out = BufWriter::with_capacity(1 << 22, std::io::stdout().lock());
    while let Some(hdr) = frame(&mut stdin) {
        let payload = frame(&mut stdin).expect("payload frame");
        let req: serde_json::Value = serde_json::from_slice(&hdr).expect("request json");
        let seq = req["seq"].as_u64().unwrap_or(0);
        let res = std::panic::catch_unwind(|| match req["single"].as_str() {
            Some("TransactionEnvelope") => run::<TransactionEnvelope>(&payload),
            Some("TransactionResultMetaV1") => run::<TransactionResultMetaV1>(&payload),
            _ => run::<LedgerCloseMeta>(&payload),
        })
        .unwrap_or_else(|p| Err(format!("panic: {:?}", p.downcast_ref::<String>().cloned().or(p.downcast_ref::<&str>().map(|s| s.to_string())))));
        match res {
            Ok((rt, jrt, json)) => {
                write!(out, "{{\"seq\":{seq},\"ok\":true,\"roundtrip\":{rt},\"json_roundtrip\":{jrt},\"json\":").unwrap();
                out.write_all(json.as_bytes()).unwrap();
                out.write_all(b"}\n").unwrap();
            }
            Err(e) => {
                writeln!(out, "{}", serde_json::json!({"seq": seq, "ok": false, "err": e})).unwrap();
            }
        }
        out.flush().unwrap();
    }
}
