import { describe, expect, it } from "vitest";
import { pickMacAsset, pickWindowsAsset } from "./use-latest-release";

// Asset names as published on the v0.15.0 release.
const assets = [
  "capz_0.15.0_aarch64.dmg",
  "capz_0.15.0_x64-setup.exe",
  "capz_0.15.0_x64-setup.exe.sig",
  "capz_0.15.0_x64.dmg",
  "capz_0.15.0_x64_en-US.msi",
  "capz_aarch64.app.tar.gz",
  "capz_x64.app.tar.gz",
  "latest.json",
].map((name) => ({ name, browser_download_url: `https://example.test/${name}` }));

describe("release asset picking", () => {
  it("picks the Apple Silicon and Intel .dmg separately", () => {
    expect(pickMacAsset(assets, "aarch64")).toBe("https://example.test/capz_0.15.0_aarch64.dmg");
    expect(pickMacAsset(assets, "x64")).toBe("https://example.test/capz_0.15.0_x64.dmg");
  });

  it("picks the Windows setup .exe, not its signature", () => {
    expect(pickWindowsAsset(assets)).toBe("https://example.test/capz_0.15.0_x64-setup.exe");
  });

  it("returns undefined when the release has no matching asset", () => {
    expect(pickMacAsset([], "aarch64")).toBeUndefined();
    expect(pickMacAsset(undefined, "x64")).toBeUndefined();
  });
});
