import { describe, expect, it } from "vitest";
import {
  buildSnapLines,
  isSnapBypass,
  snapMove,
  snapPoint,
  snapResize,
  snapResizeTurned,
  type SnapLines,
  type SnapOpts,
} from "@/lib/snap";

// Scale 1: threshold 6, canvas bonus 2, tie 0.5 (all image px).
const O: SnapOpts = { threshold: 6, canvasBonus: 2, tieEps: 0.5 };

function lines(
  x: Array<[number, "canvas" | "element", number?, number?]>,
  y: Array<[number, "canvas" | "element", number?, number?]> = [],
): SnapLines {
  const mk = ([at, kind, lo = 0, hi = 1000]: [number, "canvas" | "element", number?, number?]) => ({
    at,
    kind,
    lo,
    hi,
  });
  return { x: x.map(mk), y: y.map(mk) };
}

describe("buildSnapLines", () => {
  it("marks canvas + image lines as canvas and element lines with their extent", () => {
    const l = buildSnapLines({
      canvas: { x: -20, y: -20, w: 240, h: 140 },
      image: { w: 200, h: 100 },
      others: [{ x: 50, y: 30, w: 10, h: 20 }],
      viewport: null,
    });
    const xs = l.x.map((s) => `${s.kind}:${s.at}`);
    expect(xs).toEqual(
      expect.arrayContaining([
        "canvas:-20",
        "canvas:100",
        "canvas:220",
        "canvas:0",
        "canvas:200",
        "element:50",
        "element:55",
        "element:60",
      ]),
    );
    // canvas centre (100) == image centre (100) collapses to one line
    expect(xs.filter((s) => s === "canvas:100")).toHaveLength(1);
    const el = l.x.find((s) => s.kind === "element" && s.at === 50)!;
    expect([el.lo, el.hi]).toEqual([30, 50]);
    const cv = l.y.find((s) => s.kind === "canvas" && s.at === 0)!;
    expect([cv.lo, cv.hi]).toEqual([-20, 220]);
  });

  it("drops elements outside the viewport but keeps canvas lines", () => {
    const l = buildSnapLines({
      canvas: { x: 0, y: 0, w: 2000, h: 2000 },
      image: { w: 2000, h: 2000 },
      others: [
        { x: 10, y: 10, w: 10, h: 10 },
        { x: 1500, y: 1500, w: 10, h: 10 },
      ],
      viewport: { x: 0, y: 0, w: 500, h: 500 },
    });
    const el = l.x.filter((s) => s.kind === "element").map((s) => s.at);
    expect(el).toEqual([10, 15, 20]);
    expect(l.x.some((s) => s.kind === "canvas" && s.at === 2000)).toBe(true);
  });
});

describe("snapMove", () => {
  const box = { x: 100, y: 0, w: 20, h: 20 }; // x edges 100 / 110 / 120

  it("canvas beats a slightly closer element (bonus)", () => {
    // canvas 5 px from the left edge, element 4 px from the right edge
    const r = snapMove(box, lines([[95, "canvas"], [124, "element"]]), O);
    expect(r.dx).toBe(-5);
    expect(r.guides.x.map((g) => g.kind)).toEqual(["canvas"]);
  });

  it("a much closer element still wins", () => {
    const r = snapMove(box, lines([[95, "canvas"], [121, "element"]]), O);
    expect(r.dx).toBe(1);
    expect(r.guides.x.map((g) => g.at)).toEqual([121]);
  });

  it("exact canvas/element tie snaps to the canvas and draws both guides", () => {
    const r = snapMove(box, lines([[104, "element"], [104, "canvas"]]), O);
    expect(r.dx).toBe(4);
    expect(r.guides.x.map((g) => g.kind).sort()).toEqual(["canvas", "element"]);
  });

  it("between tied elements, the one nearest on the other axis wins", () => {
    // both 3 px away (left edge → 97, right edge → 123); the far one sits at y 500+
    const r = snapMove(
      box,
      lines([
        [97, "element", 500, 600],
        [123, "element", 10, 30],
      ]),
      O,
    );
    expect(r.dx).toBe(3);
  });

  it("guide segments span the moved box and the target", () => {
    const r = snapMove(box, lines([[123, "element", 200, 260]]), O);
    expect(r.guides.x).toEqual([{ at: 123, kind: "element", from: 0, to: 260 }]);
  });

  it("returns no nudge and no guides out of range", () => {
    const r = snapMove(box, lines([[80, "canvas"]], [[50, "element"]]), O);
    expect(r).toEqual({ dx: 0, dy: 0, guides: { x: [], y: [] } });
  });
});

describe("snapResize", () => {
  const box = { x: 100, y: 100, w: 40, h: 40 };

  it("an edge anchor snaps only its own edge", () => {
    const r = snapResize(box, "middle-right", lines([[143, "element"], [98, "element"]]), O);
    expect(r?.box).toEqual({ x: 100, y: 100, w: 43, h: 40 });
    expect(r?.guides.x.map((g) => g.at)).toEqual([143]);
  });

  it("a free corner snaps both axes", () => {
    const r = snapResize(
      box,
      "top-left",
      lines([[97, "element"]], [[104, "element"]]),
      O,
    );
    expect(r?.box).toEqual({ x: 97, y: 104, w: 43, h: 36 });
  });

  it("a ratio-locked corner snaps the better axis and derives the other", () => {
    const wide = { x: 100, y: 100, w: 80, h: 40 }; // 2:1
    // right edge 180 → 184 (4 px); bottom 140 → 141 (1 px) wins
    const r = snapResize(
      wide,
      "bottom-right",
      lines([[184, "element"]], [[141, "element"]]),
      { ...O, keepRatio: true },
    );
    expect(r?.box).toEqual({ x: 100, y: 100, w: 82, h: 41 });
    expect(r?.guides.y.map((g) => g.at)).toEqual([141]);
  });

  it("a ratio-locked top-left corner keeps the bottom-right fixed", () => {
    const r = snapResize(box, "top-left", lines([[98, "element"]]), {
      ...O,
      keepRatio: true,
    });
    expect(r?.box).toEqual({ x: 98, y: 98, w: 42, h: 42 });
  });

  it("centered resize mirrors the nudge on the opposite edge", () => {
    const r = snapResize(box, "middle-right", lines([[143, "element"]]), {
      ...O,
      centered: true,
    });
    expect(r?.box).toEqual({ x: 97, y: 100, w: 46, h: 40 });
  });

  it("skips a nudge that would go below the minimum size", () => {
    const small = { x: 100, y: 100, w: 6, h: 40 };
    const r = snapResize(small, "middle-right", lines([[101, "element"]]), {
      ...O,
      minSize: 5,
    });
    expect(r).toBeNull();
  });

  it("returns null when nothing is in range", () => {
    expect(snapResize(box, "bottom-right", lines([[300, "canvas"]]), O)).toBeNull();
  });
});

describe("snapResizeTurned", () => {
  // 80×40 frame with its origin at (200,100); turned 90° it is drawn as the
  // 40×80 box x 160–200, y 100–180.
  const box = { x: 200, y: 100, w: 80, h: 40 };

  it("a quarter turn snaps the drawn edge the anchor now faces", () => {
    // local right edge is drawn as the bottom edge (180 → 183)
    const r = snapResizeTurned(box, 1, "middle-right", lines([], [[183, "element"]]), O);
    expect(r?.box).toEqual({ x: 200, y: 100, w: 83, h: 40 });
    expect(r?.guides.y.map((g) => g.at)).toEqual([183]);
  });

  it("moves the origin when the snapped edge carries it", () => {
    // local top edge is drawn as the right edge (200 → 203), origin rides on it
    const r = snapResizeTurned(box, 1, "top-center", lines([[203, "element"]]), O);
    expect(r?.box).toEqual({ x: 203, y: 100, w: 80, h: 43 });
  });

  it("a half turn mirrors the anchors", () => {
    // drawn x 120–200: the local left edge is the drawn right edge
    const r = snapResizeTurned(box, 2, "middle-left", lines([[197, "element"]]), O);
    expect(r?.box).toEqual({ x: 197, y: 100, w: 77, h: 40 });
  });

  it("no turn is plain snapResize", () => {
    const l = lines([[283, "element"]]);
    expect(snapResizeTurned(box, 0, "middle-right", l, O)).toEqual(
      snapResize(box, "middle-right", l, O),
    );
  });
});

describe("snapPoint", () => {
  it("snaps each axis of a point", () => {
    const r = snapPoint({ x: 48, y: 203 }, lines([[50, "canvas"]], [[200, "element"]]), O);
    expect(r.x).toBe(50);
    expect(r.y).toBe(200);
    expect(r.guides.x).toHaveLength(1);
    expect(r.guides.y).toHaveLength(1);
  });
});

describe("isSnapBypass", () => {
  const none = { altKey: false, metaKey: false, ctrlKey: false };
  it("alt", () => {
    expect(isSnapBypass({ ...none, altKey: true }, "alt", "mac")).toBe(true);
    expect(isSnapBypass({ ...none, metaKey: true }, "alt", "mac")).toBe(false);
  });
  it("mod = Cmd on macOS, Ctrl elsewhere", () => {
    expect(isSnapBypass({ ...none, metaKey: true }, "mod", "mac")).toBe(true);
    expect(isSnapBypass({ ...none, ctrlKey: true }, "mod", "mac")).toBe(false);
    expect(isSnapBypass({ ...none, ctrlKey: true }, "mod", "win")).toBe(true);
    expect(isSnapBypass({ ...none, altKey: true }, "mod", "win")).toBe(false);
  });
  it("none never bypasses", () => {
    expect(isSnapBypass({ altKey: true, metaKey: true, ctrlKey: true }, "none", "mac")).toBe(false);
  });
});
