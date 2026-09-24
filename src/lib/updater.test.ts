import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateStatus } from "./appVersion";

const check = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({ check: (...a: unknown[]) => check(...a) }));
vi.mock("@/lib/installId", () => ({ installIdHeaders: async () => undefined }));
vi.mock("@/stores/settings", () => ({
  useSettings: { getState: () => ({ update: async () => {} }) },
}));

const { checkForUpdates } = await import("./updater");

beforeEach(() => {
  check.mockReset();
  useUpdateStatus.setState({ state: "idle" }, true);
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
