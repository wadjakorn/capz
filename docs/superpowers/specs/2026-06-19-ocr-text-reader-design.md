# OCR Text Reader — Design

**Date:** 2026-06-19
**Status:** Approved (design); implementation plan to follow.
**Area:** Editor window (`src/components/editor`, `src-tauri/src`)

## Goal

Add an OCR "Detect text" tool to the editor. The user toggles it on to recognize
text in the current image, then selects and copies that text exactly like plain
text on a web page (native selection, right-click → Copy, ⌘C / Ctrl+C).

### Requirements (from request)

1. User can trigger detection of text in the image.
2. After detection, the recognized text can be highlighted (selected) and copied
   like plain text.
3. The detector can be toggled closed; detection result is **kept**. Re-toggling
   it on for the **same image** must **not** re-run detection (idempotency).
4. Loading a new image clears old detection state.

### Locked product decisions

- **Engine:** native on-device OCR in Rust — macOS Vision + Windows `Windows.Media.Ocr`. No cloud (matches app ethos), no JS WASM engine.
- **Trigger UI:** a toolbar **toggle** button, like the existing Ruler toggle. OCR is a read-overlay mode, not an annotation tool — it does not join the V/A/R/T tool palette.
- **Copy:** rely entirely on the **native OS text tools** — native selection, right-click → Copy, ⌘C / Ctrl+C. No custom "Copy all" button in v1.
- **Languages:** Latin + Thai, with graceful degradation where native Thai is unavailable (see §4).

## 1. UX behavior

The toggle button ("Detect text") sits in the editor toolbar, disabled when there
is no image.

- **Off** (default): normal editor; nothing changes.
- **On, first time for the current image:** button shows a scanning state; Rust
  runs OCR; an invisible selectable-text layer appears over the image. The user
  drag-selects words/lines and copies natively.
- **Off → On again, same image:** instant — reuses the cached result, no
  re-detection.
- **New image** (capture / paste / `editor:clear`): detection state is wiped and
  the toggle returns to off.

While **On**, the editor is in a read mode: annotation drawing is suspended (the
overlay intercepts the mouse for text selection). Zoom (⌘/Ctrl+wheel) and pan
(middle-mouse) still work. The overlay is pure DOM, so it never appears in
exported PNGs.

## 2. Selectable text layer (highlight & copy mechanism)

Use the proven PDF.js / macOS Live Text pattern: for each detected line, render a
block of `<span>` elements containing the **real recognized text**, styled
`color: transparent; user-select: text`, positioned so each word overlaps its
pixels. The browser provides selection, `::selection` highlight, and copy for
free — no custom clipboard code.

### Coordinate mapping

OCR runs on the temp PNG, whose pixels equal `image.naturalWidth/Height`, which
is exactly Konva's image space. `EditorStage` renders `<Stage>` inside a wrapper
div positioned at `left: padX, top: padY`, scaling the whole image by
`displayScale` (`scaleX/scaleY = scale`, size `imgW*scale × imgH*scale`).

Therefore the overlay is a **sibling of `<Stage>` in that same wrapper**, size
`stageW × stageH`. Each word box maps by a single multiply:

```
left   = box.x * scale
top    = box.y * scale
width  = box.w * scale
height = box.h * scale
fontSize ≈ box.h * scale
```

Because the overlay lives in the same positioned/scrolled coordinate space as the
stage, no scroll/pan tracking is needed — it just re-scales with `displayScale`.

Lines are block elements (newlines copy correctly); words within a line are
separated by spaces.

### Native copy plumbing

- `EditorStage.handleContextMenu` currently calls `preventDefault()` and shows a
  custom image Copy/Paste menu. It must **bail when the event target is inside
  the OCR layer** (e.g. `target.closest('[data-ocr-layer]')`), so the native
  text-copy context menu appears instead — the same way it already bails for
  `INPUT/TEXTAREA/contentEditable`.
- The existing global ⌘C handler in `editor/page.tsx` already returns early when
  `window.getSelection().toString()` is non-empty, so selected OCR text copies
  natively. No change needed there.

## 3. Native OCR engine

Rust async command (run on a blocking thread via `spawn_blocking`):

```
ocr_detect(path: String) -> OcrResult
```

```rust
struct OcrBox { x: f64, y: f64, w: f64, h: f64 } // top-left pixels, image space
struct OcrWord { text: String, box: OcrBox }
struct OcrLine { text: String, box: OcrBox, words: Vec<OcrWord> }
struct OcrResult {
    width: u32,
    height: u32,
    lines: Vec<OcrLine>,
    languages_used: Vec<String>,
    thai_available: bool,
}
```

Serde renames to camelCase for the TS side.

- **macOS:** `VNRecognizeTextRequest` via `objc2-vision`. Vision returns
  normalized boxes with a **bottom-left** origin; normalize to top-left pixels:
  `x = minX*W`, `y = (1 - maxY)*H`, `w = width*W`, `h = height*H`. Word boxes via
  `VNRecognizedText.boundingBox(for:)` over the top candidate's ranges.
- **Windows:** `Windows.Media.Ocr.OcrEngine` (the higher-level `windows` crate,
  not `windows-sys`). Lines → words come with pixel rects in the bitmap's space
  already; no flip needed.

### Backend isolation

Define an `OcrBackend` trait with the platform impls behind `cfg`. The pure
orchestration — language selection, box normalization, result assembly — is
implemented against the trait so it can be unit-tested with a fake backend on any
platform.

## 4. Thai degradation (honest handling)

Native Thai support varies: Windows requires the **Thai OCR language pack** to be
installed; Vision Thai requires a recent enough macOS.

- At detect time, query the engine's available recognition languages.
- Request English + Thai where Thai is available; otherwise fall back to
  English-only and set `thai_available = false`.
- Detection still returns all Latin text regardless.
- When `thai_available` is false, the UI shows a **one-time toast** ("Thai text
  recognition isn't available on this system") with a platform-specific hint
  (Windows: install the Thai language pack; macOS: requires a newer version).
- No tesseract fallback in v1 (native-only was chosen).

### 4.1 Mixed-script recognition (macOS) — post-smoke fix (2026-06-21)

First smoke test recognized Latin but **dropped every Thai-containing line**.
Root cause was *not* availability (macOS 26.5 lists `th-TH` in Vision's Accurate
recognizer): supplying `recognitionLanguages = ["en-US", "th-TH"]` makes Vision
treat the list as a **strict priority order**, and with English primary it
discards or garbles any line in a non-primary script. Verified empirically — five
Vision config variants on a mixed image: English-first (correction on *or* off)
yields 3/5 lines, Thai dropped; enabling `automaticallyDetectsLanguage` yields
5/5 with the same language list as hints.

**Fix:** set `VNRecognizeTextRequest.automaticallyDetectsLanguage = true` (keep
`usesLanguageCorrection = true` and the en/th hint list). Vision then detects the
script per text region while the hints still bias correction. Guarded by a
macOS-only integration test that runs the real Vision backend on a committed
mixed Latin+Thai fixture (`src-tauri/tests/fixtures/thai_latin.png`) and asserts
Thai lines survive — the original gap was that all prior Thai coverage used the
fake backend and never exercised real Vision.

## 5. State, idempotency, lifecycle

New `useOcr` Zustand store, separate from `useEditor`:

```
mode: boolean
status: 'idle' | 'scanning' | 'done' | 'error'
resultByKey: Map<string, OcrResult>   // key = current image path
currentKey: string | null
thaiNoticeShown: boolean
toggle(): void
detect(key): Promise<void>            // idempotent
reset(): void
```

- `detect(key)`: if `resultByKey` already has `key`, no-op (idempotency). Else set
  `status='scanning'`, `invoke('ocr_detect')`, cache the result, handle the Thai
  notice once.
- `reset()`: clears `mode`, `resultByKey`, `currentKey`, status.
- **New-image hook:** `applyFile` in `editor/page.tsx` already calls
  `resetEditor()`. Add `useOcr.getState().reset()` there. All image sources
  (capture, paste, `editor:clear`) route through `applyFile`, so this single call
  satisfies requirement 4.

## 6. Files

**Add (Rust):**
- `src-tauri/src/services/ocr/mod.rs` — trait, types, pure helpers.
- `src-tauri/src/services/ocr/macos.rs` (`cfg(target_os = "macos")`) — Vision.
- `src-tauri/src/services/ocr/windows.rs` (`cfg(target_os = "windows")`) — Windows OCR.
- `src-tauri/src/commands/ocr.rs` — `ocr_detect` async command.
- Register command in `src-tauri/src/lib.rs` invoke handler.
- Deps: `objc2-vision` (macOS target), `windows` crate with `Media_Ocr`,
  `Graphics_Imaging`, `Storage_Streams`, `Globalization` features (Windows target).

**Add (TS):**
- `src/lib/ocr.ts` — `detectText(path)` invoke wrapper + TS `OcrResult` types.
- `src/stores/ocr.ts` — `useOcr` store.
- `src/components/editor/OcrLayer.tsx` — selectable-span overlay.

**Edit:**
- `src/components/editor/Toolbar.tsx` — add toggle button (scanning state, disabled when `!hasImage`).
- `src/components/editor/EditorStage.tsx` — mount `OcrLayer` when `mode` on; context-menu bail for the OCR layer.
- `src/app/editor/page.tsx` — `useOcr.getState().reset()` in `applyFile`.

## 7. Testing

- **Rust unit:** Vision (bottom-left normalized → top-left pixel) and Windows
  (pixel rect) box normalization; language selection — all via the fake backend,
  platform-agnostic.
- **TS unit:** `useOcr` store — idempotent `detect` (second call for same key does
  not invoke), `reset` clears state; overlay geometry mapping (`box * scale`).
- **e2e (Playwright, light):** toggle on a fixture image → assert spans render
  with expected text; toggle off then on → assert `ocr_detect` is invoked only
  once.

## 8. Risks / call-outs

- Native Thai availability — handled by §4 degradation.
- Vision / Windows OCR FFI is the main new surface; isolated behind `OcrBackend`.
- Right-click must not let the custom image context menu swallow native text-copy
  over the layer (§2).
- Export is unaffected — the overlay is DOM, outside the Konva stage.
