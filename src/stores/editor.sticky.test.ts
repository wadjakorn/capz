import { describe, it, expect } from "vitest";
import { isStickyTool, type Tool } from "./editor";
import { DEFAULT_CONFIG, type KeepToolActive } from "@/lib/config";
import { STICKY_TOOLS } from "@/lib/stickyTools";

const ALL_ON = DEFAULT_CONFIG.general.keepToolActive;

describe("isStickyTool", () => {
  it.each(STICKY_TOOLS.map((t) => t.id))("%s follows its own flag", (id) => {
    expect(isStickyTool(id, ALL_ON)).toBe(true);
    expect(isStickyTool(id, { ...ALL_ON, [id]: false })).toBe(false);
  });

  it("flags are independent per tool", () => {
    const keep: KeepToolActive = { ...ALL_ON, rect: false };
    expect(isStickyTool("rect", keep)).toBe(false);
    expect(isStickyTool("text", keep)).toBe(true);
  });

  it.each(["select", "crop"] as Tool[])("%s is never sticky", (t) => {
    expect(isStickyTool(t, ALL_ON)).toBe(false);
  });

  it("treats a missing key as sticky", () => {
    const partial = { ...ALL_ON } as Partial<KeepToolActive>;
    delete partial.rect;
    expect(isStickyTool("rect", partial as KeepToolActive)).toBe(true);
  });
});
