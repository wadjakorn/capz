import { describe, it, expect } from "vitest";
import {
  CONFIG_MIGRATIONS,
  CONFIG_SCHEMA_VERSION,
  assertMigrationChain,
  deepMerge,
  migrateConfig,
  validateConfig,
} from "./config";
import v0 from "./__fixtures__/config/v0.json";
import v1 from "./__fixtures__/config/v1.json";
import v2 from "./__fixtures__/config/v2.json";
import v99 from "./__fixtures__/config/v99.json";

// Fixtures are stores as older releases wrote them, with non-default values so
// a silent fall-back to a default shows up as a failure:
//   v0  — shape of v0.5.0 (no schemaVersion)
//   v1  — shape of v0.9.2
//   v2  — current schema (v0.10.0+)
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
    expect(config.stickers).toEqual(v0.stickers);
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
