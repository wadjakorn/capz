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
 */
export function useInstallIdNudge() {
  const ready = useSettings((s) => s.ready);
  const onboardingCompleted = useSettings((s) => s.config.general.onboardingCompleted);
  const shareInstallId = useSettings((s) => s.config.updates.shareInstallId);

  useEffect(() => {
    if (!ready || !onboardingCompleted || shareInstallId) return;
    if (!isTauriRuntime()) return;
    let cancelled = false;
    (async () => {
      if (await wasNudgeShown()) return;
      if (cancelled) return;
      await markNudgeShown();
      toast("Help count active capz installs?", {
        description:
          "Optional. Shares only a random ID with the daily update check. No personal data. Change it any time in Settings → Updates.",
        duration: 15_000,
        action: {
          label: "Enable",
          onClick: () => void setShareInstallId(true),
        },
        cancel: { label: "No thanks", onClick: () => {} },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, onboardingCompleted, shareInstallId]);
}
