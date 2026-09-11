import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEditor } from "@/stores/editor";
import { barModeFor, hasEdits, useWorkspaces, type WorkspaceDoc } from "@/stores/workspaces";

// The store persists through tauri-plugin-store and renders thumbnails from a
// Konva stage; neither exists under vitest. isTauriRuntime() is false here, so
// every persistence path short-circuits — these tests cover the pure state
// machine: ordering, eviction, active-tile handoff and undo.
function reset() {
  useWorkspaces.setState({
    ready: true,
    order: [],
    activeId: null,
    docs: {},
    barPref: "full",
    barPrefUserSet: false,
    swapping: false,
    lastClosed: null,
  });
  useEditor.getState().reset();
}

const MAX = 3;
const add = () => useWorkspaces.getState().createEmpty(MAX);

describe("workspace ordering", () => {
  beforeEach(reset);

  it("activates each new workspace and appends it to the right", () => {
    const a = add();
    const b = add();
    const { order, activeId } = useWorkspaces.getState();
    expect(order).toEqual([a, b]);
    expect(activeId).toBe(b);
  });

  it("evicts the oldest once max is reached (FIFO)", () => {
    const a = add();
    const b = add();
    const c = add();
    const d = add();
    const { order } = useWorkspaces.getState();
    expect(order).toEqual([b, c, d]);
    expect(order).not.toContain(a);
  });

  it("keeps the evicted workspace available to undo", () => {
    const a = add();
    add();
    add();
    add();
    expect(useWorkspaces.getState().lastClosed?.doc.id).toBe(a);
    useWorkspaces.getState().reopenLastClosed();
    expect(useWorkspaces.getState().order).toContain(a);
    expect(useWorkspaces.getState().activeId).toBe(a);
  });

  it("restores a reopened workspace to the slot it was closed from", () => {
    const a = add();
    const b = add();
    useWorkspaces.getState().close(a);
    useWorkspaces.getState().reopenLastClosed();
    expect(useWorkspaces.getState().order).toEqual([a, b]);
  });
});

describe("closing", () => {
  beforeEach(reset);

  it("hands the active slot to the tile on the left", () => {
    const a = add();
    const b = add();
    const c = add();
    useWorkspaces.getState().switchTo(b);
    useWorkspaces.getState().close(b);
    expect(useWorkspaces.getState().activeId).toBe(a);
    expect(useWorkspaces.getState().order).toEqual([a, c]);
  });

  it("falls back to the right when the leftmost is closed", () => {
    const a = add();
    const b = add();
    useWorkspaces.getState().switchTo(a);
    useWorkspaces.getState().close(a);
    expect(useWorkspaces.getState().activeId).toBe(b);
  });

  it("leaves nothing active after the last workspace closes", () => {
    const a = add();
    useWorkspaces.getState().close(a);
    expect(useWorkspaces.getState().order).toEqual([]);
    expect(useWorkspaces.getState().activeId).toBeNull();
  });

  it("closeOthers keeps only the active workspace", () => {
    add();
    add();
    const c = add();
    useWorkspaces.getState().closeOthers();
    expect(useWorkspaces.getState().order).toEqual([c]);
  });
});

describe("clearActive", () => {
  beforeEach(reset);

  it("empties the document but keeps the tile", () => {
    const a = add();
    useWorkspaces.setState({
      docs: {
        ...useWorkspaces.getState().docs,
        [a]: {
          ...useWorkspaces.getState().docs[a],
          image: { kind: "blob", url: "blob:x" },
          imageCrop: { x: 0, y: 0, w: 5, h: 5 },
        },
      },
    });
    vi.stubGlobal("URL", { ...URL, revokeObjectURL: vi.fn() });
    useWorkspaces.getState().clearActive();
    const doc = useWorkspaces.getState().docs[a];
    expect(useWorkspaces.getState().order).toEqual([a]);
    expect(doc.image).toBeNull();
    expect(doc.imageCrop).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("commitActive", () => {
  beforeEach(reset);

  it("snapshots live editor state into the active document", () => {
    const a = add();
    useEditor.getState().add({
      id: "r1",
      type: "rect",
      x: 1,
      y: 2,
      w: 3,
      h: 4,
      stroke: "#fff",
      strokeWidth: 2,
    });
    useWorkspaces.getState().commitActive();
    expect(useWorkspaces.getState().docs[a].annotations).toHaveLength(1);
  });

  it("keeps each workspace's annotations independent across a swap", () => {
    const a = add();
    useEditor.getState().add({
      id: "r1",
      type: "rect",
      x: 0, y: 0, w: 1, h: 1,
      stroke: "#fff",
      strokeWidth: 1,
    });
    const b = add(); // commits `a` on the way out
    expect(useWorkspaces.getState().docs[a].annotations).toHaveLength(1);
    expect(useWorkspaces.getState().docs[b].annotations).toHaveLength(0);
  });
});

describe("barModeFor", () => {
  it("hides the bar until there is something to switch between", () => {
    expect(barModeFor([], "full")).toBe("hidden");
    expect(barModeFor(["a"], "full")).toBe("hidden");
  });

  it("honours the preference once two workspaces exist", () => {
    expect(barModeFor(["a", "b"], "full")).toBe("full");
    expect(barModeFor(["a", "b"], "rail")).toBe("rail");
  });
});

describe("hasEdits", () => {
  const base: WorkspaceDoc = {
    id: "x",
    createdAt: 0,
    updatedAt: 0,
    image: null,
    thumb: "",
    scroll: { left: 0, top: 0 },
    annotations: [],
    nextPinNumber: 1,
    imageCrop: null,
    backdropOn: false,
    captureSource: "other",
    displayScale: 0,
    userZoomed: false,
  };

  it("is false for an untouched workspace", () => {
    expect(hasEdits(base)).toBe(false);
    expect(hasEdits(undefined)).toBe(false);
  });

  it("counts annotations and a crop as work worth confirming", () => {
    expect(hasEdits({ ...base, annotations: [{ id: "a", type: "blur", x: 0, y: 0, w: 1, h: 1, blurRadius: 8 }] })).toBe(true);
    expect(hasEdits({ ...base, imageCrop: { x: 0, y: 0, w: 1, h: 1 } })).toBe(true);
  });
});
