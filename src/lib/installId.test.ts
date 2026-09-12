import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory stand-in for tauri-plugin-store, keyed by file name.
const files = new Map<string, Map<string, unknown>>();
const saveMock = vi.fn(async () => {});
const loadMock = vi.fn(async (file: string) => {
  if (!files.has(file)) files.set(file, new Map());
  const m = files.get(file)!;
  return {
    get: async (k: string) => m.get(k),
    set: async (k: string, v: unknown) => void m.set(k, v),
    has: async (k: string) => m.has(k),
    delete: async (k: string) => m.delete(k),
    save: saveMock,
    clear: async () => m.clear(),
    onKeyChange: async () => () => {},
  };
});

vi.mock("@tauri-apps/plugin-store", () => ({ load: loadMock }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("installId on the desktop runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    files.clear();
    saveMock.mockClear();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mints a uuid once and returns the same one afterwards", async () => {
    const { getOrCreateInstallId, TELEMETRY_STORE_FILE } = await import("./installId");
    const a = await getOrCreateInstallId();
    const b = await getOrCreateInstallId();
    expect(a).toMatch(UUID_RE);
    expect(b).toBe(a);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(files.get(TELEMETRY_STORE_FILE)?.get("installId")).toBe(a);
  });

  it("lives in its own store file, not config.json", async () => {
    const { getOrCreateInstallId, TELEMETRY_STORE_FILE } = await import("./installId");
    await getOrCreateInstallId();
    expect(TELEMETRY_STORE_FILE).not.toBe("config.json");
    expect(files.has("config.json")).toBe(false);
  });

  it("replaces a corrupted stored value", async () => {
    const { getOrCreateInstallId, TELEMETRY_STORE_FILE } = await import("./installId");
    files.set(TELEMETRY_STORE_FILE, new Map([["installId", "not-a-uuid"]]));
    const id = await getOrCreateInstallId();
    expect(id).toMatch(UUID_RE);
  });

  it("clearInstallId removes the id; re-creating yields a different one", async () => {
    const { getOrCreateInstallId, clearInstallId, TELEMETRY_STORE_FILE } = await import("./installId");
    const first = await getOrCreateInstallId();
    await clearInstallId();
    expect(files.get(TELEMETRY_STORE_FILE)?.has("installId")).toBe(false);
    const second = await getOrCreateInstallId();
    expect(second).not.toBe(first);
  });

  it("installIdHeaders is undefined until the user opts in", async () => {
    const { installIdHeaders, setShareInstallId } = await import("./installId");
    const { useSettings } = await import("@/stores/settings");
    await useSettings.getState().init();
    expect(useSettings.getState().config.updates.shareInstallId).toBe(false);
    expect(await installIdHeaders()).toBeUndefined();

    await setShareInstallId(true);
    const headers = await installIdHeaders();
    expect(headers).toBeDefined();
    expect(headers!["X-Capz-Install"]).toMatch(UUID_RE);
  });

  it("off then on mints a fresh id; off deletes it", async () => {
    const { setShareInstallId, getOrCreateInstallId, TELEMETRY_STORE_FILE } = await import("./installId");
    const { useSettings } = await import("@/stores/settings");
    await useSettings.getState().init();
    await setShareInstallId(true);
    const first = await getOrCreateInstallId();
    await setShareInstallId(false);
    expect(files.get(TELEMETRY_STORE_FILE)?.has("installId")).toBe(false);
    expect(useSettings.getState().config.updates.shareInstallId).toBe(false);
    await setShareInstallId(true);
    expect(await getOrCreateInstallId()).not.toBe(first);
  });

  it("nudge flag starts false and sticks once marked", async () => {
    const { wasNudgeShown, markNudgeShown } = await import("./installId");
    expect(await wasNudgeShown()).toBe(false);
    await markNudgeShown();
    expect(await wasNudgeShown()).toBe(true);
  });
});

describe("installId on the web runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    files.clear();
    loadMock.mockClear();
    vi.stubGlobal("window", {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("never touches the store and never produces an id", async () => {
    const { getOrCreateInstallId, installIdHeaders, wasNudgeShown } = await import("./installId");
    expect(await getOrCreateInstallId()).toBeNull();
    expect(await installIdHeaders()).toBeUndefined();
    expect(await wasNudgeShown()).toBe(true);
    expect(loadMock).not.toHaveBeenCalled();
  });
});
