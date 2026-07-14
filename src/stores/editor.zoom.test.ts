import { describe, it, expect, beforeEach } from "vitest";
import { useEditor } from "./editor";

beforeEach(() => {
  useEditor.getState().reset();
});

describe("displayScale sentinel", () => {
  it("reset() starts at the 0 fit sentinel with userZoomed false", () => {
    expect(useEditor.getState().displayScale).toBe(0);
    expect(useEditor.getState().userZoomed).toBe(false);
  });

  it("setDisplayScale(0) keeps the exact 0 sentinel (not clamped to ZOOM_MIN)", () => {
    useEditor.getState().setDisplayScale(2);
    useEditor.getState().setDisplayScale(0);
    expect(useEditor.getState().displayScale).toBe(0);
  });
});

describe("userZoomed tracking", () => {
  it("a manual setDisplayScale marks the view as user-zoomed", () => {
    useEditor.getState().setDisplayScale(2);
    expect(useEditor.getState().displayScale).toBe(2);
    expect(useEditor.getState().userZoomed).toBe(true);
  });

  it("zoomReset100 (manual 100%) marks user-zoomed", () => {
    useEditor.getState().zoomReset100();
    expect(useEditor.getState().displayScale).toBe(1);
    expect(useEditor.getState().userZoomed).toBe(true);
  });

  it("zoomFit clears user-zoomed so a later resize can re-fit", () => {
    useEditor.getState().setDisplayScale(2); // user zooms in
    expect(useEditor.getState().userZoomed).toBe(true);
    useEditor.getState().zoomFit({ vw: 200, vh: 200, iw: 100, ih: 100 });
    expect(useEditor.getState().displayScale).toBe(2); // min(200/100, 200/100)
    expect(useEditor.getState().userZoomed).toBe(false);
  });

  it("resetting to the fit sentinel clears user-zoomed", () => {
    useEditor.getState().setDisplayScale(2);
    useEditor.getState().setDisplayScale(0);
    expect(useEditor.getState().userZoomed).toBe(false);
  });

  it("reset() clears a prior user zoom", () => {
    useEditor.getState().setDisplayScale(3);
    useEditor.getState().reset();
    expect(useEditor.getState().userZoomed).toBe(false);
  });

  it("applyCrop re-fits and clears user-zoomed", () => {
    useEditor.getState().setDisplayScale(3);
    useEditor.getState().applyCrop({ x: 0, y: 0, w: 50, h: 40 }, { w: 100, h: 80 });
    expect(useEditor.getState().displayScale).toBe(0);
    expect(useEditor.getState().userZoomed).toBe(false);
  });
});
