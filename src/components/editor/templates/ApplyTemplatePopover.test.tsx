// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditTemplate } from "@/lib/template";
import { setPrepareExport, setStageSourceSize } from "@/lib/stageBridge";
import { useEditor, type Annotation } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useTemplates } from "@/stores/templates";
import { useWorkspaces, type WorkspaceDoc } from "@/stores/workspaces";
import { DEFAULT_CONFIG } from "@/lib/config";

const sizes = new Map<string, { w: number; h: number }>();
vi.mock("@/lib/imageSizeCache", () => ({
  getImageSize: (s: string) => sizes.get(s),
  ensureImageSizes: vi.fn(async () => ({ failed: [] })),
}));
vi.mock("@/hooks/useWorkspaceSession", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useWorkspaceSession")>()),
  loadConvertFileSrc: vi.fn(async () => null),
}));

import { ApplyTemplatePopover } from "./ApplyTemplatePopover";

const rect = (id: string): Annotation =>
  ({ id, type: "rect", x: 1, y: 2, w: 5, h: 5, stroke: "#f00", strokeWidth: 2 }) as Annotation;
const img = (id: string, len: number): Annotation =>
  ({ id, type: "image", x: 0, y: 0, w: 5, h: 5, src: "x".repeat(len) }) as Annotation;

const tplOf = (over: Partial<EditTemplate> = {}): EditTemplate =>
  ({
    id: "t1",
    name: "T",
    createdAt: 0,
    thumb: "",
    sourceSize: { w: 100, h: 100 },
    annotations: [rect("r1")],
    ...over,
  }) as EditTemplate;

const doc = (id: string, path: string | null): WorkspaceDoc =>
  ({
    id,
    createdAt: 0,
    updatedAt: 0,
    image: path ? { kind: "file", path } : null,
    thumb: "",
    scroll: null,
    annotations: [],
    imageCrop: null,
    backdropOn: true,
    nextPinNumber: 1,
    captureSource: "other",
  }) as unknown as WorkspaceDoc;

function seedWorkspaces(n = 3) {
  const ids = ["A", "B", "C", "D"].slice(0, n);
  const docs: Record<string, WorkspaceDoc> = {};
  for (const id of ids) {
    docs[id] = doc(id, `/p/${id}.png`);
    sizes.set(`/p/${id}.png`, { w: 100, h: 100 });
  }
  useWorkspaces.setState({ order: ids, docs, activeId: "A", pendingId: null, swapping: false });
  useSettings.setState({
    config: { ...DEFAULT_CONFIG, workspaces: { ...DEFAULT_CONFIG.workspaces, enabled: true } },
  });
}

beforeEach(() => {
  sizes.clear();
  setStageSourceSize({ w: 100, h: 100 });
  useEditor.setState({ hasImage: true, annotations: [rect("a")], imageCrop: null, backdropOn: true });
  seedWorkspaces();
});
afterEach(() => {
  cleanup();
  setPrepareExport(null);
  setStageSourceSize(null);
});

const checkbox = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("ApplyTemplatePopover", () => {
  it("live source excludes active from targets", async () => {
    render(<ApplyTemplatePopover source={{ kind: "live" }} onClose={() => {}} />);
    await waitFor(() => expect(checkbox("2")).toBeTruthy());
    expect(screen.queryByRole("checkbox", { name: "1" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "3" })).toBeTruthy();
  });

  it("row disabled when size load fails", async () => {
    sizes.delete("/p/B.png");
    render(<ApplyTemplatePopover source={{ kind: "template", tpl: tplOf() }} onClose={() => {}} />);
    await waitFor(() => expect(checkbox("2").disabled).toBe(true));
    expect(screen.getByText("Couldn't read this image")).toBeTruthy();
    expect(checkbox("3").disabled).toBe(false);
  });

  it("10 MB warning with 3 targets x 4 MB image", async () => {
    const tpl = tplOf({ annotations: [img("i", 4_000_000)] });
    render(<ApplyTemplatePopover source={{ kind: "template", tpl }} onClose={() => {}} />);
    await waitFor(() => expect(checkbox("2").disabled).toBe(false));
    expect(screen.queryByText(/will be added/)).toBeNull();
    fireEvent.click(checkbox("All open images"));
    expect(screen.getByText(/About 12 MB will be added/)).toBeTruthy();
  });

  it("backdropLook unchecked by default even when template has it", async () => {
    const tpl = tplOf({
      backdropLook: {
        style: "gradient",
        presetId: "x",
        solidColor: "#000",
        padding: 8,
        cornerRadius: 4,
        shadow: true,
      } as EditTemplate["backdropLook"],
    });
    render(<ApplyTemplatePopover source={{ kind: "template", tpl }} onClose={() => {}} />);
    expect(checkbox("Backdrop look").checked).toBe(false);
  });

  it("closes when the active workspace changes", async () => {
    const onClose = vi.fn();
    render(<ApplyTemplatePopover source={{ kind: "live" }} onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();
    act(() => useWorkspaces.setState({ activeId: "B" }));
    expect(onClose).toHaveBeenCalled();
  });
});
