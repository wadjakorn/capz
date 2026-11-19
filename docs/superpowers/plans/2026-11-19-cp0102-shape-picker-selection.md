# CP-0102 plan — shape picker while selected

Spec: `docs/superpowers/specs/2026-11-19-cp0102-shape-picker-selection-design.md`

1. **Pure helper** `src/lib/shapePicker.ts` (+ `shapePicker.test.ts`): `selectedShapeKind(a)`
   → `"rect" | "ellipse" | "line" | null`; `shapePickerForSelection(list)` →
   `{ value, disabled[] } | null` (null if any member is not a Shapes annotation or lines and
   boxes are mixed). Test first.
2. **Kit**: `ToggleIconButton` gets `disabled?` (aria-disabled, faded, click ignored);
   `IconSegmented` options get `disabled?`. Covered via ShapesPanel tests.
3. **ShapesPanel**: `RectShapeCtx` gains `disabled?: RectShapeKind[]`; disabled options use
   the "can't convert" tooltip. Update the doc comment. Tests: disabled line for a box,
   disabled rect/circle for a line, click on disabled ignored; replace the old "selected
   hides picker" assertion.
4. **i18n**: `editor.panel.cantBoxToLine`, `editor.panel.cantLineToBox` in en + th.
5. **Toolbar**: build `rectShapeCtx` for a selected rect/ellipse (updateAnnotation +
   persist) and for a selected line (no-op); fix `curShape` to the rendered shape; replace the
   "add-only" comment.
6. **L4 visual** `e2e/visual/editor-shape-switch.spec.ts`: draw a rect, select it, click
   Circle → ellipse on stage, undo → rect.
7. Verify L1, L3, L4; tracker entry in PROGRESS-FEATURE.md; PR.
