"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  FolderOpen,
  LayoutGrid,
  List,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dirName, formatBytes, useHistory, type HistoryItem } from "@/stores/history";
import { useSettings } from "@/stores/settings";

/** Pointer travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;

export type CaptureHistorySectionProps = {
  /** True when the canvas already holds an image — decides drop semantics. */
  hasImage: boolean;
  /** Drop a file onto the canvas: base image when empty, layer otherwise. */
  onDropFile: (path: string) => void;
};

/**
 * Capture history, rendered at the end of the sidebar's global panel.
 *
 * Reads its own stores rather than taking everything as props — the same shape
 * BackdropSection uses, and the reason GlobalToolsPanel can stay presentational.
 */
export function CaptureHistorySection({ hasImage, onDropFile }: CaptureHistorySectionProps) {
  const items = useHistory((s) => s.items);
  const selectedId = useHistory((s) => s.selectedId);
  const select = useHistory((s) => s.select);
  const forget = useHistory((s) => s.forget);
  const markMissing = useHistory((s) => s.markMissing);
  const clear = useHistory((s) => s.clear);
  const config = useSettings((s) => s.config);
  const updateSettings = useSettings((s) => s.update);
  const [pendingTrash, setPendingTrash] = useState<HistoryItem | null>(null);

  const view = config.history.viewMode;
  const setView = useCallback(
    (viewMode: "list" | "grid") => void updateSettings("history", { viewMode }),
    [updateSettings],
  );

  const reveal = useCallback(async (item: HistoryItem) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // reveal_file_in_finder, not reveal_in_finder: the latter OPENS its
      // argument, which for a file means handing it to Preview.
      await invoke("reveal_file_in_finder", { path: item.path });
    } catch (e) {
      console.error("reveal failed", e);
      toast.error("Couldn't open the folder");
    }
  }, []);

  const copy = useCallback(async (item: HistoryItem) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const dataUrl = await invoke<string>("read_image_file_data_url", {
        path: item.path,
        consumeTemp: false,
      });
      const { writeImage } = await import("@tauri-apps/plugin-clipboard-manager");
      const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await writeImage(bytes);
      toast.success("Copied");
    } catch (e) {
      console.error("copy from history failed", e);
      markMissing(item.id);
      toast.error("Couldn't copy that file");
    }
  }, [markMissing]);

  const trash = useCallback(async (item: HistoryItem) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("trash_file", { path: item.path });
      forget(item.id);
      toast("Moved to Trash");
    } catch (e) {
      console.error("trash failed", e);
      toast.error("Couldn't move that file to the Trash");
    }
  }, [forget]);

  const openItem = useCallback(
    (item: HistoryItem) => {
      if (item.missing) {
        toast.error("File no longer exists");
        markMissing(item.id);
        return;
      }
      onDropFile(item.path);
    },
    [markMissing, onDropFile],
  );

  const drag = usePointerDrag(openItem, hasImage);

  const header = (
    <div className="flex items-center gap-1.5 px-2 pb-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-2)] opacity-60">
        History
      </span>
      <span className="text-[10px] text-[var(--fg-4)]">{items.length}</span>
      <span className="flex-1" />
      <div className="inline-flex gap-px rounded-md bg-[var(--surface-raised)] p-0.5" role="group" aria-label="History view">
        {([["list", List], ["grid", LayoutGrid]] as const).map(([v, Icon]) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            title={v === "list" ? "List" : "Thumbnails"}
            onClick={() => setView(v)}
            className={`grid h-[18px] w-5 place-items-center rounded transition-colors ${
              view === v
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-3)] hover:text-[var(--fg-2)]"
            }`}
          >
            <Icon className="h-[11px] w-[11px]" aria-hidden />
          </button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="grid h-[18px] w-5 place-items-center rounded text-[var(--fg-3)] hover:text-[var(--fg-2)]"
              title="History actions"
              aria-label="History actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!items.length}
            onClick={() => {
              const dir = dirName(items[0]?.path ?? "");
              if (!dir) return;
              void import("@tauri-apps/api/core").then(({ invoke }) =>
                invoke("reveal_in_finder", { path: dir }),
              );
            }}
          >
            <FolderOpen className="h-4 w-4" aria-hidden />
            Open save folder
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!items.length} onClick={() => clear()}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Clear list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const actions = (item: HistoryItem, variant: "row" | "tile") =>
    item.missing ? (
      <button
        type="button"
        onClick={() => forget(item.id)}
        className={actionClass(variant, true)}
        title="Remove from list"
      >
        <Trash2 className="h-3 w-3" aria-hidden />
        {variant === "row" && "Remove from list"}
      </button>
    ) : (
      <>
        <button type="button" onClick={() => void reveal(item)} className={actionClass(variant)} title="Reveal in folder">
          <FolderOpen className="h-3 w-3" aria-hidden />
          {variant === "row" && "Reveal"}
        </button>
        <button type="button" onClick={() => void copy(item)} className={actionClass(variant)} title="Copy to clipboard">
          <Copy className="h-3 w-3" aria-hidden />
          {variant === "row" && "Copy"}
        </button>
        {variant === "row" && <span className="flex-1" />}
        <button
          type="button"
          onClick={() => setPendingTrash(item)}
          className={actionClass(variant, true)}
          title="Move to Trash"
          aria-label="Move to Trash"
        >
          <Trash2 className="h-3 w-3" aria-hidden />
        </button>
      </>
    );

  return (
    <section className="flex flex-col gap-1">
      {header}
      {items.length === 0 ? (
        <div className="grid justify-items-center gap-1 px-3 py-5 text-center">
          <span className="text-xs text-[var(--fg-3)]">No saved files yet</span>
          <span className="text-[10px] text-[var(--fg-4)]">Files you export land here.</span>
        </div>
      ) : view === "grid" ? (
        <div className="grid max-h-[270px] grid-cols-2 gap-2 overflow-y-auto p-0.5">
          {items.map((item) => (
            <div
              key={item.id}
              onPointerDown={(e) => drag.start(e, item)}
              onDoubleClick={() => openItem(item)}
              title={item.fileName}
              className={`relative aspect-[108/68] cursor-grab overflow-hidden rounded-md border bg-[var(--bg-canvas)] ${
                selectedId === item.id
                  ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                  : "border-[var(--border)] hover:border-[var(--border-strong)]"
              } ${item.missing ? "opacity-40" : ""}`}
            >
              {item.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
                <img src={item.thumb} alt="" className="h-full w-full object-contain" />
              ) : null}
              {item.missing ? (
                <AlertTriangle className="absolute right-1 top-1 h-3 w-3 text-[var(--warning)]" aria-hidden />
              ) : (
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/55 px-1 text-[9px] text-white">
                  {timeOf(item.savedAt)}
                </span>
              )}
              {selectedId === item.id && (
                <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-gradient-to-t from-black/80 to-transparent p-1">
                  {actions(item, "tile")}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex max-h-[270px] flex-col gap-px overflow-y-auto pr-0.5">
          {items.map((item, idx) => (
            <HistoryRow
              key={item.id}
              item={item}
              showDay={items.length > 8 && dayOf(item.savedAt) !== dayOf(items[idx - 1]?.savedAt ?? 0)}
              selected={selectedId === item.id}
              onPointerDown={(e) => drag.start(e, item)}
              onDoubleClick={() => openItem(item)}
              actions={actions(item, "row")}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingTrash !== null}
        title="Move to Trash?"
        preview={
          pendingTrash
            ? {
                thumb: pendingTrash.thumb || undefined,
                line1: pendingTrash.fileName,
                line2: `${dirName(pendingTrash.path)}${
                  pendingTrash.bytes ? ` · ${formatBytes(pendingTrash.bytes)}` : ""
                }`,
              }
            : undefined
        }
        body="You can restore it from the Trash. It will also be removed from this list."
        confirmLabel="Move to Trash"
        destructive
        onCancel={() => setPendingTrash(null)}
        onConfirm={() => {
          const item = pendingTrash;
          setPendingTrash(null);
          if (item) void trash(item);
        }}
      />
    </section>
  );

  function actionClass(variant: "row" | "tile", danger = false) {
    return variant === "row"
      ? `inline-flex h-[26px] items-center gap-1.5 rounded px-2 text-[10px] text-[var(--fg-2)] bg-[var(--surface-raised)] hover:text-[var(--fg)] ${
          danger ? "hover:bg-[var(--danger)] hover:text-white" : "hover:bg-[var(--surface-raised-hover)]"
        }`
      : `grid h-6 w-6 place-items-center rounded bg-white/10 text-white hover:bg-white/25 ${
          danger ? "hover:!bg-[var(--danger)]" : ""
        }`;
  }
}

function HistoryRow({
  item,
  showDay,
  selected,
  onPointerDown,
  onDoubleClick,
  actions,
}: {
  item: HistoryItem;
  showDay: boolean;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  actions: React.ReactNode;
}) {
  return (
    <>
      {showDay && (
        <div className="px-2 pb-0.5 pt-2 text-[10px] text-[var(--fg-4)]">
          {dayLabel(item.savedAt)}
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        className={`relative flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${
          selected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-raised)]"
        }`}
      >
        {selected && (
          <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--accent)]" aria-hidden />
        )}
        <span
          className={`h-[26px] w-10 flex-none overflow-hidden rounded border border-[var(--border)] bg-[var(--bg-canvas)] ${
            item.missing ? "opacity-35" : ""
          }`}
        >
          {item.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
            <img src={item.thumb} alt="" className="h-full w-full object-contain" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-xs ${
              item.missing ? "text-[var(--fg-4)] line-through" : "text-[var(--fg-2)]"
            }`}
          >
            {item.fileName}
          </span>
          <span className="block truncate text-[10px] text-[var(--fg-4)]">
            {item.missing
              ? `${dayLabel(item.savedAt)} · File not found`
              : [timeOf(item.savedAt), formatBytes(item.bytes), item.size && `${item.size.w}×${item.size.h}`]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </span>
        {item.missing && (
          <AlertTriangle className="h-3 w-3 flex-none text-[var(--warning)]" aria-hidden />
        )}
      </div>
      {selected && <div className="flex gap-0.5 pb-1.5 pl-[54px] pr-1.5 pt-0.5">{actions}</div>}
    </>
  );
}

/**
 * Press-and-drag from a history row onto the canvas.
 *
 * Pointer events, not HTML5 drag-and-drop: the editor window runs with Tauri's
 * `dragDropEnabled`, which swallows in-page dragstart on Windows. A click that
 * never travels far selects the row instead.
 */
function usePointerDrag(onDrop: (item: HistoryItem) => void, hasImage: boolean) {
  const select = useHistory((s) => s.select);
  const selectedId = useHistory((s) => s.selectedId);
  const stateRef = useRef<{ item: HistoryItem; x: number; y: number; live: boolean } | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const teardown = useCallback(() => {
    ghostRef.current?.remove();
    ghostRef.current = null;
    document.getElementById("canvas-drop-hint")?.setAttribute("data-on", "false");
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(
    (e: React.PointerEvent, item: HistoryItem) => {
      if ((e.target as HTMLElement).closest("button")) return;
      if (e.button !== 0) return;
      stateRef.current = { item, x: e.clientX, y: e.clientY, live: false };

      const move = (ev: PointerEvent) => {
        const st = stateRef.current;
        if (!st) return;
        if (!st.live) {
          if (Math.hypot(ev.clientX - st.x, ev.clientY - st.y) < DRAG_THRESHOLD_PX) return;
          st.live = true;
          const ghost = document.createElement("div");
          ghost.style.cssText =
            "position:fixed;z-index:9999;pointer-events:none;width:96px;height:60px;border-radius:8px;overflow:hidden;border:1px solid var(--accent);box-shadow:var(--elev-3);opacity:.9;background:var(--bg-canvas)";
          if (st.item.thumb) {
            const img = document.createElement("img");
            img.src = st.item.thumb;
            img.style.cssText = "width:100%;height:100%;object-fit:contain";
            ghost.appendChild(img);
          }
          document.body.appendChild(ghost);
          ghostRef.current = ghost;
          const hint = document.getElementById("canvas-drop-hint");
          if (hint) {
            hint.dataset.on = "true";
            hint.dataset.mode = hasImage ? "layer" : "base";
          }
        }
        if (ghostRef.current) {
          ghostRef.current.style.left = `${ev.clientX - 48}px`;
          ghostRef.current.style.top = `${ev.clientY - 30}px`;
        }
      };

      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        const st = stateRef.current;
        stateRef.current = null;
        teardown();
        if (!st) return;
        if (!st.live) {
          select(selectedId === st.item.id ? null : st.item.id);
          return;
        }
        const canvas = document.getElementById("canvas-area");
        const r = canvas?.getBoundingClientRect();
        if (
          r &&
          ev.clientX >= r.left && ev.clientX <= r.right &&
          ev.clientY >= r.top && ev.clientY <= r.bottom
        ) {
          onDrop(st.item);
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [hasImage, onDrop, select, selectedId, teardown],
  );

  return useMemo(() => ({ start }), [start]);
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayOf(at: number): string {
  return new Date(at).toDateString();
}
function dayLabel(at: number): string {
  const d = dayOf(at);
  const now = new Date();
  if (d === now.toDateString()) return "Today";
  const y = new Date(now.getTime() - 86400000);
  if (d === y.toDateString()) return "Yesterday";
  return new Date(at).toLocaleDateString([], { day: "numeric", month: "short" });
}
