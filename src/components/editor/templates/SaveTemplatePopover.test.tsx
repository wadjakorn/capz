// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: toastMock }));
import { setPrepareExport, setStageSourceSize } from "@/lib/stageBridge";
import { useEditor, type Annotation } from "@/stores/editor";
import { useTemplatePreview } from "@/stores/templatePreview";
import { useTemplates } from "@/stores/templates";
import { useWorkspaces } from "@/stores/workspaces";
import { SaveTemplatePopover } from "./SaveTemplatePopover";

vi.mock("@/stores/workspaces", async (orig) => ({
  ...(await orig<typeof import("@/stores/workspaces")>()),
  renderThumb: () => "data:thumb",
}));

const rect = (id: string, x = 10, y = 20): Annotation =>
  ({ id, type: "rect", x, y, w: 5, h: 5, stroke: "#f00", strokeWidth: 2 }) as Annotation;
const bigImage = (id: string, len: number): Annotation =>
  ({ id, type: "image", x: 0, y: 0, w: 5, h: 5, src: "x".repeat(len) }) as Annotation;

const save = vi.fn(async () => {});

beforeEach(() => {
  save.mockClear();
  setStageSourceSize({ w: 1000, h: 800 });
  useEditor.setState({
    hasImage: true,
    tool: "select",
    annotations: [rect("a")],
    imageCrop: null,
    backdropOn: true,
  });
  useTemplates.setState({ templates: [], loaded: true, save });
  useTemplatePreview.setState({ highlightId: null });
});
afterEach(() => {
  cleanup();
  setPrepareExport(null);
  setStageSourceSize(null);
});

const openIt = () => fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
const saveBtn = () => {
  const all = screen.getAllByRole("button", { name: "Save as template" });
  return all[all.length - 1] as HTMLButtonElement;
};

describe("SaveTemplatePopover", () => {
  it("a rejected save toasts, keeps the popover open and leaks no rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    toastMock.mockClear();
    save.mockRejectedValueOnce(new Error("load failed"));
    render(<SaveTemplatePopover />);
    openIt();
    await act(async () => {
      fireEvent.click(saveBtn());
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(toastMock).toHaveBeenCalledWith("Couldn't save templates");
    expect(screen.queryByRole("checkbox", { name: "Backdrop: on" })).not.toBeNull();
    expect(unhandled).not.toHaveBeenCalled();
    process.off("unhandledRejection", unhandled);
  });

  it("closes when the active workspace changes while open", () => {
    useWorkspaces.setState({ activeId: "A" });
    render(<SaveTemplatePopover />);
    openIt();
    expect(screen.queryByRole("checkbox", { name: "Backdrop: on" })).not.toBeNull();
    act(() => useWorkspaces.setState({ activeId: "B" }));
    expect(screen.queryByRole("checkbox", { name: "Backdrop: on" })).toBeNull();
    useWorkspaces.setState({ activeId: null });
  });

  it("opening calls runPrepareExport", () => {
    const fn = vi.fn();
    setPrepareExport(fn);
    render(<SaveTemplatePopover />);
    openIt();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("save disabled with empty selection", () => {
    useEditor.setState({ annotations: [] });
    render(<SaveTemplatePopover />);
    openIt();
    expect(saveBtn().disabled).toBe(false); // backdrop on is selected
    fireEvent.click(screen.getByRole("checkbox", { name: "Backdrop: on" }));
    expect(saveBtn().disabled).toBe(true);
  });

  it(">= 5 MB refuses; >= 2 MB warns", () => {
    useEditor.setState({ annotations: [bigImage("i", 2_100_000)] });
    const { unmount } = render(<SaveTemplatePopover />);
    openIt();
    expect(screen.getByText(/Large template/)).toBeTruthy();
    expect(saveBtn().disabled).toBe(false);
    unmount();
    cleanup();
    useEditor.setState({ annotations: [bigImage("i", 5_100_000)] });
    render(<SaveTemplatePopover />);
    openIt();
    expect(screen.getByText("Too large to save (max 5 MB)")).toBeTruthy();
    expect(saveBtn().disabled).toBe(true);
  });

  it("saved template is in base space", () => {
    useEditor.setState({
      annotations: [rect("a", 10, 20)],
      imageCrop: { x: 100, y: 50, w: 400, h: 300 },
    });
    render(<SaveTemplatePopover />);
    openIt();
    fireEvent.click(saveBtn());
    expect(save).toHaveBeenCalledTimes(1);
    const tpl = (save.mock.calls[0] as unknown as [import("@/lib/template").EditTemplate])[0];
    expect(tpl.sourceSize).toEqual({ w: 1000, h: 800 });
    expect(tpl.thumb).toBe("data:thumb");
    expect(tpl.annotations[0]).toMatchObject({ id: "a", x: 110, y: 70 });
    expect(tpl.crop).toEqual({ x: 100, y: 50, w: 400, h: 300 });
  });

  it("closing clears highlightId", () => {
    render(<SaveTemplatePopover />);
    openIt();
    act(() => useTemplatePreview.getState().setHighlight("a"));
    fireEvent.click(screen.getAllByRole("button", { name: "Save as template" })[0]);
    expect(useTemplatePreview.getState().highlightId).toBeNull();
  });

  it("hovering a picker row sets highlightId", () => {
    render(<SaveTemplatePopover />);
    openIt();
    fireEvent.mouseEnter(screen.getAllByRole("treeitem").find((e) => e.getAttribute("aria-label")?.includes("Rectangle"))!);
    expect(useTemplatePreview.getState().highlightId).toBe("a");
  });

  it("disabled while crop tool active", () => {
    useEditor.setState({ tool: "crop" });
    render(<SaveTemplatePopover />);
    expect((screen.getByRole("button", { name: "Save as template" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
