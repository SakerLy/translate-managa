# Visual check: draws truth boxes (green) and, if given, model boxes (red, from test-boxes.js JSON) on the page.
#   python draw-boxes.py test-fixtures/page4.png test-fixtures/page4.truth.json [result.json] out.png
import json, sys
from PIL import Image, ImageDraw

img_path, truth_path, *rest = sys.argv[1:]
out_path = rest[-1]
img = Image.open(img_path).convert('RGB')
d = ImageDraw.Draw(img)
for b in json.load(open(truth_path, encoding='utf-8'))['bubbles']:
    d.rectangle(b['box'], outline=(0, 200, 0), width=3)
if len(rest) == 2:
    W, H = img.size
    for b in json.load(open(rest[0], encoding='utf-8'))['bubbles']:  # x/y/w/h in % (as the overlay uses)
        x0, y0 = b['x'] * W / 100, b['y'] * H / 100
        d.rectangle([x0, y0, x0 + b['w'] * W / 100, y0 + b['h'] * H / 100], outline=(230, 0, 0), width=3)
img.save(out_path)
print('saved', out_path)
