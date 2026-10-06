"use client";

import { useState, type KeyboardEvent } from "react";
import { Apple, Download, MonitorDown } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { useLatestRelease } from "@/hooks/use-latest-release";
import { useOS } from "@/hooks/use-os";
import { useT } from "@/i18n/useT";

type Tab = "mac" | "windows";
const BREW_CMD = "brew install wadjakorn/capz/capz";

export function Install() {
  const os = useOS();
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab: Tab = chosen ?? (os === "windows" ? "windows" : "mac");
  const { version, windowsAssetUrl, isLoading } = useLatestRelease();
  const { t } = useT();
  const copy = t("install.copy");
  const tabs = [
    { id: "mac" as const, label: t("install.tabMac"), Icon: Apple },
    { id: "windows" as const, label: t("install.tabWin"), Icon: MonitorDown },
  ];
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = tab === "mac" ? "windows" : "mac";
    setChosen(next);
    (e.currentTarget.querySelector(`#install-tab-${next}`) as HTMLButtonElement | null)?.focus();
  };

  return (
    <section className="paper install" id="install" aria-labelledby="install-title">
      <div className="wrap">
        <h2 id="install-title">{t("install.title")}</h2>
        <div className="inst">
          <div role="tablist" className="inst-tabs" aria-label={t("install.title")} onKeyDown={onKey}>
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                id={`install-tab-${id}`}
                role="tab"
                type="button"
                aria-selected={tab === id}
                aria-controls="install-panel"
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setChosen(id)}
              >
                <Icon aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <div className="inst-panel" id="install-panel" role="tabpanel" aria-labelledby={`install-tab-${tab}`}>
            {tab === "mac" ? (
              <>
                <div className="step">
                  <h3>{t("install.mac.step1")}</h3>
                  <CodeBlock command={BREW_CMD} copyLabel={copy} />
                  <p>{t("install.mac.universal")}</p>
                </div>
                <div className="step">
                  <h3>{t("install.mac.step2")}</h3>
                  <p>{t("install.mac.step2desc")}</p>
                  <CodeBlock command="sudo xattr -dr com.apple.quarantine /Applications/capz.app" copyLabel={copy} />
                  <CodeBlock command="sudo spctl --add /Applications/capz.app" copyLabel={copy} />
                  <CodeBlock command="open -a capz" copyLabel={copy} />
                  <p>{t("install.mac.stillBlocked")}</p>
                  <CodeBlock command="open /System/Library/PreferencePanes/Security.prefPane" copyLabel={copy} />
                </div>
              </>
            ) : (
              <>
                <div className="step">
                  <a href={windowsAssetUrl} className="btn btn-primary">
                    <Download aria-hidden />
                    {isLoading ? t("install.win.download") : `${t("install.win.download")} ${version ?? ""}`}
                  </a>
                  <p>{t("install.win.desc")}</p>
                </div>
                <div className="step">
                  <h3>{t("install.win.sacTitle")}</h3>
                  <p>{t("install.win.sacDesc")}</p>
                  <p>{t("install.win.sacWarn")}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
