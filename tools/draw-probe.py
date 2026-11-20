# Same 2-bubble probe image the extension draws with OffscreenCanvas (background.js testImage), for Node tests.
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 600, 400
BUBBLES = [(160, 120, 130, 80, 'WHERE ARE', 'YOU GOING?!'), (440, 290, 130, 80, "I'M GOING", 'HOME NOW.')]
img = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(img)
font = ImageFont.load_default(size=30)
for cx, cy, rx, ry, l1, l2 in BUBBLES:
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline='black', width=4)
    d.text((cx, cy - 6), l1, fill='black', font=font, anchor='ms')
    d.text((cx, cy + 30), l2, fill='black', font=font, anchor='ms')
img.save(sys.argv[1])
print('saved', sys.argv[1])
