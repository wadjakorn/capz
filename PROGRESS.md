# Progress

Tracks phase completion + deviations from [PLAN.md](PLAN.md). Update as phases land.

## Phases

- [x] Phase 0 — bootstrap (Tauri+Next scaffold, Tailwind 4, shadcn, static export)
- [x] Phase 1 — tray menu wiring
- [x] Phase 2 — settings window + config store
- [x] Phase 3 — global hotkey registration
- [x] Phase 4 — screen capture service
- [x] Phase 5 — area-selection overlay
- [x] Phase 6 — image editor
  - [x] 6a editor window spawner + skeleton
  - [x] 6b state store + toolbar
  - [x] 6c basic tools (text, arrow, rect)
  - [x] 6d blur + sticker
  - [x] 6e numbered pin + continuity
  - [x] 6f acceptance + commit
- [x] Phase 7 — output (file/clipboard/both)
- [ ] Phase 8 — onboarding (TCC)
- [ ] Phase 9 — autostart
- [ ] Phase 10 — updater
- [ ] Phase 11 — packaging/signing
- [ ] Phase 12 — telemetry decision + ship

## Deviations from PLAN.md

Things added or changed during build that PLAN.md did not specify. Cross-reference when planning later phases.

### Phase 6

- **`tools` config block** (new). PLAN.md §2 schema only had `pins.defaultColor/defaultSize`. Extended `AppConfig.tools` with `strokeColor`, `rect.strokeWidth`, `arrow.strokeWidth`, `text.fontSize`, `text.color`, `blur.blurRadius`, `sticker.fontSize`. File: [src/lib/config.ts](src/lib/config.ts).
- **Settings "Tools" tab** (new). PLAN.md §2 tabs list = Shortcuts / Output / Pins / General. Added Tools tab for the block above. File: [src/app/settings/page.tsx](src/app/settings/page.tsx).
- **Settings global "Saved" flash toast** (UX, not specced). Watches config signature, flashes top-right chip on any change.
- **Toolbar pin row inline flash toast** (UX, not specced). Feedback for Save/Clear/Continue/Next-input.
- **Pin toolbar: Save + Clear replace single "Reset" button** (semantic change). PLAN.md §6 line 697 specced one `Reset` → counter = defaultStartNumber. Split:
  - `Save` = persist current as `lastUsedNumber` (no UI counter change).
  - `Clear` = reset persisted `lastUsedNumber = defaultStart-1` + flip `continuityMode = 'reset'` + reset session counter.
- **Toolbar "Next" number input** (new). Manual override of session counter mid-canvas. Not in PLAN.
- **Pin counter wired to undo/redo** via `Snapshot = {annotations, nextPinNumber}`. PLAN.md §6 didn't specify counter atomicity with action stack.
- **`editor.json` capability granted `store:default`**. PLAN.md §6 capability list omitted; needed because editor reads `pins.*` defaults from store. File: [src-tauri/capabilities/editor.json](src-tauri/capabilities/editor.json).
- **Inline color picker in editor toolbar** (new UX). PLAN.md §6 only specified per-tool default colors via Settings. Toolbar now exposes a context-sensitive color input: edits the selected annotation when one is selected (rect/arrow `stroke`, text `fill`, pin `color`), else writes the default for the active tool back to settings. File: [src/components/editor/Toolbar.tsx](src/components/editor/Toolbar.tsx).
- **Init-once guard pattern** in `EditorStage` for async settings load (`pinInit` ref). Prevents re-derivation overwriting session counter on subsequent settings mutations. PLAN.md didn't address bootstrap order.

### Phase 7

- **`output.defaultMode` union changed** from PLAN.md's `"file" | "clipboard" | "ask"` to **`"file" | "clipboard" | "both"`**. Resolved §9: no modal prompt, deterministic behavior. Default = `clipboard`.
- **Export pipeline runs entirely client-side** via Konva `stage.toDataURL` → bytes → `@tauri-apps/plugin-{dialog,fs,clipboard-manager}`. No Rust export commands. Avoids cross-boundary buffer copies for already-canvas data.
- **`pixelRatio = 1 / stage.scaleX()`** on export so output dimensions equal the source image's natural (physical) pixels regardless of fit-to-window scale. Overrides PLAN.md §5.1 generic `pixelRatio: 2`.
- **Stage handoff via module-level singleton** `src/lib/stageBridge.ts` (set in `EditorStage`, read in `Toolbar`). Keeps Konva node out of zustand (non-serializable, would inflate snapshots).
- **Temp PNG cleanup on editor window close** wired in `src/app/editor/page.tsx` via `onCloseRequested` → `plugin-fs.remove(file)` → `window.destroy()`. PLAN.md §5.5 specified the behavior, this is the implementation point.
- **Startup sweep enabled** — removed `#[allow(dead_code)]` on `sweep_stale_temp` and called it from `lib.rs` setup.
- **`general.copyToClipboardAfterSave`** is honored only when `defaultMode === "file"` (when `both` is selected, clipboard write already happens).

## Open questions (PLAN.md §9) — RESOLVED 2026-05-22

- [x] **Output behavior:** default = **clipboard**. Settings mode = `file | clipboard | both` (replaces PLAN's `ask`).
- [x] **Branding:** app name = **`capz`** (rebrand from "Shotr"). Icon stays as-is for v1. Maker may re-brand later.
- [x] **Filename template:** keep structure, brand prefix → default `capz-{yyyy}{MM}{dd}-{HHmmss}`. User-overridable in Settings.
- [x] **Sticker library:** keep current 10 emoji; maker can edit `STICKERS` const in [src/stores/editor.ts](src/stores/editor.ts).
- [x] **Update channel:** stable only in v1.
- [x] **Telemetry:** none in v1.
