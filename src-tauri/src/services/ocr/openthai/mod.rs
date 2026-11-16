//! OpenThai2.0-OCR-Text (iApp Technology, Apache-2.0): PP-OCRv6-tiny text
//! detection + a Thai/English CTC recogniser, run fully on-device.
//!
//! Ported from the CP-0096 prototype (`scripts/ocr-eval/rust-proto/`, 98.1%
//! line parity with iApp's Python runtime). The spec it follows is
//! `scripts/ocr-eval/REFERENCE.md`. Models live in `resources/ocr/openthai/`,
//! pinned to Hugging Face revision 40e8e9ff752b65153b1a71d521ec9390882afd7e.

mod det;
mod geom;
mod imgops;
mod net;
mod page;
mod rec;
mod text;

use super::{pick_languages, OcrBackend, OcrBox, OcrLine, OcrResult, OcrWord};
use anyhow::{anyhow, Context, Result};
use std::path::{Path, PathBuf};

pub use page::Line;

/// Folder under the bundle's resource dir holding the model files.
pub const RESOURCE_SUBDIR: &str = "resources/ocr/openthai";

/// Languages the recogniser's character set covers.
pub const LANGUAGES: [&str; 2] = ["en-US", "th-TH"];

pub struct OpenThaiBackend {
    model_dir: PathBuf,
}

impl OpenThaiBackend {
    pub fn new(model_dir: impl Into<PathBuf>) -> Self {
        OpenThaiBackend { model_dir: model_dir.into() }
    }

    /// Run detection and recognition on one image. Returns the raw lines with
    /// quads and confidences (the example CLI writes these for the eval harness).
    pub fn read_lines(&self, image_path: &str, threads: usize) -> Result<(u32, u32, Vec<Line>)> {
        self.read_lines_in(image_path, None, threads)
    }

    /// Like `read_lines`, but reads only `region` when given (CP-0100). Detection
    /// then runs on the crop, which it scales up to its 1280 px limit (capped at
    /// 4x) instead of shrinking the whole image, so small text gets found. Boxes
    /// come back in full-image coordinates, and `(w, h)` is the full image size.
    pub fn read_lines_in(
        &self,
        image_path: &str,
        region: Option<&Region>,
        threads: usize,
    ) -> Result<(u32, u32, Vec<Line>)> {
        let img = imgops::Img::load_bgr(image_path)
            .with_context(|| format!("open image {image_path}"))?;
        let crop = match region {
            None => None,
            Some(r) => {
                let (x, y, w, h) = clamp_region(r, img.w, img.h)
                    .ok_or_else(|| anyhow!("OCR region {r:?} is outside the {}x{} image", img.w, img.h))?;
                Some((x as f64, y as f64, imgops::crop_rect(&img, x, y, w, h)))
            }
        };
        let mut eng = engine(&self.model_dir, threads)?;
        let lines = match &crop {
            None => eng.read(&img)?,
            Some((dx, dy, sub)) => {
                let mut lines = eng.read(sub)?;
                lines.iter_mut().for_each(|l| offset_line(l, *dx, *dy));
                lines
            }
        };
        Ok((img.w as u32, img.h as u32, lines))
    }

    /// `ocr_detect` with a region: OpenThai only, boxes in full-image coordinates.
    pub fn detect_region(&self, image_path: &str, region: &Region) -> Result<OcrResult> {
        let (languages, thai_available) = pick_languages(&self.available_languages());
        let (w, h, lines) = self.read_lines_in(image_path, Some(region), default_threads())?;
        Ok(OcrResult {
            width: w,
            height: h,
            lines: lines.iter().map(to_ocr_line).collect(),
            languages_used: languages,
            thai_available,
            engine: ENGINE.into(),
        })
    }
}

/// `OcrResult.engine` for this backend.
pub const ENGINE: &str = "openthai";

/// Part of the image to read, in image pixels (CP-0100). Sent by the webview.
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize)]
pub struct Region {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// `r` rounded outwards to whole pixels and clamped to a `w`×`h` image, as
/// `(x, y, w, h)`. `None` when nothing of it is left.
pub fn clamp_region(r: &Region, w: usize, h: usize) -> Option<(usize, usize, usize, usize)> {
    let fit = |v: f64, max: usize| if v.is_finite() { v.clamp(0.0, max as f64) } else { 0.0 };
    let (x0, y0) = (fit(r.x.floor(), w) as usize, fit(r.y.floor(), h) as usize);
    let (x1, y1) = (fit((r.x + r.w).ceil(), w) as usize, fit((r.y + r.h).ceil(), h) as usize);
    (x1 > x0 && y1 > y0).then_some((x0, y0, x1 - x0, y1 - y0))
}

fn offset_line(l: &mut Line, dx: f64, dy: f64) {
    let shift = |q: &mut geom::Quad| q.iter_mut().for_each(|p| {
        p[0] += dx;
        p[1] += dy;
    });
    l.bbox[0] += dx;
    l.bbox[1] += dy;
    shift(&mut l.quad);
    l.words.iter_mut().for_each(|w| shift(&mut w.quad));
}

/// Settings tuned on the CP-0096 sweep for screenshots. Everything else is
/// iApp's own default (det.yml + config.json): screenshots need a little
/// vertical padding for Thai marks, and single-character cells ("3", "·") are
/// real UI text, not seal noise.
fn engine(model_dir: &Path, threads: usize) -> Result<page::Engine> {
    let dict = std::fs::read_to_string(model_dir.join("rec_dict.txt"))
        .with_context(|| format!("read {}", model_dir.join("rec_dict.txt").display()))?;
    let chars = charset(&dict);
    let det_cfg = det::DetCfg { v_pad: 0.15, ..Default::default() };
    let filter = page::FilterCfg { min_chars: 1, ..Default::default() };
    Ok(page::Engine {
        det: net::load(&model_dir.join("det.onnx"), threads)?,
        rec: net::load(&model_dir.join("rec.onnx"), threads)?,
        chars,
        det_cfg,
        rec_cfg: rec::RecCfg::default(),
        filter,
    })
}

/// CTC classes: blank, one per dictionary line, then space. Tolerates CRLF:
/// a Windows checkout once shipped rec_dict.txt with "\r\n", which put a
/// carriage return after every recognised character (CP-0097).
fn charset(dict: &str) -> Vec<String> {
    let mut chars = vec![String::new()];
    chars.extend(
        dict.split('\n')
            .map(|l| l.strip_suffix('\r').unwrap_or(l))
            .filter(|l| !l.is_empty())
            .map(str::to_string),
    );
    chars.push(" ".into());
    chars
}

/// Threads for one OCR call. CP-0096: 8 threads beat 4 by ~12% at the same RSS.
pub fn default_threads() -> usize {
    std::thread::available_parallelism().map_or(4, |n| n.get()).clamp(1, 8)
}

fn quad_box(q: &geom::Quad) -> OcrBox {
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for p in q {
        x0 = x0.min(p[0]);
        y0 = y0.min(p[1]);
        x1 = x1.max(p[0]);
        y1 = y1.max(p[1]);
    }
    OcrBox { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

fn to_ocr_line(l: &Line) -> OcrLine {
    OcrLine {
        text: l.text.clone(),
        bbox: OcrBox { x: l.bbox[0], y: l.bbox[1], w: l.bbox[2], h: l.bbox[3] },
        words: l.words.iter().map(|w| OcrWord { text: w.text.clone(), bbox: quad_box(&w.quad) }).collect(),
    }
}

impl OcrBackend for OpenThaiBackend {
    fn available_languages(&self) -> Vec<String> {
        LANGUAGES.iter().map(|s| s.to_string()).collect()
    }

    fn recognize(&self, image_path: &str, _languages: &[String]) -> Result<(u32, u32, Vec<OcrLine>)> {
        let (w, h, lines) = self.read_lines(image_path, default_threads())?;
        Ok((w, h, lines.iter().map(to_ocr_line).collect()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model_dir() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join(RESOURCE_SUBDIR)
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
    }

    /// The bundled models must be the exact files CP-0096 measured.
    #[test]
    fn bundled_models_match_pinned_hashes() {
        for (name, want) in [
            ("det.onnx", "193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8"),
            ("rec.onnx", "82ec89533346faadcb30df96703dad2dd7521de65709e60d83fd9745b8968124"),
            ("rec_dict.txt", "259ef2636cec0eeae225ae9fd9a63fa9305285650c22d7ec34fe8a82b24c2f1a"),
        ] {
            let bytes = std::fs::read(model_dir().join(name)).unwrap();
            assert_eq!(sha256_hex(&bytes), want, "{name}");
        }
    }

    #[test]
    fn charset_ignores_crlf_line_endings() {
        let lf = charset("a\nข\n่\n");
        assert_eq!(lf, vec!["", "a", "ข", "่", " "]);
        assert_eq!(charset("a\r\nข\r\n่\r\n"), lf);
    }

    #[test]
    fn bundled_charset_has_no_control_characters() {
        let dict = std::fs::read_to_string(model_dir().join("rec_dict.txt")).unwrap();
        let chars = charset(&dict);
        assert_eq!(chars.len(), 530);
        assert!(chars.iter().all(|c| !c.chars().any(char::is_control)), "{chars:?}");
    }

    #[test]
    fn quad_box_is_axis_aligned_bounds() {
        let b = quad_box(&[[10.0, 5.0], [50.0, 4.0], [51.0, 20.0], [9.0, 21.0]]);
        assert_eq!(b, OcrBox { x: 9.0, y: 4.0, w: 42.0, h: 17.0 });
    }

    #[test]
    fn reports_english_and_thai() {
        let b = OpenThaiBackend::new(model_dir());
        let (langs, thai) = super::super::pick_languages(&b.available_languages());
        assert!(thai);
        assert_eq!(langs, vec!["en-US".to_string(), "th-TH".to_string()]);
    }

    #[test]
    fn clamp_region_rounds_out_and_clamps() {
        let r = |x, y, w, h| Region { x, y, w, h };
        assert_eq!(clamp_region(&r(10.4, 5.6, 20.2, 10.0), 100, 50), Some((10, 5, 21, 11)));
        assert_eq!(clamp_region(&r(-30.0, -5.0, 60.0, 500.0), 100, 50), Some((0, 0, 30, 50)));
        assert_eq!(clamp_region(&r(120.0, 0.0, 10.0, 10.0), 100, 50), None);
        assert_eq!(clamp_region(&r(10.0, 10.0, 0.0, 5.0), 100, 50), None);
        assert_eq!(clamp_region(&r(f64::NAN, 0.0, 10.0, 10.0), 100, 50), None);
    }

    #[test]
    fn crop_rect_copies_the_rectangle() {
        let mut img = imgops::Img::new(4, 3, 1);
        img.data = (0..12).collect();
        let c = imgops::crop_rect(&img, 1, 1, 2, 2);
        assert_eq!((c.w, c.h, c.data), (2, 2, vec![5, 6, 9, 10]));
    }

    fn fixture() -> String {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/services/ocr/openthai/fixtures/mixed_line.png")
            .to_string_lossy()
            .into_owned()
    }

    /// CP-0100: a region is read on its own and mapped back to image coordinates.
    #[test]
    fn region_boxes_are_in_full_image_coordinates() {
        let b = OpenThaiBackend::new(model_dir());
        let (w, h, whole) = b.read_lines(&fixture(), 2).unwrap();
        let line = &whole[0];
        // The line's right half, with the full image height around it.
        let region = Region { x: line.bbox[0] + line.bbox[2] / 2.0, y: 0.0, w: w as f64, h: h as f64 };
        let r = b.detect_region(&fixture(), &region).unwrap();
        assert_eq!((r.width, r.height, r.engine.as_str()), (w, h, "openthai"));
        assert!(!r.lines.is_empty());
        for l in &r.lines {
            assert!(l.bbox.x >= region.x - 1.0, "{:?} left of {:?}", l.bbox, region);
            for wd in &l.words {
                assert!(wd.bbox.x >= region.x - 1.0, "{:?}", wd.bbox);
            }
        }
    }

    #[test]
    fn region_outside_the_image_is_an_error() {
        let b = OpenThaiBackend::new(model_dir());
        let region = Region { x: 1e6, y: 0.0, w: 10.0, h: 10.0 };
        assert!(b.detect_region(&fixture(), &region).is_err());
    }

    /// End to end on a rendered Thai + English line: models load, text comes back.
    #[test]
    fn reads_mixed_thai_english_line() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/services/ocr/openthai/fixtures/mixed_line.png");
        let b = OpenThaiBackend::new(model_dir());
        let (w, h, lines) = b.recognize(path.to_str().unwrap(), &[]).unwrap();
        assert!(w > 0 && h > 0);
        let all: String = lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join(" ");
        assert!(all.contains("capz"), "{all}");
        assert!(all.contains("ภาษาไทย"), "{all}");
        assert!(lines.iter().all(|l| !l.words.is_empty()));
    }
}
