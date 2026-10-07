import { describe, it, expect } from "vitest";
import { nudgeDelta, NUDGE_STEP, NUDGE_STEP_LARGE } from "./nudge";

describe("nudgeDelta", () => {
  it("maps each arrow to a 1px step", () => {
    expect(nudgeDelta("ArrowLeft", false)).toEqual({ dx: -NUDGE_STEP, dy: 0 });
    expect(nudgeDelta("ArrowRight", false)).toEqual({ dx: NUDGE_STEP, dy: 0 });
    expect(nudgeDelta("ArrowUp", false)).toEqual({ dx: 0, dy: -NUDGE_STEP });
    expect(nudgeDelta("ArrowDown", false)).toEqual({ dx: 0, dy: NUDGE_STEP });
    expect(NUDGE_STEP).toBe(1);
  });

  it("uses a 10px step with Shift and accepts lowercased keys", () => {
    expect(NUDGE_STEP_LARGE).toBe(10);
    expect(nudgeDelta("arrowdown", true)).toEqual({ dx: 0, dy: 10 });
    expect(nudgeDelta("arrowleft", true)).toEqual({ dx: -10, dy: 0 });
  });

  it("returns null for non-arrow keys", () => {
    expect(nudgeDelta("a", false)).toBeNull();
    expect(nudgeDelta("Enter", true)).toBeNull();
    expect(nudgeDelta("", false)).toBeNull();
  });
});
