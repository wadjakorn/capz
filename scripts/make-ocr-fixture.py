"""Render src-tauri/tests/fixtures/ocr-thai-mixed.png — light-on-dark mixed
Thai/English, echoing the terminal screenshot measured in research §8.
Needs Pillow and the Loma font (Ubuntu: fonts-tlwg-loma-otf). The PNG is
committed; re-run only to change the fixture."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/opentype/tlwg/Loma.otf"
LINES = [
    "ที่แก้จริง",
    "1. เทียบที่ตัวรูป ไม่ใช่ที่ object สุ่ม 8x8 จุด",
    "",
    "2. ไม่ล้างปกทันทีเมื่อ metadata ยังไม่มีรูป",
    'tree) ตอนนี้รอ 1.2 วินาที "เพลงนี้ไม่มีปก"',
    "",
    "342 JVM tests ผ่านหมด, ลบ log ออกแล้ว",
]

out = Path(__file__).resolve().parent.parent / "src-tauri/tests/fixtures/ocr-thai-mixed.png"
font = ImageFont.truetype(FONT, 24)
img = Image.new("RGB", (1100, 420), (20, 20, 20))
draw = ImageDraw.Draw(img)
for i, text in enumerate(LINES):
    draw.text((20, 20 + i * 55), text, font=font, fill="white")
img.save(out)
print(out)
