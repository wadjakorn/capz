import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import v1 from "@/lib/__fixtures__/config/v1.json";
import v2 from "@/lib/__fixtures__/config/v2.json";
import current from "@/lib/__fixtures__/config/v3.json";
import { CONFIG_SCHEMA_VERSION } from "@/lib/config";
import v99 from "@/lib/__fixtures__/config/v99.json";

// In-memory stand-in for tauri-plugin-store, keyed by file name (same shape as
// the mock in src/lib/installId.test.ts).
const files = new Map<string, Map<string, unknown>>();
const setCalls: { file: string; key: string }[] = [];
let failBackup = false;
const loadMock = vi.fn(async (file: string) => {
  if (failBackup && file === "config.backup.json") throw new Error("disk full");
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
    failBackup = false;
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("upgrades a v1 store in place, keeping values and backing up the original once", async () => {
    seed(v1);
    const s = await freshStore();
    expect(s.getState().issues).toEqual([]);
    expect(onDisk().schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
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
    // Seeded from the fixture for the CURRENT schema version — pinning v2 here
    // meant this test started failing the moment the version moved on.
    seed(current);
    await freshStore();
    expect(setCalls).toEqual([]);
    expect(onDisk()).toEqual(current);
    expect(backup()).toBeUndefined();
  });

  it("writes defaults without a backup on a fresh install", async () => {
    seed(undefined);
    await freshStore();
    expect(onDisk().schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(onDisk().output.defaultSavePath).toBe("/default/dir");
    expect(backup()).toBeUndefined();
  });

  it("leaves config.json alone when the backup fails, even with no save dir yet", async () => {
    failBackup = true;
    const { defaultSavePath: _unset, ...output } = v1.output;
    const stored = { ...v1, output };
    seed(stored);
    const s = await freshStore();
    expect(setCalls.filter((c) => c.file === CONFIG)).toEqual([]);
    expect(onDisk()).toEqual(stored);
    // Still usable this session: values load and the save dir resolves in memory.
    expect(s.getState().config.output.fileFormat).toBe("webp");
    expect(s.getState().config.output.defaultSavePath).toBe("/default/dir");
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

  it("replaces lastUsed wholesale on a newer store, like the normal path", async () => {
    seed({ ...v99, lastUsed: { tool: "pen", region: { monitorId: 1, x: 0, y: 0, w: 5, h: 5 } } });
    const s = await freshStore();
    await s.getState().setLastUsed({ tool: "arrow" });
    expect(onDisk().lastUsed).toEqual({ tool: "arrow" });
    expect(onDisk().cloudSync).toEqual(v99.cloudSync);
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
