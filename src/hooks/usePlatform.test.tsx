// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePlatform } from "./usePlatform";

describe("usePlatform (CP-0059)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports mac after mount on a Mac", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const { result } = renderHook(() => usePlatform());
    expect(result.current).toBe("mac");
  });

  it("reports win elsewhere", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    const { result } = renderHook(() => usePlatform());
    expect(result.current).toBe("win");
  });
});
