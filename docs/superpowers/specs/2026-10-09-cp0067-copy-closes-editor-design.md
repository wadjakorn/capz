# CP-0067 — Optional setting: ⌘C / Ctrl+C copies and closes the editor

From [capz-inbox#14](https://github.com/wadjakorn/capz-inbox/issues/14)
(owner-accepted). Ticket CP-0067.

## Goal

People who don't reach for Esc want one keystroke that copies the screenshot
and gets the editor out of the way. A new, **off-by-default** setting makes
⌘C / Ctrl+C in the editor copy the whole image as today and then hide the
editor window, the same way closing it does. Desktop only.

## Current state

- ⌘C: keydown handler in `src/app/editor/page.tsx` (~L484). With an element
  selected it copies the element (CP-0068, `copySelectedElement`); otherwise
  `copyOnly(stage)` copies the whole image and toasts. Errors → the export
  error toast.
- Window close (`onCloseRequested`, same file): commit + flush the active
  workspace → `runPreCloseAction()` (`src/lib/preClose.ts`, driven by
  `general.closeAction`) → `win.hide()`.
- Double-Esc (`src/hooks/useEditorShortcuts.ts`): `runPreCloseAction()` →
  `hide()`. Not changed here.
- "When you close the editor" (`after.onClose`) lives on the **Saving** page
  (`AfterCapturePage.tsx`, page id `after`).

## Design

| Aspect | Decision |
|---|---|
| Setting | `general.copyClosesEditor: boolean`, default `false`. Row id `after.copyCloses`, placed directly below "When you close the editor" on the Saving page (the proposal said "General (near On close)"; On close lives on Saving, so it goes next to it). `addedIn: "0.18.0"` for the New badge. |
| Label | EN "Close the editor after copying with ⌘C / Ctrl+C" · TH "ปิดตัวแก้ไขหลังคัดลอกด้วย ⌘C / Ctrl+C" (glossary: editor = ตัวแก้ไข, not the proposal's หน้าแก้ไข). Hint: EN "Copies the whole image, then closes. With an element selected, ⌘C copies only that element and the editor stays open." TH equivalent. |
| Schema | Bump `CONFIG_SCHEMA_VERSION` 4 → 5, identity migration step 4, fixture `v5.json`, `shape.v5.json`. No Rust reader reads this key, and none of the listed Rust paths move. |
| When it closes | Only after a **successful whole-image** copy from the keyboard shortcut. Element copy (something selected) never closes. Toolbar copy and right-click Copy are unaffected. |
| Close path | New `closeEditor({ alreadyCopied })` in `src/lib/closeEditor.ts`: commit + flush the active workspace → `runPreCloseAction({ alreadyCopied })` → `getCurrentWindow().hide()`. The window's `onCloseRequested` handler uses it too (with no option), so the two can't drift. |
| Pre-close action | `runPreCloseAction({ alreadyCopied: true })`: `copy` → skip (no double copy, no second toast); `both` → run the save part only (`saveOnly`); `file` → save as usual; `none` → nothing. |
| Copy failure | Window stays open; the existing export error toast is shown. |
| Guards | Unchanged: typing in an input/textarea/contentEditable (covers on-canvas text editing), selected page text, view ≠ editor, no image → shortcut does nothing. |
| Desktop vs `/paste` | `/paste` has its own ⌘C handler and no settings view, so it is unaffected. In the editor route the close is also gated by `isTauriRuntime()` (the `/editor` route under `pnpm dev` has no window to hide). The settings row is shown on both macOS and Windows. |
| Toast | The "Copied" success toast is still fired before hiding; it shows next time the window opens only if still within its lifetime — harmless and consistent with the close-action toasts. |

## Edge cases

- Crop mode: unchanged — ⌘C copies the rendered stage as before; if the
  setting is on, the editor closes after it.
- Multi-workspace: the active workspace is committed + flushed before hiding,
  as on window close.
- Setting on, element selected: element copied, editor stays open (Decision).

## Out of scope

Other shortcuts that close the editor, changing the default, changing
double-Esc.
