import { describe, it, expect } from "vitest";
import { supportsAutoScroll, supportsOcr } from "./platformFeatures";

describe("platform features (CP-0085)", () => {
  it("hides OCR and auto-scroll on Linux only", () => {
    expect(supportsOcr("linux")).toBe(false);
    expect(supportsAutoScroll("linux")).toBe(false);
    for (const p of ["mac", "win"] as const) {
      expect(supportsOcr(p)).toBe(true);
      expect(supportsAutoScroll(p)).toBe(true);
    }
  });
});
