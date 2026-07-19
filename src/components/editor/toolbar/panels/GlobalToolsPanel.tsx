"use client";

import type { ComponentType, ReactNode } from "react";
import { ImageDown, Loader2, ScanText, Trash2 } from "lucide-react";
import { BackdropSection } from "../BackdropControl";
import { ZoomMenuButton } from "../ZoomMenuButton";

type IconType = ComponentType<{ className?: string }>;

/** Full-width labelled action — the sidebar counterpart of a ToolButton. The
 * slot is a 15rem column, so these read as rows, not icon-only squares. */
function ActionRow({
  Icon,
  label,
  onClick,
  disabled,
  pressed,
  iconClassName,
}: {
  Icon: IconType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  iconClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={[
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        pressed
          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
          : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
        "disabled:opacity-40 disabled:hover:bg-transparent",
      ].join(" ")}
    >
      <Icon className={iconClassName ?? "h-4 w-4"} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

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
        <label className="flex items-center justify-between px-2 py-1 text-xs text-[var(--fg-2)]">
          <span>Rulers</span>
          <input
            type="checkbox"
            checked={p.showRulers}
            onChange={p.onToggleRulers}
          />
        </label>
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
          <div className="px-2">
            <BackdropSection />
          </div>
        </Section>
      )}
    </div>
  );
}
