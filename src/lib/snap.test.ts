import { describe, expect, it } from "vitest";
import { snapResizedBox, snapValue } from "@/lib/snap";

describe("snapValue", () => {
  it("snaps to the closest target within threshold", () => {
    expect(snapValue(96, [0, 100, 200], 6)).toEqual({ delta: 4, guide: 100 });
  });

  it("returns null when nothing is in range", () => {
    expect(snapValue(96, [0, 100, 200], 3)).toBeNull();
  });
});

describe("snapResizedBox", () => {
  it("snaps the edge that moved on the x axis", () => {
    const hit = snapResizedBox(
      { x: 100, y: 100, w: 40, h: 40 },
      { x: 100, y: 100, w: 58, h: 40 },
      [0, 160, 200],
      [],
      6,
    );
    expect(hit?.box).toEqual({ x: 100, y: 100, w: 60, h: 40 });
    expect(hit?.guides.x).toEqual([160]);
  });

  it("snaps the edge that moved on the y axis", () => {
    const hit = snapResizedBox(
      { x: 100, y: 100, w: 40, h: 40 },
      { x: 100, y: 86, w: 40, h: 54 },
      [],
      [80, 140, 200],
      6,
    );
    expect(hit?.box).toEqual({ x: 100, y: 80, w: 40, h: 60 });
    expect(hit?.guides.y).toEqual([80]);
  });
});
