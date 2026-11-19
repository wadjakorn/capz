# CP-0106 Text outline + shadow — implementation plan

Spec: `docs/superpowers/specs/2026-11-19-cp0106-text-outline-shadow-design.md`

## Task 1 — data model + pure effect helpers (TDD)
- `src/stores/editor.ts`: add `outlineColor?`, `outlineWidth?`, `shadow?` to `TextAnnotation`.
- Test first in `src/lib/textLayout.test.ts`: `textEffects(a)` returns `{}` for a plain
  annotation; outline → `stroke`, `strokeWidth = 2×w`, `fillAfterStrokeEnabled`,
  `lineJoin: "round"`; width absent → 3; width clamped 1–8; shadow → preset scaled by fontSize.
- Test `textEffectsCss(a, scale)`: none → `{}`; outline → `WebkitTextStroke`,
  `paintOrder: "stroke fill"`; shadow → `textShadow` scaled by `scale`.
- Implement both in `src/lib/textLayout.ts`.

## Task 2 — render
- `EditorStage.tsx` `TextShape`: spread `textEffects(a)` onto `<Text>`.
- Editing textarea: spread `textEffectsCss(ta, scale)` into its style.

## Task 3 — panel + wiring
- `toolbar/panels/types.ts`: optional `effects?: TextEffectsCtx` on `TextStyleCtx`
  (`outlineColor`, `outlineWidth`, `shadow`, setters).
- `Toolbar.tsx` (selected text branch only): setters call `updateAnnotation` only;
  `lastOutlineColor` session state.
- `TextPanel.tsx`: Outline + Shadow sections when `tsc.effects` present.
- i18n keys en + th; glossary entry.

## Task 4 — tests
- Unit test for the TextPanel effects controls if a panel test harness exists; otherwise
  covered by L4.
- L4 `e2e/visual/editor-text-outline-shadow.spec.ts`: Thai text, toggle outline/shadow,
  snap, pixel-assert outline colour present and fill colour present.

## Task 5 — verify L1, L3, L4; tracker; PR.
