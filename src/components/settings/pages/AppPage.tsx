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
import { LANGS, type Lang } from "@/i18n/store";
import { useT } from "@/i18n/useT";

/**
 * Each language is named in itself, so whichever one is showing, the user can
 * find their own — never translated.
 */
const LANGUAGE_NAMES: Record<Lang, string> = { th: "ไทย", en: "English" };

/** Startup, updates, privacy and the things you only touch when stuck. */
export function AppPage({
  onOpenInertRecovery,
}: {
  /** Opens the macOS screen-recording permission recovery flow. */
  onOpenInertRecovery?: () => void;
}) {
  const { t } = useT();
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
      if (r.kind === "none") toast(t("settings.app.latest"));
      else if (r.kind === "error")
        toast.error(t("settings.app.checkFailed"), { description: r.error });
      else await promptAndInstall(r);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SettingRow id="app.language">
          <div className="segmented" role="radiogroup" aria-label={t("settings.app.language")}>
            {LANGS.map((value) => {
              const active = config.general.language === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-active={active ? "true" : undefined}
                  lang={value}
                  onClick={() => void update("general", { language: value })}
                  className="segmented-item whitespace-nowrap"
                >
                  {LANGUAGE_NAMES[value]}
                </button>
              );
            })}
          </div>
        </SettingRow>
        <SettingRow id="app.theme" hint={t("settings.app.theme.hint")}>
          <select
            className="field"
            value={config.general.theme}
            onChange={(e) =>
              update("general", {
                theme: e.target.value as "light" | "dark" | "system",
              })
            }
            aria-label={t("settings.app.theme")}
          >
            <option value="dark">{t("settings.app.theme.dark")}</option>
            <option value="light">{t("settings.app.theme.light")}</option>
            <option value="system">{t("settings.app.theme.system")}</option>
          </select>
        </SettingRow>
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
              : t("settings.app.about.loading")
          }
        >
          <span className="text-sm text-muted-foreground">
            {about ? `v${about.app}` : "—"}
          </span>
        </SettingRow>
        <SettingRow id="app.feedback" hint={t("settings.app.feedback.hint")}>
          <button
            type="button"
            className="btn btn--secondary"
            aria-expanded={showFeedback}
            onClick={() => setShowFeedback((v) => !v)}
          >
            {showFeedback ? t("settings.hide") : t("settings.app.feedback.write")}
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
          hint={t("settings.app.installId.hint")}
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
            aria-label={t("settings.app.interval")}
          >
            <option value={6}>{t("settings.app.interval.6")}</option>
            <option value={24}>{t("settings.app.interval.24")}</option>
            <option value={168}>{t("settings.app.interval.168")}</option>
          </select>
        </SettingRow>

        <SettingRow
          id="app.lastChecked"
          hint={
            u.lastCheckedAt
              ? new Date(u.lastCheckedAt).toLocaleString()
              : t("settings.app.lastChecked.never")
          }
        >
          <button
            type="button"
            onClick={onCheckNow}
            disabled={checking}
            className="btn btn--secondary"
          >
            {checking ? t("settings.app.lastChecked.checking") : t("settings.app.lastChecked.checkNow")}
          </button>
        </SettingRow>

        <SettingRow id="app.skipped" hint={u.skippedVersion ?? t("settings.app.skipped.none")}>
          <button
            type="button"
            disabled={!u.skippedVersion}
            onClick={() => update("updates", { skippedVersion: null })}
            className="btn btn--secondary"
          >
            {t("settings.clear")}
          </button>
        </SettingRow>

        <SettingRow id="app.onboarding" hint={t("settings.app.onboarding.hint")}>
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
            {t("settings.app.onboarding.button")}
          </button>
        </SettingRow>

        {isMac && onOpenInertRecovery && (
          <SettingRow
            id="app.tcc"
            hint={t("settings.app.tcc.hint")}
          >
            <button
              type="button"
              onClick={onOpenInertRecovery}
              className="btn btn--secondary"
            >
              {t("settings.app.tcc.button")}
            </button>
          </SettingRow>
        )}

        <SettingRow id="app.reset" hint={t("settings.app.reset.hint")}>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(t("settings.app.reset.confirm"))) return;
              await reset();
              toast.success(t("settings.app.reset.done"), { duration: 1600 });
            }}
            className="btn btn--secondary text-rose-300 hover:text-rose-200"
          >
            {t("settings.app.reset.button")}
          </button>
        </SettingRow>
      </AdvancedSection>
    </div>
  );
}
