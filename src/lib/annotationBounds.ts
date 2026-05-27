import type { Annotation } from "@/stores/editor";

export type AABB = { x: number; y: number; w: number; h: number };

/**
 * Axis-aligned bounding box for an annotation in image-pixel coords.
 * Rotation is ignored — snap uses the un-rotated AABB for simplicity.
 */
export function annotationAABB(a: Annotation): AABB | null {
  switch (a.type) {
    case "rect":
    case "blur":
      return { x: a.x, y: a.y, w: a.w, h: a.h };
    case "arrow":
      return {
        x: Math.min(a.x1, a.x2),
        y: Math.min(a.y1, a.y2),
        w: Math.abs(a.x2 - a.x1),
        h: Math.abs(a.y2 - a.y1),
      };
    case "text": {
      // Approximate: width = chars × fontSize × 0.6, height = fontSize × 1.2.
      const lines = a.text.split("\n");
      const maxLen = lines.reduce((m, l) => Math.max(m, l.length), 1);
      return {
        x: a.x,
        y: a.y,
        w: maxLen * a.fontSize * 0.6,
        h: lines.length * a.fontSize * 1.2,
      };
    }
    case "sticker": {
      const s = a.fontSize;
      return { x: a.x, y: a.y, w: s, h: s * 1.2 };
    }
    case "pin": {
      const s = a.size;
      return { x: a.x - s / 2, y: a.y - s / 2, w: s, h: s };
    }
  }
}

/** Edge/center snap targets along one axis from an AABB. */
export function aabbSnapLinesX(b: AABB): number[] {
  return [b.x, b.x + b.w / 2, b.x + b.w];
}
export function aabbSnapLinesY(b: AABB): number[] {
  return [b.y, b.y + b.h / 2, b.y + b.h];
}
