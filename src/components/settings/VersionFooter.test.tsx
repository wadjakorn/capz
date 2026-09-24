// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setUpdateStatus } from "@/lib/appVersion";
import { useSettingsNav } from "@/lib/settingsNav";
import { useSettings } from "@/stores/settings";
import { VersionFooter } from "./VersionFooter";

vi.mock("@/lib/appVersion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appVersion")>();
  return { ...actual, useAppVersion: () => "0.13.0" };
});

function setUpdatePrefs(patch: { autoCheck?: boolean; lastCheckedAt?: number | null }) {
  const state = useSettings.getState();
  useSettings.setState({
    config: {
      ...state.config,
      updates: { ...state.config.updates, ...patch },
    },
  });
}

beforeEach(() => {
  useSettingsNav.getState().resetNav();
  setUpdateStatus({ state: "idle" });
  setUpdatePrefs({ autoCheck: true, lastCheckedAt: null });
});

afterEach(cleanup);

describe("VersionFooter", () => {
  it("always shows which version is running", () => {
    render(<VersionFooter />);
    expect(screen.getByText("capz 0.13.0")).toBeTruthy();
  });

  it("says a check is running", () => {
    setUpdateStatus({ state: "checking" });
    render(<VersionFooter />);
    expect(screen.getByText("Checking for updates…")).toBeTruthy();
  });

  it("names the available version", () => {
    setUpdateStatus({ state: "available", version: "0.14.0", at: Date.now() });
    render(<VersionFooter />);
    expect(screen.getByText("Update available: 0.14.0")).toBeTruthy();
  });

  it("does not pass a failed check off as up to date", () => {
    setUpdateStatus({ state: "error", error: "offline", at: Date.now() });
    render(<VersionFooter />);
    expect(screen.getByText("Last check failed")).toBeTruthy();
  });

  it("explains the silence when automatic checks are off", () => {
    setUpdatePrefs({ autoCheck: false, lastCheckedAt: Date.now() });
    render(<VersionFooter />);
    expect(screen.getByText("Automatic checks are off")).toBeTruthy();
  });

  it("falls back to when it last looked", () => {
    setUpdatePrefs({ autoCheck: true, lastCheckedAt: Date.now() - 2 * 3600_000 });
    render(<VersionFooter />);
    expect(screen.getByText("Checked 2h ago")).toBeTruthy();
  });

  it("opens the update setting when clicked", () => {
    render(<VersionFooter />);
    screen.getByRole("button").click();
    const nav = useSettingsNav.getState();
    expect(nav.page).toBe("app");
    expect(nav.target).toBe("app.updates");
  });
});
