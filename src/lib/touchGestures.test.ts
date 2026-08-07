import { describe, it, expect } from "vitest";
import {
  initialGestureState,
  stepGesture,
  type Contact,
  type GestureState,
} from "./touchGestures";

// Feed a sequence of contact snapshots, return every result in order.
function run(frames: Contact[][]) {
  let state: GestureState = initialGestureState();
  return frames.map((contacts) => {
    const out = stepGesture(state, contacts);
    state = out.state;
    return out.result;
  });
}

const c = (id: number, x: number, y: number): Contact => ({ id, x, y });

describe("stepGesture", () => {
  it("reports idle with no contacts", () => {
    expect(run([[]])).toEqual([{ kind: "idle" }]);
  });

  it("reports single for one contact and does not latch", () => {
    const out = run([[c(1, 10, 10)], [c(1, 40, 60)]]);
    expect(out).toEqual([{ kind: "single" }, { kind: "single" }]);
  });

  it("emits exactly one cancel when a second contact arrives", () => {
    const out = run([
      [c(1, 0, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
    ]);
    expect(out[0]).toEqual({ kind: "single" });
    expect(out[1]).toEqual({ kind: "cancel" });
    expect(out[2].kind).toBe("gesture");
  });

  it("reports zoomFactor > 1 when the contacts spread apart", () => {
    const out = run([
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 200, 0)],
    ]);
    const last = out[2];
    if (last.kind !== "gesture") throw new Error("expected a gesture");
    expect(last.zoomFactor).toBeCloseTo(2);
    expect(last.panDx).toBeCloseTo(50); // midpoint moved 50 to the right
  });

  it("reports zoomFactor < 1 when the contacts come together", () => {
    const out = run([
      [c(1, 0, 0), c(2, 200, 0)],
      [c(1, 0, 0), c(2, 200, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
    ]);
    const last = out[2];
    if (last.kind !== "gesture") throw new Error("expected a gesture");
    expect(last.zoomFactor).toBeCloseTo(0.5);
  });

  it("reports pure pan with zoomFactor 1 when both contacts translate together", () => {
    const out = run([
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 30, 20), c(2, 130, 20)],
    ]);
    const last = out[2];
    if (last.kind !== "gesture") throw new Error("expected a gesture");
    expect(last.zoomFactor).toBeCloseTo(1);
    expect(last.panDx).toBeCloseTo(30);
    expect(last.panDy).toBeCloseTo(20);
  });

  it("ignores a third contact — no zoom jump when it lands or lifts", () => {
    const out = run([
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0), c(3, 500, 500)],
      [c(1, 0, 0), c(2, 100, 0)],
    ]);
    for (const r of out.slice(2)) {
      if (r.kind !== "gesture") throw new Error("expected a gesture");
      expect(r.zoomFactor).toBeCloseTo(1);
      expect(r.panDx).toBeCloseTo(0);
    }
  });

  it("re-anchors instead of jumping when a tracked contact lifts and two remain", () => {
    const out = run([
      [c(1, 0, 0), c(2, 100, 0)],
      [c(1, 0, 0), c(2, 100, 0), c(3, 400, 0)],
      [c(2, 100, 0), c(3, 400, 0)], // contact 1 lifted; now tracking 2 and 3
    ]);
    const last = out[2];
    if (last.kind !== "gesture") throw new Error("expected a gesture");
    expect(last.zoomFactor).toBeCloseTo(1);
    expect(last.panDx).toBeCloseTo(0);
  });

  it("returns to idle when every contact lifts", () => {
    const out = run([[c(1, 0, 0), c(2, 100, 0)], []]);
    expect(out[1]).toEqual({ kind: "idle" });
  });
});
