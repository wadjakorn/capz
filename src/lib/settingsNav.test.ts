import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  openSettings,
  openSettingsFromPayload,
  openSettingsPage,
  useSettingsNav,
} from "./settingsNav";

beforeEach(() => {
  useSettingsNav.getState().resetNav();
});

describe("openSettings", () => {
  it("lands on the row's page and marks it as the target", () => {
    openSettings("after.folder");
    const s = useSettingsNav.getState();
    expect(s.page).toBe("after");
    expect(s.target).toBe("after.folder");
  });

  it("unfolds Advanced when the row is filed there", () => {
    openSettings("after.onClose");
    expect(useSettingsNav.getState().advOpen.after).toBe(true);
  });

  it("leaves Advanced alone for an everyday row", () => {
    openSettings("after.folder");
    expect(useSettingsNav.getState().advOpen.after).toBeUndefined();
  });

  it("does not fold Advanced back up on another page", () => {
    openSettings("after.onClose");
    openSettings("library.workspaces");
    expect(useSettingsNav.getState().advOpen.after).toBe(true);
  });

  it("re-triggers when the same row is asked for twice", () => {
    openSettings("after.format");
    const first = useSettingsNav.getState().nonce;
    openSettings("after.format");
    expect(useSettingsNav.getState().nonce).toBe(first + 1);
  });

  it("survives being called before the view exists", () => {
    // The whole point of a store: this is the "emit into an unmounted
    // listener" case that used to drop the request entirely.
    openSettings("library.history");
    const mountedLater = useSettingsNav.getState();
    expect(mountedLater.page).toBe("library");
    expect(mountedLater.target).toBe("library.history");
  });

  it("clears the target once the view has acted on it", () => {
    openSettings("library.history");
    useSettingsNav.getState().consumeTarget();
    expect(useSettingsNav.getState().target).toBeNull();
    expect(useSettingsNav.getState().page).toBe("library");
  });
});

describe("openSettingsPage", () => {
  it("switches page without targeting a row", () => {
    openSettingsPage("app");
    expect(useSettingsNav.getState().page).toBe("app");
    expect(useSettingsNav.getState().target).toBeNull();
  });
});

describe("openSettingsFromPayload", () => {
  it("accepts a known id", () => {
    expect(openSettingsFromPayload("app.updates")).toBe(true);
    expect(useSettingsNav.getState().page).toBe("app");
  });

  it("ignores anything else and stays put", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(openSettingsFromPayload("output")).toBe(false);
    expect(openSettingsFromPayload(null)).toBe(false);
    expect(useSettingsNav.getState().page).toBe("capture");
    expect(useSettingsNav.getState().target).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("advanced fold", () => {
  it("toggles per page", () => {
    const { toggleAdvanced, setAdvanced } = useSettingsNav.getState();
    toggleAdvanced("editor");
    expect(useSettingsNav.getState().advOpen.editor).toBe(true);
    toggleAdvanced("editor");
    expect(useSettingsNav.getState().advOpen.editor).toBe(false);
    setAdvanced("editor", true);
    expect(useSettingsNav.getState().advOpen.editor).toBe(true);
  });
});
