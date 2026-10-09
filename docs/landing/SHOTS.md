# Landing shot list

Every picture and clip on the landing page (`/`) is listed in
`src/components/site/shots.ts`. Until a shot exists, the page draws a designed
placeholder showing the slot id and one line saying what the shot will show.

**To add a still:** drop `public/landing/<id>.webp` in place and set `ready: true` on its slot.

**To add a clip:** for a video slot, drop `public/landing/<id>.mp4` in place and set `ready: true`.

**To swap a hero clip:** replace its file, or edit its line in `HERO_CLIPS`.

## รายการที่เหลือ (เจ้าของถ่ายเองทั้งหมด)

อัปเดต 2026-10-09: เจ้าของจะถ่ายทุกภาพเองบนแอปเดสก์ท็อป ภาพที่ agent ถ่ายจาก `/paste` ตอนนี้ใช้เป็นตัวแทนชั่วคราว รอเปลี่ยนเป็นของจริง
- ✅ **ใส่แล้ว (ภาพจากเจ้าของ, 2026-10-10):** `ring-v2`, `scroll-capture`, `area-overlay`, `window-corners`, `ocr`, `full-screen`, `history-preview`, `settings-th`
  - ภาพหน้าต่างครอปจากขอบเทาเข้ม ใส่มุมโค้งโปร่งใส แสดงแบบ `native` (ใช้กรอบ macOS ของภาพเอง) สัดส่วน 3:2
  - คลิปตัดช่วงรอ เร่ง 1.15–1.3× ครอปเป็น 3:2 ที่ 1500×1000
- ⬜ **เลื่อนไปก่อน (ใช้ภาพจาก `/paste` ไปพลาง):** หมวด A, C และคลิป `workspaces` ตามตารางด้านล่าง

**กติการ่วม**
- **ธีมและภาษา:** ธีมสว่าง เมนูภาษาไทย วอลเปเปอร์เรียบ ปิดการแจ้งเตือน
- **ข้อมูลบนจอ:** ห้ามมีชื่อ อีเมล หรือ token จริง ใช้หน้าทดสอบ `article.html` (VPN) / `chat.html` / `bill.html` ใน `.playwright-mcp/` เพื่อให้ภาพต่อเนื่องกันได้
- **ภาพนิ่ง:** PNG 2× ไม่ต้องครอปเอง ผมครอปตามสัดส่วนให้
- **คลิป:** ⌘⇧5 Record Selected Portion กรอบ 16:10 ไม่ต้องตัดต่อ ผมตัด แปลง H.264 และตั้ง keyframe ให้
- **คลิป hero:** อัดเฉพาะพื้นที่ภายใน editor (ไม่ต้องมีแถบชื่อหน้าต่าง) เพราะหน้าเว็บวาดกรอบหน้าต่าง "capz" ครอบให้อยู่แล้ว
  - ถ้าอยากให้คนดูเห็นปุ่มที่กด เปิด KeyCastr ไว้ได้ (ในคลิปตอน "ก๊อปส่ง" ตอนนี้ผมใส่ป้ายปุ่มเอง)

### A. คลิป hero (สำคัญที่สุด อยู่จอแรก)

| # | id | ความยาว | ถ่ายอะไร |
|---|---|---|---|
| 1 | `hero-1-import` | 2–3 วินาที | editor ว่าง → ⌘V → ภาพหน้าเว็บไทยปรากฏบน canvas (ก๊อปภาพจากเบราว์เซอร์มาก่อนอัด) |
| 2 | `hero-2-annotate` | 8–9 วินาที | บนภาพเดิม: ลากลูกศร → หมุด 1-2-3 → เบลออีเมล → แว่นขยายที่จุดสำคัญ → พิมพ์ข้อความไทย |
| 3 | `hero-3-backdrop` | 8 วินาที | เปิดพื้นหลัง → สลับสไตล์ศิลปะ 3–4 แบบ |
| 4 | `hero-4-copy` | 5–6 วินาที | ⌘C → toast "คัดลอกแล้ว" → ลบภาพ → ⌘V ภาพถัดไปลงมา |

คลิปทั้ง 4 ควรถ่ายบนภาพเดียวกันต่อเนื่องกัน เมื่อได้ไฟล์แล้วผมจะปรับ `camera` (จุดซูมบนมือถือ) ให้ตรงตำแหน่งจริง

### B. คลิปที่เหลือจากเดิม

| # | id | ความยาว | ถ่ายอะไร |
|---|---|---|---|
| 5 ✅ | `ring-v2` | ~6 วินาที | กด ⌘⇧Space ค้าง → แตะ Space วน 2–3 ครั้ง → ปล่อยที่ "เลือกพื้นที่" → ลากกรอบ → editor เปิด |
| 6 ✅ | `scroll-capture` | ~8 วินาที | ตั้งปุ่มลัด "จับภาพแบบเลื่อน" ใน Settings ก่อน → จับหน้าเว็บไทยยาว ๆ → ให้เห็น HUD → จบที่ภาพยาวใน editor |
| 7 | `workspaces` | 6–7 วินาที | เปิด workspace ใน Settings ก่อน → สลับ workspace 2–3 อัน (ให้เห็นภาพในแต่ละอัน) |

### C. ภาพนิ่ง (ตอนนี้ agent ถ่ายจาก `/paste` รอเปลี่ยน)

| # | id | สัดส่วนบนหน้า | ถ่ายอะไร |
|---|---|---|---|
| 8 | `hero-editor` | 16:10 ทั้งหน้าต่าง | editor บนหน้า VPN: ลูกศร หมุด 1-2-3 ข้อความไทย เบลออีเมล แว่นขยาย (ภาพนี้ใช้ทำ og.png ด้วย) |
| 9 | `combine` | 16:10 เฉพาะ canvas | วางภาพแชตเป็นเลเยอร์ทับหน้าเอกสาร + ลูกศรโยงแชตไปที่ปุ่ม + หมุด 1-2 |
| 10 | `thai-text` | 16:10 ทั้งหน้าต่าง | เครื่องมือข้อความกำลังพิมพ์ "ผู้ใหญ่ปั้นดินน้ำมัน สระไม่ลอย" ขนาดใหญ่ (48px) และเห็นแผงตั้งค่าข้อความ |
| 11 | `tool-arrow` | 7:5 ภาพใกล้ | ลูกศรโค้ง ที่ยังเลือกอยู่ ให้เห็นจุดจับกลางเส้น |
| 12 | `tool-pins` | 1:1 ภาพใกล้ | หมุด 1-2-3 และ A-B-C |
| 13 | `tool-magnify` | 1:1 ภาพใกล้ | แว่นขยาย: วงต้นทาง + เส้นเชื่อม + วงขยาย บนตัวอักษรเล็ก (เช่น `team.ovpn`) |
| 14 | `tool-blur` | 7:5 ภาพใกล้ | เบลอบนอีเมลหรือข้อมูลส่วนตัว |
| 15 | `backdrop-base` | 16:10 | ภาพที่ขีดเขียนแล้วแต่ **ปิดพื้นหลัง** (export PNG) เพราะ playground บนหน้าเว็บวาดพื้นหลัง 25 แบบรอบภาพนี้เอง |
| 16 | `paste-mobile` | 9:19.5 แนวตั้ง | `/paste` บน iPhone ที่มีภาพและการขีดเขียน (แคปหน้าจอ iPhone ได้เลย) |

### D. ผมทำต่อให้เองเมื่อได้ไฟล์

| # | id | ทำจากอะไร |
|---|---|---|
| 17 | `og.png` | ประกอบใหม่จาก `hero-editor` ของคุณ (1200×630) |
| — | poster ของคลิป hero ทุกตอน | ดึงจากเฟรมแรกของแต่ละคลิป |

**ส่งไฟล์:** ตั้งชื่อตาม id แล้วบอก path มา ผมจะแปลง ครอป ใส่ `public/landing/` และเช็กบนหน้าเว็บทั้งเดสก์ท็อปและมือถือให้

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
| ★★★ ✅ (owner) | `ring-v2` (loop) | Hold ⌘⇧Space, tap to cycle, release, and the area overlay appears |
| ★★★ ✅ (owner) | `scroll-capture` (loop) | The scroll HUD stitching a long Thai page, ending on the tall result |
| ★★ ✅ (owner) | `full-screen` | A full-screen capture just opened in the editor |
| ★★ ✅ (owner) | `area-overlay` | The area overlay on a busy desktop, with the template rect and the action pill |
| ★★ ✅ (owner) | `window-corners` | A macOS window capture on a backdrop, with transparent corners |
| ★★ ✅ | `thai-text` | The text tool with a mark-heavy Thai line ("ผู้ใหญ่ปั้นดินน้ำมัน สระไม่ลอย", 48px), plus the line-spacing panel |
| ★★ ✅ | `combine` | A chat screenshot pasted onto a docs page as a layer, joined by an arrow and pins 1-2 |
| ★★ ✅ (owner) | `ocr` | Detect text on Thai content: a line selected and the "copied" toast showing |
| ★★ ✅ | `workspaces` (loop) | Switching workspaces (captured on the web; History preview is desktop-only and has its own slot) |
| ★ ✅ (owner) | `settings-th` | Settings in Thai, with a search query typed |
| ★ ✅ (owner) | `history-preview` | The History preview with Reveal, Copy, Trash and Add to workspace |
| ★ ✅ | `tool-arrow`, `tool-pins`, `tool-magnify`, `tool-blur` | One 1:1 close-up per tool |
| ★ ✅ | `paste-mobile` | `/paste` on a phone (portrait) |
| — ✅ | `backdrop-base` | The annotated capture with no backdrop, 1600×1000. The backdrop playground draws it on every style. |
