"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { isTauriRuntime } from "@/lib/platform";
import { markNudgeShown, setShareInstallId, wasNudgeShown } from "@/lib/installId";
import { useSettings } from "@/stores/settings";

/**
 * One-time toast for installs that finished onboarding before the opt-in
 * existed. Shown once per machine, whatever the user picks. New installs see
 * the same choice on the onboarding Done screen instead.
 *
 * The editor window can be created hidden (tray-resident launch), so the
 * toast is deferred until the document is actually visible; otherwise it
 * would fire into a hidden window and be marked as shown without anyone
 * seeing it.
 */
export function useInstallIdNudge() {
  const ready = useSettings((s) => s.ready);
  const onboardingCompleted = useSettings((s) => s.config.general.onboardingCompleted);
  const shareInstallId = useSettings((s) => s.config.updates.shareInstallId);

  useEffect(() => {
    if (!ready || !onboardingCompleted || shareInstallId) return;
    if (!isTauriRuntime()) return;
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
  }, [ready, onboardingCompleted, shareInstallId]);
}
