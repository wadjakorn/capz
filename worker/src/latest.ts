import { type Env, utcDay } from "./env";
import { saltedHash } from "./hash";
import { clampToken, isUuidV4 } from "./validate";

export const INSTALL_HEADER = "x-capz-install";
const UPSTREAM_TTL_SECONDS = 300;

export interface PingFields {
  version: string;
  target: string;
  arch: string;
}

export function pingFieldsFromUrl(url: URL): PingFields {
  return {
    version: clampToken(url.searchParams.get("v")),
    target: clampToken(url.searchParams.get("t")),
    arch: clampToken(url.searchParams.get("a")),
  };
}

/** Record one update check. Identified when a valid install id header is present. */
export async function recordPing(
  env: Env,
  installId: string | null,
  fields: PingFields,
  now: Date = new Date(),
): Promise<void> {
  const day = utcDay(now);
  if (isUuidV4(installId)) {
    const idHash = await saltedHash(installId.toLowerCase(), env.ID_SALT);
    await env.DB.prepare(
      `INSERT INTO pings (day, id_hash, version, target, arch) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(day, id_hash) DO UPDATE SET version = excluded.version, target = excluded.target, arch = excluded.arch`,
    )
      .bind(day, idHash, fields.version, fields.target, fields.arch)
      .run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO anon_pings (day, version, target, arch, n) VALUES (?1, ?2, ?3, ?4, 1)
     ON CONFLICT(day, version, target, arch) DO UPDATE SET n = n + 1`,
  )
    .bind(day, fields.version, fields.target, fields.arch)
    .run();
}

/** GET /latest.json — proxy the signed manifest from gh-pages; count the check on the side. */
export async function handleLatest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const fields = pingFieldsFromUrl(url);
  const installId = request.headers.get(INSTALL_HEADER);

  ctx.waitUntil(
    recordPing(env, installId, fields).catch((e) => {
      console.error("recordPing failed", e instanceof Error ? e.message : e);
    }),
  );

  let upstream: Response;
  try {
    upstream = await fetch(env.UPSTREAM_LATEST, {
      cf: { cacheTtl: UPSTREAM_TTL_SECONDS, cacheEverything: true },
      headers: { "user-agent": "capz-api" },
    });
  } catch (e) {
    console.error("upstream fetch failed", e instanceof Error ? e.message : e);
    return new Response("upstream unavailable", { status: 502 });
  }
  if (!upstream.ok) {
    // A non-200 makes tauri-plugin-updater fall through to the next endpoint.
    return new Response("upstream error", { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
