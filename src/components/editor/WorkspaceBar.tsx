"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ImageOff, MoreHorizontal, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  barModeFor,
  hasEdits,
  useWorkspaces,
  type WorkspaceDoc,
} from "@/stores/workspaces";

/** Below this window height the bar starts collapsed (once — see barPrefUserSet). */
const SHORT_WINDOW_PX = 600;

function caption(doc: WorkspaceDoc): string {
  const kind =
    doc.captureSource === "systemArea"
      ? "Area"
      : doc.captureSource === "other"
        ? doc.image
          ? "Image"
          : "Empty"
        : doc.captureSource[0].toUpperCase() + doc.captureSource.slice(1);
  return `${kind} · ${relTime(doc.createdAt)}`;
}

function relTime(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export type WorkspaceBarProps = {
  /** Cap from config (desktop) or the lower web cap. */
  max: number;
  onNew: () => void;
};

/**
 * The workspace filmstrip.
 *
 * Sits below `<main>` so it spans the whole window rather than only the canvas
 * column: workspaces are app-level chrome, and stealing the sidebar's 240px
 * would make five tiles scroll at ordinary window widths.
 *
 * Three heights, one value (`barModeFor`): `hidden` at a single workspace — the
 * bar has nothing to switch between — `rail`, and `full`. Collapsing to `rail`
 * keeps every workspace clickable, so the toggle never amounts to turning the
 * feature off.
 */
export function WorkspaceBar({ max, onNew }: WorkspaceBarProps) {
  const order = useWorkspaces((s) => s.order);
  const activeId = useWorkspaces((s) => s.activeId);
  const docs = useWorkspaces((s) => s.docs);
  const barPref = useWorkspaces((s) => s.barPref);
  const barPrefUserSet = useWorkspaces((s) => s.barPrefUserSet);
  const setBarPref = useWorkspaces((s) => s.setBarPref);
  const switchTo = useWorkspaces((s) => s.switchTo);
  const close = useWorkspaces((s) => s.close);
  const closeOthers = useWorkspaces((s) => s.closeOthers);
  const reopenLastClosed = useWorkspaces((s) => s.reopenLastClosed);
  const lastClosed = useWorkspaces((s) => s.lastClosed);

  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const mode = barModeFor(order, barPref);

  // Short windows start collapsed, but only until the user expresses a
  // preference — after that their choice wins at every window size.
  useEffect(() => {
    if (barPrefUserSet) return;
    if (typeof window === "undefined") return;
    if (window.innerHeight < SHORT_WINDOW_PX && barPref !== "rail") {
      setBarPref("rail", false);
    }
  }, [barPrefUserSet, barPref, setBarPref]);

  const toggle = useCallback(() => {
    setBarPref(barPref === "rail" ? "full" : "rail");
  }, [barPref, setBarPref]);

  const requestClose = useCallback(
    (id: string) => {
      if (hasEdits(docs[id])) {
        setPendingClose(id);
        return;
      }
      close(id);
      toast("Workspace closed", {
        id: "workspace-undo",
        duration: 6000,
        action: { label: "Undo", onClick: () => reopenLastClosed() },
      });
    },
    [close, docs, reopenLastClosed],
  );

  const pendingDoc = pendingClose ? docs[pendingClose] : undefined;
  const pendingIndex = pendingClose ? order.indexOf(pendingClose) : -1;

  const full = mode === "full";
  const atMax = order.length >= max;

  const tiles = useMemo(
    () => order.map((id, i) => ({ id, i, doc: docs[id] })).filter((t) => t.doc),
    [order, docs],
  );

  if (mode === "hidden") return null;

  return (
    <>
      <div
        id="workspace-bar"
        role="tablist"
        aria-label="Workspaces"
        className={`flex flex-none items-center gap-2 border-t border-[var(--border)] bg-[var(--surface-overlay)] transition-[height,padding] duration-150 ${
          full ? "h-[84px] px-2.5 py-2" : "h-[30px] px-2.5"
        }`}
        style={{ touchAction: "pan-x" }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-ws-control]")) return;
          toggle();
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tiles.map(({ id, i, doc }) =>
            full ? (
              <WorkspaceTile
                key={id}
                doc={doc}
                index={i}
                active={id === activeId}
                onSelect={() => switchTo(id)}
                onClose={() => requestClose(id)}
              />
            ) : (
              <button
                key={id}
                type="button"
                role="tab"
                data-ws-control
                aria-selected={id === activeId}
                title={caption(doc)}
                onClick={() => switchTo(id)}
                className={`h-[18px] min-w-[22px] flex-none rounded-[6px] px-1.5 text-[10px] font-semibold transition-colors ${
                  id === activeId
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "bg-[var(--surface-raised)] text-[var(--fg-3)] hover:bg-[var(--surface-raised-hover)] hover:text-[var(--fg-2)]"
                }`}
              >
                {i + 1}
              </button>
            ),
          )}

          <button
            type="button"
            data-ws-control
            onClick={onNew}
            disabled={atMax}
            title={
              atMax
                ? `Maximum ${max} workspaces — close one first`
                : "New workspace (⌘⇧N)"
            }
            className={
              full
                ? "flex h-[62px] w-[100px] flex-none flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-[var(--border-strong)] text-[var(--fg-3)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--fg-2)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                : // In the rail a 40%-opacity plus is almost invisible; use a
                  // solid dim colour for the disabled state instead.
                  `h-[18px] min-w-[22px] flex-none rounded-[6px] px-1.5 text-[10px] font-semibold ${
                    atMax
                      ? "cursor-not-allowed text-[var(--fg-4)]"
                      : "bg-[var(--surface-raised)] text-[var(--fg-3)] hover:bg-[var(--surface-raised-hover)] hover:text-[var(--fg-2)]"
                  }`
            }
          >
            {full ? (
              <>
                <Plus className="h-4 w-4" aria-hidden />
                <span className="text-[10px]">New</span>
              </>
            ) : (
              "+"
            )}
          </button>
        </div>

        <div className="flex flex-none items-center gap-0.5 border-l border-[var(--border)] pl-2">
          <span className="mr-1 whitespace-nowrap text-[10px] text-[var(--fg-4)]">
            {order.length}/{max}
          </span>
          <button
            type="button"
            data-ws-control
            className="btn-icon h-6 w-6"
            aria-expanded={full}
            aria-controls="workspace-bar"
            title={full ? "Collapse workspace bar" : "Expand workspace bar"}
            onClick={toggle}
          >
            {full ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronUp className="h-4 w-4" aria-hidden />
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  data-ws-control
                  className="btn-icon h-6 w-6"
                  title="Workspace actions"
                  aria-label="Workspace actions"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </button>
              }
            />
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem
                disabled={!lastClosed}
                onClick={() => reopenLastClosed()}
              >
                Reopen last closed workspace
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={order.length < 2}
                onClick={() => closeOthers()}
              >
                Close others
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ConfirmDialog
        open={pendingClose !== null}
        title={`Close workspace ${pendingIndex + 1}?`}
        preview={
          pendingDoc
            ? {
                thumb: pendingDoc.thumb || undefined,
                line1: `${pendingDoc.annotations.length} annotation${
                  pendingDoc.annotations.length === 1 ? "" : "s"
                }${pendingDoc.imageCrop ? " · cropped" : ""}`,
                line2: `Captured ${relTime(pendingDoc.createdAt)} ago`,
              }
            : undefined
        }
        body="The edits in this workspace will be discarded. The screenshot file is not saved anywhere else."
        confirmLabel="Close"
        destructive
        onCancel={() => setPendingClose(null)}
        onConfirm={() => {
          const id = pendingClose;
          setPendingClose(null);
          if (!id) return;
          close(id);
          toast("Workspace closed", {
            id: "workspace-undo",
            duration: 6000,
            action: { label: "Undo", onClick: () => reopenLastClosed() },
          });
        }}
      />
    </>
  );
}

function WorkspaceTile({
  doc,
  index,
  active,
  onSelect,
  onClose,
}: {
  doc: WorkspaceDoc;
  index: number;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className="group flex flex-none flex-col items-center gap-0.5">
      <div
        role="tab"
        tabIndex={active ? 0 : -1}
        aria-selected={active}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        data-ws-control
        className={`relative h-[62px] w-[100px] cursor-pointer overflow-hidden rounded-md border bg-[var(--bg-canvas)] transition-[opacity,transform,border-color] duration-150 focus-visible:outline-none ${
          active
            ? "translate-y-[-2px] border-[var(--accent)] opacity-100 shadow-[0_0_0_1px_var(--accent)]"
            : "border-[var(--border)] opacity-[.62] group-hover:border-[var(--border-strong)] group-hover:opacity-100"
        }`}
      >
        {doc.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
          <img src={doc.thumb} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 border border-dashed border-transparent text-[var(--fg-4)]">
            <ImageOff className="h-3.5 w-3.5" aria-hidden />
            <span className="text-[9px]">{doc.image ? "" : "Empty"}</span>
          </div>
        )}

        <span
          className={`absolute left-1 top-1 grid h-4 min-w-4 place-items-center rounded px-1 text-[10px] font-semibold ${
            active
              ? "bg-[var(--accent)] text-[var(--accent-fg)]"
              : "bg-[var(--surface-raised)] text-[var(--fg-3)]"
          }`}
        >
          {index + 1}
        </span>

        {hasEdits(doc) && (
          <span
            className="absolute bottom-1.5 right-1.5 h-[5px] w-[5px] rounded-full bg-[var(--accent)] shadow-[0_0_0_2px_rgba(0,0,0,.35)]"
            aria-hidden
          />
        )}

        <button
          type="button"
          data-ws-control
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title={`Close workspace ${index + 1}`}
          aria-label={`Close workspace ${index + 1}`}
          className="absolute right-0.5 top-0.5 hidden h-4 w-4 place-items-center rounded bg-black/60 text-white hover:bg-[var(--danger)] group-hover:grid"
        >
          <X className="h-2.5 w-2.5" aria-hidden />
        </button>
      </div>
      <span
        className={`whitespace-nowrap text-[10px] text-[var(--fg-4)] transition-opacity ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {caption(doc)}
      </span>
    </div>
  );
}
