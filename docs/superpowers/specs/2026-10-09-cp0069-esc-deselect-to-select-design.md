# CP-0069 — Esc with a selection deselects and returns to Select in one press

Source: capz-inbox#17 · Ticket: CP-0069

## Goal

With an element selected on a sticky drawing tool, one Esc should both
deselect and switch back to the Select tool. Today (since CP-0052 "keep tool
active") the first Esc only deselects and keeps the tool; a second Esc is
needed to reach Select.

## Behaviour

Esc ladder in `src/hooks/useEditorShortcuts.ts`:

| State | Esc does | Before |
|---|---|---|
| Crop mode | cancel crop → Select | same |
| Selection, any tool other than Select | deselect **and** → Select | sticky tools: deselect only |
| Selection, Select tool | deselect | same |
| No selection, sticky tool | → Select | same |
| No selection, Select (desktop) | arm hide-window toast; second Esc hides | same |
| No selection, Select (`/paste`) | nothing | same |

So with a sticky tool and a selection: Esc #1 deselects + Select, Esc #2 arms
the hide toast, Esc #3 hides (desktop). One press shorter than before.

## Decided defaults

- Applies to every tool regardless of its `keepToolActive` flag (owner-approved
  proposal; the issue asks for exactly this).
- Clicking empty canvas is **unchanged** (owner note, 2026-10-09): with a
  sticky tool it still deselects / starts the next element per the
  keep-active setting, and never switches to Select. Only the keyboard Esc
  path changes.
- No new strings, settings, or schema bump.

## Edge cases

- Typing in a field / editing canvas text: the hook's existing typing guard
  runs first, so Esc there keeps its current handling (the inline text editor
  owns Esc).
- Crop mode: handled before the selection branch — unchanged.
- Dialogs / History preview / overlays that own Esc keep owning it.
- Desktop vs `/paste`: shared hook; web has no hide-window step.

## Out of scope

- Making Esc configurable.
- Changing the double-Esc hide-window timing.
- Any change to mouse behaviour on empty canvas.
