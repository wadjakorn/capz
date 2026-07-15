import { afterEach, describe, expect, it, vi } from "vitest";
import { uid } from "./uid";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses crypto.randomUUID when available", () => {
    const randomUUID = vi.fn(() => "11111111-1111-4111-8111-111111111111");
    vi.stubGlobal("crypto", { randomUUID });
    expect(uid()).toBe("11111111-1111-4111-8111-111111111111");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("falls back to getRandomValues in an insecure context (no randomUUID)", () => {
    // Simulate http://<lan-ip> — crypto exists but randomUUID does not.
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 5) & 0xff;
      return arr;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    const id = uid();
    expect(id).toMatch(UUID_RE);
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it("falls back to Math.random when crypto is entirely absent", () => {
    vi.stubGlobal("crypto", undefined);
    expect(uid()).toMatch(UUID_RE);
  });

  it("produces unique values across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(uid());
    expect(seen.size).toBe(1000);
  });
});
