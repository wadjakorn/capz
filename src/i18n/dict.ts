export type Lang = "th" | "en";

export const dict = {
  th: {
    "nav.langTh": "ไทย",
    "nav.langEn": "EN",
    "nav.github": "ไปที่ GitHub",
    "nav.editor": "เอดิเตอร์บนเว็บ",

    "hero.badge": "เวอร์ชันล่าสุด",
    "hero.title": "จับภาพหน้าจอ",
    "hero.titleSub": "บน macOS และ Windows",
    "hero.desc":
      "capz เป็นแอป native สำหรับแคปหน้าจอบน macOS และ Windows ฟรี โอเพนซอร์ส ไม่มีโฆษณา ไม่มีบัญชี",
    "hero.macNote": "macOS ต้องตั้งค่าครั้งแรกเพื่อข้าม Gatekeeper",
    "hero.macNoteLink": "ดูวิธีติดตั้ง",
    "hero.installMac": "ติดตั้งบน macOS",
    "hero.downloadWin": "ดาวน์โหลดสำหรับ Windows",
    "hero.orDownloadWin": "หรือดาวน์โหลดสำหรับ Windows",
    "hero.copyCmd": "คัดลอกคำสั่งติดตั้ง",
    "hero.tryWeb": "หรือลองแก้ภาพในเบราว์เซอร์ ไม่ต้องติดตั้ง",

    "features.kicker": "ฟีเจอร์",
    "features.title": "capz ทำอะไรได้บ้าง",
    "features.screenshot.title": "แคปหน้าจอ",
    "features.screenshot.desc":
      "แคปทั้งหน้าจอ พื้นที่ที่เลือก หรือหน้าต่าง พร้อมเครื่องมือแก้ไขในตัว (ลูกศร ข้อความ สติกเกอร์ เบลอ)",
    "features.oss.title": "ฟรีและโอเพนซอร์ส",
    "features.oss.desc":
      "โค้ดเปิดบน GitHub ใช้ฟรีตลอด ไม่มี subscription ไม่มี telemetry",
    "features.platforms.title": "macOS และ Windows",
    "features.platforms.desc":
      "Windows มี installer ปกติ macOS เป็น ad-hoc signed ต้องตั้งค่าครั้งแรก (ยังไม่มี Apple Developer cert)",

    "install.kicker": "ติดตั้ง",
    "install.title": "ติดตั้ง capz",
    "install.tabMac": "macOS",
    "install.tabWin": "Windows",
    "install.mac.step1": "1. ติดตั้งผ่าน Homebrew",
    "install.mac.universal":
      "Universal binary — รองรับทั้ง Intel และ Apple Silicon (M1/M2/M3)",
    "install.mac.step2": "2. ถ้า macOS บล็อก ให้รันคำสั่งนี้",
    "install.mac.step2desc":
      "capz ยังไม่มี Apple Developer cert (ค่าธรรมเนียมรายปี) ถูก ad-hoc signed Gatekeeper จึงบล็อกตอนเปิดครั้งแรก คำสั่งข้างล่างคือวิธีเปิดใช้งาน — ทำครั้งเดียว",
    "install.mac.stillBlocked":
      "ถ้ายังเปิดไม่ได้ macOS 26 (Tahoe) จะมีปุ่ม Open Anyway ที่ Privacy & Security เปิดด้วย",
    "install.win.download": "ดาวน์โหลด Installer",
    "install.win.desc": "Installer สำหรับ Windows 10 และ 11 (x64)",
    "install.win.sacTitle": "ถ้า Windows บล็อก (Smart App Control)",
    "install.win.sacDesc":
      "capz ยังไม่มี code-signing cert จาก Microsoft ทำให้ Smart App Control (SAC) บน Windows 11 อาจบล็อกตอนเปิดครั้งแรก ปิด SAC ได้ที่ Windows Security > App & browser control > Smart App Control settings > Off",
    "install.win.sacWarn":
      "หมายเหตุ: เมื่อปิด SAC แล้วเปิดกลับไม่ได้จนกว่าจะรีเซ็ต Windows — SAC มีเฉพาะเครื่องที่ลง Windows 11 แบบ clean install ถ้าไม่เห็นเมนูนี้ แปลว่าเครื่องไม่มี SAC ไม่ต้องทำอะไร",

    "footer.copyright": "© {year} capz",
    "footer.oss": "ฟรี โอเพนซอร์ส",

    "meta.title": "capz — แอปแคปหน้าจอ ฟรี สำหรับ macOS และ Windows",
    "meta.desc":
      "capz เป็นแอป native สำหรับแคปหน้าจอและอัดวิดีโอ ฟรี โอเพนซอร์ส ทางเลือกแทน CleanShot และ ShareX รองรับ macOS และ Windows",
  },
  en: {
    "nav.langTh": "ไทย",
    "nav.langEn": "EN",
    "nav.github": "Go to GitHub",
    "nav.editor": "Web editor",

    "hero.badge": "Latest release",
    "hero.title": "Screen capture.",
    "hero.titleSub": "For macOS and Windows.",
    "hero.desc":
      "capz is a native screen capture app for macOS and Windows. Free, open source, no ads, no account.",
    "hero.macNote": "macOS needs a one-time setup to bypass Gatekeeper.",
    "hero.macNoteLink": "See install steps",
    "hero.installMac": "Install on macOS",
    "hero.downloadWin": "Download for Windows",
    "hero.orDownloadWin": "Or download for Windows",
    "hero.copyCmd": "Copy install command",
    "hero.tryWeb": "Or edit an image right in your browser — no install",

    "features.kicker": "Features",
    "features.title": "What capz does",
    "features.screenshot.title": "Screenshot",
    "features.screenshot.desc":
      "Capture full screen, a selected area, or a window. Edit with built-in tools (arrows, text, stickers, blur).",
    "features.oss.title": "Free & open source",
    "features.oss.desc":
      "Source on GitHub. Free forever. No subscription, no telemetry.",
    "features.platforms.title": "macOS & Windows",
    "features.platforms.desc":
      "Windows ships as a normal signed installer. macOS is ad-hoc signed and needs a one-time workaround (no Apple Developer cert yet).",

    "install.kicker": "Install",
    "install.title": "Install capz",
    "install.tabMac": "macOS",
    "install.tabWin": "Windows",
    "install.mac.step1": "1. Install via Homebrew",
    "install.mac.universal":
      "Universal binary — runs on Intel and Apple Silicon (M1/M2/M3).",
    "install.mac.step2": "2. If macOS blocks it, run these",
    "install.mac.step2desc":
      "capz doesn't have an Apple Developer cert (yearly fee) yet, so it's ad-hoc signed and Gatekeeper blocks first launch. The commands below unblock it — one time only.",
    "install.mac.stillBlocked":
      "Still blocked? macOS 26 (Tahoe) may show an Open Anyway button under Privacy & Security. Open with:",
    "install.win.download": "Download installer",
    "install.win.desc": "Installer for Windows 10 and 11 (x64).",
    "install.win.sacTitle": "If Windows blocks it (Smart App Control)",
    "install.win.sacDesc":
      "capz isn't code-signed with a Microsoft cert yet, so Smart App Control (SAC) on Windows 11 may block first launch. Turn SAC off under Windows Security > App & browser control > Smart App Control settings > Off.",
    "install.win.sacWarn":
      "Note: once SAC is off it can't be turned back on without resetting Windows. SAC only exists on clean Windows 11 installs — if you don't see the menu, your PC doesn't have it and nothing needs changing.",

    "footer.copyright": "© {year} capz",
    "footer.oss": "Free & open source",

    "meta.title": "capz — Free screen capture for macOS & Windows",
    "meta.desc":
      "capz is a free, open-source native screen capture and recording app. An alternative to CleanShot and ShareX. macOS and Windows.",
  },
} as const;

export type TKey = keyof (typeof dict)["th"];
