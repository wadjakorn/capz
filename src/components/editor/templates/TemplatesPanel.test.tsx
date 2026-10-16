// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditTemplate } from "@/lib/template";
import { useTemplates } from "@/stores/templates";
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
});
