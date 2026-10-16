// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditTemplate } from "@/lib/template";

const applyTemplateTo = vi.fn(() => ({
  applied: 1,
  skipped: 0,
  cropSkipped: 0,
  scaleMismatch: 0,
  aborted: false,
  previousLook: null,
}));
const showApplyToast = vi.fn();
vi.mock("@/lib/applyTemplateTo", () => ({
  ACTIVE: "active",
  applyTemplateTo: (...a: unknown[]) => (applyTemplateTo as (...x: unknown[]) => unknown)(...a),
  showApplyToast: (...a: unknown[]) => showApplyToast(...a),
}));

import { useEditor } from "@/stores/editor";
import { useWorkspaces } from "@/stores/workspaces";
import { setStageSourceSize } from "@/lib/stageBridge";
import { TemplateCard } from "./TemplateCard";

const tpl: EditTemplate = {
  id: "t1",
  name: "Blur email",
  createdAt: 1,
  sourceSize: { w: 800, h: 600 },
  backdropOn: true,
  backdropLook: {
    style: "gradient",
    presetId: "slate",
    solidColor: "#000",
    padding: 40,
    cornerRadius: 12,
    shadow: true,
  } as EditTemplate["backdropLook"],
  annotations: [
    { id: "a1", type: "blur", x: 0, y: 0, w: 10, h: 10 } as unknown as EditTemplate["annotations"][number],
  ],
  thumb: "data:image/png;base64,xx",
};

beforeEach(() => {
  vi.useFakeTimers();
  applyTemplateTo.mockClear();
  showApplyToast.mockClear();
  useEditor.setState({ hasImage: true });
  useWorkspaces.setState({ activeId: null });
  setStageSourceSize({ w: 100, h: 100 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mk = (over = {}) =>
  render(<TemplateCard tpl={tpl} onRename={vi.fn()} onDelete={vi.fn()} {...over} />);

describe("TemplateCard", () => {
  it("Apply to this passes picker defaults (backdropLook false)", () => {
    mk();
    fireEvent.click(screen.getByRole("button", { name: "Apply to this" }));
    expect(applyTemplateTo).toHaveBeenCalledTimes(1);
    const [ids, t, sel, cfs] = applyTemplateTo.mock.calls[0] as unknown as [
      string[],
      EditTemplate,
      { backdropLook: boolean; backdropOn: boolean; annotationIds: Set<string> },
      unknown,
    ];
    expect(ids).toEqual(["active"]);
    expect(t).toBe(tpl);
    expect(sel.backdropLook).toBe(false);
    expect(sel.backdropOn).toBe(true);
    expect([...sel.annotationIds]).toEqual(["a1"]);
    expect(cfs).toBeNull();
    expect(showApplyToast).toHaveBeenCalledTimes(1);
  });

  it("targets the active workspace id when there is one", () => {
    useWorkspaces.setState({ activeId: "w9" });
    mk();
    fireEvent.click(screen.getByRole("button", { name: "Apply to this" }));
    expect((applyTemplateTo.mock.calls[0] as unknown[])[0]).toEqual(["w9"]);
  });

  it("disabled without image", () => {
    useEditor.setState({ hasImage: false });
    mk();
    expect((screen.getByRole("button", { name: "Apply to this" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disabled until the stage source size is known", () => {
    setStageSourceSize(null);
    mk();
    expect((screen.getByRole("button", { name: "Apply to this" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("double click within 400 ms applies once", () => {
    mk();
    const b = screen.getByRole("button", { name: "Apply to this" });
    fireEvent.click(b);
    fireEvent.click(b);
    expect(applyTemplateTo).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(b);
    expect(applyTemplateTo).toHaveBeenCalledTimes(2);
  });

  it("delete asks for confirmation", () => {
    const onDelete = vi.fn();
    mk({ onDelete });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this template?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("t1");
  });

  it("cancel keeps the template", () => {
    const onDelete = vi.fn();
    mk({ onDelete });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("rename commits on Enter", () => {
    const onRename = vi.fn();
    mk({ onRename });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("t1", "New");
  });
});
