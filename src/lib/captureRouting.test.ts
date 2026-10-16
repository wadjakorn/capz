import { describe, expect, it } from "vitest";
import { autoBackdropFor, routeIncomingCapture } from "./captureRouting";

describe("routeIncomingCapture", () => {
  it("routes a missing path to clear", () => {
    expect(routeIncomingCapture(null)).toBe("clear");
  });

  it("routes a capture to the base image", () => {
    expect(routeIncomingCapture("/tmp/capz-temp-1.png")).toBe("base");
  });
});

describe("autoBackdropFor", () => {
  const off = {
    autoForFull: false,
    autoForArea: false,
    autoForWindow: false,
    autoForPaste: false,
    autoForImport: false,
  };

  it("follows the per-capture toggle for each capture kind", () => {
    expect(autoBackdropFor({ ...off, autoForFull: true }, "full")).toBe(true);
    expect(autoBackdropFor({ ...off, autoForArea: true }, "area")).toBe(true);
    expect(autoBackdropFor({ ...off, autoForArea: true }, "systemArea")).toBe(true);
    expect(autoBackdropFor({ ...off, autoForWindow: true }, "window")).toBe(true);
    expect(autoBackdropFor(off, "full")).toBe(false);
    expect(autoBackdropFor(off, "area")).toBe(false);
    expect(autoBackdropFor(off, "window")).toBe(false);
  });

  it("does not let one kind's toggle leak into another", () => {
    expect(autoBackdropFor({ ...off, autoForWindow: true }, "full")).toBe(false);
    expect(autoBackdropFor({ ...off, autoForPaste: true }, "other", "import")).toBe(false);
    expect(autoBackdropFor({ ...off, autoForImport: true }, "other", "paste")).toBe(false);
  });

  it("uses the paste / import toggles for non-capture opens", () => {
    expect(autoBackdropFor({ ...off, autoForPaste: true }, "other", "paste")).toBe(true);
    expect(autoBackdropFor({ ...off, autoForImport: true }, "other", "import")).toBe(true);
    expect(autoBackdropFor(off, "other", "paste")).toBe(false);
    expect(autoBackdropFor(off, "other", "import")).toBe(false);
  });

  it("never turns on for a non-capture image with no origin, or a scroll capture", () => {
    const on = {
      autoForFull: true,
      autoForArea: true,
      autoForWindow: true,
      autoForPaste: true,
      autoForImport: true,
    };
    expect(autoBackdropFor(on, "other")).toBe(false);
    expect(autoBackdropFor(on, "scroll")).toBe(false);
  });
});
