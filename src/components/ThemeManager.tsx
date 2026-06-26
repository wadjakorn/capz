"use client";

import { useEffect } from "react";
import { useSettings } from "@/stores/settings";

type Theme = "light" | "dark" | "system";

/**
 * Applies the chosen theme to <html> by toggling the `.dark` / `.light`
 * classes. The CSS-variable palette (globals.css) and shadcn `dark:` utilities
 * both key off `.dark`, so flipping the class flips the whole UI.
 *
 * Mounted once per webview from the root layout, so it runs in every window
 * (editor, overlay, settings, onboarding). Cross-window changes propagate via
 * the settings store's `onKeyChange` subscription → `config.general.theme`.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
}

export function ThemeManager() {
  const init = useSettings((s) => s.init);
  const theme = useSettings((s) => s.config.general.theme);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return null;
}
