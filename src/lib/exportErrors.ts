/**
 * Translate raw export pipeline errors into user-friendly messages.
 * Covers disk-full, permission-denied, clipboard-denied, and read-only volumes.
 */
export function describeExportError(e: unknown): { title: string; detail?: string } {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (
    lower.includes("no space left") ||
    lower.includes("disk full") ||
    lower.includes("not enough space")
  ) {
    return { title: "Disk full", detail: "Free up space, then retry." };
  }
  if (
    lower.includes("permission denied") ||
    lower.includes("not permitted") ||
    lower.includes("access is denied") ||
    lower.includes("os error 13")
  ) {
    return {
      title: "Permission denied",
      detail: "Pick a different folder under Output settings.",
    };
  }
  if (lower.includes("read-only") || lower.includes("readonly file system")) {
    return { title: "Read-only volume", detail: "Choose a writable folder." };
  }
  if (lower.includes("clipboard") || lower.includes("nsclipboard")) {
    return { title: "Clipboard unavailable", detail: raw };
  }
  return { title: "Export failed", detail: raw };
}
