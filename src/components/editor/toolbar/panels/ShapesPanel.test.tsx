// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShapesPanel } from "./ShapesPanel";

afterEach(cleanup);

const base = {
  colorCtx: null,
  widthCtx: null,
  cornerCtx: null,
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
