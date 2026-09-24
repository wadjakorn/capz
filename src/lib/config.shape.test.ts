import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { CONFIG_SCHEMA_VERSION, DEFAULT_CONFIG } from "./config";

// Downgrade protection keys off schemaVersion (see CONFIG_MIGRATIONS in
// config.ts): a persisted key added without a bump is stripped by an older
// build of the same version. This pins DEFAULT_CONFIG's key set to the schema
// version, so adding/removing/renaming a key without a bump fails here.
//
// Not covered: new enum values (validators are closures) and `lastUsed`
// (optional, absent from DEFAULT_CONFIG) — those rely on the rule in CLAUDE.md.

function leafPaths(o: unknown, prefix = ""): string[] {
  if (!o || typeof o !== "object" || Array.isArray(o)) return [prefix];
  return Object.entries(o).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe("persisted config shape is pinned to CONFIG_SCHEMA_VERSION", () => {
  it(`matches __fixtures__/config/shape.v${CONFIG_SCHEMA_VERSION}.json`, () => {
    const file = new URL(`./__fixtures__/config/shape.v${CONFIG_SCHEMA_VERSION}.json`, import.meta.url);
    const hint =
      "DEFAULT_CONFIG keys changed: bump CONFIG_SCHEMA_VERSION, add a CONFIG_MIGRATIONS step, " +
      `and add __fixtures__/config/shape.v<N>.json (sorted leaf paths)`;
    expect(existsSync(file), hint).toBe(true);
    const pinned = JSON.parse(readFileSync(file, "utf8")) as string[];
    expect(leafPaths(DEFAULT_CONFIG).sort(), hint).toEqual(pinned);
  });
});
