import { describe, expect, it } from "vitest";
import { HERO_CLIPS, SLOTS } from "./shots";
import { en } from "@/i18n/locales/en";

describe("HERO_CLIPS", () => {
  it("has 1–5 clips with unique ids", () => {
    expect(HERO_CLIPS.length).toBeGreaterThanOrEqual(1);
    expect(HERO_CLIPS.length).toBeLessThanOrEqual(5);
    expect(new Set(HERO_CLIPS.map((c) => c.id)).size).toBe(HERO_CLIPS.length);
  });

  it.each(HERO_CLIPS.map((c) => [c.id, c] as const))("%s: camera keys are sorted and in range", (_id, clip) => {
    expect(clip.camera.length).toBeGreaterThan(0);
    expect(clip.duration).toBeGreaterThan(0);
    clip.camera.forEach((k, i) => {
      if (i > 0) expect(k.t).toBeGreaterThan(clip.camera[i - 1].t);
      expect(k.t).toBeGreaterThanOrEqual(0);
      expect(k.t).toBeLessThanOrEqual(clip.duration);
      expect(k.x).toBeGreaterThanOrEqual(0);
      expect(k.x).toBeLessThanOrEqual(1);
      expect(k.y).toBeGreaterThanOrEqual(0);
      expect(k.y).toBeLessThanOrEqual(1);
      expect(k.s).toBeGreaterThanOrEqual(1);
    });
  });

  it("labels and captions are real i18n keys", () => {
    for (const c of HERO_CLIPS) {
      expect(en).toHaveProperty([c.label]);
      expect(en).toHaveProperty([c.caption]);
    }
  });
});

describe("SLOTS", () => {
  it("every slot has a placeholder line in the dictionary", () => {
    for (const s of Object.values(SLOTS)) expect(en, s.id).toHaveProperty([s.line]);
  });
});
