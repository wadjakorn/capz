"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";

import { runPrepareExport, useStageSourceSize } from "@/lib/stageBridge";
import { useEditor } from "@/stores/editor";
import { useWorkspaces } from "@/stores/workspaces";
import { useTemplates } from "@/stores/templates";
import { useT } from "@/i18n/useT";
import { ApplyTemplatePopover, useWorkspacesOn } from "./ApplyTemplatePopover";
import { SaveTemplatePopover } from "./SaveTemplatePopover";
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
  const wsOn = useWorkspacesOn();
  const hasImage = useEditor((s) => s.hasImage);
  const tool = useEditor((s) => s.tool);
  const sourceSize = useStageSourceSize((s) => s.size);
  const otherHasImage = useWorkspaces((s) =>
    s.order.some((id) => id !== s.activeId && !!s.docs[id]?.image),
  );
  const [applyOpen, setApplyOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const showFromImage = wsOn && otherHasImage;

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    useTemplates
      .getState()
      .ensureLoaded()
      .catch(() => setLoadFailed(true));
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

  return (
    <div className="flex flex-col gap-2.5">
      <SaveTemplatePopover />
      {showFromImage && (
        <Popover.Root
          open={applyOpen}
          onOpenChange={(o) => {
            // Flush pending text/live edits before the popup snapshots the doc.
            if (o) runPrepareExport();
            setApplyOpen(o);
          }}
        >
          <Popover.Trigger
            disabled={!hasImage || sourceSize === null || tool === "crop"}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg)] hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("editor.templates.applyFromImage")}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={6} className="z-50">
              <Popover.Popup className="flex max-h-[70vh] w-72 flex-col gap-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg">
                <ApplyTemplatePopover source={{ kind: "live" }} onClose={() => setApplyOpen(false)} />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
      <p className="text-[10px] leading-relaxed text-[var(--fg-3)]">{t("editor.templates.undoHelp")}</p>
      {loadFailed ? (
        <p role="alert" className="text-[11px] leading-relaxed text-red-500">
          {t("editor.templates.loadFailed")}
        </p>
      ) : (
        templates.length === 0 && (
          <p className="text-[11px] leading-relaxed text-[var(--fg-3)]">{t("editor.templates.empty")}</p>
        )
      )}
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
