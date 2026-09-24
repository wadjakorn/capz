"use client";

import { openSettings } from "@/lib/settingsNav";
import { useSettings } from "@/stores/settings";
import { settingDef, type SettingId } from "./registry";

/**
 * A one-off nudge towards a setting, shown where the user meets the problem —
 * the editor, a toast — rather than buried in Settings.
 *
 * It appears once. "Not now" is remembered, so the app never asks twice about
 * the same setting. Nothing triggers one yet; this is the shape a future
 * heuristic fills in.
 */
export function SettingSuggestion({
  id,
  title,
  body,
  cta = "Set it up",
  onOpenSettings,
}: {
  id: SettingId;
  title: string;
  /** One or two sentences: what it noticed, and what the setting would do. */
  body: string;
  cta?: string;
  /** Lets the host switch away from whatever it is showing. */
  onOpenSettings?: () => void;
}) {
  const dismissed = useSettings((s) => s.config.general.dismissedSuggestions);
  const update = useSettings((s) => s.update);

  if (dismissed.includes(id)) return null;

  const dismiss = () =>
    void update("general", { dismissedSuggestions: [...dismissed, id] });

  return (
    <aside
      className="grid max-w-sm gap-2 rounded-xl border border-border bg-[var(--surface)] p-3.5 shadow-lg"
      aria-label={`Suggestion: ${settingDef(id).label}`}
    >
      <div className="grid gap-1">
        <strong className="text-sm text-foreground">{title}</strong>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={dismiss} className="btn btn--secondary">
          Not now
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            dismiss();
            openSettings(id);
            onOpenSettings?.();
          }}
        >
          {cta}
        </button>
      </div>
    </aside>
  );
}
