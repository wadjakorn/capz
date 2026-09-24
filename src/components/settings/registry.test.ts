import { describe, expect, it } from "vitest";
import {
  MAX_VISIBLE_ROWS,
  PAGES,
  SETTING_IDS,
  SHORTCUTS_GROUP,
  isSettingId,
  settingDef,
  searchSettings,
  settingsForPage,
} from "./registry";

const PAGE_IDS = PAGES.map((p) => p.id);

describe("settings registry", () => {
  it("has unique ids", () => {
    expect(new Set(SETTING_IDS).size).toBe(SETTING_IDS.length);
  });

  it("puts every setting on a known page", () => {
    for (const id of SETTING_IDS) {
      expect(PAGE_IDS).toContain(settingDef(id).page);
    }
  });

  it("gives every page something to show without opening Advanced", () => {
    for (const page of PAGE_IDS) {
      expect(
        settingsForPage(page, "mac", { advanced: false }).length,
        `page ${page} has no everyday rows`,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps each page within the visible-row budget, shortcuts aside", () => {
    for (const page of PAGE_IDS) {
      for (const platform of ["mac", "windows"] as const) {
        const rows = settingsForPage(page, platform, { advanced: false }).filter(
          (id) => settingDef(id).group !== SHORTCUTS_GROUP,
        );
        expect(
          rows.length,
          `page ${page} on ${platform} shows ${rows.length} rows: ${rows.join(", ")}`,
        ).toBeLessThanOrEqual(MAX_VISIBLE_ROWS);
      }
    }
  });

  it("only uses platforms the app runs on", () => {
    for (const id of SETTING_IDS) {
      const platform = settingDef(id).platform;
      if (platform) expect(["mac", "windows"]).toContain(platform);
    }
  });

  it("hides platform-specific rows elsewhere", () => {
    const onWindows = settingsForPage("capture", "windows");
    expect(onWindows).not.toContain("capture.sysArea");
    expect(settingsForPage("capture", "mac")).toContain("capture.sysArea");
  });

  it("uses plain semver for addedIn", () => {
    for (const id of SETTING_IDS) {
      const addedIn = settingDef(id).addedIn;
      if (addedIn !== undefined) expect(addedIn).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("labels rows in sentence case, without trailing punctuation", () => {
    for (const id of SETTING_IDS) {
      const { label } = settingDef(id);
      expect(label.length, `${id} has an empty label`).toBeGreaterThan(0);
      expect(label, `${id} ends in punctuation`).not.toMatch(/[.:]$/);
      expect(label, `${id} is shouting`).not.toBe(label.toUpperCase());
    }
  });

  it("recognises its own ids and rejects anything else", () => {
    expect(isSettingId("after.format")).toBe(true);
    expect(isSettingId("after.nope")).toBe(false);
    expect(isSettingId(undefined)).toBe(false);
  });

  describe("search", () => {
    it("finds a row by a keyword that is not in its label", () => {
      expect(searchSettings("webp", "mac")).toContain("after.format");
      expect(searchSettings("dark mode", "mac")).toContain("editor.theme");
    });

    it("ignores case and surrounding space", () => {
      expect(searchSettings("  ShUtTeR ", "mac")).toContain("capture.sound");
    });

    it("returns nothing for an empty query", () => {
      expect(searchSettings("   ", "mac")).toEqual([]);
    });

    it("does not offer settings from another platform", () => {
      expect(searchSettings("tcc", "windows")).toEqual([]);
      expect(searchSettings("tcc", "mac")).toContain("app.tcc");
    });
  });
});
