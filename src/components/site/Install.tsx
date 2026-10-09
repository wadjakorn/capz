"use client";

import { useState, type KeyboardEvent } from "react";
import { Apple, ArrowRight, Download, MonitorDown, Terminal } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { ThaiText } from "./ThaiText";
import { useLatestRelease } from "@/hooks/use-latest-release";
import { useMacArch } from "@/hooks/use-mac-arch";
import { useOS } from "@/hooks/use-os";
import { useT } from "@/i18n/useT";

type Tab = "mac" | "windows" | "linux";
const TABS: Tab[] = ["mac", "windows", "linux"];
const BREW_CMD = "brew install wadjakorn/capz/capz";

/**
 * From 900px: macOS and Windows side by side, Linux (coming soon) as a row
 * underneath. Below that the same panels become tabs, opening on the
 * visitor's OS.
 */
export function Install() {
  const os = useOS();
  const arch = useMacArch();
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab: Tab = chosen ?? (os === "windows" ? "windows" : os === "linux" ? "linux" : "mac");
  const { version, windowsAssetUrl, macArmUrl, macIntelUrl, isLoading } = useLatestRelease();
  const { t } = useT();
  const copy = t("install.copy");
  const tabs = [
    { id: "mac" as const, label: t("install.tabMac"), Icon: Apple },
    { id: "windows" as const, label: t("install.tabWin"), Icon: MonitorDown },
    { id: "linux" as const, label: t("install.tabLinux"), Icon: Terminal },
  ];
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setChosen(next);
    (e.currentTarget.querySelector(`#install-tab-${next}`) as HTMLButtonElement | null)?.focus();
  };
  // Unknown chip (Safari/Firefox) → Apple Silicon leads; Intel stays one tap away.
  const dmgs = [
    { id: "arm", href: macArmUrl, label: t("install.mac.dmgArm") },
    { id: "intel", href: macIntelUrl, label: t("install.mac.dmgIntel") },
  ];
  if (arch === "intel") dmgs.reverse();

  return (
    <section className="paper install" id="install" aria-labelledby="install-title">
      <div className="wrap">
        <h2 id="install-title"><ThaiText>{t("install.title")}</ThaiText></h2>
        <div className="inst">
          <div role="tablist" className="inst-tabs" aria-label={t("install.title")} onKeyDown={onKey}>
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                id={`install-tab-${id}`}
                role="tab"
                type="button"
                aria-selected={tab === id}
                aria-controls={`install-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setChosen(id)}
              >
                <Icon aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <div className="inst-cols">
            <div className={`inst-col${tab === "mac" ? " on" : ""}`} id="install-mac" aria-labelledby="install-h-mac">
              <h3 className="inst-os" id="install-h-mac"><Apple aria-hidden />{t("install.tabMac")}</h3>
              <div className="step">
                <h4><ThaiText>{t("install.mac.optDmg")}</ThaiText></h4>
                <div className="dl-row">
                  {dmgs.map((d, i) => (
                    <a key={d.id} href={d.href} className={`btn ${i === 0 ? "btn-primary" : "btn-quiet"}`}>
                      <Download aria-hidden />
                      {d.label}
                    </a>
                  ))}
                </div>
                <p>{t("install.mac.dmgDesc")}</p>
              </div>
              <div className="step">
                <h4><ThaiText>{t("install.mac.optBrew")}</ThaiText></h4>
                <CodeBlock command={BREW_CMD} copyLabel={copy} />
                <p>{t("install.mac.brewDesc")}</p>
              </div>
              <div className="step">
                <h4><ThaiText>{t("install.mac.step2")}</ThaiText></h4>
                <p>{t("install.mac.step2desc")}</p>
                <CodeBlock command="sudo xattr -dr com.apple.quarantine /Applications/capz.app" copyLabel={copy} />
                <CodeBlock command="sudo spctl --add /Applications/capz.app" copyLabel={copy} />
                <CodeBlock command="open -a capz" copyLabel={copy} />
                <p>{t("install.mac.stillBlocked")}</p>
                <CodeBlock command="open /System/Library/PreferencePanes/Security.prefPane" copyLabel={copy} />
              </div>
            </div>
            <div className={`inst-col${tab === "windows" ? " on" : ""}`} id="install-windows" aria-labelledby="install-h-win">
              <h3 className="inst-os" id="install-h-win"><MonitorDown aria-hidden />{t("install.tabWin")}</h3>
              <div className="step">
                <a href={windowsAssetUrl} className="btn btn-primary">
                  <Download aria-hidden />
                  {isLoading ? t("install.win.download") : `${t("install.win.download")} ${version ?? ""}`}
                </a>
                <p>{t("install.win.desc")}</p>
              </div>
              <div className="step">
                <h4><ThaiText>{t("install.win.sacTitle")}</ThaiText></h4>
                <p>{t("install.win.sacDesc")}</p>
                <p>{t("install.win.sacWarn")}</p>
              </div>
            </div>
            <div className={`inst-col linux${tab === "linux" ? " on" : ""}`} id="install-linux" aria-labelledby="install-h-linux">
              <h3 className="inst-os" id="install-h-linux"><Terminal aria-hidden /><ThaiText>{t("install.linux.title")}</ThaiText></h3>
              <div className="step">
                <p>{t("install.linux.desc")}</p>
                <a href="/paste" className="btn btn-quiet">
                  {t("hero.tryWeb")}
                  <ArrowRight aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
