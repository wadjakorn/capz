"use client";

import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { dict, type Lang, type TKey } from "./dict";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
};

export const LanguageContext = createContext<Ctx | null>(null);

// Note: capz forbids localStorage/sessionStorage (see CLAUDE.md). Language is
// kept in memory only and resets to the default on reload — an acceptable
// tradeoff for the marketing page, which has no persistent settings store.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("th");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = useCallback<Ctx["t"]>(
    (key, vars) => {
      let s: string = dict[lang][key] ?? dict.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return s;
    },
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>
  );
}
