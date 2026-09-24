"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSettings } from "@/stores/settings";
import { useAppVersion } from "@/lib/appVersion";
import { markPageSeen } from "@/lib/settingNews";
import { currentPlatform } from "@/lib/shortcuts";
import { useSettingsNav } from "@/lib/settingsNav";
import { SettingsSidebar } from "./SettingsSidebar";
import { CapturePage } from "./pages/CapturePage";
import { EditorPage } from "./pages/EditorPage";
import { AfterCapturePage } from "./pages/AfterCapturePage";
import { LibraryPage } from "./pages/LibraryPage";
import { AppPage } from "./pages/AppPage";
import { pageDef } from "./registry";

/**
 * Settings, as a view inside the editor window (CP-0053).
 *
 * Where to land is no longer a prop or an event: `openSettings(id)` writes to a
 * store, which is still there when this component mounts a moment later. See
 * `lib/settingsNav` for why that matters.
 */
export function SettingsView({
  onOpenInertRecovery,
}: {
  /** Opens the macOS screen-recording recovery flow, owned by the editor. */
  onOpenInertRecovery?: () => void;
} = {}) {
  const { config, ready, init, update } = useSettings();
  // The autosave toast reacts to this signature. Bookkeeping the user never
  // asked for — which settings they have seen, which tips they dismissed —
  // is left out, so opening a page never announces "Saved".
  const configSig = JSON.stringify({
    ...config,
    general: {
      ...config.general,
      lastSeenSettingsVersion: null,
      dismissedSuggestions: null,
    },
  });
  const firstSig = useRef<string | null>(null);
  const page = useSettingsNav((s) => s.page);
  const searchRef = useRef<HTMLInputElement>(null);
  const appVersion = useAppVersion();
  const lastSeen = config.general.lastSeenSettingsVersion;

  // Looking at a page is what clears its "New" badges.
  useEffect(() => {
    if (!ready) return;
    void markPageSeen(page, currentPlatform(), {
      lastSeen,
      appVersion,
      update: (patch) => update("general", patch),
    });
  }, [page, ready, lastSeen, appVersion, update]);

  useEffect(() => {
    init();
  }, [init]);

  // Find, scoped to this view: Settings owns the only search field on screen,
  // and the editor's own shortcuts do not claim this one.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (firstSig.current === null) {
      firstSig.current = configSig;
      return;
    }
    if (configSig === firstSig.current) return;
    firstSig.current = configSig;
    const t = setTimeout(() => {
      toast.success("Saved", { id: "settings-saved", duration: 1400 });
    }, 400);
    return () => clearTimeout(t);
  }, [configSig, ready]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const def = pageDef(page);

  return (
    <div className="min-h-full px-6 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl gap-6">
        <SettingsSidebar searchRef={searchRef} />

        <main className="surface min-w-0 flex-1 p-8 max-[720px]:p-5">
          <header className="mb-6">
            {/* h2: the window chrome already owns the page's h1 ("Settings"). */}
            <h2 className="headline">{def.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{def.lede}</p>
          </header>

          {page === "capture" && <CapturePage />}
          {page === "editor" && <EditorPage />}
          {page === "after" && <AfterCapturePage />}
          {page === "library" && <LibraryPage />}
          {page === "app" && <AppPage onOpenInertRecovery={onOpenInertRecovery} />}
        </main>
      </div>
    </div>
  );
}
