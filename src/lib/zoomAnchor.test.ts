import { describe, it, expect } from "vitest";
import { anchoredScrollOffset } from "./zoomAnchor";

describe("anchoredScrollOffset", () => {
  it("is identity when the scale does not change and the rect has not moved", () => {
    expect(anchoredScrollOffset(120, 400, 50, 50, 2, 2)).toBe(120);
  });

  it("pins the anchor point when zooming in", () => {
    // Anchor 350px right of the container's left edge, at scale 2 → image x=175.
    // At scale 4 that point sits 700px right of the edge, so the content must
    // scroll 350px further right to keep it under the finger.
    expect(anchoredScrollOffset(0, 400, 50, 50, 2, 4)).toBe(350);
  });

  it("pins the anchor point when zooming out", () => {
    expect(anchoredScrollOffset(350, 400, 50, 50, 4, 2)).toBe(175);
  });

  it("accounts for the container rect moving during the reflow", () => {
    // Same zoom as the zoom-in case, but the rect shifted 20px left afterwards.
    expect(anchoredScrollOffset(0, 400, 50, 30, 2, 4)).toBe(330);
  });

  it("is inert when the old scale is zero (the fit sentinel)", () => {
    expect(anchoredScrollOffset(120, 400, 50, 90, 0, 4)).toBe(120);
  });
});
