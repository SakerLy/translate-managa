// hasText: textless-page detector.
//   node tests/unit/text.test.js            - unit cases (no fixtures)
//   node tests/unit/text.test.js fixtures   - detector over every *.png under tests/fixtures/
// The synth page's truth file says which pages carry text; page4/page5 are real manga pages.
const ROOT = require('path').join(__dirname, '..', '..'); // repo root: .env, manga-dich/, tests/fixtures/
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'manga-dich/text.js'), 'utf8'), ctx);
const { hasText } = vm.runInContext('({ hasText })', ctx);

// ---------- hasText ----------
// letters on white: detected (drawn at real manga lettering size: ~36px tall = 9 grid cells)
const page = (w, h, draw) => {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  const px = (x, y, v = 0) => { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; };
  draw(px);
  return { width: w, height: h, data: d };
};
const glyph = (px, X, Y, w = 24, h = 36) => { // letter-like blob at real manga weight: bold strokes
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (x < 8 || x >= w - 8 || (y > 10 && y < h - 10)) px(X + x, Y + y);
};
const withText = page(760, 1080, (px) => {
  for (let b = 0; b < 8; b++) for (let c = 0; c < 3; c++) glyph(px, 80 + b * 82 + c * 26, 90 + b * 118);
});
const r1 = hasText(withText);
assert.equal(r1.has, true, 'letters on white -> text');
console.log(`  chữ trắng nền: ratio ${r1.ratio.toFixed(2)} nhỏ=${r1.small}`);
// pure screentone (uniform dot field): no text
const tone = page(760, 1080, (px) => {
  for (let y = 0; y < 1080; y += 8) for (let x = 0; x < 760; x += 8) px(x + ((y / 8) % 2 ? 4 : 0), y, 0);
});
const r2 = hasText(tone);
assert.equal(r2.has, false, 'screentone -> no text');
console.log(`  screentone: ratio ${r2.ratio.toFixed(2)} nhỏ=${r2.small}`);
// big art strokes: no text
const art = page(760, 1080, (px) => {
  for (let k = 0; k < 30; k++) { const cx = 100 + (k % 5) * 130, cy = 150 + ((k / 5) | 0) * 200;
    for (let y = -80; y <= 80; y++) for (let x = -40; x <= 40; x++) if (Math.hypot(x / 40, y / 80) <= 1) px(cx + x, cy + y); }
});
assert.equal(hasText(art).has, false, 'big shapes -> no text');
// letters OVER screentone (bubbles sit on toned art - the common real case): still detected
const mixed = page(760, 1080, (px) => {
  for (let y = 0; y < 1080; y += 8) for (let x = 0; x < 760; x += 8) px(x + ((y / 8) % 2 ? 4 : 0), y, 0);
  for (let b = 0; b < 8; b++) for (let c = 0; c < 3; c++) glyph(px, 80 + b * 82 + c * 26, 90 + b * 118);
});
assert.equal(hasText(mixed).has, true, 'letters over screentone -> text');
// white lettering on a black bubble (night/flashback pages): detected too
const dark = page(760, 1080, (px) => {
  for (let y = 0; y < 1080; y++) for (let x = 0; x < 760; x++) px(x, y, 20);
  const pxWhite = (x, y) => px(x, y, 255);
  for (let b = 0; b < 8; b++) for (let c = 0; c < 3; c++) glyph(pxWhite, 80 + b * 82 + c * 26, 90 + b * 118);
});
assert.equal(hasText(dark).has, true, 'white on black -> text');
// a lone page number: still no text (too few clusters)
const num = page(760, 1080, (px) => glyph(px, 380, 1050, 8, 12));
assert.equal(hasText(num).has, false, 'page number only -> no text');
console.log('hasText synthetic OK');

if (process.argv[2] === 'fixtures') {
  const { execSync } = require('child_process');
  const os = require('os');
  // decoded by PIL (a hand-rolled PNG reader skipped row filters and fed the detector garbage: real pages with
  // text scored as empty). The extension always sends JPEG, so .jpg twins are scored when they exist.
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const decode = (file) => {
    const rgba = path.join(os.tmpdir(), 'md-fixture.rgba').split(path.sep).join('/'), src = file.split(path.sep).join('/');
    const size = execSync(`${py} -c "from PIL import Image; im=Image.open('${src}').convert('RGBA'); open('${rgba}','wb').write(im.tobytes()); print(*im.size)"`).toString().trim().split(/\s+/);
    return { width: +size[0], height: +size[1], data: new Uint8ClampedArray(fs.readFileSync(rgba)) };
  };
  // ground truth by name: *textless* pages carry no lettering, everything else with truth text does.
  // When a .jpg twin exists the PNG is just the source for it: score the .jpg (the extension's
  // encode() always sends JPEG, so that is the format the detector really sees).
  const files = [];
  const walk = (dir) => fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) return walk(p);
    if (!/\.(png|jpg)$/.test(f) || f.includes('probe')) return;
    if (f.endsWith('.png') && fs.existsSync(p.replace(/\.png$/, '.jpg'))) return;
    files.push(p);
  });
  walk(path.join(ROOT, 'tests/fixtures'));
  let bad = 0;
  for (const f of files) {
    const expect = !/textless/.test(f); // JPEG variants are the format the extension really sends
    const r = hasText(decode(f));
    const ok = r.has === expect;
    if (!ok) bad++;
    console.log(`${r.has ? 'CHỮ  ' : 'trống'} ${ok ? '✓' : '✗'} nhỏ=${String(r.small).padStart(3)}/${String(r.total).padStart(4)}  ${path.relative(ROOT, f)}`);
  }
  assert.equal(bad, 0, `${bad} trang bị chấm sai`);
  console.log('detector: tất cả trang chấm đúng');
}
