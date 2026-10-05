"use client";

import { useEffect } from "react";
import { isTauriRuntime } from "@/lib/platform";
import { pinnedLang, useI18n } from "@/i18n/store";
import { useSettings } from "@/stores/settings";

/**
 * Keeps the UI language in step with `config.general.language` and mirrors it
 * onto `<html lang>` (Thai line-breaking and font selection key off it).
 *
 * Mounted once per webview from the root layout, like ThemeManager, so every
 * window (editor, overlay, ring, scroll HUD) follows a change made in Settings
 * or onboarding via the settings store's cross-window `onKeyChange`. The tray
 * menu and editor title live in Rust and are told separately.
 *
 * On the web build there is no persisted config: the i18n store keeps its own
 * in-memory language, set by the page's TH/EN switch.
 */
export function LanguageManager() {
  const ready = useSettings((s) => s.ready);
  const configLang = useSettings((s) => s.config.general.language);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);

  useEffect(() => {
    const pinned = pinnedLang();
    if (pinned) setLang(pinned);
  }, [setLang]);

  useEffect(() => {
    if (!ready || !isTauriRuntime() || pinnedLang()) return;
    setLang(configLang);
  }, [ready, configLang, setLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!ready || !isTauriRuntime()) return;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("set_ui_language", { lang: configLang }))
      .catch((e) => console.warn("set_ui_language failed", e));
  }, [ready, configLang]);

  return null;
}
