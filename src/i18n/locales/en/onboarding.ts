/** First-run onboarding and the permission recovery dialog. */
export const onboarding = {
  "onboarding.loading": "Loading…",

  "onboarding.step.welcome": "Welcome",
  "onboarding.step.permission": "Permission",
  "onboarding.step.autoScroll": "Auto-scroll",
  "onboarding.step.done": "Done",

  // Same bilingual string in both languages: the picker must be findable
  // whichever language the UI is currently in.
  "onboarding.language.heading": "Language / ภาษา",
  "onboarding.language.th": "ไทย",
  "onboarding.language.en": "English",

  "onboarding.welcome.title": "Welcome to capz",
  "onboarding.welcome.lead": "Fast screenshots with annotation. Default hotkeys:",
  "onboarding.welcome.full": "full screen capture",
  "onboarding.welcome.area": "area capture",
  "onboarding.welcome.window": "window capture",
  "onboarding.welcome.changeLater": "Change these any time from Settings.",
  "onboarding.next": "Next",

  "onboarding.perm.title": "Screen Recording permission",
  "onboarding.perm.lead":
    "macOS asks every app for explicit permission to read your screen contents. Without it capz can't capture anything.",
  "onboarding.perm.guide.ask":
    "Click <b>Allow</b> in the macOS prompt that appears next. If you don't see it, use <i>Open System Settings</i> below.",
  "onboarding.perm.guide.openSettings":
    "macOS won't prompt again. Open System Settings, find <b>capz</b> under Screen Recording, and toggle it on. This view updates automatically once granted.",
  "onboarding.perm.guide.relaunch":
    "Permission granted, but macOS only applies it to processes started<i> after</i> the change. Relaunch capz to finish.",
  "onboarding.perm.guide.inert":
    "System Settings shows capz as allowed, but the entry is keyed to the previous build and the new binary cannot capture. The stale row must be removed (minus button) — toggling won't recover. Use <b>Fix permission…</b> below for the guided steps.",

  "onboarding.openSystemSettings": "Open System Settings",
  "onboarding.skipForNow": "Skip for now",
  "onboarding.continue": "Continue",
  "onboarding.relaunching": "Relaunching…",
  "onboarding.relaunchCapz": "Relaunch capz",
  "onboarding.requesting": "Requesting…",
  "onboarding.requestPermission": "Request permission",
  "onboarding.opening": "Opening…",
  "onboarding.fixPermission": "Fix permission…",
  "onboarding.checkingButton": "Checking…",

  "onboarding.status.checking": "Checking",
  "onboarding.status.granted": "Granted",
  "onboarding.status.relaunch": "Relaunch",
  "onboarding.status.pending": "Pending",
  "onboarding.status.stale": "Stale grant",
  "onboarding.status.optional": "Optional",
  "onboarding.status.polling": "Polling system permission…",
  "onboarding.status.ready": "Ready to capture",
  "onboarding.status.needsRelaunch": "Granted — relaunch required",
  "onboarding.status.notGranted": "Not granted yet",
  "onboarding.status.awaitingToggle": "Awaiting toggle in System Settings",
  "onboarding.status.inert": "Granted on paper — capture returns blank frames",

  "onboarding.ax.title": "Auto-scroll (optional)",
  "onboarding.ax.lead":
    "Scrolling capture can drive long pages for you instead of scrolling by hand. macOS requires <b>Accessibility</b> permission to move the page. You can skip this and still capture manually — or grant it here or later from Settings.",
  "onboarding.ax.ready": "Auto-scroll is ready",
  "onboarding.ax.notGranted": "Not granted — auto-scroll falls back to manual",
  "onboarding.ax.guide.ask":
    "Click <b>Open the prompt</b>, then enable <b>capz</b> under Privacy & Security → Accessibility.",
  "onboarding.ax.guide.openSettings":
    "Find <b>capz</b> under Privacy & Security → Accessibility and toggle it on. This view updates automatically once granted; you may need to relaunch capz for it to take effect.",
  "onboarding.ax.openPrompt": "Open the prompt",

  "onboarding.done.title": "You're all set",
  "onboarding.done.lead":
    "capz lives in your menu bar / system tray. Use the hotkeys, or click the tray icon for capture options.",
  "onboarding.done.shareLabel": "Help count active installs",
  "onboarding.done.shareHint":
    "Optional. Sends a random ID with the daily update check so the developer can see how many machines use capz. No personal data, nothing about your machine. You can change this any time in Settings → Updates.",
  "onboarding.done.tweakLater": "Tweak everything later from the Settings view.",
  "onboarding.finish": "Finish",

  // InertGrantRecoveryDialog
  "onboarding.inert.close": "Close",
  "onboarding.inert.title": "Fix permission after macOS update",
  "onboarding.inert.lead":
    "System Settings still lists <b>capz</b> under Screen Recording, but the entry is keyed to the previous build's code identity and the new binary cannot capture. Toggling off and on does not recover — the row must be removed entirely so macOS re-prompts.",
  "onboarding.inert.step1.title": "Remove the stale entry",
  "onboarding.inert.step1.body":
    "Find <b>capz</b> under Screen Recording and click the <b>−</b> (minus) button to delete it. Toggling off won't work — the row must be removed entirely so macOS forgets the old code identity.",
  "onboarding.inert.openPrivacy": "Open Privacy Settings",
  "onboarding.inert.step2.title": "Re-prompt for permission",
  "onboarding.inert.step2.body":
    "After removing the row, click below. macOS will ask for Screen Recording access again, and capz will reappear in the list under its new identity.",
  "onboarding.inert.step2.stillInert":
    "Still inert. Go back to step 1 and confirm the old row is gone, then retry.",
  "onboarding.inert.step2.denied":
    "macOS reported denied — open Privacy Settings and toggle the new row on, or repeat step 1.",
  "onboarding.inert.step3.title": "Toggle the new entry on",
  "onboarding.inert.step3.body":
    "Switch the new <b>capz</b> row to on. macOS sometimes adds it disabled even after the prompt.",
  "onboarding.inert.step4.body":
    "macOS only applies the new grant to processes started after the toggle. Relaunch to finish.",
  "onboarding.inert.step4.hint": "Relaunch even if the earlier steps look incomplete.",
  "onboarding.inert.probe.pending": "Probing capture…",
  "onboarding.inert.probe.works": "Capture works",
  "onboarding.inert.probe.stillInert": "Still inert",
  "onboarding.inert.probe.denied": "Denied",
};
