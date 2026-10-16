// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/config";
import { setPrepareExport, setStageSourceSize } from "@/lib/stageBridge";
import type { EditTemplate } from "@/lib/template";
import { useEditor, type Annotation } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useWorkspaces, type WorkspaceDoc } from "@/stores/workspaces";

const sizes = new Map<string, { w: number; h: number }>();
vi.mock("@/lib/imageSizeCache", () => ({
  getImageSize: (s: string) => sizes.get(s),
  ensureImageSizes: vi.fn(async () => ({ failed: [] })),
}));
const apply = vi.fn(() => ({
  applied: 1,
  skipped: 0,
  cropSkipped: 0,
  scaleMismatch: 0,
  aborted: false,
  previousLook: null,
}));
let release: (v: null) => void = () => {};
const prepare = vi.fn(() => new Promise<null>((r) => (release = r)));
vi.mock("@/lib/applyTemplateTo", async (orig) => ({
  ...(await orig<typeof import("@/lib/applyTemplateTo")>()),
  applyTemplateTo: (...a: unknown[]) => (apply as (...x: unknown[]) => unknown)(...a),
  prepareApply: () => prepare(),
  showApplyToast: vi.fn(),
}));

import { ApplyTemplatePopover } from "./ApplyTemplatePopover";

const rect = (id: string): Annotation =>
  ({ id, type: "rect", x: 1, y: 2, w: 5, h: 5, stroke: "#f00", strokeWidth: 2 }) as Annotation;
const tpl = { id: "t", name: "T", createdAt: 0, thumb: "", sourceSize: { w: 1, h: 1 }, annotations: [rect("r")] } as EditTemplate;
const mk = (id: string): WorkspaceDoc =>
  ({ id, image: { kind: "file", path: `/p/${id}.png` }, thumb: "", annotations: [] }) as unknown as WorkspaceDoc;

function seed(enabled: boolean) {
  sizes.set("/p/B.png", { w: 1, h: 1 });
  useWorkspaces.setState({ order: ["A", "B"], docs: { A: mk("A"), B: mk("B") }, activeId: "A", pendingId: null, swapping: false });
  useSettings.setState({ config: { ...DEFAULT_CONFIG, workspaces: { ...DEFAULT_CONFIG.workspaces, enabled } } });
}

beforeEach(() => {
  sizes.clear();
  apply.mockClear();
  prepare.mockClear();
  setStageSourceSize({ w: 100, h: 100 });
  useEditor.setState({ hasImage: true, annotations: [rect("a")], imageCrop: null, backdropOn: true });
});
afterEach(() => {
  cleanup();
  setPrepareExport(null);
  setStageSourceSize(null);
});

const confirmBtn = () => screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;

describe("ApplyTemplatePopover confirm", () => {
  it("double-click while ready is pending applies once", async () => {
    seed(true);
    render(<ApplyTemplatePopover source={{ kind: "template", tpl }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "All open images" }));
    fireEvent.click(confirmBtn());
    fireEvent.click(confirmBtn());
    await act(async () => release(null));
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
  });

  it("activeId change before ready resolves never applies", async () => {
    seed(true);
    render(<ApplyTemplatePopover source={{ kind: "live" }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2" }));
    fireEvent.click(confirmBtn());
    act(() => useWorkspaces.setState({ activeId: "B" }));
    await act(async () => release(null));
    expect(apply).not.toHaveBeenCalled();
  });

  it("unmount before ready resolves never applies", async () => {
    seed(true);
    const { unmount } = render(<ApplyTemplatePopover source={{ kind: "template", tpl }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "All open images" }));
    fireEvent.click(confirmBtn());
    unmount();
    await act(async () => release(null));
    expect(apply).not.toHaveBeenCalled();
  });

  it("template source with workspaces disabled applies to [ACTIVE]", async () => {
    seed(false);
    render(<ApplyTemplatePopover source={{ kind: "template", tpl }} onClose={() => {}} />);
    fireEvent.click(confirmBtn());
    await act(async () => release(null));
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect((apply.mock.calls[0] as unknown[])[0]).toEqual(["active"]);
  });
});
