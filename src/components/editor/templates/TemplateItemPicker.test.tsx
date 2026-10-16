// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TemplateSelection } from "@/lib/template";
import { TemplateItemPicker } from "./TemplateItemPicker";
import type { PickerItem } from "./pickerItems";

afterEach(cleanup);

const blurs: PickerItem[] = ["b3", "b2", "b1"].map((id) => ({
  kind: "annotation",
  id,
  type: "blur",
}));
const sel = (ids: string[], over: Partial<TemplateSelection> = {}): TemplateSelection => ({
  crop: false,
  backdropOn: false,
  backdropLook: false,
  annotationIds: new Set(ids),
  ...over,
});

describe("TemplateItemPicker", () => {
  it("3 blurs collapse; group checkbox toggles all three", () => {
    const onChange = vi.fn();
    render(<TemplateItemPicker items={blurs} value={sel([])} onChange={onChange} />);
    expect(screen.getByText("Blurs (3)")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3); // All + Annotations + group
    fireEvent.click(screen.getByRole("checkbox", { name: "Blurs (3)" }));
    expect([...onChange.mock.calls[0][0].annotationIds].sort()).toEqual(["b1", "b2", "b3"]);
  });

  it("All is indeterminate when partial", () => {
    render(<TemplateItemPicker items={blurs} value={sel(["b1"])} onChange={vi.fn()} />);
    const all = screen.getByRole("checkbox", { name: "All" }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    expect(all.checked).toBe(false);
  });

  it('backdrop row shows "Backdrop: off"', () => {
    render(
      <TemplateItemPicker
        items={[{ kind: "backdropOn", value: false }]}
        value={sel([], { backdropOn: true })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Backdrop: off")).toBeTruthy();
  });

  it("hover calls onHover(id) then onHover(null)", () => {
    const onHover = vi.fn();
    const items: PickerItem[] = [{ kind: "annotation", id: "r1", type: "rect" }];
    render(<TemplateItemPicker items={items} value={sel([])} onChange={vi.fn()} onHover={onHover} />);
    const row = screen.getByRole("treeitem", { name: "Rectangle" });
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    expect(onHover.mock.calls).toEqual([["r1"], [null]]);
  });

  it("Space toggles; →/← expand/collapse a group", () => {
    const onChange = vi.fn();
    const items: PickerItem[] = [
      { kind: "annotation", id: "r1", type: "rect" },
      ...blurs,
    ];
    render(<TemplateItemPicker items={items} value={sel([])} onChange={onChange} />);
    const row = screen.getByRole("treeitem", { name: "Blurs (3)" });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(row, { key: "ArrowRight" });
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("treeitem")).toHaveLength(5);
    fireEvent.keyDown(row, { key: "ArrowLeft" });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(row, { key: " " });
    expect([...onChange.mock.calls[0][0].annotationIds].sort()).toEqual(["b1", "b2", "b3"]);
    const single = screen.getByRole("treeitem", { name: "Rectangle" });
    fireEvent.keyDown(single, { key: " " });
    expect([...onChange.mock.calls[1][0].annotationIds]).toEqual(["r1"]);
  });

  it("Annotations group checkbox toggles all and is indeterminate when partial", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TemplateItemPicker items={blurs} value={sel(["b1"])} onChange={onChange} />,
    );
    const box = screen.getByRole("checkbox", { name: "Annotations" }) as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    fireEvent.click(box);
    expect([...onChange.mock.calls[0][0].annotationIds].sort()).toEqual(["b1", "b2", "b3"]);
    rerender(
      <TemplateItemPicker items={blurs} value={sel(["b1", "b2", "b3"])} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Annotations" }));
    expect([...onChange.mock.calls[1][0].annotationIds]).toEqual([]);
  });

  it("backdrop look row carries the changes-all warning", () => {
    const look = {
      style: "solid", presetId: "sunset", solidColor: "#000", padding: 1, cornerRadius: 1, shadow: true,
    } as never;
    render(
      <TemplateItemPicker
        items={[{ kind: "backdropLook", look }]}
        value={sel([])}
        onChange={vi.fn()}
      />,
    );
    const row = screen.getByRole("treeitem", { name: "Backdrop look" });
    expect(row.textContent).toContain("⚠ Changes all images");
  });
});
