# Settings revamp plan — scrutiny findings (3 passes)

Plan: [settings-revamp-implementation.md](settings-revamp-implementation.md) · Design: [settings-revamp.md](settings-revamp.md) · Checked against `origin/main` @ `c24d7ca` (v0.13.0)

Passes: (1) intent/scope, (2) code-path trace, (3) tests/rollout/UX.
Every item below was **re-checked by the main session** against `origin/main` unless marked *(reviewer only)*.

## Blockers

| # | Finding | Evidence | Fix |
|---|---|---|---|
| B1 | **No OCR setting exists.** The "Text recognition" page and `ocr.engine` row are invented. "Currently using" was misread — it is archive disk usage. | `git grep -i ocr` in `src/components/settings`, `src/lib/config.ts`: no control; `SettingsView.tsx:1076` = archive usage | Drop the page (5 pages), or add it only when the Tesseract OCR branch lands |
| B2 | **`pnpm lint` does not exist.** Plan's per-task gate fails. | `package.json` scripts: no `lint` | Gate = `pnpm tsc --noEmit && pnpm test:unit` |
| B3 | **No RTL / jsdom; Vitest only runs `*.test.ts` in node env.** T4 drift-guard render test and T7 footer test can't run. | `vitest.config.ts:9-10` `environment: "node"`, include `src/**/*.test.ts`; no `@testing-library`/`jsdom` in devDeps | Either add tooling as explicit T0 step, or make tests pure (store/registry/helpers) and cover rendering via Playwright e2e |
| B4 | **No `ui` config section; plan understates schema change** (and design says "no schema change"). | `AppConfig` sections `config.ts:41-291`; `validateConfig` `config.ts:849`; `CONFIG_SCHEMA_VERSION = 2` `:297` | Removed if T9 is cut; otherwise add fields to `general` + defaults + validator, state schema-version decision |

## Major

| # | Finding | Evidence | Fix |
|---|---|---|---|
| M1 | **No tray/Rust/old-build callers of Settings deep link.** Legacy alias map + one-release compat listener protect nothing. | tray has no "settings" reference; `show_settings_command` only registered (`lib.rs:162`), never invoked; senders are all in editor webview: `page.tsx:415`, `page.tsx:510`, `Toolbar.tsx:1200` | Delete `LEGACY_TABS`/compat listener; rewire the 3 senders; delete or document unused `show_settings_command` |
| M2 | **Mount race must be handled explicitly.** SettingsView mounts only when `view==="settings"` and subscribes after async imports — the reason `focus` prop exists. A store only fixes it if the view reads pending `target` on mount and scrolls after `ready`. | `SettingsView.tsx:141-149, 171-192`; `page.tsx:707-711` *(reviewer: "Pick folder" toast likely lands on default tab today — untested)* | T3/T5: init from `getState()`, act on target after `ready`; test "openSettings before mount" |
| M3 | **Footer "live" status caveats.** Only callers of `checkForUpdates` are manual button + `updater://check-now`; Rust emits first check after **30 s** and only if auto-update is on. `lastCheckedAt` is written on error too, so "Checked 2h ago" can mask a failure. Listener is in the editor window, so footer does update. | `lib.rs:43-55`; `page.tsx:167`; `updater.ts:37` *(line of error write: reviewer only)* | Idle state shows "Last checked …" / "Auto-check off"; store last error in status store; state 30 s delay in plan |
| M4 | **Web `/paste` never renders Settings** — `NEXT_PUBLIC_APP_VERSION` step is dead. | `src/app/paste` imports neither SettingsView nor updater | Drop next.config change + claim |
| M5 | **Capture page breaks own ≤6 rule (7 rows)**; "Show editor" counted as a capture shortcut. | design table; `SettingsView.tsx:280-333, 411` | Move "Show editor" + "Command ring" into Advanced or a "Shortcuts" group exempt from the cap; fix test rule |
| M6 | **Design table omits real controls:** "Skipped version" + clear, "Clear the list" (history). | `SettingsView.tsx:710-715`, `:978` | Add to App/Advanced and Library/Advanced |
| M7 | **Stickers is a whole form**, not a row; hiding it under Advanced hurts findability. | `SettingsView.tsx:367-369` | Visible "Manage stickers" row on Library opening the form |
| M8 | **T9 "New" badge logic incoherent:** cleared only when all pages' new rows seen in one session; platform-hidden rows never seen → never cleared; contradicts design ("cleared when page viewed"). Writing it via config store triggers spurious "Saved" toast. | plan T9; toast effect `SettingsView.tsx:224-233` | If kept: clear per row on render, skip platform-hidden, write outside the autosave signature. Or cut T9 (see scope question) |
| M9 | **Test ordering:** drift guard in T4 precedes regroup in T5; e2e selector update scheduled T11 though risk table says "before layout moves". `settings-hotkey.spec.ts` relies on `input[readonly]` + `.first()`. | plan T4/T5/T11; spec file *(reviewer only for spec detail)* | Move guard + e2e selector updates into T5 |

## Nits

- `useAppVersion` duplicates `getVersion` already in `AboutRow` (`SettingsView.tsx:726-747`) — extract, don't duplicate.
- Rename clash: "When I capture" next to "When the editor closes" on the same page — pick distinct labels (e.g. "After capturing" / "On closing the editor").
- `onOpenInertRecovery` prop (`SettingsView.tsx` props) must be plumbed to App page.
- ⌘F: no existing handler conflicts (reviewer checked page/Toolbar/EditorStage/OcrLayer); call `preventDefault` in case WebView2 find-in-page claims it *(untested)*.
- "Rust struct mirror" line is moot — Rust reads store as untyped JSON.
- Commit prefix `feat(settings):` vs CLAUDE.md `feat(phase-N):` — phases are finished; keep `feat(settings):` unless you prefer otherwise.
- Prototype shows 0.14.0; current is 0.13.0 (sample data only).
- General "~25 items" count inflated: workspaces/history are separate cards on that tab.

## Scope question (your call, not a defect)

Pass 1 recommends cutting `openSettings` store, New badges, `SettingSuggestion` (~40% of plan). **You explicitly asked** for deep-link-ready navigation and future suggested/new settings, so I'd keep `openSettings` (it also fixes M2's real race) and choose between:

- **A. Keep T9 in PR** with M8 fixes + schema field in `general`.
- **B. Ship registry + `openSettings` + `addedIn` field now; build badge/suggestion UI when the first real new setting/suggestion exists** — removes B4, M8 and most test tooling pressure.

## Verdicts

Pass 1: rework · Pass 2: fix-then-ship · Pass 3: fix-then-ship
**Overall: fix-then-ship** — core regrouping + `openSettings` are right; plan must drop the fake OCR page and legacy layer, handle the mount race, and base verification on tooling that exists.
