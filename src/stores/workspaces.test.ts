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
    pendingId: null,
    swapping: false,
    lastClosed: null,
  });
  useEditor.getState().reset();
}

const MAX = 3;
const add = () => useWorkspaces.getState().createEmpty(MAX);
/** Switch and land at once, as the session hook does after the image decodes. */
const switchNow = (id: string) => {
  useWorkspaces.getState().switchTo(id);
  useWorkspaces.getState().commitSwitch(id);
};
/** Give the active workspace an image so it no longer counts as empty. */
const giveImage = (id: string, path = `/ws/${id}.png`) =>
  useWorkspaces.setState({
    docs: {
      ...useWorkspaces.getState().docs,
      [id]: { ...useWorkspaces.getState().docs[id], image: { kind: "file", path } },
    },
  });

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

describe("adoptCapture dedupe", () => {
  beforeEach(reset);

  // Regression: one capture used to produce two workspaces. Two code paths can
  // deliver the same capture almost simultaneously — the `editor:load-image`
  // event and the startup `editor_current_image` probe — so the store has to be
  // the thing that refuses the second one.
  it("adopts a given source path only once", async () => {
    const first = await useWorkspaces.getState().adoptCapture("/tmp/capz-temp-1.png", "window", "new", MAX);
    const second = await useWorkspaces.getState().adoptCapture("/tmp/capz-temp-1.png", "window", "new", MAX);
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(useWorkspaces.getState().order).toHaveLength(1);
  });

  it("still accepts a different capture", async () => {
    await useWorkspaces.getState().adoptCapture("/tmp/capz-temp-1.png", "window", "new", MAX);
    await useWorkspaces.getState().adoptCapture("/tmp/capz-temp-2.png", "window", "new", MAX);
    expect(useWorkspaces.getState().order).toHaveLength(2);
  });

  it("does not block a repeat once the first workspace is closed", async () => {
    const id = await useWorkspaces.getState().adoptCapture("/tmp/capz-temp-1.png", "area", "new", MAX);
    useWorkspaces.getState().close(id!.id);
    const again = await useWorkspaces.getState().adoptCapture("/tmp/capz-temp-1.png", "area", "new", MAX);
    expect(again).toBeTruthy();
    expect(useWorkspaces.getState().order).toHaveLength(1);
  });
});

describe("closing", () => {
  beforeEach(reset);

  it("hands the active slot to the tile on the left", () => {
    const a = add();
    const b = add();
    const c = add();
    switchNow(b);
    useWorkspaces.getState().close(b);
    expect(useWorkspaces.getState().activeId).toBe(a);
    expect(useWorkspaces.getState().order).toEqual([a, c]);
  });

  it("falls back to the right when the leftmost is closed", () => {
    const a = add();
    const b = add();
    switchNow(a);
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

describe("persistence", () => {
  beforeEach(reset);

  // Regression: annotations used to reach the store only on a swap or a window
  // blur, so drawing and then quitting lost them. The periodic commit is what
  // closes that, and these pin the contract it relies on.
  it("commitActive captures edits made since the last commit", () => {
    const a = add();
    expect(useWorkspaces.getState().docs[a].annotations).toHaveLength(0);
    useEditor.getState().add({
      id: "r1",
      type: "rect",
      x: 0, y: 0, w: 1, h: 1,
      stroke: "#fff",
      strokeWidth: 1,
    });
    // Still nothing on the doc — the editor is the live copy.
    expect(useWorkspaces.getState().docs[a].annotations).toHaveLength(0);
    useWorkspaces.getState().commitActive();
    expect(useWorkspaces.getState().docs[a].annotations).toHaveLength(1);
  });

  it("commitActive is idempotent", () => {
    const a = add();
    useEditor.getState().add({
      id: "r1",
      type: "rect",
      x: 0, y: 0, w: 1, h: 1,
      stroke: "#fff",
      strokeWidth: 1,
    });
    useWorkspaces.getState().commitActive();
    useWorkspaces.getState().commitActive();
    expect(useWorkspaces.getState().docs[a].annotations).toHaveLength(1);
  });

  it("commitActive is a no-op with no active workspace", () => {
    expect(() => useWorkspaces.getState().commitActive()).not.toThrow();
    expect(useWorkspaces.getState().docs).toEqual({});
  });

  // isTauriRuntime() is false under vitest, so the write short-circuits — what
  // matters here is that it resolves rather than hanging a close handler.
  it("flushPersist resolves off the desktop", async () => {
    add();
    await expect(useWorkspaces.getState().flushPersist()).resolves.toBeUndefined();
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

describe("switching", () => {
  beforeEach(reset);

  it("holds the switch pending until the image is ready", () => {
    const a = add();
    const b = add();
    switchNow(a);
    useWorkspaces.getState().switchTo(b);
    expect(useWorkspaces.getState().activeId).toBe(a);
    expect(useWorkspaces.getState().pendingId).toBe(b);
    useWorkspaces.getState().commitSwitch(b);
    expect(useWorkspaces.getState().activeId).toBe(b);
    expect(useWorkspaces.getState().pendingId).toBeNull();
  });

  it("lets the latest of several quick switches win", () => {
    const a = add();
    const b = add();
    const c = add();
    switchNow(a);
    useWorkspaces.getState().switchTo(b);
    useWorkspaces.getState().switchTo(c);
    useWorkspaces.getState().commitSwitch(b); // b's decode lands late
    expect(useWorkspaces.getState().activeId).toBe(a);
    useWorkspaces.getState().commitSwitch(c);
    expect(useWorkspaces.getState().activeId).toBe(c);
  });

  it("abandons a pending switch when the user goes back", () => {
    const a = add();
    const b = add();
    switchNow(a);
    useWorkspaces.getState().switchTo(b);
    useWorkspaces.getState().switchTo(a);
    expect(useWorkspaces.getState().pendingId).toBeNull();
    useWorkspaces.getState().commitSwitch(b);
    expect(useWorkspaces.getState().activeId).toBe(a);
  });

  it("drops a pending switch whose target was closed", () => {
    const a = add();
    const b = add();
    switchNow(a);
    useWorkspaces.getState().switchTo(b);
    useWorkspaces.getState().close(b);
    useWorkspaces.getState().commitSwitch(b);
    expect(useWorkspaces.getState().activeId).toBe(a);
    expect(useWorkspaces.getState().pendingId).toBeNull();
  });
});

describe("adoptCapture into an empty workspace", () => {
  beforeEach(reset);

  it("fills the empty active workspace instead of appending", async () => {
    const a = add();
    const res = await useWorkspaces
      .getState()
      .adoptCapture("/tmp/capz-temp-9.png", "area", "new", MAX);
    expect(res).toEqual({ id: a, outcome: "filled" });
    expect(useWorkspaces.getState().order).toEqual([a]);
    expect(useWorkspaces.getState().docs[a].image).toEqual({
      kind: "file",
      path: "/tmp/capz-temp-9.png",
    });
    expect(useWorkspaces.getState().docs[a].captureSource).toBe("area");
    expect(useWorkspaces.getState().lastClosed).toBeNull();
  });

  it("does not evict when full and the active workspace is empty", async () => {
    const a = add();
    giveImage(a);
    const b = add();
    giveImage(b);
    const c = add(); // empty, active, at max
    const res = await useWorkspaces
      .getState()
      .adoptCapture("/tmp/capz-temp-9.png", "window", "new", MAX);
    expect(res?.outcome).toBe("filled");
    expect(useWorkspaces.getState().order).toEqual([a, b, c]);
  });

  it("still appends when the active workspace has an image", async () => {
    const a = add();
    giveImage(a);
    const res = await useWorkspaces
      .getState()
      .adoptCapture("/tmp/capz-temp-9.png", "window", "new", MAX);
    expect(res?.outcome).toBe("added");
    expect(useWorkspaces.getState().order).toHaveLength(2);
  });

  it("reports an eviction when appending at max", async () => {
    for (let i = 0; i < MAX; i++) giveImage(add());
    const res = await useWorkspaces
      .getState()
      .adoptCapture("/tmp/capz-temp-9.png", "window", "new", MAX);
    expect(res?.outcome).toBe("evicted");
  });

  it("leaves replace mode alone", async () => {
    const a = add();
    giveImage(a);
    const res = await useWorkspaces
      .getState()
      .adoptCapture("/tmp/capz-temp-9.png", "window", "replace", MAX);
    expect(res).toEqual({ id: a, outcome: "replaced" });
  });
});
