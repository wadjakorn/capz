"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  ACTIVE,
  applyTemplateTo,
  prepareApply,
  resolveTargetIds,
  showApplyToast,
} from "@/lib/applyTemplateTo";
import { getImageSize } from "@/lib/imageSizeCache";
import { getStageSourceSize, runPrepareExport, useStageSourceSize } from "@/lib/stageBridge";
import {
  captureTemplate,
  type EditTemplate,
  type TemplateSelection,
} from "@/lib/template";
import { uid } from "@/lib/uid";
import { srcForDoc, type ConvertFileSrc } from "@/hooks/useWorkspaceSession";
import { useEditor } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useWorkspaces } from "@/stores/workspaces";
import { useT } from "@/i18n/useT";
import { defaultSelection, itemsFromDoc, itemsFromTemplate } from "./pickerItems";
import { TemplateItemPicker } from "./TemplateItemPicker";

const BULK_WARN_BYTES = 10_000_000;

export type ApplySource = { kind: "template"; tpl: EditTemplate } | { kind: "live" };

const btn =
  "rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg)] hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

/** Whether the workspace strip drives targeting (mirrors `resolveTargetIds`). */
export function useWorkspacesOn(): boolean {
  const enabled = useSettings((s) => s.config.workspaces.enabled);
  const activeId = useWorkspaces((s) => s.activeId);
  return enabled && activeId !== null;
}

/** Popup content: mounted when the popover opens, so mounting is "on open". */
export function ApplyTemplatePopover({
  source,
  onClose,
}: {
  source: ApplySource;
  onClose: () => void;
}) {
  const { t } = useT();
  const live = source.kind === "live";
  const wsOn = useWorkspacesOn();
  const activeId = useWorkspaces((s) => s.activeId);
  const docs = useWorkspaces((s) => s.docs);
  const stageSize = useStageSourceSize((s) => s.size);

  const [init] = useState(() => {
    if (source.kind === "live") runPrepareExport();
    const items =
      source.kind === "live"
        ? itemsFromDoc(useEditor.getState(), useSettings.getState().config.general.backdrop)
        : itemsFromTemplate(source.tpl);
    const annotations =
      source.kind === "live" ? useEditor.getState().annotations : source.tpl.annotations;
    return { items, annotations, activeAtOpen: useWorkspaces.getState().activeId };
  });
  const [sel, setSel] = useState<TemplateSelection>(() => defaultSelection(init.items));

  // Candidate targets, snapshotted at open. Live excludes the active workspace.
  const [candidates] = useState<string[]>(() => {
    const ids = resolveTargetIds();
    return live ? ids.filter((id) => id !== ACTIVE && id !== init.activeAtOpen) : ids;
  });
  const [checked, setChecked] = useState<Set<string>>(() =>
    live
      ? new Set()
      : new Set(
          candidates.filter((id) => id === ACTIVE || id === init.activeAtOpen),
        ),
  );

  // prepareApply on open; Confirm awaits the same promise.
  const readyRef = useRef<Promise<ConvertFileSrc | null> | null>(null);
  const [ready, setReady] = useState<{ done: boolean; cfs: ConvertFileSrc | null }>({
    done: false,
    cfs: null,
  });
  useEffect(() => {
    let cancelled = false;
    const p = prepareApply();
    readyRef.current = p;
    p.then(
      (cfs) => !cancelled && setReady({ done: true, cfs }),
      () => !cancelled && setReady({ done: true, cfs: null }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // The item snapshot goes stale if the user switches workspaces.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const firstActive = useRef(activeId);
  useEffect(() => {
    if (activeId !== firstActive.current) onClose();
  }, [activeId, onClose]);

  type Row = { id: string; index: number; thumb: string; state: "ok" | "pending" | "failed" };
  const rows: Row[] = useMemo(() => {
    const order = useWorkspaces.getState().order;
    return candidates.map((id) => {
      const index = order.indexOf(id);
      const d = docs[id];
      if (id === ACTIVE || id === activeId || !d)
        return { id, index, thumb: d?.thumb ?? "", state: "ok" as const };
      const has = getImageSize(srcForDoc(d, ready.cfs)) !== undefined;
      return {
        id,
        index,
        thumb: d.thumb,
        state: has ? ("ok" as const) : ready.done ? ("failed" as const) : ("pending" as const),
      };
    });
  }, [candidates, docs, activeId, ready]);

  const usable = rows.filter((r) => r.state === "ok").map((r) => r.id);
  const targets = usable.filter((id) => checked.has(id));
  const allChecked = usable.length > 0 && targets.length === usable.length;

  const toggle = (id: string) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const imageBytes = init.annotations.reduce(
    (n, a) => (a.type === "image" && sel.annotationIds.has(a.id) ? n + a.src.length : n),
    0,
  );
  const total = imageBytes * targets.length;
  const warn = total > BULK_WARN_BYTES;

  const empty =
    !sel.crop && !sel.backdropOn && !sel.backdropLook && sel.annotationIds.size === 0;
  const liveNoSize = live && stageSize === null;
  const canConfirm = !empty && !liveNoSize && targets.length > 0 && !busy;

  const confirm = async () => {
    if (busyRef.current || !canConfirm) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const cfs = await (readyRef.current ?? prepareApply());
      // The popover may have closed or the workspace changed while waiting.
      if (!mounted.current || useWorkspaces.getState().activeId !== init.activeAtOpen) return;
      let tpl: EditTemplate;
      if (source.kind === "live") {
        const size = getStageSourceSize();
        if (!size) return;
        tpl = captureTemplate(
          useEditor.getState(),
          size,
          useSettings.getState().config.general.backdrop,
          sel,
          { id: uid(), name: "", createdAt: Date.now(), thumb: "" },
        );
      } else {
        tpl = source.tpl;
      }
      showApplyToast(applyTemplateTo(targets, tpl, sel, cfs), t);
      onClose();
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <TemplateItemPicker items={init.items} value={sel} onChange={setSel} />
      {wsOn && (
        <fieldset className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
          <legend className="text-[10px] font-medium uppercase text-[var(--fg-3)]">
            {t("editor.templates.where")}
          </legend>
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--fg)]">
            <input
              type="checkbox"
              checked={allChecked}
              disabled={usable.length === 0}
              onChange={() => setChecked(allChecked ? new Set() : new Set(usable))}
            />
            {t("editor.templates.allOpen")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {rows.map((r) => (
              <label
                key={r.id}
                className={`flex w-16 flex-col items-center gap-0.5 text-[10px] text-[var(--fg-2)] ${
                  r.state === "ok" ? "" : "opacity-50"
                }`}
                title={r.state === "failed" ? t("editor.templates.decodeFailed") : undefined}
              >
                <span className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded border border-[var(--border)] bg-[var(--bg-canvas)]">
                  {r.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumb} alt="" draggable={false} className="h-full w-full object-contain" />
                  )}
                  {r.state === "pending" && (
                    <Loader2
                      className="absolute h-3.5 w-3.5 animate-spin"
                      aria-label={t("editor.templates.sizing")}
                    />
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    aria-label={String(r.index + 1)}
                    checked={checked.has(r.id) && r.state === "ok"}
                    disabled={r.state !== "ok"}
                    onChange={() => toggle(r.id)}
                  />
                  {r.index + 1}
                </span>
                {r.state === "failed" && (
                  <span className="text-center text-red-500">
                    {t("editor.templates.decodeFailed")}
                  </span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {warn && (
        <p role="status" className="text-[11px] text-[var(--fg-3)]">
          {t("editor.templates.bulkSizeWarn", { mb: (total / 1_000_000).toFixed(0) })}
        </p>
      )}
      <button type="button" className={btn} disabled={!canConfirm} onClick={() => void confirm()}>
        {busy && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />}
        {t("editor.templates.confirm")}
      </button>
    </div>
  );
}
