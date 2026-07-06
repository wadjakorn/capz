import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Konva from "konva";
import { copyOnly, saveOnly } from "./exportImage";
import { DEFAULT_CONFIG } from "./config";
import {
  setStageExportBox,
  setStageImageSize,
  clearStageImageSize,
} from "./stageBridge";

// 1x1 transparent PNG
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function fakeStage(): Konva.Stage {
  return {
    scaleX: () => 1,
    width: () => 1,
    height: () => 1,
    toDataURL: () => PNG_DATA_URL,
  } as unknown as Konva.Stage;
}

describe("exportImage on the web runtime (no Tauri)", () => {
  const written: unknown[][] = [];
  const anchor = { href: "", download: "", click: vi.fn() };

  beforeEach(() => {
    written.length = 0;
    anchor.href = "";
    anchor.download = "";
    anchor.click.mockClear();
    class FakeClipboardItem {
      types: Record<string, unknown>;
      constructor(types: Record<string, unknown>) {
        this.types = types;
      }
    }
    vi.stubGlobal("window", {}); // browser, no __TAURI_INTERNALS__
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal("navigator", {
      clipboard: {
        write: vi.fn(async (items: unknown[]) => {
          written.push(items);
        }),
      },
    });
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copyOnly writes a PNG ClipboardItem via the browser clipboard", async () => {
    const r = await copyOnly(fakeStage());
    expect(r.copied).toBe(true);
    expect(written).toHaveLength(1);
    const item = written[0][0] as { types: Record<string, unknown> };
    expect(item.types["image/png"]).toBeDefined();
  });

  it("copyOnly falls back to a PNG download when the browser clipboard is unavailable (Linux/Firefox)", async () => {
    // No async clipboard image write available — the Linux Firefox shape.
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("ClipboardItem", undefined);
    const r = await copyOnly(fakeStage());
    expect(r.copied).toBe(false);
    expect(r.downloaded).toMatch(/^capz-\d{8}-\d{6}\.png$/);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe(r.downloaded);
    expect(written).toHaveLength(0);
  });

  it("saveOnly triggers a browser download named from the filename template and configured format", async () => {
    const r = await saveOnly(fakeStage(), DEFAULT_CONFIG);
    expect(r.copied).toBe(false);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    // default template capz-{yyyy}{MM}{dd}-{HHmmss} + default format (jpeg → .jpg)
    expect(anchor.download).toMatch(/^capz-\d{8}-\d{6}\.jpg$/);
    expect(r.saved).toBe(anchor.download);
  });

  it("exports the published (cropped) image region at native resolution", async () => {
    // Simulate a crop: the editor publishes the cropped size, not the source.
    setStageImageSize(120, 90);
    const calls: Array<Record<string, unknown>> = [];
    const stage = {
      scaleX: () => 0.5, // zoomed out to 50%
      width: () => 60,
      height: () => 45,
      toDataURL: (opts: Record<string, unknown>) => {
        calls.push(opts);
        return PNG_DATA_URL;
      },
    } as unknown as Konva.Stage;
    try {
      await copyOnly(stage);
      expect(calls).toHaveLength(1);
      const opts = calls[0];
      // region = croppedSize * scale, pixelRatio = 1/scale → native crop pixels
      expect(opts.x).toBe(0);
      expect(opts.y).toBe(0);
      expect(opts.width).toBe(60); // 120 * 0.5
      expect(opts.height).toBe(45); // 90 * 0.5
      expect(opts.pixelRatio).toBe(2); // 1 / 0.5
    } finally {
      clearStageImageSize();
    }
  });

  it("saveOnly downloads .png when the configured format is png", async () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      output: { ...DEFAULT_CONFIG.output, fileFormat: "png" as const },
    };
    const r = await saveOnly(fakeStage(), cfg);
    expect(anchor.download).toMatch(/\.png$/);
    expect(r.saved).toBe(anchor.download);
  });

  it("snapshots the published export box (expanded canvas) instead of the image rect", async () => {
    const calls: Array<{ x: number; y: number; width: number; height: number }> = [];
    const stage = {
      scaleX: () => 2, // Retina-style export scale
      width: () => 100,
      height: () => 100,
      toDataURL: (opts: { x: number; y: number; width: number; height: number }) => {
        calls.push(opts);
        return PNG_DATA_URL;
      },
    } as unknown as Konva.Stage;
    // Element overflowed to the top-left → negative origin, larger box.
    setStageExportBox({ x: -20, y: -10, w: 900, h: 700 });
    try {
      await copyOnly(stage);
    } finally {
      setStageExportBox(null);
    }
    expect(calls).toHaveLength(1);
    // Region is pinned at stage-local (0,0) by the Stage offset; size = box*scale.
    expect(calls[0]).toMatchObject({ x: 0, y: 0, width: 900 * 2, height: 700 * 2 });
  });
});
