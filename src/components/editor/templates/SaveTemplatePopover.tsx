"use client";

import { useMemo, useState } from "react";
import { Popover } from "@base-ui/react/popover";

import { captureTemplate, templateBytes, type TemplateSelection } from "@/lib/template";
import { getStageSourceSize, runPrepareExport, useStageSourceSize } from "@/lib/stageBridge";
import { uid } from "@/lib/uid";
import { useEditor } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useTemplatePreview } from "@/stores/templatePreview";
import { nextTemplateName, useTemplates } from "@/stores/templates";
import { renderThumb } from "@/stores/workspaces";
import { useT } from "@/i18n/useT";
import { defaultSelection, itemsFromDoc, type PickerItem } from "./pickerItems";
import { TemplateItemPicker } from "./TemplateItemPicker";

const WARN_BYTES = 2_000_000;
const REFUSE_BYTES = 5_000_000;

const btn =
  "rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg)] hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

export function SaveTemplatePopover() {
  const { t } = useT();
  const tool = useEditor((s) => s.tool);
  const hasImage = useEditor((s) => s.hasImage);
  const sourceSize = useStageSourceSize((s) => s.size);
  const setHighlight = useTemplatePreview((s) => s.setHighlight);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [sel, setSel] = useState<TemplateSelection>(() => defaultSelection([]));
  const [name, setName] = useState("");

  const cropActive = tool === "crop";
  const disabled = cropActive || !hasImage || sourceSize === null;

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setHighlight(null);
      return;
    }
    runPrepareExport();
    const its = itemsFromDoc(useEditor.getState(), useSettings.getState().config.general.backdrop);
    setItems(its);
    setSel(defaultSelection(its));
    setName(nextTemplateName(useTemplates.getState().templates, t));
  };

  const bytes = useMemo(() => {
    if (!open || !sourceSize) return 0;
    const tpl = captureTemplate(
      useEditor.getState(),
      sourceSize,
      useSettings.getState().config.general.backdrop,
      sel,
      { id: "", name: "", createdAt: 0, thumb: "" },
    );
    return templateBytes(tpl);
  }, [open, sel, sourceSize]);

  const empty =
    !sel.crop && !sel.backdropOn && !sel.backdropLook && sel.annotationIds.size === 0;
  const refuse = bytes >= REFUSE_BYTES;
  const warn = !refuse && bytes >= WARN_BYTES;
  const mb = (bytes / 1_000_000).toFixed(1);

  const save = () => {
    const size = getStageSourceSize();
    if (!size || empty || refuse) return;
    const tpl = captureTemplate(
      useEditor.getState(),
      size,
      useSettings.getState().config.general.backdrop,
      sel,
      {
        id: uid(),
        name: name.trim() || nextTemplateName(useTemplates.getState().templates, t),
        createdAt: Date.now(),
        thumb: renderThumb(160),
      },
    );
    void useTemplates.getState().save(tpl);
    handleOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpen}>
      <Popover.Trigger
        disabled={disabled}
        title={cropActive ? t("editor.templates.cropToolActive") : undefined}
        className={btn}
      >
        {t("editor.templates.save")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-50">
          <Popover.Popup className="flex max-h-[70vh] w-72 flex-col gap-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg">
            <input
              aria-label={t("editor.templates.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-[12px] text-[var(--fg)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            />
            <TemplateItemPicker items={items} value={sel} onChange={setSel} onHover={setHighlight} />
            {warn && (
              <p role="status" className="text-[11px] text-[var(--fg-3)]">
                {t("editor.templates.sizeWarn", { mb })}
              </p>
            )}
            {refuse && (
              <p role="alert" className="text-[11px] text-red-500">
                {t("editor.templates.sizeRefuse")}
              </p>
            )}
            <button type="button" className={btn} disabled={empty || refuse} onClick={save}>
              {t("editor.templates.save")}
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
