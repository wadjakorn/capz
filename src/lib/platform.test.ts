import { describe, it, expect, afterEach, vi } from "vitest";
import { isTauriRuntime } from "./platform";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isTauriRuntime", () => {
  it("returns false when window is undefined (SSR/node)", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("returns false in a plain browser window", () => {
    vi.stubGlobal("window", {});
    expect(isTauriRuntime()).toBe(false);
  });

  it("returns true when Tauri internals are injected", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    expect(isTauriRuntime()).toBe(true);
  });
});
