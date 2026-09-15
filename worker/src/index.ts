import type { Env } from "./env";
import { handleFeedback, handleFeedbackPreflight, retryPendingFeedback } from "./feedback";
import { handleLatest } from "./latest";
import { handleStats } from "./stats";

const RETENTION_DAYS = 400;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/latest.json" && request.method === "GET") {
      return handleLatest(request, env, ctx);
    }
    if (pathname === "/feedback") {
      if (request.method === "OPTIONS") return handleFeedbackPreflight();
      if (request.method === "POST") return handleFeedback(request, env, ctx);
      return new Response("method not allowed", { status: 405 });
    }
    if (pathname === "/stats" && request.method === "GET") {
      return handleStats(request, env);
    }
    if (pathname === "/" || pathname === "/healthz") {
      return new Response("capz-api ok", { status: 200 });
    }
    return new Response("not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        await env.DB.batch([
          env.DB.prepare(`DELETE FROM pings WHERE day < date('now', ?1)`).bind(`-${RETENTION_DAYS} days`),
          env.DB.prepare(`DELETE FROM anon_pings WHERE day < date('now', ?1)`).bind(`-${RETENTION_DAYS} days`),
        ]);
        const retried = await retryPendingFeedback(env);
        console.log(`scheduled: pruned >${RETENTION_DAYS}d, retried ${retried} pending feedback`);
      })(),
    );
  },
};
