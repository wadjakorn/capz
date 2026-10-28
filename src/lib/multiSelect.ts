import type { Annotation } from "@/stores/editor";

/** Which style panel an annotation uses. A headless line is drawn by the
 *  Shapes tool and has different controls from an arrow. */
function styleKind(a: Annotation): string {
  if (a.type === "arrow") return a.heads === "none" ? "line" : "arrow";
  return a.type;
}

/**
 * The style kind every annotation in `list` shares, or null when they differ
 * (or the list is empty). A multi-selection can be restyled only when this is
 * non-null (CP-0050).
 */
export function sharedStyleKind(list: readonly Annotation[]): string | null {
  if (!list.length) return null;
  const k = styleKind(list[0]);
  return list.every((a) => styleKind(a) === k) ? k : null;
}
