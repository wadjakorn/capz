import type { Annotation, RectShapeKind } from "@/stores/editor";

/** The Shapes-tool shape an annotation is drawn as (CP-0102): a box reads as
 * its rendered shape (no `shape` draws a rectangle), a headless arrow is a
 * line, anything else is not a Shapes annotation. */
export function selectedShapeKind(a: Annotation): RectShapeKind | null {
  if (a.type === "rect") return a.shape === "ellipse" ? "ellipse" : "rect";
  if (a.type === "arrow" && a.heads === "none") return "line";
  return null;
}

/** Shape picker state for a selection (primary = last member). Rectangle and
 * circle convert into each other in place; a line is a 2-point segment, so it
 * cannot become a box or back — those options are disabled. Null when the
 * selection is empty, holds a non-Shapes annotation, or mixes lines and boxes. */
export function shapePickerForSelection(
  list: readonly Annotation[],
): { value: RectShapeKind; disabled: RectShapeKind[] } | null {
  const kinds = list.map(selectedShapeKind);
  if (!kinds.length || kinds.some((k) => k === null)) return null;
  const lines = kinds.filter((k) => k === "line").length;
  if (lines !== 0 && lines !== kinds.length) return null;
  return {
    value: kinds[kinds.length - 1] as RectShapeKind,
    disabled: lines ? ["rect", "ellipse"] : ["line"],
  };
}
