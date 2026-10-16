import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: toastMock }));

import { BACKDROP_PRESETS } from "@/lib/backdrop";
import { DEFAULT_CONFIG, type AppConfig } from "@/lib/config";
import { __resetImageSizeCache, ensureImageSizes } from "@/lib/imageSizeCache";
import { setPrepareExport, setStageSourceSize } from "@/lib/stageBridge";
import { pickBackdropLook, type EditTemplate, type TemplateSelection } from "@/lib/template";
import type { ConvertFileSrc } from "@/hooks/useWorkspaceSession";
import { t } from "@/i18n/store";
import { useEditor, type Annotation, type ImageCrop } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useWorkspaces, type WorkspaceDoc } from "@/stores/workspaces";
import {
  ACTIVE,
  applyTemplateTo,
  prepareApply,
  resolveTargetIds,
  showApplyToast,
  targetSrcs,
  type ApplySummary,
} from "./applyTemplateTo";

const cfs: ConvertFileSrc = (p) => "asset://" + p;

const rect = (id: string, x = 10, y = 10, w = 20, h = 20): Annotation =>
  ({ id, type: "rect", x, y, w, h, stroke: "#f00", strokeWidth: 2 }) as unknown as Annotation;
const pin = (id: string, number: number): Annotation =>
  ({ id, type: "pin", x: 5, y: 5, number }) as unknown as Annotation;

const SIZES: Record<string, { w: number; h: number }> = {
  "/tmp/one.png": { w: 1000, h: 800 },
  "/tmp/two.png": { w: 400, h: 300 },
  "/tmp/b.png": { w: 1000, h: 800 },
};
/** Fake decoder: recovers the doc's sourcePath from the srcForDoc string. */
const load = vi.fn(async (src: string) => {
  const s = new URL(src.replace("asset://", "http://x")).searchParams.get("s");
  const size = s ? SIZES[s] : undefined;
  if (!size) throw new Error("no size for " + src);
  return size;
});

const doc = (id: string, o: Partial<WorkspaceDoc> = {}): WorkspaceDoc => ({
  id,
  createdAt: 1,
  updatedAt: 1,
  image: { kind: "file", path: `/ws/${id}.png` },
  sourcePath: "/tmp/one.png",
  thumb: "thumb-" + id,
  annotations: [],
  nextPinNumber: 1,
  imageCrop: null,
  backdropOn: false,
  captureSource: "other",
  displayScale: 1,
  userZoomed: false,
  scroll: null,
  ...o,
});

const CROP: ImageCrop = { x: 100, y: 100, w: 600, h: 500 };
const tpl = (o: Partial<EditTemplate> = {}): EditTemplate => ({
  id: "t1",
  name: "T",
  createdAt: 1,
  sourceSize: { w: 1000, h: 800 },
  annotations: [rect("tr")],
  thumb: "",
  ...o,
});
const sel = (o: Partial<TemplateSelection> = {}): TemplateSelection => ({
  crop: false,
  backdropOn: false,
  backdropLook: false,
  annotationIds: new Set(["tr", "tp"]),
  ...o,
});

function setConfig(patch: (c: AppConfig) => AppConfig) {
  useSettings.setState({ config: patch(structuredClone(DEFAULT_CONFIG)) });
}
const enableWorkspaces = (enabled: boolean) =>
  setConfig((c) => ({ ...c, workspaces: { ...c.workspaces, enabled } }));

/** Active A (live editor) + background B, both with images. */
function seedTwo() {
  enableWorkspaces(true);
  useWorkspaces.setState({
    ready: true,
    order: ["A", "B"],
    activeId: "A",
    pendingId: null,
    swapping: false,
    docs: { A: doc("A"), B: doc("B", { sourcePath: "/tmp/b.png" }) },
  });
  useEditor.setState({ hasImage: true, annotations: [rect("live")], past: [], future: [] });
  setStageSourceSize({ w: 1000, h: 800 });
}

const snapshot = () =>
  structuredClone({
    ws: (({ order, activeId, docs }) => ({ order, activeId, docs }))(useWorkspaces.getState()),
    ed: (({ annotations, nextPinNumber, imageCrop, past }) => ({ annotations, nextPinNumber, imageCrop, past }))(
      useEditor.getState(),
    ),
    cfg: useSettings.getState().config,
  });

const ids = (anns: Annotation[]) => anns.map((a) => a.id);

beforeEach(() => {
  __resetImageSizeCache();
  load.mockClear();
  toastMock.mockClear();
  setPrepareExport(null);
  setStageSourceSize(null);
  useEditor.getState().reset();
  useSettings.setState({ config: structuredClone(DEFAULT_CONFIG) });
  useWorkspaces.setState({ order: [], activeId: null, docs: {}, pendingId: null, swapping: false });
});
afterEach(() => setPrepareExport(null));

describe("guards", () => {
  it("aborts when pendingId set", async () => {
    seedTwo();
    await ensureImageSizes(targetSrcs(cfs), load);
    useWorkspaces.setState({ pendingId: "B" });
    const before = snapshot();
    const s = applyTemplateTo(["A", "B"], tpl(), sel(), cfs);
    expect(s.aborted).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("aborts when swapping", async () => {
    seedTwo();
    await ensureImageSizes(targetSrcs(cfs), load);
    useWorkspaces.setState({ swapping: true });
    const before = snapshot();
    const s = applyTemplateTo(["A", "B"], tpl(), sel({ backdropLook: true }), cfs);
    expect(s.aborted).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("re-entrant call is rejected", () => {
    seedTwo();
    let inner: ApplySummary | null = null;
    setPrepareExport(() => {
      inner = applyTemplateTo(["A"], tpl(), sel(), null);
    });
    const outer = applyTemplateTo(["A"], tpl(), sel(), null);
    expect(inner).not.toBeNull();
    expect(inner!.aborted).toBe(true);
    expect(outer.aborted).toBe(false);
    expect(outer.applied).toBe(1);
    expect(useEditor.getState().annotations).toHaveLength(2);
    // The flag is released afterwards.
    expect(applyTemplateTo(["A"], tpl(), sel(), null).aborted).toBe(false);
  });

  it("re-entrancy flag is released when a target throws", () => {
    seedTwo();
    setPrepareExport(() => {
      throw new Error("boom");
    });
    expect(() => applyTemplateTo(["A"], tpl(), sel(), null)).toThrow("boom");
    setPrepareExport(null);
    expect(applyTemplateTo(["A"], tpl(), sel(), null).aborted).toBe(false);
  });
});

describe("active target", () => {
  it("prepare runs before the live editor is read", () => {
    seedTwo();
    setPrepareExport(() =>
      useEditor.setState({ annotations: [...useEditor.getState().annotations, rect("typed")] }),
    );
    const s = applyTemplateTo(["A"], tpl(), sel(), null);
    expect(s.applied).toBe(1);
    const a = ids(useEditor.getState().annotations);
    expect(a.slice(0, 2)).toEqual(["live", "typed"]);
    expect(a).toHaveLength(3);
  });

  it("active target uses live editor, not docs[activeId]", () => {
    seedTwo();
    useWorkspaces.setState({
      docs: { ...useWorkspaces.getState().docs, A: doc("A", { annotations: [rect("stale")] }) },
    });
    applyTemplateTo(["A"], tpl(), sel(), null);
    const a = ids(useEditor.getState().annotations);
    expect(a[0]).toBe("live");
    expect(a).not.toContain("stale");
    // docs[A] is never written through patchDoc (commitActive owns it).
    expect(ids(useWorkspaces.getState().docs.A.annotations)).toEqual(["stale"]);
    expect(useEditor.getState().past).toHaveLength(1);
  });

  it("active skipped when hasImage false", () => {
    seedTwo();
    useEditor.setState({ hasImage: false });
    const s = applyTemplateTo(["A"], tpl(), sel(), null);
    expect(s).toMatchObject({ applied: 0, skipped: 1 });
    expect(ids(useEditor.getState().annotations)).toEqual(["live"]);
  });

  it("active skipped when source size null", () => {
    seedTwo();
    setStageSourceSize(null);
    const s = applyTemplateTo(["A"], tpl(), sel(), null);
    expect(s).toMatchObject({ applied: 0, skipped: 1 });
    expect(ids(useEditor.getState().annotations)).toEqual(["live"]);
  });

  it("ACTIVE sentinel when workspaces disabled", () => {
    enableWorkspaces(false);
    useEditor.setState({ hasImage: true, annotations: [rect("live")] });
    setStageSourceSize({ w: 1000, h: 800 });
    expect(resolveTargetIds()).toEqual([ACTIVE]);
    const s = applyTemplateTo([ACTIVE], tpl(), sel(), null);
    expect(s.applied).toBe(1);
    expect(useEditor.getState().annotations).toHaveLength(2);
  });

  it("active id passed twice (id + sentinel) applies once", () => {
    seedTwo();
    const s = applyTemplateTo(["A", ACTIVE], tpl(), sel(), null);
    expect(s.applied).toBe(1);
    expect(useEditor.getState().annotations).toHaveLength(2);
  });
});

describe("non-active targets", () => {
  it("same id refilled with a new image does not reuse the old size (CP-0074)", async () => {
    enableWorkspaces(true);
    useWorkspaces.setState({
      order: ["A", "W"],
      activeId: "A",
      docs: { A: doc("A", { image: null }), W: doc("W", { sourcePath: "/tmp/one.png" }) },
    });
    const t1 = tpl({ crop: CROP, annotations: [] });
    await ensureImageSizes(targetSrcs(cfs), load);

    // Baseline: the cached size is found and the crop fits 1000×800.
    const first = applyTemplateTo(["W"], t1, sel({ crop: true }), cfs);
    expect(first).toMatchObject({ applied: 1, skipped: 0, cropSkipped: 0 });
    expect(useWorkspaces.getState().docs.W.imageCrop).toEqual(CROP);

    // Refill: same id, same durable path, new capture (400×300), not yet decoded.
    useWorkspaces.setState({
      docs: { ...useWorkspaces.getState().docs, W: doc("W", { sourcePath: "/tmp/two.png" }) },
    });
    const second = applyTemplateTo(["W"], t1, sel({ crop: true }), cfs);
    expect(second).toMatchObject({ applied: 0, skipped: 1 });
    expect(useWorkspaces.getState().docs.W.imageCrop).toBeNull();

    await ensureImageSizes(targetSrcs(cfs), load);
    const third = applyTemplateTo(["W"], t1, sel({ crop: true }), cfs);
    expect(third).toMatchObject({ applied: 1, skipped: 0, cropSkipped: 1 });
    expect(useWorkspaces.getState().docs.W.imageCrop).toBeNull();
  });

  it("applies to a background doc through patchDoc and keeps its thumb", async () => {
    seedTwo();
    await ensureImageSizes(targetSrcs(cfs), load);
    const s = applyTemplateTo(["B"], tpl(), sel(), cfs);
    expect(s.applied).toBe(1);
    const b = useWorkspaces.getState().docs.B;
    expect(b.annotations).toHaveLength(1);
    expect(b.thumb).toBe("thumb-B");
    // The live editor is untouched.
    expect(ids(useEditor.getState().annotations)).toEqual(["live"]);
  });

  it("skips closed or imageless targets and counts them", async () => {
    seedTwo();
    useWorkspaces.setState({
      order: ["A", "B", "E"],
      docs: { ...useWorkspaces.getState().docs, E: doc("E", { image: null }) },
    });
    await ensureImageSizes(targetSrcs(cfs), load);
    const s = applyTemplateTo(["A", "B", "E", "gone"], tpl(), sel(), cfs);
    expect(s).toMatchObject({ applied: 2, skipped: 2, aborted: false });
  });

  it("resolveTargetIds is order-sorted and image-only; targetSrcs excludes active", () => {
    seedTwo();
    useWorkspaces.setState({
      order: ["B", "E", "A"],
      docs: { ...useWorkspaces.getState().docs, E: doc("E", { image: null }) },
    });
    expect(resolveTargetIds()).toEqual(["B", "A"]);
    expect(targetSrcs(cfs)).toEqual(["asset:///ws/B.png?w=B&s=%2Ftmp%2Fb.png"]);
  });

  it("prepareApply seeds the cache and returns cfs (null outside Tauri)", async () => {
    seedTwo();
    await expect(prepareApply()).resolves.toBeNull();
  });

  it("counts scaleMismatch", async () => {
    seedTwo();
    await ensureImageSizes(targetSrcs(cfs), load);
    const s = applyTemplateTo(["B"], tpl({ sourceSize: { w: 500, h: 400 } }), sel(), cfs);
    expect(s).toMatchObject({ applied: 1, scaleMismatch: 1 });
  });
});

describe("backdrop look", () => {
  const otherPreset = BACKDROP_PRESETS.find((p) => p.id !== DEFAULT_CONFIG.general.backdrop.presetId)!.id;
  const look = {
    style: "solid" as const,
    presetId: otherPreset,
    solidColor: "#123456",
    padding: 7,
    cornerRadius: 3,
    shadow: false,
  };
  const autoFlags = {
    autoForFull: true,
    autoForArea: true,
    autoForWindow: false,
    autoForPaste: true,
    autoForImport: true,
  };
  const seedFlags = () =>
    setConfig((c) => ({
      ...c,
      workspaces: { ...c.workspaces, enabled: true },
      general: { ...c.general, backdrop: { ...c.general.backdrop, ...autoFlags } },
    }));

  it("backdrop look merges; autoForFull/Area/Window/Paste/Import all survive", () => {
    seedTwo();
    seedFlags();
    const before = pickBackdropLook(useSettings.getState().config.general.backdrop);
    const s = applyTemplateTo(["A"], tpl({ backdropLook: look }), sel({ backdropLook: true }), null);
    expect(useSettings.getState().config.general.backdrop).toEqual({ ...look, ...autoFlags });
    expect(s.previousLook).toEqual(before);
  });

  it("unknown presetId keeps current presetId", () => {
    seedTwo();
    const cur = useSettings.getState().config.general.backdrop.presetId;
    applyTemplateTo(["A"], tpl({ backdropLook: { ...look, presetId: "nope" } }), sel({ backdropLook: true }), null);
    const b = useSettings.getState().config.general.backdrop;
    expect(b.presetId).toBe(cur);
    expect(b.solidColor).toBe("#123456");
  });

  it("previousLook returned when look applied, null otherwise", () => {
    seedTwo();
    const off = applyTemplateTo(["A"], tpl({ backdropLook: look }), sel(), null);
    expect(off.previousLook).toBeNull();
    expect(useSettings.getState().config.general.backdrop).toEqual(DEFAULT_CONFIG.general.backdrop);
    const on = applyTemplateTo(["A"], tpl({ backdropLook: look }), sel({ backdropLook: true }), null);
    expect(on.previousLook).toEqual(pickBackdropLook(DEFAULT_CONFIG.general.backdrop));
  });

  it("look is not applied when nothing was applied", () => {
    seedTwo();
    useEditor.setState({ hasImage: false });
    const s = applyTemplateTo(["A"], tpl({ backdropLook: look }), sel({ backdropLook: true }), null);
    expect(s.previousLook).toBeNull();
    expect(useSettings.getState().config.general.backdrop).toEqual(DEFAULT_CONFIG.general.backdrop);
  });

  it("revert action restores all six look fields", () => {
    seedTwo();
    seedFlags();
    const pre = structuredClone(useSettings.getState().config.general.backdrop);
    const s = applyTemplateTo(["A"], tpl({ backdropLook: look }), sel({ backdropLook: true }), null);
    showApplyToast(s, t);
    const opts = toastMock.mock.calls[0][1];
    expect(opts.id).toBe("templates-apply");
    expect(opts.duration).toBe(8000);
    expect(opts.action.label).toBe("Revert backdrop");
    // A later flag edit must survive the revert (only the look is restored).
    setConfig((c) => ({
      ...useSettings.getState().config,
      general: { ...useSettings.getState().config.general, backdrop: { ...useSettings.getState().config.general.backdrop, autoForFull: false } },
    }));
    opts.action.onClick();
    const b = useSettings.getState().config.general.backdrop;
    expect(pickBackdropLook(b)).toEqual(pickBackdropLook(pre));
    expect(b).toEqual({ ...pre, autoForFull: false });
  });
});

describe("pins", () => {
  const withLast = (n: number) =>
    setConfig((c) => ({ ...c, workspaces: { ...c.workspaces, enabled: true }, pins: { ...c.pins, lastUsedNumber: n } }));

  it("lastUsedNumber never lowered", () => {
    seedTwo();
    withLast(12);
    applyTemplateTo(["A"], tpl({ annotations: [pin("tp", 3)] }), sel(), null);
    expect(useSettings.getState().config.pins.lastUsedNumber).toBe(12);
  });

  it("lastUsedNumber raised to the template max", () => {
    seedTwo();
    withLast(1);
    applyTemplateTo(["A"], tpl({ annotations: [pin("tp", 3)] }), sel(), null);
    expect(useSettings.getState().config.pins.lastUsedNumber).toBe(3);
  });
});

describe("showApplyToast", () => {
  const base: ApplySummary = { applied: 2, skipped: 0, cropSkipped: 0, scaleMismatch: 0, aborted: false, previousLook: null };

  it("reports counts with the undo hint and no action without a look", () => {
    showApplyToast({ ...base, skipped: 1, cropSkipped: 1, scaleMismatch: 1 }, t);
    const [msg, opts] = toastMock.mock.calls[0];
    expect(msg).toContain("Applied to 2 images");
    expect(msg).toContain("1 skipped");
    expect(msg).toContain("crop didn't fit 1");
    expect(opts.description).toContain("Some images look like a different screen scale");
    expect(opts.description).toContain("Ctrl+Z on each image undoes annotations and crop");
    expect(opts.id).toBe("templates-apply");
    expect(opts.action).toBeUndefined();
  });

  it("uses the singular for one applied image", () => {
    showApplyToast({ ...base, applied: 1 }, t);
    const [msg] = toastMock.mock.calls[0];
    expect(msg).toBe("Applied to 1 image");
  });

  it("aborted toast asks to retry", () => {
    showApplyToast({ ...base, applied: 0, aborted: true }, t);
    const [msg, opts] = toastMock.mock.calls[0];
    expect(msg).toBe("Workspace is switching — try again");
    expect(opts.id).toBe("templates-apply");
  });
});
