// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsNav } from "@/lib/settingsNav";
import {
  SETTING_IDS,
  settingDef,
  settingsForPage,
  type PageId,
  type SettingId,
} from "./registry";
import { CapturePage } from "./pages/CapturePage";
import { EditorPage } from "./pages/EditorPage";
import { AfterCapturePage } from "./pages/AfterCapturePage";
import { LibraryPage } from "./pages/LibraryPage";
import { AppPage } from "./pages/AppPage";

let platform: "mac" | "win" = "mac";

vi.mock("@/lib/shortcuts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shortcuts")>();
  return { ...actual, currentPlatform: () => platform };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: vi.fn(),
  disable: vi.fn(),
  isEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/installId", () => ({ setShareInstallId: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.13.0"),
  getTauriVersion: vi.fn().mockResolvedValue("2.8.0"),
}));

/**
 * Rows that only exist in a particular configuration — a quality field that
 * appears once its format is chosen. They are allowed to be missing from a
 * render; everything else must be on screen.
 */
const CONDITIONAL: SettingId[] = ["after.quality", "after.tempQuality"];

const PAGE_COMPONENTS: Record<PageId, () => React.ReactElement> = {
  capture: () => <CapturePage />,
  editor: () => <EditorPage />,
  after: () => <AfterCapturePage />,
  library: () => <LibraryPage />,
  app: () => <AppPage onOpenInertRecovery={() => {}} />,
};

function renderedIds(page: PageId): Set<string> {
  // Advanced folds start closed; open them so the whole page is on screen.
  useSettingsNav.getState().setAdvanced(page, true);
  const { container } = render(PAGE_COMPONENTS[page]());
  return new Set(
    [...container.querySelectorAll("[data-setting-id]")].map(
      (el) => (el as HTMLElement).dataset.settingId!,
    ),
  );
}

beforeEach(() => {
  useSettingsNav.getState().resetNav();
  // Settings hydrate from defaults in the web/test runtime, so pages render
  // with the shipped configuration.
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("pages render exactly what the registry describes", () => {
  for (const platformUnderTest of ["mac", "win"] as const) {
    describe(`on ${platformUnderTest}`, () => {
      beforeEach(() => {
        platform = platformUnderTest;
      });

      for (const page of Object.keys(PAGE_COMPONENTS) as PageId[]) {
        it(`${page} shows every registered row`, () => {
          const shown = renderedIds(page);
          const expected = settingsForPage(page, platformUnderTest).filter(
            (id) => !CONDITIONAL.includes(id),
          );
          const missing = expected.filter((id) => !shown.has(id));
          expect(missing, `missing from the ${page} page`).toEqual([]);
        });

        it(`${page} renders nothing the registry does not know`, () => {
          const shown = [...renderedIds(page)];
          const stray = shown.filter(
            (id) => !SETTING_IDS.includes(id as SettingId),
          );
          expect(stray, `rendered but unregistered on ${page}`).toEqual([]);
        });

        it(`${page} keeps each row on its own page`, () => {
          for (const id of renderedIds(page)) {
            expect(settingDef(id as SettingId).page, `${id} is on the wrong page`).toBe(
              page,
            );
          }
        });
      }

      it("hides rows belonging to the other platform", () => {
        const capture = renderedIds("capture");
        const app = renderedIds("app");
        if (platformUnderTest === "win") {
          expect(capture.has("capture.sysArea")).toBe(false);
          expect(app.has("app.tcc")).toBe(false);
        } else {
          expect(capture.has("capture.sysArea")).toBe(true);
          expect(app.has("app.tcc")).toBe(true);
        }
      });
    });
  }
});
