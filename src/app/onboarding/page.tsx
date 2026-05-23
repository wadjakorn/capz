"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/stores/settings";

type Step = "welcome" | "permission" | "done";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

export default function OnboardingPage() {
  const { config, ready, init, update } = useSettings();
  const [step, setStep] = useState<Step>("welcome");
  const [granted, setGranted] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  // Skip onboarding entirely if already completed.
  useEffect(() => {
    if (!ready) return;
    if (config.general.onboardingCompleted) {
      void closeOnboarding();
    }
  }, [ready, config.general.onboardingCompleted]);

  async function checkPermission() {
    setChecking(true);
    try {
      const ok = await invoke<boolean>("has_screen_recording_permission");
      setGranted(ok);
    } finally {
      setChecking(false);
    }
  }

  async function requestPermission() {
    setChecking(true);
    try {
      // First call triggers TCC prompt; subsequent calls only re-check.
      await invoke<boolean>("request_screen_recording_permission");
      const ok = await invoke<boolean>("has_screen_recording_permission");
      setGranted(ok);
    } finally {
      setChecking(false);
    }
  }

  async function openSettings() {
    try {
      await invoke("open_system_settings_screen_recording");
    } catch (e) {
      console.error(e);
    }
  }

  async function relaunch() {
    try {
      await invoke("relaunch_app");
    } catch (e) {
      console.error(e);
    }
  }

  async function finish() {
    await update("general", { onboardingCompleted: true });
    await closeOnboarding();
  }

  if (!ready) {
    return (
      <main className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen max-w-xl flex-col p-8">
      <Stepper step={step} showMac={IS_MAC} />
      <div className="flex-1 pt-6">
        {step === "welcome" && (
          <Welcome
            onNext={() => {
              if (IS_MAC) {
                setStep("permission");
                void checkPermission();
              } else {
                setStep("done");
              }
            }}
          />
        )}
        {step === "permission" && (
          <Permission
            granted={granted}
            checking={checking}
            onCheck={checkPermission}
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

async function closeOnboarding() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  try {
    await getCurrentWindow().close();
  } catch (e) {
    console.warn("close onboarding failed", e);
  }
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
            <span
              className={
                active ? "font-medium" : "text-muted-foreground"
              }
            >
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

function Permission({
  granted,
  checking,
  onCheck,
  onRequest,
  onOpenSettings,
  onRelaunch,
  onNext,
}: {
  granted: boolean | null;
  checking: boolean;
  onCheck: () => void;
  onRequest: () => void;
  onOpenSettings: () => void;
  onRelaunch: () => void;
  onNext: () => void;
}) {
  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-semibold">Screen Recording permission</h2>
      <p className="text-sm text-muted-foreground">
        macOS requires this for capz to capture your screen. The setting
        lives in <strong>System Settings → Privacy &amp; Security → Screen
        Recording</strong>.
      </p>

      <div className="rounded border p-3 text-sm">
        Status:{" "}
        {granted === null ? (
          <span className="text-muted-foreground">unknown</span>
        ) : granted ? (
          <span className="text-emerald-400">granted</span>
        ) : (
          <span className="text-amber-400">not granted</span>
        )}
      </div>

      {granted === false && (
        <p className="text-xs text-muted-foreground">
          After enabling capz in Screen Recording, macOS requires a relaunch
          for the change to take effect.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onRequest}
          disabled={checking || granted === true}
          className="rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Request permission
        </button>
        <button
          onClick={onOpenSettings}
          disabled={checking}
          className="rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Open System Settings
        </button>
        <button
          onClick={onCheck}
          disabled={checking}
          className="rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Re-check
        </button>
        <button
          onClick={onRelaunch}
          disabled={checking || granted === true}
          className="rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Relaunch capz
        </button>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={onNext}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {granted ? "Next" : "Skip for now"}
        </button>
      </div>
    </div>
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
        Tweak everything later from the Settings window.
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
