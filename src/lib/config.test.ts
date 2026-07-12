import { describe, it, expect } from "vitest";
import { validateConfig, DEFAULT_CONFIG } from "./config";

describe("validateConfig hotkeys", () => {
  it("keeps a valid hotkey", () => {
    const { config, issues } = validateConfig({
      schemaVersion: 1,
      hotkeys: { ...DEFAULT_CONFIG.hotkeys, captureFull: "CmdOrCtrl+Alt+Shift+7" },
    });
    expect(config.hotkeys.captureFull).toBe("CmdOrCtrl+Alt+Shift+7");
    expect(issues.join(" ")).not.toMatch(/captureFull/);
  });

  it("drops a no-modifier hotkey to default and records an issue", () => {
    const { config, issues } = validateConfig({
      schemaVersion: 1,
      hotkeys: { ...DEFAULT_CONFIG.hotkeys, captureFull: "3" },
    });
    expect(config.hotkeys.captureFull).toBe(DEFAULT_CONFIG.hotkeys.captureFull);
    expect(issues.some((i) => i.includes("hotkeys.captureFull"))).toBe(true);
  });
});

describe("validateConfig general.backdrop", () => {
  it("defaults the whole backdrop when absent", () => {
    const { config } = validateConfig({ schemaVersion: 1 });
    expect(config.general.backdrop).toEqual(DEFAULT_CONFIG.general.backdrop);
  });

  it("keeps valid backdrop overrides", () => {
    const { config, issues } = validateConfig({
      schemaVersion: 1,
      general: {
        ...DEFAULT_CONFIG.general,
        backdrop: {
          ...DEFAULT_CONFIG.general.backdrop,
          style: "solid",
          presetId: "indigo",
          padding: 96,
          shadow: false,
        },
      },
    });
    expect(config.general.backdrop.style).toBe("solid");
    expect(config.general.backdrop.presetId).toBe("indigo");
    expect(config.general.backdrop.padding).toBe(96);
    expect(config.general.backdrop.shadow).toBe(false);
    expect(issues.join(" ")).not.toMatch(/backdrop/);
  });

  it("drops invalid fields to default and records an issue", () => {
    const { config, issues } = validateConfig({
      schemaVersion: 1,
      general: {
        ...DEFAULT_CONFIG.general,
        backdrop: {
          ...DEFAULT_CONFIG.general.backdrop,
          style: "rainbow",
          padding: "lots",
        },
      },
    });
    expect(config.general.backdrop.style).toBe(DEFAULT_CONFIG.general.backdrop.style);
    expect(config.general.backdrop.padding).toBe(DEFAULT_CONFIG.general.backdrop.padding);
    expect(issues.some((i) => i.includes("general.backdrop"))).toBe(true);
  });
});
