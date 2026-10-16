import { beforeEach, describe, expect, it } from "vitest";

import { useEditor } from "@/stores/editor";
import type { Annotation } from "@/stores/editor";
import type { TemplatePatch } from "@/lib/template";

const ann = (id: string) => ({ id, type: "rect", x: 0, y: 0, w: 10, h: 10 }) as unknown as Annotation;

const patch = (over: Partial<TemplatePatch> = {}): TemplatePatch => ({
  annotations: [ann("n1")],
  nextPinNumber: 4,
  imageCrop: { x: 1, y: 2, w: 30, h: 40 },
  backdropOn: false,
  cropChanged: false,
  maxPinNumber: 3,
  ...over,
});

beforeEach(() => {
  useEditor.getState().reset();
  useEditor.setState({ annotations: [ann("old")], nextPinNumber: 1, imageCrop: null, backdropOn: true });
});

describe("applyPatch", () => {
  it("applyPatch pushes one snapshot; undo restores pre-apply annotations and crop", () => {
    useEditor.getState().applyPatch(patch());
    const s = useEditor.getState();
    expect(s.past).toHaveLength(1);
    expect(s.future).toEqual([]);
    expect(s.annotations.map((a) => a.id)).toEqual(["n1"]);
    expect(s.nextPinNumber).toBe(4);
    expect(s.imageCrop).toEqual({ x: 1, y: 2, w: 30, h: 40 });
    expect(s.backdropOn).toBe(false);
    expect("cropChanged" in s).toBe(false);
    expect("maxPinNumber" in s).toBe(false);
    useEditor.getState().undo();
    const u = useEditor.getState();
    expect(u.annotations.map((a) => a.id)).toEqual(["old"]);
    expect(u.imageCrop).toBeNull();
    expect(u.nextPinNumber).toBe(1);
  });

  it("applyPatch with cropChanged resets view and tool", () => {
    useEditor.setState({ tool: "crop", displayScale: 1.5, userZoomed: true, selectedId: "old" });
    useEditor.getState().applyPatch(patch({ cropChanged: true }));
    const s = useEditor.getState();
    expect(s.tool).toBe("select");
    expect(s.displayScale).toBe(0);
    expect(s.userZoomed).toBe(false);
    expect(s.selectedId).toBeNull();
    expect(s.nudgeRun).toBeNull();
  });

  it("applyPatch without cropChanged keeps tool and zoom", () => {
    useEditor.setState({ tool: "crop", displayScale: 1.5, userZoomed: true });
    useEditor.getState().applyPatch(patch());
    const s = useEditor.getState();
    expect(s.tool).toBe("crop");
    expect(s.displayScale).toBe(1.5);
    expect(s.userZoomed).toBe(true);
  });
});
