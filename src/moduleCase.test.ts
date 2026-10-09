import { readdirSync, statSync } from "node:fs";
import { join, parse } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * macOS and Windows build on case-insensitive filesystems: two modules in one
 * folder whose names differ only by case (or extension), like ThaiText.tsx and
 * thaiText.ts, make `./ThaiText` resolve to the wrong file there while Linux
 * CI stays green. That broke the v0.18.3 release build.
 */
function collisions(dir: string, out: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      collisions(path, out);
      continue;
    }
    if (!/\.(tsx?|mjs|js)$/.test(name)) continue;
    const p = parse(name);
    const base = p.name.toLowerCase();
    const prev = seen.get(base);
    if (prev && prev !== name) out.push(`${join(dir, prev)} ↔ ${name}`);
    else seen.set(base, name);
  }
  return out;
}

describe("module names", () => {
  it("no two modules in a folder differ only by case or extension", () => {
    expect(collisions(join(__dirname))).toEqual([]);
  });
});
