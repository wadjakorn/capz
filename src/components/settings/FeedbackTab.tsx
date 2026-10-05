"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  FEEDBACK_MESSAGE_MAX,
  GITHUB_ISSUES_URL,
  sendFeedback,
  validateMessage,
  type FeedbackKind,
} from "@/lib/feedback";
import { t as tNow, type TKey } from "@/i18n/store";
import { useT } from "@/i18n/useT";

const KINDS: { value: FeedbackKind; label: TKey; hint: TKey }[] = [
  { value: "bug", label: "settings.feedback.bug", hint: "settings.feedback.bugHint" },
  {
    value: "feature",
    label: "settings.feedback.feature",
    hint: "settings.feedback.featureHint",
  },
];

export function FeedbackTab() {
  const { t } = useT();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const invalid = validateMessage(message);
  const remaining = FEEDBACK_MESSAGE_MAX - message.length;

  async function onSend() {
    if (invalid || sending) return;
    setSending(true);
    try {
      const r = await sendFeedback({ kind, message });
      if (r.ok) {
        toast.success(tNow("settings.feedback.sent"));
        setMessage("");
      } else {
        toast.error(tNow("settings.feedback.failed"), {
          description: r.error,
          action: {
            label: tNow("settings.feedback.openIssues"),
            onClick: () => void openIssues(),
          },
        });
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label className="text-foreground">{t("settings.app.feedback")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("settings.feedback.body")}
        </p>
      </div>

      <div className="flex gap-2" role="radiogroup" aria-label={t("settings.feedback.typeAria")}>
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => setKind(k.value)}
            className={kind === k.value ? "btn btn--primary" : "btn btn--secondary"}
            title={t(k.hint)}
          >
            {t(k.label)}
          </button>
        ))}
      </div>

      <div className="grid gap-1">
        <textarea
          className="field min-h-40 w-full resize-y"
          value={message}
          maxLength={FEEDBACK_MESSAGE_MAX}
          placeholder={
            kind === "bug"
              ? t("settings.feedback.bugPlaceholder")
              : t("settings.feedback.featurePlaceholder")
          }
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("settings.feedback.remaining", { n: remaining.toLocaleString() })}</span>
          <a
            href={GITHUB_ISSUES_URL}
            onClick={(e) => {
              e.preventDefault();
              void openIssues();
            }}
            className="underline hover:text-foreground"
          >
            {t("settings.feedback.preferGithub")}
          </a>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onSend}
          disabled={!!invalid || sending}
          title={invalid ?? undefined}
        >
          {sending
            ? t("settings.feedback.sending")
            : t(kind === "bug" ? "settings.feedback.sendBug" : "settings.feedback.sendFeature")}
        </button>
      </div>
    </div>
  );
}

async function openIssues() {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(GITHUB_ISSUES_URL);
  } catch {
    window.open(GITHUB_ISSUES_URL, "_blank", "noopener");
  }
}
