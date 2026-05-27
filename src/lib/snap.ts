/**
 * 1D snap: pick the smallest delta needed to align one of the moving rect's
 * candidate edges (min/mid/max) with any target value, provided it's within
 * `thresholdImg` (image-pixel coords). Returns the snap delta to apply to the
 * moving rect's `min`, plus the target value to draw a guide line at.
 */
export type SnapHit = { delta: number; guide: number };

export function snapAxis(
  movingMin: number,
  movingSize: number,
  targets: number[],
  thresholdImg: number,
): SnapHit | null {
  if (!targets.length || thresholdImg <= 0) return null;
  const movingEdges = [
    movingMin,
    movingMin + movingSize / 2,
    movingMin + movingSize,
  ];
  let best: SnapHit | null = null;
  let bestAbs = thresholdImg;
  for (const t of targets) {
    for (const e of movingEdges) {
      const d = t - e;
      const ad = Math.abs(d);
      if (ad <= bestAbs) {
        bestAbs = ad;
        best = { delta: d, guide: t };
      }
    }
  }
  return best;
}

/** Collect unique snap target lines along one axis. */
export function collectTargets(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    const k = Math.round(v * 100) / 100;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}
