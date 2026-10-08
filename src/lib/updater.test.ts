import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateStatus } from "./appVersion";

const check = vi.fn();
const ask = vi.fn();
const relaunch = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({ check: (...a: unknown[]) => check(...a) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: (...a: unknown[]) => ask(...a) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunch() }));
vi.mock("@/lib/installId", () => ({ installIdHeaders: async () => undefined }));

const settings = {
  config: { workspaces: { enabled: false }, updates: { skippedVersion: null as string | null } },
  update: async () => {},
};
vi.mock("@/stores/settings", () => ({ useSettings: { getState: () => settings } }));

const editor = { hasImage: false, annotations: [] as unknown[] };
vi.mock("@/stores/editor", () => ({ useEditor: { getState: () => editor } }));

const workspaces = {
  activeId: null as string | null,
  docs: {} as Record<string, { image: { kind: string } | null }>,
  commitActive: vi.fn(),
  flushPersist: vi.fn(async () => {}),
};
vi.mock("@/stores/workspaces", () => ({ useWorkspaces: { getState: () => workspaces } }));

const { checkForUpdates, promptAndInstall, unsavedWorkWarning } = await import("./updater");

beforeEach(() => {
  check.mockReset();
  ask.mockReset();
  relaunch.mockReset();
  useUpdateStatus.setState({ state: "idle" }, true);
  settings.config.workspaces.enabled = false;
  settings.config.updates.skippedVersion = null;
  editor.hasImage = false;
  editor.annotations = [];
  workspaces.activeId = null;
  workspaces.docs = {};
  workspaces.commitActive.mockReset();
  workspaces.flushPersist.mockReset();
  workspaces.flushPersist.mockImplementation(async () => {});
});

describe("checkForUpdates reports what the footer shows", () => {
  it("says the app is up to date when nothing is offered", async () => {
    check.mockResolvedValue(null);
    const r = await checkForUpdates();
    expect(r.kind).toBe("none");
    expect(useUpdateStatus.getState().state).toBe("ok");
  });

  it("names the version when one is available", async () => {
    check.mockResolvedValue({
      available: true,
      version: "0.14.0",
      body: "notes",
      downloadAndInstall: async () => {},
    });
    const r = await checkForUpdates();
    expect(r.kind).toBe("available");
    const status = useUpdateStatus.getState();
    expect(status).toMatchObject({ state: "available", version: "0.14.0" });
  });

  it("records a failure instead of leaving a stale success", async () => {
    check.mockRejectedValue(new Error("offline"));
    const r = await checkForUpdates();
    expect(r.kind).toBe("error");
    expect(useUpdateStatus.getState()).toMatchObject({
      state: "error",
      error: "offline",
    });
  });

  it("shows that a check is in flight while it runs", async () => {
    let release: (v: unknown) => void = () => {};
    check.mockReturnValue(new Promise((r) => (release = r)));
    const pending = checkForUpdates();
    expect(useUpdateStatus.getState().state).toBe("checking");
    release(null);
    await pending;
    expect(useUpdateStatus.getState().state).toBe("ok");
  });
});

describe("unsavedWorkWarning says what an update relaunch would lose", () => {
  it("is empty when the editor holds nothing", () => {
    expect(unsavedWorkWarning()).toBe("");
  });

  it("warns about the image when workspaces are off", () => {
    editor.hasImage = true;
    expect(unsavedWorkWarning()).toMatch(/will be lost/);
  });

  it("warns about annotations when workspaces are off", () => {
    editor.annotations = [{ id: "a" }];
    expect(unsavedWorkWarning()).toMatch(/will be lost/);
  });

  it("stays quiet for a file-backed workspace, which is flushed", () => {
    settings.config.workspaces.enabled = true;
    editor.hasImage = true;
    workspaces.activeId = "w1";
    workspaces.docs = { w1: { image: { kind: "file" } } };
    expect(unsavedWorkWarning()).toBe("");
  });

  it("warns about a pasted image even with workspaces on", () => {
    settings.config.workspaces.enabled = true;
    editor.hasImage = true;
    workspaces.activeId = "w1";
    workspaces.docs = { w1: { image: { kind: "blob" } } };
    expect(unsavedWorkWarning()).toMatch(/pasted/);
  });
});

describe("installing an update", () => {
  function offer(log: string[]) {
    check.mockResolvedValue({
      available: true,
      version: "9.9.9",
      body: "notes",
      download: async () => void log.push("download"),
      install: async () => void log.push("install"),
    });
    relaunch.mockImplementation(async () => void log.push("relaunch"));
    workspaces.commitActive.mockImplementation(() => void log.push("commit"));
    workspaces.flushPersist.mockImplementation(async () => void log.push("flush"));
  }

  async function install() {
    const r = await checkForUpdates();
    if (r.kind !== "available") throw new Error("expected an update");
    await r.downloadAndInstall();
  }

  it("saves the workspaces after downloading and before installing", async () => {
    settings.config.workspaces.enabled = true;
    const log: string[] = [];
    offer(log);
    await install();
    expect(log).toEqual(["download", "commit", "flush", "install", "relaunch"]);
  });

  it("does not touch workspaces when they are off", async () => {
    const log: string[] = [];
    offer(log);
    await install();
    expect(log).toEqual(["download", "install", "relaunch"]);
  });

  it("still installs if saving fails", async () => {
    settings.config.workspaces.enabled = true;
    const log: string[] = [];
    offer(log);
    workspaces.flushPersist.mockRejectedValue(new Error("disk full"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await install();
    expect(log).toEqual(["download", "commit", "install", "relaunch"]);
  });

  it("puts the warning into the update prompt", async () => {
    editor.hasImage = true;
    ask.mockResolvedValue(false);
    await promptAndInstall({
      kind: "available",
      version: "9.9.9",
      body: "notes",
      downloadAndInstall: async () => {},
    });
    const message = ask.mock.calls[0][0] as string;
    expect(message).toContain("9.9.9");
    expect(message).toMatch(/will be lost/);
    expect(message.indexOf("will be lost")).toBeLessThan(message.indexOf("install now?"));
  });

  it("leaves the prompt as before when there is nothing to lose", async () => {
    ask.mockResolvedValue(false);
    await promptAndInstall({
      kind: "available",
      version: "9.9.9",
      body: "notes",
      downloadAndInstall: async () => {},
    });
    expect(ask.mock.calls[0][0]).toBe(
      "Version 9.9.9 is available.\n\nnotes\n\nDownload and install now?",
    );
  });
});
