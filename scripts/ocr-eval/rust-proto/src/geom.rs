//! Box geometry used by the detector port (cv2.minAreaRect / boxPoints /
//! order_points, contourArea / arcLength, pyclipper unclip, resize rule).

pub type Pt = [f64; 2];
pub type Quad = [Pt; 4];

/// Python's round(): half to even.
pub fn round_half_even(x: f64) -> f64 {
    let r = x.round();
    if (x - x.trunc()).abs() == 0.5 { 2.0 * (x / 2.0).round() } else { r }
}

/// DetResize: long side to `limit` (capped at 4x upscaling), each side to a multiple of 32, min 32.
pub fn det_resize_dims(h: usize, w: usize, limit: f64) -> (usize, usize) {
    let s = if limit > 0.0 { (limit / h.max(w) as f64).min(4.0) } else { 1.0 };
    let side = |n: usize| ((round_half_even(n as f64 * s / 32.0) as usize) * 32).max(32);
    (side(h), side(w))
}

/// cv2.minAreaRect on integer contour points → corners ordered TL, TR, BR, BL and the short side.
pub fn min_area_rect(pts: &[[i32; 2]]) -> (Quad, f64) {
    let hull = convex_hull(pts);
    if hull.len() == 1 {
        let p = hull[0];
        return ([p, p, p, p], 0.0);
    }
    let mut best: Option<(f64, Quad, f64)> = None;
    for i in 0..hull.len() {
        let a = hull[i];
        let b = hull[(i + 1) % hull.len()];
        let len = dist(a, b);
        if len == 0.0 {
            continue;
        }
        let u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        let v = [-u[1], u[0]];
        let (mut lo_u, mut hi_u, mut lo_v, mut hi_v) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
        for p in &hull {
            let pu = p[0] * u[0] + p[1] * u[1];
            let pv = p[0] * v[0] + p[1] * v[1];
            lo_u = lo_u.min(pu);
            hi_u = hi_u.max(pu);
            lo_v = lo_v.min(pv);
            hi_v = hi_v.max(pv);
        }
        let area = (hi_u - lo_u) * (hi_v - lo_v);
        if best.as_ref().is_none_or(|b| area < b.0 - 1e-9) {
            let c = |su: f64, sv: f64| [u[0] * su + v[0] * sv, u[1] * su + v[1] * sv];
            let q = [c(lo_u, lo_v), c(hi_u, lo_v), c(hi_u, hi_v), c(lo_u, hi_v)];
            best = Some((area, q, (hi_u - lo_u).min(hi_v - lo_v)));
        }
    }
    let (_, q, side) = best.unwrap();
    (order_points(&q), side)
}

fn convex_hull(pts: &[[i32; 2]]) -> Vec<Pt> {
    let mut p: Vec<[i64; 2]> = pts.iter().map(|q| [q[0] as i64, q[1] as i64]).collect();
    p.sort();
    p.dedup();
    if p.len() <= 2 {
        return p.iter().map(|q| [q[0] as f64, q[1] as f64]).collect();
    }
    let cross = |o: [i64; 2], a: [i64; 2], b: [i64; 2]| (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    let mut lower: Vec<[i64; 2]> = vec![];
    for &q in &p {
        while lower.len() >= 2 && cross(lower[lower.len() - 2], lower[lower.len() - 1], q) <= 0 {
            lower.pop();
        }
        lower.push(q);
    }
    let mut upper: Vec<[i64; 2]> = vec![];
    for &q in p.iter().rev() {
        while upper.len() >= 2 && cross(upper[upper.len() - 2], upper[upper.len() - 1], q) <= 0 {
            upper.pop();
        }
        upper.push(q);
    }
    lower.pop();
    upper.pop();
    lower.extend(upper);
    lower.iter().map(|q| [q[0] as f64, q[1] as f64]).collect()
}

/// order_points: sort by x; the two left by y, the two right by y → TL, TR, BR, BL.
pub fn order_points(q: &Quad) -> Quad {
    let mut p = *q;
    p.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap());
    let (mut l, mut r) = ([p[0], p[1]], [p[2], p[3]]);
    l.sort_by(|a, b| a[1].partial_cmp(&b[1]).unwrap());
    r.sort_by(|a, b| a[1].partial_cmp(&b[1]).unwrap());
    [l[0], r[0], r[1], l[1]]
}

pub fn area(q: &Quad) -> f64 {
    let mut s = 0.0;
    for i in 0..4 {
        let (a, b) = (q[i], q[(i + 1) % 4]);
        s += a[0] * b[1] - b[0] * a[1];
    }
    s.abs() / 2.0
}

pub fn perimeter(q: &Quad) -> f64 {
    (0..4).map(|i| dist(q[i], q[(i + 1) % 4])).sum()
}



#[cfg(test)] // analytic form of the unclip; detection uses clipper_offset_round
/// pyclipper round-join offset of a rectangle by area·ratio/perimeter, then its min-area rect:
/// for a rectangle that is the rectangle grown by d on every side.
pub fn unclip_rect(q: &Quad, ratio: f64) -> Option<(Quad, f64)> {
    let len = perimeter(q);
    if len == 0.0 {
        return None;
    }
    Some(expand_rect(q, area(q) * ratio / len))
}

#[cfg(test)] // analytic form of the unclip; detection uses clipper_offset_round
/// Grow a rectangle (TL,TR,BR,BL) by `d` on every side; returns it re-ordered and its short side.
pub fn expand_rect(q: &Quad, d: f64) -> (Quad, f64) {
    let unit = |a: Pt, b: Pt, fallback: Pt| {
        let l = dist(a, b);
        if l == 0.0 { fallback } else { [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }
    };
    let u = unit(q[0], q[1], [1.0, 0.0]);
    let v = unit(q[0], q[3], [-u[1], u[0]]);
    let mv = |p: Pt, su: f64, sv: f64| [p[0] + d * (su * u[0] + sv * v[0]), p[1] + d * (su * u[1] + sv * v[1])];
    let g = order_points(&[mv(q[0], -1.0, -1.0), mv(q[1], 1.0, -1.0), mv(q[2], 1.0, 1.0), mv(q[3], -1.0, 1.0)]);
    let side = dist(g[0], g[1]).min(dist(g[0], g[3]));
    (g, side)
}

/// ClipperLib's ClipperOffset (round joins, arc tolerance 0.25) on a closed quad, as pyclipper
/// runs it: input points truncated to integers, output points rounded half away from zero.
pub fn clipper_offset_round(q: &Quad, delta: f64) -> Vec<[i32; 2]> {
    let rnd = |v: f64| if v < 0.0 { (v - 0.5) as i64 } else { (v + 0.5) as i64 };
    let mut pts: Vec<[i64; 2]> = Vec::with_capacity(4);
    for p in q {
        let ip = [p[0] as i64, p[1] as i64]; // C cast: truncation toward zero
        if pts.last() != Some(&ip) {
            pts.push(ip);
        }
    }
    if pts.len() > 1 && pts.first() == pts.last() {
        pts.pop();
    }
    let n = pts.len();
    if n < 3 {
        return pts.iter().map(|p| [p[0] as i32, p[1] as i32]).collect();
    }
    let area2: i64 = (0..n).map(|i| pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]).sum();
    if area2 < 0 {
        pts.reverse(); // FixOrientations
    }
    let ad = delta.abs();
    let y = if 0.25 <= ad * 0.25 { 0.25 } else { ad * 0.25 };
    let mut steps = std::f64::consts::PI / (1.0 - y / ad).acos();
    if steps > ad * std::f64::consts::PI {
        steps = ad * std::f64::consts::PI;
    }
    let (mut sin_, cos_) = ((2.0 * std::f64::consts::PI / steps).sin(), (2.0 * std::f64::consts::PI / steps).cos());
    if delta < 0.0 {
        sin_ = -sin_;
    }
    let steps_per_rad = steps / (2.0 * std::f64::consts::PI);
    let normals: Vec<[f64; 2]> = (0..n)
        .map(|j| {
            let (a, b) = (pts[j], pts[(j + 1) % n]);
            let (dx, dy) = ((b[0] - a[0]) as f64, (b[1] - a[1]) as f64);
            let f = 1.0 / (dx * dx + dy * dy).sqrt();
            [dy * f, -dx * f]
        })
        .collect();
    let at = |p: [i64; 2], nrm: [f64; 2]| [rnd(p[0] as f64 + nrm[0] * delta), rnd(p[1] as f64 + nrm[1] * delta)];
    let mut out: Vec<[i64; 2]> = vec![];
    let mut k = n - 1;
    for j in 0..n {
        let (nk, nj) = (normals[k], normals[j]);
        let mut sin_a = nk[0] * nj[1] - nj[0] * nk[1];
        let cos_a = nk[0] * nj[0] + nj[1] * nk[1];
        if (sin_a * delta).abs() < 1.0 {
            if cos_a > 0.0 {
                out.push(at(pts[j], nk));
                k = j;
                continue;
            }
        } else {
            sin_a = sin_a.clamp(-1.0, 1.0);
        }
        if sin_a * delta < 0.0 {
            out.push(at(pts[j], nk));
            out.push(pts[j]);
            out.push(at(pts[j], nj));
        } else {
            let a = sin_a.atan2(cos_a);
            let st = (rnd(steps_per_rad * a.abs())).max(1);
            let (mut x, mut yv) = (nk[0], nk[1]);
            for _ in 0..st {
                out.push(at(pts[j], [x, yv]));
                let x2 = x;
                x = x * cos_ - sin_ * yv;
                yv = x2 * sin_ + yv * cos_;
            }
            out.push(at(pts[j], nj));
        }
        k = j;
    }
    out.iter().map(|p| [p[0] as i32, p[1] as i32]).collect()
}

pub fn dist(a: Pt, b: Pt) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn det_resize_multiple_of_32() {
        assert_eq!(det_resize_dims(800, 1280, 1280.0), (800, 1280));
        assert_eq!(det_resize_dims(1600, 2560, 1280.0), (800, 1280));
        assert_eq!(det_resize_dims(100, 50, 1280.0), (384, 192)); // 4x cap; round(12.5)=12 (half even)
        assert_eq!(det_resize_dims(10, 10, 0.0), (32, 32));
    }

    #[test]
    fn round_half_even_like_python() {
        assert_eq!(round_half_even(12.5), 12.0);
        assert_eq!(round_half_even(13.5), 14.0);
        assert_eq!(round_half_even(12.4), 12.0);
    }

    #[test]
    fn min_area_rect_axis_aligned_blob() {
        let mut pts = vec![];
        for x in 10..=110 {
            pts.push([x, 20]);
            pts.push([x, 40]);
        }
        for y in 20..=40 {
            pts.push([10, y]);
            pts.push([110, y]);
        }
        let (q, side) = min_area_rect(&pts);
        assert!((side - 20.0).abs() < 1e-6, "{side}");
        let tl = q[0];
        let br = q[2];
        assert!((tl[0] - 10.0).abs() < 1e-6 && (tl[1] - 20.0).abs() < 1e-6, "{q:?}");
        assert!((br[0] - 110.0).abs() < 1e-6 && (br[1] - 40.0).abs() < 1e-6, "{q:?}");
    }

    #[test]
    fn unclip_expands_rect_by_d() {
        let q: Quad = [[0.0, 0.0], [100.0, 0.0], [100.0, 20.0], [0.0, 20.0]];
        let (g, side) = unclip_rect(&q, 1.5).unwrap();
        let d = 100.0 * 20.0 * 1.5 / 240.0; // 12.5
        assert!((g[0][0] + d).abs() < 1e-6 && (g[0][1] + d).abs() < 1e-6, "{g:?}");
        assert!((g[2][0] - 100.0 - d).abs() < 1e-6 && (g[2][1] - 20.0 - d).abs() < 1e-6, "{g:?}");
        assert!((side - (20.0 + 2.0 * d)).abs() < 1e-6);
    }
    #[test]
    fn clipper_offset_matches_pyclipper() {
        let cases: serde_json::Value = serde_json::from_str(include_str!("../tests/fixtures/clipper.json")).unwrap();
        for c in cases.as_array().unwrap() {
            let b = c["box"].as_array().unwrap();
            let p = |i: usize| [b[i][0].as_f64().unwrap(), b[i][1].as_f64().unwrap()];
            let q: Quad = [p(0), p(1), p(2), p(3)];
            let got = clipper_offset_round(&q, c["d"].as_f64().unwrap());
            let want: Vec<[i32; 2]> = c["points"].as_array().unwrap().iter()
                .map(|v| [v[0].as_i64().unwrap() as i32, v[1].as_i64().unwrap() as i32]).collect();
            for w in &want {
                assert!(got.contains(w), "missing {w:?} in {got:?}");
            }
            let (rect, side) = min_area_rect(&got);
            assert!((side - c["rect_side"].as_f64().unwrap()).abs() < 0.1);
            let r = c["rect"].as_array().unwrap();
            let mut want_r: Vec<[f64; 2]> = (0..4).map(|i| [r[i][0].as_f64().unwrap(), r[i][1].as_f64().unwrap()]).collect();
            let mut got_r = rect.to_vec();
            let key = |a: &[f64; 2], b: &[f64; 2]| (a[0] + a[1] * 1e4).partial_cmp(&(b[0] + b[1] * 1e4)).unwrap();
            want_r.sort_by(key);
            got_r.sort_by(key);
            // cv2 runs its calipers in float32, so a tilted rect's corners differ by a few hundredths
            for (g, w) in got_r.iter().zip(&want_r) {
                assert!((g[0] - w[0]).abs() < 0.1 && (g[1] - w[1]).abs() < 0.1, "{got_r:?} vs {want_r:?}");
            }
        }
    }
}

