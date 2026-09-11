"use client";

import { useCallback, useEffect, useRef } from "react";

import { useEditor } from "@/stores/editor";
import { useOcr } from "@/stores/ocr";
import { isTauriRuntime } from "@/lib/platform";
import { onStageImageSize } from "@/lib/stageBridge";
import {
  renderThumb,
  restoreHistory,
  restoreScroll,
  useWorkspaces,
} from "@/stores/workspaces";

/** How long after the last edit a workspace's tile thumbnail is re-rendered. */
const THUMB_DEBOUNCE_MS = 500;

export type WorkspaceSessionOptions = {
  /** Feature switch. When false this hook does nothing at all. */
  enabled: boolean;
  setFile: (path: string | null) => void;
  setSrc: (src: string) => void;
};

/**
 * Binds the workspace store to the single live editor.
 *
 * Only one Konva stage is ever mounted, so "switching workspaces" means
 * snapshotting the editor into the outgoing doc and hydrating it from the
 * incoming one. The order matters:
 *
 *  1. `displayScale` is hydrated *before* `src` changes — EditorStage only
 *     auto-fits from the 0 sentinel, so a restored non-zero zoom survives.
 *  2. Scroll is restored only once the new bitmap has decoded, because the
 *     stage is not remounted and its scroll extent is still the old image's
 *     until then. `swapping` blocks thumbnails and export for that window.
 */
export function useWorkspaceSession({ enabled, setFile, setSrc }: WorkspaceSessionOptions) {
  const activeId = useWorkspaces((s) => s.activeId);
  const ready = useWorkspaces((s) => s.ready);
  const setHasImage = useEditor((s) => s.setHasImage);
  const loadedKeyRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void useWorkspaces.getState().init(enabled);
  }, [enabled]);

  useEffect(() => () => cleanupRef.current?.(), []);

  // --- apply the active workspace to the editor -----------------------------
  useEffect(() => {
    if (!enabled || !ready) return;
    const { docs, setSwapping } = useWorkspaces.getState();
    const doc = activeId ? docs[activeId] : undefined;

    // Guard against re-running for the same (workspace, image) pair: the store
    // updates on every annotation, and reloading `src` would reset the stage.
    const key = `${activeId ?? ""}|${
      doc?.image ? (doc.image.kind === "file" ? doc.image.path : doc.image.url) : ""
    }`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;

    let cancelled = false;
    void (async () => {
      if (!doc) {
        setFile(null);
        setSrc("");
        useEditor.getState().reset();
        useOcr.getState().reset();
        setHasImage(false);
        setSwapping(false);
        return;
      }

      // Hydrate first so the restored zoom is in place before the image lands.
      useEditor.getState().hydrate(doc);
      restoreHistory(doc.id);

      if (!doc.image) {
        setFile(null);
        setSrc("");
        setHasImage(false);
        setSwapping(false);
        return;
      }

      let src: string;
      let path: string | null = null;
      if (doc.image.kind === "blob") {
        src = doc.image.url;
      } else {
        path = doc.image.path;
        if (isTauriRuntime()) {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          if (cancelled) return;
          // Cache-bust: two workspaces can legitimately point at the same path
          // after an undo, and the webview would otherwise serve a stale decode.
          src = `${convertFileSrc(path)}?w=${doc.id}`;
        } else {
          src = path;
        }
      }
      setFile(path);
      setSrc(src);
      setHasImage(true);
      // OCR results are already keyed by path, so a swap only needs to point
      // the store at the new image — resetting would throw away a scan the
      // user can return to.
      if (path) useOcr.getState().setKey(path);

      const off = onStageImageSize(() => {
        off();
        restoreScroll(doc.scroll);
        useWorkspaces.getState().setSwapping(false);
      });
      // Safety net: if the image fails to decode the listener never fires and
      // the editor would stay stuck in `swapping` (no thumbnails, no export).
      const timer = setTimeout(() => {
        off();
        useWorkspaces.getState().setSwapping(false);
      }, 4000);
      cleanupRef.current = () => {
        off();
        clearTimeout(timer);
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, enabled, ready, setFile, setSrc, setHasImage]);

  // --- live tile thumbnails -------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const { activeId: id, swapping, setThumb } = useWorkspaces.getState();
        if (!id || swapping) return;
        setThumb(id, renderThumb());
      }, THUMB_DEBOUNCE_MS);
    };
    const unsub = useEditor.subscribe(schedule);
    const onBlur = () => {
      // Commit on blur so a workspace the user tabs away from keeps an
      // up-to-date tile and its edits reach disk without waiting for a swap.
      useWorkspaces.getState().commitActive();
    };
    window.addEventListener("blur", onBlur);
    return () => {
      unsub();
      window.removeEventListener("blur", onBlur);
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  /** Open a new, empty workspace (toolbar button / ⇧⌘N / the bar's `+`). */
  const newWorkspace = useCallback(
    (max: number) => {
      useWorkspaces.getState().createEmpty(max);
    },
    [],
  );

  return { newWorkspace };
}
