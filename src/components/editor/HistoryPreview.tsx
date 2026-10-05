"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy, FolderOpen, Trash2, X } from "lucide-react";

import { useHistoryActions } from "@/hooks/useHistoryActions";
import { currentPreviewEdge, previewCache } from "@/lib/historyPreview";
import { formatBytes, useHistory, visibleItems, type HistoryItem } from "@/stores/history";

export type HistoryPreviewProps = {
  /** False while another sidebar tab is showing; the selection is kept. */
  active: boolean;
  /** Put the file on the canvas — the same path as dropping a history row. */
  onAdd: (path: string) => void;
};

/**
 * Large preview of the selected history item, laid over the canvas area.
 *
 * Built to stay cheap next to the Konva stage:
 * - the 128px thumbnail already in memory paints in the same frame as the
 *   click (blurred), and the sharp image fades in over it once decoded;
 * - only opacity and transform animate, and the dim behind it is a flat
 *   colour rather than a backdrop blur, so the canvas underneath never
 *   repaints;
 * - it reads the history store itself, so selecting a row does not re-render
 *   the editor page.
 */
export function HistoryPreview({ active, onAdd }: HistoryPreviewProps) {
  const selectedId = useHistory((s) => s.selectedId);
  const saved = useHistory((s) => s.items);
  const archived = useHistory((s) => s.archived);
  const filter = useHistory((s) => s.filter);
  const select = useHistory((s) => s.select);
  const selected = useMemo(
    () =>
      selectedId
        ? visibleItems(saved, archived, filter).find((i) => i.id === selectedId) ?? null
        : null,
    [selectedId, saved, archived, filter],
  );
  const open = active && selected !== null;

  // Keep painting the last item while the overlay fades out.
  const [shown, setShown] = useState<HistoryItem | null>(null);
  useEffect(() => {
    if (selected) setShown(selected);
  }, [selected]);
  const item = selected ?? shown;

  const { reveal, copy, requestTrash, trashPending, forget, trashDialog } = useHistoryActions();

  // --- sharp image -----------------------------------------------------------
  const [full, setFull] = useState<{ path: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const path = item && !item.missing ? item.path : null;
  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    previewCache.load(path, currentPreviewEdge()).then(
      async (url) => {
        // Decode before swapping in, so the fade starts from a ready bitmap
        // instead of stalling a frame on the main thread.
        const img = new Image();
        img.src = url;
        try {
          await img.decode();
        } catch {
          // Let the <img> try on its own.
        }
        if (cancelled) return;
        setFull({ path, url });
        setFailed((f) => (f === path ? null : f));
      },
      (e) => {
        console.error("history preview failed", e);
        if (!cancelled) setFailed(path);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, path]);

  // --- fit the picture box to the frame ------------------------------------
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setFrame({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [thumbRatio, setThumbRatio] = useState<number | null>(null);
  const box = useMemo(() => {
    if (!item || !frame.w || !frame.h) return null;
    const ratio = item.size ? item.size.w / item.size.h : thumbRatio ?? 16 / 10;
    // Never larger than the capture's own on-screen size.
    const maxW = item.size ? item.size.w / (window.devicePixelRatio || 1) : Infinity;
    const w = Math.min(frame.w, frame.h * ratio, maxW);
    return { width: Math.round(w), height: Math.round(w / ratio) };
  }, [item, frame, thumbRatio]);

  // --- dismiss -------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || trashPending) return;
      // Capture phase: Escape closes the preview, not whatever the canvas
      // would otherwise do with it.
      e.stopPropagation();
      select(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, trashPending, select]);

  const add = () => {
    if (!item || item.missing) return;
    select(null);
    onAdd(item.path);
  };

  const sharp = full && item && full.path === item.path ? full.url : null;
  const unreadable = item && failed === item.path;
  const meta = item
    ? [timeOf(item.savedAt), item.size && `${item.size.w}×${item.size.h}`, item.bytes && formatBytes(item.bytes)]
        .filter(Boolean)
        .join("  ·  ")
    : "";

  return (
    <div
      aria-hidden={!open}
      data-open={open}
      onClick={(e) => {
        if (e.target === e.currentTarget || e.target === frameRef.current) select(null);
      }}
      // visibility trails the fade on close, so a closed overlay takes no hits
      // and costs nothing to composite.
      style={{
        visibility: open ? "visible" : "hidden",
        transition: open
          ? "opacity 160ms ease-out, visibility 0s"
          : "opacity 160ms ease-out, visibility 0s linear 160ms",
      }}
      className="group absolute inset-0 z-10 flex flex-col gap-2.5 bg-black/60 px-9 py-7 opacity-0 data-[open=true]:opacity-100 motion-reduce:!transition-none"
    >
      <div
        ref={frameRef}
        className="grid min-h-0 flex-1 translate-y-1.5 scale-[.985] place-items-center transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)] group-data-[open=true]:translate-y-0 group-data-[open=true]:scale-100 motion-reduce:transition-none"
      >
        {item?.missing || unreadable ? (
          <div className="grid h-60 w-[420px] max-w-full place-items-center content-center gap-1.5 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface)] text-xs text-[var(--fg-3)]">
            <AlertTriangle className="h-4 w-4 text-[var(--warning)]" aria-hidden />
            <span className="font-medium text-[var(--fg-2)]">
              {item?.missing ? "File not found" : "Couldn't read this file"}
            </span>
            <span>{item?.missing ? "It was moved or deleted outside capz." : "It may be damaged or not an image."}</span>
          </div>
        ) : item && box ? (
          <div
            onDoubleClick={add}
            style={box}
            className="relative overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-canvas)] shadow-[var(--elev-3)]"
          >
            {item.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
              <img
                src={item.thumb}
                alt=""
                draggable={false}
                onLoad={(e) =>
                  setThumbRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)
                }
                className="absolute inset-0 h-full w-full scale-[1.04] object-contain blur-md"
              />
            ) : null}
            {full ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL preview
              <img
                src={full.url}
                alt={item.fileName}
                draggable={false}
                className={`absolute inset-0 z-[1] h-full w-full object-contain transition-opacity duration-150 ease-out motion-reduce:transition-none ${
                  sharp ? "opacity-100" : "opacity-0"
                }`}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {item && (
        <div className="flex flex-none translate-y-1.5 items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] py-1.5 pl-3 pr-1.5 shadow-[var(--elev-3)] transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)] group-data-[open=true]:translate-y-0 motion-reduce:transition-none">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-[var(--fg)]">{item.fileName}</div>
            <div className="truncate font-mono text-[10px] tabular-nums text-[var(--fg-3)]">
              {item.kind === "capture" && !item.missing ? "Auto  ·  " : ""}
              {meta}
            </div>
          </div>
          {item.missing ? (
            <button
              type="button"
              onClick={() => forget(item.id)}
              className={actionClass(true)}
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              Remove from list
            </button>
          ) : (
            <>
              <div className="flex gap-0.5">
                <button type="button" onClick={() => void reveal(item)} className={actionClass()} title="Reveal in folder">
                  <FolderOpen className="h-3 w-3" aria-hidden />
                  Reveal
                </button>
                <button type="button" onClick={() => void copy(item)} className={actionClass()} title="Copy to clipboard">
                  <Copy className="h-3 w-3" aria-hidden />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => requestTrash(item)}
                  className={actionClass(true)}
                  title="Move to Trash"
                  aria-label="Move to Trash"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              </div>
              <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
              <button
                type="button"
                onClick={add}
                title="Double-clicking the picture does the same"
                className="inline-flex h-7 items-center rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
              >
                Add to current workspace
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => select(null)}
            className="grid h-7 w-7 place-items-center rounded-md bg-[var(--surface-raised)] text-[var(--fg-2)] hover:bg-[var(--surface-raised-hover)]"
            title="Close preview (Esc)"
            aria-label="Close preview"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {trashDialog}
    </div>
  );
}

function actionClass(danger = false) {
  return `inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--surface-raised)] px-2 text-[11px] text-[var(--fg-2)] ${
    danger
      ? "hover:bg-[var(--danger)] hover:text-white"
      : "hover:bg-[var(--surface-raised-hover)] hover:text-[var(--fg)]"
  }`;
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
