import { describe, expect, it } from "vitest";
import {
  bumpCargoLockPackage,
  bumpCargoTomlPackage,
  cargoPackageName,
  nextVersion,
} from "./release-lib.mjs";

const TOML = `[package]
name = "app"
version = "0.16.0"
edition = "2021"

[dependencies]
serde = { version = "1.0.0" }
`;

const LOCK = `version = 4

[[package]]
name = "anyhow"
version = "0.16.0"

[[package]]
name = "app"
version = "0.16.0"
dependencies = [
 "anyhow",
]

[[package]]
name = "apply"
version = "0.16.0"
`;

describe("nextVersion", () => {
  it("bumps patch, minor and major", () => {
    expect(nextVersion("0.16.0", "patch")).toBe("0.16.1");
    expect(nextVersion("0.16.3", "minor")).toBe("0.17.0");
    expect(nextVersion("0.16.3", "major")).toBe("1.0.0");
  });
  it("accepts an explicit version", () => {
    expect(nextVersion("0.16.0", "2.0.0")).toBe("2.0.0");
  });
  it("rejects an unknown bump", () => {
    expect(() => nextVersion("0.16.0", "huge")).toThrow(/unknown bump/);
  });
});

describe("Cargo.toml", () => {
  it("reads the package name", () => {
    expect(cargoPackageName(TOML)).toBe("app");
  });
  it("bumps only the [package] version", () => {
    const out = bumpCargoTomlPackage(TOML, "0.17.0");
    expect(out).toContain('name = "app"\nversion = "0.17.0"');
    expect(out).toContain('serde = { version = "1.0.0" }');
  });
});

describe("Cargo.lock", () => {
  it("bumps only the named package entry", () => {
    const out = bumpCargoLockPackage(LOCK, "app", "0.17.0");
    expect(out).toContain('name = "app"\nversion = "0.17.0"');
    // Same version string on neighbouring packages is left alone.
    expect(out).toContain('name = "anyhow"\nversion = "0.16.0"');
    expect(out).toContain('name = "apply"\nversion = "0.16.0"');
  });
  it("throws when the package is missing", () => {
    expect(() => bumpCargoLockPackage(LOCK, "nope", "0.17.0")).toThrow(/nope/);
  });
});
