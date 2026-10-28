import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/config";
import { useSettings } from "@/stores/settings";
import { useEditor } from "@/stores/editor";
import {
  cancelLastUsed,
  scheduleLastUsed,
  writeLastUsedNow,
} from "./lastUsedWriter";

const drawnRect = {
  rect: {
    strokeColor: "#ff0000",
    strokeWidth: 7,
    shape: "rect" as const,
    cornerRadius: 4,
    strokeStyle: "dashed" as const,
  },
};

const lastUsed = () => useSettings.getState().config.lastUsed ?? {};

describe("lastUsedWriter (CP-0077)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancelLastUsed();
    useSettings.setState({ config: structuredClone(DEFAULT_CONFIG) });
    useEditor.getState().setTool("rect");
  });
  afterEach(() => {
    cancelLastUsed();
    vi.useRealTimers();
  });

  it("a Toolbar pick inside the window survives the debounced flush", () => {
    scheduleLastUsed(drawnRect);
    vi.advanceTimersByTime(200);
    writeLastUsedNow({ rect: { shape: "ellipse" } });
    vi.advanceTimersByTime(500);
    expect(lastUsed().rect).toEqual({ ...drawnRect.rect, shape: "ellipse" });
  });

  it("untouched slots and other fields in the same slot still flush", () => {
    scheduleLastUsed({
      ...drawnRect,
      arrow: { strokeColor: "#00ff00", strokeWidth: 3, heads: "end", dash: false },
    });
    writeLastUsedNow({ rect: { strokeWidth: 12 } });
    vi.advanceTimersByTime(500);
    expect(lastUsed().rect).toEqual({ ...drawnRect.rect, strokeWidth: 12 });
    expect(lastUsed().arrow).toEqual({
      strokeColor: "#00ff00",
      strokeWidth: 3,
      heads: "end",
      dash: false,
    });
  });

  it("collapses several draws into one write", () => {
    const spy = vi.spyOn(useSettings.getState(), "setLastUsed");
    scheduleLastUsed(drawnRect);
    vi.advanceTimersByTime(300);
    scheduleLastUsed({ rect: { ...drawnRect.rect, strokeWidth: 9 } });
    vi.advanceTimersByTime(300);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastUsed().rect?.strokeWidth).toBe(9);
    spy.mockRestore();
  });

  it("cancelLastUsed drops the pending write", () => {
    scheduleLastUsed(drawnRect);
    cancelLastUsed();
    vi.advanceTimersByTime(1000);
    expect(lastUsed().rect).toBeUndefined();
  });

  it("never persists the transient crop tool", () => {
    useSettings.setState({
      config: { ...structuredClone(DEFAULT_CONFIG), lastUsed: { tool: "arrow" } },
    });
    useEditor.getState().setTool("crop");
    scheduleLastUsed(drawnRect);
    vi.advanceTimersByTime(500);
    expect(lastUsed().tool).toBe("arrow");
  });
});
