//! Line recognition (REFERENCE.md steps 6–7): crop → colour prep → batched CTC.

use crate::backend::Net;
use crate::imgops::{flatten, gray, gray_to_bgr, resize_linear, Img};
use crate::text::{ctc_detail, CtcChar};
use anyhow::Result;

#[derive(Clone, Debug)]
pub struct RecCfg {
    pub height: usize,
    pub max_w: usize,
    pub batch: usize,
    pub color: String,
}

impl Default for RecCfg {
    fn default() -> Self {
        RecCfg { height: 48, max_w: 3200, batch: 16, color: "flatten".into() }
    }
}

fn prep(crop: &Img, mode: &str) -> Img {
    if mode == "bgr" || crop.c != 3 || crop.data.is_empty() {
        return crop.clone();
    }
    let g = gray(crop);
    match mode {
        "gray" => gray_to_bgr(&g),
        "flatten" => gray_to_bgr(&flatten(&g)),
        _ => {
            let mut hist = [0u64; 256];
            for &v in &g.data {
                hist[v as usize] += 1;
            }
            let total = g.data.len() as f64;
            let level = |q: f64| {
                let mut cum = 0u64;
                for (i, &n) in hist.iter().enumerate() {
                    cum += n;
                    if cum as f64 >= q * total {
                        return i;
                    }
                }
                255
            };
            let (lo, med, hi) = (level(0.02), level(0.5), level(0.98));
            let mut lut: Vec<f32> = (0..256).map(|v| v as f32).collect();
            if mode == "stretch" && hi as i64 - lo as i64 >= 16 {
                for v in lut.iter_mut() {
                    *v = ((*v - lo as f32) * (255.0 / (hi - lo) as f32)).clamp(0.0, 255.0);
                }
            }
            if lut[med] < 128.0 {
                for v in lut.iter_mut() {
                    *v = 255.0 - *v;
                }
            }
            let mut out = g.clone();
            for v in out.data.iter_mut() {
                *v = lut[*v as usize] as u8;
            }
            gray_to_bgr(&out)
        }
    }
}

/// (text, confidence, chars) per crop, in input order.
pub fn recognize(net: &mut dyn Net, crops: &[Img], cfg: &RecCfg, chars: &[String])
    -> Result<Vec<(String, f32, Vec<CtcChar>)>> {
    let hgt = cfg.height;
    let crops: Vec<Img> = if cfg.color == "flatten" {
        crops.iter().map(|c| {
            let nw = ((hgt as f64 * c.w as f64 / c.h.max(1) as f64).ceil() as usize).max(1);
            prep(&resize_linear(c, nw, hgt), "flatten")
        }).collect()
    } else {
        crops.iter().map(|c| prep(c, &cfg.color)).collect()
    };
    let ratios: Vec<f64> = crops.iter().map(|c| c.w as f64 / c.h.max(1) as f64).collect();
    let mut order: Vec<usize> = (0..crops.len()).collect();
    order.sort_by(|&a, &b| ratios[a].partial_cmp(&ratios[b]).unwrap());
    let mut out = vec![(String::new(), 0.0f32, Vec::new()); crops.len()];
    for idx in order.chunks(cfg.batch) {
        let maxr = idx.iter().map(|&i| ratios[i]).fold(0.0, f64::max);
        let w = cfg.max_w.min(16usize.max((hgt as f64 * maxr).ceil() as usize));
        let n = idx.len();
        let mut batch = vec![0f32; n * 3 * hgt * w];
        let mut widths = Vec::with_capacity(n);
        for (k, &i) in idx.iter().enumerate() {
            let rw = w.min(1usize.max((hgt as f64 * ratios[i]).ceil() as usize));
            widths.push(rw);
            let im = resize_linear(&crops[i], rw, hgt);
            for c in 0..3 {
                for y in 0..hgt {
                    for x in 0..rw {
                        let v = im.data[(y * rw + x) * 3 + c] as f32 / 255.0;
                        batch[((k * 3 + c) * hgt + y) * w + x] = (v - 0.5) / 0.5;
                    }
                }
            }
        }
        let t = std::time::Instant::now();
        let (shape, probs) = net.run([n, 3, hgt, w], batch)?;
        if std::env::var("OPENTHAI_TIMING").is_ok() {
            eprintln!("  rec batch n={n} w={w}: net {:.0} ms", t.elapsed().as_secs_f64() * 1e3);
        }
        let (t, cl) = (shape[1], shape[2]);
        for (k, &i) in idx.iter().enumerate() {
            let p = &probs[k * t * cl..(k + 1) * t * cl];
            out[i] = ctc_detail(p, t, cl, chars, w as f64 / t as f64, widths[k] as f64);
        }
    }
    Ok(out)
}
