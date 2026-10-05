"use client";

import { openSettings } from "@/lib/settingsNav";
import { useAppVersion, useUpdateStatus } from "@/lib/appVersion";
import { useSettings } from "@/stores/settings";
import type { TKey, TVars } from "@/i18n/store";
import { useT } from "@/i18n/useT";

function relative(at: number, t: (key: TKey, vars?: TVars) => string): string {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return t("settings.footer.justNow");
  if (mins < 60) return t("settings.footer.minutesAgo", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("settings.footer.hoursAgo", { n: hours });
  return t("settings.footer.daysAgo", { n: Math.round(hours / 24) });
}

/**
 * Which version is running, and what the updater last did — always on screen,
 * at the foot of the sidebar.
 *
 * Idle is the state right after launch: Rust waits 30s before its first tick,
 * and never ticks at all when auto-check is off, so the line says what it
 * actually knows instead of implying a check is in progress.
 */
export function VersionFooter() {
  const { t } = useT();
  const version = useAppVersion();
  const status = useUpdateStatus();
  const auto = useSettings((s) => s.config.updates.autoCheck);
  const lastCheckedAt = useSettings((s) => s.config.updates.lastCheckedAt);

  let line: string;
  let tone = "text-muted-foreground";
  let dot = "bg-foreground/30";

  switch (status.state) {
    case "checking":
      line = t("settings.footer.checking");
      break;
    case "ok":
      line = t("settings.footer.upToDate");
      dot = "bg-emerald-400";
      break;
    case "available":
      line = t("settings.footer.available", { version: status.version });
      tone = "text-[var(--accent)]";
      dot = "bg-[var(--accent)]";
      break;
    case "error":
      line = t("settings.footer.failed");
      dot = "bg-rose-400";
      break;
    default:
      line = !auto
        ? t("settings.footer.autoOff")
        : lastCheckedAt
          ? t("settings.footer.checked", { when: relative(lastCheckedAt, t) })
          : t("settings.footer.notChecked");
  }

  return (
    <button
      type="button"
      onClick={() => openSettings("app.updates")}
      className="mt-auto grid gap-0.5 border-t border-border px-2 pb-1 pt-2.5 text-left text-xs hover:bg-foreground/[0.04] max-[720px]:px-1 max-[720px]:text-center"
      title={version ? `capz ${version} — ${line}` : line}
    >
      <span className="font-medium text-foreground/80">
        capz {version ?? "—"}
      </span>
      <span
        aria-live="polite"
        className={`flex items-center gap-1.5 ${tone} max-[720px]:hidden`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        {line}
      </span>
    </button>
  );
}
