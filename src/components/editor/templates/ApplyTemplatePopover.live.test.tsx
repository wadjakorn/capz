// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/config";
import { __resetImageSizeCache, ensureImageSizes } from "@/lib/imageSizeCache";
import { targetSrcs } from "@/lib/applyTemplateTo";
import { setPrepareExport, setStageSourceSize } from "@/lib/stageBridge";
import { useEditor, type Annotation } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useTemplates } from "@/stores/templates";
import { useWorkspaces, type WorkspaceDoc } from "@/stores/workspaces";
import { ApplyTemplatePopover } from "./ApplyTemplatePopover";

const rect = (id: string): Annotation =>
  ({ id, type: "rect", x: 1, y: 2, w: 5, h: 5, stroke: "#f00", strokeWidth: 2 }) as Annotation;
const mk = (id: string): WorkspaceDoc =>
  ({
    id,
    createdAt: 0,
    updatedAt: 0,
    image: { kind: "file", path: `/p/${id}.png` },
    thumb: "",
    scroll: null,
    annotations: [],
    imageCrop: null,
    backdropOn: true,
    nextPinNumber: 1,
    captureSource: "other",
  }) as unknown as WorkspaceDoc;

beforeEach(async () => {
  __resetImageSizeCache();
  setStageSourceSize({ w: 100, h: 100 });
  useEditor.setState({
    hasImage: true,
    annotations: [rect("a"), rect("b")],
    imageCrop: null,
    backdropOn: true,
  });
  useWorkspaces.setState({
    order: ["A", "B"],
    docs: { A: mk("A"), B: mk("B") },
    activeId: "A",
    pendingId: null,
    swapping: false,
  });
  useSettings.setState({
    config: { ...DEFAULT_CONFIG, workspaces: { ...DEFAULT_CONFIG.workspaces, enabled: true } },
  });
  useTemplates.setState({ templates: [], loaded: true });
  await ensureImageSizes(targetSrcs(null), async () => ({ w: 100, h: 100 }));
});
afterEach(() => {
  cleanup();
  setPrepareExport(null);
  setStageSourceSize(null);
});

describe("ApplyTemplatePopover live flow", () => {
  it("live flow applies the selected live items to B", async () => {
    render(<ApplyTemplatePopover source={{ kind: "live" }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2" }));
    const btn = screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(useWorkspaces.getState().docs.B.annotations.length).toBe(2));
    const anns = useWorkspaces.getState().docs.B.annotations;
    expect(anns.map((a) => a.type)).toEqual(["rect", "rect"]);
    expect(anns.every((a) => a.id !== "a" && a.id !== "b")).toBe(true);
    expect(useTemplates.getState().templates).toEqual([]);
  });
});
