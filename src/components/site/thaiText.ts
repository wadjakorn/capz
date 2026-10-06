/** U+200B ZERO WIDTH SPACE: marks an allowed line break inside unspaced Thai. */
export const BREAK = "​";

export type Unit = { text: string; space: boolean };

/**
 * Splits a heading into units that must never break inside: lines may break
 * only at spaces and at explicit U+200B markers placed in the locale strings.
 * `space` says whether the unit is followed by a visible space.
 */
export function splitUnits(s: string): Unit[] {
  const out: Unit[] = [];
  const re = /([^\s​]+)([\s​]*)/g;
  for (const m of s.matchAll(re)) {
    out.push({ text: m[1], space: /\s/.test(m[2]) });
  }
  if (out.length) out[out.length - 1].space = false;
  return out;
}
