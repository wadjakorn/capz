import { describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { pingFieldsFromUrl, recordPing } from "./latest";

function fakeDb() {
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          return { run: vi.fn(async () => ({})) };
        },
      };
    },
  };
  return { db: db as unknown as D1Database, calls };
}

const env = (db: D1Database) => ({ DB: db, ID_SALT: "salt" }) as unknown as Env;
const fields = { version: "0.12.0", target: "darwin", arch: "aarch64" };
const day = new Date("2026-09-12T23:59:59.000Z");

describe("pingFieldsFromUrl", () => {
  it("reads and clamps v/t/a", () => {
    const url = new URL("https://x/latest.json?v=0.12.0&t=darwin&a=aarch64");
    expect(pingFieldsFromUrl(url)).toEqual(fields);
    expect(pingFieldsFromUrl(new URL("https://x/latest.json"))).toEqual({ version: "", target: "", arch: "" });
    expect(pingFieldsFromUrl(new URL("https://x/latest.json?v=%3Cscript%3E")).version).toBe("script");
  });
});

describe("recordPing", () => {
  it("writes a hashed identified row for a valid install id", async () => {
    const { db, calls } = fakeDb();
    await recordPing(env(db), "9b2f4c1e-3d5a-4b7c-8e9f-0a1b2c3d4e5f", fields, day);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("INTO pings");
    expect(calls[0].args[0]).toBe("2026-09-12");
    expect(calls[0].args[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0].args[1]).not.toContain("9b2f4c1e");
    expect(calls[0].args.slice(2)).toEqual(["0.12.0", "darwin", "aarch64"]);
  });
  it("hashes upper- and lower-case ids identically", async () => {
    const a = fakeDb();
    const b = fakeDb();
    await recordPing(env(a.db), "9B2F4C1E-3D5A-4B7C-8E9F-0A1B2C3D4E5F", fields, day);
    await recordPing(env(b.db), "9b2f4c1e-3d5a-4b7c-8e9f-0a1b2c3d4e5f", fields, day);
    expect(a.calls[0].args[1]).toBe(b.calls[0].args[1]);
  });
  it("counts an anonymous row when the header is missing or malformed", async () => {
    for (const id of [null, "", "garbage", "9b2f4c1e-3d5a-1b7c-8e9f-0a1b2c3d4e5f"]) {
      const { db, calls } = fakeDb();
      await recordPing(env(db), id, fields, day);
      expect(calls[0].sql).toContain("INTO anon_pings");
      expect(calls[0].args).toEqual(["2026-09-12", "0.12.0", "darwin", "aarch64"]);
    }
  });
});
