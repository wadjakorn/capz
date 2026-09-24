import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { CONFIG_SCHEMA_VERSION, DEFAULT_CONFIG, persistedShape } from "./config";

// Downgrade protection keys off schemaVersion (see CONFIG_MIGRATIONS in
// config.ts): an older build of the SAME version treats the store as its own,
// so it strips keys it doesn't know and resets enum values it doesn't know on
// its next write. This pins the persisted shape to the schema version, so any
// of these without a bump fails here:
//   - a key added to / removed from / renamed in DEFAULT_CONFIG
//   - a validated leaf added or removed, including `lastUsed.*`
//   - an enum value added or removed (inSet options, ring modes)

function leafPaths(o: unknown, prefix = ""): string[] {
  if (!o || typeof o !== "object" || Array.isArray(o)) return [prefix];
  return Object.entries(o).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

function currentShape() {
  return { defaults: leafPaths(DEFAULT_CONFIG).sort(), validated: persistedShape() };
}

describe("persisted config shape is pinned to CONFIG_SCHEMA_VERSION", () => {
  const file = new URL(`./__fixtures__/config/shape.v${CONFIG_SCHEMA_VERSION}.json`, import.meta.url);
  const hint =
    "Persisted settings shape changed (key or enum value). Bump CONFIG_SCHEMA_VERSION, " +
    "add a CONFIG_MIGRATIONS step (identity is fine for additions), and add " +
    "__fixtures__/config/shape.v<N>.json from currentShape().";

  it(`matches __fixtures__/config/shape.v${CONFIG_SCHEMA_VERSION}.json`, () => {
    expect(existsSync(file), hint).toBe(true);
    const pinned = JSON.parse(readFileSync(file, "utf8"));
    expect(currentShape(), hint).toEqual(pinned);
  });

  it("records enum options and lastUsed leaves", () => {
    const v = persistedShape();
    expect(v["general.closeAction"]).toEqual(["both", "copy", "file", "none"]);
    expect(v["lastUsed.tool"]).toContain("pin");
    expect(v["lastUsed.pin.labelStyle"]).toEqual(["alpha", "numeric"]);
    expect(v["ring.modes"]).toBeTruthy();
    expect(v["output.jpegQuality"]).toBeNull();
  });
});
