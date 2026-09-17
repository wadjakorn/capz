import { describe, it, expect } from "vitest";
import { isStickyTool, type Tool } from "./editor";

describe("isStickyTool", () => {
  const optional: Tool[] = ["rect", "arrow", "text", "blur", "magnify", "sticker"];
  const always: Tool[] = ["pen", "highlighter", "pin"];
  const never: Tool[] = ["select", "crop"];

  it.each(optional)("%s follows the keepToolActive setting", (t) => {
    expect(isStickyTool(t, true)).toBe(true);
    expect(isStickyTool(t, false)).toBe(false);
  });

  it.each(always)("%s is always sticky", (t) => {
    expect(isStickyTool(t, true)).toBe(true);
    expect(isStickyTool(t, false)).toBe(true);
  });

  it.each(never)("%s is never sticky", (t) => {
    expect(isStickyTool(t, true)).toBe(false);
    expect(isStickyTool(t, false)).toBe(false);
  });
});
