import { describe, it, expect } from "vitest";
import { formatPinLabel } from "./pinLabel";

describe("formatPinLabel", () => {
  it("returns the plain number in numeric mode", () => {
    for (const n of [0, 1, 26, 27, 703, -3, 1.5]) {
      expect(formatPinLabel(n, "numeric")).toBe(String(n));
    }
    expect(formatPinLabel(7)).toBe("7");
  });

  it("maps positive integers with bijective base-26", () => {
    expect(formatPinLabel(1, "alpha")).toBe("A");
    expect(formatPinLabel(26, "alpha")).toBe("Z");
    expect(formatPinLabel(27, "alpha")).toBe("AA");
    expect(formatPinLabel(52, "alpha")).toBe("AZ");
    expect(formatPinLabel(53, "alpha")).toBe("BA");
    expect(formatPinLabel(702, "alpha")).toBe("ZZ");
    expect(formatPinLabel(703, "alpha")).toBe("AAA");
  });

  it("falls back to the plain number for values it cannot map", () => {
    expect(formatPinLabel(0, "alpha")).toBe("0");
    expect(formatPinLabel(-3, "alpha")).toBe("-3");
    expect(formatPinLabel(1.5, "alpha")).toBe("1.5");
    expect(formatPinLabel(NaN, "alpha")).toBe("NaN");
    expect(formatPinLabel(Infinity, "alpha")).toBe("Infinity");
  });
});
