"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingRow } from "@/components/settings/SettingRow";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { FeedbackTab } from "@/components/settings/FeedbackTab";
import { setShareInstallId } from "@/lib/installId";
import { currentPlatform } from "@/lib/shortcuts";
import { useSettings } from "@/stores/settings";

/** Startup, updates, privacy and the things you only touch when stuck. */
export function AppPage({
  onOpenInertRecovery,
}: {
  /** Opens the macOS screen-recording permission recovery flow. */
  onOpenInertRecovery?: () => void;
}) {
  const { config, update, reset } = useSettings();
  const u = config.updates;
  const isMac = currentPlatform() === "mac";
  const [checking, setChecking] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [about, setAbout] = useState<{ app: string; tauri: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { getVersion, getTauriVersion } = await import("@tauri-apps/api/app");
        const [app, tauri] = await Promise.all([getVersion(), getTauriVersion()]);
        setAbout({ app, tauri });
      } catch (e) {
        console.warn("about info failed", e);
      }
    })();
  }, []);

  // The OS is the source of truth for autostart: a user can revoke it outside
  // the app, so mirror what it actually reports back into the config.
  useEffect(() => {
    (async () => {
      try {
        const on = await isAutostartEnabled();
        if (on !== config.general.autostart) await update("general", { autostart: on });
      } catch (e) {
        console.warn("autostart isEnabled failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyAutostart(v: boolean) {
    try {
      if (v) await enableAutostart();
      else await disableAutostart();
      await update("general", { autostart: v });
    } catch (e) {
      console.error("autostart toggle failed", e);
    }
  }

  async function onCheckNow() {
    setChecking(true);
    try {
      const { checkForUpdates, promptAndInstall } = await import("@/lib/updater");
      const r = await checkForUpdates();
      if (r.kind === "none") toast("You are on the latest version.");
      else if (r.kind === "error")
        toast.error("Update check failed", { description: r.error });
      else await promptAndInstall(r);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SettingToggle
          id="app.login"
          checked={config.general.autostart}
          onChange={applyAutostart}
        />
        <SettingToggle
          id="app.updates"
          checked={u.autoCheck}
          onChange={(v) => update("updates", { autoCheck: v })}
        />
        <SettingRow
          id="app.about"
          hint={
            about
              ? `Tauri ${about.tauri} · ${currentPlatform() === "mac" ? "macOS" : "Windows"}`
              : "loading…"
          }
        >
          <span className="text-sm text-muted-foreground">
            {about ? `v${about.app}` : "—"}
          </span>
        </SettingRow>
        <SettingRow id="app.feedback" hint="Anonymous. Goes straight to the developer.">
          <button
            type="button"
            className="btn btn--secondary"
            aria-expanded={showFeedback}
            onClick={() => setShowFeedback((v) => !v)}
          >
            {showFeedback ? "Hide" : "Write…"}
          </button>
        </SettingRow>
        {showFeedback && (
          <div className="rounded-xl border border-border p-4">
            <FeedbackTab />
          </div>
        )}
      </SectionCard>

      <AdvancedSection page="app">
        <SettingToggle
          id="app.installId"
          hint="A random ID sent with update checks so installs can be counted. Turning it off deletes it."
          checked={u.shareInstallId}
          onChange={(v) => void setShareInstallId(v)}
        />

        <SettingRow id="app.interval">
          <select
            className="field"
            value={u.checkIntervalHours}
            onChange={(e) =>
              update("updates", { checkIntervalHours: Number(e.target.value) })
            }
            aria-label="Check interval"
          >
            <option value={6}>Every 6 hours</option>
            <option value={24}>Every 24 hours</option>
            <option value={168}>Every 7 days</option>
          </select>
        </SettingRow>

        <SettingRow
          id="app.lastChecked"
          hint={u.lastCheckedAt ? new Date(u.lastCheckedAt).toLocaleString() : "never"}
        >
          <button
            type="button"
            onClick={onCheckNow}
            disabled={checking}
            className="btn btn--secondary"
          >
            {checking ? "Checking…" : "Check now"}
          </button>
        </SettingRow>

        <SettingRow id="app.skipped" hint={u.skippedVersion ?? "none"}>
          <button
            type="button"
            disabled={!u.skippedVersion}
            onClick={() => update("updates", { skippedVersion: null })}
            className="btn btn--secondary"
          >
            Clear
          </button>
        </SettingRow>

        <SettingRow id="app.onboarding" hint="Opens the welcome and permissions flow again.">
          <button
            type="button"
            onClick={async () => {
              await update("general", { onboardingCompleted: false });
              try {
                await invoke("show_onboarding_window");
              } catch (e) {
                console.error("show_onboarding_window failed", e);
              }
            }}
            className="btn btn--secondary"
          >
            Run setup
          </button>
        </SettingRow>

        {isMac && onOpenInertRecovery && (
          <SettingRow
            id="app.tcc"
            hint="Removes the stale permission entry, relaunches, and asks again."
          >
            <button
              type="button"
              onClick={onOpenInertRecovery}
              className="btn btn--secondary"
            >
              Fix…
            </button>
          </SettingRow>
        )}

        <SettingRow id="app.reset" hint="Restores every default. Cannot be undone.">
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Reset all settings to defaults?")) return;
              await reset();
              toast.success("Settings reset", { duration: 1600 });
            }}
            className="btn btn--secondary text-rose-300 hover:text-rose-200"
          >
            Reset…
          </button>
        </SettingRow>
      </AdvancedSection>
    </div>
  );
}
