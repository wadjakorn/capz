export const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(s: string | null | undefined): s is string {
  return typeof s === "string" && UUID_V4_RE.test(s);
}

/** Clamp an untrusted short string (version / target / arch) to a safe token. */
export function clampToken(s: unknown, max = 32): string {
  if (typeof s !== "string") return "";
  return s.replace(/[^A-Za-z0-9._+-]/g, "").slice(0, max);
}

export type FeedbackKind = "bug" | "feature";

export interface FeedbackBody {
  kind: FeedbackKind;
  message: string;
  version: string;
  target: string;
  arch: string;
}

export const MESSAGE_MAX = 4000;

export type ParseResult =
  | { ok: true; value: FeedbackBody }
  | { ok: false; error: string };

export function parseFeedbackBody(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.kind !== "bug" && o.kind !== "feature") {
    return { ok: false, error: "kind must be 'bug' or 'feature'" };
  }
  if (typeof o.message !== "string") {
    return { ok: false, error: "message must be a string" };
  }
  const message = o.message.trim();
  if (message.length === 0) return { ok: false, error: "message is empty" };
  if (message.length > MESSAGE_MAX) {
    return { ok: false, error: `message exceeds ${MESSAGE_MAX} characters` };
  }
  return {
    ok: true,
    value: {
      kind: o.kind,
      message,
      version: clampToken(o.version),
      target: clampToken(o.target),
      arch: clampToken(o.arch),
    },
  };
}
