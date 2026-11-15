//! Text-line detection (REFERENCE.md step 2): PP-OCRv6-tiny DB head → line quads.
//!
//! Unclip note: the reference offsets each min-area rectangle with pyclipper
//! (round joins) by d = area·ratio/perimeter and takes the min-area rectangle of
//! the result. Mathematically that is the rectangle grown by d on every side, but
//! ClipperLib works on integer points and approximates the round corners with a
//! few vertices, so on slightly tilted text lines the result differs by 1–2 px.
//! `clipper_offset_round` reproduces ClipperOffset exactly (tested against
//! pyclipper in fixtures/clipper.json).

use super::net::Net;
use super::geom::{area, clipper_offset_round, det_resize_dims, dist, min_area_rect, perimeter, Quad};
use super::imgops::{pad_white, resize_linear, Img};
use anyhow::Result;
use image::{GrayImage, Luma};

const MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const STD: [f32; 3] = [0.229, 0.224, 0.225];

#[derive(Clone, Debug)]
pub struct DetCfg {
    pub limit: f64,
    pub thresh: f32,
    pub box_thresh: f64,
    pub unclip: f64,
    pub min_size: f64,
    pub max_candidates: usize,
    pub v_pad: f64,
}

impl Default for DetCfg {
    /// det.yml + config.json as the reference resolves them (REFERENCE.md table).
    fn default() -> Self {
        DetCfg { limit: 1280.0, thresh: 0.2, box_thresh: 0.4, unclip: 1.4, min_size: 3.0, max_candidates: 3000, v_pad: 0.0 }
    }
}

/// Mean probability inside the quad (cv2.fillPoly mask on its truncated integer corners).
fn box_score(prob: &[f32], pw: usize, ph: usize, q: &Quad) -> f64 {
    let xs = q.map(|p| p[0]);
    let ys = q.map(|p| p[1]);
    let fmin = |v: [f64; 4]| v.iter().cloned().fold(f64::MAX, f64::min);
    let fmax = |v: [f64; 4]| v.iter().cloned().fold(f64::MIN, f64::max);
    let x0 = (fmin(xs).floor() as i64).clamp(0, pw as i64 - 1);
    let x1 = (fmax(xs).ceil() as i64).clamp(0, pw as i64 - 1);
    let y0 = (fmin(ys).floor() as i64).clamp(0, ph as i64 - 1);
    let y1 = (fmax(ys).ceil() as i64).clamp(0, ph as i64 - 1);
    let poly: Vec<[f64; 2]> = q.iter().map(|p| [(p[0] - x0 as f64).trunc(), (p[1] - y0 as f64).trunc()]).collect();
    let inside = |x: f64, y: f64| {
        let mut sign = 0i32;
        for i in 0..4 {
            let (a, b) = (poly[i], poly[(i + 1) % 4]);
            let cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
            if cr.abs() < 1e-9 {
                continue;
            }
            let s = if cr > 0.0 { 1 } else { -1 };
            if sign == 0 {
                sign = s;
            } else if s != sign {
                return false;
            }
        }
        true
    };
    let (mut sum, mut n) = (0.0f64, 0usize);
    for y in 0..=(y1 - y0) {
        for x in 0..=(x1 - x0) {
            if inside(x as f64, y as f64) {
                sum += prob[((y + y0) as usize) * pw + (x + x0) as usize] as f64;
                n += 1;
            }
        }
    }
    if n == 0 { 0.0 } else { sum / n as f64 }
}

pub fn detect(net: &mut dyn Net, img: &Img, cfg: &DetCfg) -> Result<Vec<Quad>> {
    let (h0, w0) = (img.h, img.w);
    let pad = 8usize.max((0.05 * h0.min(w0) as f64) as usize);
    let padded = pad_white(img, pad);
    let (h, w) = (padded.h, padded.w);
    let (rh, rw) = det_resize_dims(h, w, cfg.limit);
    let r = resize_linear(&padded, rw, rh);
    let mut x = vec![0f32; 3 * rh * rw];
    for c in 0..3 {
        for i in 0..rh * rw {
            x[c * rh * rw + i] = (r.data[i * 3 + c] as f32 / 255.0 - MEAN[c]) / STD[c];
        }
    }
    let (shape, prob) = net.run([1, 3, rh, rw], x)?;
    let (ph, pw) = (shape[2], shape[3]);
    let bitmap = GrayImage::from_fn(pw as u32, ph as u32, |px, py| {
        Luma([if prob[py as usize * pw + px as usize] > cfg.thresh { 255 } else { 0 }])
    });
    let contours = imageproc::contours::find_contours::<i32>(&bitmap);
    let (sx, sy) = (w as f64 / pw as f64, h as f64 / ph as f64);
    let mut out = Vec::new();
    for c in contours.iter().take(cfg.max_candidates) {
        let pts: Vec<[i32; 2]> = c.points.iter().map(|p| [p.x, p.y]).collect();
        let (b, side) = min_area_rect(&pts);
        if side < cfg.min_size || box_score(&prob, pw, ph, &b) < cfg.box_thresh {
            continue;
        }
        let len = perimeter(&b);
        if len == 0.0 {
            continue;
        }
        let d = area(&b) * cfg.unclip / len;
        let big_pts = clipper_offset_round(&b, d);
        let (mut q, side2) = min_area_rect(&big_pts);
        if side2 < cfg.min_size + 2.0 {
            continue;
        }
        for p in q.iter_mut() {
            p[0] = (p[0] * sx - pad as f64).clamp(0.0, w0 as f64 - 1.0);
            p[1] = (p[1] * sy - pad as f64).clamp(0.0, h0 as f64 - 1.0);
        }
        if cfg.v_pad > 0.0 {
            let hh = dist(q[0], q[3]).max(1.0) * cfg.v_pad / 2.0;
            for i in [0, 1] {
                q[i][1] = (q[i][1] - hh).clamp(0.0, h0 as f64 - 1.0);
            }
            for i in [2, 3] {
                q[i][1] = (q[i][1] + hh).clamp(0.0, h0 as f64 - 1.0);
            }
        }
        let xs = q.map(|p| p[0]);
        let ys = q.map(|p| p[1]);
        let span = |v: [f64; 4]| v.iter().cloned().fold(f64::MIN, f64::max) - v.iter().cloned().fold(f64::MAX, f64::min);
        if span(xs) >= 2.0 && span(ys) >= 2.0 {
            out.push(q);
        }
    }
    Ok(out)
}
