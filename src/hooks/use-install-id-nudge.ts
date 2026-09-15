"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { isTauriRuntime } from "@/lib/platform";
import { markNudgeShown, setShareInstallId, wasNudgeShown } from "@/lib/installId";
import { useSettings } from "@/stores/settings";

/**
 * Opt-in toast for installs that have not enabled the anonymous install id.
 * Shown once per app version: a user who declined is asked again after the
 * next update, never twice on the same version. New installs see the same
 * choice on the onboarding Done screen, which settles it for that version.
 *
 * The editor window can be created hidden (tray-resident launch), so the
 * toast is deferred until the document is actually visible; otherwise it
 * would fire into a hidden window and be marked as shown without anyone
 * seeing it.
 */
export function useInstallIdNudge() {
  const ready = useSettings((s) => s.ready);

  // Evaluated once per window, when settings become ready. Deliberately NOT
  // re-run when the user flips the toggle later: turning it off must not
  // immediately produce a prompt asking to turn it back on.
  useEffect(() => {
    if (!ready) return;
    if (!isTauriRuntime()) return;
    const { general, updates } = useSettings.getState().config;
    if (!general.onboardingCompleted || updates.shareInstallId) return;
    let cancelled = false;
    let unhook: (() => void) | undefined;

    const show = async () => {
      if (cancelled) return;
      if (await wasNudgeShown()) return;
      if (cancelled) return;
      await markNudgeShown();
      toast("Help count active capz installs?", {
        id: "install-id-nudge",
        description:
          "Optional. Shares only a random ID with the daily update check. No personal data. Change it any time in Settings → Updates.",
        duration: Infinity,
        action: {
          label: "Enable",
          onClick: () => void setShareInstallId(true),
        },
        cancel: { label: "No thanks", onClick: () => {} },
      });
    };

    const whenVisible = () => {
      if (document.visibilityState !== "visible") return false;
      void show();
      return true;
    };

    if (!whenVisible()) {
      const onChange = () => {
        if (whenVisible()) unhook?.();
      };
      document.addEventListener("visibilitychange", onChange);
      window.addEventListener("focus", onChange);
      unhook = () => {
        document.removeEventListener("visibilitychange", onChange);
        window.removeEventListener("focus", onChange);
        unhook = undefined;
      };
    }

    return () => {
      cancelled = true;
      unhook?.();
    };
  }, [ready]);
}
