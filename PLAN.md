# Screenshot Capture & Annotation Desktop App — Implementation Plan

> **Audience:** This document is a build specification for Claude Code. Execute phase by phase. Do **not** skip phases. Run the acceptance checks at the end of each phase before proceeding. Ask the user before making architectural deviations.

---

## 0. Project Context

### Product Summary
A cross-platform (macOS + Windows) desktop app that:
- Runs in background as a tray/menu-bar app (no dock presence by default)
- Listens for user-customizable global hotkeys
- On hotkey trigger, captures either **entire screen** or a **user-selected area**
- Opens an **in-app image editor** (text, arrows, shapes, blur, stickers)
- Outputs to either: (1) **saved image file** or (2) **system clipboard**
- Asks for OS permissions **only on first launch**

### Non-Goals (out of scope for v1)
- Video / screen recording
- Cloud upload / account system
- Mobile (iOS/Android)
- Linux first-class support (best-effort only; macOS & Windows are primary)
- OCR, AI features
- Multi-language UI (English only for v1)

### Target Platforms
- macOS 12+ (Apple Silicon + Intel)
- Windows 10/11 (x64)

---

## 1. Locked Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Desktop shell | Tauri | v2.x (latest stable) | https://v2.tauri.app |
| Backend lang | Rust | Stable (1.75+) | |
| Frontend framework | Next.js | 15.x | **Static export mode only** (`output: 'export'`) |
| Frontend lang | TypeScript | 5.x | strict mode on |
| Styling | Tailwind CSS | 4.x | |
| UI components | shadcn/ui | latest | only for settings/dialogs |
| State (frontend) | Zustand | 5.x | |
| Canvas editor | react-konva + konva | latest | |
| Screen capture (Rust) | `xcap` crate | latest | https://github.com/nashaofu/xcap |
| Image encode (Rust) | `image` crate | latest | for PNG/JPEG/WebP re-encode |
| Package manager | pnpm | 9.x | |

### Tauri Plugins (all v2)
- `tauri-plugin-global-shortcut` — global hotkey registration
- `tauri-plugin-clipboard-manager` — `writeImage` for clipboard output
- `tauri-plugin-dialog` — native save/open dialogs
- `tauri-plugin-fs` — file writes
- `tauri-plugin-store` — persistent app config
- `tauri-plugin-autostart` — launch at login
- `tauri-plugin-log` — structured logging
- `tauri-plugin-os` — OS detection for branching logic
- `tauri-plugin-process` — relaunch app (used after permission grant)
- `tauri-plugin-opener` — open external URLs (e.g., System Settings deep links)

### Hard Constraints
- **No `localStorage` / `sessionStorage`** — use `tauri-plugin-store` instead
- **No backend API calls in v1** — purely local app
- **No telemetry** in v1
- Next.js routing is **static** — no SSR, no API routes (Tauri handles backend)
- All filesystem writes go through `tauri-plugin-fs` with explicit scope in capabilities

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Tauri Application                             │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Rust Core (src-tauri/)                                      │    │
│  │                                                              │    │
│  │  ├─ Tray icon (always present)                               │    │
│  │  ├─ Global shortcut listener                                 │    │
│  │  ├─ Window manager (spawn/hide editor + overlay)             │    │
│  │  ├─ Screen capture service (xcap)                            │    │
│  │  ├─ Image processing service (image crate)                   │    │
│  │  ├─ Permission check service (macOS TCC)                     │    │
│  │  └─ Config store (tauri-plugin-store)                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                        │
│         ┌────────────────────┼────────────────────┐                  │
│         │ IPC (invoke/event) │                    │                  │
│         ▼                    ▼                    ▼                  │
│  ┌─────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│  │  Settings   │   │  Area-Select    │   │     Editor      │       │
│  │   Window    │   │   Overlay       │   │     Window      │       │
│  │  (hidden    │   │  (transparent,  │   │  (Next.js +     │       │
│  │   by        │   │   always-on-    │   │   react-konva)  │       │
│  │   default)  │   │   top, fs)      │   │                 │       │
│  └─────────────┘   └─────────────────┘   └─────────────────┘       │
└──────────────────────────────────────────────────────────────────────┘
```

### Capture Flows

**Flow A: Full-screen capture**
```
Hotkey pressed
  → Rust: enumerate monitors via xcap
  → Rust: capture target monitor → raw RGBA buffer
  → Rust: encode to PNG, write to temp file
  → Rust: spawn editor window, pass temp file path as URL param
  → Frontend: load image into Konva stage
```

**Flow B: Area-selection capture**
```
Hotkey pressed
  → Rust: enumerate monitors, get virtual desktop bounds
  → Rust: spawn fullscreen transparent overlay window across all monitors
  → Frontend (overlay): mouse-drag selection rectangle
  → Frontend (overlay): emit { x, y, w, h, monitor_id } to Rust
  → Rust: capture region via xcap, encode PNG, write temp file
  → Rust: close overlay, spawn editor window with file path
  → Frontend (editor): load image into Konva stage
```

---

## 3. Repository Structure

```
shotr/                                # rename as desired
├── package.json
├── pnpm-lock.yaml
├── next.config.ts                    # output: 'export', images: { unoptimized: true }
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                   # shadcn config
├── src/                              # Next.js app
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # default = redirect to /settings (or blank)
│   │   ├── settings/
│   │   │   └── page.tsx              # settings UI (hotkeys, output prefs, autostart)
│   │   ├── overlay/
│   │   │   └── page.tsx              # area-selection overlay UI
│   │   ├── editor/
│   │   │   └── page.tsx              # image editor (Konva)
│   │   └── onboarding/
│   │       └── page.tsx              # first-launch permission flow
│   ├── components/
│   │   ├── editor/
│   │   │   ├── EditorStage.tsx
│   │   │   ├── Toolbar.tsx
│   │   │   ├── tools/
│   │   │   │   ├── TextTool.tsx
│   │   │   │   ├── ArrowTool.tsx
│   │   │   │   ├── RectTool.tsx
│   │   │   │   ├── BlurTool.tsx
│   │   │   │   ├── NumberedPinTool.tsx
│   │   │   │   └── StickerTool.tsx
│   │   │   ├── widgets/
│   │   │   │   └── PinCounterWidget.tsx       # "Next: N" + reset/custom
│   │   │   ├── ColorPicker.tsx
│   │   │   └── ExportPanel.tsx
│   │   ├── overlay/
│   │   │   └── SelectionBox.tsx
│   │   ├── settings/
│   │   │   ├── HotkeyRecorder.tsx
│   │   │   └── OutputPrefsForm.tsx
│   │   └── ui/                       # shadcn components
│   ├── lib/
│   │   ├── tauri.ts                  # typed invoke wrappers
│   │   ├── konva-utils.ts            # export helpers, history (undo/redo)
│   │   ├── shortcuts.ts              # key parsing/formatting
│   │   └── config.ts                 # store schema + accessors
│   ├── stores/
│   │   ├── editor.ts                 # Zustand: annotations, history
│   │   └── settings.ts               # Zustand: hotkeys, output prefs
│   └── types/
│       └── ipc.ts                    # shared types for Rust ↔ TS contracts
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    ├── capabilities/
    │   ├── default.json              # main window cap
    │   ├── overlay.json              # overlay window cap (minimal)
    │   └── editor.json               # editor window cap
    ├── icons/
    └── src/
        ├── main.rs                   # bin entry
        ├── lib.rs                    # tauri::Builder setup
        ├── commands/
        │   ├── mod.rs
        │   ├── capture.rs            # capture_full, capture_region
        │   ├── editor.rs             # save_image, copy_to_clipboard
        │   ├── permissions.rs        # check + request macOS permissions
        │   └── shortcuts.rs          # register/unregister/list
        ├── services/
        │   ├── mod.rs
        │   ├── capture_service.rs    # xcap wrapper
        │   ├── monitor_service.rs    # multi-monitor utilities
        │   └── image_service.rs      # encoding, format conversion
        ├── tray.rs                   # tray menu setup
        ├── windows.rs                # window builders (overlay, editor)
        └── state.rs                  # AppState struct
```

---

## 4. Implementation Phases

### Phase 0: Project Bootstrap

**Goal:** Empty Tauri + Next.js skeleton boots and shows a window in dev mode.

**Tasks:**
1. Init project:
   ```bash
   pnpm create tauri-app@latest shotr -- --template nextjs-ts --manager pnpm
   cd shotr
   pnpm install
   ```
2. Verify `pnpm tauri dev` opens window.
3. Configure `next.config.ts` for static export:
   ```ts
   const nextConfig = {
     output: 'export',
     images: { unoptimized: true },
     trailingSlash: true,
   };
   ```
4. Install Tailwind 4: `pnpm add -D tailwindcss @tailwindcss/postcss postcss` and configure.
5. Install shadcn: `pnpm dlx shadcn@latest init`
6. Update `src-tauri/tauri.conf.json`:
   - `productName`: "Shotr"
   - `identifier`: "dev.baze.shotr"
   - `app.windows[0]`: `{ visible: false, label: "main" }` (main starts hidden)
7. Commit: `chore: bootstrap tauri + nextjs`

**Acceptance:**
- [ ] `pnpm tauri dev` succeeds
- [ ] `pnpm tauri build` produces `.app` on macOS / `.msi` on Windows
- [ ] Tailwind classes apply (test with a colored div)
- [ ] App identifier is set correctly in built binary

---

### Phase 1: Tray-Only Background Mode

**Goal:** App runs in tray with no main window visible. Quitting from tray exits cleanly.

**Tasks:**
1. In `src-tauri/tauri.conf.json`, set main window `visible: false` and on macOS configure:
   ```json
   "app": {
     "macOSPrivateApi": false
   }
   ```
2. Add `LSUIElement = true` to `Info.plist` (via `tauri.conf.json > bundle > macOS > entitlements` or `infoPlist`) so app doesn't appear in Dock/Cmd-Tab.
3. Create `src-tauri/src/tray.rs`:
   - Use `TrayIconBuilder` from Tauri v2 core
   - Menu items: "Capture Full Screen", "Capture Area", "—", "Settings…", "Quit"
   - Each menu item emits an event or calls a command
4. Wire tray init in `lib.rs::run()`:
   ```rust
   .setup(|app| {
       tray::create_tray(app.handle())?;
       Ok(())
   })
   ```
5. On "Quit", call `app.exit(0)`. On "Settings…", call `windows::show_settings(app)`.

**Files:**
- `src-tauri/src/tray.rs` (new)
- `src-tauri/src/windows.rs` (new — stub `show_settings`)
- `src-tauri/src/lib.rs` (modify)
- `src-tauri/tauri.conf.json` (modify)

**Acceptance:**
- [ ] App icon appears in macOS menu bar / Windows system tray
- [ ] No icon in Dock (macOS) / no taskbar entry (Windows) when no window is open
- [ ] All 4 menu items work (Settings opens window stub, Quit exits)
- [ ] No console errors on startup

---

### Phase 2: Settings Window + Persistent Config Store

**Goal:** Settings window opens from tray, displays default config, persists changes.

**Tasks:**
1. Install: `pnpm tauri add store` (auto-adds Rust + JS dep)
2. Define config schema in `src/lib/config.ts`:
   ```ts
   export type AppConfig = {
     hotkeys: {
       captureFull: string;       // e.g., "CmdOrCtrl+Shift+3"
       captureArea: string;       // e.g., "CmdOrCtrl+Shift+4"
     };
     output: {
       defaultMode: 'file' | 'clipboard' | 'ask';
       fileFormat: 'png' | 'jpeg' | 'webp';
       jpegQuality: number;       // 1-100
       defaultSavePath: string | null;  // null = ask each time
       filenameTemplate: string;  // e.g., "shotr-{yyyy}{MM}{dd}-{HHmmss}"
     };
     pins: {
       continuityMode: 'reset' | 'continue';  // default = 'continue'
       lastUsedNumber: number;                 // synced when editor closes
       defaultStartNumber: number;             // default = 1
       defaultColor: string;                   // default = '#E5342B'
       defaultSize: number;                    // pin diameter in px, default = 36
     };
     general: {
       autostart: boolean;
       playSoundOnCapture: boolean;
       copyToClipboardAfterSave: boolean;
     };
   };
   ```
3. Create `src/stores/settings.ts` (Zustand) that loads from `tauri-plugin-store` on mount and persists on change.
4. Build `src/app/settings/page.tsx` with shadcn `Tabs`: "Shortcuts", "Output", "Pins", "General".
5. Implement `src/components/settings/HotkeyRecorder.tsx`:
   - On focus, captures next key combination
   - Displays in human-readable form (`⌘⇧3` on macOS, `Ctrl+Shift+3` on Windows)
   - Validates against reserved keys
6. Wire "Settings…" tray item to `WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings".into()))`.

**Files:**
- `src/app/settings/page.tsx`
- `src/components/settings/HotkeyRecorder.tsx`
- `src/components/settings/OutputPrefsForm.tsx`
- `src/stores/settings.ts`
- `src/lib/config.ts`
- `src/lib/shortcuts.ts` (key code mapping)
- `src-tauri/src/windows.rs` (implement `show_settings`)
- `src-tauri/capabilities/default.json` (add `store:default`)

**Acceptance:**
- [ ] Settings window opens via tray menu
- [ ] Changing a hotkey via recorder updates display
- [ ] Closing & reopening Settings shows persisted values
- [ ] Quitting & relaunching app preserves config
- [ ] Config file lives in correct OS-specific path:
  - macOS: `~/Library/Application Support/dev.baze.shotr/`
  - Windows: `%APPDATA%\dev.baze.shotr\`

---

### Phase 3: Global Hotkey Registration

**Goal:** Hotkeys defined in settings are registered system-wide and trigger Rust handlers (stub for now — log to console).

**Tasks:**
1. Install: `pnpm tauri add global-shortcut`
2. In `src-tauri/src/commands/shortcuts.rs`:
   - `register_shortcuts(app, config)` — unregister all then register from config
   - `unregister_all(app)`
   - Handler dispatches by matched shortcut → emits event `shortcut://triggered` with `{ kind: 'full' | 'area' }`
3. Call `register_shortcuts` on app setup and after each settings save.
4. Add `capabilities/default.json` entries:
   ```json
   "global-shortcut:allow-register",
   "global-shortcut:allow-unregister",
   "global-shortcut:allow-is-registered"
   ```
5. Handle conflict gracefully: if `register()` returns Err, show toast in Settings ("Shortcut already in use") instead of crashing.
6. On macOS, accessibility permission may be required — defer prompt handling to Phase 7.

**Code skeleton (`src-tauri/src/commands/shortcuts.rs`):**
```rust
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone, serde::Serialize)]
pub struct ShortcutEvent { pub kind: &'static str }

pub fn register_from_config<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let gs = app.global_shortcut();
    gs.unregister_all()?;

    let config = crate::state::load_config(app)?;
    let full: Shortcut = config.hotkeys.capture_full.parse()
        .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!("invalid shortcut: {e}")))?;
    let area: Shortcut = config.hotkeys.capture_area.parse()?;

    let app_clone = app.clone();
    gs.on_shortcut(full, move |app, _, event| {
        if event.state == ShortcutState::Pressed {
            let _ = app.emit("shortcut://triggered", ShortcutEvent { kind: "full" });
        }
    })?;
    gs.on_shortcut(area, move |app, _, event| {
        if event.state == ShortcutState::Pressed {
            let _ = app.emit("shortcut://triggered", ShortcutEvent { kind: "area" });
        }
    })?;
    Ok(())
}
```

**Acceptance:**
- [ ] Pressing configured hotkey logs to terminal (`println!` or `log::info!`)
- [ ] Changing hotkey in settings → new hotkey works, old one is freed
- [ ] Conflicting hotkey shows error toast, doesn't crash
- [ ] Hotkeys work even when no window is focused

---

### Phase 4: Screen Capture Service (Rust)

**Goal:** Rust can capture full screen and arbitrary region, return PNG bytes.

**Tasks:**
1. Add to `src-tauri/Cargo.toml`:
   ```toml
   xcap = "0.x"
   image = "0.25"
   tokio = { version = "1", features = ["rt", "macros"] }
   ```
2. Create `src-tauri/src/services/monitor_service.rs`:
   ```rust
   use xcap::Monitor;

   pub fn list_monitors() -> anyhow::Result<Vec<MonitorInfo>> { /* ... */ }
   pub fn monitor_at_cursor() -> anyhow::Result<Monitor> { /* ... */ }
   pub fn virtual_desktop_bounds() -> anyhow::Result<Rect> {
       // union of all monitor rects — needed for overlay window sizing
   }
   ```
3. Create `src-tauri/src/services/capture_service.rs`:
   ```rust
   pub fn capture_monitor(id: u32) -> anyhow::Result<image::RgbaImage>;
   pub fn capture_region(monitor_id: u32, x: i32, y: i32, w: u32, h: u32)
       -> anyhow::Result<image::RgbaImage>;
   ```
4. Create `src-tauri/src/services/image_service.rs`:
   ```rust
   pub fn encode_png(img: &image::RgbaImage) -> anyhow::Result<Vec<u8>>;
   pub fn write_temp_png(img: &image::RgbaImage) -> anyhow::Result<PathBuf>;
       // writes to app's temp dir, returns path
   ```
5. Create commands in `src-tauri/src/commands/capture.rs`:
   ```rust
   #[tauri::command]
   pub async fn capture_full_command(app: AppHandle) -> Result<String, String> {
       // returns path to temp PNG
   }

   #[tauri::command]
   pub async fn capture_region_command(
       app: AppHandle,
       monitor_id: u32,
       x: i32, y: i32, w: u32, h: u32,
   ) -> Result<String, String>;
   ```
6. **DPI handling:** xcap returns physical pixels. Coordinates from frontend will be in logical pixels. Multiply by `monitor.scale_factor()` before passing to xcap.
7. Register commands in `lib.rs` via `invoke_handler![]`.

**Files:**
- `src-tauri/src/services/{mod,capture_service,monitor_service,image_service}.rs`
- `src-tauri/src/commands/{mod,capture}.rs`

**Acceptance:**
- [ ] Calling `capture_full_command` from frontend devtools (`invoke('capture_full_command')`) returns a path to a valid PNG
- [ ] PNG opens correctly in Preview/Photos, dimensions match physical screen resolution
- [ ] Region capture with arbitrary coords returns correctly cropped PNG
- [ ] Multi-monitor: capturing secondary monitor works
- [ ] Retina/HiDPI: captured image is full-resolution (not blurry)

---

### Phase 5: Area-Selection Overlay Window

**Goal:** Hotkey for "capture area" spawns transparent overlay covering all monitors, user drags rectangle, capture proceeds.

**Tasks:**
1. In `src-tauri/src/windows.rs`, add:
   ```rust
   pub fn show_overlay<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
       let bounds = monitor_service::virtual_desktop_bounds()?;
       let win = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay".into()))
           .transparent(true)
           .decorations(false)
           .always_on_top(true)
           .skip_taskbar(true)
           .resizable(false)
           .position(bounds.x as f64, bounds.y as f64)
           .inner_size(bounds.w as f64, bounds.h as f64)
           .build()?;
       win.set_cursor_grab(true)?;  // optional
       Ok(())
   }
   ```
2. Listen for `shortcut://triggered` event in `lib.rs` setup; on `kind: 'area'`, call `show_overlay`.
3. Build `src/app/overlay/page.tsx`:
   - Full-viewport `<div>` with `bg-black/30` and crosshair cursor
   - On mousedown, capture start coords; on mousemove, draw rect; on mouseup, commit
   - Press Escape → emit `overlay://cancel` → Rust closes window
   - On commit, invoke `capture_region_command` with coords + monitor_id, then close overlay
4. After capture, Rust spawns editor window with `?file=<temp_path>` query param.
5. Add `src-tauri/capabilities/overlay.json` with minimal permissions:
   ```json
   {
     "identifier": "overlay-capability",
     "windows": ["overlay"],
     "permissions": [
       "core:event:default",
       "core:window:allow-close",
       "core:webview:allow-set-cursor-grab"
     ]
   }
   ```

**Code skeleton (`src/app/overlay/page.tsx`):**
```tsx
'use client';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useEffect, useRef, useState } from 'react';

export default function OverlayPage() {
  const [start, setStart] = useState<{x:number,y:number}|null>(null);
  const [end, setEnd] = useState<{x:number,y:number}|null>(null);
  const overlayWin = useRef(getCurrentWebviewWindow());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') overlayWin.current.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onMouseUp = async () => {
    if (!start || !end) return;
    const rect = normalize(start, end);
    if (rect.w < 4 || rect.h < 4) return; // ignore tiny accidental clicks
    // Translate logical to physical coords, find monitor — done in Rust
    await invoke('capture_region_command', {
      monitorId: 0, x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    });
    overlayWin.current.close();
  };

  // ... render SVG selection rect
}
```

**Acceptance:**
- [ ] Hotkey spawns overlay covering all monitors (verify on multi-monitor setup)
- [ ] Dragging draws a selection rectangle
- [ ] Releasing mouse captures that region (verify by opening result file)
- [ ] Escape cancels and closes overlay
- [ ] Overlay is dismissed cleanly even after canceling
- [ ] No memory leak (verify by capturing 20+ times in a row)

---

### Phase 6: Image Editor Window (react-konva)

**Goal:** Editor window opens with captured image, supports text/arrows/rects/blur/stickers/numbered-pins with continuity across captures, undo/redo.

**Tasks:**
1. Install: `pnpm add konva react-konva use-image`
2. Build `src/app/editor/page.tsx`:
   - Read `file` query param → use `convertFileSrc()` from `@tauri-apps/api/core` to get loadable URL
   - Render toolbar + Konva stage
3. Editor state in `src/stores/editor.ts`:
   ```ts
   type Annotation =
     | { id: string; type: 'text'; x: number; y: number; text: string; fontSize: number; fill: string }
     | { id: string; type: 'arrow'; points: number[]; stroke: string; strokeWidth: number }
     | { id: string; type: 'rect'; x: number; y: number; w: number; h: number; stroke: string }
     | { id: string; type: 'blur'; x: number; y: number; w: number; h: number; radius: number }
     | { id: string; type: 'pin'; x: number; y: number; number: number; color: string; size: number }
     | { id: string; type: 'sticker'; x: number; y: number; src: string };

   type EditorStore = {
     annotations: Annotation[];
     selectedId: string | null;
     history: Annotation[][];     // for undo
     future: Annotation[][];      // for redo
     activeTool: ToolType;
     // Pin counter state (per-editor instance)
     nextPinNumber: number;
     setNextPinNumber: (n: number) => void;
     // actions
     add: (a: Annotation) => void;
     update: (id: string, patch: Partial<Annotation>) => void;
     remove: (id: string) => void;
     undo: () => void;
     redo: () => void;
   };
   ```
4. Implement tools as components under `src/components/editor/tools/`. Each tool manages its own mouse interaction with the Konva stage.
5. **Blur tool implementation note:** Konva doesn't render CSS filters on the image directly. Approach:
   - Create a separate `<Image>` node with `filters={[Konva.Filters.Blur]}` and `blurRadius={N}`
   - Use `clipFunc` on its containing group to limit blur to the selected rectangle
   - Call `.cache()` on the node to apply filter
6. Undo/redo via history stack on every mutation. Cap at 50 entries. **Undo of a pin placement must restore the counter** (e.g., if you placed pin 5 then undo, `nextPinNumber` reverts to 5).
7. Keyboard shortcuts in editor:
   - `Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` redo
   - `Delete`/`Backspace` remove selection
   - `Escape` deselect
   - `Cmd/Ctrl+S` save, `Cmd/Ctrl+C` copy
   - **Tool activation:** `T` text, `A` arrow, `R` rect, `B` blur, `N` numbered pin, `S` sticker
   - **Pin-specific:** `Cmd/Ctrl+Shift+R` reset pin counter to 1
8. `<Transformer>` for resize/rotate on selected non-text annotations.

#### 6.1 Numbered Pin Tool — full spec

**Component (`src/components/editor/tools/NumberedPinTool.tsx`):**

```tsx
'use client';
import { Group, Path, Text } from 'react-konva';
import { useEditor } from '@/stores/editor';

const TEARDROP_PATH = 'M18,0 C8,0 0,8 0,18 C0,28 8,36 18,36 C20,36 22,35.5 24,34.5 L14,46 L28,33 C32,30 36,24 36,18 C36,8 28,0 18,0 Z';

export function PinAnnotation({ pin, isSelected, onSelect, onDragEnd, onNumberChange }: Props) {
  // Auto-shrink font for larger numbers
  const fontSize = pin.number >= 100 ? 14 : pin.number >= 10 ? 16 : 20;
  const scale = pin.size / 36;

  return (
    <Group
      x={pin.x} y={pin.y}
      scaleX={scale} scaleY={scale}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={() => {
        // open inline editor for number override
        const next = prompt('Pin number:', String(pin.number));
        if (next && !isNaN(+next)) onNumberChange(+next);
      }}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
    >
      <Path
        data={TEARDROP_PATH}
        fill={pin.color}
        shadowColor="black"
        shadowBlur={6}
        shadowOpacity={0.35}
        shadowOffsetY={2}
        stroke={isSelected ? 'white' : 'transparent'}
        strokeWidth={isSelected ? 2 : 0}
      />
      <Text
        text={String(pin.number)}
        fontSize={fontSize}
        fontStyle="bold"
        fontFamily="-apple-system, system-ui, Segoe UI, sans-serif"
        fill="white"
        width={36} height={36}
        align="center" verticalAlign="middle"
        listening={false}
      />
    </Group>
  );
}
```

**Stage click handler (in `EditorStage.tsx`):**

```tsx
const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
  if (activeTool !== 'pin') return;
  // Ignore clicks that land on existing annotations
  if (e.target !== e.target.getStage()) return;
  const pos = e.target.getStage()!.getPointerPosition()!;
  const cfg = useSettings.getState().pins;

  addPin({
    id: nanoid(),
    type: 'pin',
    x: pos.x, y: pos.y,
    number: nextPinNumber,
    color: cfg.defaultColor,
    size: cfg.defaultSize,
  });
  setNextPinNumber(nextPinNumber + 1);
};
```

**Toolbar widget (`src/components/editor/widgets/PinCounterWidget.tsx`):**

Visible only when `activeTool === 'pin'`. Layout:
```
[ ← ] [ Next: 4 ] [ → ]   [↻ Reset]   [⚙ Custom…]
```

- `← / →` decrement/increment counter (clamped to ≥1)
- `Next: N` is a click-to-edit number input
- `Reset` sets counter to `settings.pins.defaultStartNumber` (default 1)
- `Custom…` opens popover with three quick actions:
  - "Start from 1"
  - "Continue from previous capture (would be N+1 where N = `settings.pins.lastUsedNumber`)"
  - "Set custom value: [____]"

**Continuity behavior on editor open:**

When the editor window mounts, initialize `nextPinNumber` based on `settings.pins.continuityMode`:

```ts
useEffect(() => {
  const cfg = useSettings.getState().pins;
  if (cfg.continuityMode === 'continue') {
    setNextPinNumber(cfg.lastUsedNumber + 1);
  } else {
    setNextPinNumber(cfg.defaultStartNumber);
  }
}, []);
```

**Sync `lastUsedNumber` to global settings:**

On editor close (or before unmount), if at least one pin was placed in this session, persist the highest pin number used:

```ts
useEffect(() => {
  return () => {
    const pins = annotations.filter(a => a.type === 'pin') as PinAnnotation[];
    if (pins.length === 0) return;
    const maxUsed = Math.max(...pins.map(p => p.number));
    useSettings.getState().setPinsLastUsedNumber(maxUsed);
  };
}, [annotations]);
```

**Concurrent editor handling:** if user captures twice in quick succession (two editor windows open), each window has its own `nextPinNumber` initialized from `lastUsedNumber` at mount time. The last window to close wins the `lastUsedNumber` write. This is acceptable race behavior for v1 — document in code comment.

**Settings tab UI (`PinsSettingsTab.tsx`):**
- Toggle: "Continue numbering across captures" (maps to `continuityMode`)
- Numeric input: "Default starting number" (default 1)
- Color picker: "Default pin color"
- Slider: "Default pin size" (24–64 px)
- Display: "Last used number: N" with "Reset" button

**Deletion semantics:** Deleting a pin **leaves a gap** in the sequence (1, _, 3, 4, 5). The counter is **not** decremented (next placement is still 6, not 2). This matches user expectation from Skitch/CleanShot. If the user wants to renumber, expose an explicit toolbar button "Renumber pins sequentially" that reassigns 1..N to all pins in placement order.

**Files:**
- `src/app/editor/page.tsx`
- `src/components/editor/EditorStage.tsx`
- `src/components/editor/Toolbar.tsx`
- `src/components/editor/tools/*.tsx` (including `NumberedPinTool.tsx`)
- `src/components/editor/widgets/PinCounterWidget.tsx`
- `src/components/editor/ColorPicker.tsx`
- `src/components/settings/PinsSettingsTab.tsx`
- `src/stores/editor.ts`
- `src/lib/konva-utils.ts` (export helpers)

**Acceptance:**
- [ ] Captured image loads in editor at correct dimensions
- [ ] Each tool (text, arrow, rect, blur, sticker, pin) can be placed
- [ ] Selected annotation can be moved, resized, rotated (where applicable)
- [ ] Undo/redo works for all annotation operations
- [ ] Delete key removes selected
- [ ] Color picker updates currently selected annotation
- [ ] Editor window can be resized; stage fits without distortion
- [ ] **Pin-specific:**
  - [ ] Selecting pin tool changes cursor to crosshair
  - [ ] Clicking stage 5 times places pins numbered 1, 2, 3, 4, 5
  - [ ] `PinCounterWidget` shows "Next: 6" after 5 clicks
  - [ ] Pin numbers ≥10 use smaller font; pins still readable
  - [ ] Pin can be dragged to new position after placement
  - [ ] Double-clicking pin allows manual number override
  - [ ] Deleting pin #3 leaves gap; next placement is still 6 (not 2)
  - [ ] "Renumber sequentially" button reassigns 1..N in placement order
  - [ ] Reset button sets `nextPinNumber` back to `defaultStartNumber`
  - [ ] Undoing a pin placement restores `nextPinNumber` to its prior value
  - [ ] **Continuity test:**
    - With `continuityMode = 'continue'`: capture A, place pins 1-4, close editor. Capture B → new editor opens with `nextPinNumber = 5`
    - With `continuityMode = 'reset'`: same scenario → capture B starts at `defaultStartNumber`
  - [ ] `lastUsedNumber` persists across app restarts via `tauri-plugin-store`

---

### Phase 7: Output — Save to File & Copy to Clipboard

**Goal:** Export panel produces final image and routes to file save OR clipboard based on user choice.

**Tasks:**
1. Install: `pnpm tauri add clipboard-manager dialog fs`
2. In `src/lib/konva-utils.ts`:
   ```ts
   export async function stageToPngBytes(stage: Konva.Stage, pixelRatio = 2): Promise<Uint8Array> {
     const dataURL = stage.toDataURL({ mimeType: 'image/png', pixelRatio });
     const blob = await (await fetch(dataURL)).blob();
     return new Uint8Array(await blob.arrayBuffer());
   }
   ```
3. Save-to-file flow:
   ```ts
   import { save } from '@tauri-apps/plugin-dialog';
   import { writeFile } from '@tauri-apps/plugin-fs';

   async function saveToFile(stage: Konva.Stage, format: 'png'|'jpeg'|'webp') {
     const cfg = useSettings.getState();
     const filename = renderTemplate(cfg.output.filenameTemplate);  // e.g., shotr-20260521-143012
     const path = cfg.output.defaultSavePath
       ? `${cfg.output.defaultSavePath}/${filename}.${format}`
       : await save({
           defaultPath: `${filename}.${format}`,
           filters: [{ name: format.toUpperCase(), extensions: [format] }],
         });
     if (!path) return;

     const pngBytes = await stageToPngBytes(stage);
     // For non-PNG, re-encode in Rust for proper quality control
     if (format === 'png') {
       await writeFile(path, pngBytes);
     } else {
       await invoke('save_image_command', {
         pngBytes: Array.from(pngBytes),
         path,
         format,
         quality: cfg.output.jpegQuality,
       });
     }
   }
   ```
4. Add Rust command `save_image_command`:
   ```rust
   #[tauri::command]
   pub async fn save_image_command(
       png_bytes: Vec<u8>, path: String, format: String, quality: u8,
   ) -> Result<(), String> {
       let img = image::load_from_memory(&png_bytes).map_err(|e| e.to_string())?;
       match format.as_str() {
           "jpeg" => {
               let mut buf = std::fs::File::create(&path).map_err(|e| e.to_string())?;
               img.write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality))
                   .map_err(|e| e.to_string())?;
           }
           "webp" => { /* image::codecs::webp::WebPEncoder */ }
           _ => return Err(format!("unsupported format: {format}")),
       }
       Ok(())
   }
   ```
5. Copy-to-clipboard flow:
   ```ts
   import { writeImage } from '@tauri-apps/plugin-clipboard-manager';

   async function copyToClipboard(stage: Konva.Stage) {
     const pngBytes = await stageToPngBytes(stage);
     await writeImage(pngBytes);
     showToast('Copied to clipboard');
   }
   ```
   The official `@tauri-apps/plugin-clipboard-manager` `writeImage()` accepts an image buffer; verify the expected encoding by checking plugin docs at https://v2.tauri.app/reference/javascript/clipboard-manager/ — if raw RGBA is required instead of PNG, decode the canvas to ImageData first.
6. Export panel UI: two big buttons "Save to File" / "Copy to Clipboard", with format dropdown for save.
7. After successful action, close editor window unless user toggled "Keep editor open after export".
8. Add capabilities:
   ```json
   "clipboard-manager:allow-write-image",
   "dialog:allow-save",
   "fs:allow-write-file",
   {"identifier": "fs:scope", "allow": [{"path": "$DOCUMENT/**"}, {"path": "$DOWNLOAD/**"}, {"path": "$PICTURE/**"}, {"path": "$DESKTOP/**"}]}
   ```

**Acceptance:**
- [ ] Save to PNG works, file is valid and matches editor content
- [ ] Save to JPEG with quality 70 produces smaller file than PNG
- [ ] Save to WebP works
- [ ] Default-save-path mode skips dialog and saves to configured folder
- [ ] Copy to clipboard: paste into another app (e.g., Slack, Preview) shows the image
- [ ] Both flows handle errors gracefully (disk full, clipboard denied)

---

### Phase 8: Multi-Source Capture (Monitors + Windows)

**Goal:** Capture any monitor (not just primary) and capture a specific application window. Area capture must work on any monitor.

**Tasks:**
1. **Monitor enumeration IPC.** Rust command `list_monitors() -> Vec<MonitorInfo>` returning `{id, name, x, y, width, height, scale_factor, is_primary}`. Mirror via `ts-rs` to `src/types/ipc.ts`.
2. **Full-screen picker.** New hotkey path / tray action "Capture Full Screen…" opens a lightweight picker window (`monitor-picker`) listing monitors with thumbnails (small `xcap` capture per monitor). User clicks a monitor → Rust captures that monitor → temp PNG → editor. Single-monitor users skip the picker (auto-select).
3. **Area capture cross-monitor.** Phase 5 overlay already spans the union of monitors. Lift the v1 single-monitor restriction: allow the selection rect to land on any monitor. Still no cross-monitor stitching — if selection straddles two monitors, capture only the rect intersected with the monitor that contains the rect's center (document this rule in Settings help text).
4. **Window enumeration IPC.** Rust command `list_windows() -> Vec<WindowInfo>` returning `{id, title, app_name, monitor_id, bounds, icon?}`. Use `xcap::Window::all()` (xcap supports per-window capture on macOS + Windows).
5. **Window picker UI.** New tray action "Capture Window…" opens `window-picker` window: searchable list grouped by app, with title + small thumbnail. Selecting a window → Rust `capture_window(id)` → temp PNG → editor.
6. **Hotkey wiring.** Add two new default hotkeys, user-configurable in Settings:
   - Full Screen (picker): `CmdOrCtrl+Alt+Shift+3` (existing — now opens picker if >1 monitor)
   - Window: `CmdOrCtrl+Alt+Shift+5` (new)
7. **Capabilities.** New capability files for `monitor-picker` and `window-picker` (read-only IPC scope; no fs/clipboard).

**macOS notes:**
- Window list requires Screen Recording permission (already covered by onboarding).
- Window titles of other apps may be redacted on macOS until permission is granted — handle empty-title fallback to app name.

**Acceptance:**
- [ ] `list_monitors` returns all attached monitors with correct logical bounds + scale_factor
- [ ] Full-screen picker shows live thumbnails; selecting non-primary monitor produces a PNG of that monitor at native resolution
- [ ] Single-monitor setup skips the picker
- [ ] Area capture works when overlay is dragged on a secondary monitor
- [ ] Window picker lists currently-open windows from all apps, grouped by app name
- [ ] Capturing a window produces a PNG of just that window's content (no surrounding desktop)
- [ ] Minimized windows are filtered out or marked disabled

---

### Phase 9: Editor Live Controls + Session Memory

**Goal:** Editor exposes live stroke-width + color controls on the toolbar that affect both new annotations and the currently-selected one. App remembers the last-used tool, color, stroke width, font size, and sticker per session so the next capture opens in the same state.

**Tasks:**
1. **Stroke-width slider.** Toolbar control (range 1–20, step 1) visible when tool ∈ {rect, arrow} or when a rect/arrow annotation is selected. Mirrors the inline color-picker pattern from Phase 6 deviations: edits selected annotation if any, else updates the default in store/config.
2. **Color control on the go.** Existing inline color picker (Phase 6) already covers this; extend it to also be reachable via keyboard shortcut (`C` → focuses color input).
3. **Font-size + sticker-size sliders.** Same pattern — visible when relevant tool/selection active.
4. **`lastUsed` config block.** New `AppConfig.lastUsed`:
   ```ts
   lastUsed?: {
     tool: ToolId;
     color: string;
     strokeWidth: number;
     fontSize: number;
     stickerEmoji: string;
     stickerFontSize: number;
   }
   ```
   Written to store on every annotation commit (debounced ~500 ms). Read once at editor bootstrap **after** `tools` defaults — overrides them.
5. **Settings toggle.** General tab: `general.rememberLastTool` (default `true`). When off, editor uses `tools.*` defaults only.
6. **Init order.** Extend the Phase 6 `pinInit` guard to also gate `lastUsed` hydration; do not let async settings load overwrite a user's mid-session changes.
7. **Toolbar keyboard shortcuts.** `[` / `]` decrease/increase stroke width; `-` / `+` decrease/increase font/sticker size when relevant.
8. **Implicit selection (no Select tool needed).** Click on any existing annotation with any active tool → switch interaction to "select that element" for the current gesture: show transformer, allow drag/resize/rotate. Empty-canvas click resumes the active tool's draw behavior. Implementation: hit-test on `mousedown`; if a Konva node belongs to an annotation, intercept before the tool's draw handler. `Esc` deselects.
9. **Auto-select latest placed.** On annotation commit (rect/arrow/text/blur/sticker/pin), set it as the current selection and attach the transformer. User can immediately tweak position/size/rotation without re-clicking. Skipped for text while still in edit mode (selection happens on textarea blur).
10. **Rotation for all elements.** Every annotation type gets a `rotation` field (degrees, default 0) in its snapshot shape. Konva `Transformer` config: `rotateEnabled: true`, default rotation snaps at 15° (hold Shift for free rotation). Export honors rotation via Konva's native transform. Pin numbers rotate with their circle but the numeral text counter-rotates so it stays upright (readable).

**Acceptance:**
- [ ] Changing stroke-width slider with a rect/arrow selected updates that annotation immediately
- [ ] Changing stroke-width slider with nothing selected updates the default for the next drawn annotation
- [ ] Color picker behaves the same way for both new and selected annotations
- [ ] After closing the editor and triggering a new capture, the new editor opens with the last tool, color, and widths used
- [ ] Toggling `general.rememberLastTool` off restores the Settings → Tools defaults on next capture
- [ ] `[` / `]` and `-` / `+` keyboard shortcuts work and don't fire inside text-edit mode
- [ ] Clicking an existing annotation with the Rect/Arrow/Text/Blur/Sticker/Pin tool selects it instead of drawing
- [ ] Clicking empty canvas resumes the active tool's draw behavior
- [ ] Newly placed annotation is auto-selected with transformer attached
- [ ] All annotation types can be rotated via the transformer handle; rotation persists through undo/redo and export

---

### Phase 10: Dedicated Copy Action

**Goal:** Editor exposes Copy as a first-class action separate from Save. Users can press `CmdOrCtrl+C` (when no annotation text is selected for native text-copy) or click a dedicated "Copy" button to write the current canvas to the clipboard without saving to disk.

**Tasks:**
1. **Toolbar split.** Replace single "Save" output button with three buttons: `Copy`, `Save`, `Save & Copy`. Visibility/ordering follows `output.defaultMode` (the default action gets the primary button styling; others remain accessible).
2. **`Copy` action.** Reuses the Phase 7 export pipeline (`stage.toDataURL` → bytes → `clipboard-manager.writeImage`) but **skips** the dialog/fs branch. Closes the editor window on success per existing behavior (config-gated by `general.closeEditorAfterExport`).
3. **`CmdOrCtrl+C` global handler** scoped to the editor window. Conditions:
   - Suppress when a text annotation is in edit mode (`document.activeElement` is the inline `<textarea>` / Konva text input) — let the native copy proceed for the selected text.
   - Suppress when a Konva text node is selected *and* a sub-range is highlighted (future-proof; ignore for v1 if not implemented).
   - Otherwise: copy the full stage to clipboard, flash toast "Copied".
4. **`output.defaultMode = "both"` re-mapping.** Existing "both" mode now corresponds to the `Save & Copy` button as the default action. No config migration needed.
5. **Toast feedback.** Reuse the Phase 6 inline-flash pattern: `Copied`, `Saved`, `Saved & Copied`. Errors surface in a red variant.
6. **Capability.** No new capabilities — clipboard + dialog + fs already scoped in `editor.json` from Phase 7.

**Acceptance:**
- [ ] Three buttons visible; primary highlight matches `output.defaultMode`
- [ ] `CmdOrCtrl+C` with no selection copies the full annotated image to clipboard
- [ ] `CmdOrCtrl+C` while editing a text annotation copies the selected characters, not the canvas
- [ ] Copy action does not write a file to disk
- [ ] Save action does not write to clipboard unless `general.copyToClipboardAfterSave` is on (Phase 7 behavior preserved)
- [ ] Toast confirms each action

---

### Phase 11: Persistent Editor Workspace

**Goal:** Editor becomes a long-lived single-instance workspace window, not a transient per-capture window. Closing the editor *hides* it (state retained); reopening from the tray returns to the same in-progress edit. Workspace also supports an **empty state** so the user can paste an image from the system clipboard without going through capture. State lives only for the app's lifetime — quitting from the tray truly destroys it and sweeps temp files.

**Motivation:** v1 (Phases 6–10) treats each capture as a fresh editor window. Real-world flow: user iterates on annotations, accidentally closes the window, loses work. Also blocks the "edit an image I already have" workflow that doesn't start with a capture.

**Tasks:**

1. **Single fixed window label.** Rename label scheme: `editor-<timestamp>` → fixed `editor`. Drop the per-capture timestamp + multi-instance support. Updates required:
   - `windows.rs::show_editor` — `get_webview_window("editor")` returns existing; else build with label `editor`.
   - `capabilities/editor.json` — `windows: ["editor"]` (already exact match; no change unless using glob).
   - Phase 7 logic that closed the editor after export becomes "hide instead of close" when `general.closeEditorAfterExport` is true.
2. **Hide-on-close.** Editor frontend `onCloseRequested` → `e.preventDefault(); win.hide()`. **No** temp PNG removal at this point.
3. **Image source decoupled from URL.** Drop `?file=` query param. Editor frontend listens for Tauri event `editor:load-image` with `{path: string, source: 'capture' | 'paste'}`. On receive: replace stage image + reset annotations (zustand `reset()` action).
4. **Capture pipeline routing.** `capture_region_command` / `capture_monitor_command` / `capture_window_command`:
   - Write temp PNG (unchanged).
   - If `editor` window exists: emit `editor:load-image` to it + `show() + set_focus()`.
   - Else: build editor (empty), then emit event after window's `ready` event.
5. **Empty state UI.** When no image loaded:
   - Centered placeholder: app glyph + "Paste an image (⌘V / Ctrl+V) or capture from the tray".
   - Toolbar disabled (annotations grayed out); only export buttons remain enabled-but-no-op until image present.
6. **Paste flow.**
   - Global `paste` event listener on editor window.
   - `await readImage()` from `@tauri-apps/plugin-clipboard-manager`. If null/non-image → flash toast "Clipboard has no image".
   - Write bytes to temp PNG via `tauri-plugin-fs` to a path under OS temp dir as `capz-temp-<ts>.png`.
   - Emit `editor:load-image` with `source: 'paste'` (same path the frontend just wrote).
   - **Replace** any currently-loaded image silently (matches "fast capture" ethos; no confirm dialog).
7. **Tray menu changes.** Add menu items:
   - `Open Editor` (always enabled) — show + focus existing editor or build empty one.
   - `Quit capz` (replaces / adds to existing Quit) — destroys editor (real close, not hide), sweeps the active temp PNG, exits.
8. **Lifetime + cleanup.**
   - Active temp PNG path tracked in Rust `AppState.active_temp_path: Mutex<Option<PathBuf>>`. Set on every load, cleared on Clear-workspace or replaced on new load — old file removed via `tauri-plugin-fs`.
   - Tray Quit handler: lock + remove + `app.exit(0)`.
   - Existing startup `sweep_stale_temp(>24h)` remains the safety net for crash orphans.
9. ~~**Clear Workspace action.**~~ *(Deferred — not v1 scope. Replace-on-new-load + tray Quit cleanup are sufficient.)*
10. **Capability updates** (`editor.json`):
    - `clipboard-manager:allow-read-image` (paste).
    - `core:event:default` (frontend listens for `editor:load-image`).
    - `fs:allow-write-file` already covers temp PNG paste-write; scope must include OS temp dir (extend Phase 5 fs scope if needed).
11. **IPC types.** New event payload type in `src/types/ipc.ts`: `EditorLoadImage { path: string; source: 'capture' | 'paste' }`. Mirror via `ts-rs`.

**Interactions with prior phases:**
- **Phase 6** acceptance "editor opens with file" → re-validated against new event-based load.
- **Phase 7** `general.closeEditorAfterExport` semantics: now means hide, not close.
- **Phase 9** `lastUsed` re-hydrates on each new image load (`editor:load-image` handler), not on window mount.
- **Phase 10** `CmdOrCtrl+C` handler must be a no-op when stage has no image.

**Acceptance:**
- [ ] Capturing region → editor appears with image. Close editor → window hides. Tray → "Open Editor" → same image + annotations restored.
- [ ] Two captures in a row: second replaces first; editor shown only once.
- [ ] Cold start → tray "Open Editor" → editor shown empty with paste hint.
- [ ] Cmd/Ctrl+V with image on clipboard loads it into editor.
- [ ] Cmd/Ctrl+V with no image → toast "Clipboard has no image", no crash.
- [ ] Tray Quit removes active temp PNG.
- [ ] Annotations persist across hide/show within an app session.
- [ ] App quit + relaunch → workspace is empty (no cross-restart persistence).

---

### Phase 12: First-Launch Onboarding & macOS Permissions

**Goal:** First launch shows a guided flow to grant Screen Recording permission (macOS) and pick initial hotkeys.

**Tasks:**
1. On startup, check if `config.onboarding_completed === true`. If not, open `/onboarding` window instead of going straight to tray.
2. `src/app/onboarding/page.tsx` — multi-step:
   - **Step 1:** Welcome
   - **Step 2:** Permission check (macOS only)
     - Call Rust command `check_screen_recording_permission` (uses `CGPreflightScreenCaptureAccess()` via FFI or shells out)
     - If denied, show button: "Open System Settings" → invokes `open_system_settings_screen_recording` Rust command:
       ```rust
       #[cfg(target_os = "macos")]
       #[tauri::command]
       pub fn open_system_settings_screen_recording() -> Result<(), String> {
           std::process::Command::new("open")
               .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
               .spawn().map_err(|e| e.to_string())?;
           Ok(())
       }
       ```
     - Show "I've granted permission" button → re-check → if granted, proceed; if not, prompt relaunch (TCC needs app relaunch after grant)
   - **Step 3:** Pick hotkeys (reuse `HotkeyRecorder`)
   - **Step 4:** Output prefs (default mode: file or clipboard, default folder)
   - **Step 5:** Autostart toggle
   - **Step 6:** Done → save config, set `onboarding_completed=true`, close onboarding, show tray icon
3. macOS permission check via Objective-C runtime FFI:
   ```rust
   #[cfg(target_os = "macos")]
   pub fn has_screen_recording_permission() -> bool {
       use objc2::msg_send;
       // Use CGPreflightScreenCaptureAccess (CoreGraphics)
       extern "C" {
           fn CGPreflightScreenCaptureAccess() -> bool;
           fn CGRequestScreenCaptureAccess() -> bool;
       }
       unsafe { CGPreflightScreenCaptureAccess() }
   }
   ```
   Add `core-foundation` and link `CoreGraphics` framework in `build.rs`.
4. For accessibility permission (if needed for global hotkeys on macOS):
   - Use `AXIsProcessTrustedWithOptions` from `ApplicationServices`
5. Relaunch app post-permission-grant via `tauri-plugin-process`:
   ```ts
   import { relaunch } from '@tauri-apps/plugin-process';
   await relaunch();
   ```
6. Windows: no equivalent permission required for screen capture — skip Step 2 entirely.

**Files:**
- `src/app/onboarding/page.tsx`
- `src-tauri/src/commands/permissions.rs`
- `src-tauri/build.rs` (link CoreGraphics on macOS)

**Acceptance:**
- [ ] First launch on fresh macOS opens onboarding
- [ ] Permission check correctly identifies granted/not-granted state
- [ ] "Open System Settings" deep-link works
- [ ] After granting + relaunch, onboarding detects permission and advances
- [ ] Subsequent launches skip onboarding and go straight to tray
- [ ] Windows first launch skips macOS-only steps
- [ ] If user quits onboarding mid-flow, next launch resumes at correct step

---

### Phase 13: Autostart Integration

**Goal:** Toggle in Settings (and onboarding) enables/disables launch at login.

**Tasks:**
1. Install: `pnpm tauri add autostart`
2. Configure in `lib.rs`:
   ```rust
   .plugin(tauri_plugin_autostart::init(
       tauri_plugin_autostart::MacosLauncher::LaunchAgent,
       Some(vec![]),
   ))
   ```
3. Wire toggle in settings UI:
   ```ts
   import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';

   const toggleAutostart = async (on: boolean) => {
     if (on) await enable(); else await disable();
   };
   ```
4. Add capability: `autostart:default`

**Acceptance:**
- [ ] Enabling autostart, logging out + back in → app launches into tray automatically
- [ ] Disabling autostart → no launch on login
- [ ] State persists across app restarts

---

### Phase 14: Polish, Logging, Error Handling

**Goal:** App is robust to common failure modes and produces useful logs.

**Tasks:**
1. Install `pnpm tauri add log`. Configure to write to OS log dir + stdout in dev.
2. Wrap every Tauri command with structured logging (entry, exit, errors).
3. Add toast notifications for all user-visible errors (use shadcn `Sonner`).
4. Handle edge cases:
   - Disk full on save
   - Clipboard write denied (rare, but possible on Linux/sandboxed envs)
   - Hotkey registration fails on app start → show settings window with error highlighted
   - Capture fails (screen locked, permission revoked mid-session) → recovery flow
5. Add "About" dialog with version, build date, OS info.
6. Add capture sound effect (optional, toggleable in settings) — use Web Audio API in editor window after capture completes, OR play a system sound from Rust.

**Acceptance:**
- [ ] Logs written to `~/Library/Logs/dev.baze.shotr/` (macOS) and `%LOCALAPPDATA%\dev.baze.shotr\logs\` (Windows)
- [ ] All error states show user-visible messages
- [ ] No silent failures
- [ ] Capture sound plays if enabled

---

### Phase 15: Packaging & Distribution

**Goal:** Signed, notarized builds ready for distribution.

> **Interim status (2026-05-23):** unsigned dual-arch macOS + Windows CI builds wired in [.github/workflows/build.yml](.github/workflows/build.yml); tag `v*` drafts a GitHub Release. Free-distribution path via Homebrew Cask under [packaging/homebrew-cask/](packaging/homebrew-cask/) uses a `postflight xattr` to strip `com.apple.quarantine` (Gatekeeper bypass for unsigned builds). Tasks below describe the **signed/notarized** target state; once shipped, remove the cask `postflight` and add `stapler staple` to the release job. See PROGRESS.md → "Phase 15 — interim CI + free-distribution".

**Tasks:**
1. **macOS:**
   - Apple Developer ID Application certificate in keychain
   - Configure `tauri.conf.json > bundle > macOS`:
     ```json
     {
       "signingIdentity": "Developer ID Application: <Name> (<TEAMID>)",
       "providerShortName": "<TEAMID>",
       "entitlements": "entitlements.plist"
     }
     ```
   - `entitlements.plist` with required entries:
     - `com.apple.security.device.audio-input` (no — we don't capture audio)
     - `com.apple.security.cs.allow-jit` (yes — for webview)
     - `com.apple.security.cs.disable-library-validation` (yes — for plugin loading)
   - Notarization via `tauri.conf.json > bundle > macOS > notarization` or `xcrun notarytool` post-build
   - Verify `spctl -a -t exec -vv ./Shotr.app` reports "accepted"
2. **Windows:**
   - Code signing cert (Sectigo, DigiCert, or similar)
   - `tauri.conf.json > bundle > windows`:
     ```json
     {
       "certificateThumbprint": "<THUMBPRINT>",
       "digestAlgorithm": "sha256",
       "timestampUrl": "http://timestamp.digicert.com"
     }
     ```
   - Build `.msi` via `pnpm tauri build`
   - Optionally also build `.exe` installer with `nsis` target
3. **Auto-update setup:** see Phase 16 (full implementation as separate phase)
4. Build pipeline (GitHub Actions):
   - Matrix: `[macos-14, windows-latest]`
   - Use `tauri-apps/tauri-action`
   - Store signing secrets in GitHub Secrets

**Acceptance:**
- [ ] macOS `.dmg` opens without Gatekeeper warning on a fresh Mac
- [ ] Windows `.msi` installs without SmartScreen warning (or only minor warning until reputation builds)
- [ ] Both binaries pass `tauri info` checks
- [ ] App launches and works on clean target OS

---

### Phase 16: Auto-Update with `tauri-plugin-updater`

**Goal:** App can detect new versions, prompt the user with a Yes/No dialog, download a signed update bundle, verify it, and relaunch into the new version — all without re-running the original installer.

**Prerequisites:**
- Phase 15 complete (app is code-signed; this is a separate signing layer specifically for update artifacts)
- A versioning convention is decided (recommend semver, tags like `v1.2.3`)
- Distribution decision is "direct" (GitHub Releases or self-hosted), **not** Mac App Store / Microsoft Store

#### 16.1 Generate Ed25519 update-signing keypair (one-time, never regenerate)

> ⚠️ **CRITICAL:** This key is **separate from** Apple Developer ID / Windows code signing certs. Losing it means **every existing user is permanently stranded on their current version** — they cannot receive any future update because the signature won't validate. Back it up in 1Password / Bitwarden / encrypted offline storage. Do not commit to git.

```bash
pnpm tauri signer generate -w ~/.tauri/shotr-updater.key
# Set a strong password. Save both password and key file in a secrets manager.
```

This produces:
- `~/.tauri/shotr-updater.key` — **private** key (signs update bundles in CI)
- `~/.tauri/shotr-updater.key.pub` — **public** key (embedded in app at build time)

#### 16.2 Install plugin and dependencies

```bash
pnpm tauri add updater
pnpm add @tauri-apps/plugin-process     # for relaunch() after install
# @tauri-apps/plugin-dialog should already be installed from Phase 7
```

#### 16.3 Configure `tauri.conf.json`

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/<org>/<repo>/releases/latest/download/latest.json"
      ],
      "pubkey": "<paste contents of shotr-updater.key.pub here, no newlines>",
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

The `createUpdaterArtifacts` flag tells Tauri's bundler to produce updater artifacts. If migrating from Tauri v1, use `"v1Compatible"` instead. This setting will be removed in v3 — change to `true` once all users have migrated.

Per-platform `installMode` options for Windows (macOS auto-applies an in-place swap, no mode needed):

| Mode | Behavior | When to use |
|---|---|---|
| `passive` (recommended) | Small unobtrusive progress UI, no user clicks needed | Consumer apps |
| `quiet` | No UI at all, fully silent | Enterprise/MDM rollouts |
| `basicUi` | Full installer wizard, same as fresh install | When changes are major and you want user confirmation each step |

#### 16.4 Update capabilities

Add to `src-tauri/capabilities/default.json` (or whichever capability the settings window uses):

```json
{
  "permissions": [
    "updater:default",
    "process:allow-restart",
    "dialog:default"
  ]
}
```

#### 16.5 CI: store signing key as GitHub secrets

In repo Settings → Secrets and variables → Actions, add:

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Full content of `~/.tauri/shotr-updater.key` (multi-line) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password set at key generation |

These are **in addition to** the macOS notarization secrets and Windows code-signing secrets from Phase 11. Total secrets expected: roughly 8–11 depending on signing setup.

#### 16.6 Update checker service (Rust + frontend)

Create `src/lib/updater.ts`:

```ts
import { check, type Update } from '@tauri-apps/plugin-updater';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdateCheckResult =
  | { kind: 'none' }
  | { kind: 'available'; update: Update }
  | { kind: 'error'; error: string };

export async function checkForUpdates(silent = false): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (!update?.available) {
      if (!silent) await message('You are on the latest version.', { title: 'No Updates', kind: 'info' });
      return { kind: 'none' };
    }
    return { kind: 'available', update };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (!silent) await message(`Update check failed: ${error}`, { title: 'Update Error', kind: 'error' });
    return { kind: 'error', error };
  }
}

export async function promptAndInstall(
  update: Update,
  onProgress?: (downloaded: number, total: number | undefined) => void,
): Promise<boolean> {
  const userVersion = useSettings.getState().updates.skippedVersion;
  if (userVersion === update.version) return false; // user previously skipped this version

  const ok = await ask(
    `Version ${update.version} is available.\n\n${update.body ?? ''}\n\nDownload and install now?`,
    { title: 'Update Available', kind: 'info', okLabel: 'Install', cancelLabel: 'Later' }
  );
  if (!ok) return false;

  let downloaded = 0;
  let contentLength: number | undefined;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength;
        onProgress?.(0, contentLength);
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, contentLength);
        break;
      case 'Finished':
        onProgress?.(contentLength ?? downloaded, contentLength);
        break;
    }
  });

  await relaunch();
  return true;
}

export async function skipVersion(version: string) {
  useSettings.getState().setSkippedVersion(version);
}
```

#### 16.7 Settings UI additions

Extend `AppConfig` from Phase 2:

```ts
updates: {
  autoCheck: boolean;            // default: true
  checkIntervalHours: number;    // default: 24
  channel: 'stable' | 'beta';    // default: 'stable' — v1 may only ship 'stable'
  skippedVersion: string | null; // version user explicitly chose to skip
  lastCheckedAt: number | null;  // unix ms
}
```

Add to Settings → "Updates" tab:
- Toggle: "Automatically check for updates"
- Interval selector: 6h / 24h / 7d
- Button: "Check for updates now" → calls `checkForUpdates(false)`
- Display current version and last-checked timestamp
- (Optional) Channel selector if multi-channel is implemented

#### 16.8 Background check scheduler (Rust)

In `src-tauri/src/lib.rs`, after app setup:

```rust
// Run check N seconds after launch, then on interval
.setup(|app| {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // Delay first check to avoid blocking startup
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        loop {
            let config = state::load_config(&handle).ok();
            let auto = config.as_ref().map(|c| c.updates.auto_check).unwrap_or(true);
            let interval_hours = config
                .as_ref()
                .map(|c| c.updates.check_interval_hours)
                .unwrap_or(24);
            if auto {
                let _ = handle.emit("updater://check-now", ());
            }
            tokio::time::sleep(std::time::Duration::from_secs(interval_hours as u64 * 3600)).await;
        }
    });
    Ok(())
})
```

Frontend listens for `updater://check-now` events (in the settings window, since it's the persistent UI surface) and runs `checkForUpdates(true)`. If an update is found, the dialog appears even if the settings window was hidden — `ask()` opens a native OS dialog regardless.

#### 16.9 Update flow UX states (handle all of these)

| State | UI behavior |
|---|---|
| Manual check, no update | Toast or dialog: "You're on the latest version" |
| Manual check, update found | Dialog with Install / Skip / Later |
| Automatic check, update found | Same dialog as manual (per platform conventions) |
| User clicked Install | Progress bar in tray icon tooltip + optional settings window |
| Download failed (network) | Toast: "Update download failed, will retry later" |
| Signature verification failed | **Error dialog, do NOT install** — this means tampered bundle; log to error log |
| User clicked Skip | Persist `skippedVersion = X` — won't prompt for this version again |
| User clicked Later | Will prompt again on next interval |
| Currently on skipped version, newer one releases | Reset skip state, prompt for new version |

#### 16.10 `latest.json` manifest format

The endpoint must return JSON in this exact shape (Tauri parses it strictly):

```json
{
  "version": "1.2.3",
  "notes": "## What's new\n- Fixed crash on multi-monitor\n- Added WebP export",
  "pub_date": "2026-05-21T14:30:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<base64 .sig file content>",
      "url": "https://github.com/<org>/<repo>/releases/download/v1.2.3/Shotr_1.2.3_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<base64 .sig file content>",
      "url": "https://github.com/<org>/<repo>/releases/download/v1.2.3/Shotr_1.2.3_x64.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<base64 .sig file content>",
      "url": "https://github.com/<org>/<repo>/releases/download/v1.2.3/Shotr_1.2.3_x64-setup.nsis.zip"
    }
  }
}
```

> Note: For Windows, Tauri ships **MSI** or **NSIS** updates as `.zip` archives. `latest.json` should reference the `.zip`, not the bare `.msi`/`.exe`.
> macOS ships the `.app` inside a `.tar.gz`.

#### 16.11 Release workflow (GitHub Actions)

Create `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-14'        # Apple Silicon
            args: '--target aarch64-apple-darwin'
          - platform: 'macos-14'        # Intel
            args: '--target x86_64-apple-darwin'
          - platform: 'windows-latest'
            args: ''
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-14' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}
      - run: pnpm install
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Updater signing (Phase 16)
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          # macOS notarization (Phase 15)
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # Windows code signing (Phase 15)
          WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
          WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Shotr ${{ github.ref_name }}'
          releaseBody: 'See CHANGELOG.md for details.'
          releaseDraft: true            # review before publishing
          prerelease: false
          args: ${{ matrix.args }}
          updaterJsonPreferNsis: true   # Windows: prefer NSIS over MSI in latest.json
```

The tauri-action automatically uploads `latest.json` to the GitHub Release, which the updater plugin reads to detect available updates. No manual upload needed.

#### 16.12 Local testing procedure

> Auto-update is **hard to test in production** — you can't easily "go back in time" once your installed app version is new. Test locally before pushing tags.

1. Build the app at version `0.1.0` (set in `tauri.conf.json > version` and `package.json`)
2. Install the built artifact normally
3. Bump version to `0.2.0` in both files
4. Build again with `TAURI_SIGNING_PRIVATE_KEY` env vars set
5. Create `latest.json` manually with the signature contents of the `.sig` file generated alongside the installer
6. Host `latest.json` locally (e.g., `python3 -m http.server 8000`) and temporarily point the updater endpoint at `http://localhost:8000/latest.json`
7. Launch the installed `0.1.0` app → trigger update check → verify dialog appears with `0.2.0`
8. Click Install → verify download, install, relaunch into `0.2.0`
9. **Test signature verification failure:** modify the `.zip`/`.tar.gz` after signing → updater should refuse to install

#### 16.13 Failure modes & recovery

| Failure | Diagnosis | Recovery |
|---|---|---|
| `404` on latest.json | URL wrong, or release not published | Fix endpoint URL or publish release |
| `signature did not match` | Wrong pubkey embedded, or `latest.json` references wrong signature | Verify pubkey in `tauri.conf.json` matches the `.key.pub`; regenerate `latest.json` |
| Download stalls / fails | User behind corp proxy/firewall | Provide fallback: show "Download manually" link to release page |
| macOS: app fails to relaunch after update | Notarization issue with new binary | User must download fresh installer; log to error reporter |
| Windows: SmartScreen blocks update | New cert without reputation | Same as fresh install — wait for reputation or use EV cert |
| User runs `0.1.0` after `0.2.0` is out, declines update repeatedly | Expected | After 3+ declines, soften prompt to weekly instead of daily |

**Acceptance:**
- [ ] `pnpm tauri signer generate` produces keypair successfully
- [ ] Building with `createUpdaterArtifacts: true` produces a `.sig` file alongside each installer
- [ ] Local test: `0.1.0` installed app detects locally-hosted `0.2.0` `latest.json`
- [ ] Update dialog displays version, release notes, Install/Skip/Later buttons
- [ ] Clicking Install downloads, verifies signature, installs, relaunches into new version
- [ ] Tampered bundle is rejected with signature error (manual test by modifying `.zip` after build)
- [ ] Settings UI shows current version and last-checked time
- [ ] Toggling autoCheck off prevents background checks
- [ ] "Skip this version" persists across app restarts
- [ ] CI workflow on `v*` tag produces `latest.json` and signed artifacts in GitHub Release
- [ ] End-to-end: tagging `v0.2.0` → CI builds and publishes → existing `v0.1.0` user gets update prompt within configured interval

---

## 5. Cross-Cutting Concerns (Read Before Phase 4+)

### 5.1 High-DPI / Retina Handling

- **xcap returns physical pixels.** A 1920x1080 logical monitor on a Retina display returns 3840x2160 from xcap.
- **Window coordinates from the overlay are in logical pixels** (CSS pixels). Multiply by `window.devicePixelRatio` (frontend) **or** `monitor.scale_factor()` (Rust) before passing to xcap.
- **Konva stage** should use `pixelRatio: 2` when exporting on Retina to maintain quality.
- **Test on:** Retina MacBook + external 1x monitor simultaneously to catch DPI scaling bugs.

### 5.2 Multi-Monitor Support

- Always enumerate monitors with `xcap::Monitor::all()`.
- **Overlay window must cover the union of all monitor rects**, not just the primary. Computing this:
  ```rust
  let monitors = xcap::Monitor::all()?;
  let min_x = monitors.iter().map(|m| m.x()).min().unwrap_or(0);
  let min_y = monitors.iter().map(|m| m.y()).min().unwrap_or(0);
  let max_x = monitors.iter().map(|m| m.x() + m.width() as i32).max().unwrap_or(0);
  let max_y = monitors.iter().map(|m| m.y() + m.height() as i32).max().unwrap_or(0);
  ```
- Negative coords are normal (monitor to the left of primary).
- When user-selected region spans monitors, you can either: (a) capture each monitor and stitch (correct but complex), or (b) restrict selection to single monitor (simpler — recommended for v1). Choose (b) for v1.

### 5.3 Hotkey Conflict Resolution

- Reserved on macOS (cannot be overridden silently): `Cmd+Space`, `Cmd+Tab`, `Cmd+Q`, `Cmd+Shift+3/4/5`.
- `register()` may succeed even if another app has the shortcut — last-registered wins on some OSes. **Document this limitation in onboarding.**
- Provide a "Reset to defaults" button in Settings.
- Default suggested hotkeys (avoiding common conflicts):
  - Full screen: `CmdOrCtrl+Alt+Shift+3`
  - Area: `CmdOrCtrl+Alt+Shift+4`

### 5.4 Temp File Cleanup

- Captured PNGs are written to OS temp dir before editor opens.
- On editor close (saved or canceled), delete the temp file.
- On app startup, sweep any leftover `shotr-temp-*.png` files older than 24h.

### 5.5 IPC Contract Types

- Define shared types in `src/types/ipc.ts` and mirror in Rust with `ts-rs` or hand-written struct mirrors. Recommendation: use `ts-rs` (`cargo add ts-rs --features serde-compat`) to auto-generate TypeScript types from Rust structs during build.

### 5.6 Logging Levels

| Level | Use for |
|---|---|
| `error` | Capture failure, save failure, panic recovery |
| `warn`  | Hotkey conflict, permission denied |
| `info`  | Window open/close, capture initiated, save success |
| `debug` | Coordinate math, IPC payloads |
| `trace` | Verbose stage operations (off by default) |

### 5.7 Frontend Window Identification

Every Tauri window must be uniquely labeled. Don't use the default `main` window for multiple purposes. Labels:
- `settings`
- `overlay`
- `editor-<timestamp>` (multiple editor windows can coexist if user captures rapidly)
- `onboarding`

### 5.8 Updater Key Management (CRITICAL)

The Ed25519 update-signing key is a **single point of failure for the entire user base**.

- The key signs update artifacts; the embedded public key in shipped binaries verifies them
- If lost, every installed copy of the app is **permanently** unable to receive updates — users would have to manually download and reinstall a new version from a new key
- If leaked, an attacker can sign malicious updates that pass verification on every installed copy
- **Storage rules:**
  - Primary: encrypted secrets manager (1Password / Bitwarden / Vault) — at least two team members have access
  - Secondary: encrypted offline backup (hardware-encrypted USB or printed paper backup with QR code) stored physically separate from primary
  - CI: stored only as encrypted GitHub Actions secrets, never written to disk in workflow logs
  - Local dev: `~/.tauri/` is acceptable for the maintainer's machine, but never `cd`-friendly paths inside the repo
- **Rotation:** Effectively impossible without forced reinstall, so treat as forever. Use a strong password (20+ chars random).
- This key is **separate from**: Apple Developer ID cert, Windows code signing cert, GitHub auth tokens. Do not conflate them.

---

## 6. Testing Strategy

### Unit Tests (Rust)
- `monitor_service::virtual_desktop_bounds()` — mock monitor configs
- `image_service::encode_png()` — round-trip test
- Hotkey string parsing edge cases

### Integration Tests (Rust)
- Skip actual screen capture (CI has no display) — mock `xcap` behind a trait
- Test temp file lifecycle

### E2E Tests (optional)
- Use `tauri-driver` + Selenium/WebDriver for UI flows
- Critical paths only: settings save, hotkey register, capture → editor → save

### Manual Test Matrix (before release)

| Test | macOS Retina | macOS non-Retina | Windows 1x | Windows HiDPI |
|---|---|---|---|---|
| Full capture | | | | |
| Area capture single monitor | | | | |
| Area capture spans monitors | | | | |
| Save PNG | | | | |
| Save JPEG quality 70 | | | | |
| Copy to clipboard → paste in Notes/Notepad | | | | |
| Copy to clipboard → paste in Slack | | | | |
| Hotkey while another app fullscreen | | | | |
| Onboarding fresh install | | | | |
| Autostart after reboot | | | | |

---

## 7. Definition of Done (v1.0.0)

- [ ] All 13 phases (0–12) complete and acceptance-checked
- [ ] Signed, notarized macOS `.dmg`
- [ ] Signed Windows `.msi` (or NSIS `.exe`)
- [ ] Update-signing keypair backed up to secrets manager (1Password / Bitwarden / encrypted offline)
- [ ] CI workflow: tagging `v*` produces signed artifacts + `latest.json` in GitHub Release
- [ ] End-to-end update test passed (older version receives, verifies, installs newer version)
- [ ] README with screenshots, install instructions, hotkey docs, update behavior notes
- [ ] CHANGELOG.md (drives the `notes` field of `latest.json`)
- [ ] LICENSE file
- [ ] No `console.error` or unhandled Rust panics in 30-min smoke test
- [ ] Memory footprint < 100 MB idle, < 300 MB during edit
- [ ] Capture-to-editor latency < 500ms (P50)

---

## 8. Key References (for Claude Code lookup)

- Tauri v2 docs: https://v2.tauri.app
- Tauri v2 Global Shortcut: https://v2.tauri.app/plugin/global-shortcut/
- Tauri v2 Clipboard Manager: https://v2.tauri.app/reference/javascript/clipboard-manager/
- Tauri v2 Dialog: https://v2.tauri.app/plugin/dialog/
- Tauri v2 FS: https://v2.tauri.app/plugin/file-system/
- Tauri v2 Store: https://v2.tauri.app/plugin/store/
- Tauri v2 Autostart: https://v2.tauri.app/plugin/autostart/
- Tauri v2 Updater plugin: https://v2.tauri.app/plugin/updater/
- Tauri v2 Updater (JS API): https://v2.tauri.app/reference/javascript/updater/
- Tauri v2 Process plugin (relaunch): https://v2.tauri.app/plugin/process/
- Tauri v2 Capabilities: https://v2.tauri.app/security/capabilities/
- xcap crate: https://github.com/nashaofu/xcap
- image crate: https://github.com/image-rs/image
- Konva.js docs: https://konvajs.org/docs/
- react-konva: https://konvajs.org/docs/react/
- Apple CGPreflightScreenCaptureAccess: https://developer.apple.com/documentation/coregraphics/1563117-cgpreflightscreencaptureaccess
- Apple TCC overview: https://developer.apple.com/documentation/security/protecting_user_data
- Tauri Action (CI): https://github.com/tauri-apps/tauri-action

---

## 9. Open Questions (Resolve with User Before Phase 7)

1. **Branding:** App name, icon, color palette? (placeholder: "Shotr")
2. **Default output mode:** File or Clipboard? (recommend: ask each time on first install)
3. **Filename template:** Default to `shotr-{yyyy}{MM}{dd}-{HHmmss}` or user-chosen?
4. **Sticker library:** Bundle a built-in set, or only allow user-uploaded PNGs? (recommend: small built-in set + paste from clipboard)
5. **Update channel:** GitHub Releases public, or self-hosted CDN?
6. **Telemetry:** Confirm "no telemetry in v1" — Sentry crash reporting OK with opt-in?

---

## 10. Execution Notes for Claude Code

- Use `pnpm` for all JS package operations, never `npm` or `yarn`.
- Use `cargo add` for Rust deps, never edit `Cargo.toml` manually unless setting target-specific configs.
- After every phase, run: `pnpm tauri dev` and verify acceptance criteria interactively.
- Commit after each phase with conventional commit format: `feat(phase-N): <description>`.
- If a phase's acceptance check fails, do not advance — debug and re-verify.
- Maintain a `PROGRESS.md` file with a checklist of completed phases.
- When in doubt about a Tauri API, check the official v2 docs (linked in section 8) before guessing — APIs changed significantly from v1.
- All Rust code must be `clippy`-clean (`cargo clippy --all-targets -- -D warnings`).
- All TypeScript must pass `tsc --noEmit` with strict mode.