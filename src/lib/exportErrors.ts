import { t } from "@/i18n/store";

/**
 * Translate raw export pipeline errors into user-friendly messages.
 * Covers disk-full, permission-denied, clipboard-denied, and read-only volumes.
 * `recoverable` marks the cases a different save folder fixes; callers key the
 * "Pick folder" action off it, never off the (translated) title.
 */
export function describeExportError(e: unknown): {
  title: string;
  detail?: string;
  recoverable: boolean;
} {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (
    lower.includes("no space left") ||
    lower.includes("disk full") ||
    lower.includes("not enough space")
  ) {
    return {
      title: t("app.export.diskFull"),
      detail: t("app.export.diskFullDetail"),
      recoverable: true,
    };
  }
  if (
    lower.includes("permission denied") ||
    lower.includes("not permitted") ||
    lower.includes("access is denied") ||
    lower.includes("os error 13")
  ) {
    return {
      title: t("app.export.permissionDenied"),
      detail: t("app.export.permissionDeniedDetail"),
      recoverable: true,
    };
  }
  if (lower.includes("read-only") || lower.includes("readonly file system")) {
    return {
      title: t("app.export.readOnly"),
      detail: t("app.export.readOnlyDetail"),
      recoverable: true,
    };
  }
  if (lower.includes("clipboard") || lower.includes("nsclipboard")) {
    return { title: t("app.export.clipboard"), detail: raw, recoverable: false };
  }
  return { title: t("app.export.failed"), detail: raw, recoverable: false };
}
