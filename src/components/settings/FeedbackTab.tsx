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

const KINDS: { value: FeedbackKind; label: string; hint: string }[] = [
  { value: "bug", label: "Bug", hint: "Something broke or behaves wrongly." },
  { value: "feature", label: "Feature", hint: "Something you wish capz did." },
];

export function FeedbackTab() {
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
        toast.success("Thanks, sent anonymously.");
        setMessage("");
      } else {
        toast.error("Could not send feedback", {
          description: r.error,
          action: {
            label: "Open GitHub Issues",
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
        <Label className="text-foreground">Send feedback</Label>
        <p className="text-xs text-muted-foreground">
          Goes straight to the developer. Anonymous: we receive only your text,
          the app version and your OS. There is no way to reply, so include what
          you tried and what you expected.
        </p>
      </div>

      <div className="flex gap-2" role="radiogroup" aria-label="Feedback type">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => setKind(k.value)}
            className={kind === k.value ? "btn btn--primary" : "btn btn--secondary"}
            title={k.hint}
          >
            {k.label}
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
              ? "What happened? What did you expect? Steps to reproduce help a lot."
              : "What would you like capz to do, and when would you use it?"
          }
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{remaining.toLocaleString()} characters left</span>
          <a
            href={GITHUB_ISSUES_URL}
            onClick={(e) => {
              e.preventDefault();
              void openIssues();
            }}
            className="underline hover:text-foreground"
          >
            Prefer GitHub Issues?
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
          {sending ? "Sending…" : `Send ${kind === "bug" ? "bug report" : "feature request"}`}
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
