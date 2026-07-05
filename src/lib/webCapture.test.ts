import { describe, it, expect } from "vitest";
import {
  isWebCaptureSupported,
  mapCaptureError,
  computeCropRect,
  WebCaptureError,
} from "./webCapture";

describe("isWebCaptureSupported", () => {
  it("false when no navigator", () => {
    expect(isWebCaptureSupported(undefined)).toBe(false);
  });
  it("false when mediaDevices missing", () => {
    expect(isWebCaptureSupported({} as Navigator)).toBe(false);
  });
  it("false when getDisplayMedia is not a function", () => {
    expect(
      isWebCaptureSupported({ mediaDevices: {} } as Navigator),
    ).toBe(false);
  });
  it("true when getDisplayMedia present", () => {
    const nav = { mediaDevices: { getDisplayMedia: () => {} } } as unknown as Navigator;
    expect(isWebCaptureSupported(nav)).toBe(true);
  });
});

describe("mapCaptureError", () => {
  it("NotAllowedError -> cancelled", () => {
    expect(mapCaptureError({ name: "NotAllowedError" }).kind).toBe("cancelled");
  });
  it("AbortError -> cancelled", () => {
    expect(mapCaptureError({ name: "AbortError" }).kind).toBe("cancelled");
  });
  it("NotFoundError -> unsupported", () => {
    expect(mapCaptureError({ name: "NotFoundError" }).kind).toBe("unsupported");
  });
  it("unknown -> failed with message", () => {
    const e = mapCaptureError(new Error("boom"));
    expect(e.kind).toBe("failed");
    expect(e.message).toBe("boom");
  });
  it("passes through an existing WebCaptureError", () => {
    const orig = new WebCaptureError("cancelled");
    expect(mapCaptureError(orig)).toBe(orig);
  });
});

describe("computeCropRect", () => {
  const phys = { width: 200, height: 100 };
  it("scales CSS px by DPR", () => {
    expect(computeCropRect({ x: 10, y: 5, width: 20, height: 10 }, phys, 2)).toEqual({
      x: 20,
      y: 10,
      width: 40,
      height: 20,
    });
  });
  it("clamps selection inside the frame", () => {
    // origin past the right/bottom edge -> zero-size, never negative
    const r = computeCropRect({ x: 190, y: 95, width: 50, height: 50 }, phys, 1);
    expect(r).toEqual({ x: 190, y: 95, width: 10, height: 5 });
  });
  it("scale=1 is identity within bounds", () => {
    expect(computeCropRect({ x: 0, y: 0, width: 200, height: 100 }, phys)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });
});
