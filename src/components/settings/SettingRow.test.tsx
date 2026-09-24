// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSettings, useSettingsNav } from "@/lib/settingsNav";
import { SettingRow } from "./SettingRow";

vi.mock("@/lib/shortcuts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shortcuts")>();
  return { ...actual, currentPlatform: () => platform };
});

let platform: "mac" | "win" = "mac";

beforeEach(() => {
  platform = "mac";
  useSettingsNav.getState().resetNav();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  // Vitest runs without globals, so RTL does not auto-clean between tests and
  // a leftover row would keep consuming navigation targets.
  cleanup();
  vi.restoreAllMocks();
});

describe("SettingRow", () => {
  it("takes its label from the registry and tags the row with its id", () => {
    const { container } = render(
      <SettingRow id="after.format">
        <button type="button">PNG</button>
      </SettingRow>,
    );
    expect(screen.getByText("File format")).toBeTruthy();
    expect(container.querySelector('[data-setting-id="after.format"]')).toBeTruthy();
  });

  it("shows a hint when given one", () => {
    render(
      <SettingRow id="after.edge" hint="Limits the longest edge">
        <input aria-label="edge" />
      </SettingRow>,
    );
    expect(screen.getByText("Limits the longest edge")).toBeTruthy();
  });

  it("renders nothing on the wrong platform", () => {
    platform = "win";
    const { container } = render(
      <SettingRow id="app.tcc">
        <button type="button">Fix</button>
      </SettingRow>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("scrolls to, focuses and flashes the row it was asked for", async () => {
    openSettings("after.format");
    const { container } = render(
      <SettingRow id="after.format">
        <button type="button">PNG</button>
      </SettingRow>,
    );

    await vi.waitFor(() => {
      const row = container.querySelector<HTMLElement>('[data-setting-id="after.format"]');
      expect(row?.dataset.flash).toBe("true");
    });
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("PNG");
    // Consumed, so an unrelated re-render does not flash it again.
    expect(useSettingsNav.getState().target).toBeNull();
  });

  it("leaves other rows alone", async () => {
    openSettings("after.format");
    const { container } = render(
      <SettingRow id="after.folder">
        <button type="button">Choose</button>
      </SettingRow>,
    );
    await Promise.resolve();
    const row = container.querySelector<HTMLElement>('[data-setting-id="after.folder"]');
    expect(row?.dataset.flash).toBeUndefined();
  });

  it("waits until settings have loaded before jumping", async () => {
    openSettings("after.format");
    const { container } = render(
      <SettingRow id="after.format" ready={false}>
        <button type="button">PNG</button>
      </SettingRow>,
    );
    await Promise.resolve();
    const row = container.querySelector<HTMLElement>('[data-setting-id="after.format"]');
    expect(row?.dataset.flash).toBeUndefined();
    expect(useSettingsNav.getState().target).toBe("after.format");
  });
});
