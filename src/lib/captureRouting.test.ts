import { describe, expect, it } from "vitest";
import { routeIncomingCapture } from "./captureRouting";

describe("routeIncomingCapture", () => {
  it("routes a missing path to clear", () => {
    expect(routeIncomingCapture(null)).toBe("clear");
  });

  it("routes a capture to the base image", () => {
    expect(routeIncomingCapture("/tmp/capz-temp-1.png")).toBe("base");
  });
});
