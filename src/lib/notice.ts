"use client";

import { useEffect } from "react";
import { toast } from "sonner";

type NoticeKind = "info" | "success" | "error";
type NoticePayload = { kind: NoticeKind; message: string };

/**
 * Subscribes the calling component to Rust-emitted `app:notice` events and
 * routes them to the local Sonner toaster. Pair with a `<Toaster />` in the
 * window's root.
 */
export function useNoticeListener() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<NoticePayload>("app:notice", (e) => {
        const { kind, message } = e.payload;
        if (kind === "error") toast.error(message);
        else if (kind === "success") toast.success(message);
        else toast(message);
      });
    })();
    return () => unlisten?.();
  }, []);
}
