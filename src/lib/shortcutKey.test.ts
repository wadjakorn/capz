import { describe, it, expect } from "vitest";
import { shortcutKey } from "./shortcutKey";

const ev = (key: string, code: string, opts: KeyboardEventInit = {}) =>
  ({ key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...opts }) as KeyboardEvent;

describe("shortcutKey (CP-0061)", () => {
  it("maps Thai letters to the physical Latin key", () => {
    expect(shortcutKey(ev("ผ", "KeyZ", { ctrlKey: true }))).toBe("z");
    expect(shortcutKey(ev("ั", "KeyY", { ctrlKey: true }))).toBe("y");
    expect(shortcutKey(ev("ก", "KeyD", { metaKey: true }))).toBe("d");
    expect(shortcutKey(ev("พ", "KeyR"))).toBe("r");
  });

  it("maps Thai digit-row and punctuation keys", () => {
    expect(shortcutKey(ev("จ", "Digit0", { ctrlKey: true }))).toBe("0");
    expect(shortcutKey(ev("ๅ", "Digit1", { ctrlKey: true }))).toBe("1");
    expect(shortcutKey(ev("ข", "Minus"))).toBe("-");
    expect(shortcutKey(ev("ช", "Equal"))).toBe("=");
    expect(shortcutKey(ev("บ", "BracketLeft"))).toBe("[");
    expect(shortcutKey(ev("ล", "BracketRight"))).toBe("]");
  });

  it("maps Ctrl+Shift+letter when the layout types ASCII punctuation (Thai Shift+Z = '(')", () => {
    expect(shortcutKey(ev("(", "KeyZ", { ctrlKey: true, shiftKey: true }))).toBe("z");
  });

  it("leaves bare Shift+punctuation alone", () => {
    expect(shortcutKey(ev("(", "KeyZ", { shiftKey: true }))).toBe("(");
  });

  it("passes Latin layouts and named keys through unchanged", () => {
    expect(shortcutKey(ev("z", "KeyZ", { ctrlKey: true }))).toBe("z");
    expect(shortcutKey(ev("Z", "KeyZ", { ctrlKey: true, shiftKey: true }))).toBe("Z");
    expect(shortcutKey(ev("a", "KeyQ"))).toBe("a"); // AZERTY
    expect(shortcutKey(ev(";", "KeyZ", { ctrlKey: true }))).toBe(";"); // Dvorak
    expect(shortcutKey(ev("-", "Digit3", { ctrlKey: true }))).toBe("-");
    expect(shortcutKey(ev("Escape", "Escape"))).toBe("Escape");
    expect(shortcutKey(ev("ArrowLeft", "ArrowLeft"))).toBe("ArrowLeft");
  });

  it("leaves Alt/Option combos alone", () => {
    expect(shortcutKey(ev("Ω", "KeyZ", { altKey: true }))).toBe("Ω");
    expect(shortcutKey(ev("ผ", "KeyZ", { ctrlKey: true, altKey: true }))).toBe("ผ");
  });

  it("keeps e.key when the physical code is unknown", () => {
    expect(shortcutKey(ev("ผ", ""))).toBe("ผ");
    expect(shortcutKey(ev("ฃ", "Backslash"))).toBe("ฃ");
  });
});
