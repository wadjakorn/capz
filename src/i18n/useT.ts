"use client";

import { useCallback } from "react";
import { translate, useI18n, type TKey, type TVars } from "./store";

/** Current language + a `t` bound to it; re-renders when the language changes. */
export function useT() {
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const t = useCallback((key: TKey, vars?: TVars) => translate(lang, key, vars), [lang]);
  return { lang, setLang, t };
}
