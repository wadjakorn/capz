"use client";

import { useEffect, useRef } from "react";

import { useTemplates } from "@/stores/templates";
import { useT } from "@/i18n/useT";
import { TemplateCard } from "./TemplateCard";

/**
 * Sidebar tabpanels stay mounted while hidden, so loading waits for the first
 * time the tab is actually shown ("nothing is loaded at startup"). Flushing is
 * wired on mount: `flush` awaits the load gate, so it is safe before any load.
 */
export function TemplatesPanel({ active }: { active: boolean }) {
  const { t } = useT();
  const templates = useTemplates((s) => s.templates);
  const rename = useTemplates((s) => s.rename);
  const remove = useTemplates((s) => s.remove);
  const requested = useRef(false);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    void useTemplates.getState().ensureLoaded();
  }, [active]);

  useEffect(() => {
    const flush = () => void useTemplates.getState().flush();
    window.addEventListener("blur", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("blur", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  if (templates.length === 0) {
    return <p className="text-[11px] leading-relaxed text-[var(--fg-3)]">{t("editor.templates.empty")}</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {templates.map((tpl) => (
        <TemplateCard
          key={tpl.id}
          tpl={tpl}
          onRename={(id, name) => void rename(id, name)}
          onDelete={(id) => void remove(id)}
        />
      ))}
    </div>
  );
}
