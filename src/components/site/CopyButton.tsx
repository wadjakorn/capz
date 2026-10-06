"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked: the command stays selectable
    }
  };

  return (
    <button type="button" onClick={onCopy} aria-label={label} className="code-copy" data-done={copied || undefined}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </button>
  );
}
