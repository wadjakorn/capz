import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CONFIG, type AppConfig } from "@/lib/config";
import { useSettings } from "@/stores/settings";

const copyOnly = vi.fn(async () => ({ copied: true }));
const saveOnly = vi.fn(async () => ({ saved: true }));
const saveAndCopy = vi.fn(async () => ({ saved: true, copied: true }));
vi.mock("@/lib/exportImage", () => ({ copyOnly, saveOnly, saveAndCopy }));
vi.mock("@/lib/stageBridge", () => ({ getStage: () => ({}) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { runPreCloseAction } = await import("./preClose");

function setCloseAction(closeAction: AppConfig["general"]["closeAction"]) {
  useSettings.setState({
    config: { ...DEFAULT_CONFIG, general: { ...DEFAULT_CONFIG.general, closeAction } },
  });
}

describe("runPreCloseAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies on close by default", async () => {
    setCloseAction("copy");
    await runPreCloseAction();
    expect(copyOnly).toHaveBeenCalledTimes(1);
  });

  describe("after the ⌘C shortcut already copied (CP-0067)", () => {
    it("copy: does not copy a second time", async () => {
      setCloseAction("copy");
      await runPreCloseAction({ alreadyCopied: true });
      expect(copyOnly).not.toHaveBeenCalled();
      expect(saveAndCopy).not.toHaveBeenCalled();
    });

    it("both: still saves, without copying again", async () => {
      setCloseAction("both");
      await runPreCloseAction({ alreadyCopied: true });
      expect(saveOnly).toHaveBeenCalledTimes(1);
      expect(saveAndCopy).not.toHaveBeenCalled();
      expect(copyOnly).not.toHaveBeenCalled();
    });

    it("file: saves as usual", async () => {
      setCloseAction("file");
      await runPreCloseAction({ alreadyCopied: true });
      expect(saveOnly).toHaveBeenCalledTimes(1);
    });

    it("none: does nothing", async () => {
      setCloseAction("none");
      await runPreCloseAction({ alreadyCopied: true });
      expect(saveOnly).not.toHaveBeenCalled();
      expect(copyOnly).not.toHaveBeenCalled();
    });
  });
});
