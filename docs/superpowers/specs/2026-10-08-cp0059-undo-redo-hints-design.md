# CP-0059 — Make undo/redo discoverable on Windows

From [capz-inbox#11](https://github.com/wadjakorn/capz-inbox/issues/11)
(Windows 0.16.0 user asking for undo/redo with Ctrl+Z). Ticket CP-0059.

## Goal

Undo/redo already exist (toolbar buttons + ⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z), but the
toolbar tooltips hard-code macOS glyphs (`⌘Z`, `⇧⌘Z`), so Windows users never
learn that Ctrl+Z works. Show platform-correct hints and add the Windows
convention Ctrl+Y for redo.

## Current state

- `src/hooks/useEditorShortcuts.ts`: `mod && key === "z"` → undo / redo with
  Shift, where `mod = metaKey || ctrlKey`. Ctrl+Y is unbound (falls through to
  `if (mod) return;`).
- `src/components/editor/Toolbar.tsx`: undo `hint="⌘Z"`, redo `hint="⇧⌘Z"`,
  new workspace `hint="⇧⌘N"`. `src/components/editor/WorkspaceBar.tsx`: new
  workspace title `… (⌘⇧N)`.
- `src/lib/shortcuts.ts` already has `formatShortcut(accel, platform)` and
  `currentPlatform()`. `ExportSplitButton` shows the hydration-safe pattern:
  platform state pinned to `"win"` (the prerender value) until mount.

## Design

| Aspect | Decision |
|---|---|
| Hints | Built with `formatShortcut("CmdOrCtrl+Z")`, `"CmdOrCtrl+Shift+Z"`, `"CmdOrCtrl+Shift+N"` → `⌘Z` / `⌘⇧Z` / `⌘⇧N` on macOS, `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Shift+N` elsewhere (Windows desktop, `/paste` on non-Mac browsers). Modifier order follows `formatShortcut` (the same order already used for global hotkeys and `WorkspaceBar`). |
| Hydration | New `usePlatform()` hook (`src/hooks/usePlatform.ts`): `"win"` during prerender/first render, real platform after mount — the `ExportSplitButton` pattern, extracted so it can be reused. |
| Ctrl+Y | Redo, **only when not on macOS**, only plain Ctrl+Y (no Shift/Alt/Meta). `preventDefault()` so browsers' Ctrl+Y (history in some) doesn't fire. Cmd+Y on macOS stays unbound. |
| Guards | Same as the Z handler: ignored while typing in an input/textarea/contentEditable (covers on-canvas text editing, which is a `<textarea>` overlay). Crop mode behaves like Ctrl+Z (history works there too). |
| i18n | No new strings — only key labels, which are not translated. |

## Edge cases

- Desktop vs `/paste`: both render the same `Toolbar` and call the same hook,
  so both get it. On a Mac browser `/paste` keeps ⌘ glyphs.
- Ctrl+Y on macOS: still unbound (Ctrl on mac counts as `mod` for Z, but Y is
  Windows-only by decision).

## Out of scope

Undo semantics, history depth, the other hard-coded `⌘` hints (zoom menu).
