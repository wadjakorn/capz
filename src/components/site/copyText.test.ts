// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copyText";

afterEach(() => vi.restoreAllMocks());

describe("copyText", () => {
  it("uses the Clipboard API when it exists", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("brew install x")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("brew install x");
  });

  it("falls back to execCommand when the page isn't a secure context", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec;
    expect(await copyText("sudo xattr")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
