"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "./copyText";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    // if both paths are blocked, the command stays selectable
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <button type="button" onClick={onCopy} aria-label={label} className="code-copy" data-done={copied || undefined}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </button>
  );
}
