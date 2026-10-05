import type { onboarding as en } from "../en/onboarding";

export const onboarding: Record<keyof typeof en, string> = {
  "onboarding.loading": "กำลังโหลด…",

  "onboarding.step.welcome": "ยินดีต้อนรับ",
  "onboarding.step.permission": "สิทธิ์",
  "onboarding.step.autoScroll": "เลื่อนอัตโนมัติ",
  "onboarding.step.done": "เสร็จสิ้น",

  "onboarding.language.heading": "Language / ภาษา",
  "onboarding.language.th": "ไทย",
  "onboarding.language.en": "English",

  "onboarding.welcome.title": "ยินดีต้อนรับสู่ capz",
  "onboarding.welcome.lead": "จับภาพหน้าจอได้รวดเร็ว พร้อมใส่คำอธิบาย ปุ่มลัดเริ่มต้น:",
  "onboarding.welcome.full": "จับภาพทั้งหน้าจอ",
  "onboarding.welcome.area": "จับภาพบางส่วน",
  "onboarding.welcome.window": "จับภาพหน้าต่าง",
  "onboarding.welcome.changeLater": "เปลี่ยนได้ทุกเมื่อในการตั้งค่า",
  "onboarding.next": "ถัดไป",

  "onboarding.perm.title": "สิทธิ์การบันทึกหน้าจอ (Screen Recording)",
  "onboarding.perm.lead":
    "macOS ให้ทุกแอปขอสิทธิ์อ่านเนื้อหาบนหน้าจออย่างชัดเจน หากไม่มีสิทธิ์นี้ capz จะจับภาพอะไรไม่ได้เลย",
  "onboarding.perm.guide.ask":
    "คลิก <b>อนุญาต (Allow)</b> ในหน้าต่างของ macOS ที่จะปรากฏขึ้น หากไม่เห็น ให้ใช้ปุ่ม <i>เปิดการตั้งค่าระบบ</i> ด้านล่าง",
  "onboarding.perm.guide.openSettings":
    "macOS จะไม่ถามซ้ำอีก ให้เปิดการตั้งค่าระบบ หา <b>capz</b> ในหัวข้อการบันทึกหน้าจอ (Screen Recording) แล้วเปิดสวิตช์ หน้านี้จะอัปเดตเองเมื่อได้รับสิทธิ์",
  "onboarding.perm.guide.relaunch":
    "ได้รับสิทธิ์แล้ว แต่ macOS ใช้สิทธิ์นี้กับโปรเซสที่เริ่ม<i>หลัง</i>การเปลี่ยนแปลงเท่านั้น เปิด capz ใหม่เพื่อให้เสร็จสิ้น",
  "onboarding.perm.guide.inert":
    "การตั้งค่าระบบแสดงว่า capz ได้รับอนุญาตแล้ว แต่รายการนั้นผูกกับเวอร์ชันก่อนหน้า ไฟล์โปรแกรมใหม่จึงจับภาพไม่ได้ ต้องลบรายการเก่าออก (ปุ่มลบ) — การปิดเปิดสวิตช์ไม่ช่วย ใช้ปุ่ม <b>แก้ไขสิทธิ์…</b> ด้านล่างเพื่อดูขั้นตอน",

  "onboarding.openSystemSettings": "เปิดการตั้งค่าระบบ",
  "onboarding.skipForNow": "ข้ามไปก่อน",
  "onboarding.continue": "ดำเนินการต่อ",
  "onboarding.relaunching": "กำลังเปิดใหม่…",
  "onboarding.relaunchCapz": "เปิด capz ใหม่",
  "onboarding.requesting": "กำลังขอสิทธิ์…",
  "onboarding.requestPermission": "ขอสิทธิ์",
  "onboarding.opening": "กำลังเปิด…",
  "onboarding.fixPermission": "แก้ไขสิทธิ์…",
  "onboarding.checkingButton": "กำลังตรวจสอบ…",

  "onboarding.status.checking": "กำลังตรวจสอบ",
  "onboarding.status.granted": "ได้รับสิทธิ์แล้ว",
  "onboarding.status.relaunch": "ต้องเปิดใหม่",
  "onboarding.status.pending": "รอดำเนินการ",
  "onboarding.status.stale": "สิทธิ์ค้างเก่า",
  "onboarding.status.optional": "ไม่บังคับ",
  "onboarding.status.polling": "กำลังตรวจสอบสิทธิ์ของระบบ…",
  "onboarding.status.ready": "พร้อมจับภาพ",
  "onboarding.status.needsRelaunch": "ได้รับสิทธิ์แล้ว — ต้องเปิด capz ใหม่",
  "onboarding.status.notGranted": "ยังไม่ได้รับสิทธิ์",
  "onboarding.status.awaitingToggle": "รอเปิดสวิตช์ในการตั้งค่าระบบ",
  "onboarding.status.inert": "ได้สิทธิ์แค่ในนาม — จับภาพออกมาเป็นภาพว่าง",

  "onboarding.ax.title": "เลื่อนอัตโนมัติ (ไม่บังคับ)",
  "onboarding.ax.lead":
    "การจับภาพแบบเลื่อนสามารถเลื่อนหน้ายาว ๆ ให้เองโดยไม่ต้องเลื่อนด้วยมือ macOS ต้องการสิทธิ์ <b>การช่วยการเข้าถึง (Accessibility)</b> เพื่อเลื่อนหน้า ข้ามขั้นตอนนี้ได้และยังจับภาพแบบเลื่อนเองได้ตามปกติ — หรือให้สิทธิ์ที่นี่ หรือภายหลังในการตั้งค่า",
  "onboarding.ax.ready": "เลื่อนอัตโนมัติพร้อมใช้งาน",
  "onboarding.ax.notGranted": "ยังไม่ได้รับสิทธิ์ — จะใช้การเลื่อนเองแทน",
  "onboarding.ax.guide.ask":
    "คลิก <b>เปิดหน้าขอสิทธิ์</b> แล้วเปิด <b>capz</b> ใน ความเป็นส่วนตัวและความปลอดภัย → การช่วยการเข้าถึง (Accessibility)",
  "onboarding.ax.guide.openSettings":
    "หา <b>capz</b> ใน ความเป็นส่วนตัวและความปลอดภัย → การช่วยการเข้าถึง (Accessibility) แล้วเปิดสวิตช์ หน้านี้จะอัปเดตเองเมื่อได้รับสิทธิ์ อาจต้องเปิด capz ใหม่จึงจะมีผล",
  "onboarding.ax.openPrompt": "เปิดหน้าขอสิทธิ์",

  "onboarding.done.title": "พร้อมใช้งานแล้ว",
  "onboarding.done.lead":
    "capz อยู่ในแถบเมนู / ถาดระบบ ใช้ปุ่มลัด หรือคลิกไอคอนในถาดเพื่อดูตัวเลือกการจับภาพ",
  "onboarding.done.shareLabel": "ช่วยนับจำนวนเครื่องที่ใช้งาน",
  "onboarding.done.shareHint":
    "ไม่บังคับ ส่ง ID แบบสุ่มไปพร้อมการตรวจหาอัปเดตรายวัน เพื่อให้ผู้พัฒนารู้ว่ามีกี่เครื่องที่ใช้ capz ไม่มีข้อมูลส่วนตัวหรือข้อมูลเกี่ยวกับเครื่องของคุณ เปลี่ยนได้ทุกเมื่อที่ การตั้งค่า → อัปเดต",
  "onboarding.done.tweakLater": "ปรับแต่งทุกอย่างภายหลังได้ในการตั้งค่า",
  "onboarding.finish": "เสร็จสิ้น",

  "onboarding.inert.close": "ปิด",
  "onboarding.inert.title": "แก้ไขสิทธิ์หลังอัปเดต macOS",
  "onboarding.inert.lead":
    "การตั้งค่าระบบยังแสดง <b>capz</b> ในหัวข้อการบันทึกหน้าจอ (Screen Recording) แต่รายการนั้นผูกกับตัวตนของเวอร์ชันก่อนหน้า ไฟล์โปรแกรมใหม่จึงจับภาพไม่ได้ การปิดแล้วเปิดสวิตช์ไม่ช่วย — ต้องลบรายการออกทั้งหมดเพื่อให้ macOS ถามสิทธิ์ใหม่",
  "onboarding.inert.step1.title": "ลบรายการเก่าที่ค้างอยู่",
  "onboarding.inert.step1.body":
    "หา <b>capz</b> ในหัวข้อการบันทึกหน้าจอ แล้วคลิกปุ่ม <b>−</b> (ลบ) เพื่อลบออก การปิดสวิตช์ใช้ไม่ได้ — ต้องลบรายการออกทั้งหมดเพื่อให้ macOS ลืมตัวตนเดิม",
  "onboarding.inert.openPrivacy": "เปิดการตั้งค่าความเป็นส่วนตัว",
  "onboarding.inert.step2.title": "ขอสิทธิ์อีกครั้ง",
  "onboarding.inert.step2.body":
    "หลังลบรายการแล้ว คลิกด้านล่าง macOS จะขอสิทธิ์การบันทึกหน้าจออีกครั้ง และ capz จะกลับมาอยู่ในรายการด้วยตัวตนใหม่",
  "onboarding.inert.step2.stillInert":
    "ยังใช้งานไม่ได้ กลับไปขั้นที่ 1 ตรวจว่ารายการเก่าถูกลบแล้ว จากนั้นลองอีกครั้ง",
  "onboarding.inert.step2.denied":
    "macOS แจ้งว่าถูกปฏิเสธ — เปิดการตั้งค่าความเป็นส่วนตัวแล้วเปิดสวิตช์รายการใหม่ หรือทำขั้นที่ 1 ซ้ำ",
  "onboarding.inert.step3.title": "เปิดสวิตช์รายการใหม่",
  "onboarding.inert.step3.body":
    "เปิดสวิตช์รายการ <b>capz</b> ใหม่ บางครั้ง macOS เพิ่มรายการเข้ามาแบบปิดไว้แม้จะขอสิทธิ์แล้ว",
  "onboarding.inert.step4.body":
    "macOS ใช้สิทธิ์ใหม่กับโปรเซสที่เริ่มหลังเปิดสวิตช์เท่านั้น เปิด capz ใหม่เพื่อให้เสร็จสิ้น",
  "onboarding.inert.step4.hint": "เปิดใหม่ได้เลยแม้ขั้นตอนก่อนหน้าจะดูยังไม่ครบ",
  "onboarding.inert.probe.pending": "กำลังทดสอบการจับภาพ…",
  "onboarding.inert.probe.works": "จับภาพได้แล้ว",
  "onboarding.inert.probe.stillInert": "ยังใช้งานไม่ได้",
  "onboarding.inert.probe.denied": "ถูกปฏิเสธ",
};
