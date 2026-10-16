// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: toastMock }));

const applyTemplateTo = vi.fn();
const prepareApply = vi.fn();
vi.mock("@/lib/applyTemplateTo", () => ({
  ACTIVE: "active",
  applyTemplateTo: (...a: unknown[]) => applyTemplateTo(...a),
  prepareApply: () => prepareApply(),
  showApplyToast: vi.fn(),
}));

import { useEditor } from "@/stores/editor";
import { useTemplateDrag as useDragStore } from "@/stores/templateDrag";
import { useWorkspaces, type WorkspaceDoc } from "@/stores/workspaces";
import type { EditTemplate } from "@/lib/template";
import { useTemplateDrag } from "./useTemplateDrag";

const tpl = {
  id: "t",
  thumb: "",
  sourceSize: { w: 1, h: 1 },
  annotations: [],
} as unknown as EditTemplate;

const summary = (applied: number) => ({
  applied,
  skipped: 0,
  cropSkipped: 0,
  scaleMismatch: 0,
  aborted: false,
  previousLook: null,
});

function setup() {
  const card = document.createElement("div");
  const body = document.createElement("span");
  card.appendChild(body);
  const tile = document.createElement("div");
  tile.setAttribute("data-ws-tile", "B");
  document.body.appendChild(tile);
  (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => tile;
  const { result } = renderHook(() => useTemplateDrag(tpl));
  result.current.onPointerDown({
    target: body,
    currentTarget: card,
    button: 0,
    clientX: 0,
    clientY: 0,
  } as unknown as React.PointerEvent);
  return tile;
}
const ptr = (type: string, x: number) =>
  window.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: 0 }));
const flush = () => new Promise((r) => setTimeout(r, 0));

let flash: ReturnType<typeof vi.fn>;
beforeEach(() => {
  flash = vi.fn();
  useDragStore.setState({ flash } as never);
  useEditor.setState({ hasImage: true });
  useWorkspaces.setState({
    activeId: "A",
    docs: { B: { id: "B", image: { kind: "file", path: "/b" } } as WorkspaceDoc },
  } as never);
  toastMock.mockClear();
  applyTemplateTo.mockReset();
  prepareApply.mockReset();
  prepareApply.mockResolvedValue(null);
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("useTemplateDrag apply", () => {
  it("flashes the tile only when something was applied", async () => {
    applyTemplateTo.mockReturnValue(summary(0));
    setup();
    ptr("pointermove", 50);
    ptr("pointerup", 50);
    await flush();
    expect(applyTemplateTo).toHaveBeenCalledTimes(1);
    expect(flash).not.toHaveBeenCalled();

    applyTemplateTo.mockReturnValue(summary(1));
    setup();
    ptr("pointermove", 50);
    ptr("pointerup", 50);
    await flush();
    expect(flash).toHaveBeenCalledWith("B");
  });

  it("toasts aborted when preparing rejects", async () => {
    prepareApply.mockRejectedValue(new Error("x"));
    setup();
    ptr("pointermove", 50);
    ptr("pointerup", 50);
    await flush();
    expect(applyTemplateTo).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("Workspace is switching — try again");
  });

  it("window blur ends the drag without applying", async () => {
    setup();
    ptr("pointermove", 50);
    window.dispatchEvent(new Event("blur"));
    ptr("pointerup", 50);
    await flush();
    expect(applyTemplateTo).not.toHaveBeenCalled();
  });
});
