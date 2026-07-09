"use client";

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Progress = { frames: number; height: number; warnings: number };

/**
 * Compact always-on-top control for an in-flight scrolling capture. The Rust
 * sampler stitches frames on a timer and pushes `scroll://progress`; this HUD
 * shows the growing height + frame count and lets the user finish (Enter /
 * Capture) or cancel (Esc). Its window is transparent — only the pill is drawn.
 */
export default function ScrollHudPage() {
  const [progress, setProgress] = useState<Progress>({ frames: 1, height: 0, warnings: 0 });
  const [busy, setBusy] = useState(false);
  // True once Capture is pressed: the tall PNG is being stitched/encoded and
  // opened in the editor. We surface a spinner and block all input until the
  // Rust side resolves (the HUD window is then closed by the backend).
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  useEffect(() => {
    const un = listen<Progress>("scroll://progress", (e) => setProgress(e.payload));
    return () => {
      void un.then((f) => f());
    };
  }, []);

  const finish = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setFinishing(true);
    invoke("scroll_capture_finish_command").catch((e) => {
      console.error("scroll_capture_finish_command failed", e);
      // Re-enable so the user can retry/cancel if finishing failed; on success
      // the backend closes this window, so this state is never seen.
      setBusy(false);
      setFinishing(false);
    });
  }, [busy]);

  const cancel = useCallback(() => {
    if (busy) return;
    setBusy(true);
    invoke("scroll_capture_cancel_command").catch((e) => {
      console.error("scroll_capture_cancel_command failed", e);
      setBusy(false);
    });
  }, [busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, cancel]);

  return (
    <div className="flex h-screen w-screen items-center justify-center select-none" style={{ background: "transparent" }}>
      <div
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3"
        style={{
          background: "var(--surface-overlay)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 40px -16px rgba(0,0,0,0.7)",
        }}
      >
        {finishing ? (
          <>
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 animate-spin rounded-full"
              style={{
                border: "2px solid rgba(255,255,255,0.25)",
                borderTopColor: "var(--accent)",
              }}
            />
            <div className="flex min-w-0 flex-1 flex-col" role="status" aria-live="polite">
              <span className="text-[12px] font-semibold tracking-wide text-white/90">
                Processing capture…
              </span>
              <span className="text-[11px] text-white/60">
                Stitching {progress.height}px · opening editor
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12px] font-semibold tracking-wide text-white/90">
                Scrolling capture
              </span>
              <span className="text-[11px] text-white/60">
                {/* Down-only: the stitcher models downward scroll; scrolling back up
                    duplicates content (see services/stitch.rs). */}
                Scroll down · {progress.height}px · {progress.frames} frame{progress.frames === 1 ? "" : "s"}
                {progress.warnings > 0 ? " · ⚠ seams" : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-white/80 disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)", border: "1px solid rgba(255,255,255,0.18)" }}
            >
              Capture
            </button>
          </>
        )}
      </div>
    </div>
  );
}
