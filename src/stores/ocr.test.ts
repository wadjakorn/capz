import { describe, it, expect, vi, beforeEach } from "vitest";

const detectText = vi.fn();
vi.mock("@/lib/ocr", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ocr")>("@/lib/ocr");
  return { ...actual, detectText: (...a: unknown[]) => detectText(...a) };
});
const toast = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...a: unknown[]) => toast(...a), {
    success: (...a: unknown[]) => toastSuccess(...a),
    message: (...a: unknown[]) => toast(...a),
  }),
}));

import { useOcr, visibleLines } from "./ocr";
import { useSettings } from "./settings";

const fake = (text: string, thai = true) => ({
  width: 10, height: 10, lines: [{ text, bbox: { x: 0, y: 0, w: 1, h: 1 }, words: [] }],
  languagesUsed: ["en-US"], thaiAvailable: thai,
});

// The Thai notice only fires when nothing was read at all — a screenshot that
// yielded lines is not evidence of a missing Thai engine.
const fakeEmpty = (thai = true) => ({
  width: 10, height: 10, lines: [] as never[], languagesUsed: ["en-US"], thaiAvailable: thai,
});

beforeEach(() => {
  detectText.mockReset();
  toast.mockReset();
  toastSuccess.mockReset();
  useOcr.getState().reset();
  useOcr.setState({ thaiNoticeShown: false, scopeHintShown: false });
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
    detectText.mockResolvedValue(fakeEmpty(false)); // no lines + no Thai → sets the flag
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    expect(useOcr.getState().thaiNoticeShown).toBe(true);
    useOcr.getState().reset();
    expect(useOcr.getState().thaiNoticeShown).toBe(true); // survives reset
  });

  it("shows the Thai notice once when Thai is unavailable and nothing was read", async () => {
    detectText.mockResolvedValue(fakeEmpty(false));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    useOcr.getState().setKey("/img/b.png");
    await useOcr.getState().detect();
    const thaiCalls = toast.mock.calls.filter((c) =>
      String(c[0]).includes("Thai"),
    );
    expect(thaiCalls).toHaveLength(1);
  });

  it("stays quiet when text was read, even if Thai is unavailable", async () => {
    detectText.mockResolvedValue(fake("hello", false));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    expect(toast.mock.calls.filter((c) => String(c[0]).includes("Thai"))).toHaveLength(0);
    expect(useOcr.getState().thaiNoticeShown).toBe(false);
  });

  it("points macOS users at the OpenThai engine when Vision has no Thai", async () => {
    detectText.mockResolvedValue(fakeEmpty(false));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    const call = toast.mock.calls.find((c) => String(c[0]).includes("Thai"));
    expect(call?.[1]?.description).toContain("OpenThai");
  });

  it("passes the chosen engine and re-detects after it changes", async () => {
    detectText.mockResolvedValue(fake("hello"));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    expect(detectText).toHaveBeenLastCalledWith("/img/a.png", "vision");
    const s = useSettings.getState();
    useSettings.setState({ config: { ...s.config, general: { ...s.config.general, ocrEngine: "openthai" } } });
    try {
      await useOcr.getState().detect();
      expect(detectText).toHaveBeenCalledTimes(2);
      expect(detectText).toHaveBeenLastCalledWith("/img/a.png", "openthai");
    } finally {
      useSettings.setState({ config: s.config });
    }
  });

  it("drops a result from the old engine when the engine changes mid-scan", async () => {
    let finish: (v: unknown) => void = () => {};
    detectText.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    useOcr.getState().setKey("/img/a.png");
    const scan = useOcr.getState().detect(); // started under "vision"
    const s = useSettings.getState();
    useSettings.setState({ config: { ...s.config, general: { ...s.config.general, ocrEngine: "openthai" } } });
    try {
      detectText.mockResolvedValueOnce(fake("from openthai"));
      await useOcr.getState().detect();
      finish(fake("from vision"));
      await scan;
      expect(useOcr.getState().resultByKey["/img/a.png"].lines[0].text).toBe("from openthai");
    } finally {
      useSettings.setState({ config: s.config });
    }
  });

  it("toasts the line count on a successful detection", async () => {
    detectText.mockResolvedValue(fake("hello")); // fake() → 1 line
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    // The session's first detection also carries the scope hint (CP-0099).
    expect(toastSuccess).toHaveBeenCalledWith("Detected 1 text line", {
      description: "Drag a box to copy only part of the text",
    });
  });

  it("toasts 'No text found' when there are no lines", async () => {
    detectText.mockResolvedValue({
      width: 10, height: 10, lines: [], languagesUsed: ["en-US"], thaiAvailable: true,
    });
    useOcr.getState().setKey("/img/empty.png");
    await useOcr.getState().detect();
    expect(toast).toHaveBeenCalledWith("No text found");
  });

  describe("scope (CP-0099)", () => {
    // 800×600, two columns of two lines; each line has two word boxes.
    const line = (a: string, b: string, x: number, y: number) => ({
      text: `${a} ${b}`,
      bbox: { x, y, w: 200, h: 30 },
      words: [
        { text: a, bbox: { x, y, w: 80, h: 30 } },
        { text: b, bbox: { x: x + 90, y, w: 110, h: 30 } },
      ],
    });
    const TWO_COL = {
      width: 800,
      height: 600,
      lines: [
        line("Left", "one", 40, 100),
        line("Right", "one", 440, 100),
        line("Left", "two", 40, 160),
        line("Right", "two", 440, 160),
      ],
      languagesUsed: ["en-US"],
      thaiAvailable: true,
    };
    const RECT = { x: 20, y: 80, w: 340, h: 140 };
    const texts = () => useOcr.getState().scope?.lines.map((l) => l.text);

    async function detected() {
      detectText.mockResolvedValue(TWO_COL);
      useOcr.getState().setKey("/img/two.png");
      await useOcr.getState().toggle(); // mode on + detect
    }

    it("setScope keeps only the boxed lines and does not re-scan", async () => {
      await detected();
      expect(visibleLines(useOcr.getState())).toHaveLength(4);
      useOcr.getState().setScope(RECT);
      expect(useOcr.getState().scope!.rect).toEqual(RECT);
      expect(texts()).toEqual(["Left one", "Left two"]);
      expect(visibleLines(useOcr.getState())!.map((l) => l.text)).toEqual(["Left one", "Left two"]);
      expect(detectText).toHaveBeenCalledTimes(1);
    });

    it("visibleLines is a stable reference while the scope is unchanged", async () => {
      await detected();
      useOcr.getState().setScope(RECT);
      expect(visibleLines(useOcr.getState())).toBe(visibleLines(useOcr.getState()));
    });

    it("ignores a box under 8×8 image px", async () => {
      await detected();
      useOcr.getState().setScope({ x: 20, y: 80, w: 7, h: 140 });
      expect(useOcr.getState().scope).toBe(null);
    });

    it("ignores a box with OCR off or before a result exists", async () => {
      useOcr.getState().setKey("/img/two.png");
      useOcr.setState({ mode: true }); // no result yet
      useOcr.getState().setScope(RECT);
      expect(useOcr.getState().scope).toBe(null);
      await detected();
      useOcr.setState({ mode: false });
      useOcr.getState().setScope(RECT);
      expect(useOcr.getState().scope).toBe(null);
    });

    it("toasts No text found when the box holds no text", async () => {
      await detected();
      toast.mockReset();
      useOcr.getState().setScope({ x: 600, y: 400, w: 100, h: 100 });
      expect(useOcr.getState().scope!.lines).toEqual([]);
      expect(toast).toHaveBeenCalledWith("No text found");
    });

    it("clearScope, toggling off, a new key and reset all clear the scope", async () => {
      await detected();
      useOcr.getState().setScope(RECT);
      useOcr.getState().clearScope();
      expect(useOcr.getState().scope).toBe(null);
      expect(visibleLines(useOcr.getState())).toHaveLength(4);

      useOcr.getState().setScope(RECT);
      await useOcr.getState().toggle(); // off
      expect(useOcr.getState().scope).toBe(null);

      await useOcr.getState().toggle(); // on again (cached)
      useOcr.getState().setScope(RECT);
      useOcr.getState().setKey("/img/other.png");
      expect(useOcr.getState().scope).toBe(null);

      useOcr.getState().setKey("/img/two.png");
      useOcr.getState().setScope(RECT);
      expect(useOcr.getState().scope).not.toBe(null);
      useOcr.getState().reset();
      expect(useOcr.getState().scope).toBe(null);
    });

    it("an engine switch that drops the cache also drops the scope", async () => {
      await detected();
      useOcr.getState().setScope(RECT);
      const s = useSettings.getState();
      useSettings.setState({ config: { ...s.config, general: { ...s.config.general, ocrEngine: "openthai" } } });
      try {
        await useOcr.getState().detect();
        expect(useOcr.getState().scope).toBe(null);
      } finally {
        useSettings.setState({ config: s.config });
      }
    });

    it("the first detection toast carries the scope hint once per session", async () => {
      detectText.mockResolvedValue(fake("hello"));
      useOcr.getState().setKey("/img/a.png");
      await useOcr.getState().detect();
      expect(toastSuccess).toHaveBeenLastCalledWith("Detected 1 text line", {
        description: "Drag a box to copy only part of the text",
      });
      useOcr.getState().reset();
      expect(useOcr.getState().scopeHintShown).toBe(true); // survives reset
      useOcr.getState().setKey("/img/b.png");
      await useOcr.getState().detect();
      expect(toastSuccess.mock.lastCall).toEqual(["Detected 1 text line"]);
    });
  });
});
