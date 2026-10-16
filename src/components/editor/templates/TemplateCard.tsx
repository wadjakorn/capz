"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";

import { ACTIVE, applyTemplateTo, showApplyToast } from "@/lib/applyTemplateTo";
import { useStageSourceSize } from "@/lib/stageBridge";
import { templateItemCount, type EditTemplate } from "@/lib/template";
import { useEditor } from "@/stores/editor";
import { useWorkspaces } from "@/stores/workspaces";
import { useT } from "@/i18n/useT";
import { defaultSelection, itemsFromTemplate } from "./pickerItems";

const COOLDOWN_MS = 400;

export type TemplateCardProps = {
  tpl: EditTemplate;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

const iconBtn =
  "grid h-6 w-6 place-items-center rounded text-[var(--fg-3)] hover:bg-[var(--surface-raised)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]";

export function TemplateCard({ tpl, onRename, onDelete }: TemplateCardProps) {
  const { t } = useT();
  const hasImage = useEditor((s) => s.hasImage);
  const activeId = useWorkspaces((s) => s.activeId);
  const sourceSize = useStageSourceSize((s) => s.size);
  const [cooling, setCooling] = useState(false);
  const coolingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(tpl.name);
  const [confirming, setConfirming] = useState(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const canApply = hasImage && sourceSize !== null && !cooling;

  const applyHere = () => {
    if (coolingRef.current || !hasImage || sourceSize === null) return;
    coolingRef.current = true;
    setCooling(true);
    timer.current = setTimeout(() => {
      coolingRef.current = false;
      setCooling(false);
    }, COOLDOWN_MS);
    const summary = applyTemplateTo(
      [activeId ?? ACTIVE],
      tpl,
      defaultSelection(itemsFromTemplate(tpl)),
      null,
    );
    showApplyToast(summary, t);
  };

  const commitRename = () => {
    const name = draft.trim();
    setRenaming(false);
    if (name && name !== tpl.name) onRename(tpl.id, name);
  };

  return (
    <div
      data-template-card
      className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-raised)]"
    >
      <div className="aspect-[108/68] bg-[var(--bg-canvas)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tpl.thumb} alt="" draggable={false} className="h-full w-full object-contain" />
      </div>
      <div className="flex flex-col gap-1.5 p-2">
        {renaming ? (
          <input
            autoFocus
            aria-label={t("editor.templates.rename")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") {
                setDraft(tpl.name);
                setRenaming(false);
              }
            }}
            className="h-6 w-full rounded border border-[var(--border-strong)] bg-[var(--bg)] px-1.5 text-[11px] text-[var(--fg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          />
        ) : (
          <div className="truncate text-[11px] font-medium text-[var(--fg)]" title={tpl.name}>
            {tpl.name}
          </div>
        )}
        <div className="text-[10px] text-[var(--fg-3)]">
          {t("editor.templates.items", { n: templateItemCount(tpl) })} ·{" "}
          {t("editor.templates.fromSize", { w: tpl.sourceSize.w, h: tpl.sourceSize.h })}
        </div>
        {confirming ? (
          <div className="flex items-center gap-1">
            <span className="flex-1 text-[10px] text-[var(--fg-2)]">
              {t("editor.templates.confirmDelete")}
            </span>
            <button
              type="button"
              aria-label={t("editor.templates.delete")}
              onClick={() => {
                setConfirming(false);
                onDelete(tpl.id);
              }}
              className={`${iconBtn} text-red-500`}
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("common.cancel")}
              onClick={() => setConfirming(false)}
              className={iconBtn}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canApply}
              onClick={applyHere}
              className="h-6 flex-1 truncate rounded bg-[var(--accent)] px-2 text-[10px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("editor.templates.applyHere")}
            </button>
            <button
              type="button"
              aria-label={t("editor.templates.rename")}
              title={t("editor.templates.rename")}
              onClick={() => {
                setDraft(tpl.name);
                setRenaming(true);
              }}
              className={iconBtn}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("editor.templates.delete")}
              title={t("editor.templates.delete")}
              onClick={() => setConfirming(true)}
              className={iconBtn}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
