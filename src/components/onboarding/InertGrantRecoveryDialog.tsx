"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { AlertTriangle, Check, X } from "lucide-react";
import { useT } from "@/i18n/useT";
import { rich } from "@/lib/richText";

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
  const { t } = useT();

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
    >
      <div
        className="surface relative flex w-full max-w-lg max-h-full flex-col overflow-hidden text-foreground"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inert-recovery-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          aria-label={t("onboarding.inert.close")}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="shrink-0 p-6 pb-3">
          <h2 id="inert-recovery-title" className="text-base font-semibold text-white">
            {t("onboarding.inert.title")}
          </h2>
          <p className="mt-2 text-sm text-foreground/75">{rich(t("onboarding.inert.lead"))}</p>
        </div>

        <ol className="grid gap-4 overflow-y-auto px-6 pb-6 pt-2">
          <Step
            n={1}
            active={step === 1}
            done={step > 1}
            title={t("onboarding.inert.step1.title")}
          >
            <p className="text-xs text-muted-foreground">
              {rich(t("onboarding.inert.step1.body"))}
            </p>
            <button
              type="button"
              onClick={() => void openSettings("open1")}
              disabled={busy !== ""}
              className="btn btn--secondary mt-1 self-start"
            >
              {busy === "open1" ? t("onboarding.opening") : t("onboarding.inert.openPrivacy")}
            </button>
          </Step>

          <Step
            n={2}
            active={step === 2}
            done={step > 2}
            title={t("onboarding.inert.step2.title")}
          >
            <p className="text-xs text-muted-foreground">{t("onboarding.inert.step2.body")}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void requestPermission()}
                disabled={busy !== "" || step < 2}
                className="btn btn--primary mt-1 self-start disabled:opacity-50"
              >
                {busy === "request" ? t("onboarding.requesting") : t("onboarding.requestPermission")}
              </button>
              <ProbeBadge status={probe} />
            </div>
            {probe === "still-inert" && (
              <Warning>{t("onboarding.inert.step2.stillInert")}</Warning>
            )}
            {probe === "denied" && (
              <Warning>{t("onboarding.inert.step2.denied")}</Warning>
            )}
          </Step>

          <Step
            n={3}
            active={step === 3}
            done={step > 3}
            title={t("onboarding.inert.step3.title")}
          >
            <p className="text-xs text-muted-foreground">
              {rich(t("onboarding.inert.step3.body"))}
            </p>
            <button
              type="button"
              onClick={() => void openSettings("open3")}
              disabled={busy !== "" || step < 3}
              className="btn btn--secondary mt-1 self-start disabled:opacity-50"
            >
              {busy === "open3" ? t("onboarding.opening") : t("onboarding.inert.openPrivacy")}
            </button>
          </Step>

          <Step n={4} active={step === 4} done={false} title={t("onboarding.relaunchCapz")}>
            <p className="text-xs text-muted-foreground">{t("onboarding.inert.step4.body")}</p>
            <button
              type="button"
              onClick={() => void relaunch()}
              disabled={busy !== ""}
              className="btn btn--primary mt-1 self-start disabled:opacity-50"
            >
              {busy === "relaunch" ? t("onboarding.relaunching") : t("onboarding.relaunchCapz")}
            </button>
            {step < 4 && (
              <p className="text-[11px] text-muted-foreground/80">
                {t("onboarding.inert.step4.hint")}
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
      ? "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
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
  const { t } = useT();
  if (status === "idle") return null;
  if (status === "pending") {
    return <span className="text-xs text-muted-foreground">{t("onboarding.inert.probe.pending")}</span>;
  }
  if (status === "granted") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
        <Check className="h-3 w-3" aria-hidden /> {t("onboarding.inert.probe.works")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-300">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      {status === "still-inert" ? t("onboarding.inert.probe.stillInert") : t("onboarding.inert.probe.denied")}
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
