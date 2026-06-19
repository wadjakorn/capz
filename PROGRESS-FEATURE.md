# PROGRESS-FEATURE — feature tracker

Split from [PROGRESS-NEXT.md](PROGRESS-NEXT.md). Index: [BUG](PROGRESS-BUG.md) · [COSMETIC](PROGRESS-COSMETIC.md).

Open items first (actionable for agents). Landed history archived — see below.

## Open

- [x] **OCR text reader** — native on-device OCR (macOS Vision + Windows.Media.Ocr) behind an `OcrBackend` trait; toolbar "Detect text" toggle; transparent selectable overlay (`data-ocr-layer`) → native selection + right-click/⌘C copy; Latin+Thai with graceful degradation (one-time notice when native Thai unavailable); idempotent per-image result cache (re-toggle doesn't re-detect); detection cleared on every new image. Windows build + interactive macOS smoke (detect→select→copy, export-has-no-text-artifacts) pending verification.
- [ ] **Copy/paste annotation elements** — duplicate any overlay element (arrow, text, sticker, blur rect, pin) via `⌘C` / `⌘V` on the editor stage. Preserve type + style; offset paste position so it's visible.
- [ ] **Auto-shrink large captures** — cap exported image at a configurable max dimension (default e.g. 2560px long edge) to keep file sizes sane on 5K/6K displays. Setting lives in Output tab; "Original" option to disable.
- [ ] **Layout-independent global shortcuts** — bind hotkeys by physical key (USB HID / ANSI/ISO position) rather than the typed character, so `⌘⇧P` still fires when the active input source is Thai (where the same physical key produces `ญ`), Russian, Dvorak, etc. `tauri-plugin-global-shortcut` resolves accelerators by Unicode char on most paths, so a US-layout binding silently breaks when the user switches IME. Investigate: macOS `kVK_*` keycodes via `CGEventSourceKeyboardType` / `UCKeyTranslate` round-trip, Windows `MapVirtualKey(MAPVK_VSC_TO_VK)` with scancodes. Likely needs a custom shortcut layer below the plugin, or upstream patch. Settings UI should display the layout-localized label for the bound physical key.

## Landed

Archived: [docs/archive/PROGRESS-FEATURE-LANDED.md](docs/archive/PROGRESS-FEATURE-LANDED.md).
