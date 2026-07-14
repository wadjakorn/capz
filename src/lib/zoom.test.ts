import { describe, it, expect } from "vitest";
import {
  SLIDER_SCALE_MIN,
  SLIDER_SCALE_MAX,
  scaleToSlider,
  sliderToScale,
} from "./zoom";

describe("zoom slider log mapping", () => {
  it("maps the endpoints to 0 and 1", () => {
    expect(scaleToSlider(SLIDER_SCALE_MIN)).toBeCloseTo(0, 6);
    expect(scaleToSlider(SLIDER_SCALE_MAX)).toBeCloseTo(1, 6);
    expect(sliderToScale(0)).toBeCloseTo(SLIDER_SCALE_MIN, 6);
    expect(sliderToScale(1)).toBeCloseTo(SLIDER_SCALE_MAX, 6);
  });

  it("round-trips scale → slider → scale across the range", () => {
    for (const s of [0.1, 0.25, 0.5, 1, 2, 4, 8, 16]) {
      expect(sliderToScale(scaleToSlider(s))).toBeCloseTo(s, 6);
    }
  });

  it("places 100% near the middle of the track (log scale)", () => {
    const t = scaleToSlider(1);
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.5);
  });

  it("is monotonic increasing", () => {
    expect(scaleToSlider(0.5)).toBeLessThan(scaleToSlider(1));
    expect(scaleToSlider(1)).toBeLessThan(scaleToSlider(2));
  });

  it("clamps out-of-range scales to the track ends", () => {
    expect(scaleToSlider(0.02)).toBe(0); // below min (ZOOM_MIN 0.05)
    expect(scaleToSlider(32)).toBe(1); // above max (ZOOM_MAX 32)
  });

  it("clamps slider position to [0,1]", () => {
    expect(sliderToScale(-1)).toBeCloseTo(SLIDER_SCALE_MIN, 6);
    expect(sliderToScale(2)).toBeCloseTo(SLIDER_SCALE_MAX, 6);
  });
});
