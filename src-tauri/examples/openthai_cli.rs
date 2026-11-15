//! The shipped OpenThai OCR backend as a batch CLI, for the CP-0096 eval
//! harness (`scripts/ocr-eval`, engine `capz`). Same flags and JSONL output as
//! that harness's `openthai-proto`, so its parity (R1), accuracy and perf
//! commands score the code capz actually ships.
//!
//!   cargo run --release --example openthai_cli -- --model-dir resources/ocr/openthai \
//!       --images LIST --out OUT.jsonl [--threads N] [--repeat K] [--perf-out P.json]
//!
//! LIST: one "id<TAB>path" per line. `--config` and `--backend` are accepted and
//! ignored: the screenshot config is compiled in and the runtime is fixed per
//! platform (tract on macOS, ONNX Runtime elsewhere). Each call loads the
//! models again, as the app does, so timings include the load.

use anyhow::{anyhow, Context, Result};
use app_lib::openthai_ocr::OpenThaiBackend;
use serde_json::json;
use std::io::Write;
use std::time::Instant;

fn main() -> Result<()> {
    let (mut model_dir, mut images, mut out, mut perf_out) = (None, None, None, None);
    let (mut threads, mut repeat) = (app_lib::openthai_ocr::default_threads(), 1usize);
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    args.reverse();
    while let Some(flag) = args.pop() {
        let mut val = || args.pop().ok_or_else(|| anyhow!("{flag} needs a value"));
        match flag.as_str() {
            "--model-dir" => model_dir = Some(val()?),
            "--images" => images = Some(val()?),
            "--out" => out = Some(val()?),
            "--threads" => threads = val()?.parse()?,
            "--repeat" => repeat = val()?.parse::<usize>()?.max(1),
            "--perf-out" => perf_out = Some(val()?),
            "--config" | "--backend" => {
                val()?;
            }
            other => return Err(anyhow!("unknown flag {other}")),
        }
    }
    let backend = OpenThaiBackend::new(model_dir.context("--model-dir")?);
    let list = std::fs::read_to_string(images.context("--images")?)?;
    let mut w = std::io::BufWriter::new(std::fs::File::create(out.context("--out")?)?);
    let (mut first_ms, mut warm) = (None, Vec::new());
    for row in list.lines().filter(|l| !l.trim().is_empty()) {
        let (id, path) = row.split_once('\t').ok_or_else(|| anyhow!("bad list row {row:?}"))?;
        let mut res = None;
        let mut ms = 0.0;
        for _ in 0..repeat {
            let t = Instant::now();
            res = Some(backend.read_lines(path, threads)?);
            ms = t.elapsed().as_secs_f64() * 1000.0;
            if first_ms.is_none() {
                first_ms = Some(ms);
            } else {
                warm.push(ms);
            }
        }
        let (iw, ih, lines) = res.expect("repeat >= 1");
        writeln!(w, "{}", json!({"id": id, "width": iw, "height": ih, "elapsed_ms": ms, "lines": lines}))?;
    }
    w.flush()?;
    if let Some(p) = perf_out {
        warm.sort_by(|a, b| a.total_cmp(b));
        let n = warm.len();
        let med = (n > 0).then(|| if n % 2 == 1 { warm[n / 2] } else { (warm[n / 2 - 1] + warm[n / 2]) / 2.0 });
        let p95 = (n > 0).then(|| warm[((0.95 * n as f64) as usize).min(n - 1)]);
        let backend = if cfg!(target_os = "macos") { "tract" } else { "ort" };
        let perf = json!({"backend": backend, "threads": threads, "load_ms": 0.0, "first_ms": first_ms,
                          "cold_ms": first_ms, "p50_ms": med, "p95_ms": p95, "warm_n": n,
                          "note": "every call loads the models, as capz does"});
        std::fs::write(p, serde_json::to_string_pretty(&perf)?)?;
    }
    Ok(())
}
