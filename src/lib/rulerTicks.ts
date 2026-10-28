/** Round `approx` up to the next 1/2/5 × 10^n step. */
export function niceStep(approx: number): number {
  if (!isFinite(approx) || approx <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(approx)));
  const norm = approx / pow;
  let m = 1;
  if (norm > 5) m = 10;
  else if (norm > 2) m = 5;
  else if (norm > 1) m = 2;
  return m * pow;
}

export type RulerTicks = {
  /** Screen positions (px along the ruler) of the minor ticks. */
  minor: number[];
  /** Screen positions and labels of the major ticks. */
  major: { pos: number; label: number }[];
};

/**
 * Ticks for one ruler axis, in **canvas coordinates**: 0 is the top-left of
 * the whole exported canvas (backdrop padding and annotation overflow
 * included), which the editor places at scroll offset `pad`.
 */
export function rulerTicks({
  scroll,
  pad,
  scale,
  length,
}: {
  scroll: number;
  pad: number;
  scale: number;
  length: number;
}): RulerTicks {
  const step = niceStep(50 / scale);
  const minorStep = Math.max(1, step / 5);
  const start = (scroll - pad) / scale;
  const end = start + length / scale;
  const toScreen = (c: number) => Math.round(pad + c * scale - scroll) + 0.5;

  const minor: number[] = [];
  for (let c = Math.ceil(start / minorStep) * minorStep; c <= end; c += minorStep) {
    minor.push(toScreen(c));
  }
  const major: RulerTicks["major"] = [];
  for (let c = Math.ceil(start / step) * step; c <= end; c += step) {
    major.push({ pos: toScreen(c), label: Math.round(c) || 0 });
  }
  return { minor, major };
}
