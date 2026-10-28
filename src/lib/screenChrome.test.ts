import { describe, expect, it } from "vitest";
import type Konva from "konva";
import { SCREEN_CHROME, withScreenChromeHidden } from "./screenChrome";

function fakeNode(visible: boolean) {
  let v = visible;
  return {
    visible(next?: boolean) {
      if (next === undefined) return v;
      v = next;
      return this;
    },
  };
}

function fakeStage(nodes: ReturnType<typeof fakeNode>[]) {
  const seen: string[] = [];
  const stage = {
    find(sel: string) {
      seen.push(sel);
      return nodes;
    },
  };
  return { stage: stage as unknown as Konva.Stage, seen };
}

describe("withScreenChromeHidden (CP-0079)", () => {
  it("hides screen-chrome nodes while fn runs and restores them after", () => {
    const shown = fakeNode(true);
    const hidden = fakeNode(false);
    const { stage, seen } = fakeStage([shown, hidden]);
    const during = withScreenChromeHidden(stage, () => [shown.visible(), hidden.visible()]);
    expect(seen).toEqual([`.${SCREEN_CHROME}`]);
    expect(during).toEqual([false, false]);
    expect(shown.visible()).toBe(true);
    expect(hidden.visible()).toBe(false);
  });

  it("restores visibility when fn throws", () => {
    const shown = fakeNode(true);
    const { stage } = fakeStage([shown]);
    expect(() =>
      withScreenChromeHidden(stage, () => {
        throw new Error("tainted");
      }),
    ).toThrow("tainted");
    expect(shown.visible()).toBe(true);
  });
});
