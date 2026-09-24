"use client";

import { openSettings } from "@/lib/settingsNav";
import { useAppVersion, useUpdateStatus } from "@/lib/appVersion";
import { useSettings } from "@/stores/settings";

function relative(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
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
  const version = useAppVersion();
  const status = useUpdateStatus();
  const auto = useSettings((s) => s.config.updates.autoCheck);
  const lastCheckedAt = useSettings((s) => s.config.updates.lastCheckedAt);

  let line: string;
  let tone = "text-muted-foreground";
  let dot = "bg-foreground/30";

  switch (status.state) {
    case "checking":
      line = "Checking for updates…";
      break;
    case "ok":
      line = "Up to date";
      dot = "bg-emerald-400";
      break;
    case "available":
      line = `Update available: ${status.version}`;
      tone = "text-[var(--accent)]";
      dot = "bg-[var(--accent)]";
      break;
    case "error":
      line = "Last check failed";
      dot = "bg-rose-400";
      break;
    default:
      line = !auto
        ? "Automatic checks are off"
        : lastCheckedAt
          ? `Checked ${relative(lastCheckedAt)}`
          : "Not checked yet";
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
