# Landing shot list

Every picture and clip on the landing page (`/`) is listed in
`src/components/site/shots.ts`. Until a shot exists, the page draws a designed
placeholder showing the slot id and one line saying what the shot will show.

**To add a still:** drop `public/landing/<id>.webp` in place and set `ready: true` on its slot.

**To add a clip:** for a video slot, drop `public/landing/<id>.mp4` in place and set `ready: true`.

**To swap a hero clip:** replace its file, or edit its line in `HERO_CLIPS`.

## รายการที่ต้องถ่ายบน Mac (ค้างอยู่ 8 รายการ)

ทุกรายการต้องใช้แอปเดสก์ท็อป `/paste` บนเว็บทำแทนไม่ได้ ภาพจากเว็บผมถ่ายครบแล้ว (✅ ในตารางด้านล่าง)

**ตั้งค่าก่อนถ่าย (ทุกรายการ)**
- **แอป:** ธีมสว่าง (Settings → ธีม: สว่าง) และภาษาไทย
- **หน้าจอ:** Retina ใช้วอลเปเปอร์เรียบ ๆ และปิดการแจ้งเตือน (Focus / Do Not Disturb)
- **เนื้อหา:** ใช้หน้าเว็บภาษาไทยเป็นตัวอย่าง ห้ามมีชื่อจริง อีเมลจริง หรือ token บนจอ
  - ใช้หน้าทดสอบที่ผมทำไว้ได้: `article.html` / `bill.html` / `chat.html` ใน `.playwright-mcp/` (เปิดในเบราว์เซอร์)
- **ภาพนิ่ง:** PNG 2× สัดส่วน 16:10 เช่น ใช้ capz แคปทั้งหน้าต่าง หรือ ⌘⇧4 แล้วกด Space
- **คลิป:** อัดด้วย ⌘⇧5 (Record Selected Portion) กรอบ 16:10 ยาว 5–8 วินาที ขยับเมาส์ช้า ๆ ไม่ต้องตัดต่อ เดี๋ยวผมตัดและแปลงเป็น H.264 เอง

**ส่งไฟล์:** ตั้งชื่อตาม id แล้วบอก path มา ผมจะแปลงเป็น WebP/MP4 ใส่ `public/landing/` และเปิด `ready: true` ให้

| # | ลำดับ | id | ประเภท | ถ่ายอะไร | จุดที่ต้องเห็นในภาพ |
|---|---|---|---|---|---|
| 1 | ★★★ | `ring-v2` | คลิป ~6 วินาที | กด ⌘⇧Space ค้าง → แตะ Space เพื่อวนโหมด 2–3 ครั้ง → ปล่อยที่ "เลือกพื้นที่" → overlay ขึ้น → ลากกรอบ → editor เปิดพร้อมภาพ | วงล้อที่ตำแหน่งเคอร์เซอร์ และโหมดที่ไฮไลต์เปลี่ยนตามการแตะ |
| 2 | ★★★ | `scroll-capture` | คลิป ~8 วินาที | ตั้งปุ่มลัด "จับภาพแบบเลื่อน" ใน Settings ก่อน (ค่าเริ่มต้นไม่มีปุ่มลัด) → จับหน้าเว็บไทยยาว ๆ → HUD นับภาพที่ต่อ → จบที่ภาพยาวใน editor | HUD ระหว่างเลื่อน และภาพยาวผลลัพธ์ |
| 3 | ★★ | `area-overlay` | ภาพนิ่ง | กด ⌘⌥⇧4 บนเดสก์ท็อปที่มีหน้าต่างหลายอัน ลากกรอบค้างไว้ (ยังไม่ปล่อย) | กรอบที่เลือก ขนาดกรอบ และแถบปุ่มคำสั่ง |
| 4 | ★★ | `window-corners` | ภาพนิ่ง | กด ⌘⌥⇧5 จับหน้าต่าง Safari/Finder → editor เปิดพื้นหลังสีเข้ม | มุมโค้งของหน้าต่างโปร่งใส ไม่มีสามเหลี่ยมค้างที่มุม |
| 5 | ★★ | `ocr` | ภาพนิ่ง | ภาพที่มีข้อความไทย → กด "ตรวจหาข้อความ" → เลือก 1 บรรทัด → คัดลอก | กรอบรอบข้อความที่ตรวจเจอ บรรทัดที่เลือก และ toast "คัดลอกแล้ว" |
| 6 | ★★ | `full-screen` | ภาพนิ่ง | กด ⌘⌥⇧3 → editor เปิดพร้อมภาพทั้งจอ | editor ทั้งหน้าต่าง และภาพทั้งจอบน canvas |
| 7 | ★ | `history-preview` | ภาพนิ่ง | เปิดประวัติ → คลิกรายการหนึ่งให้ขึ้นพรีวิว | ปุ่มแสดงในโฟลเดอร์ / คัดลอก / ลบ / เพิ่มเข้า workspace |
| 8 | ★ | `settings-th` | ภาพนิ่ง | เปิด Settings → พิมพ์คำค้นในช่องค้นหา เช่น "ปุ่มลัด" | ผลค้นหาที่กรองแล้ว เป็นภาษาไทยทั้งหน้า |

**ถ้ามีเวลาน้อย:** ถ่ายแค่ 1–3 ก่อน เพราะเป็นบทที่ตอนนี้ยังเป็นภาพตัวอย่างอยู่ ส่วน 4–8 อยู่ในแท็บหรือบทรอง
**ฝั่งผม:** อัดคลิป hero ตอน 1 "วางรูป" ใหม่บน `/paste` ให้มีป้าย ⌘V เหมือนตอนก๊อปส่ง ทำเองได้ ไม่ต้องใช้ Mac

## Capture setup

- **Light theme.** The landing is bright, so every shot uses the app's light theme. The web editor's default config is dark, so Playwright captures force `light` with an init script that pins `<html>`'s `dark`/`light` classes. The desktop app has a real light theme in Settings.
- **Web-capturable first.** Everything the `/paste` web editor can show (annotation tools, backdrops, Thai text, workspaces, phone layout) is captured there with Playwright at 2–3× DPR. Only desktop-only features need the Mac.
- macOS on a Retina screen, with the app UI in Thai.
- Clean wallpaper. No real names, emails or tokens on screen.
- Use a Thai web page as the subject.
- **Stills:** PNG at 2×, converted to WebP.
- **Clips:** 16:10, 5–8 s, H.264, with a keyframe every ~6 frames so scroll-scrubbing stays smooth.

## Hero clips (`HERO_CLIPS`)

| id | What it shows | Notes |
|---|---|---|
| `import` | Pasting a screenshot into the editor | `camera`: whole frame |
| `annotate` | An arrow, pins 1-2-3, a blurred email, the magnifier, a Thai text label | On phones the camera zooms to the action. Keyframes use normalised x/y (0–1). |
| `backdrop` | Turning on the backdrop, then switching art styles | `camera`: whole frame |
| `copy` | ⌘C → the "คัดลอกแล้ว" toast, clear, ⌘V lands the next image (a keycast badge shows the keys) | On phones the camera zooms to the toast, then backs out |

The clips are recorded in the `/paste` web editor (light theme): annotate first, then turn on the backdrop.

**Automation note:** map image coordinates to the screen with the `.bg-image` node's `getAbsoluteTransform().point()`. Don't use `getClientRect()`: with a backdrop on it includes the image's drop shadow, which shifts every point by up to ~15px and makes magnify/blur look misplaced. That isn't an app bug.

## Stills and loops (`SLOTS`)

Status: ✅ = captured from `/paste` (light) and `ready: true`; 🖥 = needs the desktop app.

| Priority | id | What to capture |
|---|---|---|
| ★★★ ✅ | `hero-editor` | The editor marking up a Thai page: an arrow, pins 1-2-3, a Thai label, a blurred email, the magnifier, a Risograph backdrop |
| ★★★ 🖥 | `ring-v2` (loop) | Hold ⌘⇧Space, tap to cycle, release, and the area overlay appears |
| ★★★ 🖥 | `scroll-capture` (loop) | The scroll HUD stitching a long Thai page, ending on the tall result |
| ★★ 🖥 | `full-screen` | A full-screen capture just opened in the editor |
| ★★ 🖥 | `area-overlay` | The area overlay on a busy desktop, with the template rect and the action pill |
| ★★ 🖥 | `window-corners` | A macOS window capture on a backdrop, with transparent corners |
| ★★ ✅ | `thai-text` | The text tool with a mark-heavy Thai line ("ผู้ใหญ่ปั้นดินน้ำมัน สระไม่ลอย", 48px), plus the line-spacing panel |
| ★★ ✅ | `combine` | A chat screenshot pasted onto a docs page as a layer, joined by an arrow and pins 1-2 |
| ★★ 🖥 | `ocr` | Detect text on Thai content: a line selected and the "copied" toast showing |
| ★★ ✅ | `workspaces` (loop) | Switching workspaces (captured on the web; History preview is desktop-only and has its own slot) |
| ★ 🖥 | `settings-th` | Settings in Thai, with a search query typed |
| ★ 🖥 | `history-preview` | The History preview with Reveal, Copy, Trash and Add to workspace |
| ★ ✅ | `tool-arrow`, `tool-pins`, `tool-magnify`, `tool-blur` | One 1:1 close-up per tool |
| ★ ✅ | `paste-mobile` | `/paste` on a phone (portrait) |
| — ✅ | `backdrop-base` | The annotated capture with no backdrop, 1600×1000. The backdrop playground draws it on every style. |
