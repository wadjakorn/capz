"use client";

import type { ReactNode } from "react";
import { ImageDown, Loader2, Ruler, ScanText, Trash2 } from "lucide-react";
import { ActionRow } from "./kit";
import { BackdropSection } from "../BackdropControl";
import { ZoomMenuButton } from "../ZoomMenuButton";

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
  return (
    <div className="flex flex-col gap-4">
      <Section title="View">
        <div className="px-1">
          <ZoomMenuButton displayScale={p.displayScale} disabled={!p.hasImage} />
        </div>
        <ActionRow
          Icon={Ruler}
          label="Rulers"
          pressed={p.showRulers}
          onClick={p.onToggleRulers}
        />
      </Section>

      <Section title="Workspace">
        <ActionRow
          Icon={ImageDown}
          label={p.hasImage ? "Add image as overlay" : "Open image file"}
          onClick={p.onImportImage}
        />
        {p.tauriUi ? (
          <ActionRow
            Icon={Trash2}
            label={p.hasImage ? "Clear workspace" : "Workspace already empty"}
            disabled={!p.hasImage}
            onClick={p.onClearWorkspace}
          />
        ) : (
          p.onWebClear && (
            <ActionRow
              Icon={Trash2}
              label={p.hasImage ? "Delete image" : "No image loaded"}
              disabled={!p.hasImage}
              onClick={p.onWebClear}
            />
          )
        )}
      </Section>

      {p.ocr && (
        <Section title="Text">
          <ActionRow
            Icon={p.ocr.scanning ? Loader2 : ScanText}
            iconClassName={p.ocr.scanning ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            label={
              !p.hasImage
                ? "Detect text (load an image first)"
                : p.ocr.scanning
                  ? "Detecting text…"
                  : p.ocr.mode
                    ? "Hide detected text"
                    : "Detect text"
            }
            pressed={p.ocr.mode}
            disabled={!p.hasImage || p.ocr.scanning}
            onClick={p.ocr.onToggle}
          />
        </Section>
      )}

      {p.hasImage && (
        <Section title="Backdrop">
          <BackdropSection />
        </Section>
      )}
    </div>
  );
}
