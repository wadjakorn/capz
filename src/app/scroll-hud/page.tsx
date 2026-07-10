"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Progress = {
  frames: number;
  height: number;
  warnings: number;
  /** Backend is currently driving the scroll itself. */
  auto: boolean;
  /** Backend has begun auto-finishing (bottom reached) → show the spinner. */
  finishing: boolean;
  /** Transient status line (e.g. auto-scroll fell back to manual). */
  note: string | null;
};

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

/**
 * Compact always-on-top control for an in-flight scrolling capture. The Rust
 * sampler stitches frames on a timer and pushes `scroll://progress`; this HUD
 * shows the growing height + frame count and lets the user finish (Enter /
 * Capture) or cancel (Esc). It can also hand scrolling to the backend
 * ("Auto-scroll", ticket EJckEbEdk0ct): the backend drives the target itself,
 * detects the bottom, and auto-finishes. Its window is transparent — only the
 * pill is drawn.
 */
export default function ScrollHudPage() {
  const [progress, setProgress] = useState<Progress>({
    frames: 1,
    height: 0,
    warnings: 0,
    auto: false,
    finishing: false,
    note: null,
  });
  const [busy, setBusy] = useState(false);
  // True once Capture is pressed OR the backend signals it reached the bottom:
  // the tall PNG is being stitched/encoded and opened in the editor. We surface
  // a spinner and block all input until the Rust side resolves (the HUD window
  // is then closed by the backend).
  const [finishing, setFinishing] = useState(false);
  // Local mirror of the backend's auto state — set optimistically on click and
  // reconciled from each progress tick (so a backend fallback flips us back).
  const [auto, setAuto] = useState(false);
  // Transient status line; cleared a few seconds after it last changed.
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);

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
    const un = listen<Progress>("scroll://progress", (e) => {
      const p = e.payload;
      setProgress(p);
      setAuto(p.auto);
      if (p.finishing) setFinishing(true);
      if (p.note) {
        setNote(p.note);
        if (noteTimer.current) window.clearTimeout(noteTimer.current);
        noteTimer.current = window.setTimeout(() => setNote(null), 4000);
      }
    });
    return () => {
      void un.then((f) => f());
      if (noteTimer.current) window.clearTimeout(noteTimer.current);
    };
  }, []);

  const finish = useCallback(() => {
    // Ignore once finishing — including a backend-driven auto-finish, whose
    // spinner is already up — so a stray Enter can't kick off a second finish
    // and flip the spinner back off mid-encode.
    if (busy || finishing) return;
    setBusy(true);
    setFinishing(true);
    invoke("scroll_capture_finish_command").catch((e) => {
      console.error("scroll_capture_finish_command failed", e);
      // Re-enable so the user can retry/cancel if finishing failed; on success
      // the backend closes this window, so this state is never seen.
      setBusy(false);
      setFinishing(false);
    });
  }, [busy, finishing]);

  const cancel = useCallback(() => {
    if (busy || finishing) return;
    setBusy(true);
    invoke("scroll_capture_cancel_command").catch((e) => {
      console.error("scroll_capture_cancel_command failed", e);
      setBusy(false);
    });
  }, [busy, finishing]);

  const startAuto = useCallback(async () => {
    if (busy || finishing) return;
    setNote(null);
    // Posting synthetic wheel events on macOS needs the Accessibility grant.
    // Wire the request into the permission flow at the point of use: if it's
    // missing, prompt + open System Settings and tell the user to retry, rather
    // than silently doing nothing (the events would be dropped).
    if (IS_MAC) {
      try {
        const ok = await invoke<boolean>("has_accessibility_permission");
        if (!ok) {
          await invoke("request_accessibility_permission").catch(() => {});
          await invoke("open_system_settings_accessibility").catch(() => {});
          setNote("Enable Accessibility for capz, then press Auto-scroll again");
          if (noteTimer.current) window.clearTimeout(noteTimer.current);
          noteTimer.current = window.setTimeout(() => setNote(null), 6000);
          return;
        }
      } catch (e) {
        console.warn("accessibility preflight failed", e);
      }
    }
    setAuto(true);
    invoke("scroll_capture_auto_start_command").catch((e) => {
      console.error("scroll_capture_auto_start_command failed", e);
      setAuto(false);
    });
  }, [busy, finishing]);

  const stopAuto = useCallback(() => {
    if (busy || finishing) return;
    setAuto(false);
    invoke("scroll_capture_auto_stop_command").catch((e) =>
      console.error("scroll_capture_auto_stop_command failed", e),
    );
  }, [busy, finishing]);

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
              <span className="truncate text-[11px] text-white/60">
                {note ? (
                  <span className="text-amber-300">{note}</span>
                ) : (
                  <>
                    {/* Down-only: the stitcher models downward scroll; scrolling back up
                        duplicates content (see services/stitch.rs). */}
                    {auto ? "Auto-scrolling" : "Scroll down"} · {progress.height}px ·{" "}
                    {progress.frames} frame{progress.frames === 1 ? "" : "s"}
                    {progress.warnings > 0 ? " · ⚠ seams" : ""}
                  </>
                )}
              </span>
            </div>
            {auto ? (
              <button
                type="button"
                onClick={stopAuto}
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-white/80 disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}
                title="Stop auto-scroll and scroll manually"
              >
                Stop
              </button>
            ) : (
              <>
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
                  onClick={startAuto}
                  disabled={busy}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-white/90 disabled:opacity-50"
                  style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}
                  title="Let capz scroll the page automatically to the bottom"
                >
                  Auto-scroll
                </button>
              </>
            )}
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
