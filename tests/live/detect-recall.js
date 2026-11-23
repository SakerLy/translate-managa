// How many hand-measured bubbles does the pixel detector (textBlocks in fit.js) find? A bubble it misses
// can never be re-read by the missed-text pass, however often the model skips it.
//   node tests/live/detect-recall.js            (pages in tests/fixtures/*.truth.json, PNGs needed locally)
// Per bubble: found (a non-faded block covers >= 40% of it), faded (only blocks marked faded = never
// recovered), or missed (nothing).
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), FX = path.join(ROOT, 'tests', 'fixtures');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'manga-dich', 'fit.js'), 'utf8'), ctx);
const textBlocks = vm.runInContext('textBlocks', ctx);

// PNG -> RGBA through Python/Pillow (already a test dependency), cached next to the PNG (*.rgba is gitignored)
const { execFileSync } = require('child_process');
function pixels(png) {
  const raw = png.replace(/\.png$/, '.rgba');
  const size = JSON.parse(execFileSync('python', ['-c', `import sys,json;from PIL import Image;i=Image.open(sys.argv[1]).convert('RGBA');open(sys.argv[2],'wb').write(i.tobytes());print(json.dumps(i.size))`, png, raw]).toString());
  return { width: size[0], height: size[1], data: new Uint8ClampedArray(fs.readFileSync(raw)) };
}

module.exports = { pixels };
if (require.main !== module) return;
let all = 0, found = 0;
const rows = [];
const truths = fs.readdirSync(FX, { recursive: true }).map(String).filter((f) => f.endsWith('.truth.json'));
for (const f of truths) {
  const png = path.join(FX, f.replace('.truth.json', '.png'));
  if (!fs.existsSync(png)) { console.log(`- ${f}: no ${path.basename(png)} locally, skipped`); continue; }
  const truth = JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8'));
  const px = pixels(png);
  const sx = 100 / truth.width, sy = 100 / truth.height;
  const blocks = textBlocks(px);
  const inter = (a, t) => Math.max(0, Math.min(a.x + a.w, t.x + t.w) - Math.max(a.x, t.x)) * Math.max(0, Math.min(a.y + a.h, t.y + t.h) - Math.max(a.y, t.y));
  for (const b of truth.bubbles) {
    const t = { x: b.box[0] * sx, y: b.box[1] * sy, w: (b.box[2] - b.box[0]) * sx, h: (b.box[3] - b.box[1]) * sy };
    // the hand box spans the whole bubble interior while a block hugs the letters, so >= 20% of the box is a
    // full hit for a short line; a block may also span two neighbouring bubbles (one recovery crop for both)
    const on = blocks.filter((k) => inter(k, t) > 0);
    const cov = (ks) => ks.reduce((n, k) => n + inter(k, t), 0) / (t.w * t.h);
    const state = cov(on.filter((k) => !k.faded)) >= 0.2 ? 'found' : on.some((k) => k.faded) ? 'FADED' : on.length ? 'PARTIAL' : 'MISSED';
    all++; if (state === 'found') found++;
    rows.push(`${f.replace('.truth.json', '').padEnd(10)} ${state.padEnd(8)} cover ${(cov(on.filter((k) => !k.faded)) * 100).toFixed(0).padStart(3)}%  blocks ${on.length}  "${b.id}"`);
  }
}
for (const r of rows) console.log(r);
console.log(`\ndetector recall: ${found}/${all} bubbles (${(100 * found / all).toFixed(0)}%)`);
// false alarms: blocks on a page with no lettering at all (each one costs a recovery crop)
const tl = path.join(FX, 'textless-page.png');
if (fs.existsSync(tl)) console.log(`blocks on textless-page.png: ${textBlocks(pixels(tl)).filter((k) => !k.faded).length}`);
