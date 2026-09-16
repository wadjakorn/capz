//! Tesseract OCR backend — the Windows engine. See
//! docs/superpowers/specs/2026-09-14-tesseract-windows-ocr-design.md.
#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context};

use super::{OcrBackend, OcrBox, OcrLine, OcrWord};

/// Upscaling 3× cut CER from 10.0% to 7.1% on a real screenshot (research §8),
/// but a 4K capture at 3× is 11520×6480. Cap the long side instead of fixing 3×.
const MAX_UPSCALE: f64 = 3.0;
const MAX_LONG_SIDE: f64 = 4000.0;

pub fn upscale_factor(width: u32, height: u32) -> f64 {
    let long = f64::from(width.max(height));
    if long == 0.0 {
        return 1.0;
    }
    (MAX_LONG_SIDE / long).clamp(1.0, MAX_UPSCALE)
}

/// Tesseract emits SARA AM decomposed (NIKHAHIT + SARA AA). Recomposing it
/// removed a full CER point in research §8.
pub fn fix_thai(s: &str) -> String {
    s.replace("\u{0E4D}\u{0E32}", "\u{0E33}")
}

#[derive(Debug, Clone, PartialEq)]
pub struct TsvWord {
    /// (block_num, par_num, line_num) — identifies the line a word belongs to.
    pub line_key: (u32, u32, u32),
    pub text: String,
    pub bbox: OcrBox,
}

/// Parse Tesseract's `tsv` output into level-5 (word) rows. Structure rows,
/// blank words, the header and malformed rows are skipped.
pub fn parse_tsv_words(tsv: &str) -> Vec<TsvWord> {
    tsv.lines()
        .filter_map(|row| {
            // 12 columns; `text` is last and may itself contain tabs.
            let f: Vec<&str> = row.splitn(12, '\t').collect();
            if f.len() < 12 || f[0] != "5" {
                return None;
            }
            let text = f[11].trim_end_matches('\r');
            if text.trim().is_empty() {
                return None;
            }
            let int = |i: usize| f[i].parse::<u32>().ok();
            let num = |i: usize| f[i].parse::<f64>().ok();
            Some(TsvWord {
                line_key: (int(2)?, int(3)?, int(4)?),
                text: text.to_string(),
                bbox: OcrBox { x: num(6)?, y: num(7)?, w: num(8)?, h: num(9)? },
            })
        })
        .collect()
}

/// Combine one engine run's `txt` and `tsv` outputs into lines. Text comes from
/// `txt`, which spaces Thai correctly; geometry comes from `tsv`. A `txt` line is
/// trusted only when, whitespace removed, it equals its TSV words concatenated —
/// otherwise the words are joined with spaces. Boxes are divided by `scale` to
/// undo the upscale.
pub fn build_lines(txt: &str, words: Vec<TsvWord>, scale: f64) -> Vec<OcrLine> {
    let mut groups: Vec<Vec<TsvWord>> = Vec::new();
    for w in words {
        match groups.last_mut() {
            Some(g) if g[0].line_key == w.line_key => g.push(w),
            _ => groups.push(vec![w]),
        }
    }
    let txt_lines: Vec<&str> = txt.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let aligned = txt_lines.len() == groups.len();
    let squash = |s: &str| s.chars().filter(|c| !c.is_whitespace()).collect::<String>();

    groups
        .into_iter()
        .enumerate()
        .map(|(i, g)| {
            let concat: String = g.iter().map(|w| w.text.as_str()).collect();
            let text = match txt_lines.get(i) {
                Some(t) if aligned && squash(t) == squash(&concat) => (*t).to_string(),
                _ => g.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" "),
            };
            let bbox = scale_box(&union(g.iter().map(|w| &w.bbox)), scale);
            let words = g
                .iter()
                .map(|w| OcrWord { text: fix_thai(&w.text), bbox: scale_box(&w.bbox, scale) })
                .collect();
            OcrLine { text: fix_thai(&text), bbox, words }
        })
        .collect()
}

fn union<'a>(boxes: impl Iterator<Item = &'a OcrBox>) -> OcrBox {
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for b in boxes {
        x0 = x0.min(b.x);
        y0 = y0.min(b.y);
        x1 = x1.max(b.x + b.w);
        y1 = y1.max(b.y + b.h);
    }
    OcrBox { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

fn scale_box(b: &OcrBox, scale: f64) -> OcrBox {
    OcrBox { x: b.x / scale, y: b.y / scale, w: b.w / scale, h: b.h / scale }
}

pub struct TesseractBackend {
    exe: PathBuf,
    tessdata: PathBuf,
}

impl TesseractBackend {
    pub fn new(exe: PathBuf, tessdata: PathBuf) -> Self {
        Self { exe, tessdata }
    }

    /// The layout scripts/fetch-tesseract-windows.sh produces and
    /// tauri.windows.conf.json bundles: `<dir>/tesseract.exe` + `<dir>/tessdata/`.
    pub fn from_dir(dir: &Path) -> Self {
        Self::new(dir.join("tesseract.exe"), dir.join("tessdata"))
    }

    fn run_engine(&self, input: &Path, base: &Path, langs: &str) -> anyhow::Result<(String, String)> {
        let mut cmd = Command::new(&self.exe);
        cmd.arg(input)
            .arg(base)
            .args(["-l", langs, "--psm", "6", "--tessdata-dir"])
            .arg(&self.tessdata)
            .args(["txt", "tsv"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW — otherwise every Detect text flashes a console.
            cmd.creation_flags(0x0800_0000);
        }
        let out = cmd
            .output()
            .with_context(|| format!("failed to start {}", self.exe.display()))?;
        if !out.status.success() {
            bail!(
                "tesseract exited with {}: {}",
                out.status,
                String::from_utf8_lossy(&out.stderr).trim()
            );
        }
        let read = |ext: &str| {
            let p = base.with_extension(ext);
            std::fs::read_to_string(&p).with_context(|| format!("tesseract wrote no {}", p.display()))
        };
        Ok((read("txt")?, read("tsv")?))
    }
}

/// Map `pick_languages` BCP-47 tags to traineddata names, Thai first (the order
/// measured in research §8). Falls back to English.
pub fn tesseract_langs(languages: &[String]) -> String {
    let mut out: Vec<&str> = Vec::new();
    for tag in languages {
        let tag = tag.to_ascii_lowercase();
        let code = if tag.starts_with("th") {
            "tha"
        } else if tag.starts_with("en") {
            "eng"
        } else {
            continue;
        };
        if !out.contains(&code) {
            out.push(code);
        }
    }
    if out.is_empty() {
        out.push("eng");
    }
    out.sort_by_key(|c| *c != "tha");
    out.join("+")
}

impl OcrBackend for TesseractBackend {
    fn available_languages(&self) -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(&self.tessdata) else {
            return Vec::new();
        };
        entries
            .filter_map(|e| {
                let path = e.ok()?.path();
                if path.extension().and_then(|x| x.to_str()) != Some("traineddata") {
                    return None;
                }
                let stem = path.file_stem()?.to_str()?.to_string();
                (stem != "osd").then_some(stem)
            })
            .collect()
    }

    fn recognize(
        &self,
        image_path: &str,
        languages: &[String],
    ) -> anyhow::Result<(u32, u32, Vec<OcrLine>)> {
        // Nothing the user can do about this one — say so, don't send them
        // looking for a setting (see #79).
        if !self.exe.is_file() {
            bail!(
                "bundled OCR engine not found at {} — the capz installation is incomplete; reinstall capz",
                self.exe.display()
            );
        }
        let img = image::open(image_path).with_context(|| format!("failed to open {image_path}"))?;
        let (width, height) = (img.width(), img.height());
        let factor = upscale_factor(width, height);
        let prepared = if factor > 1.0 {
            let w = (f64::from(width) * factor).round() as u32;
            let h = (f64::from(height) * factor).round() as u32;
            img.resize_exact(w, h, image::imageops::FilterType::Lanczos3)
        } else {
            img
        };

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        // `capz-temp-` so image_service::sweep_stale_temp removes leftovers after a crash.
        let base = std::env::temp_dir().join(format!("capz-temp-ocr-{stamp}"));
        let input = base.with_extension("png");
        prepared
            .save(&input)
            .with_context(|| format!("failed to write {}", input.display()))?;

        let run = self.run_engine(&input, &base, &tesseract_langs(languages));
        for ext in ["png", "txt", "tsv"] {
            let _ = std::fs::remove_file(base.with_extension(ext));
        }
        let (txt, tsv) = run?;
        Ok((width, height, build_lines(&txt, parse_tsv_words(&tsv), factor)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER: &str =
        "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

    fn tsv(rows: &[&str]) -> String {
        std::iter::once(HEADER)
            .chain(rows.iter().copied())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Thai has no spaces, so Tesseract reports one glyph cluster per "word".
    fn two_lines() -> String {
        tsv(&[
            "1\t1\t0\t0\t0\t0\t0\t0\t200\t100\t-1\t",
            "4\t1\t1\t1\t1\t0\t10\t10\t80\t30\t-1\t",
            "5\t1\t1\t1\t1\t1\t10\t10\t20\t30\t93.1\tที่",
            "5\t1\t1\t1\t1\t2\t32\t10\t20\t30\t92.0\tแก้",
            "5\t1\t1\t1\t1\t3\t70\t12\t20\t20\t95.5\tok",
            "5\t1\t1\t1\t1\t4\t95\t12\t5\t20\t-1\t ",
            "5\t1\t1\t1\t2\t1\t10\t60\t50\t20\t96.0\tHello",
            "5\t1\t1\t1\t2\t2\t70\t60\t50\t20\t96.0\tworld",
        ])
    }

    fn bx(x: f64, y: f64, w: f64, h: f64) -> OcrBox {
        OcrBox { x, y, w, h }
    }

    #[test]
    fn upscale_factor_caps_long_side_and_never_downscales() {
        assert_eq!(upscale_factor(800, 600), 3.0);
        assert_eq!(upscale_factor(1248, 1828), 4000.0 / 1828.0);
        assert_eq!(upscale_factor(5000, 100), 1.0);
        assert_eq!(upscale_factor(0, 0), 1.0);
    }

    #[test]
    fn fix_thai_composes_sara_am() {
        assert_eq!(fix_thai("ค\u{0E4D}\u{0E32}นวณ"), "คำนวณ");
        assert_eq!(fix_thai("plain"), "plain");
    }

    #[test]
    fn parse_keeps_only_non_blank_level5_rows() {
        let words = parse_tsv_words(&two_lines());
        assert_eq!(words.len(), 5);
        assert_eq!(words[0].text, "ที่");
        assert_eq!(words[0].line_key, (1, 1, 1));
        assert_eq!(words[0].bbox, bx(10.0, 10.0, 20.0, 30.0));
        assert_eq!(words[4].line_key, (1, 1, 2));
    }

    #[test]
    fn parse_keeps_tabs_inside_text() {
        let words = parse_tsv_words(&tsv(&["5\t1\t1\t1\t1\t1\t0\t0\t5\t5\t90\ta\tb"]));
        assert_eq!(words[0].text, "a\tb");
    }

    #[test]
    fn parse_skips_malformed_rows() {
        let words = parse_tsv_words(&tsv(&[
            "5\t1\tshort",
            "5\t1\t1\t1\t1\t1\tLEFT\t0\t5\t5\t90\tbad",
        ]));
        assert!(words.is_empty());
    }

    #[test]
    fn build_lines_takes_text_from_txt_and_geometry_from_tsv() {
        let lines = build_lines("ที่แก้ ok\n\nHello world\n", parse_tsv_words(&two_lines()), 1.0);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "ที่แก้ ok");
        assert_eq!(lines[0].bbox, bx(10.0, 10.0, 80.0, 30.0));
        assert_eq!(lines[0].words.len(), 3);
        assert_eq!(lines[1].text, "Hello world");
    }

    #[test]
    fn build_lines_falls_back_to_space_join_when_txt_is_misaligned() {
        let lines = build_lines("only one line\n", parse_tsv_words(&two_lines()), 1.0);
        assert_eq!(lines[0].text, "ที่ แก้ ok");
        assert_eq!(lines[1].text, "Hello world");
    }

    #[test]
    fn build_lines_maps_boxes_back_through_the_upscale() {
        let lines = build_lines("ที่แก้ ok\nHello world\n", parse_tsv_words(&two_lines()), 2.0);
        assert_eq!(lines[0].bbox, bx(5.0, 5.0, 40.0, 15.0));
        assert_eq!(lines[0].words[0].bbox, bx(5.0, 5.0, 10.0, 15.0));
    }

    #[test]
    fn build_lines_applies_the_thai_fix_to_lines_and_words() {
        let t = tsv(&["5\t1\t1\t1\t1\t1\t0\t0\t9\t9\t90\tค\u{0E4D}\u{0E32}"]);
        let lines = build_lines("ค\u{0E4D}\u{0E32}\n", parse_tsv_words(&t), 1.0);
        assert_eq!(lines[0].text, "คำ");
        assert_eq!(lines[0].words[0].text, "คำ");
    }

    #[test]
    fn tesseract_langs_maps_tags_and_puts_thai_first() {
        let tags = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(tesseract_langs(&tags(&["en-US", "th-TH"])), "tha+eng");
        assert_eq!(tesseract_langs(&tags(&["en-US"])), "eng");
        assert_eq!(tesseract_langs(&tags(&["fr-FR"])), "eng");
    }

    #[test]
    fn missing_engine_reports_a_broken_install_not_a_user_fix() {
        let backend = TesseractBackend::from_dir(Path::new("/nonexistent/capz-tesseract"));
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ocr-thai-mixed.png");
        let err = backend.recognize(fixture, &["en-US".into()]).unwrap_err().to_string();
        assert!(err.contains("installation is incomplete"), "{err}");
    }

    /// Real engine on the committed fixture. Passes vacuously when no engine is
    /// found (macOS dev machines). Runs on the Linux dev box
    /// (`apt install tesseract-ocr tesseract-ocr-tha`) and in the Windows PR job
    /// against the bundled exe via CAPZ_TESSERACT_DIR.
    #[test]
    fn reads_thai_and_english_with_the_real_engine() {
        let Some(backend) = real_backend() else {
            eprintln!("skipping: no tesseract (set CAPZ_TESSERACT_DIR or install tesseract-ocr-tha)");
            return;
        };
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ocr-thai-mixed.png");
        assert!(
            backend.available_languages().iter().any(|l| l == "tha"),
            "tha.traineddata missing from {}",
            backend.tessdata.display()
        );

        let result = crate::services::ocr::run_detect(&backend, fixture).expect("ocr");

        assert!(result.thai_available);
        assert_eq!((result.width, result.height), (1100, 420));
        let all = result.lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n");
        assert!(all.contains("metadata"), "{all}");
        assert!(all.contains("JVM"), "{all}");
        assert!(all.contains("ผ่าน"), "{all}");
        let thai = all.chars().filter(|c| ('\u{0E00}'..='\u{0E7F}').contains(c)).count();
        assert!(thai > 40, "only {thai} Thai chars:\n{all}");
        for line in &result.lines {
            let b = &line.bbox;
            assert!(
                b.x >= 0.0 && b.y >= 0.0 && b.x + b.w <= 1100.5 && b.y + b.h <= 420.5,
                "box outside the original image — upscale not undone? {b:?}"
            );
        }
    }

    fn real_backend() -> Option<TesseractBackend> {
        if let Ok(dir) = std::env::var("CAPZ_TESSERACT_DIR") {
            return Some(TesseractBackend::from_dir(Path::new(&dir)));
        }
        let exe = std::env::var_os("PATH").and_then(|paths| {
            std::env::split_paths(&paths).map(|p| p.join("tesseract")).find(|p| p.is_file())
        })?;
        let tessdata = ["/usr/share/tesseract-ocr/5/tessdata", "/opt/homebrew/share/tessdata"]
            .into_iter()
            .map(PathBuf::from)
            .find(|p| p.join("tha.traineddata").is_file())?;
        Some(TesseractBackend::new(exe, tessdata))
    }
}
