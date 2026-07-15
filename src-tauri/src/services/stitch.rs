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
//! **Direction — appends downward, tolerates upward.** [`best_offset`] searches
//! positive offsets (`s >= 1`), i.e. new content revealed at the *bottom*, and
//! only those newly-revealed rows are ever appended. Scrolling back *up* reveals
//! content at the top that was already captured on the way down; [`measure_frame`]
//! recognizes such a frame via [`best_up_offset`] (a confident *negative* offset)
//! and ignores it — appending nothing and keeping `prev` at the bottom-most
//! position — so a down → up → down excursion produces no duplicated band and no
//! spurious seam warning. What remains out of scope for v1 is *prepending* content
//! revealed by scrolling above the capture's start point; an upward frame is
//! dropped, not stitched onto the top.
//!
//! Robustness choices (see the ticket "Scrolling capture (long page)"):
//! - **Top/bottom band exclusion**: a fixed toolbar/header pinned to the top (or
//!   a footer at the bottom) does not move as the user scrolls, so it would bias
//!   the match toward `s = 0`. We ignore `exclude` rows at the top and bottom of
//!   each frame during matching so the moving middle content drives alignment.
//! - **De-dup**: a paused frame is dropped — no scroll, no append. This covers
//!   both byte-identical frames and *near*-static ones, where only dynamic noise
//!   (a blinking caret, an animated cursor) changed: such a frame aligns best
//!   with no movement, so any positive offset that fails to beat the stationary
//!   baseline (see [`MIN_SCROLL_IMPROVEMENT`]) is treated as a duplicate rather
//!   than a bogus 1px scroll.
//! - **Plausible-overlap tier**: the strict confidence gate
//!   ([`CONFIDENT_MEAN_ABS_DIFF`]) is tuned for near-exact viewport slices. Real
//!   captures of sharp text at fractional-DPI scroll positions align correctly
//!   yet still score above it (a 1px subpixel edge flips black↔white). Such
//!   frames used to fall straight into the whole-frame butt-join below, which
//!   duplicates `height - s` rows of already-captured overlap at every seam (the
//!   "not fine cut" bug). Instead, if the best offset clearly beats the
//!   stationary baseline and stays under a looser [`PLAUSIBLE_MEAN_ABS_DIFF`]
//!   bound, we trust it and append only its `s` newly-revealed rows (flagged
//!   low-confidence so the HUD still surfaces a soft seam warning).
//! - **Low-confidence fallback**: only when *no* offset is even plausible (e.g.
//!   the user flung past a full viewport, or lazy content repainted) do we
//!   butt-join the whole frame and flag a soft warning rather than aborting the
//!   capture.

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

/// A candidate downward scroll is trusted only when its alignment beats the
/// zero-offset (no-scroll) alignment by at least this many grayscale levels of
/// mean absolute difference. Without this margin, a paused frame carrying tiny
/// dynamic noise — a blinking caret, an animated cursor, a hover repaint — would
/// masquerade as a confident ~1px scroll: [`best_offset`] only searches `s >= 1`,
/// so it never scores the true "no movement" alignment, and over flat page
/// regions *any* offset aligns cheaply. Requiring a real improvement over the
/// stationary baseline keeps paused frames from appending bogus rows every sample.
const MIN_SCROLL_IMPROVEMENT: f32 = 2.0;

/// Looser upper bound than [`CONFIDENT_MEAN_ABS_DIFF`] for accepting an overlap.
/// Real captures of sharp text at fractional-DPI scroll positions align
/// correctly yet score well above the strict confident threshold (subpixel/AA
/// edges flip black↔white as the row grid shifts). As long as the best offset
/// clearly beats the stationary baseline (by [`MIN_SCROLL_IMPROVEMENT`]) and its
/// mean stays at or below this value, we trust it and append only the newly
/// revealed rows — far better than butt-joining the whole frame, which
/// duplicates a full viewport of overlap at the seam. Genuinely non-overlapping
/// frames (a fling past a full viewport) score above this, so they still take
/// the butt-join fallback.
const PLAUSIBLE_MEAN_ABS_DIFF: f32 = 40.0;

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

/// Mean per-sample absolute grayscale difference when `next` is shifted against
/// `prev` by the **signed** row offset `s` — `next[a]` vs `prev[a + s]` — over
/// the stable band `[lo, hi)`. A positive `s` models downward scrolling (new
/// content revealed at the bottom); a negative `s` models an upward scroll
/// (content re-appearing at the top, already captured on the way down). `None` if
/// no overlapping rows fall inside the band (offset too large for the frame).
/// Comparable to `CONFIDENT_MEAN_ABS_DIFF`; `s = 0` gives the stationary
/// "no-scroll" baseline.
fn offset_mean(prev: &Fingerprint, next: &Fingerprint, s: i32, lo: u32, hi: u32, h: u32) -> Option<f32> {
    // Overlapping rows in `next` coords: both `a` and `a + s` must be in-frame
    // ([0, h)) and `a` inside the stable band. For s >= 0 the binding limit is
    // `a + s < h`; for s < 0 it is `a + s >= 0`, i.e. `a >= -s`.
    let a_start = lo.max((-s).max(0) as u32);
    let a_end = hi.min((h as i32 - s).clamp(0, h as i32) as u32);
    if a_end <= a_start {
        return None;
    }
    let mut total: u64 = 0;
    let mut count: u32 = 0;
    let mut a = a_start;
    while a < a_end {
        total += row_abs_diff(next.row(a), prev.row((a as i32 + s) as u32)) as u64;
        count += 1;
        a += ROW_STEP;
    }
    if count == 0 {
        return None;
    }
    Some(total as f32 / (count as f32 * ROW_SAMPLES as f32))
}

/// Search for the scroll offset of magnitude `s` (rows, >= 1) in direction `dir`
/// (+1 downward, -1 upward) that best aligns `next` onto `prev`: `next[a]` ≈
/// `prev[a + dir*s]`. Returns `(s, mean_abs_diff, zero_mean)` for the best
/// candidate, where `zero_mean` is the stationary `s = 0` alignment score over
/// the same band — the caller compares the two to tell a genuine scroll from a
/// paused frame (see [`MIN_SCROLL_IMPROVEMENT`]). `None` if no valid offset
/// exists (frame too short, or the exclusion band leaves nothing to compare).
/// `mean_abs_diff` is per grayscale sample, so it is directly comparable to
/// `CONFIDENT_MEAN_ABS_DIFF`.
fn best_offset_dir(prev: &Fingerprint, next: &Fingerprint, exclude: u32, dir: i32) -> Option<(u32, f32, f32)> {
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

    // Stationary baseline: how well the frames align with no scroll at all.
    let zero_mean = offset_mean(prev, next, 0, lo, hi, h)?;

    let mut best: Option<(u32, f32)> = None;
    for s in 1..=max_s {
        let Some(mean) = offset_mean(prev, next, dir * s as i32, lo, hi, h) else {
            continue;
        };
        if best.map(|(_, bm)| mean < bm).unwrap_or(true) {
            best = Some((s, mean));
        }
    }
    best.map(|(s, mean)| (s, mean, zero_mean))
}

/// Best **downward** scroll offset — content revealed at the bottom. This is the
/// alignment the stitcher actually appends. See [`best_offset_dir`].
fn best_offset(prev: &Fingerprint, next: &Fingerprint, exclude: u32) -> Option<(u32, f32, f32)> {
    best_offset_dir(prev, next, exclude, 1)
}

/// Best **upward** scroll offset. A confident/plausible match here means the
/// user scrolled back up and the frame is re-showing rows already captured on the
/// way down. Used only to recognize such frames so [`measure_frame`] can ignore
/// them instead of butt-joining and duplicating their content — the stitcher
/// still appends only genuinely-new downward content. See the module doc.
fn best_up_offset(prev: &Fingerprint, next: &Fingerprint, exclude: u32) -> Option<(u32, f32, f32)> {
    best_offset_dir(prev, next, exclude, -1)
}

/// Mean per-sample grayscale difference at or below which a bottom row is
/// considered unchanged between two consecutive frames. The fixed footer /
/// window border is captured from the same on-screen pixels each frame, so it is
/// near-identical; a small tolerance absorbs any AA/animation noise.
const STATIC_ROW_MAX_DIFF: f32 = 6.0;

/// Count the contiguous run of bottom rows that stay (near-)identical between two
/// consecutive frames of a fixed scroll region, scanning upward from the last
/// row — the height of the **static bottom band** (window chrome, an app
/// footer/toolbar, or the window's bottom border that never scrolls). Returns 0
/// if the frames differ in size or the very bottom row already changed.
///
/// The sampler locks this on the **first genuine scroll** (clamped to a fraction
/// of the frame) as the fixed-footer height and excludes it from every stitch —
/// see `commands::scroll`. Over-detection (e.g. uniform whitespace at the
/// viewport bottom read as static) is self-correcting: content wrongly excluded
/// is re-revealed above the true chrome in the next frame and appended then, and
/// the final frame's band is re-attached whole at finish, so no content is
/// dropped while the scroll step exceeds the over-count. `finish_open`'s
/// duplicate-band trim is a further backstop.
pub fn static_bottom_rows(a: &RgbaImage, b: &RgbaImage) -> u32 {
    let (aw, ah) = a.dimensions();
    if (aw, ah) != b.dimensions() || ah == 0 {
        return 0;
    }
    let fa = Fingerprint::new(a);
    let fb = Fingerprint::new(b);
    let mut count = 0u32;
    let mut y = ah;
    while y > 0 {
        y -= 1;
        let mean = row_abs_diff(fa.row(y), fb.row(y)) as f32 / ROW_SAMPLES as f32;
        if mean > STATIC_ROW_MAX_DIFF {
            break;
        }
        count += 1;
    }
    count
}

/// Smallest trailing band (rows) considered for the duplicate-trim below.
const MIN_DUP_BAND: u32 = 16;

/// Largest trailing band the duplicate-trim will remove. Window chrome / a
/// rounded bottom edge is small; capping the search well under a full capture
/// keeps a coincidental large-band match from ever eating real content. Also
/// bounded by half the image height at the call site.
const MAX_DUP_BAND: u32 = 600;

/// Mean per-sample grayscale difference at or below which a trailing band is
/// accepted as a duplicate of the band directly above it (same units as
/// [`CONFIDENT_MEAN_ABS_DIFF`]). Tuned conservatively: a real doubled chrome
/// band scores near-zero, while a genuine (non-repeating) tail scores well
/// above this, so clean captures are never trimmed.
const DUP_MEAN_ABS_DIFF: f32 = 10.0;

/// Minimum vertical spread of row brightness (0–255) required in the trailing
/// region before we trust a duplicate match. A near-uniform tail (flat
/// whitespace, a solid footer color) "duplicates" trivially at every band
/// height; trimming it would cut legitimate blank space, so we skip it.
const MIN_STRUCTURE_SPREAD: f32 = 8.0;

/// Mean per-sample grayscale value of a fingerprint row.
fn row_mean(fp: &Fingerprint, y: u32) -> f32 {
    fp.row(y).iter().map(|&v| v as u32).sum::<u32>() as f32 / ROW_SAMPLES as f32
}

/// True if rows in `[lo, hi)` carry real vertical variation (max − min row
/// brightness ≥ [`MIN_STRUCTURE_SPREAD`]) rather than being a flat band.
fn region_has_structure(fp: &Fingerprint, lo: u32, hi: u32) -> bool {
    let mut min = f32::MAX;
    let mut max = f32::MIN;
    let mut y = lo;
    while y < hi {
        let m = row_mean(fp, y);
        min = min.min(m);
        max = max.max(m);
        y += ROW_STEP;
    }
    max - min >= MIN_STRUCTURE_SPREAD
}

/// Mean per-sample grayscale difference between the trailing band `[h-b, h)` and
/// the band directly above it `[h-2b, h)`, comparing row `h-2b+i` to `h-b+i`.
/// Requires `2 * b <= h`.
fn trailing_band_diff(fp: &Fingerprint, h: u32, b: u32) -> f32 {
    let mut total: u64 = 0;
    let mut count: u32 = 0;
    let mut i = 0;
    while i < b {
        total += row_abs_diff(fp.row(h - 2 * b + i), fp.row(h - b + i)) as u64;
        count += 1;
        i += ROW_STEP;
    }
    if count == 0 {
        return f32::MAX;
    }
    total as f32 / (count as f32 * ROW_SAMPLES as f32)
}

/// Truncate `acc` by removing its bottom `rows` rows in place. No-op if `rows`
/// is 0 or would empty the image. Reuses the backing buffer.
pub fn trim_bottom_rows(acc: &mut RgbaImage, rows: u32) {
    let (w, h) = acc.dimensions();
    if rows == 0 || rows >= h {
        return;
    }
    let new_h = h - rows;
    let keep = w as usize * new_h as usize * 4;
    let old = std::mem::replace(acc, RgbaImage::new(0, 0));
    let mut buf = old.into_raw();
    buf.truncate(keep);
    *acc = RgbaImage::from_raw(w, new_h, buf).expect("trim buffer size invariant");
}

/// Detect and trim a duplicated trailing band from a finished auto-scroll
/// accumulator, returning the number of rows removed.
///
/// When a scrolling capture reaches the page bottom, the selected region's
/// bottom edge often overlaps fixed window chrome (footer / toolbar) or the
/// rounded window bottom edge. Because [`append_frame`] appends the *literal
/// bottom rows* of the final frame(s), that static band ends up duplicated at
/// the very bottom of the output (observed: the last ~96 rows a near-exact copy
/// of the 96 above them). This finds the largest trailing band whose rows
/// duplicate the band directly above it (mean diff ≤ [`DUP_MEAN_ABS_DIFF`]) and
/// removes it.
///
/// Conservative by construction — it returns 0 (no trim) unless a clear
/// duplicate is present, skips a near-uniform band (see [`region_has_structure`]
/// so flat whitespace is never cut), and bounds the band to at most
/// [`MAX_DUP_BAND`] / half the image, so it can never eat the whole capture.
pub fn trim_trailing_duplicate(acc: &mut RgbaImage) -> u32 {
    let (w, h) = acc.dimensions();
    if w == 0 || h < 2 * MIN_DUP_BAND {
        return 0;
    }
    let max_b = (h / 2).min(MAX_DUP_BAND);
    if max_b < MIN_DUP_BAND {
        return 0;
    }

    let fp = Fingerprint::new(acc);

    // Choose the LARGEST band that both aligns with the band above it (mean diff
    // within tolerance) and carries real vertical structure. Largest — not
    // lowest-mean — so a noisy doubled chrome band is removed whole rather than
    // leaving the part above a more-exactly-matching suffix. The per-band
    // structure check (on `[h-b, h)`, the band actually being removed) is what
    // stops a flat blank tail from being cut even when varied content sits
    // above it.
    let mut chosen: Option<u32> = None;
    for b in MIN_DUP_BAND..=max_b {
        if trailing_band_diff(&fp, h, b) <= DUP_MEAN_ABS_DIFF
            && region_has_structure(&fp, h - b, h)
        {
            chosen = Some(b);
        }
    }

    match chosen {
        Some(b) => {
            trim_bottom_rows(acc, b);
            b
        }
        None => 0,
    }
}

/// Append the bottom `rows` rows of `src` onto `acc` (which must share `src`'s
/// width). Grows `acc` by `rows` rows. Reuses the accumulator's backing buffer
/// (`into_raw` → `extend` → `from_raw`) so repeated appends amortize instead of
/// re-copying the whole growing image each frame.
/// Append the `rows` genuinely-new content rows of `src` onto `acc`, taken from
/// just ABOVE the fixed bottom band: `src[sh-footer-rows, sh-footer)`. The
/// `footer` fixed rows (window chrome / scrollbar / bottom border that never
/// scrolls) are skipped so they are never welded into a seam. Returns the number
/// of rows actually appended (clamped to the available content height). Reuses
/// the accumulator buffer (into_raw → extend → from_raw).
///
/// `footer = 0` reproduces the original bottom-rows behavior exactly:
/// `src[sh-rows, sh)`.
fn append_content_rows(acc: &mut RgbaImage, src: &RgbaImage, rows: u32, footer: u32) -> u32 {
    let (w, sh) = src.dimensions();
    let footer = footer.min(sh);
    let content_h = sh - footer; // rows above the fixed band
    let rows = rows.min(content_h);
    if rows == 0 {
        return 0;
    }
    let row_bytes = (w * 4) as usize;
    // Source region: [content_h - rows, content_h) == [sh-footer-rows, sh-footer).
    let src_start = (content_h - rows) as usize * row_bytes;
    let add = &src.as_raw()[src_start..src_start + rows as usize * row_bytes];

    let ah = acc.height();
    let old = std::mem::replace(acc, RgbaImage::new(0, 0));
    let mut buf = old.into_raw();
    buf.extend_from_slice(add);
    *acc = RgbaImage::from_raw(w, ah + rows, buf).expect("stitch buffer size invariant");
    rows
}

/// Append `src`'s bottom `footer` rows — the fixed window bottom edge — onto
/// `acc`. The footer is excluded from every stitch so it is never welded into a
/// seam; this re-attaches it **once** at the very end so a finished capture
/// terminates at the natural window edge instead of a hard mid-content cut.
/// No-op when `footer` is 0. `acc` must share `src`'s width.
pub fn append_footer_band(acc: &mut RgbaImage, src: &RgbaImage, footer: u32) {
    // `append_content_rows(.., rows=footer, footer=0)` copies src[sh-footer, sh).
    append_content_rows(acc, src, footer, 0);
}

/// The stitcher's decision for one frame, independent of where it is applied.
/// Produced by [`measure_frame`] and consumed by [`apply_frame`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StitchDecision {
    /// Frame identical / paused — append nothing.
    Duplicate,
    /// Confident/plausible downward scroll of `s` rows. `low_confidence` marks
    /// the looser plausible tier (soft seam warning).
    Scroll { s: u32, low_confidence: bool },
    /// The user scrolled back *up*: the frame's content aligns as an upward
    /// offset, so it re-shows rows already captured on the way down. Append
    /// nothing and keep `prev` at the bottom-most position — when the user
    /// scrolls back down, matching resumes from there with no duplicated band.
    ScrollUp,
    /// No overlap found — butt-join the whole frame.
    ButtJoin,
}

/// Decide how `next` stitches onto `prev` **without mutating any accumulator**.
/// Same tiers as before; separated so the sampler can inspect the decision (and
/// establish the fixed-footer height) before choosing where to append.
pub fn measure_frame(prev: &RgbaImage, next: &RgbaImage, exclude: u32) -> StitchDecision {
    // De-dup: identical raw buffers → the user didn't scroll.
    if prev.as_raw() == next.as_raw() {
        return StitchDecision::Duplicate;
    }

    let prev_fp = Fingerprint::new(prev);
    let next_fp = Fingerprint::new(next);

    match best_offset(&prev_fp, &next_fp, exclude) {
        // Genuine downward scroll: confident overlap that also beats the
        // stationary baseline by a real margin (stops a paused frame with dynamic
        // noise from reading as a tiny scroll). A confident downward match always
        // wins over any upward alignment — this is what keeps periodic content,
        // whose true downward offset also aliases as an upward one, stitching in
        // the correct (down) direction.
        Some((s, mean, zero_mean))
            if mean <= CONFIDENT_MEAN_ABS_DIFF && zero_mean - mean >= MIN_SCROLL_IMPROVEMENT =>
        {
            StitchDecision::Scroll { s, low_confidence: false }
        }
        // Aligns well *without* moving — a paused frame with dynamic noise. Dup.
        Some((_, _, zero_mean)) if zero_mean <= CONFIDENT_MEAN_ABS_DIFF => {
            StitchDecision::Duplicate
        }
        // Downward is at best *plausible* (or found nothing). Before trusting a
        // weak downward offset — or butt-joining the whole frame — check whether
        // the user scrolled back *up*: a *negative* offset means the frame
        // re-shows rows already captured on the way down (CP-0008). A near-exact
        // upward match beats a spurious plausible downward one (e.g. a large
        // offset over a thin, flat overlap band), so an upward scroll is ignored
        // — append nothing, keep `prev` at the bottom-most position — instead of
        // appending garbage or a duplicated band. The upward match must itself
        // clear the plausible gate over its baseline AND beat the downward
        // candidate by a clear margin, so a genuine (noisy) downward scroll, whose
        // upward score is far worse, is never mistaken for an upward one.
        down => {
            let down_mean = down.map(|(_, m, _)| m).unwrap_or(f32::MAX);
            if let Some((_, up_mean, up_zero)) = best_up_offset(&prev_fp, &next_fp, exclude) {
                if up_mean <= PLAUSIBLE_MEAN_ABS_DIFF
                    && up_zero - up_mean >= MIN_SCROLL_IMPROVEMENT
                    && up_mean + MIN_SCROLL_IMPROVEMENT <= down_mean
                {
                    return StitchDecision::ScrollUp;
                }
            }
            match down {
                // Plausible downward scroll: the strict gate failed on capture
                // noise, but the best offset clearly beats the stationary baseline
                // and stays under the looser PLAUSIBLE bound. Trust its `s` rather
                // than butt-joining a whole frame.
                Some((s, mean, zero_mean))
                    if mean <= PLAUSIBLE_MEAN_ABS_DIFF
                        && zero_mean - mean >= MIN_SCROLL_IMPROVEMENT =>
                {
                    StitchDecision::Scroll { s, low_confidence: true }
                }
                // No plausible overlap in either direction (a fling past a full
                // viewport, or lazy content repainted) — butt-join.
                _ => StitchDecision::ButtJoin,
            }
        }
    }
}

/// Apply a [`StitchDecision`] to `acc`, appending only the genuinely-new content
/// rows and skipping the fixed bottom band of height `footer` (window chrome /
/// scrollbar / border that never scrolls, so it must not be welded into a seam).
/// `footer = 0` reproduces the original bottom-rows behavior exactly.
pub fn apply_frame(
    acc: &mut RgbaImage,
    next: &RgbaImage,
    decision: StitchDecision,
    footer: u32,
) -> StitchOutcome {
    let h = next.height();
    let footer = footer.min(h);
    match decision {
        // Paused frame, or an upward scroll re-showing already-captured rows:
        // append nothing. Reported as `duplicate` so the sampler keeps `prev` at
        // the bottom-most position and counts no progress / no seam warning.
        StitchDecision::Duplicate | StitchDecision::ScrollUp => StitchOutcome {
            appended: 0,
            duplicate: true,
            low_confidence: false,
        },
        StitchDecision::Scroll { s, low_confidence } => {
            let appended = append_content_rows(acc, next, s, footer);
            StitchOutcome {
                appended,
                duplicate: false,
                low_confidence,
            }
        }
        StitchDecision::ButtJoin => {
            // Whole frame minus the fixed footer band.
            let appended = append_content_rows(acc, next, h - footer, footer);
            StitchOutcome {
                appended,
                duplicate: false,
                low_confidence: true,
            }
        }
    }
}

/// Vertically stitch `next` onto `acc`, using `prev` as the alignment reference.
/// Backward-compatible entry point: measures then applies with **no** fixed
/// footer (`footer = 0`), i.e. appends the bottom rows exactly as before. The
/// scrolling sampler uses [`measure_frame`] + [`apply_frame`] directly so it can
/// exclude the fixed window footer — so outside of the test suite this wrapper
/// currently has no callers.
#[cfg_attr(not(test), allow(dead_code))]
pub fn append_frame(
    acc: &mut RgbaImage,
    prev: &RgbaImage,
    next: &RgbaImage,
    exclude: u32,
) -> StitchOutcome {
    let decision = measure_frame(prev, next, exclude);
    apply_frame(acc, next, decision, 0)
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
    fn paused_frame_with_minor_noise_is_not_appended() {
        // The user is NOT scrolling. The region is a mostly-flat page area (lots
        // of white) with a little static content and one tiny dynamic element —
        // a blinking text caret — that flips a handful of pixels between frames.
        // Byte-identical de-dup misses it, and because flat regions align at any
        // offset, a naive positive-only search reads it as a confident ~1px
        // scroll and grows the accumulator every sample. It must stay put.
        let w = 100;
        let h = 300;
        let mut prev = RgbaImage::from_pixel(w, h, Rgba([255, 255, 255, 255]));
        for y in 100..140 {
            for x in 10..90 {
                prev.put_pixel(x, y, Rgba([20, 20, 20, 255]));
            }
        }
        let mut next = prev.clone();
        // Blinking caret: a few dark pixels appear, no content moved.
        for y in 150..160 {
            next.put_pixel(50, y, Rgba([0, 0, 0, 255]));
        }
        let mut acc = prev.clone();
        let out = append_frame(&mut acc, &prev, &next, 0);
        assert!(out.duplicate, "paused near-static frame must be treated as duplicate");
        assert_eq!(out.appended, 0);
        assert_eq!(acc.height(), h, "must not grow while paused");
    }

    #[test]
    fn noisy_overlap_appends_only_new_rows() {
        // Regression for the "not fine cut" duplication. A correctly-aligned
        // frame that carries realistic capture noise (subpixel/AA jitter at a
        // fractional-DPI scroll position) scores *above* the strict
        // CONFIDENT_MEAN_ABS_DIFF gate. The old code dropped every such frame
        // into the whole-frame butt-join fallback, duplicating `vh - step` rows
        // of overlap at each seam. The PLAUSIBLE tier must instead append only
        // the `step` newly-revealed rows.
        let w = 120;
        let full_h = 900;
        let vh = 300;
        let step = 90;
        let amp: i32 = 40;
        let full = tall_image(w, full_h);

        let prev = viewport(&full, 0, vh);
        let mut next = viewport(&full, step, vh);
        // Deterministic per-pixel jitter. Chosen so the aligned mean lands in the
        // (CONFIDENT, PLAUSIBLE) gap (~19 grayscale levels) — a real scroll the
        // strict gate rejects but the plausible tier accepts.
        for y in 0..vh {
            for x in 0..w {
                let n = ((x as i32 * 31 + y as i32 * 17) % (2 * amp + 1)) - amp;
                let p = next.get_pixel(x, y).0;
                let c = |v: u8| (v as i32 + n).clamp(0, 255) as u8;
                next.put_pixel(x, y, Rgba([c(p[0]), c(p[1]), c(p[2]), 255]));
            }
        }

        let mut acc = prev.clone();
        let out = append_frame(&mut acc, &prev, &next, 0);
        assert!(!out.duplicate, "a real (noisy) scroll must not be deduped");
        assert_eq!(
            out.appended, step,
            "must append only the newly-revealed rows, not butt-join the whole frame"
        );
        assert!(
            out.low_confidence,
            "a noisy accepted seam should still flag a soft warning"
        );
        assert_eq!(acc.height(), vh + step, "accumulator grows by exactly the scroll");
    }

    #[test]
    fn upward_scroll_is_ignored_and_downward_resumes_cleanly() {
        // CP-0008: the user scrolls down, back up (re-showing captured rows),
        // then down again. Upward frames must be recognized and IGNORED — no
        // duplicated band, no seam warning — and the final image must be
        // pixel-identical to a pure down-only capture over the same span.
        //
        // Content is the aperiodic `vnoise_image` (each row a distinct hashed
        // gray), NOT the mod-256-periodic `tall_image`: real screen content has no
        // 256px period, whereas periodic content makes up-vs-down genuinely
        // ambiguous (a downward offset aliases onto the upward one) — a case no
        // stitcher can resolve and not what this fix targets.
        let w = 120;
        let full_h = 1200;
        let vh = 300;
        let step = 90;
        let full = vnoise_image(w, full_h);
        let frame_at = |o: u32| viewport(&full, o, vh);

        // Reference: a clean down-only capture through offsets 0, 90, 180, 270.
        let down_only = {
            let mut acc = frame_at(0);
            let mut prev = frame_at(0);
            for &o in &[step, 2 * step, 3 * step] {
                let next = frame_at(o);
                append_frame(&mut acc, &prev, &next, 0);
                prev = next;
            }
            acc
        };

        // The excursion: down to 180, back up through 90 and 0, then down again
        // through 90, 180 (already seen) and on to 270 (genuinely new).
        let sequence = [90u32, 180, 90, 0, 90, 180, 270];
        let mut acc = frame_at(0);
        let mut prev = frame_at(0);
        let mut prev_o = 0u32;
        for &o in &sequence {
            let next = frame_at(o);
            let out = append_frame(&mut acc, &prev, &next, 0);
            if o < prev_o {
                // Upward frame: ignored, so nothing appended and no warning.
                assert!(out.duplicate, "upward frame {o} (from {prev_o}) must be ignored");
                assert_eq!(out.appended, 0, "upward frame {o} must append nothing");
                assert!(!out.low_confidence, "upward frame {o} must not flag a seam");
            }
            // `prev` only advances on a real (appended) downward frame — an
            // ignored upward frame keeps the bottom-most anchor.
            if !out.duplicate {
                prev = next;
                prev_o = o;
            }
        }

        // No duplicated band: the excursion result equals the clean down-only one.
        assert_eq!(
            acc.height(),
            down_only.height(),
            "up-then-down must not duplicate any rows"
        );
        for y in 0..acc.height() {
            for x in 0..w {
                assert_eq!(
                    acc.get_pixel(x, y),
                    down_only.get_pixel(x, y),
                    "pixel mismatch vs clean down-only capture at ({x},{y})"
                );
            }
        }
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

    /// Row-constant pseudo-random brightness: each row is one well-mixed gray, so
    /// the image has strong vertical structure but no periodicity or gradient —
    /// like real UI content, only an *exact* duplicate band aligns (a smooth
    /// gradient would also loosely match nearby band heights).
    fn vnoise_image(w: u32, h: u32) -> RgbaImage {
        let mut img = RgbaImage::new(w, h);
        for y in 0..h {
            let mut v = y.wrapping_add(1).wrapping_mul(2_654_435_761);
            v ^= v >> 15;
            v = v.wrapping_mul(2_246_822_519);
            v ^= v >> 13;
            let g = (v & 0xff) as u8;
            for x in 0..w {
                img.put_pixel(x, y, Rgba([g, g, g, 255]));
            }
        }
        img
    }

    /// Copy the bottom `band` rows of `src` and append them, simulating the
    /// auto-scroll artifact where fixed bottom chrome gets duplicated at the end.
    fn append_duplicate_tail(src: &RgbaImage, band: u32) -> RgbaImage {
        let (w, h) = src.dimensions();
        let mut out = RgbaImage::new(w, h + band);
        for y in 0..h {
            for x in 0..w {
                out.put_pixel(x, y, *src.get_pixel(x, y));
            }
        }
        for i in 0..band {
            for x in 0..w {
                out.put_pixel(x, h + i, *src.get_pixel(x, h - band + i));
            }
        }
        out
    }

    #[test]
    fn trims_duplicated_trailing_band() {
        // 400 rows of high-entropy content with its own last 96 rows appended
        // again (the doubled-chrome artifact). Only b=96 aligns; every other band
        // scores far above threshold, so exactly 96 rows come off.
        let base = vnoise_image(120, 400);
        let mut acc = append_duplicate_tail(&base, 96);
        assert_eq!(acc.height(), 496);
        let trimmed = trim_trailing_duplicate(&mut acc);
        assert_eq!(trimmed, 96, "should trim exactly the duplicated band");
        assert_eq!(acc.height(), 400);
        // The remaining image is pixel-identical to the original content.
        for y in 0..400 {
            for x in 0..120 {
                assert_eq!(acc.get_pixel(x, y), base.get_pixel(x, y), "content altered at ({x},{y})");
            }
        }
    }

    #[test]
    fn clean_capture_is_not_trimmed() {
        // Aperiodic content: each row is a distinct, monotonically brightening
        // gray (luma ≈ y, no wrap over height 200), so no two bands align —
        // nothing to trim.
        let (w, h) = (120u32, 200u32);
        let mut acc = RgbaImage::new(w, h);
        for y in 0..h {
            let g = y as u8;
            for x in 0..w {
                acc.put_pixel(x, y, Rgba([g, g, g, 255]));
            }
        }
        let before = acc.height();
        let trimmed = trim_trailing_duplicate(&mut acc);
        assert_eq!(trimmed, 0, "clean capture must not be trimmed");
        assert_eq!(acc.height(), before);
    }

    #[test]
    fn flat_tail_is_not_trimmed() {
        // Varied content on top, a tall uniform (whitespace) tail below. The tail
        // "duplicates" at every band height, but the structure guard refuses to
        // cut flat blank space.
        let top = tall_image(120, 150);
        let (w, top_h) = top.dimensions();
        let tail = 250;
        let mut acc = RgbaImage::new(w, top_h + tail);
        for y in 0..top_h {
            for x in 0..w {
                acc.put_pixel(x, y, *top.get_pixel(x, y));
            }
        }
        for y in top_h..top_h + tail {
            for x in 0..w {
                acc.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            }
        }
        let before = acc.height();
        let trimmed = trim_trailing_duplicate(&mut acc);
        assert_eq!(trimmed, 0, "flat whitespace tail must not be trimmed");
        assert_eq!(acc.height(), before);
    }

    #[test]
    fn tiny_image_is_not_trimmed() {
        let mut acc = tall_image(64, 20);
        let trimmed = trim_trailing_duplicate(&mut acc);
        assert_eq!(trimmed, 0);
        assert_eq!(acc.height(), 20);
    }

    #[test]
    fn static_bottom_rows_measures_fixed_footer() {
        // Two consecutive frames: identical bottom `footer` rows (fixed window
        // chrome), different content above (it scrolled).
        let (w, h, footer) = (100u32, 300u32, 40u32);
        let a = vnoise_image(w, h);
        let mut b = a.clone();
        for y in 0..(h - footer) {
            for x in 0..w {
                let p = a.get_pixel(x, y).0;
                b.put_pixel(x, y, Rgba([p[0] ^ 0xff, p[1], p[2], 255]));
            }
        }
        assert_eq!(static_bottom_rows(&a, &b), footer);
    }

    #[test]
    fn static_bottom_rows_zero_when_bottom_changes() {
        let a = vnoise_image(80, 120);
        let mut b = a.clone();
        for x in 0..80 {
            let p = a.get_pixel(x, 119).0;
            b.put_pixel(x, 119, Rgba([p[0] ^ 0xff, p[1], p[2], 255]));
        }
        assert_eq!(static_bottom_rows(&a, &b), 0);
    }

    #[test]
    fn static_bottom_rows_full_height_when_identical() {
        let a = vnoise_image(60, 100);
        assert_eq!(static_bottom_rows(&a, &a), 100);
    }

    #[test]
    fn fixed_bottom_chrome_is_never_stitched_into_a_seam() {
        // The reported bug: every frame carries a fixed bottom band (window
        // boundary / scrollbar) that never scrolls. The old stitcher appended the
        // literal bottom rows, welding that band into the middle of the output.
        // This replicates the sampler's footer-aware stitch and asserts the
        // result is pixel-exact clean page content — no chrome, no misalignment.
        let w = 120;
        let full_h = 900;
        let vh = 300;
        let footer = 24; // fixed window band height
        let step = 90;
        const EXCLUDE_BAND: u32 = 48;
        let full = tall_image(w, full_h);
        let chrome = Rgba([222u8, 111, 55, 255]);
        let framed = |top: u32| -> RgbaImage {
            let mut f = viewport(&full, top, vh);
            for y in (vh - footer)..vh {
                for x in 0..w {
                    f.put_pixel(x, y, chrome);
                }
            }
            f
        };

        let f0 = framed(0);
        let mut acc = f0.clone();
        let mut prev = f0;
        let mut locked: Option<u32> = None;
        let mut expected_h = acc.height(); // updated once footer is trimmed

        let mut top = step;
        while top + vh <= full_h {
            let next = framed(top);
            let exclude = EXCLUDE_BAND.max(locked.unwrap_or(0));
            let mut decision = measure_frame(&prev, &next, exclude);
            if !matches!(decision, StitchDecision::Duplicate) && locked.is_none() {
                let f = static_bottom_rows(&prev, &next);
                trim_bottom_rows(&mut acc, f);
                locked = Some(f);
                expected_h = acc.height();
                decision = measure_frame(&prev, &next, EXCLUDE_BAND.max(f));
            }
            let out = apply_frame(&mut acc, &next, decision, locked.unwrap_or(0));
            assert!(!out.duplicate, "distinct slice flagged duplicate at top={top}");
            assert!(!out.low_confidence, "lost alignment at top={top}");
            expected_h += out.appended;
            prev = next;
            top += step;
        }

        // The fixed band height was detected exactly.
        assert_eq!(locked, Some(footer), "wrong detected footer");
        assert_eq!(acc.height(), expected_h, "unexpected output height");
        // Pixel-exact clean page content: if the chrome band had leaked into any
        // seam, these rows would differ (and misalign everything below).
        for y in 0..acc.height() {
            for x in 0..w {
                assert_eq!(
                    acc.get_pixel(x, y),
                    full.get_pixel(x, y),
                    "output diverges from clean page content at ({x},{y})"
                );
            }
        }
    }

    #[test]
    fn append_footer_band_reattaches_the_bottom_edge() {
        // `acc` holds a frame's content (its bottom `footer` rows removed);
        // re-attaching that frame's footer band restores the full frame.
        let src = vnoise_image(50, 100);
        let footer = 20;
        let mut acc =
            image::imageops::crop_imm(&src, 0, 0, 50, 100 - footer).to_image();
        append_footer_band(&mut acc, &src, footer);
        assert_eq!(acc.height(), 100);
        for y in 0..100 {
            for x in 0..50 {
                assert_eq!(acc.get_pixel(x, y), src.get_pixel(x, y), "mismatch at ({x},{y})");
            }
        }
    }

    #[test]
    fn append_footer_band_zero_is_noop() {
        let src = vnoise_image(40, 60);
        let mut acc = src.clone();
        append_footer_band(&mut acc, &src, 0);
        assert_eq!(acc.height(), 60);
    }

    #[test]
    fn static_bottom_rows_excludes_scrolled_whitespace() {
        // The first-vs-last-frame comparison the finish path uses: `first` has
        // real content above a fixed chrome band; `last` has whitespace above the
        // same chrome (the page ended). Only the chrome band matches from the
        // bottom, so scrolled-in whitespace is NOT counted as footer.
        let (w, h, chrome) = (100u32, 300u32, 30u32);
        let mut first = RgbaImage::from_pixel(w, h, Rgba([100, 100, 100, 255]));
        let mut last = RgbaImage::from_pixel(w, h, Rgba([255, 255, 255, 255]));
        let chrome_img = vnoise_image(w, chrome);
        for y in 0..chrome {
            for x in 0..w {
                let p = *chrome_img.get_pixel(x, y);
                first.put_pixel(x, h - chrome + y, p);
                last.put_pixel(x, h - chrome + y, p);
            }
        }
        assert_eq!(static_bottom_rows(&first, &last), chrome);
    }
}
