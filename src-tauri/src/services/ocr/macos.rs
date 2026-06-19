//! macOS Vision OCR backend.
//!
//! Uses `VNRecognizeTextRequest` against a file URL. Vision returns one
//! observation per text line, each with a normalized bottom-left-origin
//! bounding box and a ranked list of candidate strings. We take the top
//! candidate for each observation and derive per-word bounding boxes via
//! `VNRecognizedText::boundingBoxForRange_error`.
//!
//! Coordinate conversion is handled by `normalize_vision_box`, which flips
//! Vision's bottom-left origin to top-left pixel space.

use super::{normalize_vision_box, OcrBackend, OcrLine, OcrWord};
use anyhow::{anyhow, Context};
use objc2::AnyThread;
use objc2::ClassType;
use objc2_foundation::{NSArray, NSRange, NSString, NSURL};
use objc2_vision::{
    VNImageRequestHandler, VNRecognizeTextRequest, VNRequestTextRecognitionLevel,
};

pub struct VisionBackend;

impl VisionBackend {
    pub fn new() -> Self {
        VisionBackend
    }
}

impl OcrBackend for VisionBackend {
    /// Returns all language tags that the Accurate recognition level supports
    /// on this machine. Falls back to `["en-US"]` on any error.
    fn available_languages(&self) -> Vec<String> {
        unsafe {
            let req = VNRecognizeTextRequest::new();
            req.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
            match req.supportedRecognitionLanguagesAndReturnError() {
                Ok(arr) => arr.iter().map(|s| s.to_string()).collect(),
                Err(_) => vec!["en-US".to_string()],
            }
        }
    }

    /// Run text recognition on `image_path` using the supplied `languages`.
    ///
    /// Returns `(pixel_width, pixel_height, lines)` on success.
    fn recognize(
        &self,
        image_path: &str,
        languages: &[String],
    ) -> anyhow::Result<(u32, u32, Vec<OcrLine>)> {
        // Image pixel dimensions — needed to convert normalized Vision boxes.
        let (img_w, img_h) = image::image_dimensions(image_path)
            .with_context(|| format!("failed to read image dimensions for {image_path}"))?;

        let url = NSURL::from_file_path(image_path)
            .ok_or_else(|| anyhow!("could not create file URL for: {image_path}"))?;

        unsafe {
            let handler = VNImageRequestHandler::initWithURL_options(
                VNImageRequestHandler::alloc(),
                &url,
                &objc2_foundation::NSDictionary::new(),
            );

            let request = VNRecognizeTextRequest::new();
            request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
            request.setUsesLanguageCorrection(true);

            // Build NSArray<NSString> for the requested languages.
            let lang_ns: Vec<objc2::rc::Retained<NSString>> =
                languages.iter().map(|l| NSString::from_str(l)).collect();
            let lang_refs: Vec<&NSString> = lang_ns.iter().map(|s| s.as_ref()).collect();
            request.setRecognitionLanguages(&NSArray::from_slice(&lang_refs));

            // Upcast: VNRecognizeTextRequest → VNImageBasedRequest → VNRequest
            // so we can place it in NSArray<VNRequest>.
            let vn_request = request.as_super().as_super();
            let requests = NSArray::from_slice(&[vn_request]);
            handler
                .performRequests_error(&requests)
                .map_err(|e| anyhow!("Vision performRequests failed: {:?}", e))?;

            // Re-read results from `request` after perform.
            let mut lines: Vec<OcrLine> = Vec::new();
            let Some(results) = request.results() else {
                return Ok((img_w, img_h, lines));
            };

            for obs in results.iter() {
                // topCandidates(1) returns 0–1 candidates.
                let candidates = obs.topCandidates(1);
                let Some(candidate) = candidates.firstObject() else {
                    continue;
                };

                let text = candidate.string().to_string();
                if text.trim().is_empty() {
                    continue;
                }

                // Line-level bounding box.
                let bb = obs.boundingBox();
                let bbox = normalize_vision_box(
                    bb.origin.x,
                    bb.origin.y,
                    bb.size.width,
                    bb.size.height,
                    img_w,
                    img_h,
                );

                // Per-word bounding boxes (best-effort via UTF-16 ranges).
                let words = word_boxes(&candidate, &text, img_w, img_h);

                lines.push(OcrLine { text, bbox, words });
            }

            Ok((img_w, img_h, lines))
        }
    }
}

/// Derive per-word bounding boxes from a `VNRecognizedText` candidate.
///
/// Vision's `boundingBoxForRange:error:` maps a character range (UTF-16
/// indices into the candidate string) to a `VNRectangleObservation`. We walk
/// the whitespace-separated words in the recognized string and accumulate
/// UTF-16 offsets to form each word's range.
///
/// This is best-effort: if a word range query fails for any reason we skip
/// that word rather than aborting the whole line. The overlay layer handles
/// empty `words` by making the entire line's bounding box selectable.
unsafe fn word_boxes(
    candidate: &objc2_vision::VNRecognizedText,
    text: &str,
    img_w: u32,
    img_h: u32,
) -> Vec<OcrWord> {
    let mut out = Vec::new();

    // Build a list of (utf16_start, utf16_len, word_str) by scanning the
    // string manually so we can track exact UTF-16 positions.
    let mut utf16_offset: usize = 0;
    let mut char_iter = text.char_indices().peekable();

    while char_iter.peek().is_some() {
        // Skip whitespace, advancing utf16_offset.
        while let Some(&(_, ch)) = char_iter.peek() {
            if !ch.is_whitespace() {
                break;
            }
            utf16_offset += ch.len_utf16();
            char_iter.next();
        }

        if char_iter.peek().is_none() {
            break;
        }

        // Collect one word.
        let word_start = utf16_offset;
        let mut word_buf = String::new();
        while let Some(&(_, ch)) = char_iter.peek() {
            if ch.is_whitespace() {
                break;
            }
            word_buf.push(ch);
            utf16_offset += ch.len_utf16();
            char_iter.next();
        }

        if word_buf.is_empty() {
            continue;
        }

        let word_len = utf16_offset - word_start;
        let range = NSRange::new(word_start, word_len);

        if let Ok(rect_obs) = candidate.boundingBoxForRange_error(range) {
            let bb = rect_obs.boundingBox();
            if bb.size.width > 0.0 && bb.size.height > 0.0 {
                out.push(OcrWord {
                    text: word_buf,
                    bbox: normalize_vision_box(
                        bb.origin.x,
                        bb.origin.y,
                        bb.size.width,
                        bb.size.height,
                        img_w,
                        img_h,
                    ),
                });
            }
        }
        // If the call fails we simply skip this word — line-level bbox covers it.
    }

    out
}
