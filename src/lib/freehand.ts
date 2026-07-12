import type { FreehandMode } from "@/stores/editor";

/**
 * Ramer–Douglas–Peucker simplification on a flat [x0,y0,x1,y1,…] point array.
 * Drops points that lie within `epsilon` (image px) of the line between the
 * kept neighbours. Returns a new flat array; inputs with < 3 points are copied
 * through unchanged.
 */
export function rdpSimplify(pts: number[], epsilon: number): number[] {
  const n = Math.floor(pts.length / 2);
  if (n < 3 || epsilon <= 0) return pts.slice();

  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;

  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    if (last - first < 2) continue;
    const ax = pts[first * 2];
    const ay = pts[first * 2 + 1];
    const bx = pts[last * 2];
    const by = pts[last * 2 + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = first + 1; i < last; i++) {
      const px = pts[i * 2];
      const py = pts[i * 2 + 1];
      // Perpendicular distance from point to segment a→b.
      const dist = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      keep[maxIdx] = true;
      stack.push([first, maxIdx], [maxIdx, last]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  }
  return out;
}

/**
 * Turn a captured freehand path into render points + a Konva `tension` for the
 * chosen mode:
 * - `raw`     — as-drawn, no tension.
 * - `polygon` — heavily simplified straight segments, no tension.
 * - `curve`   — lightly simplified with tension for a smooth spline.
 */
export function smoothPoints(
  points: number[],
  mode: FreehandMode,
): { points: number[]; tension: number } {
  switch (mode) {
    case "polygon":
      return { points: rdpSimplify(points, 8), tension: 0 };
    case "curve":
      return { points: rdpSimplify(points, 2), tension: 0.5 };
    case "raw":
    default:
      return { points: rdpSimplify(points, 0.75), tension: 0 };
  }
}
