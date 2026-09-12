import { describe, expect, it } from "vitest";
import { saltedHash } from "./hash";

describe("saltedHash", () => {
  it("is deterministic 64-char lowercase hex", async () => {
    const a = await saltedHash("9b2f4c1e-3d5a-4b7c-8e9f-0a1b2c3d4e5f", "salt");
    const b = await saltedHash("9b2f4c1e-3d5a-4b7c-8e9f-0a1b2c3d4e5f", "salt");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes with the salt and with the input", async () => {
    const base = await saltedHash("id", "salt-1");
    expect(await saltedHash("id", "salt-2")).not.toBe(base);
    expect(await saltedHash("id2", "salt-1")).not.toBe(base);
  });
  it("does not reveal the input", async () => {
    const h = await saltedHash("9b2f4c1e-3d5a-4b7c-8e9f-0a1b2c3d4e5f", "salt");
    expect(h).not.toContain("9b2f4c1e");
  });
});
