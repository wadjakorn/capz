"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/stores/settings";

type Step = "welcome" | "permission" | "done";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

type Props = {
  onDone: () => void;
};

export function OnboardingView({ onDone }: Props) {
  const { ready, init, update } = useSettings();
  const [step, setStep] = useState<Step>("welcome");
  const [granted, setGranted] = useState<boolean | null>(null);
  const [requested, setRequested] = useState(false);
  const [needsRelaunch, setNeedsRelaunch] = useState(false);
  const [busy, setBusy] = useState<"" | "request" | "open" | "relaunch">("");
  const initialGrantedRef = useRef<boolean | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  // Poll Screen Recording status while on the Permission step so the UI
  // updates the moment the user grants in System Settings — no manual
  // "Re-check" tap required.
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
            // Transitioned denied → granted within the same process. macOS
            // applies the new TCC grant only after relaunch.
            setNeedsRelaunch(true);
          }
          return ok;
        });
      } catch {
        // ignore — keep polling
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
      <main className="dark flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  return (
    <main className="dark mx-auto flex h-full max-w-xl flex-col p-8 text-foreground">
      <Stepper step={step} showMac={IS_MAC} />
      <div className="flex-1 pt-6">
        {step === "welcome" && (
          <Welcome
            onNext={() => {
              if (IS_MAC) {
                setStep("permission");
              } else {
                setStep("done");
              }
            }}
          />
        )}
        {step === "permission" && (
          <Permission
            granted={granted}
            requested={requested}
            needsRelaunch={needsRelaunch}
            busy={busy}
            onRequest={requestPermission}
            onOpenSettings={openSettings}
            onRelaunch={relaunch}
            onNext={() => setStep("done")}
          />
        )}
        {step === "done" && <Done onFinish={finish} />}
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
    <ol className="flex items-center justify-between text-xs">
      {steps.map((s, i) => {
        const active = s.id === step;
        const passed =
          steps.findIndex((x) => x.id === step) >
          steps.findIndex((x) => x.id === s.id);
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : passed
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-muted-foreground/40 text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-2 h-px flex-1 bg-muted-foreground/30" />
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
      <h1 className="text-2xl font-semibold">Welcome to capz</h1>
      <p className="text-sm text-muted-foreground">
        Fast screenshots with annotation. Default hotkeys:
      </p>
      <ul className="grid gap-1 text-sm">
        <li>
          <kbd className="rounded border px-1.5 py-0.5 text-xs">{mod}3</kbd>{" "}
          — full screen capture
        </li>
        <li>
          <kbd className="rounded border px-1.5 py-0.5 text-xs">{mod}4</kbd>{" "}
          — area capture
        </li>
        <li>
          <kbd className="rounded border px-1.5 py-0.5 text-xs">{mod}5</kbd>{" "}
          — window capture
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        Change these any time from Settings.
      </p>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onNext}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
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
  busy,
  onRequest,
  onOpenSettings,
  onRelaunch,
  onNext,
}: {
  granted: boolean | null;
  requested: boolean;
  needsRelaunch: boolean;
  busy: Busy;
  onRequest: () => void;
  onOpenSettings: () => void;
  onRelaunch: () => void;
  onNext: () => void;
}) {
  // State derivation:
  //   - unknown      : first paint, awaiting initial poll
  //   - granted+ok   : ready to continue, no relaunch needed
  //   - granted+rel  : granted *during* this session — must relaunch first
  //   - denied+fresh : never asked → CGRequestScreenCaptureAccess prompt
  //   - denied+asked : already prompted (or system never showed dialog) →
  //                    user must toggle in System Settings
  const state: "unknown" | "ready" | "needs-relaunch" | "ask" | "open-settings" =
    granted === null
      ? "unknown"
      : granted
        ? needsRelaunch
          ? "needs-relaunch"
          : "ready"
        : requested
          ? "open-settings"
          : "ask";

  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-semibold">Screen Recording permission</h2>
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

      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          state={state}
          busy={busy}
          onRequest={onRequest}
          onOpenSettings={onOpenSettings}
          onRelaunch={onRelaunch}
          onNext={onNext}
        />
        {state !== "ready" && (
          <button
            onClick={onOpenSettings}
            disabled={busy !== ""}
            className="rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
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
  state: "unknown" | "ready" | "needs-relaunch" | "ask" | "open-settings";
}) {
  const map: Record<
    typeof state,
    { tone: string; dot: string; label: string }
  > = {
    unknown: {
      tone: "text-muted-foreground",
      dot: "bg-muted-foreground/40",
      label: "Checking…",
    },
    ready: {
      tone: "text-emerald-400",
      dot: "bg-emerald-500",
      label: "Granted — ready to capture",
    },
    "needs-relaunch": {
      tone: "text-amber-400",
      dot: "bg-amber-500",
      label: "Granted — relaunch required",
    },
    ask: {
      tone: "text-amber-400",
      dot: "bg-amber-500",
      label: "Not granted yet",
    },
    "open-settings": {
      tone: "text-amber-400",
      dot: "bg-amber-500",
      label: "Awaiting toggle in System Settings",
    },
  };
  const s = map[state];
  return (
    <div className="flex items-center gap-2 rounded border p-3 text-sm">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      <span className={s.tone}>{s.label}</span>
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
      ? "rounded border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200"
      : "rounded border p-3 text-xs text-muted-foreground";
  return <div className={cls}>{children}</div>;
}

function PrimaryButton({
  state,
  busy,
  onRequest,
  onOpenSettings,
  onRelaunch,
  onNext,
}: {
  state: "unknown" | "ready" | "needs-relaunch" | "ask" | "open-settings";
  busy: Busy;
  onRequest: () => void;
  onOpenSettings: () => void;
  onRelaunch: () => void;
  onNext: () => void;
}) {
  const cls =
    "rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50";
  if (state === "ready") {
    return (
      <button onClick={onNext} disabled={busy !== ""} className={cls}>
        Continue
      </button>
    );
  }
  if (state === "needs-relaunch") {
    return (
      <button onClick={onRelaunch} disabled={busy !== ""} className={cls}>
        {busy === "relaunch" ? "Relaunching…" : "Relaunch capz"}
      </button>
    );
  }
  if (state === "ask") {
    return (
      <button onClick={onRequest} disabled={busy !== ""} className={cls}>
        {busy === "request" ? "Requesting…" : "Request permission"}
      </button>
    );
  }
  if (state === "open-settings") {
    return (
      <button onClick={onOpenSettings} disabled={busy !== ""} className={cls}>
        {busy === "open" ? "Opening…" : "Open System Settings"}
      </button>
    );
  }
  return (
    <button disabled className={cls}>
      Checking…
    </button>
  );
}

function Done({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-semibold">You&apos;re all set</h2>
      <p className="text-sm text-muted-foreground">
        capz lives in your menu bar / system tray. Use the hotkeys, or click
        the tray icon for capture options.
      </p>
      <p className="text-xs text-muted-foreground">
        Tweak everything later from the Settings view.
      </p>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onFinish}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Finish
        </button>
      </div>
    </div>
  );
}
