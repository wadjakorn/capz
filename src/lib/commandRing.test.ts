import { describe, it, expect } from "vitest";
import {
  wedgeAtPoint,
  slotAtPoint,
  ringSlotAngleDeg,
  usableRingModes,
  RING_WEDGES,
  RING_MODE_IDS,
  RING_LABELS,
  RING_MODE_LABELS,
  RING_MAX_MODES,
  RING_MIN_MODES,
  RING_CANCEL,
  holdRingSlots,
  type RingWedge,
} from "./commandRing";

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

describe("slotAtPoint (v2, 1-4 configurable slots)", () => {
  const cx = 180;
  const cy = 180;
  const inner = 60;
  const at = (deg: number, n: number) => {
    const rad = (deg * Math.PI) / 180;
    return slotAtPoint(cx + Math.cos(rad) * 100, cy + Math.sin(rad) * 100, cx, cy, inner, n);
  };

  it("puts slot 0 at the top for any slot count", () => {
    for (let n = 1; n <= RING_MAX_MODES; n++) {
      expect(at(-90, n)).toBe(0);
    }
  });

  it("a single slot owns the entire circle", () => {
    for (let deg = 0; deg < 360; deg += 7) expect(at(deg, 1)).toBe(0);
  });

  it("runs clockwise from the top", () => {
    // 2 slots: top half is 0, bottom half is 1.
    expect(at(-90, 2)).toBe(0);
    expect(at(90, 2)).toBe(1);
    // 3 slots: 120° each, centered at -90, 30, 150.
    expect(at(-90, 3)).toBe(0);
    expect(at(30, 3)).toBe(1);
    expect(at(150, 3)).toBe(2);
  });

  it("covers the circle with no gaps and no out-of-range slots", () => {
    for (let n = 1; n <= RING_MAX_MODES; n++) {
      const seen = new Set<number>();
      for (let deg = 0; deg < 360; deg += 1) {
        const s = at(deg, n);
        expect(s).not.toBeNull();
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(n);
        seen.add(s as number);
      }
      expect(seen.size).toBe(n);
    }
  });

  it("still returns null inside the dead-zone", () => {
    expect(slotAtPoint(cx, cy, cx, cy, inner, 3)).toBeNull();
  });

  /// The v1 four-wedge layout must survive verbatim: v1 and v2 share this
  /// renderer, and a drift here would silently move v1's click targets.
  it("reproduces the v1 layout at n=4", () => {
    for (let deg = 0; deg < 360; deg += 1) {
      const rad = (deg * Math.PI) / 180;
      const px = cx + Math.cos(rad) * 100;
      const py = cy + Math.sin(rad) * 100;
      const slot = slotAtPoint(px, py, cx, cy, inner, RING_WEDGES.length);
      expect(RING_WEDGES[slot as number]).toBe(wedgeAtPoint(px, py, cx, cy, inner));
    }
  });

  it("slot angles match the hit-test centers", () => {
    for (let n = 1; n <= RING_MAX_MODES; n++) {
      for (let i = 0; i < n; i++) expect(at(ringSlotAngleDeg(i, n), n)).toBe(i);
    }
  });
});

describe("ring mode metadata", () => {
  it("labels every mode that can occupy a slot", () => {
    for (const m of RING_MODE_IDS) {
      expect(RING_LABELS[m]).toBeTruthy();
      expect(RING_MODE_LABELS[m]).toBeTruthy();
    }
  });

  it("offers at least as many modes as the ring has slots", () => {
    expect(RING_MODE_IDS.length).toBeGreaterThanOrEqual(RING_MAX_MODES);
  });

  it("drops macOS-only modes off macOS but keeps them on macOS", () => {
    const modes: RingWedge[] = ["full", "systemArea", "area"];
    expect(usableRingModes(modes, true)).toEqual(modes);
    expect(usableRingModes(modes, false)).toEqual(["full", "area"]);
  });
});

describe("holdRingSlots (cancel slot)", () => {
  it("appends cancel after the configured modes", () => {
    expect(holdRingSlots(["full", "area"])).toEqual(["full", "area", RING_CANCEL]);
  });

  // Cancel is what makes a hold gesture escapable without a global Escape, so
  // it must survive every legal slot count — including a one-mode ring.
  it("is present for every legal mode count", () => {
    for (let n = RING_MIN_MODES; n <= RING_MAX_MODES; n++) {
      const slots = holdRingSlots(RING_MODE_IDS.slice(0, n));
      expect(slots).toHaveLength(n + 1);
      expect(slots[slots.length - 1]).toBe(RING_CANCEL);
    }
  });

  it("is never one of the configurable capture modes", () => {
    expect(RING_MODE_IDS).not.toContain(RING_CANCEL);
  });

  it("is labelled", () => {
    expect(RING_LABELS[RING_CANCEL]).toBeTruthy();
  });

  // The full ring is 4 modes + cancel = 5 slots; the geometry must still
  // partition the circle cleanly at that count.
  it("keeps the ring hit-testable at max modes plus cancel", () => {
    const n = holdRingSlots(RING_MODE_IDS.slice(0, RING_MAX_MODES)).length;
    expect(n).toBe(5);
    const seen = new Set<number>();
    for (let deg = 0; deg < 360; deg += 1) {
      const rad = (deg * Math.PI) / 180;
      const s = slotAtPoint(180 + Math.cos(rad) * 100, 180 + Math.sin(rad) * 100, 180, 180, 60, n);
      expect(s).not.toBeNull();
      seen.add(s as number);
    }
    expect(seen.size).toBe(n);
  });
});

// Codex review: on Windows a config synced from a Mac lists `systemArea`, which
// has no checkbox there. Counting it toward the 1-4 limits showed fewer ticks
// than the slot count claimed and blocked a fourth visible mode with no way to
// free the slot — the hidden entry cannot be unchecked. These pin the split
// between "configured" and "actually selectable here".
describe("ring slot counting with platform-hidden modes", () => {
  const available = (isMac: boolean) => RING_MODE_IDS.filter((m) => usableRingModes([m], isMac).length > 0);
  const split = (selected: readonly RingWedge[], isMac: boolean) => {
    const avail = available(isMac);
    return {
      visible: selected.filter((m) => avail.includes(m)),
      hidden: selected.filter((m) => !avail.includes(m)),
    };
  };

  it("excludes a macOS-only mode from the visible count on Windows", () => {
    const { visible, hidden } = split(["window", "full", "scroll", "systemArea"], false);
    expect(visible).toEqual(["window", "full", "scroll"]);
    expect(hidden).toEqual(["systemArea"]);
    // 3 visible, so a fourth is still addable — the bug made this read as 4.
    expect(visible.length).toBeLessThan(RING_MAX_MODES);
  });

  it("counts every mode on macOS, where none are hidden", () => {
    const { visible, hidden } = split(["window", "full", "scroll", "systemArea"], true);
    expect(visible).toHaveLength(4);
    expect(hidden).toHaveLength(0);
  });

  it("keeps a hidden mode only while it fits alongside the visible choices", () => {
    const { visible, hidden } = split(["window", "full", "scroll", "systemArea"], false);
    const nextVisible = [...visible, "area" as RingWedge]; // user adds a 4th
    const keptHidden = hidden.slice(0, RING_MAX_MODES - nextVisible.length);
    // Ring is full with visible modes, so the invisible one yields.
    expect(keptHidden).toEqual([]);
    expect([...nextVisible, ...keptHidden]).toHaveLength(RING_MAX_MODES);
  });

  it("preserves the hidden mode when there is room", () => {
    const { visible, hidden } = split(["window", "systemArea"], false);
    const keptHidden = hidden.slice(0, RING_MAX_MODES - visible.length);
    expect(keptHidden).toEqual(["systemArea"]);
  });
});
