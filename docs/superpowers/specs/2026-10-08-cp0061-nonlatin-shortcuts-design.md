# CP-0061 — Editor shortcuts under non-Latin keyboard layouts (Thai)

Owner report while testing the v0.17.0 draft on Windows (no inbox issue).
Ticket CP-0061. Related: CP-0059, CP-0057.

## Goal

Every editor shortcut must behave the same with the Thai (Kedmanee) input
language active as with English (US). Today they silently fail.

## Current state

All editor shortcut matching reads `e.key`, which is the *character the active
layout produces*. With Thai active, Ctrl+Z gives `e.key === "ผ"`, Ctrl+Y `"ั"`,
Ctrl+D `"ก"`, Ctrl+C `"แ"`, `[` `"บ"`, `-` `"ข"`, Ctrl+0 `"จ"`, and
Ctrl+Shift+Z gives the ASCII `"("`. Affected sites:

| Site | Shortcuts |
|---|---|
| `src/hooks/useEditorShortcuts.ts` | undo/redo (Z, Shift+Z, Y), duplicate (D), new workspace (Shift+N), zoom (`=`/`+`/`-`/0/1), tool keys (V A R T B D H M S P C), K |
| `src/app/editor/page.tsx`, `src/app/paste/page.tsx` | ⌘/Ctrl+C copy flattened image |
| `src/components/editor/Toolbar.tsx` | `[` `]` stroke width, `-` `=` `+` size, C colour picker |
| `src/components/editor/OcrLayer.tsx` | ⌘/Ctrl+A select OCR text |
| `src/components/settings/SettingsView.tsx` | ⌘/Ctrl+F focus search |

Workspace Alt+1…9 already uses `e.code` and works. Named keys (`Escape`,
`Delete`, `ArrowLeft`, `Tab`, `Enter`) are layout-independent.

## Design

One helper, `shortcutKey(e)` in `src/lib/shortcutKey.ts`, returns the key a
shortcut should match on. Every site above calls it instead of reading `e.key`.

| Case | Result | Why |
|---|---|---|
| `e.key` is ASCII (US, AZERTY, Dvorak, named keys) | `e.key` unchanged | Latin layouts keep matching the printed letter, exactly as today. |
| `e.key` contains a non-ASCII char and `e.code` is `KeyA`–`KeyZ`, `Digit0`–`Digit9`, `Minus`, `Equal`, `BracketLeft`, `BracketRight` | the US character for that physical key (`a`–`z`, `0`–`9`, `-`, `=`, `[`, `]`) | Thai/Cyrillic/Greek etc. produce no Latin letter; the physical key is the only meaningful signal. |
| Ctrl/⌘ **and** Shift held, `e.code` is `KeyA`–`KeyZ`, `e.key` is ASCII but not a letter | the physical letter | Thai Shift+Z types `(`, so Ctrl+Shift+Z (redo) would otherwise still fail. On Latin layouts Ctrl+Shift+letter always yields a letter, so nothing changes there. |
| Alt held | `e.key` unchanged | macOS Option+letter produces symbols (`Ω`, `®`); mapping those to letters would make Option+R pick the Rect tool. Windows AltGr is Ctrl+Alt — likewise left alone. |
| no usable `e.code` (synthetic events) | `e.key` unchanged | |

The result keeps `e.key`'s case for ASCII (callers already lowercase or test
both cases); mapped results are lowercase.

## Edge cases

- **Typing in fields / canvas text editing:** unchanged — every site keeps its
  typing guard, which runs before key matching.
- **Crop mode:** unchanged — guards are per-action (duplicate no-ops, Esc etc.).
- **Desktop vs `/paste`:** both use the same hook, toolbar and copy handler
  pattern, so both are fixed.
- **Thai digit row:** Kedmanee Digit3 types `-` (ASCII), so Ctrl+3 under Thai
  zooms out — pre-existing, and remapping ASCII digit-row symbols would break
  AZERTY (whose `-` lives on Digit6). Left as is.
- **macOS:** WebKit already reports Latin `e.key` for ⌘+letter on many non-Latin
  layouts; the helper is a no-op then.

## Out of scope

Rust global hotkeys (OS-level, layout-independent), the settings hotkey
recorder (`eventToAccelerator` already prefers `e.code`), overlay/ring/HUD keys
(only named keys).

## Verification

- Unit: `shortcutKey` with Thai `key`/`code` pairs, Latin pass-through, Alt.
- jsdom: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+D and a tool key with Thai keys.
- L4: `e2e/visual/editor-thai-layout.spec.ts` dispatches `KeyboardEvent`s with
  Thai `key` + physical `code` (Playwright cannot switch layouts).
- Owner test on Windows with the Thai input language active (`Gate: owner-test`).
