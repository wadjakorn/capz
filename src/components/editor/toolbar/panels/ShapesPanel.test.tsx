// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShapesPanel } from "./ShapesPanel";

afterEach(cleanup);

const base = {
  colorCtx: null,
  widthCtx: null,
  cornerCtx: null,
  dimCtx: null,
  colorInputRef: { current: null },
  selected: false,
};

describe("ShapesPanel stroke style (CP-0076)", () => {
  it("offers rect/circle/line only — no dashed-line shape", () => {
    render(<ShapesPanel {...base} rectShapeCtx={{ value: "rect", onChange: vi.fn() }} strokeStyleCtx={null} />);
    expect(screen.getByRole("button", { name: "Line" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dashed line" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dotted" })).toBeNull();
  });

  it("picks a stroke style", () => {
    const onChange = vi.fn();
    render(<ShapesPanel {...base} rectShapeCtx={null} strokeStyleCtx={{ value: "solid", onChange }} />);
    fireEvent.click(screen.getByRole("button", { name: "Dotted" }));
    expect(onChange).toHaveBeenCalledWith("dotted");
    // A selected shape hides the shape picker but keeps the style picker.
    expect(screen.queryByRole("button", { name: "Line" })).toBeNull();
    expect(screen.getByRole("button", { name: "Dashed" })).toBeTruthy();
  });
});

describe("ShapesPanel spotlight dim (CP-0095)", () => {
  const dim = (over = {}) => ({
    on: false,
    level: "medium" as const,
    setOn: vi.fn(),
    setLevel: vi.fn(),
    ...over,
  });

  it("is absent without a dim context (line)", () => {
    render(<ShapesPanel {...base} rectShapeCtx={null} strokeStyleCtx={null} />);
    expect(screen.queryByRole("button", { name: "Dim everything around this shape" })).toBeNull();
  });

  it("toggles dim and hides the levels while off", () => {
    const ctx = dim();
    render(<ShapesPanel {...base} rectShapeCtx={null} strokeStyleCtx={null} dimCtx={ctx} />);
    const toggle = screen.getByRole("button", { name: "Dim everything around this shape" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: "Medium" })).toBeNull();
    fireEvent.click(toggle);
    expect(ctx.setOn).toHaveBeenCalledWith(true);
  });

  it("shows the three levels with the current one pressed, and picks a level", () => {
    const ctx = dim({ on: true });
    render(<ShapesPanel {...base} rectShapeCtx={null} strokeStyleCtx={null} dimCtx={ctx} />);
    expect(screen.getByRole("button", { name: "Medium" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Strong" }));
    expect(ctx.setLevel).toHaveBeenCalledWith("strong");
  });
});
