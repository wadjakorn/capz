import type { Annotation } from "@/stores/editor";
import { DEFAULT_TEXT_LINE_HEIGHT } from "@/lib/config";

export type AABB = { x: number; y: number; w: number; h: number };

/**
 * Axis-aligned bounding box for an annotation in image-pixel coords.
 * Rotation is ignored — snapping measures a rotated element's rendered node
 * instead (`rotatedSnapBox` in EditorStage).
 */
export function annotationAABB(a: Annotation): AABB | null {
  switch (a.type) {
    case "rect":
    case "blur":
    case "image":
      return { x: a.x, y: a.y, w: a.w, h: a.h };
    case "arrow": {
      // Include the optional mid curve-control point so the bend is covered.
      const xs = [a.x1, a.x2];
      const ys = [a.y1, a.y2];
      if (a.cx !== undefined && a.cy !== undefined) {
        xs.push(a.cx);
        ys.push(a.cy);
      }
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        x: minX,
        y: minY,
        w: Math.max(...xs) - minX,
        h: Math.max(...ys) - minY,
      };
    }
    case "text": {
      // Approximate: width = chars × fontSize × 0.6, height = lines × line-box.
      // Line box tracks the annotation's lineHeight (default ~1.35) so snap
      // guides stay aligned with the taller multi-line rendering.
      const lines = a.text.split("\n");
      const maxLen = lines.reduce((m, l) => Math.max(m, l.length), 1);
      const lineBox = a.fontSize * (a.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT);
      return {
        x: a.x,
        y: a.y,
        w: maxLen * a.fontSize * 0.6,
        h: lines.length * lineBox,
      };
    }
    case "pen":
    case "highlighter": {
      const pts = a.points;
      if (pts.length < 4) return null; // need ≥ 2 points for any extent
      let minX = pts[0];
      let minY = pts[1];
      let maxX = pts[0];
      let maxY = pts[1];
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case "magnify": {
      // Cover both the source (magnify) area and the output loupe + connector.
      const outW = a.srw * a.zoom;
      const outH = a.srh * a.zoom;
      const minX = Math.min(a.x - outW, a.sx - a.srw);
      const minY = Math.min(a.y - outH, a.sy - a.srh);
      const maxX = Math.max(a.x + outW, a.sx + a.srw);
      const maxY = Math.max(a.y + outH, a.sy + a.srh);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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

/** Breathing room (image px) added beyond an overflowing element on the side it
 *  crosses, so the element never touches the expanded boundary. */
export const OVERFLOW_GAP = 32;

/**
 * Canvas box for the image plus any elements that overflow its edges, in
 * image-pixel coords.
 *
 * `boxes` are the elements' real rendered bounds (from `node.getClientRect`),
 * so the padding is pixel-accurate for every element type — no per-type
 * estimate to bias one side. Each side is handled INDEPENDENTLY and
 * identically: a side an element crosses grows to the element's edge plus
 * OVERFLOW_GAP; a side nothing crosses stays flush with the image. So the same
 * element crossing by the same amount yields the same padding on any edge
 * (top/left behave exactly like bottom/right), and a non-overflowing image is
 * returned byte-for-byte unchanged. Bounds round outward to whole pixels so no
 * fractional edge clips.
 */
export function contentBounds(
  imgW: number,
  imgH: number,
  boxes: AABB[],
): AABB {
  let minX = 0;
  let minY = 0;
  let maxX = imgW;
  let maxY = imgH;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  const left = minX < 0 ? minX - OVERFLOW_GAP : 0;
  const top = minY < 0 ? minY - OVERFLOW_GAP : 0;
  const right = maxX > imgW ? maxX + OVERFLOW_GAP : imgW;
  const bottom = maxY > imgH ? maxY + OVERFLOW_GAP : imgH;
  const x = Math.floor(left);
  const y = Math.floor(top);
  return { x, y, w: Math.ceil(right) - x, h: Math.ceil(bottom) - y };
}

/** Smallest AABB covering every box, or null for none (group snap, CP-0050). */
export function unionAABB(boxes: readonly AABB[]): AABB | null {
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Ids of the annotations whose AABB lies fully inside `rect` (marquee
 * selection, CP-0050). `rect` may have a negative w/h (dragged up or left).
 * `boxOf` measures each annotation; the stage passes its drawn box so rotated
 * elements are judged by what is on screen.
 */
export function annotationsInRect(
  list: readonly Annotation[],
  rect: AABB,
  boxOf: (a: Annotation) => AABB | null = annotationAABB,
): string[] {
  const x0 = Math.min(rect.x, rect.x + rect.w);
  const y0 = Math.min(rect.y, rect.y + rect.h);
  const x1 = Math.max(rect.x, rect.x + rect.w);
  const y1 = Math.max(rect.y, rect.y + rect.h);
  return list
    .filter((a) => {
      const b = boxOf(a);
      return !!b && b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1;
    })
    .map((a) => a.id);
}
