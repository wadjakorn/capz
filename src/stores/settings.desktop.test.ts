import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import v1 from "@/lib/__fixtures__/config/v1.json";
import v2 from "@/lib/__fixtures__/config/v2.json";
import v99 from "@/lib/__fixtures__/config/v99.json";

// In-memory stand-in for tauri-plugin-store, keyed by file name (same shape as
// the mock in src/lib/installId.test.ts).
const files = new Map<string, Map<string, unknown>>();
const setCalls: { file: string; key: string }[] = [];
const loadMock = vi.fn(async (file: string) => {
  if (!files.has(file)) files.set(file, new Map());
  const m = files.get(file)!;
  return {
    get: async (k: string) => structuredClone(m.get(k)),
    set: async (k: string, v: unknown) => {
      setCalls.push({ file, key: k });
      m.set(k, structuredClone(v));
    },
    has: async (k: string) => m.has(k),
    delete: async (k: string) => m.delete(k),
    save: async () => {},
    clear: async () => m.clear(),
    onKeyChange: async () => () => {},
  };
});

vi.mock("@tauri-apps/plugin-store", () => ({ load: loadMock }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => "/default/dir") }));

const CONFIG = "config.json";
const BACKUP = "config.backup.json";

function seed(value: unknown, extra: Record<string, unknown> = {}) {
  const m = new Map<string, unknown>(Object.entries(extra));
  if (value !== undefined) m.set("app", structuredClone(value));
  files.set(CONFIG, m);
}
const onDisk = () => files.get(CONFIG)!.get("app") as Record<string, any>;
const backup = () => files.get(BACKUP);

async function freshStore() {
  const { useSettings } = await import("./settings");
  await useSettings.getState().init();
  return useSettings;
}

describe("settings store on the desktop runtime (CP-0055)", () => {
  beforeEach(() => {
    vi.resetModules();
    files.clear();
    setCalls.length = 0;
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("upgrades a v1 store in place, keeping values and backing up the original once", async () => {
    seed(v1);
    const s = await freshStore();
    expect(s.getState().issues).toEqual([]);
    expect(onDisk().schemaVersion).toBe(2);
    expect(onDisk().output).toEqual(v1.output);
    expect(onDisk().hotkeys).toMatchObject(v1.hotkeys);
    expect(backup()?.get("app@v1")).toEqual(v1);
    expect(backup()?.get("lastRewrite")).toMatchObject({ fromVersion: 1, raw: v1 });

    // A second upgrade-from-v1 snapshot must not overwrite the first.
    vi.resetModules();
    seed({ ...v1, output: { ...v1.output, jpegQuality: 1 } });
    await freshStore();
    expect(backup()?.get("app@v1")).toEqual(v1);
  });

  it("does not rewrite or back up a clean current-version store", async () => {
    seed(v2);
    await freshStore();
    expect(setCalls).toEqual([]);
    expect(onDisk()).toEqual(v2);
    expect(backup()).toBeUndefined();
  });

  it("writes defaults without a backup on a fresh install", async () => {
    seed(undefined);
    await freshStore();
    expect(onDisk().schemaVersion).toBe(2);
    expect(onDisk().output.defaultSavePath).toBe("/default/dir");
    expect(backup()).toBeUndefined();
  });

  describe("store written by a newer capz (downgrade)", () => {
    it("does not rewrite it on load, and raises no reset-inviting issues", async () => {
      seed(v99);
      const s = await freshStore();
      expect(setCalls.filter((c) => c.file === CONFIG)).toEqual([]);
      expect(onDisk()).toEqual(v99);
      expect(s.getState().issues).toEqual([]);
      // Values this build understands are used; the unknown enum falls back in memory only.
      expect(s.getState().config.general.theme).toBe("light");
      expect(s.getState().config.general.closeAction).toBe("copy");
    });

    it("writes only the changed field and keeps everything the newer build wrote", async () => {
      seed(v99);
      const s = await freshStore();
      await s.getState().update("output", { fileFormat: "jpeg" });
      await s.getState().update("tools", { rect: { strokeWidth: 9 } } as never);
      await s.getState().setLastUsed({ tool: "arrow" });

      const d = onDisk();
      expect(d.schemaVersion).toBe(99);
      expect(d.output.fileFormat).toBe("jpeg");
      expect(d.output.watermark).toEqual({ text: "(c) me" });
      expect(d.hotkeys.captureMagic).toBe("CmdOrCtrl+Alt+Shift+M");
      expect(d.general.closeAction).toBe("ask");
      expect(d.cloudSync).toEqual({ enabled: true, provider: "icloud" });
      expect(d.tools).toEqual({ rect: { strokeWidth: 9 } });
      expect(d.lastUsed).toEqual({ tool: "arrow" });
      expect(s.getState().config.output.fileFormat).toBe("jpeg");
    });
  });

  it("reset keeps the permissions bookkeeping", async () => {
    const permissions = { lastGrantedVersion: "0.13.1" };
    seed(v2, { permissions });
    const s = await freshStore();
    await s.getState().reset();
    expect(files.get(CONFIG)!.get("permissions")).toEqual(permissions);
    expect(onDisk().output.fileFormat).toBe("jpeg"); // DEFAULT_CONFIG
  });
});
