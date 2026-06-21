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
