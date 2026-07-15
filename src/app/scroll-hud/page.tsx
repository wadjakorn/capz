"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ensureAutoScrollPermission } from "@/lib/accessibility";

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
  // Starts false to match the static prerender (window is undefined at build
  // time); a mount effect below flips it from the `?auto=1` window param so a
  // direct-auto launch locks the HUD immediately without a hydration mismatch.
  const [auto, setAuto] = useState(false);
  // Transient status line; cleared a few seconds after it last changed.
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);
  // Synchronous guard so a commit can't be kicked off twice within one click
  // (e.g. a button's onClick plus the pill's bubble handler, or Enter+click).
  // The `busy`/`finishing` state flags update async and don't protect that.
  const committing = useRef(false);

  // Seed auto from the launch param after mount (not in the useState initializer,
  // which would diverge from the static prerender and throw a hydration error).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auto") === "1") {
      setAuto(true);
    }
  }, []);

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
    // and flip the spinner back off mid-encode. `committing` also blocks a
    // duplicate within the same click tick (state flags update async).
    if (busy || finishing || committing.current) return;
    committing.current = true;
    setBusy(true);
    setFinishing(true);
    invoke("scroll_capture_finish_command").catch((e) => {
      console.error("scroll_capture_finish_command failed", e);
      // Re-enable so the user can retry/cancel if finishing failed; on success
      // the backend closes this window, so this state is never seen.
      committing.current = false;
      setBusy(false);
      setFinishing(false);
    });
  }, [busy, finishing]);

  const cancel = useCallback(() => {
    if (busy || finishing || committing.current) return;
    setBusy(true);
    invoke("scroll_capture_cancel_command").catch((e) => {
      console.error("scroll_capture_cancel_command failed", e);
      setBusy(false);
    });
  }, [busy, finishing]);

  const startAuto = useCallback(async () => {
    if (busy || finishing) return;
    setNote(null);
    const ok = await ensureAutoScrollPermission();
    if (!ok) {
      setNote("Enable Accessibility for capz, then press Auto-scroll again");
      if (noteTimer.current) window.clearTimeout(noteTimer.current);
      noteTimer.current = window.setTimeout(() => setNote(null), 6000);
      return;
    }
    setAuto(true);
    invoke("scroll_capture_auto_start_command").catch((e) => {
      console.error("scroll_capture_auto_start_command failed", e);
      setAuto(false);
    });
  }, [busy, finishing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish();
      } else if (e.key === "Escape") {
        e.preventDefault();
        // Esc always cancels (discards), in both manual and auto (CP-0013). In
        // auto every button is disabled, so Esc is the dedicated cancel path;
        // Enter / a single click still stop-and-capture.
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, cancel]);

  // During auto-scroll any click on the pill commits (see ESC note above).
  const onPillClick = useCallback(() => {
    if (auto) finish();
  }, [auto, finish]);

  return (
    <div className="flex h-screen w-screen items-center justify-center select-none" style={{ background: "transparent" }}>
      <div
        onClick={onPillClick}
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
              <span className="truncate text-[12px] font-semibold tracking-wide text-white/90">
                Processing capture…
              </span>
              <span className="truncate text-[11px] text-white/60">
                Stitching {progress.height}px · opening editor
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              {/* truncate (not wrap): the buttons are shrink-0, so a narrow pill
                  must ellipsize this title rather than wrap it to a second line
                  and push the bar past the HUD window height. */}
              <span className="truncate text-[12px] font-semibold tracking-wide text-white/90">
                Scrolling capture
              </span>
              <span className="truncate text-[11px] text-white/60">
                {note ? (
                  <span className="text-amber-300">{note}</span>
                ) : (
                  <>
                    {/* Down to capture; only downward content is appended. Scrolling
                        back up is tolerated — the stitcher recognizes and ignores
                        upward frames, so no duplicated band (see services/stitch.rs). */}
                    {auto ? "Auto-scrolling · Enter/click capture · Esc cancel" : "Scroll down"} · {progress.height}px ·{" "}
                    {progress.frames} frame{progress.frames === 1 ? "" : "s"}
                    {progress.warnings > 0 ? " · ⚠ seams" : ""}
                  </>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={cancel}
              disabled={busy || auto}
              className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium text-white/80 disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}
            >
              Cancel
            </button>
            {/* Auto-scroll is chosen once at the overlay arming bar and is not
                switchable mid-capture, so this button is disabled throughout the
                HUD: greyed while manual scrolls (start auto from the arming bar
                instead) and greyed while auto runs. */}
            <button
              type="button"
              onClick={startAuto}
              disabled
              className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium text-white/90 disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}
              title="Start auto-scroll from the selection bar before capture begins"
            >
              Auto-scroll
            </button>
            {/* During auto the backend drives the pointer, so a mouse click on
                Capture is unreliable — disable it and commit via Enter / a click
                anywhere on the pill / Esc-to-cancel instead. */}
            <button
              type="button"
              onClick={finish}
              disabled={busy || auto}
              className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
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
