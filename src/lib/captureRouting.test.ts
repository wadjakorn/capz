import { describe, expect, it } from "vitest";
import { routeIncomingCapture } from "./captureRouting";

describe("routeIncomingCapture", () => {
  it("routes a null path to clear regardless of canvas state", () => {
    expect(routeIncomingCapture(null, false)).toBe("clear");
    expect(routeIncomingCapture(null, true)).toBe("clear");
  });

  it("loads the capture as the base on an empty canvas (no prompt)", () => {
    expect(routeIncomingCapture("/tmp/shotr-temp-1.png", false)).toBe("base");
  });

  it("prompts on a non-empty canvas instead of replacing silently", () => {
    expect(routeIncomingCapture("/tmp/shotr-temp-1.png", true)).toBe("prompt");
  });
});
