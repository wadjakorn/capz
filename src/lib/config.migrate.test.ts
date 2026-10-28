import { describe, it, expect } from "vitest";
import {
  CONFIG_MIGRATIONS,
  CONFIG_SCHEMA_VERSION,
  assertMigrationChain,
  deepMerge,
  effectiveTools,
  migrateConfig,
  stickerFolderId,
  validateConfig,
} from "./config";
import v0 from "./__fixtures__/config/v0.json";
import v1 from "./__fixtures__/config/v1.json";
import v2 from "./__fixtures__/config/v2.json";
import v4 from "./__fixtures__/config/v4.json";
import v5 from "./__fixtures__/config/v5.json";
import v6 from "./__fixtures__/config/v6.json";
import v7 from "./__fixtures__/config/v7.json";
import v8 from "./__fixtures__/config/v8.json";
import v99 from "./__fixtures__/config/v99.json";

// Fixtures are stores as older releases wrote them, with non-default values so
// a silent fall-back to a default shows up as a failure:
//   v0  — shape of v0.5.0 (no schemaVersion)
//   v1  — shape of v0.9.2
//   v2  — schema of v0.10.0+
//   v4  — schema of v0.15.0+
//   v5  — schema of v0.18.0+ (CP-0067)
//   v6  — schema of v0.18.x (auto-backdrop for paste / import)
//   v7  — schema of v0.19.0 (CP-0076: Shapes stroke style)
//   v8  — current schema (CP-0048: sticker sets)
//   v99 — a hypothetical future release with keys/values this build lacks

const load = (raw: unknown) => {
  const m = migrateConfig(raw);
  return { ...m, ...validateConfig(m.value) };
};

describe("assertMigrationChain", () => {
  it("accepts the shipped chain", () => {
    expect(() => assertMigrationChain(CONFIG_MIGRATIONS, CONFIG_SCHEMA_VERSION)).not.toThrow();
  });

  it("throws when a schema bump has no migration step", () => {
    expect(() => assertMigrationChain(CONFIG_MIGRATIONS, CONFIG_SCHEMA_VERSION + 1)).toThrow(
      `no migration from schemaVersion ${CONFIG_SCHEMA_VERSION}`,
    );
  });
});

describe("migrateConfig", () => {
  it("does not mutate its input", () => {
    const raw = structuredClone(v0);
    migrateConfig(raw);
    expect(raw).toEqual(v0);
  });

  it("runs every step from the stored version, in order", () => {
    const seen: number[] = [];
    const steps = {
      0: (o: Record<string, unknown>) => (seen.push(0), o),
      1: (o: Record<string, unknown>) => (seen.push(1), { ...o, renamed: o.old }),
      2: (o: Record<string, unknown>) => (seen.push(2), o),
    };
    const { value } = migrateConfig({ schemaVersion: 1, old: "kept" }, steps, 3);
    expect(seen).toEqual([1, 2]);
    expect(value).toMatchObject({ schemaVersion: 3, renamed: "kept" });
  });

  it("treats a corrupt schemaVersion as missing", () => {
    expect(migrateConfig({ schemaVersion: 1.5 })).toMatchObject({ fromVersion: 0, future: false });
    expect(migrateConfig({ schemaVersion: "2" })).toMatchObject({ fromVersion: 0, future: false });
  });

  it("returns a newer-version store untouched and flagged", () => {
    const m = migrateConfig(v99);
    expect(m.future).toBe(true);
    expect(m.fromVersion).toBe(99);
    expect(m.value).toEqual(v99);
  });
});

describe("older stores load with every user value kept", () => {
  it("v0 (no schemaVersion)", () => {
    const { config, issues, fromVersion } = load(v0);
    expect(fromVersion).toBe(0);
    expect(issues).toEqual([]);
    expect(config.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(config.hotkeys).toMatchObject(v0.hotkeys);
    expect(config.output).toEqual(v0.output);
    expect(config.pins).toMatchObject(v0.pins);
    const { rememberLastRegion: _retired, ...general } = v0.general;
    expect(config.general).toMatchObject(general);
    expect(config.tools.rect).toMatchObject(v0.tools.rect);
    expect(config.tools.arrow).toMatchObject(v0.tools.arrow);
    expect(config.tools.text).toMatchObject(v0.tools.text);
    expect(config.tools.blur).toEqual(v0.tools.blur);
    expect(config.tools.sticker).toEqual(v0.tools.sticker);
    expect(config.capture).toEqual(v0.capture);
    expect(config.updates).toMatchObject(v0.updates);
    // v7 → v8: the one sticker directory became the first folder set.
    expect(config.stickers).toEqual({
      folders: [{ id: stickerFolderId(v0.stickers.directory), dir: v0.stickers.directory, name: "Stickers", enabled: true }],
      disabledBuiltins: [],
      order: [],
    });
  });

  it("v1", () => {
    const { config, issues } = load(v1);
    expect(issues).toEqual([]);
    expect(config.hotkeys).toMatchObject(v1.hotkeys);
    expect(config.output).toEqual(v1.output);
    expect(config.pins).toMatchObject(v1.pins);
    expect(config.general).toMatchObject({ ...v1.general, backdrop: expect.anything() });
    expect(config.general.backdrop).toMatchObject(v1.general.backdrop);
    expect(config.tools.rect).toMatchObject(v1.tools.rect);
    expect(config.updates).toMatchObject(v1.updates);
    expect(config.lastUsed).toEqual(v1.lastUsed);
  });

  it("v2", () => {
    const { config, issues } = load(v2);
    expect(issues).toEqual([]);
    expect(config.hotkeys).toMatchObject(v2.hotkeys);
    expect(config.ring).toEqual(v2.ring);
    expect(config.output).toMatchObject(v2.output);
    expect(config.general).toMatchObject(v2.general);
    expect(config.workspaces).toMatchObject(v2.workspaces);
    expect(config.history).toMatchObject(v2.history);
  });
});

describe("v3 → v4: general.language", () => {
  it("keeps upgrading users on English", () => {
    const { config } = load({ schemaVersion: 3, general: { theme: "light" } });
    expect(config.general.language).toBe("en");
    expect(config.general.theme).toBe("light");
  });

  it("keeps an explicit language through the step", () => {
    const { config } = load({ schemaVersion: 3, general: { language: "th" } });
    expect(config.general.language).toBe("th");
  });

  it("older stores also land on English", () => {
    expect(load(v0).config.general.language).toBe("en");
    expect(load(v2).config.general.language).toBe("en");
  });

  it("a fresh install (nothing persisted) gets the Thai default", () => {
    expect(load(undefined).config.general.language).toBe("th");
  });
});

describe("v4 → v5: general.copyClosesEditor (CP-0067)", () => {
  it("a v4 store gains the setting switched off and keeps its values", () => {
    const { config, issues } = load(v4);
    expect(issues).toEqual([]);
    expect(config.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(config.general.copyClosesEditor).toBe(false);
    expect(config.general).toMatchObject(v4.general);
  });

  it("keeps a stored true", () => {
    const { config } = load({ schemaVersion: 5, general: { copyClosesEditor: true } });
    expect(config.general.copyClosesEditor).toBe(true);
  });
});

describe("v5 → v6: general.backdrop.autoForPaste / autoForImport", () => {
  it("a v5 store gains both switched off and keeps its values", () => {
    const { config, issues } = load(v5);
    expect(issues).toEqual([]);
    expect(config.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(config.general.backdrop.autoForPaste).toBe(false);
    expect(config.general.backdrop.autoForImport).toBe(false);
    expect(config.general).toMatchObject(v5.general);
  });

  it("a v6 store keeps stored values", () => {
    const { config, issues } = load(v6);
    expect(issues).toEqual([]);
    expect(config.general.backdrop).toEqual(v6.general.backdrop);
  });
});

describe("v6 → v7: rect strokeStyle, dashline folded into line", () => {
  it("tools.rect dashline becomes line + dashed", () => {
    const { config, issues } = load({
      ...v6,
      tools: { ...v6.tools, rect: { ...v6.tools.rect, shape: "dashline" } },
    });
    expect(issues).toEqual([]);
    expect(config.tools.rect).toMatchObject({
      shape: "line",
      strokeStyle: "dashed",
      strokeColor: "#ef4444",
      strokeWidth: 3,
    });
  });

  it("lastUsed.rect dashline becomes line + dashed", () => {
    const { config } = load({ ...v6, lastUsed: { rect: { shape: "dashline" } } });
    expect(config.lastUsed?.rect).toEqual({ shape: "line", strokeStyle: "dashed" });
  });

  it("dashline in one slot does not make the other slot's rect dashed", () => {
    const { config } = load({
      ...v6,
      general: { ...v6.general, rememberLastTool: true },
      tools: { ...v6.tools, rect: { ...v6.tools.rect, shape: "dashline" } },
      lastUsed: { rect: { shape: "rect" } },
    });
    expect(effectiveTools(config).rect).toMatchObject({ shape: "rect", strokeStyle: "solid" });
    expect(config.tools.rect).toMatchObject({ shape: "line", strokeStyle: "dashed" });
  });

  it("a v6 rect/ellipse/line keeps its shape and gains solid", () => {
    const { config, issues } = load(v6);
    expect(issues).toEqual([]);
    expect(config.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(config.tools.rect).toEqual({ ...v6.tools.rect, strokeStyle: "solid" });
  });

  it("a v7 store keeps stored values", () => {
    const { config, issues } = load(v7);
    expect(issues).toEqual([]);
    expect(config.tools.rect).toEqual(v7.tools.rect);
  });
});

describe("v7 → v8: sticker sets", () => {
  it("a v7 sticker directory becomes one enabled folder set", () => {
    const { config, issues } = load({ ...v7, stickers: { directory: "C:\\Users\\me\\Stickers\\" } });
    expect(issues).toEqual([]);
    expect(config.stickers.folders).toEqual([
      { id: stickerFolderId("C:\\Users\\me\\Stickers\\"), dir: "C:\\Users\\me\\Stickers\\", name: "Stickers", enabled: true },
    ]);
  });

  it("a v7 store without a directory gets no folder sets", () => {
    const { config, issues } = load(v7);
    expect(issues).toEqual([]);
    expect(config.stickers).toEqual({ folders: [], disabledBuiltins: [], order: [] });
  });

  it("the remembered emoji becomes a stickerItem in the emoji set", () => {
    const { config, issues } = load({ ...v7, lastUsed: { tool: "sticker", stickerEmoji: "🔥" } });
    expect(issues).toEqual([]);
    expect(config.lastUsed).toEqual({ tool: "sticker", stickerItem: { setId: "emoji", itemId: "🔥" } });
  });

  it("folder ids are stable, so the step is repeatable", () => {
    expect(stickerFolderId("/a/b")).toBe(stickerFolderId("/a/b"));
    expect(stickerFolderId("/a/b")).not.toBe(stickerFolderId("/a/c"));
  });

  it("a v8 store keeps stored values", () => {
    const { config, issues } = load(v8);
    expect(issues).toEqual([]);
    expect(config.stickers).toEqual(v8.stickers);
  });

  it("drops a malformed or duplicate folder but keeps the rest", () => {
    const good = v8.stickers.folders[0];
    const { config, issues } = load({
      ...v8,
      stickers: { ...v8.stickers, folders: [good, { id: 1 }, good] },
    });
    expect(config.stickers.folders).toEqual([good]);
    expect(issues).toHaveLength(2);
  });

  it("validates lastUsed.stickerItem", () => {
    expect(load({ ...v8, lastUsed: { stickerItem: { setId: "status", itemId: "bug" } } }).config.lastUsed)
      .toEqual({ stickerItem: { setId: "status", itemId: "bug" } });
    expect(load({ ...v8, lastUsed: { stickerItem: { setId: 3 } } }).config.lastUsed).toBeUndefined();
  });
});

describe("deepMerge", () => {
  it("merges nested objects and keeps keys only the base has", () => {
    const base = { a: { keep: 1, x: 1 }, extra: { deep: true }, v: 99 };
    expect(deepMerge(base, { a: { x: 2 } })).toEqual({
      a: { keep: 1, x: 2 },
      extra: { deep: true },
      v: 99,
    });
    expect(base.a.x).toBe(1);
  });

  it("replaces arrays and primitives instead of merging them", () => {
    expect(deepMerge({ m: [1, 2, 3], s: "a" }, { m: [9], s: null })).toEqual({ m: [9], s: null });
  });
});
