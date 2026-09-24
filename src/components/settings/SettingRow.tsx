"use client";

import { useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { currentPlatform } from "@/lib/shortcuts";
import { useSettingsNav } from "@/lib/settingsNav";
import { settingDef, type SettingId } from "./registry";

/** How long a row stays highlighted after being jumped to. */
const FLASH_MS = 1400;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * One setting: label (and optional hint) on the left, control on the right.
 *
 * The label comes from the registry rather than the call site so search results
 * and the row itself can never disagree, and the row carries its id in the DOM
 * (`data-setting-id`) — that is what `openSettings` scrolls to and what the
 * drift test and the e2e specs select on.
 */
export function SettingRow({
  id,
  hint,
  ready = true,
  children,
}: {
  id: SettingId;
  /** One line at most; anything longer belongs in a tooltip. */
  hint?: string;
  /** Settings are still loading — don't try to scroll to this row yet. */
  ready?: boolean;
  children: React.ReactNode;
}) {
  const def = settingDef(id);
  const rowRef = useRef<HTMLDivElement>(null);
  const target = useSettingsNav((s) => s.target);
  const nonce = useSettingsNav((s) => s.nonce);
  const hidden = def.platform !== undefined && def.platform !== currentPlatform();
  /** Nonce already acted on, so one request never reveals the row twice. */
  const handled = useRef<number | null>(null);

  useEffect(() => {
    if (hidden || !ready || target !== id || handled.current === nonce) return;
    const row = rowRef.current;
    if (!row) return;
    handled.current = nonce;

    // The frame is deliberately not cancelled on cleanup: consuming the target
    // re-runs this effect immediately, and cancelling would kill the scroll
    // before it ever happened.
    requestAnimationFrame(() => {
      row.scrollIntoView({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      row
        .querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        )
        ?.focus({ preventScroll: true });
      row.dataset.flash = "true";
    });

    const clear = setTimeout(() => {
      if (rowRef.current) delete rowRef.current.dataset.flash;
    }, FLASH_MS);

    // Released immediately: the row has been shown, so a later navigation to
    // the same row must be able to trigger this again (hence `nonce`).
    useSettingsNav.getState().consumeTarget();

    return () => clearTimeout(clear);
  }, [hidden, id, ready, target, nonce]);

  if (hidden) return null;

  return (
    <div
      ref={rowRef}
      data-setting-id={id}
      className="setting-row flex flex-wrap items-start justify-between gap-3 rounded-lg px-2 py-2 transition-colors data-[flash]:bg-accent-soft data-[flash]:shadow-[inset_3px_0_0_var(--accent)]"
    >
      <div className="grid max-w-md gap-0.5">
        <Label className="text-foreground">{def.label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
