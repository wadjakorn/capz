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

use super::{OcrBackend, OcrBox, OcrLine, OcrWord};
use anyhow::{Context, Result};
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
        let img = imgops::Img::load_bgr(image_path)
            .with_context(|| format!("open image {image_path}"))?;
        let mut eng = engine(&self.model_dir, threads)?;
        let lines = eng.read(&img)?;
        Ok((img.w as u32, img.h as u32, lines))
    }
}

/// Settings tuned on the CP-0096 sweep for screenshots. Everything else is
/// iApp's own default (det.yml + config.json): screenshots need a little
/// vertical padding for Thai marks, and single-character cells ("3", "·") are
/// real UI text, not seal noise.
fn engine(model_dir: &Path, threads: usize) -> Result<page::Engine> {
    let dict = std::fs::read_to_string(model_dir.join("rec_dict.txt"))
        .with_context(|| format!("read {}", model_dir.join("rec_dict.txt").display()))?;
    let mut chars = vec![String::new()];
    chars.extend(dict.split('\n').filter(|l| !l.is_empty()).map(str::to_string));
    chars.push(" ".into());
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
