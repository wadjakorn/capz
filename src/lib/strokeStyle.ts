import type { Annotation, ArrowAnnotation, RectAnnotation, StrokeStyle } from "@/stores/editor";

/** Konva stroke props for a stroke style. Spread onto the shape node. */
export type StrokeDashProps = { dash?: number[]; lineCap?: "round"; lineJoin?: "round" };

/**
 * Dash pattern for `style` at `strokeWidth` (sw). Solid returns nothing so
 * existing shapes keep their caps and mitered corners. Dashed is the look
 * dashed lines/arrows already had ([2sw, 2sw] with round caps). Dotted is a
 * near-zero dash with round caps — a dot of diameter sw — at a 2sw pitch, with
 * at least 3px clear so thin dots don't read as a solid line when zoomed out.
 * 0.001 rather than 0: zero-length dash segments aren't reliably capped.
 */
export function strokeDashProps(style: StrokeStyle | undefined, strokeWidth: number): StrokeDashProps {
  if (style === "dashed") {
    return { dash: [strokeWidth * 2, strokeWidth * 2], lineCap: "round", lineJoin: "round" };
  }
  if (style === "dotted") {
    return {
      dash: [0.001, Math.max(strokeWidth * 2, strokeWidth + 3)],
      lineCap: "round",
      lineJoin: "round",
    };
  }
  return {};
}

/** An arrow/line's style: `strokeStyle` when set, else the legacy `dash` flag. */
export function arrowStrokeStyle(a: Pick<ArrowAnnotation, "strokeStyle" | "dash">): StrokeStyle {
  return a.strokeStyle ?? (a.dash ? "dashed" : "solid");
}

/** True for annotations the Shapes tool draws: rect/ellipse, and the headless
 *  line (an arrow with heads "none"). */
export function isShapesToolAnnotation(
  a: Annotation | null,
): a is RectAnnotation | (ArrowAnnotation & { heads: "none" }) {
  if (!a) return false;
  return a.type === "rect" || (a.type === "arrow" && a.heads === "none");
}
