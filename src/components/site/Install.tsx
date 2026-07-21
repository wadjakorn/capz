"use client";

import { useState } from "react";
import { Apple, Download, MonitorDown } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { useLatestRelease } from "@/hooks/use-latest-release";
import { useT } from "@/i18n/useT";

type Tab = "mac" | "windows";

const BREW_CMD = "brew install wadjakorn/capz/capz";

export function Install() {
  const [tab, setTab] = useState<Tab>("mac");
  const { version, windowsAssetUrl, isLoading } = useLatestRelease();
  const { t } = useT();

  return (
    <section id="install" className="border-t border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-28 sm:py-32">
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("install.kicker")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("install.title")}
          </h2>
        </div>

        <div className="glass-card mt-10 overflow-hidden">
          <div role="tablist" className="relative flex border-b border-white/10">
            {(
              [
                { id: "mac" as const, label: t("install.tabMac"), Icon: Apple },
                { id: "windows" as const, label: t("install.tabWin"), Icon: MonitorDown },
              ]
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`relative inline-flex items-center gap-2 px-5 py-3 text-sm transition-colors ${
                  tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
                {label}
                {tab === id && (
                  <span
                    className="absolute inset-x-3 -bottom-px h-px"
                    style={{ background: "var(--accent-purple)", boxShadow: "0 0 12px var(--accent-purple)" }}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="p-6 sm:p-8">
            {tab === "mac" ? (
              <div key="mac" className="space-y-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">{t("install.mac.step1")}</h3>
                  <CodeBlock command={BREW_CMD} />
                  <p className="text-sm text-muted-foreground">{t("install.mac.universal")}</p>
                </div>

                <div className="space-y-3 border-t border-white/10 pt-6">
                  <h3 className="text-sm font-medium text-foreground">{t("install.mac.step2")}</h3>
                  <p className="text-sm text-muted-foreground">{t("install.mac.step2desc")}</p>
                  <CodeBlock command="sudo xattr -dr com.apple.quarantine /Applications/capz.app" />
                  <CodeBlock command="sudo spctl --add /Applications/capz.app" />
                  <CodeBlock command="open -a capz" />
                  <p className="text-sm text-muted-foreground pt-2">
                    {t("install.mac.stillBlocked")}
                  </p>
                  <CodeBlock command="open /System/Library/PreferencePanes/Security.prefPane" />
                </div>
              </div>
            ) : (
              <div key="windows" className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                <a
                  href={windowsAssetUrl}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Download className="h-4 w-4" />
                  {isLoading ? t("install.win.download") : `${t("install.win.download")} ${version ?? ""}`}
                </a>
                <p className="text-sm text-muted-foreground">{t("install.win.desc")}</p>

                <div className="space-y-3 border-t border-white/10 pt-6">
                  <h3 className="text-sm font-medium text-foreground">{t("install.win.sacTitle")}</h3>
                  <p className="text-sm text-muted-foreground">{t("install.win.sacDesc")}</p>
                  <p className="text-sm text-muted-foreground">{t("install.win.sacWarn")}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
