//! Platform-neutral vertical image stitching for scrolling capture.
//!
//! As the user scrolls a target app, capz samples the same on-screen region
//! repeatedly. Each new frame overlaps the previous one — scrolling **down** by
//! `s` pixels means the content at row `y` in the old frame sits at row `y - s`
//! in the new frame, and the bottom `s` rows are freshly revealed content. This
//! module finds `s` by correlating row fingerprints over an overlap band, then
//! appends only the new rows onto a growing accumulator image. macOS and Windows
//! share this code verbatim — the input is always an `RgbaImage` from
//! `capture_service::capture_region`.
//!
//! Robustness choices (see the ticket "Scrolling capture (long page)"):
//! - **Top/bottom band exclusion**: a fixed toolbar/header pinned to the top (or
//!   a footer at the bottom) does not move as the user scrolls, so it would bias
//!   the match toward `s = 0`. We ignore `exclude` rows at the top and bottom of
//!   each frame during matching so the moving middle content drives alignment.
//! - **De-dup**: an unchanged frame (user paused) is dropped — no scroll, no
//!   append.
//! - **Low-confidence fallback**: if no overlap scores below the confidence
//!   threshold (e.g. the user flung past a full viewport, or lazy content
//!   repainted), we butt-join the whole frame and flag a soft warning rather
//!   than aborting the capture.

use image::RgbaImage;

/// Number of grayscale samples taken across each row to form its fingerprint.
/// Coarse enough to keep the O(h²) offset search fast, fine enough to align real
/// page content.
const ROW_SAMPLES: u32 = 48;

/// Stride (in rows) between reference rows compared during the offset search.
/// Comparing every 2nd row halves the work with negligible accuracy loss.
const ROW_STEP: u32 = 2;

/// Require the overlap between consecutive frames to be at least `height /
/// MIN_OVERLAP_DIV` rows. Prevents matching a thin sliver of coincidentally
/// similar pixels when the true scroll exceeded one viewport.
const MIN_OVERLAP_DIV: u32 = 8;

/// Mean per-sample absolute grayscale difference (0–255) at or below which an
/// offset is accepted as a confident match. Exact viewport slices score 0; real
/// captures carry a little anti-alias/compression noise, so this is generous.
const CONFIDENT_MEAN_ABS_DIFF: f32 = 12.0;

/// Outcome of appending one sampled frame onto the accumulator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StitchOutcome {
    /// Rows of new content appended to the accumulator.
    pub appended: u32,
    /// The frame was identical to the previous one — nothing was appended.
    pub duplicate: bool,
    /// No confident overlap was found; the frame was butt-joined whole.
    pub low_confidence: bool,
}

/// Per-row grayscale fingerprint for a frame: `height * ROW_SAMPLES` bytes, row
/// `y` occupying `[y * ROW_SAMPLES, (y + 1) * ROW_SAMPLES)`.
struct Fingerprint {
    height: u32,
    rows: Vec<u8>,
}

impl Fingerprint {
    fn new(img: &RgbaImage) -> Self {
        let (w, h) = img.dimensions();
        let mut rows = Vec::with_capacity((h * ROW_SAMPLES) as usize);
        // Sample ROW_SAMPLES columns evenly across the width. `w` is always >= 1
        // for a real capture; guard the degenerate 0/1 case anyway.
        let denom = (ROW_SAMPLES - 1).max(1);
        let cols: Vec<u32> = (0..ROW_SAMPLES)
            .map(|i| if w <= 1 { 0 } else { i * (w - 1) / denom })
            .collect();
        for y in 0..h {
            for &x in &cols {
                let p = img.get_pixel(x, y).0;
                // Rec. 601 luma; integer weights sum to 256 → shift by 8.
                let luma = (77 * p[0] as u32 + 150 * p[1] as u32 + 29 * p[2] as u32) >> 8;
                rows.push(luma as u8);
            }
        }
        Fingerprint { height: h, rows }
    }

    #[inline]
    fn row(&self, y: u32) -> &[u8] {
        let start = (y * ROW_SAMPLES) as usize;
        &self.rows[start..start + ROW_SAMPLES as usize]
    }
}

#[inline]
fn row_abs_diff(a: &[u8], b: &[u8]) -> u32 {
    a.iter()
        .zip(b.iter())
        .map(|(&x, &y)| (x as i32 - y as i32).unsigned_abs())
        .sum()
}

/// Search for the vertical scroll offset `s` (in rows, >= 1) that best aligns
/// `next` onto `prev`: `next[a]` ≈ `prev[a + s]`. Returns `(s, mean_abs_diff)`
/// for the best candidate, or `None` if no valid offset exists (frame too
/// short). `mean_abs_diff` is per grayscale sample, so it is directly
/// comparable to `CONFIDENT_MEAN_ABS_DIFF`.
fn best_offset(prev: &Fingerprint, next: &Fingerprint, exclude: u32) -> Option<(u32, f32)> {
    let h = prev.height.min(next.height);
    if h == 0 {
        return None;
    }
    let min_overlap = (h / MIN_OVERLAP_DIV).max(1);
    // Largest offset that still leaves `min_overlap` overlapping rows.
    let max_s = h.saturating_sub(min_overlap);
    if max_s < 1 {
        return None;
    }
    // Compare over the frame's stable middle: rows [exclude, h - exclude).
    let lo = exclude.min(h);
    let hi = h.saturating_sub(exclude).max(lo);

    let mut best: Option<(u32, f32)> = None;
    for s in 1..=max_s {
        // Overlapping rows in `next` coords: a and a+s must both be in-frame,
        // and a within the stable band.
        let a_start = lo;
        let a_end = hi.min(h - s);
        if a_end <= a_start {
            continue;
        }
        let mut total: u64 = 0;
        let mut count: u32 = 0;
        let mut a = a_start;
        while a < a_end {
            total += row_abs_diff(next.row(a), prev.row(a + s)) as u64;
            count += 1;
            a += ROW_STEP;
        }
        if count == 0 {
            continue;
        }
        let mean = total as f32 / (count as f32 * ROW_SAMPLES as f32);
        if best.map(|(_, bm)| mean < bm).unwrap_or(true) {
            best = Some((s, mean));
        }
    }
    best
}

/// Append the bottom `rows` rows of `src` onto `acc` (which must share `src`'s
/// width). Grows `acc` by `rows` rows. Reuses the accumulator's backing buffer
/// (`into_raw` → `extend` → `from_raw`) so repeated appends amortize instead of
/// re-copying the whole growing image each frame.
fn append_bottom_rows(acc: &mut RgbaImage, src: &RgbaImage, rows: u32) {
    if rows == 0 {
        return;
    }
    let (w, sh) = src.dimensions();
    let rows = rows.min(sh);
    let row_bytes = (w * 4) as usize;
    let src_start = (sh - rows) as usize * row_bytes;
    let add = &src.as_raw()[src_start..src_start + rows as usize * row_bytes];

    let ah = acc.height();
    let old = std::mem::replace(acc, RgbaImage::new(0, 0));
    let mut buf = old.into_raw();
    buf.extend_from_slice(add);
    *acc = RgbaImage::from_raw(w, ah + rows, buf).expect("stitch buffer size invariant");
}

/// Vertically stitch `next` onto `acc`, using `prev` (the previously appended
/// frame, whose full content forms the tail of `acc`) as the alignment
/// reference. Only the newly revealed rows are appended.
///
/// `exclude` rows at the top and bottom of each frame are ignored during
/// matching so sticky headers/footers don't dominate the correlation. Pass `0`
/// to disable band exclusion.
///
/// Preconditions: `acc`, `prev`, and `next` all share the same width, and
/// `prev`/`next` share the same height (they are captures of the same fixed
/// region).
pub fn append_frame(
    acc: &mut RgbaImage,
    prev: &RgbaImage,
    next: &RgbaImage,
    exclude: u32,
) -> StitchOutcome {
    // De-dup: identical raw buffers → the user didn't scroll.
    if prev.as_raw() == next.as_raw() {
        return StitchOutcome {
            appended: 0,
            duplicate: true,
            low_confidence: false,
        };
    }

    let prev_fp = Fingerprint::new(prev);
    let next_fp = Fingerprint::new(next);

    match best_offset(&prev_fp, &next_fp, exclude) {
        Some((s, mean)) if mean <= CONFIDENT_MEAN_ABS_DIFF => {
            append_bottom_rows(acc, next, s);
            StitchOutcome {
                appended: s,
                duplicate: false,
                low_confidence: false,
            }
        }
        _ => {
            // No confident overlap — butt-join the whole frame and warn. May
            // duplicate a little content at the seam, but never drops any.
            let h = next.height();
            append_bottom_rows(acc, next, h);
            StitchOutcome {
                appended: h,
                duplicate: false,
                low_confidence: true,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    /// Build a deterministic, vertically-varied tall test image. Each row has a
    /// distinct color pattern so alignment is unambiguous.
    fn tall_image(w: u32, h: u32) -> RgbaImage {
        let mut img = RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let r = ((y * 7 + x * 3) % 256) as u8;
                let g = ((y * 13 + 40) % 256) as u8;
                let b = ((x * 5 + y) % 256) as u8;
                img.put_pixel(x, y, Rgba([r, g, b, 255]));
            }
        }
        img
    }

    /// Extract a viewport slice [top, top+vh) from a tall image.
    fn viewport(src: &RgbaImage, top: u32, vh: u32) -> RgbaImage {
        let w = src.width();
        let mut out = RgbaImage::new(w, vh);
        for y in 0..vh {
            for x in 0..w {
                out.put_pixel(x, y, *src.get_pixel(x, top + y));
            }
        }
        out
    }

    #[test]
    fn reconstructs_tall_image_from_overlapping_slices() {
        let w = 120;
        let full_h = 900;
        let vh = 300; // viewport height
        let step = 90; // scroll step per sample (overlap = vh - step = 210)
        let full = tall_image(w, full_h);

        let first = viewport(&full, 0, vh);
        let mut acc = first.clone();
        let mut prev = first;

        let mut top = step;
        while top + vh <= full_h {
            let next = viewport(&full, top, vh);
            let out = append_frame(&mut acc, &prev, &next, 0);
            assert!(!out.duplicate, "distinct slice flagged as duplicate at top={top}");
            assert!(!out.low_confidence, "lost alignment at top={top}");
            assert_eq!(out.appended, step, "wrong append count at top={top}");
            prev = next;
            top += step;
        }

        // Accumulator should equal the covered span of the original, pixel-exact.
        let covered = top - step + vh;
        assert_eq!(acc.height(), covered);
        for y in 0..covered {
            for x in 0..w {
                assert_eq!(
                    acc.get_pixel(x, y),
                    full.get_pixel(x, y),
                    "pixel mismatch at ({x},{y})"
                );
            }
        }
    }

    #[test]
    fn identical_frame_is_deduped() {
        let f = tall_image(80, 200);
        let mut acc = f.clone();
        let out = append_frame(&mut acc, &f, &f.clone(), 0);
        assert!(out.duplicate);
        assert_eq!(out.appended, 0);
        assert_eq!(acc.height(), 200, "dedup must not grow the accumulator");
    }

    #[test]
    fn single_row_scroll_is_detected() {
        let full = tall_image(64, 400);
        let vh = 200;
        let first = viewport(&full, 0, vh);
        let next = viewport(&full, 1, vh);
        let mut acc = first.clone();
        let out = append_frame(&mut acc, &first, &next, 0);
        assert!(!out.low_confidence);
        assert_eq!(out.appended, 1);
        assert_eq!(acc.height(), vh + 1);
    }

    #[test]
    fn sticky_header_does_not_pin_offset_to_zero() {
        // Simulate a fixed header: the top `hdr` rows are identical in every
        // frame regardless of scroll. Without band exclusion this biases the
        // match toward s=0; with exclusion the moving body wins.
        let w = 100;
        let full_h = 800;
        let vh = 300;
        let hdr = 40;
        let step = 80;
        let full = tall_image(w, full_h);

        let header = viewport(&full, 0, hdr); // frozen top band

        let framed = |top: u32| -> RgbaImage {
            let mut f = viewport(&full, top, vh);
            // Paste the frozen header over the top hdr rows.
            for y in 0..hdr {
                for x in 0..w {
                    f.put_pixel(x, y, *header.get_pixel(x, y));
                }
            }
            f
        };

        let first = framed(0);
        let mut acc = first.clone();
        let prev = first;
        let next = framed(step);
        let out = append_frame(&mut acc, &prev, &next, hdr + 4);
        assert!(!out.low_confidence, "band exclusion should keep alignment confident");
        assert_eq!(out.appended, step, "expected body scroll offset, not header-pinned 0");
    }

    #[test]
    fn oversized_jump_falls_back_to_butt_join() {
        // Two unrelated frames with no real overlap → low confidence, whole
        // frame appended, nothing dropped.
        let a = tall_image(64, 200);
        let mut b = tall_image(64, 200);
        // Shift b's content so it does not overlap a within the search range.
        for y in 0..200 {
            for x in 0..64 {
                b.put_pixel(x, y, Rgba([(255 - (y % 256)) as u8, (x * 2 % 256) as u8, 7, 255]));
            }
        }
        let mut acc = a.clone();
        let out = append_frame(&mut acc, &a, &b, 0);
        assert!(out.low_confidence);
        assert_eq!(out.appended, 200);
        assert_eq!(acc.height(), 400);
    }
}
