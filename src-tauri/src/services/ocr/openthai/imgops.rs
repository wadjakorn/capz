//! Image operations with OpenCV's conventions (BGR order, half-pixel centres,
//! fixed-point grey), close enough that the recognizer reads the same text.

use super::geom::{dist, Quad};

/// 8-bit image, row-major, `c` channels (3 = BGR, as OpenCV loads it; 1 = grey).
#[derive(Clone, Debug, PartialEq)]
pub struct Img {
    pub w: usize,
    pub h: usize,
    pub c: usize,
    pub data: Vec<u8>,
}

impl Img {
    pub fn new(w: usize, h: usize, c: usize) -> Self {
        Img { w, h, c, data: vec![0; w * h * c] }
    }

    #[inline]
    pub fn at(&self, x: usize, y: usize, k: usize) -> u8 {
        self.data[(y * self.w + x) * self.c + k]
    }

    pub fn load_bgr(path: &str) -> anyhow::Result<Img> {
        let rgb = image::open(path)?.to_rgb8();
        let (w, h) = (rgb.width() as usize, rgb.height() as usize);
        let mut data = Vec::with_capacity(w * h * 3);
        for p in rgb.pixels() {
            data.extend_from_slice(&[p[2], p[1], p[0]]);
        }
        Ok(Img { w, h, c: 3, data })
    }
}

/// Copy of the `w`×`h` rectangle whose top-left is `(x, y)`. The caller keeps
/// it inside `src` (CP-0100 crops a scope box before detection).
pub fn crop_rect(src: &Img, x: usize, y: usize, w: usize, h: usize) -> Img {
    let mut out = Img::new(w, h, src.c);
    let row_len = w * src.c;
    for row in 0..h {
        let s = ((y + row) * src.w + x) * src.c;
        out.data[row * row_len..(row + 1) * row_len].copy_from_slice(&src.data[s..s + row_len]);
    }
    out
}

/// cv2.cvtColor(BGR2GRAY): Y = (R·4899 + G·9617 + B·1868 + 2^13) >> 14.
pub fn gray(src: &Img) -> Img {
    let mut out = Img::new(src.w, src.h, 1);
    for (i, px) in src.data.chunks_exact(3).enumerate() {
        let (b, g, r) = (px[0] as u32, px[1] as u32, px[2] as u32);
        out.data[i] = ((r * 4899 + g * 9617 + b * 1868 + (1 << 13)) >> 14) as u8;
    }
    out
}

pub fn gray_to_bgr(g: &Img) -> Img {
    let mut out = Img::new(g.w, g.h, 3);
    for (i, &v) in g.data.iter().enumerate() {
        out.data[i * 3..i * 3 + 3].copy_from_slice(&[v, v, v]);
    }
    out
}

/// cv2.resize(INTER_LINEAR) on 8-bit images, bit-exact with OpenCV's SIMD path:
/// 11-bit fixed-point weights from float32 coordinates; horizontally the edge
/// samples are clamped with their fraction zeroed, vertically only the row index
/// is clamped (the fraction is kept); rows are blended as
/// ((((A>>4)·b0)>>16) + (((B>>4)·b1)>>16) + 2) >> 2.
pub fn resize_linear(src: &Img, nw: usize, nh: usize) -> Img {
    if nw == src.w && nh == src.h {
        return src.clone();
    }
    // (index0, index1, weight0, weight1) per destination coordinate
    let axis = |n_dst: usize, n_src: usize, zero_frac_at_edges: bool| -> Vec<(usize, usize, i64, i64)> {
        let scale = n_src as f64 / n_dst as f64;
        (0..n_dst)
            .map(|d| {
                let f = ((d as f64 + 0.5) * scale - 0.5) as f32;
                let mut s = f.floor() as i64;
                let mut t = f - s as f32;
                if zero_frac_at_edges {
                    if s < 0 {
                        s = 0;
                        t = 0.0;
                    }
                    if s >= n_src as i64 - 1 {
                        s = n_src as i64 - 1;
                        t = 0.0;
                    }
                }
                let last = n_src as i64 - 1;
                let i0 = s.clamp(0, last) as usize;
                let i1 = (s + 1).clamp(0, last) as usize;
                let w0 = ((1.0f32 - t) * 2048.0).round_ties_even() as i64;
                let w1 = (t * 2048.0).round_ties_even() as i64;
                (i0, i1, w0, w1)
            })
            .collect()
    };
    let xs = axis(nw, src.w, true);
    let ys = axis(nh, src.h, false);
    let c = src.c;
    // horizontal pass for every source row
    let mut hr = vec![0i64; src.h * nw * c];
    for y in 0..src.h {
        for (dx, &(x0, x1, w0, w1)) in xs.iter().enumerate() {
            for k in 0..c {
                hr[(y * nw + dx) * c + k] = src.at(x0, y, k) as i64 * w0 + src.at(x1, y, k) as i64 * w1;
            }
        }
    }
    let mut out = Img::new(nw, nh, c);
    let row = nw * c;
    for (dy, &(y0, y1, b0, b1)) in ys.iter().enumerate() {
        for i in 0..row {
            let a = hr[y0 * row + i];
            let b = hr[y1 * row + i];
            let v = ((((a >> 4) * b0) >> 16) + (((b >> 4) * b1) >> 16) + 2) >> 2;
            out.data[dy * row + i] = v.clamp(0, 255) as u8;
        }
    }
    out
}

/// cv2.copyMakeBorder(BORDER_CONSTANT, 255) on all four sides.
pub fn pad_white(src: &Img, pad: usize) -> Img {
    let (w, h, c) = (src.w + 2 * pad, src.h + 2 * pad, src.c);
    let mut out = Img { w, h, c, data: vec![255; w * h * c] };
    for y in 0..src.h {
        let s = y * src.w * c;
        let d = ((y + pad) * w + pad) * c;
        out.data[d..d + src.w * c].copy_from_slice(&src.data[s..s + src.w * c]);
    }
    out
}

/// crop_line(turn=0): perspective-rectify `q` (TL,TR,BR,BL) to w×h, bicubic, border replicate.
pub fn crop_quad(src: &Img, q: &Quad) -> Img {
    let (w, h) = quad_size(q);
    let dst = [[0.0, 0.0], [w as f64, 0.0], [w as f64, h as f64], [0.0, h as f64]];
    // homography dst -> src (what warpPerspective samples with)
    let m = homography(&dst, q);
    let c = src.c;
    let mut out = Img::new(w, h, c);
    let cubic = |t: f64| -> [f64; 4] {
        const A: f64 = -0.75;
        let w0 = ((A * (t + 1.0) - 5.0 * A) * (t + 1.0) + 8.0 * A) * (t + 1.0) - 4.0 * A;
        let w1 = ((A + 2.0) * t - (A + 3.0)) * t * t + 1.0;
        let w2 = ((A + 2.0) * (1.0 - t) - (A + 3.0)) * (1.0 - t) * (1.0 - t) + 1.0;
        [w0, w1, w2, 1.0 - w0 - w1 - w2]
    };
    let clampi = |v: i64, n: usize| v.clamp(0, n as i64 - 1) as usize;
    for y in 0..h {
        for x in 0..w {
            let (xf, yf) = (x as f64, y as f64);
            let z = m[6] * xf + m[7] * yf + m[8];
            let sx = (m[0] * xf + m[1] * yf + m[2]) / z;
            let sy = (m[3] * xf + m[4] * yf + m[5]) / z;
            // cv2 quantises the sub-pixel position to 1/32
            let qx = (sx * 32.0).round() as i64;
            let qy = (sy * 32.0).round() as i64;
            let (ix, iy) = (qx.div_euclid(32), qy.div_euclid(32));
            let (tx, ty) = (qx.rem_euclid(32) as f64 / 32.0, qy.rem_euclid(32) as f64 / 32.0);
            let (wx, wy) = (cubic(tx), cubic(ty));
            for k in 0..c {
                let mut acc = 0.0;
                for (j, wyj) in wy.iter().enumerate() {
                    let yy = clampi(iy - 1 + j as i64, src.h);
                    for (i, wxi) in wx.iter().enumerate() {
                        let xx = clampi(ix - 1 + i as i64, src.w);
                        acc += wyj * wxi * src.at(xx, yy, k) as f64;
                    }
                }
                out.data[(y * w + x) * c + k] = acc.round().clamp(0.0, 255.0) as u8;
            }
        }
    }
    out
}

/// 3×3 homography mapping the 4 `from` points onto the 4 `to` points (getPerspectiveTransform).
fn homography(from: &Quad, to: &Quad) -> [f64; 9] {
    let mut a = [[0.0f64; 9]; 8];
    for i in 0..4 {
        let (x, y) = (from[i][0], from[i][1]);
        let (u, v) = (to[i][0], to[i][1]);
        a[2 * i] = [x, y, 1.0, 0.0, 0.0, 0.0, -x * u, -y * u, u];
        a[2 * i + 1] = [0.0, 0.0, 0.0, x, y, 1.0, -x * v, -y * v, v];
    }
    for col in 0..8 {
        let piv = (col..8).max_by(|&r, &s| a[r][col].abs().partial_cmp(&a[s][col].abs()).unwrap()).unwrap();
        a.swap(col, piv);
        let d = a[col][col];
        if d.abs() < 1e-12 {
            continue;
        }
        for v in a[col][col..].iter_mut() {
            *v /= d;
        }
        for r in 0..8 {
            if r != col {
                let f = a[r][col];
                let pivot = a[col];
                for (k, v) in a[r].iter_mut().enumerate().skip(col) {
                    *v -= f * pivot[k];
                }
            }
        }
    }
    [a[0][8], a[1][8], a[2][8], a[3][8], a[4][8], a[5][8], a[6][8], a[7][8], 1.0]
}

/// np.rot90(img, k): k=1 counter-clockwise, k=-1 clockwise.
pub fn rot90(src: &Img, k: i32) -> Img {
    let (w, h, c) = (src.h, src.w, src.c);
    let mut out = Img::new(w, h, c);
    for y in 0..h {
        for x in 0..w {
            // k=1 (ccw): out[y][x] = src[x][W-1-y];  k=-1 (cw): out[y][x] = src[H-1-x][y]
            let (sx, sy) = if k == 1 { (src.w - 1 - y, x) } else { (y, src.h - 1 - x) };
            for ch in 0..c {
                out.data[(y * w + x) * c + ch] = src.at(sx, sy, ch);
            }
        }
    }
    out
}

/// _flatten: dark text on white from any grey line crop (see REFERENCE.md step 7).
pub fn flatten(g: &Img) -> Img {
    let (w, h) = (g.w, g.h);
    let k = (h / 6).max(2).min(h);
    // per column: median of the top k and bottom k rows (np.median → mean of the middle two)
    let mut bg = vec![0u8; w];
    let mut col: Vec<u8> = Vec::with_capacity(2 * k);
    for (x, slot) in bg.iter_mut().enumerate() {
        col.clear();
        for y in 0..k {
            col.push(g.at(x, y, 0));
        }
        for y in h - k..h {
            col.push(g.at(x, y, 0));
        }
        col.sort_unstable();
        let n = col.len();
        let med = if n % 2 == 1 { col[n / 2] as f64 } else { (col[n / 2 - 1] as f64 + col[n / 2] as f64) / 2.0 };
        *slot = med as u8; // astype(uint8): truncation
    }
    // median blur along the line, window max(3, min(h|1, 255)), border replicate
    let win = 3.max((h | 1).min(255));
    let r = win / 2;
    let mut bg2 = vec![0.0f32; w];
    let mut buf: Vec<u8> = Vec::with_capacity(win);
    for (x, slot) in bg2.iter_mut().enumerate() {
        buf.clear();
        for d in 0..win {
            let xx = (x as i64 - r as i64 + d as i64).clamp(0, w as i64 - 1) as usize;
            buf.push(bg[xx]);
        }
        buf.sort_unstable();
        *slot = buf[win / 2] as f32;
    }
    let d: Vec<f32> = (0..w * h).map(|i| (g.data[i] as f32 - bg2[i % w]).abs()).collect();
    let mut hist = [0u64; 256];
    for &v in &d {
        hist[(v as usize).min(255)] += 1;
    }
    let total = d.len() as f64;
    let mut cum = 0u64;
    let mut idx = 255usize;
    for (i, &n) in hist.iter().enumerate() {
        cum += n;
        if cum as f64 >= 0.98 * total {
            idx = i;
            break;
        }
    }
    let hi = (idx as f32).max(24.0);
    let mut out = Img::new(w, h, 1);
    for (i, &v) in d.iter().enumerate() {
        out.data[i] = (255.0 - (v * (255.0 / hi)).clamp(0.0, 255.0)) as u8;
    }
    out
}

pub fn quad_size(q: &Quad) -> (usize, usize) {
    let w = dist(q[0], q[1]).max(dist(q[3], q[2])) as usize;
    let h = dist(q[0], q[3]).max(dist(q[1], q[2])) as usize;
    (w.max(1), h.max(1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn fx() -> Value {
        serde_json::from_str(include_str!("fixtures/imgops.json")).unwrap()
    }

    fn img(v: &Value, c: usize) -> Img {
        let data: Vec<u8> = v["data"].as_array().unwrap().iter().map(|x| x.as_u64().unwrap() as u8).collect();
        Img { w: v["w"].as_u64().unwrap() as usize, h: v["h"].as_u64().unwrap() as usize, c, data }
    }

    fn bytes(v: &Value) -> Vec<u8> {
        v.as_array().unwrap().iter().map(|x| x.as_u64().unwrap() as u8).collect()
    }

    fn close(a: &[u8], b: &[u8], max: i32, mean: f64) {
        assert_eq!(a.len(), b.len());
        let d: Vec<i32> = a.iter().zip(b).map(|(x, y)| (*x as i32 - *y as i32).abs()).collect();
        let m = *d.iter().max().unwrap();
        let avg = d.iter().sum::<i32>() as f64 / d.len() as f64;
        assert!(m <= max && avg <= mean, "max diff {m}, mean {avg:.3}");
    }

    #[test]
    fn gray_matches_cv2() {
        let f = fx();
        assert_eq!(gray(&img(&f["img"], 3)).data, bytes(&f["gray"]));
    }

    #[test]
    fn resize_matches_cv2() {
        let f = fx();
        let src = img(&f["img"], 3);
        // bit-exact: one-level differences in the detector input moved whole boxes (see REFERENCE.md)
        assert_eq!(resize_linear(&src, 4, 3).data, bytes(&f["resize_3x4"]));
        assert_eq!(resize_linear(&src, 11, 9).data, bytes(&f["resize_9x11"]));
    }

    #[test]
    fn flatten_matches_reference() {
        let f = fx();
        close(&flatten(&img(&f["g"], 1)).data, &bytes(&f["flat"]), 1, 0.2);
    }

    #[test]
    fn crop_quad_matches_cv2_warp() {
        let f = fx();
        let src = img(&f["smooth"], 3);
        let b = f["box"].as_array().unwrap();
        let p = |i: usize| [b[i][0].as_f64().unwrap(), b[i][1].as_f64().unwrap()];
        let q = [p(0), p(1), p(2), p(3)];
        let out = crop_quad(&src, &q);
        let want = img(&f["crop"], 3);
        assert_eq!((out.w, out.h), (want.w, want.h));
        close(&out.data, &want.data, 3, 0.6);
    }

    #[test]
    fn rot90_directions() {
        let src = Img { w: 2, h: 1, c: 1, data: vec![1, 2] };
        assert_eq!(rot90(&src, 1), Img { w: 1, h: 2, c: 1, data: vec![2, 1] });
        assert_eq!(rot90(&src, -1), Img { w: 1, h: 2, c: 1, data: vec![1, 2] });
    }

    #[test]
    fn pad_white_adds_border() {
        let src = Img { w: 1, h: 1, c: 3, data: vec![0, 0, 0] };
        let p = pad_white(&src, 1);
        assert_eq!((p.w, p.h), (3, 3));
        assert_eq!(p.at(1, 1, 0), 0);
        assert_eq!(p.at(0, 0, 2), 255);
    }
}
