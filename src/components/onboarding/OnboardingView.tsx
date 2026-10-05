"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Camera, Check, Clock, MousePointerClick, ShieldCheck, Sparkles } from "lucide-react";
import { GlowTile } from "@/components/design/tiles/GlowTile";
import { ToggleRow } from "@/components/settings/ToggleRow";
import { markNudgeShown, setShareInstallId } from "@/lib/installId";
import { useSettings } from "@/stores/settings";
import { useT } from "@/i18n/useT";
import { LANGS, type Lang, type TKey } from "@/i18n/store";
import { rich } from "@/lib/richText";

type Step = "welcome" | "permission" | "accessibility" | "done";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

type Props = {
  onDone: () => void;
  onOpenInertRecovery?: () => void;
};

export function OnboardingView({ onDone, onOpenInertRecovery }: Props) {
  const { ready, init, update, config } = useSettings();
  const { t } = useT();
  const [step, setStep] = useState<Step>("welcome");
  const [granted, setGranted] = useState<boolean | null>(null);
  const [requested, setRequested] = useState(false);
  const [needsRelaunch, setNeedsRelaunch] = useState(false);
  const [inert, setInert] = useState(false);
  const [busy, setBusy] = useState<"" | "request" | "open" | "relaunch">("");
  // Accessibility grant (optional — only auto-scroll capture needs it).
  const [axGranted, setAxGranted] = useState<boolean | null>(null);
  const [axRequested, setAxRequested] = useState(false);
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

  useEffect(() => {
    if (step !== "accessibility") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const ok = await invoke<boolean>("has_accessibility_permission");
        if (!cancelled) setAxGranted(ok);
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

  async function requestAccessibility() {
    setBusy("request");
    setAxRequested(true);
    try {
      await invoke<boolean>("request_accessibility_permission");
      const ok = await invoke<boolean>("has_accessibility_permission");
      setAxGranted(ok);
    } finally {
      setBusy("");
    }
  }

  async function openAccessibilitySettings() {
    setBusy("open");
    try {
      await invoke("open_system_settings_accessibility");
    } catch (e) {
      console.error(e);
    } finally {
      setBusy("");
    }
  }

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
    // The Done screen already offered the install-id choice; never nudge again.
    await markNudgeShown();
    await update("general", { onboardingCompleted: true });
    onDone();
  }

  if (!ready) {
    return (
      <main className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("onboarding.loading")}
      </main>
    );
  }

  const tile =
    step === "permission"
      ? { cls: "tile-icon", icon: ShieldCheck }
      : step === "accessibility"
        ? { cls: "tile-icon", icon: MousePointerClick }
        : step === "done"
          ? { cls: "tile-icon", icon: Sparkles }
          : { cls: "tile-icon", icon: Camera };

  return (
    <main className="flex min-h-full items-center justify-center p-8 text-foreground">
      <div className="surface w-full max-w-xl p-8">
        <div className="mb-6 flex items-center gap-4">
          <div className={`${tile.cls} h-16 w-16`}>
            <tile.icon className="h-7 w-7" aria-hidden />
          </div>
          <div className="flex-1">
            <Stepper step={step} showMac={IS_MAC} />
          </div>
        </div>
        <div className="pt-2">
          {step === "welcome" && (
            <Welcome
              language={config.general.language}
              onLanguage={(language) => void update("general", { language })}
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
              onNext={() => setStep("accessibility")}
            />
          )}
          {step === "accessibility" && (
            <Accessibility
              granted={axGranted}
              requested={axRequested}
              busy={busy}
              onRequest={requestAccessibility}
              onOpenSettings={openAccessibilitySettings}
              onNext={() => setStep("done")}
            />
          )}
          {step === "done" && (
            <Done
              shareInstallId={config.updates.shareInstallId}
              onShareInstallId={(v) => void setShareInstallId(v)}
              onFinish={finish}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function Stepper({ step, showMac }: { step: Step; showMac: boolean }) {
  const { t } = useT();
  const steps: { id: Step; label: string }[] = showMac
    ? [
        { id: "welcome", label: t("onboarding.step.welcome") },
        { id: "permission", label: t("onboarding.step.permission") },
        { id: "accessibility", label: t("onboarding.step.autoScroll") },
        { id: "done", label: t("onboarding.step.done") },
      ]
    : [
        { id: "welcome", label: t("onboarding.step.welcome") },
        { id: "done", label: t("onboarding.step.done") },
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
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : passed
                    ? "bg-[var(--success)]/15 text-[var(--success)] ring-1 ring-[var(--success)]/50"
                    : "bg-[var(--surface-raised)] text-muted-foreground ring-1 ring-[var(--border-strong)]"
              }`}
            >
              {i + 1}
            </span>
            <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-1 h-px w-8 bg-[var(--fg-4)]" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Welcome({
  language,
  onLanguage,
  onNext,
}: {
  language: Lang;
  onLanguage: (l: Lang) => void;
  onNext: () => void;
}) {
  const { t } = useT();
  const mod = IS_MAC ? "⌘⌥⇧" : "Ctrl+Alt+Shift+";
  return (
    <div className="grid gap-4">
      <LanguagePicker value={language} onChange={onLanguage} />
      <h1 className="headline">{t("onboarding.welcome.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("onboarding.welcome.lead")}</p>
      <ul className="grid gap-2 text-sm">
        <li className="flex items-center gap-2">
          <kbd className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs">
            {mod}3
          </kbd>
          <span className="text-foreground/80">{t("onboarding.welcome.full")}</span>
        </li>
        <li className="flex items-center gap-2">
          <kbd className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs">
            {mod}4
          </kbd>
          <span className="text-foreground/80">{t("onboarding.welcome.area")}</span>
        </li>
        <li className="flex items-center gap-2">
          <kbd className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs">
            {mod}5
          </kbd>
          <span className="text-foreground/80">{t("onboarding.welcome.window")}</span>
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">{t("onboarding.welcome.changeLater")}</p>
      <div className="mt-4 flex justify-end">
        <button onClick={onNext} className="btn btn--primary">
          {t("onboarding.next")}
        </button>
      </div>
    </div>
  );
}

const LANG_LABEL_KEY: Record<Lang, TKey> = {
  th: "onboarding.language.th",
  en: "onboarding.language.en",
};

/**
 * First thing on the Welcome step. Writes `general.language`; LanguageManager
 * then switches every window (this one included) straight away. Radio-group
 * semantics with a roving tab stop: Tab lands on the selected card, arrow keys
 * move and select, like native radios.
 */
function LanguagePicker({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  const { t } = useT();
  const refs = useRef<Partial<Record<Lang, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: React.KeyboardEvent, current: Lang) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    e.preventDefault();
    const i = LANGS.indexOf(current);
    const next = LANGS[(i + step + LANGS.length) % LANGS.length];
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="grid gap-2">
      <span id="onboarding-language-label" className="eyebrow">
        {t("onboarding.language.heading")}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="onboarding-language-label"
        className="grid grid-cols-2 gap-2"
      >
        {LANGS.map((l) => {
          const checked = value === l;
          return (
            <button
              key={l}
              ref={(el) => {
                refs.current[l] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              lang={l}
              onClick={() => onChange(l)}
              onKeyDown={(e) => onKeyDown(e, l)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                checked
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-foreground"
                  : "border-[var(--border-strong)] bg-[var(--surface-raised)] text-foreground/80 hover:bg-[var(--surface-raised-hover)]"
              }`}
            >
              <span>{t(LANG_LABEL_KEY[l])}</span>
              <span
                aria-hidden
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  checked
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "ring-1 ring-[var(--fg-4)]"
                }`}
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
            </button>
          );
        })}
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
  const { t } = useT();

  return (
    <div className="grid gap-4">
      <h2 className="headline">{t("onboarding.perm.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("onboarding.perm.lead")}</p>

      <StatusCard state={state} />

      {state === "ask" && <Guidance>{rich(t("onboarding.perm.guide.ask"))}</Guidance>}
      {state === "open-settings" && (
        <Guidance>{rich(t("onboarding.perm.guide.openSettings"))}</Guidance>
      )}
      {state === "needs-relaunch" && (
        <Guidance tone="warning">{rich(t("onboarding.perm.guide.relaunch"))}</Guidance>
      )}
      {state === "inert" && (
        <Guidance tone="warning">{rich(t("onboarding.perm.guide.inert"))}</Guidance>
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
            className="btn btn--secondary"
          >
            {t("onboarding.openSystemSettings")}
          </button>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <button
          onClick={onNext}
          disabled={busy !== ""}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {t("onboarding.skipForNow")}
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
  const { t } = useT();
  const map: Record<
    typeof state,
    { tile: string; tone: string; icon: typeof Check; label: string; eyebrow: string }
  > = {
    unknown: {
      tile: "tile",
      tone: "text-[var(--color-fg-2)]",
      icon: Clock,
      eyebrow: t("onboarding.status.checking"),
      label: t("onboarding.status.polling"),
    },
    ready: {
      tile: "tile",
      tone: "text-[var(--success)]",
      icon: Check,
      eyebrow: t("onboarding.status.granted"),
      label: t("onboarding.status.ready"),
    },
    "needs-relaunch": {
      tile: "tile",
      tone: "text-amber-200",
      icon: ShieldCheck,
      eyebrow: t("onboarding.status.relaunch"),
      label: t("onboarding.status.needsRelaunch"),
    },
    ask: {
      tile: "tile",
      tone: "text-amber-200",
      icon: ShieldCheck,
      eyebrow: t("onboarding.status.pending"),
      label: t("onboarding.status.notGranted"),
    },
    "open-settings": {
      tile: "tile",
      tone: "text-amber-200",
      icon: ShieldCheck,
      eyebrow: t("onboarding.status.pending"),
      label: t("onboarding.status.awaitingToggle"),
    },
    inert: {
      tile: "tile",
      tone: "text-amber-200",
      icon: ShieldCheck,
      eyebrow: t("onboarding.status.stale"),
      label: t("onboarding.status.inert"),
    },
  };
  const s = map[state];
  const Icon = s.icon;
  return (
    <div className="surface flex items-center gap-3 p-3">
      <GlowTile
        size={40}
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
      ? "rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground"
      : "rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 text-xs text-muted-foreground";
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
  const { t } = useT();
  if (state === "ready") {
    return (
      <button onClick={onNext} disabled={busy !== ""} className="btn btn--primary">
        {t("onboarding.continue")}
      </button>
    );
  }
  if (state === "needs-relaunch") {
    return (
      <button onClick={onRelaunch} disabled={busy !== ""} className="btn btn--primary">
        {busy === "relaunch" ? t("onboarding.relaunching") : t("onboarding.relaunchCapz")}
      </button>
    );
  }
  if (state === "ask") {
    return (
      <button onClick={onRequest} disabled={busy !== ""} className="btn btn--primary">
        {busy === "request" ? t("onboarding.requesting") : t("onboarding.requestPermission")}
      </button>
    );
  }
  if (state === "open-settings") {
    return (
      <button onClick={onOpenSettings} disabled={busy !== ""} className="btn btn--primary">
        {busy === "open" ? t("onboarding.opening") : t("onboarding.openSystemSettings")}
      </button>
    );
  }
  if (state === "inert") {
    return (
      <button
        onClick={onOpenInertRecovery}
        disabled={busy !== "" || !onOpenInertRecovery}
        className="btn btn--primary disabled:opacity-50"
      >
        {t("onboarding.fixPermission")}
      </button>
    );
  }
  return (
    <button disabled className="btn btn--primary">
      {t("onboarding.checkingButton")}
    </button>
  );
}

function Accessibility({
  granted,
  requested,
  busy,
  onRequest,
  onOpenSettings,
  onNext,
}: {
  granted: boolean | null;
  requested: boolean;
  busy: Busy;
  onRequest: () => void;
  onOpenSettings: () => void;
  onNext: () => void;
}) {
  const state: "unknown" | "ready" | "ask" | "open-settings" =
    granted === null
      ? "unknown"
      : granted
        ? "ready"
        : requested
          ? "open-settings"
          : "ask";
  const { t } = useT();

  return (
    <div className="grid gap-4">
      <h2 className="headline">{t("onboarding.ax.title")}</h2>
      <p className="text-sm text-muted-foreground">{rich(t("onboarding.ax.lead"))}</p>

      <div className="surface flex items-center gap-3 p-3">
        <GlowTile
          size={40}
          icon={
            state === "ready" ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : state === "unknown" ? (
              <Clock className="h-4 w-4" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )
          }
        />
        <div className="flex flex-col">
          <span className="eyebrow">
            {state === "ready"
              ? t("onboarding.status.granted")
              : state === "unknown"
                ? t("onboarding.status.checking")
                : t("onboarding.status.optional")}
          </span>
          <span
            className={`text-sm ${
              state === "ready" ? "text-[var(--success)]" : "text-[var(--color-fg-2)]"
            }`}
          >
            {state === "ready"
              ? t("onboarding.ax.ready")
              : state === "unknown"
                ? t("onboarding.status.polling")
                : t("onboarding.ax.notGranted")}
          </span>
        </div>
      </div>

      {state === "ask" && <Guidance>{rich(t("onboarding.ax.guide.ask"))}</Guidance>}
      {state === "open-settings" && (
        <Guidance>{rich(t("onboarding.ax.guide.openSettings"))}</Guidance>
      )}

      <div className="flex flex-wrap gap-2">
        {state === "ready" ? (
          <button onClick={onNext} disabled={busy !== ""} className="btn btn--primary">
            {t("onboarding.continue")}
          </button>
        ) : (
          <>
            <button onClick={onRequest} disabled={busy !== ""} className="btn btn--primary">
              {busy === "request" ? t("onboarding.requesting") : t("onboarding.ax.openPrompt")}
            </button>
            <button
              onClick={onOpenSettings}
              disabled={busy !== ""}
              className="btn btn--secondary"
            >
              {busy === "open" ? t("onboarding.opening") : t("onboarding.openSystemSettings")}
            </button>
          </>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <button
          onClick={onNext}
          disabled={busy !== ""}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {t("onboarding.skipForNow")}
        </button>
      </div>
    </div>
  );
}

function Done({
  shareInstallId,
  onShareInstallId,
  onFinish,
}: {
  shareInstallId: boolean;
  onShareInstallId: (v: boolean) => void;
  onFinish: () => void;
}) {
  const { t } = useT();
  return (
    <div className="grid gap-4">
      <h2 className="headline">{t("onboarding.done.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("onboarding.done.lead")}</p>
      <div className="rounded-lg border border-border p-3">
        <ToggleRow
          label={t("onboarding.done.shareLabel")}
          hint={t("onboarding.done.shareHint")}
          checked={shareInstallId}
          onChange={onShareInstallId}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("onboarding.done.tweakLater")}</p>
      <div className="mt-4 flex justify-end">
        <button onClick={onFinish} className="btn btn--primary">
          {t("onboarding.finish")}
        </button>
      </div>
    </div>
  );
}
