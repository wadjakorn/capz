import { type Env, json, utcDay } from "./env";

function daysAgo(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return utcDay(d);
}

export function isAuthorized(request: Request, env: Env): boolean {
  if (!env.STATS_TOKEN) return false;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const query = new URL(request.url).searchParams.get("token");
  return bearer === env.STATS_TOKEN || query === env.STATS_TOKEN;
}

/** GET /stats */
export async function handleStats(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, 401);

  const today = utcDay();
  const since7 = daysAgo(today, 6);
  const since30 = daysAgo(today, 29);
  const sinceIso7 = `${since7}T00:00:00.000Z`;

  const db = env.DB;
  const [dau, wau, mau, anon, byVersion, byPlatform, daily, fb7, fbPending] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM pings WHERE day = ?1`).bind(today).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(DISTINCT id_hash) AS n FROM pings WHERE day >= ?1`).bind(since7).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(DISTINCT id_hash) AS n FROM pings WHERE day >= ?1`).bind(since30).first<{ n: number }>(),
    db.prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM anon_pings WHERE day = ?1`).bind(today).first<{ n: number }>(),
    db
      .prepare(
        `SELECT version, COUNT(DISTINCT id_hash) AS machines FROM pings WHERE day >= ?1
         GROUP BY version ORDER BY machines DESC`,
      )
      .bind(since30)
      .all<{ version: string; machines: number }>(),
    db
      .prepare(
        `SELECT target, arch, COUNT(DISTINCT id_hash) AS machines FROM pings WHERE day >= ?1
         GROUP BY target, arch ORDER BY machines DESC`,
      )
      .bind(since30)
      .all<{ target: string; arch: string; machines: number }>(),
    db
      .prepare(`SELECT day, COUNT(*) AS dau FROM pings WHERE day >= ?1 GROUP BY day ORDER BY day ASC`)
      .bind(since30)
      .all<{ day: string; dau: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE created_at >= ?1`).bind(sinceIso7).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE issue_number IS NULL`).first<{ n: number }>(),
  ]);

  return json({
    today,
    dau: dau?.n ?? 0,
    wau: wau?.n ?? 0,
    mau: mau?.n ?? 0,
    anon_today: anon?.n ?? 0,
    by_version_30d: byVersion.results,
    by_platform_30d: byPlatform.results,
    daily_30d: daily.results,
    feedback: { last_7d: fb7?.n ?? 0, pending_issue: fbPending?.n ?? 0 },
  });
}
