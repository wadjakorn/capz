/**
 * Splits the hero's clip-scrub scroll range across N clips, weighted by clip
 * duration with a floor so a short clip isn't skipped by a quick scroll.
 */

export type Segment = { a: number; b: number };

/** Default floor: each clip gets at least half of an equal share. */
export const minShareFor = (n: number) => (n > 0 ? 0.5 / n : 0);

export function heroSegments(durations: readonly number[], minShare = minShareFor(durations.length)): Segment[] {
  const n = durations.length;
  if (!n) return [];
  const d = durations.map((x) => (Number.isFinite(x) && x > 0 ? x : 1));
  // Water-fill: clips under the floor get exactly the floor; the rest share
  // what's left in proportion to duration (repeat until nothing new drops under).
  const floor = Math.min(Math.max(0, minShare), 1 / n);
  const fixed = new Array<boolean>(n).fill(false);
  let w = new Array<number>(n).fill(0);
  for (let pass = 0; pass < n; pass++) {
    const freeSum = d.reduce((acc, x, i) => (fixed[i] ? acc : acc + x), 0);
    const left = 1 - floor * fixed.filter(Boolean).length;
    w = d.map((x, i) => (fixed[i] ? floor : (x / freeSum) * left));
    const under = w.findIndex((x, i) => !fixed[i] && x < floor);
    if (under < 0) break;
    w.forEach((x, i) => { if (!fixed[i] && x < floor) fixed[i] = true; });
  }
  const ws = w.reduce((acc, x) => acc + x, 0);
  let a = 0;
  return w.map((x, i) => {
    const b = i === n - 1 ? 1 : a + x / ws;
    const seg = { a, b };
    a = b;
    return seg;
  });
}

/** Which segment progress `c` (0–1) falls in, and how far through it. */
export function locateSegment(segs: readonly Segment[], c: number): { index: number; local: number } {
  if (!segs.length) return { index: -1, local: 0 };
  const p = Math.min(1, Math.max(0, c));
  let index = segs.findIndex((s) => p < s.b);
  if (index < 0) index = segs.length - 1;
  const s = segs[index];
  const local = s.b > s.a ? Math.min(1, Math.max(0, (p - s.a) / (s.b - s.a))) : 0;
  return { index, local };
}
