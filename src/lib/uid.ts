// Stable unique-id generator for annotations / layers.
//
// `crypto.randomUUID()` only exists in a **secure context** (HTTPS or
// localhost). The web build served over plain HTTP on a LAN/Tailscale IP has a
// `crypto` object but no `randomUUID`, so calling it throws
// "crypto.randomUUID is not a function". Fall back to `getRandomValues` (a
// hand-assembled UUIDv4), and finally to `Math.random` if even that is missing,
// so id creation never throws regardless of context.

function fromGetRandomValues(): string | null {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") return null;
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  // RFC 4122 v4: set version (4) and variant (10xx) bits.
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

function fromMathRandom(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** A RFC-4122-shaped unique id that works in any browser context. */
export function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return fromGetRandomValues() ?? fromMathRandom();
}
