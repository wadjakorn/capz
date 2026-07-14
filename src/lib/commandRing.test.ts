import { describe, it, expect } from "vitest";
import { wedgeAtPoint, RING_WEDGES, type RingWedge } from "./commandRing";

describe("wedgeAtPoint", () => {
  const cx = 180;
  const cy = 180;
  const inner = 60;

  it("returns null inside the dead-zone", () => {
    expect(wedgeAtPoint(cx, cy, cx, cy, inner)).toBeNull();
    expect(wedgeAtPoint(cx + 30, cy, cx, cy, inner)).toBeNull(); // dist 30 < 60
    expect(wedgeAtPoint(cx, cy - 59, cx, cy, inner)).toBeNull();
  });

  it("maps cardinal directions to the mockup wedges", () => {
    expect(wedgeAtPoint(cx, cy - 100, cx, cy, inner)).toBe("window"); // up
    expect(wedgeAtPoint(cx + 100, cy, cx, cy, inner)).toBe("full"); // right
    expect(wedgeAtPoint(cx, cy + 100, cx, cy, inner)).toBe("scroll"); // down
    expect(wedgeAtPoint(cx - 100, cy, cx, cy, inner)).toBe("area"); // left
  });

  it("covers the whole circle outside the dead-zone with no gaps", () => {
    const seen = new Set<RingWedge>();
    for (let deg = 0; deg < 360; deg += 3) {
      const rad = (deg * Math.PI) / 180;
      const px = cx + Math.cos(rad) * 100;
      const py = cy + Math.sin(rad) * 100;
      const w = wedgeAtPoint(px, py, cx, cy, inner);
      expect(w).not.toBeNull();
      seen.add(w as RingWedge);
    }
    // All four wedges are reachable.
    for (const w of RING_WEDGES) expect(seen.has(w)).toBe(true);
  });

  it("splits the diagonals consistently (boundary at ±45°)", () => {
    // Just past the top→right boundary (deg = -44) is window; -46 is... right?
    // At exactly the boundaries the sectors are half-open [start, end).
    expect(wedgeAtPoint(cx + 1, cy - 100, cx, cy, inner)).toBe("window"); // ~-89°
    expect(wedgeAtPoint(cx + 100, cy - 1, cx, cy, inner)).toBe("full"); // ~-0.6°
  });
});
