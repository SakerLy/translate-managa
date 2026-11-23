// textBlocks (fit.js): the pixel text finder behind the missed-text pass. A bubble it cannot see is never
// re-read, however often the model skips it. Each case is a shape that used to be missed on real pages
// (tests/live/detect-recall.js measures the real ones: 20/28 -> 23/28 on page4/5, 7 -> 2 of 14 missed on the
// Japanese synthetic page).
const ROOT = require('path').join(__dirname, '..', '..');
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'manga-dich/fit.js'), 'utf8'), ctx);
const textBlocks = vm.runInContext('textBlocks', ctx);

const W = 768, H = 1087; // a real scan's size: one grid cell per pixel
const page = (draw) => {
  const d = new Uint8ClampedArray(W * H * 4).fill(255);
  const rect = (x, y, w, h, v = 0) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const k = (j * W + i) * 4; d[k] = d[k + 1] = d[k + 2] = v; } };
  draw(rect);
  return { width: W, height: H, data: d };
};
// an outlined letter (bold strokes, a hole: real lettering, not a solid block)
const letter = (rect, x, y, w, h, v = 0, t = 3) => { rect(x, y, w, t, v); rect(x, y + h - t, w, t, v); rect(x, y, t, h, v); rect(x + w - t, y, t, h, v); };
const found = (px, X, Y, Wd, Hd) => textBlocks(px).filter((b) => {
  const x0 = b.x / 100 * W, y0 = b.y / 100 * H, x1 = x0 + b.w / 100 * W, y1 = y0 + b.h / 100 * H;
  return x1 > X && x0 < X + Wd && y1 > Y && y0 < Y + Hd;
});

// 1. kanji-like glyphs: each one is three separate strokes of different heights (本/当 split 26, 8, 7, 23...)
{
  const px = page((rect) => {
    for (let i = 0; i < 6; i++) {
      const x = 200 + i * 30, y = 300;
      rect(x, y, 22, 4); rect(x, y + 7, 4, 15); letter(rect, x + 9, y + 9, 13, 13);
    }
  });
  const b = found(px, 190, 290, 200, 50);
  assert.ok(b.length && b.every((k) => !k.faded), 'kanji-like line (multi-stroke glyphs) is found');
}

// 2. a short Latin line with punctuation ("MASA SIH?!"): dots far shorter than the letters
{
  const px = page((rect) => {
    for (let i = 0; i < 7; i++) letter(rect, 300 + i * 18, 600, 14, 21);
    rect(300 + 7 * 18, 616, 5, 5); rect(300 + 7 * 18 + 9, 616, 5, 5); // two dots on the baseline
  });
  assert.ok(found(px, 290, 590, 180, 40).length, 'short line with dots is found');
}

// 3. small lettering set tight (letters 1-2px apart: neighbours fill the ring around each letter)
{
  const px = page((rect) => {
    for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) letter(rect, 200 + i * 10, 400 + r * 14, 9, 12, 0, 2);
  });
  assert.ok(found(px, 190, 390, 140, 40).length, 'small tight lettering is found');
}

// 4. big lettering (36px letters on a 768-wide page were "art" when the limit came from the short side)
{
  const px = page((rect) => { for (let i = 0; i < 3; i++) letter(rect, 250 + i * 40, 700, 30, 36, 0, 6); });
  assert.ok(found(px, 240, 690, 140, 50).length, 'big lettering is found');
}

// 5. a real faded echo (grey all through) stays faded - recovery must still skip it
{
  const px = page((rect) => { for (let i = 0; i < 8; i++) letter(rect, 200 + i * 18, 900, 14, 21, 95); });
  const b = found(px, 190, 890, 180, 40);
  assert.ok(b.length && b.every((k) => k.faded), 'grey-only lettering is still marked faded');
}

// 6. small black lettering with some grey letters from JPEG (median grey, darkest letters black) is not faded
{
  const px = page((rect) => { for (let i = 0; i < 8; i++) letter(rect, 200 + i * 18, 200, 14, 21, i < 3 ? 0 : 80); });
  const b = found(px, 190, 190, 180, 40);
  assert.ok(b.length && b.some((k) => !k.faded), 'mostly-grey small lettering with black letters is not faded');
}

// 7. a blank page and a page of hatching give nothing
{
  assert.equal(textBlocks(page(() => {})).length, 0, 'blank page: no blocks');
  const px = page((rect) => { for (let i = 0; i < 60; i++) rect(100 + i * 9, 100, 2, 300); });
  assert.equal(found(px, 90, 90, 560, 320).filter((k) => !k.faded).length, 0, 'hatching: no text block');
}
console.log('detect OK');
