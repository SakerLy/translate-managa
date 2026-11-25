// How translations sit on a real page: the same steps the page runs (fit.js fitBubbles -> trimOverlaps -> planLine)
// on page 4 with every saved model answer (tests/fixtures/result-*.json) and the hand-measured bubbles.
//   node tests/live/placement.js [result-*.json ...]      (needs tests/fixtures/page4.png, Python + Pillow)
// Per model:
//   xoá/khối/chồng  lines whose source is erased / covered by an opaque panel / left under transparent text
//   còn thấy        % of the bubbles' lettering ink still visible (neither erased nor covered) - text over text
//   tràn            % of the boxes' area outside every bubble (art hidden or text spilling out)
//   cỡ chữ          estimated font / source letter height (median), and lines under 0.7x ("quá nhỏ")
const ROOT = require('path').join(__dirname, '..', '..');
const fs = require('fs'), vm = require('vm'), path = require('path'), { execFileSync } = require('child_process');
const FX = path.join(ROOT, 'tests', 'fixtures');
const truth = JSON.parse(fs.readFileSync(path.join(FX, 'page4.truth.json'), 'utf8'));

// the page the extension works on: upscaled like content.js grab() (at most 1.6x, long edge 1568)
const k = Math.min(1.6, 1568 / Math.max(truth.width, truth.height));
const W = Math.round(truth.width * k), H = Math.round(truth.height * k);
const raw = path.join(FX, `page4-${W}x${H}.rgba`);
if (!fs.existsSync(raw)) execFileSync('python', ['-c', `import sys;from PIL import Image;Image.open(sys.argv[1]).convert('RGBA').resize((${W},${H}),Image.LANCZOS).save(sys.argv[2]+'.png');open(sys.argv[2],'wb').write(Image.open(sys.argv[2]+'.png').tobytes())`, path.join(FX, 'page4.png'), raw]);
const px = { width: W, height: H, data: new Uint8ClampedArray(fs.readFileSync(raw)) };

const ctx = { ImageData: class { constructor(d, w, h) { Object.assign(this, { data: d, width: w, height: h }); } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.env.FIT || path.join(ROOT, 'manga-dich/fit.js'), 'utf8'), ctx); // FIT=other.js to A/B a variant
const [textBlocks, fitBubbles, trimOverlaps, planLine] = ['textBlocks', 'fitBubbles', 'trimOverlaps', 'planLine'].map((n) => vm.runInContext(n, ctx));
const blocks = textBlocks(px);

// truth bubbles in % of the page; the lettering ink inside each (dark pixels)
const bubbles = truth.bubbles.map(({ box: [x0, y0, x1, y1] }) => [x0 / truth.width * 100, y0 / truth.height * 100, (x1 - x0) / truth.width * 100, (y1 - y0) / truth.height * 100]);
// lettering only: dark pixels inside a detected text block (the bubble's own outline is never erased, and counted
// as "still visible" it put a 13% floor under every model)
const inBlock = (X, Y) => blocks.some((b) => !b.faded && X >= b.x && X <= b.x + b.w && Y >= b.y && Y <= b.y + b.h);
const ink = bubbles.map(([bx, by, bw, bh]) => {
  const list = [];
  for (let y = Math.floor(by / 100 * H); y < (by + bh) / 100 * H; y++) for (let x = Math.floor(bx / 100 * W); x < (bx + bw) / 100 * W; x++) {
    const i = (y * W + x) * 4;
    if (0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2] < 100 && inBlock(x / W * 100, y / H * 100)) list.push(y * W + x);
  }
  return list;
});

// largest font (px of this image) at which the text fits the box: ~0.55em per character, 1.2em lines, word wrap
function fontFor(text, wPx, hPx) {
  const words = String(text).split(/\s+/).filter(Boolean);
  for (let f = Math.floor(Math.min(80, hPx)); f >= 4; f--) {
    const cw = 0.55 * f, maxC = Math.floor(wPx / cw);
    if (maxC < 1) continue;
    let lines = 1, cur = 0, ok = true;
    for (const w of words) {
      if (w.length > maxC) { ok = false; break; }
      if (cur && cur + 1 + w.length > maxC) { lines++; cur = w.length; } else cur += (cur ? 1 : 0) + w.length;
    }
    if (ok && lines * 1.2 * f <= hPx) return f;
  }
  return 4;
}

const files = (require.main === module && process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(FX).filter((f) => /^result-.*\.json$/.test(f)).map((f) => path.join(FX, f)));
const rows = [];
for (const file of files) {
  const res = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fitted = fitBubbles(px, res.bubbles.map((b) => ({ ...b })));
  const separated = fitted.some((t) => t.fit) ? trimOverlaps(fitted) : fitted.slice();
  const erased = new Uint8Array(W * H), covered = new Uint8Array(W * H);
  let xoa = 0, khoi = 0, chong = 0, boxArea = 0, outArea = 0;
  const ratios = [];
  for (const t of separated) {
    const p = planLine(px, t, separated, blocks, [t.x, t.y, t.w, t.h], false);
    const [x, y, w, h] = p.box || [t.x, t.y, t.w, t.h];
    const look = p.patch ? 'xoa' : t.kind === 'sfx' ? 'chong' : 'khoi';
    if (look === 'xoa') xoa++; else if (look === 'khoi') khoi++; else chong++;
    if (p.patch) {
      const c = p.patch, X0 = c.x / 100 * W, Y0 = c.y / 100 * H, sx = c.w / 100 * W / c.pw, sy = c.h / 100 * H / c.ph;
      for (let j = 0; j < c.ph; j++) for (let i = 0; i < c.pw; i++) if (c.data[(j * c.pw + i) * 4 + 3]) {
        for (let yy = Math.floor(Y0 + j * sy); yy < Y0 + (j + 1) * sy; yy++) for (let xx = Math.floor(X0 + i * sx); xx < X0 + (i + 1) * sx; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) erased[yy * W + xx] = 1;
      }
    } else if (look === 'khoi') {
      for (let yy = Math.max(0, Math.floor(y / 100 * H)); yy < Math.min(H, (y + h) / 100 * H); yy++) covered.fill(1, yy * W + Math.max(0, Math.floor(x / 100 * W)), yy * W + Math.min(W, Math.ceil((x + w) / 100 * W)));
    }
    // spill: the box outside every bubble (+1% margin)
    const area = w * h; boxArea += area;
    let inside = 0;
    // inside ANY bubble (a line the model merged over two neighbours spills into neither)
    for (const [bx, by, bw, bh] of bubbles) inside += Math.max(0, Math.min(x + w, bx + bw + 1) - Math.max(x, bx - 1)) * Math.max(0, Math.min(y + h, by + bh + 1) - Math.max(y, by - 1));
    inside = Math.min(area, inside);
    outArea += area - inside;
    if (process.env.VERBOSE && area - inside > 0.25 * area) console.log(`  tràn ${Math.round((area - inside) / area * 100)}%  ${look} fit=${t.fit} kind=${t.kind || ''} box=[${[x, y, w, h].map((v) => v.toFixed(1))}] model=[${[t.x, t.y, t.w, t.h].map((v) => v.toFixed(1))}] limit=${JSON.stringify(p.limit && p.limit.map((v) => +v.toFixed(1)))} inner=${!!p.patch?.inner} "${String(t.text).slice(0, 30)}"`);
    if (t.lh) {
      const r = fontFor(t.text, w / 100 * W, h / 100 * H) / (t.lh / 100 * H);
      ratios.push(r);
      if (process.env.VERBOSE && r < 0.7) console.log(`  nhỏ ${r.toFixed(2)}  ${look} fit=${t.fit} kind=${t.kind || ''} box=[${[x, y, w, h].map((v) => v.toFixed(1))}] lh=${t.lh.toFixed(2)} ${String(t.text).length} chữ "${String(t.text).slice(0, 30)}"`);
    }
  }
  // only bubbles that got a translation (a missed bubble is a reading miss, not a placement one)
  const centres = separated.map((t) => [t.x + t.w / 2, t.y + t.h / 2]);
  const got = bubbles.map(([bx, by, bw, bh]) => centres.some(([cx, cy]) => cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh));
  const inkGot = ink.filter((_, i) => got[i]).flat();
  const visible = inkGot.filter((i) => !erased[i] && !covered[i]).length;
  ratios.sort((a, z) => a - z);
  rows.push({ model: path.basename(file).replace(/^result-|\.json$/g, ''), lines: separated.length, xoa, khoi, chong,
    boSot: got.filter((g) => !g).length, conThay: Math.round(visible / Math.max(1, inkGot.length) * 100), tran: Math.round(outArea / Math.max(1e-9, boxArea) * 100),
    coChu: ratios.length ? +ratios[ratios.length >> 1].toFixed(2) : 0, quaNho: ratios.filter((r) => r < 0.7).length });
}
console.table(rows);
const sum = (k2) => rows.reduce((n, r) => n + r[k2], 0);
console.log(`TỔNG ${rows.length} model: bỏ sót ${sum('boSot')}  xoá ${sum('xoa')}  khối ${sum('khoi')}  chồng ${sum('chong')}  còn thấy TB ${(sum('conThay') / rows.length).toFixed(1)}%  tràn TB ${(sum('tran') / rows.length).toFixed(1)}%  cỡ chữ TB ${(sum('coChu') / rows.length).toFixed(2)}  quá nhỏ ${sum('quaNho')}`);
module.exports = { rows };
