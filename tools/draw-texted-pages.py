#!/usr/bin/env python3
"""Vẽ 2 trang test cho detector hasText:
  tests/fixtures/texted-page.png  - trang manga có chữ (bong bóng + chữ dọc + caption + tone)
  tests/fixtures/textless-page.png - trang chỉ có art (panorama nét, screentone, KHÔNG chữ)
Đây là "ground truth bằng construction": detector phải nói CHỮ với trang 1, trống với trang 2.
"""
import math
import random
from PIL import Image, ImageDraw, ImageFont

random.seed(42)
W, H = 760, 1080
FONT = '/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf'

def tone(d, box, pitch=6):
    """Screentone (chấm li ti) trong box."""
    x0, y0, x1, y1 = box
    for y in range(y0, y1, pitch):
        for x in range(x0, x1, pitch):
            if (x // pitch + y // pitch) % 2 == 0:
                d.point((x + pitch // 2, y + pitch // 2), fill=30)

# ---------- trang CÓ chữ ----------
img = Image.new('L', (W, H), 255)
d = ImageDraw.Draw(img)
# art nền: vài đường nét lớn + vùng tone
for k in range(6):
    cx, cy = 120 + k * 110, 900
    d.ellipse([cx - 70, cy - 120, cx + 70, cy + 120], outline=20, width=3)
tone(d, (30, 780, 730, 1060))
# panel borders (đường kẻ dài mỏng)
d.rectangle([20, 20, 740, 740], outline=20, width=2)
d.line([20, 480, 740, 480], fill=20, width=2)
# bong bóng + chữ Nhật dọc (cột chữ = từng ký tự xếp dọc)
f = ImageFont.truetype(FONT, 34)
bubbles = [((70, 60, 330, 200), ['ど', 'こ', 'へ', '行', 'く', 'の', '？']),
           ((420, 260, 690, 400), ['う', 'ん', '！']),
           ((80, 520, 300, 700), ['焦', 'る', 'な', '…']),
           ((380, 540, 680, 720), ['本', '当', 'に', '？'])]
for (box, chars) in bubbles:
    d.ellipse(box, fill=255, outline=15, width=3)
    x0, y0, x1, y1 = box
    for i, ch in enumerate(chars):  # cột phải trước, đọc xuống
        d.text((x1 - 70, y0 + 34 + i * 40), ch, font=f, fill=10)
# caption khung dẫn truyện (chữ ngang)
d.rectangle([30, 745, 730, 772], fill=255, outline=15, width=2)
d.text((40, 748), 'その時、教室のドアがゆっくりと開いた--', font=ImageFont.truetype(FONT, 18), fill=10)
img.save('tests/fixtures/texted-page.png')
img.convert('RGB').save('tests/fixtures/texted-page.jpg', quality=88)

# ---------- trang KHÔNG chữ (chỉ art) ----------
img2 = Image.new('L', (W, H), 255)
d2 = ImageDraw.Draw(img2)
# speed lines quanh tâm
cx, cy = W // 2, 400
for a in range(0, 360, 3):
    r0, r1 = 90 + (a % 5) * 8, 360
    d2.line([cx + r0 * math.cos(math.radians(a)), cy + r0 * math.sin(math.radians(a)),
             cx + r1 * math.cos(math.radians(a)), cy + r1 * math.sin(math.radians(a))], fill=25, width=2)
# nhân vật: khối silhouette lớn đặc + nét
d2.ellipse([cx - 130, cy - 160, cx + 130, cy + 200], fill=30)
d2.ellipse([cx - 60, cy - 240, cx + 60, cy - 140], fill=30)
# gợn sóng + tone nửa dưới
for y in range(cy + 240, H - 60, 26):
    pts = [(x, y + 10 * math.sin(x / 60.0)) for x in range(40, W - 40, 18)]
    d2.line(pts, fill=25, width=2)
tone(d2, (0, H - 220, W, H), pitch=7)
# vignette nét chéo góc
for i in range(40):
    d2.line([0, i * 30, i * 30, 0], fill=60, width=1)
img2.save('tests/fixtures/textless-page.png')
img2.convert('RGB').save('tests/fixtures/textless-page.jpg', quality=88)
print('saved texted-page.png + textless-page.png')
