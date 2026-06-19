# OCR Text Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toolbar "Detect text" toggle that runs native on-device OCR on the current editor image and overlays a transparent, natively-selectable text layer so the user can highlight and copy recognized text like plain web text.

**Architecture:** Rust runs OCR (macOS Vision / Windows `Windows.Media.Ocr`) behind an `OcrBackend` trait and returns top-left pixel-space boxes. A `useOcr` Zustand store caches results per image (idempotent re-toggle) and resets on every new image. `OcrLayer` renders one transparent `<span>` per word inside the Konva stage wrapper, mapping image boxes to screen by a single `* displayScale` multiply, so native browser selection + copy work for free.

**Tech Stack:** Tauri v2 + Rust, Next.js 15 static export, React 19, react-konva, Zustand 5, sonner (toasts), lucide-react (icons), Vitest (new — unit tests), Playwright (existing — e2e).

## Global Constraints

- Package manager is **pnpm 9** — never npm/yarn.
- Stack is locked: Tauri v2, Next.js static export, react-konva, Zustand 5. Do not substitute.
- **No `localStorage`/`sessionStorage`** anywhere. (OCR cache lives in-memory in the Zustand store only — it is intentionally not persisted.)
- OCR is **on-device only** — no network, no cloud, no telemetry.
- **Copy is native** — selection + right-click → Copy + ⌘C/Ctrl+C. Do not add a custom clipboard write for text.
- **Languages:** English + Thai, with graceful degradation when native Thai is unavailable (English-only result + one-time notice). No tesseract fallback in v1.
- Rust must pass `cargo clippy --all-targets -- -D warnings`.
- OCR boxes are **top-left origin, image-pixel space** (== `image.naturalWidth/Height` == Konva image space).
- Serde structs crossing IPC use **camelCase** field names (no ts-rs in this repo — TS types are hand-authored to match).

---

## File Structure

**New (Rust):**
- `src-tauri/src/services/ocr/mod.rs` — types, `OcrBackend` trait, pure helpers (`normalize_vision_box`, `pick_languages`, `run_detect`), `#[cfg(test)]` tests + `FakeBackend`.
- `src-tauri/src/services/ocr/macos.rs` — Vision impl (`cfg(target_os = "macos")`).
- `src-tauri/src/services/ocr/windows.rs` — Windows OCR impl (`cfg(target_os = "windows")`).
- `src-tauri/src/commands/ocr.rs` — `ocr_detect` async command.

**New (TS):**
- `src/lib/ocr.ts` — `OcrResult` types, `detectText(path)`, `ocrBoxStyle(box, scale)` geometry helper.
- `src/stores/ocr.ts` — `useOcr` store.
- `src/components/editor/OcrLayer.tsx` — transparent selectable overlay.
- `vitest.config.ts` — unit-test config.
- `src/lib/ocr.test.ts`, `src/stores/ocr.test.ts` — unit tests.
- `e2e/ocr.spec.ts` — e2e.

**Modified:**
- `src-tauri/src/services/mod.rs` — `pub mod ocr;`
- `src-tauri/src/commands/mod.rs` — `pub mod ocr;`
- `src-tauri/src/lib.rs` — register `commands::ocr::ocr_detect`.
- `src-tauri/Cargo.toml` — `objc2-vision` (macOS), `windows` (Windows) — added via `cargo add`.
- `package.json` — `vitest` devDep + `test:unit` script.
- `src/components/editor/Toolbar.tsx` — toggle button.
- `src/components/editor/EditorStage.tsx` — mount `OcrLayer`, context-menu bail.
- `src/app/editor/page.tsx` — `useOcr.getState().reset()` in `applyFile`.

---

## Task 1: Vitest harness

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `vitest.config.ts`
- Create: `src/lib/smoke.test.ts` (temporary, deleted in Step 6)

**Interfaces:**
- Produces: a working `pnpm test:unit` command (Vitest, node environment, `@`→`src` alias) that later tasks rely on.

- [ ] **Step 1: Add Vitest**

```bash
pnpm add -D vitest@^3
```

- [ ] **Step 2: Add the test script**

Edit `package.json` `scripts`, add after `"start": "next start",`:

```json
    "test:unit": "vitest run",
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `pnpm test:unit`
Expected: PASS — 1 passed.

- [ ] **Step 6: Remove the smoke test and commit**

```bash
rm src/lib/smoke.test.ts
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "test: add vitest unit-test harness"
```

---

## Task 2: Rust OCR core — types, trait, pure helpers

**Files:**
- Create: `src-tauri/src/services/ocr/mod.rs`
- Modify: `src-tauri/src/services/mod.rs`

**Interfaces:**
- Produces:
  - `struct OcrBox { x, y, w, h: f64 }` (serde camelCase), `OcrWord { text: String, box: OcrBox }` (serialized field name `box` → rename to `bbox` because `box` is a Rust keyword; see code), `OcrLine { text, bbox, words }`, `OcrResult { width: u32, height: u32, lines: Vec<OcrLine>, languages_used: Vec<String>, thai_available: bool }`.
  - `trait OcrBackend { fn available_languages(&self) -> Vec<String>; fn recognize(&self, image_path: &str, languages: &[String]) -> anyhow::Result<(u32, u32, Vec<OcrLine>)>; }`
  - `fn normalize_vision_box(min_x, min_y, w, h: f64, img_w, img_h: u32) -> OcrBox`
  - `fn pick_languages(available: &[String]) -> (Vec<String>, bool)`
  - `fn run_detect<B: OcrBackend>(backend: &B, image_path: &str) -> anyhow::Result<OcrResult>`

- [ ] **Step 1: Write failing tests**

Create `src-tauri/src/services/ocr/mod.rs`:

```rust
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
```

- [ ] **Step 2: Register the module**

Add to `src-tauri/src/services/mod.rs`:

```rust
pub mod ocr;
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd src-tauri && cargo test ocr::`
Expected: PASS — 4 tests.

Note: the `OcrBackend` trait is unused by non-test code until Task 3; if the build warns about dead code, that is expected and resolved in Task 3. Do not add `#[allow(dead_code)]` — the next task consumes it.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/ocr/mod.rs src-tauri/src/services/mod.rs
git commit -m "feat(ocr): core types, backend trait, and pure helpers"
```

---

## Task 3: `ocr_detect` command + platform dispatch

**Files:**
- Create: `src-tauri/src/commands/ocr.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs:119-147` (invoke handler list)

**Interfaces:**
- Consumes: `services::ocr::{OcrResult, run_detect, OcrBackend}`, and the platform backend constructors `services::ocr::macos::VisionBackend` / `services::ocr::windows::WindowsBackend` (created in Tasks 4–5; this task references them behind `cfg` and provides a fallback).
- Produces: Tauri command `ocr_detect(path: String) -> Result<OcrResult, String>`.

- [ ] **Step 1: Create the command**

Create `src-tauri/src/commands/ocr.rs`:

```rust
use crate::services::ocr::{run_detect, OcrResult};

/// Detect text in the image at `path`. Runs OCR on a blocking thread so the UI
/// stays responsive. Returns top-left pixel-space boxes in image coordinates.
#[tauri::command]
pub async fn ocr_detect(path: String) -> Result<OcrResult, String> {
    tauri::async_runtime::spawn_blocking(move || detect_blocking(&path))
        .await
        .map_err(|e| format!("ocr task join error: {e}"))?
}

fn detect_blocking(path: &str) -> Result<OcrResult, String> {
    #[cfg(target_os = "macos")]
    {
        let backend = crate::services::ocr::macos::VisionBackend::new();
        return run_detect(&backend, path).map_err(|e| e.to_string());
    }
    #[cfg(target_os = "windows")]
    {
        let backend = crate::services::ocr::windows::WindowsBackend::new();
        return run_detect(&backend, path).map_err(|e| e.to_string());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = path;
        Err("OCR is only supported on macOS and Windows".to_string())
    }
}
```

- [ ] **Step 2: Register the module**

Add to `src-tauri/src/commands/mod.rs`:

```rust
pub mod ocr;
```

- [ ] **Step 3: Register the command**

In `src-tauri/src/lib.rs`, inside `tauri::generate_handler![...]`, add after `commands::editor::show_settings_command,`:

```rust
            commands::ocr::ocr_detect,
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles. (Backends land in Tasks 4–5; on a platform whose backend module does not yet exist, this task is blocked on that platform's task — see Step 5.)

> Sequencing: implement Task 4 (macOS) and/or Task 5 (Windows) before `cargo check` succeeds on that platform. If developing on macOS, do Task 4 next; the `cfg(target_os = "windows")` branch is not compiled and won't block you.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ocr.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(ocr): ocr_detect command with platform dispatch"
```

---

## Task 4: macOS Vision backend

**Files:**
- Create: `src-tauri/src/services/ocr/macos.rs`
- Modify: `src-tauri/src/services/ocr/mod.rs` (add `#[cfg(target_os = "macos")] pub mod macos;`)
- Modify: `src-tauri/Cargo.toml` (via `cargo add`)

**Interfaces:**
- Consumes: `super::{OcrBackend, OcrBox, OcrLine, OcrWord, normalize_vision_box}`.
- Produces: `pub struct VisionBackend; impl VisionBackend { pub fn new() -> Self } impl OcrBackend for VisionBackend`.

**Reference:** Apple Vision `VNRecognizeTextRequest`, `VNImageRequestHandler(url:options:)`, `VNRecognizedTextObservation`, `supportedRecognitionLanguages(for:revision:)`. objc2 bindings: `objc2-vision` crate (matches existing `objc2` 0.6 / `objc2-foundation` 0.3). Vision boxes are normalized, bottom-left origin → use `normalize_vision_box`. This task has **no automated test** (FFI requires a real image + OS); acceptance is the manual smoke in Step 5.

- [ ] **Step 1: Add the Vision dependency**

```bash
cd src-tauri && cargo add objc2-vision --target 'cfg(target_os = "macos")'
```

If `cargo add` cannot resolve a version, pin explicitly: `cargo add objc2-vision@0.3 --target 'cfg(target_os = "macos")'`.

- [ ] **Step 2: Declare the module**

In `src-tauri/src/services/ocr/mod.rs`, add at the bottom (after the `tests` module):

```rust
#[cfg(target_os = "macos")]
pub mod macos;
```

- [ ] **Step 3: Implement the backend**

Create `src-tauri/src/services/ocr/macos.rs`:

```rust
//! macOS Vision OCR backend.
//!
//! Uses VNRecognizeTextRequest against a file URL. Vision returns observations
//! per line, each with a normalized bottom-left-origin bounding box and ranked
//! candidate strings. We take the top candidate and derive per-word boxes from
//! its character ranges via `boundingBoxForRange:`.

use super::{normalize_vision_box, OcrBackend, OcrBox, OcrLine, OcrWord};
use anyhow::{anyhow, Context};
use objc2_foundation::{NSArray, NSString, NSURL};
use objc2_vision::{
    VNImageRequestHandler, VNRecognizeTextRequest, VNRecognizedTextObservation,
    VNRequestTextRecognitionLevel,
};

pub struct VisionBackend;

impl VisionBackend {
    pub fn new() -> Self {
        VisionBackend
    }
}

impl OcrBackend for VisionBackend {
    fn available_languages(&self) -> Vec<String> {
        // Accurate-level supported languages for the current revision.
        unsafe {
            let req = VNRecognizeTextRequest::new();
            req.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
            match req.supportedRecognitionLanguagesAndReturnError() {
                Ok(arr) => arr.iter().map(|s| s.to_string()).collect(),
                Err(_) => vec!["en-US".to_string()],
            }
        }
    }

    fn recognize(
        &self,
        image_path: &str,
        languages: &[String],
    ) -> anyhow::Result<(u32, u32, Vec<OcrLine>)> {
        // Read pixel size up front (image space the boxes are denominated in).
        let dims = image::image_dimensions(image_path)
            .with_context(|| format!("read image dimensions: {image_path}"))?;
        let (img_w, img_h) = dims;

        unsafe {
            let url = NSURL::fileURLWithPath(&NSString::from_str(image_path));
            let handler = VNImageRequestHandler::initWithURL_options(
                VNImageRequestHandler::alloc(),
                &url,
                &objc2_foundation::NSDictionary::new(),
            );

            let request = VNRecognizeTextRequest::new();
            request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
            request.setUsesLanguageCorrection(true);
            let lang_ns: Vec<_> = languages.iter().map(|l| NSString::from_str(l)).collect();
            let refs: Vec<&NSString> = lang_ns.iter().map(|s| s.as_ref()).collect();
            request.setRecognitionLanguages(&NSArray::from_slice(&refs));

            let requests = NSArray::from_slice(&[request.as_ref()]);
            handler
                .performRequests_error(&requests)
                .map_err(|e| anyhow!("Vision performRequests failed: {e:?}"))?;

            let mut lines: Vec<OcrLine> = Vec::new();
            if let Some(results) = request.results() {
                for obs in results.iter() {
                    let obs: &VNRecognizedTextObservation = &obs;
                    let Some(candidate) = obs.topCandidates(1).first() else {
                        continue;
                    };
                    let text = candidate.string().to_string();
                    if text.trim().is_empty() {
                        continue;
                    }
                    let bb = obs.boundingBox();
                    let bbox = normalize_vision_box(
                        bb.origin.x, bb.origin.y, bb.size.width, bb.size.height, img_w, img_h,
                    );
                    // Per-word boxes: split the candidate string on whitespace and
                    // map each word's character range to a bounding box.
                    let words = word_boxes(&candidate, &text, img_w, img_h);
                    lines.push(OcrLine { text, bbox, words });
                }
            }
            Ok((img_w, img_h, lines))
        }
    }
}

/// Derive per-word boxes from a recognized-text candidate by mapping UTF-16
/// character ranges to Vision bounding boxes. Words that fail to map are skipped
/// (the line-level box still covers them).
unsafe fn word_boxes(
    candidate: &objc2_vision::VNRecognizedText,
    text: &str,
    img_w: u32,
    img_h: u32,
) -> Vec<OcrWord> {
    let mut out = Vec::new();
    let mut utf16_index = 0usize;
    for word in text.split_whitespace() {
        // Advance utf16_index to the start of this word.
        if let Some(byte_off) = text[..].find(word) {
            let _ = byte_off; // best-effort; see note below
        }
        let len = word.encode_utf16().count();
        let range = objc2_foundation::NSRange::new(utf16_index, len);
        if let Ok(box_obs) = candidate.boundingBoxForRange(range) {
            if let Some(box_obs) = box_obs {
                let bb = box_obs.boundingBox();
                out.push(OcrWord {
                    text: word.to_string(),
                    bbox: normalize_vision_box(
                        bb.origin.x, bb.origin.y, bb.size.width, bb.size.height, img_w, img_h,
                    ),
                });
            }
        }
        utf16_index += len + 1; // +1 for the single separating space (approx)
    }
    out
}
```

> Implementer note: the `objc2-vision` surface (method names like `performRequests_error`, `supportedRecognitionLanguagesAndReturnError`, `boundingBoxForRange`) must be checked against the installed crate version's docs (`cargo doc -p objc2-vision --open`) — autocomplete/exact signatures may differ slightly by version. Keep the behavior identical: set Accurate level, set languages, run, read `topCandidates(1)`, convert boxes with `normalize_vision_box`. If per-word ranges prove unreliable for a version, ship line-level boxes only (`words: vec![]`) — the overlay (Task 8) handles empty `words` by making the whole line selectable.

- [ ] **Step 4: Verify it compiles (on macOS)**

Run: `cd src-tauri && cargo check && cargo clippy --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 5: Manual smoke test**

Run `pnpm tauri dev`, capture or paste a screenshot containing English text, then in the editor devtools console run:

```js
const { invoke } = await import("@tauri-apps/api/core");
const path = await invoke("editor_current_image");
console.log(await invoke("ocr_detect", { path }));
```

Expected: an object with `width`, `height`, non-empty `lines[]` whose `text` matches visible text, `bbox` values within `[0,width]×[0,height]`, and `thaiAvailable` a boolean.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/ocr/macos.rs src-tauri/src/services/ocr/mod.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(ocr): macOS Vision backend"
```

---

## Task 5: Windows OCR backend

**Files:**
- Create: `src-tauri/src/services/ocr/windows.rs`
- Modify: `src-tauri/src/services/ocr/mod.rs` (add `#[cfg(target_os = "windows")] pub mod windows;`)
- Modify: `src-tauri/Cargo.toml` (via `cargo add`)

**Interfaces:**
- Consumes: `super::{OcrBackend, OcrBox, OcrLine, OcrWord}`.
- Produces: `pub struct WindowsBackend; impl WindowsBackend { pub fn new() -> Self } impl OcrBackend for WindowsBackend`.

**Reference:** WinRT `Windows.Media.Ocr.OcrEngine` (`TryCreateFromLanguage`, `AvailableRecognizerLanguages`, `RecognizeAsync`), `Windows.Graphics.Imaging.{BitmapDecoder, SoftwareBitmap}`, `Windows.Storage.{StorageFile}` or `Windows.Storage.Streams`, `Windows.Globalization.Language`. Windows OCR returns lines → words with **pixel rects** (`BoundingRect`) in the bitmap's pixel space — top-left origin, no flip. **Skip this task if you are not developing on Windows**; it is `cfg`-gated and the macOS build is unaffected. No automated test — manual smoke in Step 5.

- [ ] **Step 1: Add the windows crate**

```bash
cd src-tauri && cargo add windows --target 'cfg(target_os = "windows")' --features Media_Ocr,Graphics_Imaging,Storage,Storage_Streams,Globalization,Foundation,Foundation_Collections
```

- [ ] **Step 2: Declare the module**

In `src-tauri/src/services/ocr/mod.rs`, add:

```rust
#[cfg(target_os = "windows")]
pub mod windows;
```

- [ ] **Step 3: Implement the backend**

Create `src-tauri/src/services/ocr/windows.rs`:

```rust
//! Windows OCR backend via Windows.Media.Ocr.
//!
//! Decodes the image to a SoftwareBitmap, runs OcrEngine.RecognizeAsync, and
//! maps each line/word's pixel BoundingRect directly into image space (no
//! origin flip — Windows uses top-left).

use super::{OcrBackend, OcrBox, OcrLine, OcrWord};
use anyhow::{anyhow, Context};
use windows::core::HSTRING;
use windows::Globalization::Language;
use windows::Graphics::Imaging::BitmapDecoder;
use windows::Media::Ocr::OcrEngine;
use windows::Storage::{FileAccessMode, StorageFile};

pub struct WindowsBackend;

impl WindowsBackend {
    pub fn new() -> Self {
        WindowsBackend
    }
}

fn rect_to_box(r: windows::Foundation::Rect) -> OcrBox {
    OcrBox {
        x: r.X as f64,
        y: r.Y as f64,
        w: r.Width as f64,
        h: r.Height as f64,
    }
}

impl OcrBackend for WindowsBackend {
    fn available_languages(&self) -> Vec<String> {
        match OcrEngine::AvailableRecognizerLanguages() {
            Ok(langs) => langs
                .into_iter()
                .filter_map(|l| l.LanguageTag().ok().map(|t| t.to_string()))
                .collect(),
            Err(_) => vec!["en-US".to_string()],
        }
    }

    fn recognize(
        &self,
        image_path: &str,
        languages: &[String],
    ) -> anyhow::Result<(u32, u32, Vec<OcrLine>)> {
        // Pick the first requested language the engine can honor; fall back to
        // the user-profile engine.
        let engine = languages
            .iter()
            .find_map(|tag| {
                let lang = Language::CreateLanguage(&HSTRING::from(tag)).ok()?;
                OcrEngine::TryCreateFromLanguage(&lang).ok().flatten()
            })
            .or_else(|| OcrEngine::TryCreateFromUserProfileLanguages().ok().flatten())
            .ok_or_else(|| anyhow!("no usable OCR engine"))?;

        let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(image_path))
            .context("open file")?
            .get()
            .context("await file")?;
        let stream = file
            .OpenAsync(FileAccessMode::Read)
            .context("open stream")?
            .get()
            .context("await stream")?;
        let decoder = BitmapDecoder::CreateAsync(&stream)
            .context("create decoder")?
            .get()
            .context("await decoder")?;
        let bitmap = decoder
            .GetSoftwareBitmapAsync()
            .context("get bitmap")?
            .get()
            .context("await bitmap")?;
        let img_w = bitmap.PixelWidth().unwrap_or(0).max(0) as u32;
        let img_h = bitmap.PixelHeight().unwrap_or(0).max(0) as u32;

        let result = engine
            .RecognizeAsync(&bitmap)
            .context("recognize")?
            .get()
            .context("await recognize")?;

        let mut lines = Vec::new();
        for line in result.Lines()?.into_iter() {
            let text = line.Text()?.to_string();
            if text.trim().is_empty() {
                continue;
            }
            let mut words = Vec::new();
            let mut minx = f64::MAX;
            let mut miny = f64::MAX;
            let mut maxx = f64::MIN;
            let mut maxy = f64::MIN;
            for w in line.Words()?.into_iter() {
                let r = w.BoundingRect()?;
                let b = rect_to_box(r);
                minx = minx.min(b.x);
                miny = miny.min(b.y);
                maxx = maxx.max(b.x + b.w);
                maxy = maxy.max(b.y + b.h);
                words.push(OcrWord { text: w.Text()?.to_string(), bbox: b });
            }
            let bbox = if words.is_empty() {
                OcrBox { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }
            } else {
                OcrBox { x: minx, y: miny, w: maxx - minx, h: maxy - miny }
            };
            lines.push(OcrLine { text, bbox, words });
        }
        Ok((img_w, img_h, lines))
    }
}
```

- [ ] **Step 4: Verify it compiles (on Windows)**

Run: `cd src-tauri && cargo check && cargo clippy --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 5: Manual smoke test**

Same console snippet as Task 4 Step 5, on Windows. Expected: non-empty `lines[]` with pixel `bbox` values. If `thaiAvailable` is false on a machine without the Thai language pack, that is correct — verify the English text still returns.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/ocr/windows.rs src-tauri/src/services/ocr/mod.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(ocr): Windows OCR backend"
```

---

## Task 6: TS OCR client, types, and geometry helper

**Files:**
- Create: `src/lib/ocr.ts`
- Create: `src/lib/ocr.test.ts`

**Interfaces:**
- Produces:
  - Types `OcrBox`, `OcrWord`, `OcrLine`, `OcrResult` (camelCase mirror of the Rust structs).
  - `async function detectText(path: string): Promise<OcrResult>` — invokes `ocr_detect`.
  - `function ocrBoxStyle(box: OcrBox, scale: number): { left: number; top: number; width: number; height: number; fontSize: number }`.

- [ ] **Step 1: Write failing tests**

Create `src/lib/ocr.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { detectText, ocrBoxStyle } from "./ocr";

beforeEach(() => invoke.mockReset());

describe("ocrBoxStyle", () => {
  it("scales an image-space box to screen pixels", () => {
    const s = ocrBoxStyle({ x: 10, y: 20, w: 100, h: 30 }, 2);
    expect(s).toEqual({ left: 20, top: 40, width: 200, height: 60, fontSize: 60 });
  });
});

describe("detectText", () => {
  it("invokes ocr_detect with the path", async () => {
    const fake = { width: 1, height: 1, lines: [], languagesUsed: ["en-US"], thaiAvailable: true };
    invoke.mockResolvedValue(fake);
    const r = await detectText("/tmp/x.png");
    expect(invoke).toHaveBeenCalledWith("ocr_detect", { path: "/tmp/x.png" });
    expect(r).toBe(fake);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit src/lib/ocr.test.ts`
Expected: FAIL — cannot find module `./ocr`.

- [ ] **Step 3: Implement the client**

Create `src/lib/ocr.ts`:

```ts
export type OcrBox = { x: number; y: number; w: number; h: number };
export type OcrWord = { text: string; bbox: OcrBox };
export type OcrLine = { text: string; bbox: OcrBox; words: OcrWord[] };
export type OcrResult = {
  width: number;
  height: number;
  lines: OcrLine[];
  languagesUsed: string[];
  thaiAvailable: boolean;
};

/** Run native OCR on the image at `path`. Boxes are top-left image-pixel space. */
export async function detectText(path: string): Promise<OcrResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<OcrResult>("ocr_detect", { path });
}

/** Map an image-space box to screen pixels for the overlay (`displayScale`). */
export function ocrBoxStyle(box: OcrBox, scale: number) {
  return {
    left: box.x * scale,
    top: box.y * scale,
    width: box.w * scale,
    height: box.h * scale,
    fontSize: box.h * scale,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit src/lib/ocr.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ocr.ts src/lib/ocr.test.ts
git commit -m "feat(ocr): TS client, types, and geometry helper"
```

---

## Task 7: `useOcr` store (idempotency, reset, Thai notice)

**Files:**
- Create: `src/stores/ocr.ts`
- Create: `src/stores/ocr.test.ts`

**Interfaces:**
- Consumes: `detectText` from `@/lib/ocr`, `toast` from `sonner`.
- Produces store `useOcr` with state `{ mode: boolean; status: "idle"|"scanning"|"done"|"error"; resultByKey: Record<string, OcrResult>; currentKey: string|null; thaiNoticeShown: boolean }` and actions:
  - `setKey(key: string|null): void` — sets the active image key (does not detect).
  - `toggle(): Promise<void>` — flips `mode`; on enabling, calls `detect()`.
  - `detect(): Promise<void>` — idempotent for `currentKey`.
  - `reset(): void` — clears everything to initial.
  - selector `currentResult(state): OcrResult | null`.

- [ ] **Step 1: Write failing tests**

Create `src/stores/ocr.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const detectText = vi.fn();
vi.mock("@/lib/ocr", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ocr")>("@/lib/ocr");
  return { ...actual, detectText: (...a: unknown[]) => detectText(...a) };
});
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { message: (...a: unknown[]) => toast(...a) }) }));

import { useOcr } from "./ocr";

const fake = (text: string, thai = true) => ({
  width: 10, height: 10, lines: [{ text, bbox: { x: 0, y: 0, w: 1, h: 1 }, words: [] }],
  languagesUsed: ["en-US"], thaiAvailable: thai,
});

beforeEach(() => {
  detectText.mockReset();
  toast.mockReset();
  useOcr.getState().reset();
});

describe("useOcr", () => {
  it("detects once and caches per key", async () => {
    detectText.mockResolvedValue(fake("hello"));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    await useOcr.getState().detect(); // second call must NOT re-invoke
    expect(detectText).toHaveBeenCalledTimes(1);
    expect(useOcr.getState().resultByKey["/img/a.png"].lines[0].text).toBe("hello");
    expect(useOcr.getState().status).toBe("done");
  });

  it("re-detects for a different key", async () => {
    detectText.mockResolvedValue(fake("a"));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    detectText.mockResolvedValue(fake("b"));
    useOcr.getState().setKey("/img/b.png");
    await useOcr.getState().detect();
    expect(detectText).toHaveBeenCalledTimes(2);
  });

  it("reset clears mode, results, and key", async () => {
    detectText.mockResolvedValue(fake("x"));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().toggle(); // enables + detects
    expect(useOcr.getState().mode).toBe(true);
    useOcr.getState().reset();
    expect(useOcr.getState().mode).toBe(false);
    expect(useOcr.getState().currentKey).toBe(null);
    expect(Object.keys(useOcr.getState().resultByKey)).toHaveLength(0);
  });

  it("shows the Thai notice once when Thai is unavailable", async () => {
    detectText.mockResolvedValue(fake("x", false));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    useOcr.getState().setKey("/img/b.png");
    await useOcr.getState().detect();
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit src/stores/ocr.test.ts`
Expected: FAIL — cannot find module `./ocr`.

- [ ] **Step 3: Implement the store**

Create `src/stores/ocr.ts`:

```ts
"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { detectText, type OcrResult } from "@/lib/ocr";

type Status = "idle" | "scanning" | "done" | "error";

type State = {
  mode: boolean;
  status: Status;
  resultByKey: Record<string, OcrResult>;
  currentKey: string | null;
  thaiNoticeShown: boolean;

  setKey: (key: string | null) => void;
  toggle: () => Promise<void>;
  detect: () => Promise<void>;
  reset: () => void;
};

const isWindows =
  typeof navigator !== "undefined" && /Win/i.test(navigator.platform);

export const useOcr = create<State>((set, get) => ({
  mode: false,
  status: "idle",
  resultByKey: {},
  currentKey: null,
  thaiNoticeShown: false,

  setKey: (key) => set({ currentKey: key }),

  toggle: async () => {
    const next = !get().mode;
    set({ mode: next });
    if (next) await get().detect();
  },

  detect: async () => {
    const { currentKey, resultByKey } = get();
    if (!currentKey) return;
    if (resultByKey[currentKey]) {
      set({ status: "done" });
      return;
    }
    set({ status: "scanning" });
    try {
      const result = await detectText(currentKey);
      set((s) => ({
        status: "done",
        resultByKey: { ...s.resultByKey, [currentKey]: result },
      }));
      if (!result.thaiAvailable && !get().thaiNoticeShown) {
        set({ thaiNoticeShown: true });
        toast(
          "Thai text recognition isn't available on this system" +
            (isWindows
              ? " — install the Thai language pack in Windows Settings."
              : " — it requires a newer macOS version."),
        );
      }
    } catch (e) {
      console.error("ocr_detect failed", e);
      set({ status: "error" });
      toast.error?.("Text detection failed");
    }
  },

  reset: () =>
    set({
      mode: false,
      status: "idle",
      resultByKey: {},
      currentKey: null,
      // thaiNoticeShown intentionally NOT reset — notice stays once-per-session.
    }),
}));

export const currentResult = (s: State): OcrResult | null =>
  s.currentKey ? s.resultByKey[s.currentKey] ?? null : null;
```

> Note on the test's `toast` mock: `toast.error?.` is optional-chained so the mock without an `error` method still passes the error test path; the success/notice path uses `toast(...)` directly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit src/stores/ocr.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stores/ocr.ts src/stores/ocr.test.ts
git commit -m "feat(ocr): useOcr store with idempotent detect and reset"
```

---

## Task 8: `OcrLayer` overlay component

**Files:**
- Create: `src/components/editor/OcrLayer.tsx`

**Interfaces:**
- Consumes: `useOcr`, `currentResult` from `@/stores/ocr`; `ocrBoxStyle` from `@/lib/ocr`.
- Produces: `export function OcrLayer({ scale }: { scale: number })` — renders nothing unless `useOcr.mode` is on and a result exists for the current key.

- [ ] **Step 1: Implement the component**

Create `src/components/editor/OcrLayer.tsx`:

```tsx
"use client";

import { useOcr, currentResult } from "@/stores/ocr";
import { ocrBoxStyle } from "@/lib/ocr";

/**
 * Transparent, natively-selectable text overlay aligned to the Konva image.
 * Mounted as a sibling of <Stage> inside the same positioned wrapper, so an
 * image-space box maps to screen by a single `* scale` (displayScale) multiply.
 * Pure DOM — never appears in exported PNGs. Native selection + copy work
 * because the spans contain the real text (rendered transparent).
 */
export function OcrLayer({ scale }: { scale: number }) {
  const mode = useOcr((s) => s.mode);
  const result = useOcr(currentResult);

  if (!mode || !result) return null;

  return (
    <div
      data-ocr-layer
      className="absolute left-0 top-0 select-text"
      style={{
        width: result.width * scale,
        height: result.height * scale,
        cursor: "text",
        // Above the Konva canvas; below toolbar/menus.
        zIndex: 5,
      }}
    >
      {result.lines.map((line, li) => {
        // When word boxes exist, place each word; otherwise place the whole
        // line as one selectable block (line-level fallback).
        const units =
          line.words.length > 0
            ? line.words
            : [{ text: line.text, bbox: line.bbox }];
        return units.map((u, wi) => {
          const s = ocrBoxStyle(u.bbox, scale);
          return (
            <span
              key={`${li}-${wi}`}
              style={{
                position: "absolute",
                left: s.left,
                top: s.top,
                height: s.height,
                fontSize: s.fontSize,
                lineHeight: `${s.height}px`,
                color: "transparent",
                whiteSpace: "pre",
                userSelect: "text",
                // Trailing space so word-to-word copy is space-separated;
                // block-per-line below preserves newlines.
              }}
            >
              {u.text}
              {wi < units.length - 1 ? " " : "\n"}
            </span>
          );
        });
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from `OcrLayer.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/OcrLayer.tsx
git commit -m "feat(ocr): selectable text overlay component"
```

---

## Task 9: Toolbar "Detect text" toggle

**Files:**
- Modify: `src/components/editor/Toolbar.tsx`

**Interfaces:**
- Consumes: `useOcr` from `@/stores/ocr`; existing `ToolButton`, `useEditor` (`hasImage`).
- Produces: a toggle button wired to `useOcr.toggle()`.

- [ ] **Step 1: Import the icon and store**

In `src/components/editor/Toolbar.tsx`, add `ScanText` to the existing `lucide-react` import block (alongside `Ruler`):

```tsx
  ScanText,
```

Add below the other store imports (near `import { useSettings } ...`):

```tsx
import { useOcr } from "@/stores/ocr";
```

- [ ] **Step 2: Read store state in the component**

Inside `Toolbar(...)`, near the other `useEditor`/`useSettings` selector calls (after `const hasImage = useEditor((s) => s.hasImage);`), add:

```tsx
  const ocrMode = useOcr((s) => s.mode);
  const ocrStatus = useOcr((s) => s.status);
  const toggleOcr = useOcr((s) => s.toggle);
```

- [ ] **Step 3: Render the toggle next to the Ruler toggle**

In the JSX, immediately after the Ruler `ToolButton` block (the `<ToolButton icon={Ruler} ... />` and its following `<Divider />`), insert:

```tsx
        {/* OCR detect-text toggle */}
        <ToolButton
          icon={ScanText}
          label={
            !hasImage
              ? "Detect text (load an image first)"
              : ocrStatus === "scanning"
                ? "Detecting text…"
                : ocrMode
                  ? "Hide detected text"
                  : "Detect text"
          }
          pressed={ocrMode}
          disabled={!hasImage || ocrStatus === "scanning"}
          onClick={() => void toggleOcr()}
        />
        <Divider />
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/Toolbar.tsx
git commit -m "feat(ocr): toolbar detect-text toggle"
```

---

## Task 10: EditorStage integration + new-image reset

**Files:**
- Modify: `src/components/editor/EditorStage.tsx`
- Modify: `src/app/editor/page.tsx`

**Interfaces:**
- Consumes: `OcrLayer` from `./OcrLayer`; `useOcr` from `@/stores/ocr`.
- Produces: the overlay rendered in the stage wrapper; the current image key pushed into `useOcr`; OCR reset on new image; context-menu bail over the layer.

- [ ] **Step 1: Import OcrLayer and the store in EditorStage**

In `src/components/editor/EditorStage.tsx`, add near the other component imports (after `import { Rulers } ...`):

```tsx
import { OcrLayer } from "@/components/editor/OcrLayer";
import { useOcr } from "@/stores/ocr";
```

- [ ] **Step 2: Mount OcrLayer as a sibling of `<Stage>`**

In `EditorStage`, find the wrapper `<div style={{ position: "absolute", left: padX, top: padY }}>` that contains `<Stage>...</Stage>`. Immediately **after** the closing `</Stage>` (and before that div closes), add:

```tsx
        <OcrLayer scale={scale} />
```

- [ ] **Step 3: Bail the custom context menu over the OCR layer**

In `handleContextMenu`, replace the existing guard:

```tsx
  function handleContextMenu(e: React.MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
      return; // keep native menu for real text fields
    }
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }
```

with:

```tsx
  function handleContextMenu(e: React.MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
      return; // keep native menu for real text fields
    }
    // Over the OCR text layer, let the native Copy menu handle the selection.
    if (t && t.closest("[data-ocr-layer]")) {
      return;
    }
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }
```

- [ ] **Step 4: Push the image key into the OCR store**

In `src/app/editor/page.tsx`, add the import near the other store imports (after `import { useEditor } ...`):

```tsx
import { useOcr } from "@/stores/ocr";
```

In `applyFile`, update both branches. Replace:

```tsx
    if (!path) {
      setFile(null);
      setSrc("");
      resetEditor();
      setHasImage(false);
      return;
    }
```

with:

```tsx
    if (!path) {
      setFile(null);
      setSrc("");
      resetEditor();
      useOcr.getState().reset();
      setHasImage(false);
      return;
    }
```

And after the existing `resetEditor();` call in the non-null branch (the one followed by `setHasImage(true);`), add:

```tsx
    useOcr.getState().reset();
    useOcr.getState().setKey(path);
```

- [ ] **Step 5: Type-check and lint**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

Run `pnpm tauri dev`. Capture a screenshot with text. Then:
1. Click **Detect text** → spinner, then text becomes selectable; drag-select a phrase; ⌘C/Ctrl+C → paste into a notes app → matches.
2. Right-click the selection → native **Copy** appears (not the image Copy/Paste menu).
3. Toggle off → overlay hides. Toggle on → instant (no spinner = no re-detect).
4. Capture a **new** image → toggle is off, no stale overlay; enabling re-detects the new image.
5. Save/Copy the image (toolbar) → exported PNG has **no** transparent text artifacts.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/EditorStage.tsx src/app/editor/page.tsx
git commit -m "feat(ocr): wire overlay into editor + reset detection on new image"
```

---

## Task 11: e2e coverage

**Files:**
- Create: `e2e/ocr.spec.ts`

**Interfaces:**
- Consumes: existing Playwright `web` project config (`e2e/playwright.config.ts`) and its app-loading conventions.

> Before writing, read `e2e/playwright.config.ts` and one existing spec in `e2e/` to match how the editor is loaded, how the Tauri `invoke` bridge is stubbed in the `web` project, and how a test image is provided. Mirror those patterns — do not invent a new harness. The test below is a template to adapt to the existing fixtures.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/ocr.spec.ts` (adapt selectors/stubs to the existing harness):

```ts
import { test, expect } from "@playwright/test";

// Adapt: load the editor with a known image the way other specs do, and stub
// the `ocr_detect` invoke to return a fixed result so the web project needs no
// native OCR. Assert the overlay renders and detection is idempotent.
test("OCR overlay renders detected text and re-toggles without re-detecting", async ({ page }) => {
  let detectCalls = 0;
  await page.exposeFunction("__countOcrDetect", () => { detectCalls += 1; });

  // (Stub the Tauri invoke bridge for ocr_detect per the existing web harness;
  // the stub should call window.__countOcrDetect() and resolve a result with
  // one line "Hello world" before the editor mounts.)

  // ...load editor with a test image per existing specs...

  await page.getByRole("button", { name: /detect text/i }).click();
  const layer = page.locator("[data-ocr-layer]");
  await expect(layer).toContainText("Hello");

  // Toggle off then on — must not invoke ocr_detect again.
  await page.getByRole("button", { name: /hide detected text/i }).click();
  await page.getByRole("button", { name: /detect text/i }).click();
  expect(detectCalls).toBe(1);
});
```

- [ ] **Step 2: Run the web e2e project**

Run: `pnpm test:e2e:web e2e/ocr.spec.ts`
Expected: PASS. If the existing harness cannot stub `invoke`, fall back to asserting only the toggle's disabled/enabled and pressed states with no image vs. with a stubbed image, and leave a `test.todo` documenting the selection-copy path as manual (Task 10 Step 6).

- [ ] **Step 3: Commit**

```bash
git add e2e/ocr.spec.ts
git commit -m "test(ocr): e2e overlay render + idempotent re-toggle"
```

---

## Task 12: Full verification + progress log

**Files:**
- Modify: `PROGRESS-FEATURE.md`

- [ ] **Step 1: Run the whole unit + lint suite**

```bash
pnpm test:unit
pnpm exec tsc --noEmit
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cd ..
```

Expected: all green.

- [ ] **Step 2: Log the feature**

Append a dated entry to `PROGRESS-FEATURE.md` describing the OCR text reader (engine, toggle, native copy, Thai degradation, idempotent cache, reset-on-new-image), matching the file's existing format (read it first).

- [ ] **Step 3: Commit**

```bash
git add PROGRESS-FEATURE.md
git commit -m "docs(progress): log OCR text reader feature"
```

---

## Self-Review

**Spec coverage:**
- Req 1 (trigger detection): Task 9 toggle → Task 7 `detect()` → Task 3 command → Tasks 4/5 backends. ✓
- Req 2 (highlight & copy like plain text): Task 8 transparent-span overlay + Task 10 context-menu bail; native selection/copy. ✓
- Req 3 (toggle closed, keep detection, idempotent re-toggle): Task 7 `resultByKey` cache + `mode` flag; test asserts single invoke. ✓
- Req 4 (new image clears state): Task 10 `useOcr.reset()` in both `applyFile` branches; Task 7 test covers `reset`. ✓
- Native engine (macOS Vision + Windows OCR): Tasks 4, 5. ✓
- Toolbar toggle (not palette): Task 9. ✓
- Native copy only: Tasks 8/10, no custom clipboard write. ✓
- Latin + Thai + degradation: `pick_languages` (Task 2), `thaiAvailable` notice (Task 7). ✓

**Placeholder scan:** Platform FFI tasks (4, 5) carry concrete code plus an explicit "verify against the installed crate version" note and manual acceptance — intentional, as native OCR cannot be unit-tested in CI. Task 11 is explicitly a template-to-adapt against the existing e2e harness (must read it first). No "TBD"/"handle edge cases" placeholders remain.

**Type consistency:** Rust `OcrBox/OcrWord/OcrLine/OcrResult` (field `bbox`, `thai_available`→`thaiAvailable`, `languages_used`→`languagesUsed`) match the TS mirror in Task 6 and the store/overlay usage in Tasks 7–8. `detectText`, `ocrBoxStyle`, `useOcr` (`mode`, `status`, `resultByKey`, `currentKey`, `setKey`, `toggle`, `detect`, `reset`, `currentResult`) are used consistently across Tasks 6–10. `ocr_detect` arg name `path` matches between Rust command, TS client, and manual smoke. ✓
