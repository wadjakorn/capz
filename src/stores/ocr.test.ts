import { describe, it, expect, vi, beforeEach } from "vitest";

const detectText = vi.fn();
vi.mock("@/lib/ocr", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ocr")>("@/lib/ocr");
  return { ...actual, detectText: (...a: unknown[]) => detectText(...a) };
});
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { message: (...a: unknown[]) => toast(...a) }) }));

import { useOcr } from "./ocr";

const fake = (text: string, thai = true) => ({
  width: 10, height: 10, lines: [{ text, bbox: { x: 0, y: 0, w: 1, h: 1 }, words: [] }],
  languagesUsed: ["en-US"], thaiAvailable: thai,
});

beforeEach(() => {
  detectText.mockReset();
  toast.mockReset();
  useOcr.getState().reset();
  useOcr.setState({ thaiNoticeShown: false });
});

describe("useOcr", () => {
  it("detects once and caches per key", async () => {
    detectText.mockResolvedValue(fake("hello"));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    await useOcr.getState().detect(); // second call must NOT re-invoke
    expect(detectText).toHaveBeenCalledTimes(1);
    expect(useOcr.getState().resultByKey["/img/a.png"].lines[0].text).toBe("hello");
    expect(useOcr.getState().status).toBe("done");
  });

  it("re-detects for a different key", async () => {
    detectText.mockResolvedValue(fake("a"));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    detectText.mockResolvedValue(fake("b"));
    useOcr.getState().setKey("/img/b.png");
    await useOcr.getState().detect();
    expect(detectText).toHaveBeenCalledTimes(2);
  });

  it("reset clears mode, results, and key", async () => {
    detectText.mockResolvedValue(fake("x"));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().toggle(); // enables + detects
    expect(useOcr.getState().mode).toBe(true);
    useOcr.getState().reset();
    expect(useOcr.getState().mode).toBe(false);
    expect(useOcr.getState().currentKey).toBe(null);
    expect(Object.keys(useOcr.getState().resultByKey)).toHaveLength(0);
  });

  it("reset preserves thaiNoticeShown (once-per-session notice)", async () => {
    detectText.mockResolvedValue(fake("x", false)); // thaiAvailable=false → sets the flag
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    expect(useOcr.getState().thaiNoticeShown).toBe(true);
    useOcr.getState().reset();
    expect(useOcr.getState().thaiNoticeShown).toBe(true); // survives reset
  });

  it("shows the Thai notice once when Thai is unavailable", async () => {
    detectText.mockResolvedValue(fake("x", false));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    useOcr.getState().setKey("/img/b.png");
    await useOcr.getState().detect();
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
