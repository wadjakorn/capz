export function applyFilenameTemplate(template: string, date: Date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const tokens: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    HHmmss: pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds()),
  };
  return template.replace(/\{(yyyy|MM|dd|HHmmss|HH|mm|ss)\}/g, (_, k: string) => tokens[k] ?? "");
}

export function extensionFor(fmt: "png" | "jpeg" | "webp"): string {
  return fmt === "jpeg" ? "jpg" : fmt;
}
