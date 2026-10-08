# CP-0058 — Keep unsaved editor work across an app update

From [capz-inbox#10](https://github.com/wadjakorn/capz-inbox/issues/10).
Ticket CP-0058. Owner decision: a small updater-only fix, independent of CP-0010.

## Goal

Installing an update relaunches capz. Work in the editor must either survive
that relaunch or the user must be told, in the update prompt, that it will not.

## Current state

- `checkForUpdates()` (`src/lib/updater.ts`) returns an `available` result whose
  `downloadAndInstall()` calls the plugin's `update.downloadAndInstall()` and then
  `relaunch()`. `promptAndInstall()` shows the native `ask` dialog
  (`app.updater.prompt`) and, on Install, calls it. Both callers — the
  `updater://check-now` listener and Settings → App → "Check now" — run in the
  `editor` window, so the editor and workspace stores are in the same JS context.
- Workspaces (`src/stores/workspaces.ts`) are **off by default**
  (`workspaces.enabled: false`). With them off nothing in the editor is
  persisted at all.
- With workspaces on, `commitActive()` snapshots the live editor into the
  active doc and schedules an 800 ms debounced write; `flushPersist()` writes
  now. `persistNow()` drops docs whose image is a `blob` (pasted/dropped), so a
  pasted image never survives a restart.
- Window close and window blur already do `commitActive()` + `flushPersist()`;
  an update relaunch does neither reliably.

## Design

| Aspect | Decision |
|---|---|
| Flush | With workspaces on, `commitActive()` + `await flushPersist()` **after the download and before install**. The plugin's `download()` and `install()` are called separately (instead of `downloadAndInstall()`) so edits made while the download runs are captured too, and so the flush happens before install — on Windows the installer may tear the process down as soon as install starts. |
| Flush failures | Never block the update: errors are logged and the install proceeds (the user already chose Install). |
| Warning — workspaces off | If the editor holds an image (`hasImage`) or any annotation, the prompt adds: the current image and annotations will be lost; export or copy first, or turn on Workspaces. |
| Warning — workspaces on | If the active workspace's image is a `blob` (pasted/dropped), the prompt adds: the pasted image can't be kept; export or copy first. File-backed workspaces get no warning — they are flushed. |
| "Unsaved" | Any image or annotation present. capz has no reliable "exported since last change" flag, so err on warning. |
| Dialog | The warning is an extra paragraph inside the existing `ask` dialog's message, placed before the "Download and install now?" question. No new dialog. "Later" keeps today's behaviour. |
| Platform | Desktop only. The updater does not exist in `/paste`; nothing changes there. |
| i18n | Two new keys in `app` namespace, English + Thai. The prompt string gains a `{warning}` slot (empty when there is nothing to warn about). |

### Code shape

- `src/lib/updater.ts`
  - `unsavedWorkWarning(): string` — `""` or the localised warning paragraph
    (with its leading blank line), from `useSettings` config + `useEditor` +
    `useWorkspaces` state.
  - `saveEditorWorkForRestart(): Promise<void>` — the flush, no-op when
    workspaces are off, swallows errors.
  - `downloadAndInstall` = `download()` → `saveEditorWorkForRestart()` →
    `install()` → `relaunch()`.
  - `promptAndInstall` passes `warning: unsavedWorkWarning()` to the prompt.

## Edge cases

- Workspaces enabled in config but the store not yet initialised / no active
  workspace: `commitActive` already returns early; flush writes the empty set
  as it would on blur.
- Warning text is computed when the dialog opens. Work started while the dialog
  is up is not reflected; acceptable (modal native dialog).
- Crop mode / text editing in progress: no special handling; the warning keys
  off image/annotation presence only.

## Out of scope

- Persisting the editor when workspaces are off (CP-0010 territory).
- Restoring undo history across a restart (session-only by design).
- Persisting blob images.

## Verification

Unit tests for the warning matrix and the download → flush → install →
relaunch order. A real old-build → new-build update on macOS and Windows is
owner-tested (`Gate: owner-test`).
