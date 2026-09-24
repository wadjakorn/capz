import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS, type SettingId } from "@/components/settings/registry";
import {
  isNewSetting,
  isNewerVersion,
  markPageSeen,
  pagesWithNewSettings,
  useSeenSettings,
} from "./settingNews";

/**
 * The registry ships with no `addedIn` — nothing is new until a genuinely new
 * setting lands — so these tests stamp one in to exercise the logic.
 */
function withAddedIn(id: SettingId, version: string | undefined) {
  const def = SETTINGS[id] as { addedIn?: string };
  const before = def.addedIn;
  def.addedIn = version;
  return () => {
    def.addedIn = before;
  };
}

beforeEach(() => {
  useSeenSettings.getState().reset();
});

describe("isNewerVersion", () => {
  it("compares each part in turn", () => {
    expect(isNewerVersion("0.14.0", "0.13.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("0.13.0", "0.13.0")).toBe(false);
    expect(isNewerVersion("0.13.0", "0.14.0")).toBe(false);
  });
});

describe("isNewSetting", () => {
  it("is true for a setting added after the version last seen", () => {
    const restore = withAddedIn("after.onClose", "0.14.0");
    expect(isNewSetting("after.onClose", "0.13.0")).toBe(true);
    restore();
  });

  it("is false on a fresh install, which has seen nothing to compare against", () => {
    const restore = withAddedIn("after.onClose", "0.14.0");
    expect(isNewSetting("after.onClose", "")).toBe(false);
    restore();
  });

  it("is false for settings that were always there", () => {
    expect(isNewSetting("after.folder", "0.1.0")).toBe(false);
  });
});

describe("pagesWithNewSettings", () => {
  it("dots only the page holding the new row", () => {
    const restore = withAddedIn("library.clear", "0.14.0");
    const pages = pagesWithNewSettings("0.13.0", "mac", new Set());
    expect([...pages]).toEqual(["library"]);
    restore();
  });

  it("ignores rows this platform never shows", () => {
    const restore = withAddedIn("app.tcc", "0.14.0");
    expect(pagesWithNewSettings("0.13.0", "win", new Set()).size).toBe(0);
    expect(pagesWithNewSettings("0.13.0", "mac", new Set()).has("app")).toBe(true);
    restore();
  });

  it("drops a page once its new rows have been seen", () => {
    const restore = withAddedIn("library.clear", "0.14.0");
    const seen = new Set<SettingId>(["library.clear"]);
    expect(pagesWithNewSettings("0.13.0", "mac", seen).size).toBe(0);
    restore();
  });
});

describe("markPageSeen", () => {
  it("adopts the running version on a fresh install without badging anything", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    await markPageSeen("capture", "mac", {
      lastSeen: "",
      appVersion: "0.14.0",
      update,
    });
    expect(update).toHaveBeenCalledWith({ lastSeenSettingsVersion: "0.14.0" });
  });

  it("waits for the last page before moving the version stamp", async () => {
    const restoreA = withAddedIn("library.clear", "0.14.0");
    const restoreB = withAddedIn("capture.sound", "0.14.0");
    const update = vi.fn().mockResolvedValue(undefined);

    await markPageSeen("library", "mac", {
      lastSeen: "0.13.0",
      appVersion: "0.14.0",
      update,
    });
    expect(update).not.toHaveBeenCalled();

    await markPageSeen("capture", "mac", {
      lastSeen: "0.13.0",
      appVersion: "0.14.0",
      update,
    });
    expect(update).toHaveBeenCalledWith({ lastSeenSettingsVersion: "0.14.0" });

    restoreA();
    restoreB();
  });

  it("is not blocked by a new row the platform cannot show", async () => {
    // A mac-only row could never be rendered on Windows, so waiting for the
    // user to "see" it would strand the badge forever.
    const restore = withAddedIn("app.tcc", "0.14.0");
    const update = vi.fn().mockResolvedValue(undefined);
    await markPageSeen("capture", "win", {
      lastSeen: "0.13.0",
      appVersion: "0.14.0",
      update,
    });
    expect(update).toHaveBeenCalledWith({ lastSeenSettingsVersion: "0.14.0" });
    restore();
  });

  it("does nothing until the app version is known", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    await markPageSeen("capture", "mac", {
      lastSeen: "0.13.0",
      appVersion: null,
      update,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("writes nothing when there is nothing new to record", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    await markPageSeen("capture", "mac", {
      lastSeen: "0.13.0",
      appVersion: "0.13.0",
      update,
    });
    expect(update).not.toHaveBeenCalled();
  });
});
