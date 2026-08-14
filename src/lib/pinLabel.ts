export type PinLabelStyle = "numeric" | "alpha";

/** Bijective base-26: 1→A … 26→Z, 27→AA. Non-positive / non-integer /
 * non-finite input falls back to the plain number — a pin must always render
 * something, and defaultStartNumber may legitimately be 0. */
export function formatPinLabel(n: number, style: PinLabelStyle = "numeric"): string {
  if (style !== "alpha") return String(n);
  if (!Number.isInteger(n) || n <= 0) return String(n);
  let out = "";
  let v = n;
  while (v > 0) {
    const rem = (v - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    v = Math.floor((v - 1) / 26);
  }
  return out;
}
