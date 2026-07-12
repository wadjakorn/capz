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

/** Edge/center snap targets along one axis from an AABB. */
export function aabbSnapLinesX(b: AABB): number[] {
  return [b.x, b.x + b.w / 2, b.x + b.w];
}
export function aabbSnapLinesY(b: AABB): number[] {
  return [b.y, b.y + b.h / 2, b.y + b.h];
}
