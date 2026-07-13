import { describe, it, expect } from "vitest";
import { validateConfig, effectiveTools, DEFAULT_CONFIG } from "./config";

describe("effectiveTools remembers last-used per tool", () => {
  it("merges lastUsed over defaults for pen / highlighter / magnify", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      lastUsed: {
        pen: { strokeColor: "#00f", mode: "curve" as const, curveSmoothing: 20 },
        highlighter: { strokeWidth: 40, opacity: 0.7 },
        magnify: { zoom: 5, shape: "rect" as const, areaOpacity: 0, linkDash: false },
      },
    };
    const t = effectiveTools(cfg);
    expect(t.pen.strokeColor).toBe("#00f");
    expect(t.pen.mode).toBe("curve");
    expect(t.pen.curveSmoothing).toBe(20);
    // unspecified fields fall back to the tool default
    expect(t.pen.strokeWidth).toBe(DEFAULT_CONFIG.tools.pen.strokeWidth);
    expect(t.highlighter.strokeWidth).toBe(40);
    expect(t.highlighter.opacity).toBe(0.7);
    expect(t.magnify.zoom).toBe(5);
    expect(t.magnify.shape).toBe("rect");
    expect(t.magnify.areaOpacity).toBe(0);
    expect(t.magnify.linkDash).toBe(false);
  });

  it("keeps a persisted new-tool as lastUsed.tool through validation", () => {
    for (const tool of ["pen", "highlighter", "magnify"] as const) {
      const { config } = validateConfig({
        ...DEFAULT_CONFIG,
        lastUsed: { tool },
      });
      expect(config.lastUsed?.tool).toBe(tool);
    }
  });

  it("ignores lastUsed when rememberLastTool is off", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      general: { ...DEFAULT_CONFIG.general, rememberLastTool: false },
      lastUsed: { highlighter: { opacity: 0.1 } },
    };
    expect(effectiveTools(cfg).highlighter.opacity).toBe(
      DEFAULT_CONFIG.tools.highlighter.opacity,
    );
  });
});

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

  it("keeps per-capture auto-enable overrides", () => {
    const { config, issues } = validateConfig({
      schemaVersion: 1,
      general: {
        ...DEFAULT_CONFIG.general,
        backdrop: {
          ...DEFAULT_CONFIG.general.backdrop,
          autoForFull: true,
          autoForArea: true,
          autoForWindow: false,
        },
      },
    });
    expect(config.general.backdrop.autoForFull).toBe(true);
    expect(config.general.backdrop.autoForArea).toBe(true);
    expect(config.general.backdrop.autoForWindow).toBe(false);
    expect(issues.join(" ")).not.toMatch(/backdrop/);
  });

  it("defaults auto-enable to full/area off, window on", () => {
    expect(DEFAULT_CONFIG.general.backdrop.autoForFull).toBe(false);
    expect(DEFAULT_CONFIG.general.backdrop.autoForArea).toBe(false);
    expect(DEFAULT_CONFIG.general.backdrop.autoForWindow).toBe(true);
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
