"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GithubIcon } from "./GithubIcon";
import { useT } from "@/i18n/useT";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { lang, setLang, t } = useT();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-200 ${
        scrolled
          ? "border-b border-white/10 bg-background/40 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-gradient-to-br from-white to-white/85 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.4)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" width={20} height={20} className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium tracking-tight text-foreground">capz</span>
        </a>
        <div className="flex items-center gap-1">
          <div
            role="group"
            aria-label="Language"
            className="mr-1 flex items-center rounded-full border border-white/10 bg-white/5 p-0.5 text-xs backdrop-blur"
          >
            <button
              type="button"
              onClick={() => setLang("th")}
              aria-pressed={lang === "th"}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                lang === "th"
                  ? "bg-white text-[oklch(0.18_0.05_290)] shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("nav.langTh")}
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                lang === "en"
                  ? "bg-white text-[oklch(0.18_0.05_290)] shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("nav.langEn")}
            </button>
          </div>
          <Link
            href="/paste"
            className="mr-1 hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
          >
            {t("nav.editor")}
          </Link>
          <a
            href="https://github.com/wadjakorn/capz"
            target="_blank"
            rel="noreferrer"
            aria-label={t("nav.github")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <GithubIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
