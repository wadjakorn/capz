// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextPanel } from "./TextPanel";
import type { TextEffectsCtx, TextStyleCtx } from "./types";

afterEach(cleanup);

function tsc(effects?: Partial<TextEffectsCtx>): TextStyleCtx {
  return {
    fontStyle: "normal",
    textDecoration: "",
    fontFamily: "sans-serif",
    backgroundColor: null,
    bgPadding: 14,
    align: "left",
    lineHeight: 1.35,
    setFontStyle: vi.fn(),
    setTextDecoration: vi.fn(),
    setFontFamily: vi.fn(),
    setBackgroundColor: vi.fn(),
    setBgPadding: vi.fn(),
    setAlign: vi.fn(),
    setLineHeight: vi.fn(),
    effects: effects && {
      outlineColor: null,
      outlineWidth: 3,
      shadow: false,
      setOutlineOn: vi.fn(),
      setOutlineColor: vi.fn(),
      setOutlineWidth: vi.fn(),
      setShadow: vi.fn(),
      ...effects,
    },
  };
}

const props = {
  sizeCtx: null,
  colorCtx: null,
  colorInputRef: { current: null },
  lastBgColor: "#ffffff",
  setLastBgColor: vi.fn(),
};

describe("TextPanel outline + shadow (CP-0106)", () => {
  it("hides the effects without a selected text", () => {
    render(<TextPanel {...props} textStyleCtx={tsc()} />);
    expect(screen.queryByRole("button", { name: "Outline off" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Shadow off" })).toBeNull();
  });

  it("turns the outline on; width + colour only show when on", () => {
    const setOutlineOn = vi.fn();
    render(<TextPanel {...props} textStyleCtx={tsc({ setOutlineOn })} />);
    expect(screen.queryByTitle("Outline color")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Outline off" }));
    expect(setOutlineOn).toHaveBeenCalledWith(true);
  });

  it("shows colour and width while the outline is on, and turns it off", () => {
    const setOutlineOn = vi.fn();
    const setOutlineColor = vi.fn();
    render(
      <TextPanel {...props}
        textStyleCtx={tsc({ outlineColor: "#000000", outlineWidth: 5, setOutlineOn, setOutlineColor })} />,
    );
    const swatch = screen.getByTitle("Outline color") as HTMLInputElement;
    expect(swatch.value).toBe("#000000");
    fireEvent.change(swatch, { target: { value: "#ff0000" } });
    expect(setOutlineColor).toHaveBeenCalledWith("#ff0000");
    expect(screen.getByText("Width")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Outline on" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn);
    expect(setOutlineOn).toHaveBeenCalledWith(false);
  });

  it("toggles the shadow", () => {
    const setShadow = vi.fn();
    render(<TextPanel {...props} textStyleCtx={tsc({ setShadow })} />);
    fireEvent.click(screen.getByRole("button", { name: "Shadow off" }));
    expect(setShadow).toHaveBeenCalledWith(true);
  });
});
