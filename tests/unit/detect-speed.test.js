// textBlocks must stay cheap: it runs on the page's main thread for every translated page. A first version of
// the glyph merge (pairwise, re-scanned after every merge, run before the hatching check) pinned a CPU core on
// pages with screentone (user report: 100% CPU). Worst case here: a dense screentone patch next to text.
const ROOT = require('path').join(__dirname, '..', '..');
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.env.FIT || path.join(ROOT, 'manga-dich/fit.js'), 'utf8'), ctx);
const textBlocks = vm.runInContext('textBlocks', ctx);

const W = 1229, H = 1739; // a 768x1087 scan after the extension's 1.6x upscale
const d = new Uint8ClampedArray(W * H * 4).fill(255);
const rect = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const k = (j * W + i) * 4; d[k] = d[k + 1] = d[k + 2] = 0; } };
// screentone: 3x3 dots every 6px over a 420x420 patch (~4900 dots on paper)
for (let y = 100; y < 520; y += 6) for (let x = 100; x < 520; x += 6) rect(x, y, 3, 3);
// a second patch of bigger dots, and some lettering
for (let y = 900; y < 1300; y += 9) for (let x = 600; x < 1000; x += 9) rect(x, y, 5, 5);
for (let i = 0; i < 20; i++) { const x = 650 + i * 22, y = 600; rect(x, y, 16, 3); rect(x, y + 21, 16, 3); rect(x, y, 3, 24); rect(x + 13, y, 3, 24); }

const t0 = Date.now();
textBlocks({ width: W, height: H, data: d });
const ms = Date.now() - t0;
console.log(`textBlocks on a screentone page: ${ms}ms`);
assert.ok(ms < 1500, `textBlocks took ${ms}ms on a screentone page (must stay well under a second or two)`);
