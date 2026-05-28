"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { AlertTriangle, Check, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

type StepIdx = 1 | 2 | 3 | 4;
type ProbeStatus = "idle" | "pending" | "granted" | "still-inert" | "denied";

const INERT_TOAST_ID = "permission-inert-after-update";

export function InertGrantRecoveryDialog({ open, onClose }: Props) {
  const [step, setStep] = useState<StepIdx>(1);
  const [probe, setProbe] = useState<ProbeStatus>("idle");
  const [busy, setBusy] = useState<"" | "open1" | "request" | "open3" | "relaunch">("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setProbe("idle");
    setBusy("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Poll permission while dialog open so we can auto-advance to step 4 when
  // the user toggles the new TCC row on in System Settings — macOS doesn't
  // fire any signal back to the app, so we have to observe it ourselves.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const granted = await invoke<boolean>("has_screen_recording_permission");
        if (cancelled || !granted) return;
        const probeOk = await invoke<boolean>("probe_capture_command");
        if (cancelled || !probeOk) return;
        setProbe("granted");
        setStep((s) => (s < 4 ? 4 : s));
      } catch {
        // ignore
      }
    };
    void tick();
    const id = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open]);

  if (!open) return null;

  async function openSettings(which: "open1" | "open3") {
    setBusy(which);
    try {
      await invoke("open_system_settings_screen_recording");
      setStep((s) => (which === "open1" ? (s < 2 ? 2 : s) : s < 4 ? 4 : s));
    } catch (e) {
      console.error("open_system_settings_screen_recording failed", e);
    } finally {
      setBusy("");
    }
  }

  async function requestPermission() {
    setBusy("request");
    setProbe("pending");
    try {
      const granted = await invoke<boolean>("request_screen_recording_permission");
      if (!granted) {
        setProbe("denied");
        return;
      }
      const ok = await invoke<boolean>("probe_capture_command");
      if (ok) {
        setProbe("granted");
        setStep((s) => (s < 3 ? 3 : s));
      } else {
        setProbe("still-inert");
      }
    } catch (e) {
      console.error("request_screen_recording_permission failed", e);
      setProbe("denied");
    } finally {
      setBusy("");
    }
  }

  async function relaunch() {
    setBusy("relaunch");
    try {
      toast.dismiss(INERT_TOAST_ID);
      await invoke("relaunch_app");
    } catch (e) {
      console.error("relaunch_app failed", e);
      setBusy("");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card relative flex w-full max-w-lg max-h-full flex-col overflow-hidden text-foreground"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inert-recovery-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="shrink-0 p-6 pb-3">
          <h2 id="inert-recovery-title" className="text-base font-semibold text-white">
            Fix permission after macOS update
          </h2>
          <p className="mt-2 text-sm text-foreground/75">
            System Settings still lists <strong>capz</strong> under Screen
            Recording, but the entry is keyed to the previous build&apos;s code
            identity and the new binary cannot capture. Toggling off and on does
            not recover — the row must be removed entirely so macOS re-prompts.
          </p>
        </div>

        <ol className="grid gap-4 overflow-y-auto px-6 pb-6 pt-2">
          <Step
            n={1}
            active={step === 1}
            done={step > 1}
            title="Remove the stale entry"
          >
            <p className="text-xs text-muted-foreground">
              Find <strong>capz</strong> under Screen Recording and click the{" "}
              <strong>−</strong> (minus) button to delete it. Toggling off
              won&apos;t work — the row must be removed entirely so macOS
              forgets the old code identity.
            </p>
            <button
              type="button"
              onClick={() => void openSettings("open1")}
              disabled={busy !== ""}
              className="glass-button mt-1 self-start"
            >
              {busy === "open1" ? "Opening…" : "Open Privacy Settings"}
            </button>
          </Step>

          <Step
            n={2}
            active={step === 2}
            done={step > 2}
            title="Re-prompt for permission"
          >
            <p className="text-xs text-muted-foreground">
              After removing the row, click below. macOS will ask for Screen
              Recording access again, and capz will reappear in the list under
              its new identity.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void requestPermission()}
                disabled={busy !== "" || step < 2}
                className="glass-button-primary mt-1 self-start disabled:opacity-50"
              >
                {busy === "request" ? "Requesting…" : "Request permission"}
              </button>
              <ProbeBadge status={probe} />
            </div>
            {probe === "still-inert" && (
              <Warning>
                Still inert. Go back to step 1 and confirm the old row is gone,
                then retry.
              </Warning>
            )}
            {probe === "denied" && (
              <Warning>
                macOS reported denied — open Privacy Settings and toggle the new
                row on, or repeat step 1.
              </Warning>
            )}
          </Step>

          <Step
            n={3}
            active={step === 3}
            done={step > 3}
            title="Toggle the new entry on"
          >
            <p className="text-xs text-muted-foreground">
              Switch the new <strong>capz</strong> row to on. macOS sometimes
              adds it disabled even after the prompt.
            </p>
            <button
              type="button"
              onClick={() => void openSettings("open3")}
              disabled={busy !== "" || step < 3}
              className="glass-button mt-1 self-start disabled:opacity-50"
            >
              {busy === "open3" ? "Opening…" : "Open Privacy Settings"}
            </button>
          </Step>

          <Step n={4} active={step === 4} done={false} title="Relaunch capz">
            <p className="text-xs text-muted-foreground">
              macOS only applies the new grant to processes started after the
              toggle. Relaunch to finish.
            </p>
            <button
              type="button"
              onClick={() => void relaunch()}
              disabled={busy !== ""}
              className="glass-button-primary mt-1 self-start disabled:opacity-50"
            >
              {busy === "relaunch" ? "Relaunching…" : "Relaunch capz"}
            </button>
            {step < 4 && (
              <p className="text-[11px] text-muted-foreground/80">
                Relaunch even if the earlier steps look incomplete.
              </p>
            )}
          </Step>
        </ol>
      </div>
    </div>
  );
}

function Step({
  n,
  active,
  done,
  title,
  children,
}: {
  n: StepIdx;
  active: boolean;
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  const badgeCls = done
    ? "bg-emerald-500/25 text-emerald-100 ring-emerald-400/40"
    : active
      ? "bg-violet-500/30 text-violet-100 ring-violet-400/40"
      : "bg-white/5 text-muted-foreground ring-white/10";
  const titleCls = done
    ? "text-foreground/60 line-through decoration-foreground/30"
    : active
      ? "text-white"
      : "text-foreground/70";
  return (
    <li className="grid gap-2">
      <div className="flex items-baseline gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ${badgeCls}`}
        >
          {done ? <Check className="h-3 w-3" aria-hidden /> : n}
        </span>
        <div className={`text-sm font-medium ${titleCls}`}>{title}</div>
      </div>
      <div className="ml-7 grid gap-2">{children}</div>
    </li>
  );
}

function ProbeBadge({ status }: { status: ProbeStatus }) {
  if (status === "idle") return null;
  if (status === "pending") {
    return <span className="text-xs text-muted-foreground">Probing capture…</span>;
  }
  if (status === "granted") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
        <Check className="h-3 w-3" aria-hidden /> Capture works
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-300">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      {status === "still-inert" ? "Still inert" : "Denied"}
    </span>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">
      {children}
    </div>
  );
}
