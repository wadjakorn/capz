import { describe, it, expect } from "vitest";
import {
  eventToAccelerator,
  validateAccelerator,
  isOsOwned,
  statusMessage,
} from "./shortcuts";

function evt(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: "",
    code: "",
    ...init,
  } as KeyboardEvent;
}

describe("eventToAccelerator", () => {
  it("tokenizes Space as 'Space', not a literal space", () => {
    const r = eventToAccelerator(
      evt({ ctrlKey: true, shiftKey: true, key: " ", code: "Space" }),
      "win",
    );
    expect(r).toEqual({ ok: true, accel: "CmdOrCtrl+Shift+Space" });
  });

  it("rejects the Win key on Windows", () => {
    const r = eventToAccelerator(
      evt({ metaKey: true, shiftKey: true, key: "S", code: "KeyS" }),
      "win",
    );
    expect(r).toEqual({ ok: false, reason: "win" });
  });

  it("maps Cmd to CmdOrCtrl on macOS", () => {
    const r = eventToAccelerator(
      evt({ metaKey: true, shiftKey: true, key: "A", code: "KeyA" }),
      "mac",
    );
    expect(r).toEqual({ ok: true, accel: "CmdOrCtrl+Shift+A" });
  });

  it("returns the no-modifier signal when only a key is pressed", () => {
    const r = eventToAccelerator(evt({ key: "A", code: "KeyA" }), "win");
    expect(r).toEqual({ ok: false, reason: "none" });
  });

  it("ignores modifier-only presses", () => {
    expect(
      eventToAccelerator(evt({ ctrlKey: true, key: "Control", code: "ControlLeft" }), "win"),
    ).toBeNull();
  });
});

describe("validateAccelerator", () => {
  it("accepts a normal combo", () => {
    expect(validateAccelerator("CmdOrCtrl+Shift+A", "win")).toEqual({ ok: true });
  });
  it("rejects a bare key", () => {
    expect(validateAccelerator("A", "win")).toEqual({ ok: false, reason: "no-modifier" });
  });
  it("rejects an empty/trailing token", () => {
    expect(validateAccelerator("CmdOrCtrl+Shift+", "win")).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects the Win key on Windows", () => {
    expect(validateAccelerator("Super+Shift+S", "win")).toEqual({ ok: false, reason: "win" });
  });
  // CP-0037(a): OS-owned combos are allowed with a warning instead of refused,
  // so the user can bind them after disabling the system shortcut.
  it("allows an OS-owned combo but flags it", () => {
    expect(validateAccelerator("Alt+Tab", "win")).toEqual({ ok: true, warning: "os-owned" });
    expect(validateAccelerator("CmdOrCtrl+Shift+3", "mac")).toEqual({
      ok: true,
      warning: "os-owned",
    });
  });

  // CP-0037(a): F13-F20 are the one bare-key exemption.
  it("accepts bare F13-F20 but no other bare key", () => {
    for (const k of ["F13", "F20"]) expect(validateAccelerator(k, "mac")).toEqual({ ok: true });
    for (const k of ["F12", "F21"]) {
      expect(validateAccelerator(k, "mac")).toEqual({ ok: false, reason: "no-modifier" });
    }
  });
});

describe("statusMessage", () => {
  it("returns null for ok and copy for failures", () => {
    expect(statusMessage("X", "ok")).toBeNull();
    expect(statusMessage("Ctrl+Shift+A", "taken")).toMatch(/another app/);
    expect(statusMessage("Ctrl+Shift+A", "invalid")).toMatch(/valid/);
  });
});

describe("isOsOwned", () => {
  it("uses the Windows set on win", () => {
    expect(isOsOwned("Alt+Tab", "win")).toBe(true);
    expect(isOsOwned("CmdOrCtrl+Space", "win")).toBe(false);
  });
  it("uses the macOS set on mac", () => {
    expect(isOsOwned("CmdOrCtrl+Space", "mac")).toBe(true);
  });
});
