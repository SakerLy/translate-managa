// Measures fit.js on real pixels + real model boxes for page 4 (see README "Chạy test").
//   python -c "from PIL import Image; open('page4.rgba','wb').write(Image.open('test-fixtures/page4.png').convert('RGBA').tobytes())"
//   node test-fit.js page4.rgba test-fixtures/result-*.json
// ink covered: % of dark (text) pixels inside the hand-measured bubbles that end up under a box (higher = better)
// spill:       % of box area outside the bubbles (+20px margin), i.e. artwork hidden (lower = better)
const fs = require('fs'), vm = require('vm'), path = require('path');
const [argRgba, ...results] = require.main === module ? process.argv.slice(2) : [];
const rgba = argRgba || process.env.RGBA; // RGBA=path when required from another script
const truth = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-fixtures/page4.truth.json'), 'utf8'));
const W = truth.width, H = truth.height;
const data = new Uint8ClampedArray(fs.readFileSync(rgba));
if (data.length !== W * H * 4) throw new Error('rgba size does not match page4 (768x1087)');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'manga-dich/fit.js'), 'utf8'), ctx);
const fit = vm.runInContext('fitBubbles', ctx);

const dark = (x, y) => { const i = (y * W + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 100; };
const allowed = new Uint8Array(W * H), inkIn = new Uint8Array(W * H);
for (const { box: [x0, y0, x1, y1] } of truth.bubbles) {
  for (let y = Math.max(0, y0 - 20); y < Math.min(H, y1 + 20); y++) for (let x = Math.max(0, x0 - 20); x < Math.min(W, x1 + 20); x++) allowed[y * W + x] = 1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (dark(x, y)) inkIn[y * W + x] = 1;
}
const inkTotal = inkIn.reduce((a, v) => a + v, 0);
function measure(bubbles) {
  const cov = new Uint8Array(W * H);
  for (const b of bubbles) {
    const x0 = Math.max(0, Math.round(b.x / 100 * W)), y0 = Math.max(0, Math.round(b.y / 100 * H));
    const x1 = Math.min(W, Math.round((b.x + b.w) / 100 * W)), y1 = Math.min(H, Math.round((b.y + b.h) / 100 * H));
    for (let y = y0; y < y1; y++) cov.fill(1, y * W + x0, y * W + x1);
  }
  let ink = 0, area = 0, out = 0;
  for (let i = 0; i < W * H; i++) { if (!cov[i]) continue; area++; if (inkIn[i]) ink++; if (!allowed[i]) out++; }
  return { ink: (100 * ink / inkTotal).toFixed(1), spill: area ? (100 * out / area).toFixed(1) : '0.0' };
}
module.exports = { fit, measure, W, H, data };
if (require.main === module) {
  console.log('file'.padEnd(42), 'ink covered before → after', '  spill before → after');
  for (const f of results) {
    const { bubbles } = JSON.parse(fs.readFileSync(f, 'utf8'));
    const t0 = Date.now(); const fitted = fit({ width: W, height: H, data }, bubbles); const ms = Date.now() - t0;
    const a = measure(bubbles), b = measure(fitted);
    console.log(path.basename(f).replace('result-', '').padEnd(42), `${a.ink}% → ${b.ink}%`.padEnd(22), `${a.spill}% → ${b.spill}%`.padEnd(16), `${ms}ms`);
  }
}
