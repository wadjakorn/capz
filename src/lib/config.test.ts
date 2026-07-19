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

  it("accepts an empty captureScroll (unbound) without an issue", () => {
    const { config, issues } = validateConfig({
      schemaVersion: 1,
      hotkeys: { ...DEFAULT_CONFIG.hotkeys, captureScroll: "" },
    });
    expect(config.hotkeys.captureScroll).toBe("");
    expect(issues.join(" ")).not.toMatch(/captureScroll/);
  });

  it("keeps a valid captureScroll binding", () => {
    const { config } = validateConfig({
      schemaVersion: 1,
      hotkeys: { ...DEFAULT_CONFIG.hotkeys, captureScroll: "CmdOrCtrl+Alt+Shift+6" },
    });
    expect(config.hotkeys.captureScroll).toBe("CmdOrCtrl+Alt+Shift+6");
  });

  // CP-0036: every hotkey is clearable, so "" must survive a persist/load
  // round-trip for all of them — not just the two that ship unbound. Before
  // this, clearing e.g. captureFull reverted to its default on next launch.
  it("accepts an empty accelerator for every hotkey without an issue", () => {
    for (const key of Object.keys(DEFAULT_CONFIG.hotkeys) as (keyof typeof DEFAULT_CONFIG.hotkeys)[]) {
      const { config, issues } = validateConfig({
        schemaVersion: 1,
        hotkeys: { ...DEFAULT_CONFIG.hotkeys, [key]: "" },
      });
      expect(config.hotkeys[key], `${key} should stay cleared`).toBe("");
      expect(issues.join(" ")).not.toMatch(new RegExp(key));
    }
  });

  it("still rejects a malformed accelerator for a clearable hotkey", () => {
    const { config, issues } = validateConfig({
      schemaVersion: 1,
      hotkeys: { ...DEFAULT_CONFIG.hotkeys, showEditor: "nonsense" },
    });
    expect(config.hotkeys.showEditor).toBe(DEFAULT_CONFIG.hotkeys.showEditor);
    expect(issues.some((i) => i.includes("hotkeys.showEditor"))).toBe(true);
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

describe("validateConfig ring.modes (CP-0038)", () => {
  const ring = (modes: unknown) => validateConfig({ ...DEFAULT_CONFIG, ring: { modes } });

  it("keeps a valid custom slot list in order", () => {
    const { config, issues } = ring(["area", "window"]);
    expect(config.ring.modes).toEqual(["area", "window"]);
    expect(issues).toEqual([]);
  });

  it("accepts a single-slot ring", () => {
    expect(ring(["full"]).config.ring.modes).toEqual(["full"]);
  });

  // The store is hand-editable JSON: an empty list would leave the ring with
  // nothing to cycle or fire, so it must fall back rather than persist.
  it("falls back to defaults when the list is empty", () => {
    const { config, issues } = ring([]);
    expect(config.ring.modes).toEqual(DEFAULT_CONFIG.ring.modes);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("truncates past the four-slot maximum", () => {
    const { config, issues } = ring(["window", "full", "scroll", "area", "systemArea"]);
    expect(config.ring.modes).toHaveLength(4);
    expect(issues.some((i) => i.includes("truncating"))).toBe(true);
  });

  // A newer build may write a mode this one has never heard of. Dropping just
  // that entry costs one slot instead of the user's whole layout.
  it("drops unknown entries but keeps the valid ones", () => {
    const { config, issues } = ring(["full", "teleport", "area"]);
    expect(config.ring.modes).toEqual(["full", "area"]);
    expect(issues.some((i) => i.includes("teleport"))).toBe(true);
  });

  it("drops duplicates", () => {
    const { config } = ring(["full", "full", "area"]);
    expect(config.ring.modes).toEqual(["full", "area"]);
  });

  it("falls back when modes is not an array", () => {
    expect(ring("full").config.ring.modes).toEqual(DEFAULT_CONFIG.ring.modes);
  });

  it("uses defaults when the section is absent", () => {
    const { ring: _omit, ...rest } = DEFAULT_CONFIG;
    expect(validateConfig(rest).config.ring.modes).toEqual(DEFAULT_CONFIG.ring.modes);
  });
});

describe("validateConfig commandRingV2 hotkey (CP-0038)", () => {
  it("ships unbound and survives a round-trip as unbound", () => {
    expect(DEFAULT_CONFIG.hotkeys.commandRingV2).toBe("");
    const cfg = { ...DEFAULT_CONFIG, hotkeys: { ...DEFAULT_CONFIG.hotkeys, commandRingV2: "" } };
    expect(validateConfig(cfg).config.hotkeys.commandRingV2).toBe("");
  });

  it("is independent of the v1 ring binding", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      hotkeys: {
        ...DEFAULT_CONFIG.hotkeys,
        commandRing: "CmdOrCtrl+Shift+Space",
        commandRingV2: "CmdOrCtrl+Alt+Space",
      },
    };
    const { config } = validateConfig(cfg);
    expect(config.hotkeys.commandRing).toBe("CmdOrCtrl+Shift+Space");
    expect(config.hotkeys.commandRingV2).toBe("CmdOrCtrl+Alt+Space");
  });
});
