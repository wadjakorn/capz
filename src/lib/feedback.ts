import { isTauriRuntime } from "@/lib/platform";

/**
 * Anonymous bug / feature reports (Settings → Feedback).
 *
 * What leaves the machine: the kind, the text the user typed, the app
 * version, OS name and CPU arch. Deliberately NOT included: the install id
 * (so reports can never be joined to the active-install count), contact
 * details, logs, or screenshots. See worker/README.md for the receiving side.
 */
export const FEEDBACK_ENDPOINT = "https://capz-api.banana3339.workers.dev/feedback";
export const FEEDBACK_MESSAGE_MAX = 4000;
export const GITHUB_ISSUES_URL = "https://github.com/wadjakorn/capz/issues";

export type FeedbackKind = "bug" | "feature";

/** Mirrors `commands::system::PlatformInfo` in src-tauri (hand-written, keep in sync). */
export interface PlatformInfo {
  target: string;
  arch: string;
}

export interface FeedbackPayload {
  kind: FeedbackKind;
  message: string;
  version: string;
  target: string;
  arch: string;
}

export type SendResult = { ok: true } | { ok: false; error: string };

/** Returns an error string, or null when the message is sendable. */
export function validateMessage(raw: string): string | null {
  const msg = raw.trim();
  if (msg.length === 0) return "Write a few words first.";
  if (msg.length > FEEDBACK_MESSAGE_MAX) {
    return `Keep it under ${FEEDBACK_MESSAGE_MAX.toLocaleString()} characters.`;
  }
  return null;
}

export function buildFeedbackPayload(input: {
  kind: FeedbackKind;
  message: string;
  version: string;
  platform: PlatformInfo;
}): FeedbackPayload {
  return {
    kind: input.kind,
    message: input.message.trim(),
    version: input.version,
    target: input.platform.target,
    arch: input.platform.arch,
  };
}

async function collectContext(): Promise<{ version: string; platform: PlatformInfo }> {
  const [{ getVersion }, { invoke }] = await Promise.all([
    import("@tauri-apps/api/app"),
    import("@tauri-apps/api/core"),
  ]);
  const [version, platform] = await Promise.all([
    getVersion(),
    invoke<PlatformInfo>("platform_info"),
  ]);
  return { version, platform };
}

export async function postFeedback(
  payload: FeedbackPayload,
  fetchImpl: typeof fetch = fetch,
  endpoint: string = FEEDBACK_ENDPOINT,
): Promise<SendResult> {
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    let error = `Server replied ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) error = body.error;
    } catch {
      // non-JSON error body; keep the status text
    }
    if (res.status === 429) error = "You have sent a few already. Try again later.";
    return { ok: false, error };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort|timeout/i.test(msg) ? "Timed out." : msg };
  }
}

/** Desktop only. Gathers version + platform, then posts. */
export async function sendFeedback(input: { kind: FeedbackKind; message: string }): Promise<SendResult> {
  const invalid = validateMessage(input.message);
  if (invalid) return { ok: false, error: invalid };
  if (!isTauriRuntime()) return { ok: false, error: "Feedback is only available in the desktop app." };
  const ctx = await collectContext();
  return postFeedback(buildFeedbackPayload({ ...input, ...ctx }));
}
