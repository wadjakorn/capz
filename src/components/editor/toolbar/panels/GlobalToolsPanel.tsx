"use client";

import type { ReactNode } from "react";
import { ImageDown, Loader2, Pointer, Ruler, ScanText, Trash2 } from "lucide-react";
import { ActionRow } from "./kit";
import { BackdropSection } from "../BackdropControl";
import { ZoomMenuButton } from "../ZoomMenuButton";
import { useT } from "@/i18n/useT";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-2)] opacity-60">
        {title}
      </h3>
      {children}
    </section>
  );
}

export type GlobalToolsPanelProps = {
  /** True on the desktop (Tauri) build — gates OCR and the native clear. */
  tauriUi: boolean;
  hasImage: boolean;
  displayScale: number;
  showRulers: boolean;
  onToggleRulers: () => void;
  /**
   * Sticky-mode row for the ACTIVE tool — null when the active tool can't be
   * sticky (Select, Crop). `label` is that tool's toolbar name.
   */
  keepActive: { label: string; on: boolean; onToggle: () => void } | null;
  onImportImage: () => void;
  /** Desktop: clear the whole workspace. */
  onClearWorkspace: () => void;
  /** Web: drop the loaded image (no workspace concept in the browser). */
  onWebClear?: () => void;
  ocr: {
    mode: boolean;
    scanning: boolean;
    onToggle: () => void;
  } | null;
};

/**
 * Global / workspace tools shown in the sidebar whenever the contextual
 * tool-options panel has nothing to render (CP-0044). Presentational — Toolbar
 * owns the handlers; only the backdrop section reads its own stores, as it did
 * when it lived in the top toolbar.
 *
 * Undo/redo deliberately stay in the top toolbar: they're needed while drawing,
 * which is exactly when this panel is hidden.
 */
export function GlobalToolsPanel(p: GlobalToolsPanelProps) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-4">
      <Section title={t("editor.global.view")}>
        <div className="px-1">
          <ZoomMenuButton displayScale={p.displayScale} disabled={!p.hasImage} />
        </div>
        <ActionRow
          Icon={Ruler}
          label={t("editor.global.rulers")}
          pressed={p.showRulers}
          onClick={p.onToggleRulers}
        />
        {p.keepActive && (
          <ActionRow
            Icon={Pointer}
            label={t("editor.global.keepActive", { tool: p.keepActive.label })}
            pressed={p.keepActive.on}
            onClick={p.keepActive.onToggle}
          />
        )}
      </Section>

      <Section title={t("editor.global.workspace")}>
        <ActionRow
          Icon={ImageDown}
          label={p.hasImage ? t("editor.global.addOverlay") : t("editor.global.openImage")}
          onClick={p.onImportImage}
        />
        {p.tauriUi ? (
          <ActionRow
            Icon={Trash2}
            label={p.hasImage ? t("editor.global.clearWorkspace") : t("editor.global.workspaceEmpty")}
            disabled={!p.hasImage}
            onClick={p.onClearWorkspace}
          />
        ) : (
          p.onWebClear && (
            <ActionRow
              Icon={Trash2}
              label={p.hasImage ? t("editor.global.deleteImage") : t("editor.global.noImage")}
              disabled={!p.hasImage}
              onClick={p.onWebClear}
            />
          )
        )}
      </Section>

      {p.ocr && (
        <Section title={t("editor.global.text")}>
          <ActionRow
            Icon={p.ocr.scanning ? Loader2 : ScanText}
            iconClassName={p.ocr.scanning ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            label={
              !p.hasImage
                ? t("editor.ocr.detectNeedsImage")
                : p.ocr.scanning
                  ? t("editor.ocr.detecting")
                  : p.ocr.mode
                    ? t("editor.ocr.hide")
                    : t("editor.ocr.detect")
            }
            pressed={p.ocr.mode}
            disabled={!p.hasImage || p.ocr.scanning}
            onClick={p.ocr.onToggle}
          />
        </Section>
      )}

      {p.hasImage && (
        <Section title={t("editor.global.backdrop")}>
          <BackdropSection />
        </Section>
      )}
    </div>
  );
}
