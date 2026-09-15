import { type Env, intVar, json, utcDay } from "./env";
import { createIssue, type FeedbackRow } from "./github";
import { saltedHash } from "./hash";
import { parseFeedbackBody } from "./validate";

const BODY_MAX_BYTES = 16 * 1024;

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export function handleFeedbackPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
}

async function issuesCreatedToday(env: Env, day: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM feedback WHERE issue_number IS NOT NULL AND created_at >= ?1`,
  )
    .bind(`${day}T00:00:00.000Z`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Try to turn a stored feedback row into a GitHub issue, honouring the kill
 * switch and the daily cap. Writes the outcome back to the row.
 */
export async function promoteToIssue(env: Env, row: FeedbackRow, now: Date = new Date()): Promise<void> {
  if (env.ISSUE_CREATION_ENABLED !== "true") return;
  const cap = intVar(env.DAILY_ISSUE_CAP, 50);
  if ((await issuesCreatedToday(env, utcDay(now))) >= cap) {
    await env.DB.prepare(`UPDATE feedback SET issue_error = ?2 WHERE id = ?1`)
      .bind(row.id, "daily issue cap reached")
      .run();
    return;
  }
  const result = await createIssue(env, row);
  if (result.ok) {
    await env.DB.prepare(`UPDATE feedback SET issue_number = ?2, issue_error = NULL WHERE id = ?1`)
      .bind(row.id, result.number)
      .run();
  } else {
    console.error("createIssue failed", result.error);
    await env.DB.prepare(`UPDATE feedback SET issue_error = ?2 WHERE id = ?1`)
      .bind(row.id, result.error.slice(0, 500))
      .run();
  }
}

/** POST /feedback */
export async function handleFeedback(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const respond = (body: unknown, status: number) => json(body, status, CORS_HEADERS);

  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > BODY_MAX_BYTES) return respond({ ok: false, error: "body too large" }, 413);

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > BODY_MAX_BYTES) return respond({ ok: false, error: "body too large" }, 413);
    raw = JSON.parse(text);
  } catch {
    return respond({ ok: false, error: "invalid JSON" }, 400);
  }
  const parsed = parseFeedbackBody(raw);
  if (!parsed.ok) return respond({ ok: false, error: parsed.error }, 400);

  const ip = clientIp(request);
  const burst = await env.FEEDBACK_RL.limit({ key: ip });
  if (!burst.success) return respond({ ok: false, error: "too many requests" }, 429);

  const now = new Date();
  const day = utcDay(now);
  const ipHash = await saltedHash(ip, env.ID_SALT);
  const perIpCap = intVar(env.PER_IP_DAILY_CAP, 10);
  const todayFromIp = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ?1 AND created_at >= ?2`,
  )
    .bind(ipHash, `${day}T00:00:00.000Z`)
    .first<{ n: number }>();
  if ((todayFromIp?.n ?? 0) >= perIpCap) {
    return respond({ ok: false, error: "daily limit reached" }, 429);
  }

  const { kind, message, version, target, arch } = parsed.value;
  const createdAt = now.toISOString();
  const inserted = await env.DB.prepare(
    `INSERT INTO feedback (created_at, kind, message, version, target, arch, ip_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`,
  )
    .bind(createdAt, kind, message, version, target, arch, ipHash)
    .first<{ id: number }>();
  if (!inserted) return respond({ ok: false, error: "storage failed" }, 500);

  const row: FeedbackRow = { id: inserted.id, created_at: createdAt, kind, message, version, target, arch };
  ctx.waitUntil(
    promoteToIssue(env, row, now).catch((e) => {
      console.error("promoteToIssue failed", e instanceof Error ? e.message : e);
    }),
  );

  return respond({ ok: true }, 202);
}

/** Cron: retry rows that never became an issue (GitHub outage, expired PAT, cap). */
export async function retryPendingFeedback(env: Env, limit = 20): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, kind, message, version, target, arch
     FROM feedback WHERE issue_number IS NULL ORDER BY id ASC LIMIT ?1`,
  )
    .bind(limit)
    .all<FeedbackRow>();
  for (const row of results) await promoteToIssue(env, row);
  return results.length;
}
