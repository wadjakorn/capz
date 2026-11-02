import { describe, expect, it } from "vitest";
import type { Env } from "./env";
import { handleStats, isAuthorized } from "./stats";

const TOKEN = "s3cret";

function fakeDb() {
  const binds: { sql: string; args: unknown[] }[] = [];
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => {
      binds.push({ sql, args: a });
      return stmt(sql, a);
    },
    first: async () => ({ n: 1 }),
    all: async () => ({ results: [] }),
  });
  return { db: { prepare: (sql: string) => stmt(sql) } as unknown as D1Database, binds };
}

const env = (db: D1Database = fakeDb().db) => ({ DB: db, STATS_TOKEN: TOKEN }) as unknown as Env;
const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

describe("isAuthorized", () => {
  it("accepts the bearer token", () => {
    expect(isAuthorized(req("https://x/stats", { authorization: `Bearer ${TOKEN}` }), env())).toBe(true);
  });

  it("rejects a token in the query string", () => {
    expect(isAuthorized(req(`https://x/stats?token=${TOKEN}`), env())).toBe(false);
  });

  it("rejects a wrong token and an unset secret", () => {
    expect(isAuthorized(req("https://x/stats", { authorization: "Bearer nope" }), env())).toBe(false);
    const unset = { DB: fakeDb().db, STATS_TOKEN: "" } as unknown as Env;
    expect(isAuthorized(req("https://x/stats", { authorization: "Bearer " }), unset)).toBe(false);
  });
});

describe("handleStats", () => {
  it("returns 401 without auth", async () => {
    expect((await handleStats(req("https://x/stats"), env())).status).toBe(401);
  });

  it("reports yesterday's DAU and anon check breakdowns", async () => {
    const { db, binds } = fakeDb();
    const res = await handleStats(req("https://x/stats", { authorization: `Bearer ${TOKEN}` }), env(db));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    for (const key of [
      "dau",
      "dau_yesterday",
      "anon_checks_daily_30d",
      "anon_checks_by_version_30d",
      "anon_checks_by_platform_30d",
    ]) {
      expect(body).toHaveProperty(key);
    }
    const today = body.today as string;
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    expect(binds.some((b) => b.sql.includes("FROM pings WHERE day = ?1") && b.args[0] === yesterday)).toBe(true);
  });
});
