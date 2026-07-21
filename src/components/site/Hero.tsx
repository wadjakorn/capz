"use client";

import { ArrowRight, Apple, Download, ImageUp } from "lucide-react";
import Link from "next/link";
import { useOS } from "@/hooks/use-os";
import { useLatestRelease } from "@/hooks/use-latest-release";
import { CopyButton } from "./CopyButton";
import { useT } from "@/i18n/useT";

const BREW_CMD = "brew install wadjakorn/capz/capz";

export function Hero() {
  const os = useOS();
  const { version, windowsAssetUrl, isLoading } = useLatestRelease();
  const { t } = useT();

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,oklch(0.55_0.18_295/0.35),transparent_70%)]"
      />
      <div className="mx-auto max-w-5xl px-6 pt-28 pb-32 sm:pt-36 sm:pb-40">
        <div className="flex justify-center animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
          <a
            href="https://github.com/wadjakorn/capz/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent-purple)" }} />
            {isLoading ? (
              <span className="inline-block h-3 w-24 animate-pulse rounded bg-muted" />
            ) : (
              <>
                {t("hero.badge")} {version}
              </>
            )}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>

        <h1 className="mt-8 bg-gradient-to-b from-white to-white/70 bg-clip-text text-center text-5xl font-semibold tracking-tight text-transparent duration-700 animate-in fade-in-0 slide-in-from-bottom-2 sm:text-6xl md:text-7xl">
          {t("hero.title")}
          <br />
          <span className="bg-gradient-to-b from-white/60 to-white/40 bg-clip-text text-transparent">
            {t("hero.titleSub")}
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-center text-base text-muted-foreground duration-700 animate-in fade-in-0 sm:text-lg">
          {t("hero.desc")}
        </p>

        <p className="mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground/80">
          {t("hero.macNote")}{" "}
          <a href="#install" className="underline underline-offset-2 hover:text-foreground">
            {t("hero.macNoteLink")}
          </a>
        </p>

        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-3 duration-700 animate-in fade-in-0 slide-in-from-bottom-2">
          {os === "windows" ? (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <a
                href={windowsAssetUrl}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Download className="h-4 w-4" />
                {t("hero.downloadWin")}
              </a>
              <a
                href="#install"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Apple className="h-4 w-4" />
                {t("hero.installMac")}
              </a>
            </div>
          ) : os === "mac" ? (
            <div className="flex w-full max-w-xl flex-col items-stretch gap-3">
              <div className="glass-card flex items-center justify-between gap-4 px-4 py-3 font-mono text-sm">
                <div className="flex items-center gap-3 overflow-x-auto">
                  <span aria-hidden className="select-none text-muted-foreground">
                    $
                  </span>
                  <code className="whitespace-nowrap text-foreground">{BREW_CMD}</code>
                </div>
                <CopyButton text={BREW_CMD} label={t("hero.copyCmd")} />
              </div>
              <a
                href={windowsAssetUrl}
                className="inline-flex h-10 items-center justify-center gap-2 self-center rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Download className="h-4 w-4" />
                {t("hero.orDownloadWin")}
              </a>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <a
                href="#install"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Apple className="h-4 w-4" />
                {t("hero.installMac")}
              </a>
              <a
                href={windowsAssetUrl}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Download className="h-4 w-4" />
                {t("hero.downloadWin")}
              </a>
            </div>
          )}

          <Link
            href="/paste"
            className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ImageUp className="h-4 w-4" />
            {t("hero.tryWeb")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
