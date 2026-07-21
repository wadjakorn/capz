"use client";

import { GithubIcon } from "./GithubIcon";
import { useT } from "@/i18n/useT";

export function Footer() {
  const { t } = useT();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-muted-foreground sm:flex-row">
        <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
          <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
          <span className="hidden sm:inline">·</span>
          <p>{t("footer.oss")}</p>
        </div>
        <a
          href="https://github.com/wadjakorn/capz"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <GithubIcon className="h-3.5 w-3.5" />
          github.com/wadjakorn/capz
        </a>
      </div>
    </footer>
  );
}
