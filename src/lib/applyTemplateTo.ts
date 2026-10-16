import { toast } from "sonner";

import { BACKDROP_PRESETS } from "@/lib/backdrop";
import { ensureImageSizes, getImageSize } from "@/lib/imageSizeCache";
import { getStageSourceSize, runPrepareExport } from "@/lib/stageBridge";
import {
  applyTemplate,
  pickBackdropLook,
  type ApplyResult,
  type BackdropLook,
  type EditTemplate,
  type TemplateSelection,
} from "@/lib/template";
import { loadConvertFileSrc, srcForDoc, type ConvertFileSrc } from "@/hooks/useWorkspaceSession";
import type { TKey, TVars } from "@/i18n/store";
import { useEditor, type Snapshot } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useWorkspaces } from "@/stores/workspaces";

/** Target id for the live editor when workspaces are disabled (no activeId). */
export const ACTIVE = "active" as const;

export type ApplySummary = {
  applied: number;
  skipped: number;
  cropSkipped: number;
  scaleMismatch: number;
  aborted: boolean;
  /** The look before this apply changed it; null when the look was not applied. */
  previousLook: BackdropLook | null;
};

const TOAST_ID = "templates-apply";
const REVERT_MS = 8000;

let applying = false;

function workspacesOn(): boolean {
  return (
    useSettings.getState().config.workspaces.enabled && useWorkspaces.getState().activeId !== null
  );
}

/** Every workspace with an image, in tile order; `[ACTIVE]` without workspaces. */
export function resolveTargetIds(): string[] {
  if (!workspacesOn()) return [ACTIVE];
  const { order, docs } = useWorkspaces.getState();
  return order.filter((id) => !!docs[id]?.image);
}

/** The stage src of every non-active target, for `ensureImageSizes`. */
export function targetSrcs(cfs: ConvertFileSrc | null): string[] {
  const { order, docs, activeId } = useWorkspaces.getState();
  return order
    .filter((id) => id !== activeId && !!docs[id]?.image)
    .map((id) => srcForDoc(docs[id], cfs));
}

/**
 * Await before a multi-target apply. The returned `cfs` is the one the cache
 * was keyed with, so `applyTemplateTo` looks sizes up under the same srcs.
 */
export async function prepareApply(): Promise<ConvertFileSrc | null> {
  const cfs = await loadConvertFileSrc();
  await ensureImageSizes(targetSrcs(cfs));
  return cfs;
}

/**
 * Apply `tpl` to every target in one synchronous pass: no `await` between
 * routing and writing, so no workspace switch can interleave. The active
 * target goes through the live editor (`applyPatch`), never `patchDoc` —
 * `commitActive` would overwrite a patched active doc from the editor.
 */
export function applyTemplateTo(
  targetIds: string[],
  tpl: EditTemplate,
  sel: TemplateSelection,
  cfs: ConvertFileSrc | null,
): ApplySummary {
  const s: ApplySummary = {
    applied: 0,
    skipped: 0,
    cropSkipped: 0,
    scaleMismatch: 0,
    aborted: false,
    previousLook: null,
  };
  const { pendingId, swapping } = useWorkspaces.getState();
  if (applying || pendingId !== null || swapping) return { ...s, aborted: true };

  applying = true;
  try {
    let maxPin: number | null = null;
    const record = (r: ApplyResult) => {
      s.applied++;
      if (r.cropSkipped) s.cropSkipped++;
      if (r.scaleMismatch) s.scaleMismatch++;
      const m = r.patch.maxPinNumber;
      if (m !== null && (maxPin === null || m > maxPin)) maxPin = m;
    };

    const seen = new Set<string>();
    for (const id of targetIds) {
      const activeId = useWorkspaces.getState().activeId;
      const isActive = id === ACTIVE || id === activeId;
      const key = isActive ? ACTIVE : id;
      if (seen.has(key)) continue;
      seen.add(key);

      if (isActive) {
        // Commit an open text editor and drop selection/Transformers first,
        // so the live state read below includes the user's in-flight edit.
        runPrepareExport();
        const ed = useEditor.getState();
        const size = getStageSourceSize();
        if (!ed.hasImage || !size) {
          s.skipped++;
          continue;
        }
        const r = applyTemplate(ed, tpl, sel, size);
        ed.applyPatch(r.patch);
        record(r);
        continue;
      }

      const doc = useWorkspaces.getState().docs[id];
      // Keyed by the exact src, so a refilled workspace (same id and path,
      // new capture) misses until its new image has been decoded (CP-0074).
      const size = doc?.image ? getImageSize(srcForDoc(doc, cfs)) : undefined;
      if (!doc || !size) {
        s.skipped++;
        continue;
      }
      const r = applyTemplate(doc, tpl, sel, size);
      const pre: Snapshot = {
        annotations: doc.annotations,
        nextPinNumber: doc.nextPinNumber,
        imageCrop: doc.imageCrop,
      };
      if (useWorkspaces.getState().patchDoc(id, r.patch, pre)) record(r);
      else s.skipped++;
    }

    const { config, update } = useSettings.getState();
    if (s.applied > 0 && sel.backdropLook && tpl.backdropLook) {
      const cur = config.general.backdrop;
      const look = { ...tpl.backdropLook };
      if (!BACKDROP_PRESETS.some((p) => p.id === look.presetId)) look.presetId = cur.presetId;
      s.previousLook = pickBackdropLook(cur);
      void update("general", { backdrop: { ...cur, ...look } });
    }

    if (maxPin !== null) {
      const last = useSettings.getState().config.pins.lastUsedNumber;
      if (maxPin > last) void update("pins", { lastUsedNumber: maxPin });
    }
  } finally {
    applying = false;
  }
  return s;
}

/** Restore a look captured by `applyTemplateTo`, keeping the current autoFor* flags. */
function revertLook(prev: BackdropLook) {
  const { config, update } = useSettings.getState();
  void update("general", { backdrop: { ...config.general.backdrop, ...prev } });
}

export function showApplyToast(s: ApplySummary, t: (k: TKey, v?: TVars) => string): void {
  if (s.aborted) {
    toast(t("editor.templates.toast.aborted"), { id: TOAST_ID });
    return;
  }
  const appliedKey: TKey =
    s.applied === 1 ? "editor.templates.toast.appliedOne" : "editor.templates.toast.applied";
  const parts = [t(appliedKey, { n: s.applied })];
  if (s.skipped) parts.push(t("editor.templates.toast.skipped", { n: s.skipped }));
  if (s.cropSkipped) parts.push(t("editor.templates.toast.cropSkipped", { n: s.cropSkipped }));
  const desc: string[] = [];
  if (s.scaleMismatch) desc.push(t("editor.templates.toast.scaleMismatch"));
  if (s.applied > 0) desc.push(t("editor.templates.toast.undoHint"));
  const prev = s.previousLook;
  toast(parts.join(" · "), {
    id: TOAST_ID,
    ...(desc.length ? { description: desc.join(" ") } : {}),
    ...(prev
      ? {
          duration: REVERT_MS,
          action: {
            label: t("editor.templates.toast.revertBackdrop"),
            onClick: () => revertLook(prev),
          },
        }
      : {}),
  });
}
