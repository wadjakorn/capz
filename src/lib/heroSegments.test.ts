import { describe, expect, it } from "vitest";
import { heroSegments, locateSegment, minShareFor } from "./heroSegments";

describe("heroSegments", () => {
  it("covers 0..1 contiguously", () => {
    const s = heroSegments([2.7, 11, 4.3]);
    expect(s[0].a).toBe(0);
    expect(s[s.length - 1].b).toBe(1);
    for (let i = 1; i < s.length; i++) expect(s[i].a).toBe(s[i - 1].b);
  });
  it("weights by duration", () => {
    const [a, b] = heroSegments([2, 8], 0);
    expect(b.b - b.a).toBeCloseTo(0.8);
    expect(a.b - a.a).toBeCloseTo(0.2);
  });
  it("gives a short clip exactly the minimum share", () => {
    const s = heroSegments([0.5, 20, 20]);
    expect(s[0].b - s[0].a).toBeCloseTo(minShareFor(3));
    expect(s[1].b - s[1].a).toBeCloseTo(s[2].b - s[2].a);
  });
  it("handles one clip and bad durations", () => {
    expect(heroSegments([5])).toEqual([{ a: 0, b: 1 }]);
    expect(heroSegments([NaN, 0]).map((x) => x.b - x.a)).toEqual([0.5, 0.5]);
    expect(heroSegments([])).toEqual([]);
  });
});

describe("locateSegment", () => {
  const segs = heroSegments([1, 1, 2], 0);
  it("finds the segment and local progress", () => {
    expect(locateSegment(segs, 0)).toEqual({ index: 0, local: 0 });
    expect(locateSegment(segs, 0.125).index).toBe(0);
    expect(locateSegment(segs, 0.125).local).toBeCloseTo(0.5);
    expect(locateSegment(segs, 0.75).index).toBe(2);
    expect(locateSegment(segs, 1)).toEqual({ index: 2, local: 1 });
  });
  it("clamps out-of-range progress", () => {
    expect(locateSegment(segs, -3)).toEqual({ index: 0, local: 0 });
    expect(locateSegment(segs, 9).index).toBe(2);
  });
});
