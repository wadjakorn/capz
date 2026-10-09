"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useOS } from "@/hooks/use-os";
import { useT } from "@/i18n/useT";

export type KeyPlat = "mac" | "win";

const Ctx = createContext<{ plat: KeyPlat; setPlat: (p: KeyPlat) => void }>({ plat: "mac", setPlat: () => {} });

/**
 * Which keyboard the page's keycaps speak. Follows the visitor's OS (Windows →
 * Ctrl/Alt/Shift, everything else → Mac glyphs) until they pick one with
 * KeyToggle; the choice lasts for the visit only (no storage).
 */
export function KeyPlatformProvider({ children }: { children: ReactNode }) {
  const os = useOS();
  const [chosen, setPlat] = useState<KeyPlat | null>(null);
  const plat: KeyPlat = chosen ?? (os === "windows" ? "win" : "mac");
  return <Ctx.Provider value={{ plat, setPlat }}>{children}</Ctx.Provider>;
}

export const useKeyPlat = () => useContext(Ctx);

/** Mac ⇄ Windows switch for every keycap on the page. */
export function KeyToggle() {
  const { plat, setPlat } = useKeyPlat();
  const { t } = useT();
  return (
    <div className="keytoggle" role="group" aria-label={t("site.key.platform")}>
      <span className="kt-label" aria-hidden>{t("site.key.platform")}</span>
      {(["mac", "win"] as const).map((p) => (
        <button key={p} type="button" aria-pressed={plat === p} onClick={() => setPlat(p)}>
          {p === "mac" ? "Mac" : "Windows"}
        </button>
      ))}
    </div>
  );
}
