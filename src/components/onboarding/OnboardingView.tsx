"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Camera, Check, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { GlowTile } from "@/components/design/tiles/GlowTile";
import { useSettings } from "@/stores/settings";

type Step = "welcome" | "permission" | "done";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

type Props = {
  onDone: () => void;
  onOpenInertRecovery?: () => void;
};

export function OnboardingView({ onDone, onOpenInertRecovery }: Props) {
  const { ready, init, update } = useSettings();
  const [step, setStep] = useState<Step>("welcome");
  const [granted, setGranted] = useState<boolean | null>(null);
  const [requested, setRequested] = useState(false);
  const [needsRelaunch, setNeedsRelaunch] = useState(false);
  const [inert, setInert] = useState(false);
  const [busy, setBusy] = useState<"" | "request" | "open" | "relaunch">("");
  const initialGrantedRef = useRef<boolean | null>(null);
  const probedRef = useRef(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (step !== "permission") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const ok = await invoke<boolean>("has_screen_recording_permission");
        if (cancelled) return;
        setGranted((prev) => {
          if (initialGrantedRef.current === null) {
            initialGrantedRef.current = ok;
          } else if (!initialGrantedRef.current && ok && prev !== ok) {
            setNeedsRelaunch(true);
          }
          return ok;
        });
        if (ok && !probedRef.current) {
          probedRef.current = true;
          try {
            const probeOk = await invoke<boolean>("probe_capture_command");
            if (cancelled) return;
            if (!probeOk) setInert(true);
          } catch {
            // ignore probe errors
          }
        }
        if (!ok) {
          probedRef.current = false;
          setInert(false);
        }
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
  }, [step]);

  async function requestPermission() {
    setBusy("request");
    setRequested(true);
    try {
      await invoke<boolean>("request_screen_recording_permission");
      const ok = await invoke<boolean>("has_screen_recording_permission");
      setGranted(ok);
    } finally {
      setBusy("");
    }
  }

  async function openSettings() {
    setBusy("open");
    try {
      await invoke("open_system_settings_screen_recording");
    } catch (e) {
      console.error(e);
    } finally {
      setBusy("");
    }
  }

  async function relaunch() {
    setBusy("relaunch");
    try {
      await invoke("relaunch_app");
    } catch (e) {
      console.error(e);
      setBusy("");
    }
  }

  async function finish() {
    await update("general", { onboardingCompleted: true });
    onDone();
  }

  if (!ready) {
    return (
      <main className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  const tile =
    step === "permission"
      ? { cls: "glow-tile-amber", icon: ShieldCheck }
      : step === "done"
        ? { cls: "glow-tile-emerald", icon: Sparkles }
        : { cls: "glow-tile-violet", icon: Camera };

  return (
    <main className="flex min-h-full items-center justify-center p-8 text-foreground">
      <div className="glass-card w-full max-w-xl p-8">
        <div className="mb-6 flex items-center gap-4">
          <div className={`glow-tile ${tile.cls} h-16 w-16`}>
            <tile.icon className="h-7 w-7" aria-hidden />
          </div>
          <div className="flex-1">
            <Stepper step={step} showMac={IS_MAC} />
          </div>
        </div>
        <div className="pt-2">
          {step === "welcome" && (
            <Welcome
              onNext={() => {
                if (IS_MAC) setStep("permission");
                else setStep("done");
              }}
            />
          )}
          {step === "permission" && (
            <Permission
              granted={granted}
              requested={requested}
              needsRelaunch={needsRelaunch}
              inert={inert}
              busy={busy}
              onRequest={requestPermission}
              onOpenSettings={openSettings}
              onRelaunch={relaunch}
              onOpenInertRecovery={onOpenInertRecovery}
              onNext={() => setStep("done")}
            />
          )}
          {step === "done" && <Done onFinish={finish} />}
        </div>
      </div>
    </main>
  );
}

function Stepper({ step, showMac }: { step: Step; showMac: boolean }) {
  const steps: { id: Step; label: string }[] = showMac
    ? [
        { id: "welcome", label: "Welcome" },
        { id: "permission", label: "Permission" },
        { id: "done", label: "Done" },
      ]
    : [
        { id: "welcome", label: "Welcome" },
        { id: "done", label: "Done" },
      ];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const active = s.id === step;
        const passed =
          steps.findIndex((x) => x.id === step) >
          steps.findIndex((x) => x.id === s.id);
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                active
                  ? "bg-gradient-to-b from-violet-400 to-violet-600 text-white shadow-[0_0_0_3px_rgba(167,139,250,0.25)]"
                  : passed
                    ? "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/50"
                    : "bg-white/5 text-muted-foreground ring-1 ring-white/10"
              }`}
            >
              {i + 1}
            </span>
            <span className={active ? "font-medium text-white" : "text-muted-foreground"}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-1 h-px w-8 bg-white/15" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const mod = IS_MAC ? "⌘⌥⇧" : "Ctrl+Alt+Shift+";
  return (
    <div className="grid gap-4">
      <h1 className="headline-xl">Welcome to capz</h1>
      <p className="text-sm text-muted-foreground">
        Fast screenshots with annotation. Default hotkeys:
      </p>
      <ul className="grid gap-2 text-sm">
        <li className="flex items-center gap-2">
          <kbd className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs">
            {mod}3
          </kbd>
          <span className="text-foreground/80">full screen capture</span>
        </li>
        <li className="flex items-center gap-2">
          <kbd className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs">
            {mod}4
          </kbd>
          <span className="text-foreground/80">area capture</span>
        </li>
        <li className="flex items-center gap-2">
          <kbd className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs">
            {mod}5
          </kbd>
          <span className="text-foreground/80">window capture</span>
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        Change these any time from Settings.
      </p>
      <div className="mt-4 flex justify-end">
        <button onClick={onNext} className="glass-button-primary">
          Next
        </button>
      </div>
    </div>
  );
}

type Busy = "" | "request" | "open" | "relaunch";

function Permission({
  granted,
  requested,
  needsRelaunch,
  inert,
  busy,
  onRequest,
  onOpenSettings,
  onRelaunch,
  onOpenInertRecovery,
  onNext,
}: {
  granted: boolean | null;
  requested: boolean;
  needsRelaunch: boolean;
  inert: boolean;
  busy: Busy;
  onRequest: () => void;
  onOpenSettings: () => void;
  onRelaunch: () => void;
  onOpenInertRecovery?: () => void;
  onNext: () => void;
}) {
  const state: "unknown" | "ready" | "needs-relaunch" | "ask" | "open-settings" | "inert" =
    granted === null
      ? "unknown"
      : granted
        ? inert
          ? "inert"
          : needsRelaunch
            ? "needs-relaunch"
            : "ready"
        : requested
          ? "open-settings"
          : "ask";

  return (
    <div className="grid gap-4">
      <h2 className="headline-xl">Screen Recording permission</h2>
      <p className="text-sm text-muted-foreground">
        macOS asks every app for explicit permission to read your screen
        contents. Without it capz can&apos;t capture anything.
      </p>

      <StatusCard state={state} />

      {state === "ask" && (
        <Guidance>
          Click <strong>Allow</strong> in the macOS prompt that appears next.
          If you don&apos;t see it, use <em>Open System Settings</em> below.
        </Guidance>
      )}
      {state === "open-settings" && (
        <Guidance>
          macOS won&apos;t prompt again. Open System Settings, find{" "}
          <strong>capz</strong> under Screen Recording, and toggle it on. This
          view updates automatically once granted.
        </Guidance>
      )}
      {state === "needs-relaunch" && (
        <Guidance tone="warning">
          Permission granted, but macOS only applies it to processes started
          <em> after</em> the change. Relaunch capz to finish.
        </Guidance>
      )}
      {state === "inert" && (
        <Guidance tone="warning">
          System Settings shows capz as allowed, but the entry is keyed to the
          previous build and the new binary cannot capture. The stale row must
          be removed (minus button) — toggling won&apos;t recover. Use{" "}
          <strong>Fix permission…</strong> below for the guided steps.
        </Guidance>
      )}

      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          state={state}
          busy={busy}
          onRequest={onRequest}
          onOpenSettings={onOpenSettings}
          onRelaunch={onRelaunch}
          onOpenInertRecovery={onOpenInertRecovery}
          onNext={onNext}
        />
        {state !== "ready" && state !== "inert" && (
          <button
            onClick={onOpenSettings}
            disabled={busy !== ""}
            className="glass-button"
          >
            Open System Settings
          </button>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <button
          onClick={onNext}
          disabled={busy !== ""}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function StatusCard({
  state,
}: {
  state: "unknown" | "ready" | "needs-relaunch" | "ask" | "open-settings" | "inert";
}) {
  const map: Record<
    typeof state,
    { tile: string; tone: string; icon: typeof Check; label: string; eyebrow: string }
  > = {
    unknown: {
      tile: "glow-tile-violet",
      tone: "text-[var(--color-fg-2)]",
      icon: Clock,
      eyebrow: "Checking",
      label: "Polling system permission…",
    },
    ready: {
      tile: "glow-tile-emerald",
      tone: "text-emerald-200",
      icon: Check,
      eyebrow: "Granted",
      label: "Ready to capture",
    },
    "needs-relaunch": {
      tile: "glow-tile-amber",
      tone: "text-amber-200",
      icon: ShieldCheck,
      eyebrow: "Relaunch",
      label: "Granted — relaunch required",
    },
    ask: {
      tile: "glow-tile-amber",
      tone: "text-amber-200",
      icon: ShieldCheck,
      eyebrow: "Pending",
      label: "Not granted yet",
    },
    "open-settings": {
      tile: "glow-tile-amber",
      tone: "text-amber-200",
      icon: ShieldCheck,
      eyebrow: "Pending",
      label: "Awaiting toggle in System Settings",
    },
    inert: {
      tile: "glow-tile-amber",
      tone: "text-amber-200",
      icon: ShieldCheck,
      eyebrow: "Stale grant",
      label: "Granted on paper — capture returns blank frames",
    },
  };
  const s = map[state];
  const Icon = s.icon;
  return (
    <div className="glass-card flex items-center gap-3 p-3">
      <GlowTile
        size={40}
        className={s.tile}
        icon={<Icon className="h-4 w-4" aria-hidden />}
      />
      <div className="flex flex-col">
        <span className="eyebrow">{s.eyebrow}</span>
        <span className={`text-sm ${s.tone}`}>{s.label}</span>
      </div>
    </div>
  );
}

function Guidance({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning";
}) {
  const cls =
    tone === "warning"
      ? "rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100"
      : "rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-muted-foreground";
  return <div className={cls}>{children}</div>;
}

function PrimaryButton({
  state,
  busy,
  onRequest,
  onOpenSettings,
  onRelaunch,
  onOpenInertRecovery,
  onNext,
}: {
  state: "unknown" | "ready" | "needs-relaunch" | "ask" | "open-settings" | "inert";
  busy: Busy;
  onRequest: () => void;
  onOpenSettings: () => void;
  onRelaunch: () => void;
  onOpenInertRecovery?: () => void;
  onNext: () => void;
}) {
  if (state === "ready") {
    return (
      <button onClick={onNext} disabled={busy !== ""} className="glass-button-primary">
        Continue
      </button>
    );
  }
  if (state === "needs-relaunch") {
    return (
      <button onClick={onRelaunch} disabled={busy !== ""} className="glass-button-primary">
        {busy === "relaunch" ? "Relaunching…" : "Relaunch capz"}
      </button>
    );
  }
  if (state === "ask") {
    return (
      <button onClick={onRequest} disabled={busy !== ""} className="glass-button-primary">
        {busy === "request" ? "Requesting…" : "Request permission"}
      </button>
    );
  }
  if (state === "open-settings") {
    return (
      <button onClick={onOpenSettings} disabled={busy !== ""} className="glass-button-primary">
        {busy === "open" ? "Opening…" : "Open System Settings"}
      </button>
    );
  }
  if (state === "inert") {
    return (
      <button
        onClick={onOpenInertRecovery}
        disabled={busy !== "" || !onOpenInertRecovery}
        className="glass-button-primary disabled:opacity-50"
      >
        Fix permission…
      </button>
    );
  }
  return (
    <button disabled className="glass-button-primary">
      Checking…
    </button>
  );
}

function Done({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="grid gap-4">
      <h2 className="headline-xl">You&apos;re all set</h2>
      <p className="text-sm text-muted-foreground">
        capz lives in your menu bar / system tray. Use the hotkeys, or click
        the tray icon for capture options.
      </p>
      <p className="text-xs text-muted-foreground">
        Tweak everything later from the Settings view.
      </p>
      <div className="mt-4 flex justify-end">
        <button onClick={onFinish} className="glass-button-primary">
          Finish
        </button>
      </div>
    </div>
  );
}
