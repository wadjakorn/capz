import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const loadMock = vi.fn(async () => {
  throw new Error("Tauri store must not be touched on the web runtime");
});

vi.mock("@tauri-apps/plugin-store", () => ({ load: loadMock }));

describe("settings store on the web runtime (no Tauri)", () => {
  beforeEach(() => {
    vi.resetModules();
    loadMock.mockClear();
    vi.stubGlobal("window", {}); // browser, no __TAURI_INTERNALS__
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("init resolves with defaults and ready=true without loading the Tauri store", async () => {
    const { useSettings } = await import("./settings");
    const { DEFAULT_CONFIG } = await import("@/lib/config");
    await useSettings.getState().init();
    const s = useSettings.getState();
    expect(s.ready).toBe(true);
    expect(s.issues).toEqual([]);
    expect(s.config).toEqual(DEFAULT_CONFIG);
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("update patches in-memory config without persisting", async () => {
    const { useSettings } = await import("./settings");
    await useSettings.getState().init();
    await useSettings.getState().update("output", { fileFormat: "png" });
    expect(useSettings.getState().config.output.fileFormat).toBe("png");
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("flips one tool's keepToolActive flag without touching the others", async () => {
    const { useSettings } = await import("./settings");
    await useSettings.getState().init();
    const cur = useSettings.getState().config.general.keepToolActive;
    await useSettings
      .getState()
      .update("general", { keepToolActive: { ...cur, rect: false } });
    const next = useSettings.getState().config.general.keepToolActive;
    expect(next.rect).toBe(false);
    expect(next.text).toBe(true);
    expect(loadMock).not.toHaveBeenCalled();
  });
});
