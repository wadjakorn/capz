//! openthai-proto — OpenThai2.0-OCR-Text in Rust, to measure whether capz can
//! ship it: parity with iApp's Python runtime, speed, memory and binary size.
//!
//! openthai-proto --model-dir D --images LIST --out OUT.jsonl
//!                [--config C.json] [--backend ort|tract] [--threads N]
//!                [--repeat K] [--perf-out P.json]
//! LIST: one "id<TAB>path" per line. OUT: one JSON object per image.

mod backend;
mod det;
mod geom;
mod imgops;
mod page;
mod rec;
mod text;

use anyhow::{anyhow, Context, Result};
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;
use std::time::Instant;

struct Args {
    model_dir: PathBuf,
    images: PathBuf,
    out: PathBuf,
    config: Option<PathBuf>,
    backend: String,
    threads: usize,
    repeat: usize,
    perf_out: Option<PathBuf>,
}

fn parse_args() -> Result<Args> {
    let (mut model_dir, mut images, mut out, mut config, mut perf_out) = (None, None, None, None, None);
    let (mut backend, mut threads, mut repeat) = (default_backend().to_string(), 1usize, 1usize);
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    args.reverse();
    while let Some(flag) = args.pop() {
        let mut val = || args.pop().ok_or_else(|| anyhow!("{flag} needs a value"));
        match flag.as_str() {
            "--model-dir" => model_dir = Some(PathBuf::from(val()?)),
            "--images" => images = Some(PathBuf::from(val()?)),
            "--out" => out = Some(PathBuf::from(val()?)),
            "--config" => config = Some(PathBuf::from(val()?)),
            "--backend" => backend = val()?,
            "--threads" => threads = val()?.parse()?,
            "--repeat" => repeat = val()?.parse()?,
            "--perf-out" => perf_out = Some(PathBuf::from(val()?)),
            other => return Err(anyhow!("unknown flag {other}")),
        }
    }
    Ok(Args {
        model_dir: model_dir.context("--model-dir")?,
        images: images.context("--images")?,
        out: out.context("--out")?,
        config,
        backend,
        threads,
        repeat: repeat.max(1),
        perf_out,
    })
}

fn default_backend() -> &'static str {
    if cfg!(feature = "backend-ort") { "ort" } else { "tract" }
}

fn cfg_num(v: &Value, sec: &str, key: &str, dflt: f64) -> f64 {
    v.get(sec).and_then(|s| s.get(key)).and_then(Value::as_f64).unwrap_or(dflt)
}

fn main() -> Result<()> {
    let a = parse_args()?;
    let cfg: Value = match &a.config {
        Some(p) => serde_json::from_str(&std::fs::read_to_string(p)?)?,
        None => json!({}),
    };
    let mut det_cfg = det::DetCfg::default();
    det_cfg.limit = cfg_num(&cfg, "det", "limit", det_cfg.limit);
    det_cfg.thresh = cfg_num(&cfg, "det", "thresh", det_cfg.thresh as f64) as f32;
    det_cfg.box_thresh = cfg_num(&cfg, "det", "box_thresh", det_cfg.box_thresh);
    det_cfg.unclip = cfg_num(&cfg, "det", "unclip", det_cfg.unclip);
    det_cfg.v_pad = cfg_num(&cfg, "det", "v_pad", det_cfg.v_pad);
    let mut rec_cfg = rec::RecCfg::default();
    if let Some(c) = cfg.get("rec").and_then(|r| r.get("color")).and_then(Value::as_str) {
        rec_cfg.color = c.to_string();
    }
    let mut filter = page::FilterCfg::default();
    filter.drop_below = cfg_num(&cfg, "rec", "drop_below", filter.drop_below as f64) as f32;
    filter.min_chars = cfg_num(&cfg, "rec", "min_chars", filter.min_chars as f64) as usize;
    filter.junk_below = cfg_num(&cfg, "rec", "junk_below", filter.junk_below as f64) as f32;
    filter.junk_invalid = cfg_num(&cfg, "rec", "junk_invalid", filter.junk_invalid);
    let scale = cfg_num(&cfg, "pre", "scale", 1.0);
    if scale != 1.0 {
        return Err(anyhow!("pre.scale != 1 is not ported"));
    }

    let dict = std::fs::read_to_string(a.model_dir.join("rec_dict.txt"))?;
    let mut chars = vec![String::new()];
    chars.extend(dict.split('\n').filter(|l| !l.is_empty()).map(str::to_string));
    chars.push(" ".into());

    let t_load = Instant::now();
    let mut eng = page::Engine {
        det: backend::load(&a.backend, &a.model_dir.join("det.onnx"), a.threads)?,
        rec: backend::load(&a.backend, &a.model_dir.join("rec.onnx"), a.threads)?,
        chars,
        det_cfg,
        rec_cfg,
        filter,
    };
    let load_ms = t_load.elapsed().as_secs_f64() * 1000.0;

    let list = std::fs::read_to_string(&a.images)?;
    let mut out = std::io::BufWriter::new(std::fs::File::create(&a.out)?);
    let (mut first_ms, mut warm) = (None, Vec::new());
    for row in list.lines().filter(|l| !l.trim().is_empty()) {
        let (id, path) = row.split_once('\t').ok_or_else(|| anyhow!("bad list row {row:?}"))?;
        let img = imgops::Img::load_bgr(path)?;
        let mut lines = vec![];
        let mut ms = 0.0;
        for _ in 0..a.repeat {
            let t = Instant::now();
            lines = eng.read(&img)?;
            ms = t.elapsed().as_secs_f64() * 1000.0;
            if first_ms.is_none() {
                first_ms = Some(ms);
            } else {
                warm.push(ms);
            }
        }
        let rec = json!({"id": id, "width": img.w, "height": img.h, "elapsed_ms": ms, "lines": lines});
        writeln!(out, "{rec}")?;
    }
    out.flush()?;
    if let Some(p) = a.perf_out {
        let mut s = warm.clone();
        s.sort_by(|x, y| x.partial_cmp(y).unwrap());
        let pick = |q: f64| if s.is_empty() { None } else { Some(s[((q * s.len() as f64) as usize).min(s.len() - 1)]) };
        let med = if s.is_empty() {
            None
        } else if s.len() % 2 == 1 {
            Some(s[s.len() / 2])
        } else {
            Some((s[s.len() / 2 - 1] + s[s.len() / 2]) / 2.0)
        };
        let perf = json!({"backend": a.backend, "threads": a.threads, "load_ms": load_ms, "first_ms": first_ms,
                          "cold_ms": first_ms.map(|f| f + load_ms), "p50_ms": med, "p95_ms": pick(0.95),
                          "warm_n": s.len()});
        std::fs::write(p, serde_json::to_string_pretty(&perf)?)?;
    }
    Ok(())
}
