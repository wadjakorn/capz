/** Helper windows and non-component modules: command ring, overlay, scroll HUD/guide, /paste, notices, export errors, updater. */
export const app = {
  // Command ring wedges (short — the ring is tight).
  "app.ring.cancel": "cancel",
  "app.ring.window": "window",
  "app.ring.full": "full",
  "app.ring.scroll": "scroll",
  "app.ring.area": "area",
  "app.ring.systemArea": "system",
  // Settings checkbox list (room to be clear).
  "app.ring.mode.window": "Window",
  "app.ring.mode.full": "Full screen",
  "app.ring.mode.scroll": "Scrolling",
  "app.ring.mode.area": "Area",
  "app.ring.mode.systemArea": "System area (macOS)",

  // Sticky-capable tool names (mirror the toolbar labels).
  "app.tool.arrow": "Arrow",
  "app.tool.rect": "Shapes",
  "app.tool.text": "Text",
  "app.tool.blur": "Blur",
  "app.tool.pen": "Pen",
  "app.tool.highlighter": "Highlighter",
  "app.tool.magnify": "Magnify",
  "app.tool.sticker": "Sticker",
  "app.tool.pin": "Pin",

  // Editor keyboard shortcuts
  "app.shortcuts.escAgain": "Press Esc again to hide editor",
  "app.shortcuts.toolStays": "{tool} stays active",
  "app.shortcuts.toolReturns": "{tool} returns to Select",

  // Hotkey registration status (lib/shortcuts statusMessage)
  "app.hotkey.taken": "{accel} is already claimed by the OS or another app",
  "app.hotkey.invalid": "{accel} isn't a valid shortcut",
  "app.hotkey.needsModifier": "{accel} needs a modifier — the hold ring fires when you release it",

  // Area / window overlay
  "app.overlay.start": "Start",
  "app.overlay.capture": "Capture",
  "app.overlay.cancel": "Cancel",
  "app.overlay.dragHint": "Drag to select on this screen · Esc to cancel",
  "app.overlay.startManual": "Start manual capture",
  "app.overlay.autoScroll": "Auto-scroll",
  "app.overlay.autoScrollTitle": "Let capz scroll the page automatically to the bottom",
  "app.overlay.moveHere": "Move cursor here to select on this screen",
  "app.overlay.clickWindow": "Click a window to capture · Esc to cancel",

  // Scrolling capture HUD
  "app.scroll.title": "Scrolling capture",
  "app.scroll.processing": "Processing capture…",
  "app.scroll.stitching": "Stitching {height}px · opening editor",
  "app.scroll.autoHint": "Auto-scrolling · Enter/click capture · Esc cancel",
  "app.scroll.scrollDown": "Scroll down",
  "app.scroll.height": "{height}px",
  "app.scroll.frameOne": "{count} frame",
  "app.scroll.frameMany": "{count} frames",
  "app.scroll.seams": "⚠ seams",
  "app.scroll.cancel": "Cancel",
  "app.scroll.autoScroll": "Auto-scroll",
  "app.scroll.autoScrollTitle": "Start auto-scroll from the selection bar before capture begins",
  "app.scroll.capture": "Capture",
  "app.scroll.needAccessibility": "Enable Accessibility for capz, then press Auto-scroll again",

  // /paste (web)
  "app.paste.language": "Language",
  "app.paste.langTh": "ไทย",
  "app.paste.langEn": "EN",
  "app.paste.tabOnly": "Workspaces are kept in this tab only",
  "app.paste.tabOnlyDesc": "They're gone if you reload the page.",
  "app.paste.addFailed": "Couldn't add image",
  "app.paste.readFailed": "Couldn't read image",
  "app.paste.noImage": "Clipboard has no image",
  "app.paste.noImageDesc": "Copy a screenshot first, or press Ctrl+V / ⌘V.",
  "app.paste.notImage": "Not an image",
  "app.paste.copied": "Copied",
  "app.paste.downloaded": "Downloaded instead",
  "app.paste.downloadedDesc":
    "This browser can't copy images to the clipboard — saved the PNG to your downloads.",
  "app.paste.copyFailed": "Copy failed",
  "app.paste.copyFailedDesc": "Your browser blocked the clipboard — use Save to download instead.",
  "app.paste.captureUnavailable": "Screen capture unavailable",
  "app.paste.captureUnavailableDesc":
    "This browser or context can't capture the screen — paste a screenshot instead.",
  "app.paste.captureFailed": "Capture failed",
  "app.paste.openOptions": "Open tool options",
  "app.paste.closeOptions": "Close tool options",
  "app.paste.toolOptions": "Tool options",
  "app.paste.emptyLead": "Capture your screen, paste a screenshot ({paste}), or drop an image here.",
  "app.paste.emptyHint": "Capture prompts you to pick a screen or window each time.",
  "app.paste.capturing": "Capturing…",
  "app.paste.captureScreen": "Capture screen",
  "app.paste.chooseImage": "Choose an image…",

  // Export results / errors
  "app.export.copied": "Copied",
  "app.export.saved": "Saved",
  "app.export.savedCopied": "Saved & Copied",
  "app.export.diskFull": "Disk full",
  "app.export.diskFullDetail": "Free up space, then retry.",
  "app.export.permissionDenied": "Permission denied",
  "app.export.permissionDeniedDetail": "Pick a different folder under Output settings.",
  "app.export.readOnly": "Read-only volume",
  "app.export.readOnlyDetail": "Choose a writable folder.",
  "app.export.clipboard": "Clipboard unavailable",
  "app.export.failed": "Export failed",

  // Permission notices (macOS)
  "app.notice.revokedTitle": "Screen Recording permission revoked",
  "app.notice.revokedDesc": "Re-grant in System Settings → Privacy & Security → Screen Recording.",
  "app.notice.rerunOnboarding": "Re-run onboarding",
  "app.notice.inertTitle": "Capture is broken after the macOS update",
  "app.notice.inertDesc":
    "System Settings shows capz as allowed, but the entry is keyed to the previous build. TCC needs a full reset: remove the row, relaunch, re-grant.",
  "app.notice.fixPermission": "Fix permission…",
  "app.notice.healthTitle": "Screen Recording is not working",
  "app.notice.healthDenied":
    "macOS Screen Recording is denied. capz can't capture until you re-grant it.",
  "app.notice.healthInert":
    "macOS shows capz as allowed, but the entry is stale and capture returns blank frames.",

  // Install-id opt-in nudge
  "app.nudge.title": "Help count active capz installs?",
  "app.nudge.desc":
    "Optional. Shares only a random ID with the daily update check. No personal data. Change it any time in Settings → Updates.",
  "app.nudge.enable": "Enable",
  "app.nudge.noThanks": "No thanks",

  // Feedback (Settings → Feedback)
  "app.feedback.empty": "Write a few words first.",
  "app.feedback.tooLong": "Keep it under {max} characters.",
  "app.feedback.serverReplied": "Server replied {status}.",
  "app.feedback.rateLimited": "You have sent a few already. Try again later.",
  "app.feedback.timedOut": "Timed out.",
  "app.feedback.desktopOnly": "Feedback is only available in the desktop app.",

  // Updater
  "app.updater.prompt": "Version {version} is available.\n\n{body}\n\nDownload and install now?",
  "app.updater.title": "Update Available",
  "app.updater.install": "Install",
  "app.updater.later": "Later",

  // OCR
  "app.ocr.detectedOne": "Detected {count} text line",
  "app.ocr.detectedMany": "Detected {count} text lines",
  "app.ocr.noText": "No text found",
  "app.ocr.thaiUnavailable": "Thai text recognition isn't available on this system",
  // Thai on purpose in both languages: it is aimed at Thai readers on Windows.
  "app.ocr.thaiUnavailableWindows":
    "Windows ไม่มีชุด OCR ภาษาไทยให้ติดตั้ง (ไม่ว่าเวอร์ชันใด) จึงยังอ่านภาษาไทยไม่ได้ — ไม่ต้องไปหาติดตั้งเพิ่ม ภาษาอังกฤษยังใช้ได้ตามปกติ · รายละเอียด: {url}",
  "app.ocr.thaiUnavailableMac": "It requires a newer macOS version.",
  "app.ocr.failed": "Text detection failed",
};
