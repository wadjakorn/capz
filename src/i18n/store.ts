import { create } from "zustand";
import { en } from "./locales/en";
import { th } from "./locales/th";

export type Lang = "th" | "en";
export const LANGS: readonly Lang[] = ["th", "en"];
export type TKey = keyof typeof en;
export type TVars = Record<string, string | number>;

const DICTS: Record<Lang, Record<TKey, string>> = { en, th };

/** Thai unless a test harness pins a language before the app boots. */
export const DEFAULT_LANG: Lang = "th";

/**
 * E2E seam: Playwright sets `window.__CAPZ_PIN_LANG__` via addInitScript so
 * specs written against English copy keep running whatever the config says.
 * Nothing in the app sets it. LanguageManager applies it after hydration and
 * then ignores the config language.
 */
export function pinnedLang(): Lang | null {
  if (typeof window === "undefined") return null;
  const pinned = (window as { __CAPZ_PIN_LANG__?: unknown }).__CAPZ_PIN_LANG__;
  return pinned === "th" || pinned === "en" ? pinned : null;
}

type I18nState = { lang: Lang; setLang: (l: Lang) => void };

/**
 * The active UI language. On desktop LanguageManager keeps it in sync with
 * `config.general.language` in every window; on the web build (no store) it is
 * in-memory only and the page's TH/EN switch sets it directly.
 */
export const useI18n = create<I18nState>((set) => ({
  // Always the default at first render, matching the prerendered HTML;
  // LanguageManager applies the real language after hydration.
  lang: DEFAULT_LANG,
  setLang: (lang) => set({ lang }),
}));

/** Look up `key` in `lang`, falling back to English, then to the key itself. */
export function translate(lang: Lang, key: TKey, vars?: TVars): string {
  let s: string = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/**
 * Translate with the current language. Safe outside React (toasts, lib
 * modules); components should use `useT()` so they re-render on change.
 */
export function t(key: TKey, vars?: TVars): string {
  return translate(useI18n.getState().lang, key, vars);
}

/** Every dictionary — exported for parity tests. */
export const dictionaries = DICTS;
