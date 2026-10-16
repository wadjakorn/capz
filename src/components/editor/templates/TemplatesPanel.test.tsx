// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditTemplate } from "@/lib/template";
import { DEFAULT_CONFIG } from "@/lib/config";
import { useSettings } from "@/stores/settings";
import { useTemplates } from "@/stores/templates";
import { useWorkspaces, type WorkspaceDoc } from "@/stores/workspaces";
import { TemplatesPanel } from "./TemplatesPanel";

vi.mock("./TemplateCard", () => ({
  TemplateCard: ({ tpl }: { tpl: EditTemplate }) => <div data-testid="card">{tpl.name}</div>,
}));

const ensureLoaded = vi.fn(async () => {});
const flush = vi.fn(async () => {});

beforeEach(() => {
  ensureLoaded.mockClear();
  flush.mockClear();
  useTemplates.setState({ templates: [], loaded: true, ensureLoaded, flush });
});
afterEach(cleanup);

describe("TemplatesPanel", () => {
  it("panel loads templates only when first active, not on mount", () => {
    const { rerender } = render(<TemplatesPanel active={false} />);
    expect(ensureLoaded).not.toHaveBeenCalled();
    rerender(<TemplatesPanel active />);
    expect(ensureLoaded).toHaveBeenCalledTimes(1);
    rerender(<TemplatesPanel active={false} />);
    rerender(<TemplatesPanel active />);
    expect(ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state", () => {
    render(<TemplatesPanel active />);
    expect(screen.getByText(/No templates yet/)).toBeTruthy();
  });

  it("lists templates", () => {
    useTemplates.setState({
      templates: [{ id: "a", name: "A" } as EditTemplate, { id: "b", name: "B" } as EditTemplate],
    });
    render(<TemplatesPanel active />);
    expect(screen.getAllByTestId("card")).toHaveLength(2);
  });

  it("flushes on window blur and beforeunload", () => {
    render(<TemplatesPanel active={false} />);
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("beforeunload"));
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("apply-from-image button needs workspaces on and another image", () => {
    const d = (id: string, image: WorkspaceDoc["image"]) => ({ id, image }) as WorkspaceDoc;
    const setWs = (enabled: boolean, bImage: WorkspaceDoc["image"]) => {
      useSettings.setState({
        config: { ...DEFAULT_CONFIG, workspaces: { ...DEFAULT_CONFIG.workspaces, enabled } },
      });
      useWorkspaces.setState({
        order: ["A", "B"],
        activeId: "A",
        docs: { A: d("A", { kind: "file", path: "/a" }), B: d("B", bImage) },
      });
    };
    setWs(false, { kind: "file", path: "/b" });
    const { unmount } = render(<TemplatesPanel active />);
    expect(screen.queryByText("Apply this image's edits to…")).toBeNull();
    unmount();
    setWs(true, null);
    const r2 = render(<TemplatesPanel active />);
    expect(screen.queryByText("Apply this image's edits to…")).toBeNull();
    r2.unmount();
    setWs(true, { kind: "file", path: "/b" });
    render(<TemplatesPanel active />);
    expect(screen.getByText("Apply this image's edits to…")).toBeTruthy();
  });
});
