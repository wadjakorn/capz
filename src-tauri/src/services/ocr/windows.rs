//! Windows OCR backend via Windows.Media.Ocr.
//!
//! Decodes the image to a SoftwareBitmap, runs OcrEngine.RecognizeAsync, and
//! maps each line/word's pixel BoundingRect directly into image space (no
//! origin flip — Windows uses top-left).
//!
//! # Name collision note
//! This file lives in a module named `windows` (declared as `pub mod windows` in
//! mod.rs). Inside this file, `use windows::...` refers to the *extern crate*
//! `windows` (the WinRT bindings), not to the module itself — Rust resolves
//! extern crates before module-relative paths at the use-statement level.
//! To be explicit and avoid any future ambiguity, all crate types below are
//! imported with `use ::windows::...` (absolute path from the crate root).
//!
//! # NOT compiled / verified on macOS
//! This file is `#[cfg(target_os = "windows")]`-gated. The macOS build skips it
//! entirely. A Windows developer must run:
//!   `cargo check`
//!   `cargo clippy --all-targets -- -D warnings`
//! and perform a manual smoke test before this code is considered production-ready.

use super::{OcrBackend, OcrBox, OcrLine, OcrWord};
use anyhow::{anyhow, Context};

// Crate imports — use absolute `::windows` paths to avoid collision with the
// module named `windows` in which this file lives.
use ::windows::core::HSTRING;
use ::windows::Globalization::Language;
use ::windows::Graphics::Imaging::BitmapDecoder;
use ::windows::Media::Ocr::OcrEngine;
use ::windows::Storage::{FileAccessMode, StorageFile};

pub struct WindowsBackend;

impl WindowsBackend {
    pub fn new() -> Self {
        WindowsBackend
    }
}

/// Convert a `windows::Foundation::Rect` (f32 fields, top-left origin) to our
/// `OcrBox` (f64 fields, top-left origin). No coordinate flip needed — Windows
/// OCR pixel rects are already top-left.
fn rect_to_box(r: ::windows::Foundation::Rect) -> OcrBox {
    OcrBox {
        x: r.X as f64,
        y: r.Y as f64,
        w: r.Width as f64,
        h: r.Height as f64,
    }
}

/// Compute the union bounding box of a slice of `OcrBox` values.
/// Returns a zero-box if the slice is empty.
fn union_bbox(boxes: &[OcrBox]) -> OcrBox {
    if boxes.is_empty() {
        return OcrBox { x: 0.0, y: 0.0, w: 0.0, h: 0.0 };
    }
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    for b in boxes {
        min_x = min_x.min(b.x);
        min_y = min_y.min(b.y);
        max_x = max_x.max(b.x + b.w);
        max_y = max_y.max(b.y + b.h);
    }
    OcrBox { x: min_x, y: min_y, w: max_x - min_x, h: max_y - min_y }
}

impl OcrBackend for WindowsBackend {
    /// Returns all language tags for which an OCR recognizer is installed on
    /// this machine. Falls back to `["en-US"]` on any API error.
    fn available_languages(&self) -> Vec<String> {
        match OcrEngine::AvailableRecognizerLanguages() {
            Ok(langs) => langs
                .into_iter()
                .filter_map(|l| l.LanguageTag().ok().map(|t| t.to_string()))
                .collect(),
            Err(_) => vec!["en-US".to_string()],
        }
    }

    /// Run OCR on the file at `image_path` using the first requested language
    /// the engine can honor, or the user-profile engine as fallback.
    ///
    /// Returns `(pixel_width, pixel_height, lines)` where every bounding rect
    /// is in top-left pixel space matching the decoded bitmap dimensions.
    fn recognize(
        &self,
        image_path: &str,
        languages: &[String],
    ) -> anyhow::Result<(u32, u32, Vec<OcrLine>)> {
        // Pick the first requested language the engine can honor, or fall back
        // to the user-profile language engine.
        let engine = languages
            .iter()
            .find_map(|tag| {
                let lang = Language::CreateLanguage(&HSTRING::from(tag.as_str())).ok()?;
                OcrEngine::TryCreateFromLanguage(&lang).ok()
            })
            .or_else(|| {
                OcrEngine::TryCreateFromUserProfileLanguages().ok()
            })
            .ok_or_else(|| anyhow!("no usable OCR engine found for the requested languages"))?;

        // Open the file as a StorageFile.
        let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(image_path))
            .context("StorageFile::GetFileFromPathAsync")?
            .get()
            .context("await GetFileFromPathAsync")?;

        // Open a read stream — returns IRandomAccessStream (Storage_Streams feature).
        let stream = file
            .OpenAsync(FileAccessMode::Read)
            .context("StorageFile::OpenAsync")?
            .get()
            .context("await OpenAsync")?;

        // Decode to SoftwareBitmap.
        let decoder = BitmapDecoder::CreateAsync(&stream)
            .context("BitmapDecoder::CreateAsync")?
            .get()
            .context("await BitmapDecoder::CreateAsync")?;

        let bitmap = decoder
            .GetSoftwareBitmapAsync()
            .context("BitmapDecoder::GetSoftwareBitmapAsync")?
            .get()
            .context("await GetSoftwareBitmapAsync")?;

        // PixelWidth / PixelHeight return i32 in the windows crate.
        let img_w = bitmap.PixelWidth().context("SoftwareBitmap::PixelWidth")?.max(0) as u32;
        let img_h = bitmap.PixelHeight().context("SoftwareBitmap::PixelHeight")?.max(0) as u32;

        // Run OCR.
        let result = engine
            .RecognizeAsync(&bitmap)
            .context("OcrEngine::RecognizeAsync")?
            .get()
            .context("await RecognizeAsync")?;

        // Map lines → words with pixel BoundingRect (top-left, no flip).
        let ocr_lines = result.Lines().context("OcrResult::Lines")?;
        let mut lines: Vec<OcrLine> = Vec::new();

        for line in ocr_lines {
            let text = line.Text().context("OcrLine::Text")?.to_string();
            if text.trim().is_empty() {
                continue;
            }

            let ocr_words = line.Words().context("OcrLine::Words")?;
            let mut words: Vec<OcrWord> = Vec::new();

            for word in ocr_words {
                let word_text = word.Text().context("OcrWord::Text")?.to_string();
                let rect = word.BoundingRect().context("OcrWord::BoundingRect")?;
                let bbox = rect_to_box(rect);
                words.push(OcrWord { text: word_text, bbox });
            }

            // Line bbox = union of its word bounding boxes.
            let word_boxes: Vec<OcrBox> = words.iter().map(|w| w.bbox.clone()).collect();
            let bbox = union_bbox(&word_boxes);

            lines.push(OcrLine { text, bbox, words });
        }

        Ok((img_w, img_h, lines))
    }
}
