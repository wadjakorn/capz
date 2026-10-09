/**
 * Copies text for the landing's copy buttons. The async Clipboard API only
 * exists in a secure context (https or localhost); over plain http (e.g. a LAN
 * preview) it is missing, so fall back to a hidden textarea + execCommand.
 * Resolves true when something reached the clipboard.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // permission denied: try the legacy path
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  Object.assign(ta.style, { position: "fixed", top: "0", left: "0", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}
