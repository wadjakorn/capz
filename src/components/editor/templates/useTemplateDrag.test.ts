// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveDropTarget } from "./useTemplateDrag";

function tile(id: string): Element {
  const wrap = document.createElement("div");
  wrap.setAttribute("data-ws-tile", id);
  const inner = document.createElement("img");
  wrap.appendChild(inner);
  return inner;
}

describe("resolveDropTarget", () => {
  it("tile with image", () => {
    expect(resolveDropTarget(tile("a"), false, () => true)).toEqual({ kind: "tile", id: "a" });
  });
  it("tile without image → null", () => {
    expect(resolveDropTarget(tile("a"), false, () => false)).toBeNull();
  });
  it("canvas", () => {
    expect(resolveDropTarget(document.createElement("div"), true, () => true)).toEqual({
      kind: "canvas",
    });
  });
  it("tile wins over canvas", () => {
    expect(resolveDropTarget(tile("b"), true, () => true)).toEqual({ kind: "tile", id: "b" });
  });
  it("nothing → null", () => {
    expect(resolveDropTarget(null, false, () => true)).toBeNull();
  });
});
