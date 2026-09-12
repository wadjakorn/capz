import { describe, it, expect, vi } from "vitest";
import {
  buildFeedbackPayload,
  FEEDBACK_MESSAGE_MAX,
  postFeedback,
  validateMessage,
} from "./feedback";

describe("validateMessage", () => {
  it("rejects empty / whitespace", () => {
    expect(validateMessage("")).not.toBeNull();
    expect(validateMessage("   \n ")).not.toBeNull();
  });
  it("rejects over the cap, accepts at the cap", () => {
    expect(validateMessage("x".repeat(FEEDBACK_MESSAGE_MAX + 1))).not.toBeNull();
    expect(validateMessage("x".repeat(FEEDBACK_MESSAGE_MAX))).toBeNull();
  });
});

describe("buildFeedbackPayload", () => {
  it("carries exactly kind, message, version, target, arch and nothing else", () => {
    const p = buildFeedbackPayload({
      kind: "bug",
      message: "  it broke  ",
      version: "0.13.0",
      platform: { target: "darwin", arch: "aarch64" },
    });
    expect(p).toEqual({ kind: "bug", message: "it broke", version: "0.13.0", target: "darwin", arch: "aarch64" });
    expect(Object.keys(p).sort()).toEqual(["arch", "kind", "message", "target", "version"]);
  });
});

describe("postFeedback", () => {
  const payload = { kind: "feature" as const, message: "gif export", version: "0.13.0", target: "windows", arch: "x86_64" };

  it("posts JSON and resolves ok on 202", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202 }));
    const r = await postFeedback(payload, fetchImpl as unknown as typeof fetch, "https://x/feedback");
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x/feedback");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(JSON.stringify(init.body)).not.toMatch(/install/i);
  });

  it("surfaces the server error message on 400", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "message is empty" }), { status: 400 }));
    const r = await postFeedback(payload, fetchImpl as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: "message is empty" });
  });

  it("maps 429 to a friendly message", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 429 }));
    const r = await postFeedback(payload, fetchImpl as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/try again later/i);
  });

  it("returns ok:false when the network throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const r = await postFeedback(payload, fetchImpl as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: "Failed to fetch" });
  });
});
