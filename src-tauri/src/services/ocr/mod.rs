use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrBox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrWord {
    pub text: String,
    pub bbox: OcrBox,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    pub text: String,
    pub bbox: OcrBox,
    pub words: Vec<OcrWord>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub width: u32,
    pub height: u32,
    pub lines: Vec<OcrLine>,
    pub languages_used: Vec<String>,
    pub thai_available: bool,
}

/// Implemented per-platform. The pure orchestration in `run_detect` is tested
/// against a fake implementation, so platform code carries no testable logic.
pub trait OcrBackend {
    fn available_languages(&self) -> Vec<String>;
    fn recognize(
        &self,
        image_path: &str,
        languages: &[String],
    ) -> anyhow::Result<(u32, u32, Vec<OcrLine>)>;
}

/// Vision returns normalized boxes ([0,1]) with a bottom-left origin.
/// Convert to top-left pixel coordinates in image space.
pub fn normalize_vision_box(min_x: f64, min_y: f64, w: f64, h: f64, img_w: u32, img_h: u32) -> OcrBox {
    let iw = img_w as f64;
    let ih = img_h as f64;
    OcrBox {
        x: min_x * iw,
        y: (1.0 - (min_y + h)) * ih,
        w: w * iw,
        h: h * ih,
    }
}

/// Choose recognition languages. Always include English. Include Thai only when
/// the engine reports a Thai recognizer (`th` / `th-TH`). Returns the chosen
/// language tags and whether Thai is available.
pub fn pick_languages(available: &[String]) -> (Vec<String>, bool) {
    let thai = available
        .iter()
        .any(|l| l.to_ascii_lowercase().starts_with("th"));
    let mut langs = vec!["en-US".to_string()];
    if thai {
        langs.push("th-TH".to_string());
    }
    (langs, thai)
}

pub fn run_detect<B: OcrBackend>(backend: &B, image_path: &str) -> anyhow::Result<OcrResult> {
    let available = backend.available_languages();
    let (languages, thai_available) = pick_languages(&available);
    let (width, height, lines) = backend.recognize(image_path, &languages)?;
    Ok(OcrResult {
        width,
        height,
        lines,
        languages_used: languages,
        thai_available,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeBackend {
        langs: Vec<String>,
    }
    impl OcrBackend for FakeBackend {
        fn available_languages(&self) -> Vec<String> {
            self.langs.clone()
        }
        fn recognize(
            &self,
            _image_path: &str,
            languages: &[String],
        ) -> anyhow::Result<(u32, u32, Vec<OcrLine>)> {
            // Echo a single line whose text encodes the requested languages,
            // so the orchestration wiring is observable.
            Ok((
                100,
                50,
                vec![OcrLine {
                    text: languages.join(","),
                    bbox: OcrBox { x: 0.0, y: 0.0, w: 10.0, h: 10.0 },
                    words: vec![],
                }],
            ))
        }
    }

    #[test]
    fn vision_box_flips_origin_to_top_left() {
        // A box at the bottom-left of a 200x100 image: minY=0, height=0.1.
        let b = normalize_vision_box(0.0, 0.0, 0.5, 0.1, 200, 100);
        assert_eq!(b.x, 0.0);
        assert_eq!(b.w, 100.0);
        assert_eq!(b.h, 10.0);
        // bottom row → large top-left y (90 of 100, minus the 10px height).
        assert_eq!(b.y, 90.0);
    }

    #[test]
    fn pick_languages_includes_thai_when_available() {
        let (langs, thai) = pick_languages(&["en-US".into(), "th-TH".into()]);
        assert!(thai);
        assert_eq!(langs, vec!["en-US".to_string(), "th-TH".to_string()]);
    }

    #[test]
    fn pick_languages_english_only_when_no_thai() {
        let (langs, thai) = pick_languages(&["en-US".into(), "fr-FR".into()]);
        assert!(!thai);
        assert_eq!(langs, vec!["en-US".to_string()]);
    }

    #[test]
    fn run_detect_reports_thai_flag_and_languages() {
        let backend = FakeBackend { langs: vec!["en-US".into(), "th-TH".into()] };
        let r = run_detect(&backend, "ignored.png").unwrap();
        assert_eq!(r.width, 100);
        assert_eq!(r.height, 50);
        assert!(r.thai_available);
        assert_eq!(r.languages_used, vec!["en-US".to_string(), "th-TH".to_string()]);
        assert_eq!(r.lines[0].text, "en-US,th-TH");
    }
}
