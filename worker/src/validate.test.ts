import { describe, expect, it } from "vitest";
import { clampToken, isUuidV4, MESSAGE_MAX, parseFeedbackBody } from "./validate";

describe("isUuidV4", () => {
  it("accepts a v4 uuid in either case", () => {
    expect(isUuidV4("9b2f4c1e-3d5a-4b7c-8e9f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuidV4("9B2F4C1E-3D5A-4B7C-8E9F-0A1B2C3D4E5F")).toBe(true);
  });
  it("rejects non-v4, malformed, empty and null", () => {
    expect(isUuidV4("9b2f4c1e-3d5a-1b7c-8e9f-0a1b2c3d4e5f")).toBe(false); // version 1
    expect(isUuidV4("9b2f4c1e-3d5a-4b7c-0e9f-0a1b2c3d4e5f")).toBe(false); // bad variant
    expect(isUuidV4("not-a-uuid")).toBe(false);
    expect(isUuidV4("")).toBe(false);
    expect(isUuidV4(null)).toBe(false);
    expect(isUuidV4(undefined)).toBe(false);
  });
});

describe("clampToken", () => {
  it("keeps version-like tokens", () => {
    expect(clampToken("0.12.0")).toBe("0.12.0");
    expect(clampToken("x86_64")).toBe("x86_64");
    expect(clampToken("1.0.0-beta+build.7")).toBe("1.0.0-beta+build.7");
  });
  it("strips unsafe characters and truncates", () => {
    expect(clampToken("dar win;drop table")).toBe("darwindroptable");
    expect(clampToken("a".repeat(100))).toHaveLength(32);
    expect(clampToken(null)).toBe("");
    expect(clampToken(42)).toBe("");
  });
});

describe("parseFeedbackBody", () => {
  const valid = { kind: "bug", message: "  it crashed  ", version: "0.12.0", target: "darwin", arch: "aarch64" };

  it("accepts a valid body and trims the message", () => {
    const r = parseFeedbackBody(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ kind: "bug", message: "it crashed", version: "0.12.0", target: "darwin", arch: "aarch64" });
    }
  });
  it("accepts a feature with missing metadata", () => {
    const r = parseFeedbackBody({ kind: "feature", message: "add gif" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ kind: "feature", version: "", target: "", arch: "" });
  });
  it("rejects non-objects", () => {
    expect(parseFeedbackBody(null).ok).toBe(false);
    expect(parseFeedbackBody("hi").ok).toBe(false);
    expect(parseFeedbackBody([]).ok).toBe(false);
  });
  it("rejects a bad kind", () => {
    const r = parseFeedbackBody({ ...valid, kind: "praise" });
    expect(r).toEqual({ ok: false, error: "kind must be 'bug' or 'feature'" });
  });
  it("rejects empty, non-string and oversized messages", () => {
    expect(parseFeedbackBody({ ...valid, message: "   " }).ok).toBe(false);
    expect(parseFeedbackBody({ ...valid, message: 7 }).ok).toBe(false);
    expect(parseFeedbackBody({ ...valid, message: "x".repeat(MESSAGE_MAX + 1) }).ok).toBe(false);
    expect(parseFeedbackBody({ ...valid, message: "x".repeat(MESSAGE_MAX) }).ok).toBe(true);
  });
  it("clamps oversized metadata instead of rejecting", () => {
    const r = parseFeedbackBody({ ...valid, version: "9".repeat(200) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.version).toHaveLength(32);
  });
});
