// v0.6: erase-and-redraw (cleanPatch), bubble-shaped lines (ellipseLines), separate polish model,
// learning from the reader's corrections, character list per series.
//   node tests/unit/erase-polish.test.js
const ROOT = require('path').join(__dirname, '..', '..'); // repo root: .env, manga-dich/, tests/fixtures/
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const fctx = {}; vm.createContext(fctx);
vm.runInContext(R('manga-dich/fit.js'), fctx);
const clean = vm.runInContext('cleanPatch', fctx), shape = vm.runInContext('ellipseLines', fctx);

// ---------- cleanPatch: letters vanish, the bubble outline stays ----------
{
  const W = 300, H = 200, data = new Uint8ClampedArray(W * H * 4).fill(255);
  const ink = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; } };
  for (let x = 40; x < 260; x++) { ink(x, 40, x + 1, 42); ink(x, 158, x + 1, 160); } // outline top/bottom
  for (let y = 80; y + 14 <= 120; y += 22) for (let x = 80; x + 9 <= 220; x += 14) { ink(x, y, x + 2, y + 14); ink(x + 7, y, x + 9, y + 14); ink(x, y + 6, x + 9, y + 8); }
  const box = { x: 30 / W * 100, y: 35 / H * 100, w: 240 / W * 100, h: 130 / H * 100, bg: 'rgb(255,255,255)' };
  const c = clean({ width: W, height: H, data }, box);
  assert.ok(c, 'patch made');
  const at = (x, y) => c.data[((y - Math.round(c.y / 100 * H)) * c.pw + (x - Math.round(c.x / 100 * W))) * 4]; // patch includes a margin
  // a letter poking out of the box is still erased (it touches the box), the margin's outline is not

  assert.ok(at(81, 85) > 240, 'letter stroke erased to paper: ' + at(81, 85));
  assert.ok(at(150, 41) < 20, 'bubble outline kept: ' + at(150, 41));
  const alpha = (x, y) => c.data[((y - Math.round(c.y / 100 * H)) * c.pw + (x - Math.round(c.x / 100 * W))) * 4 + 3];
  assert.equal(alpha(150, 41), 0, 'untouched pixels are transparent (an overlapping patch must not paint letters back)');
  assert.equal(alpha(81, 85), 255, 'erased pixels are opaque');
  // a region that is all "ink" is not erased (nothing sensible to fill from)
  assert.equal(clean({ width: 10, height: 10, data: new Uint8ClampedArray(400) }, { x: 0, y: 0, w: 100, h: 100, bg: 'rgb(255,255,255)' }), null);
}
console.log('cleanPatch OK');

// ---------- one model item over two touching bubbles: split per bubble, in reading order ----------
{
  const W = 400, H = 300, data = new Uint8ClampedArray(W * H * 4).fill(255);
  const ink = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; } };
  const text = (x0, y0, cols, rows) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = x0 + c * 11, y = y0 + r * 16; ink(x, y, x + 2, y + 10); ink(x + 6, y, x + 8, y + 10); ink(x, y + 4, x + 8, y + 6); } };
  for (let y = 20; y < 280; y++) ink(200, y, 202, y + 1); // the outline the two bubbles share
  text(230, 60, 8, 3); // right bubble: read first
  text(40, 140, 8, 3); // left bubble, lower
  const fit = vm.runInContext('fitBubbles', fctx);
  const out = fit({ width: W, height: H, data }, [{ x: 5, y: 15, w: 90, h: 70, text: 'Hừm... À, chú có mì ramen. Hay dùng gói bột nêm này?', src: 'HMM', kind: 'bubble' }], false);
  assert.equal(out.length, 2, 'split into two boxes: ' + JSON.stringify(out.map((b) => b.text)));
  const right = out.find((b) => b.x > 50), left = out.find((b) => b.x < 50);
  assert.ok(right && left, 'one box per bubble');
  assert.ok(right.text.startsWith('Hừm'), 'right bubble (read first) gets the first sentence: ' + right.text);
  assert.ok(left.text.endsWith('này?'), 'left bubble gets the last: ' + left.text);
  assert.ok(right.x * W / 100 >= 200 && left.x * W / 100 + left.w * W / 100 <= 202, 'neither box crosses the shared outline');
  // same text blocks inside ONE bubble (no outline between): left alone
  const d2 = new Uint8ClampedArray(W * H * 4).fill(255);
  data.set(d2); text(230, 60, 8, 3); text(40, 140, 8, 3);
  assert.equal(fit({ width: W, height: H, data }, [{ x: 5, y: 15, w: 90, h: 70, text: 'Một. Hai.', kind: 'bubble' }], false).length, 1, 'no outline between: one bubble');
}
console.log('merged-bubble split OK');

// ---------- slanted lettering: angle found from the pixels, level text stays level ----------
{
  const angle = vm.runInContext('textAngle', fctx);
  const page = (deg) => {
    const W = 400, H = 300, data = new Uint8ClampedArray(W * H * 4).fill(255), r = deg * Math.PI / 180;
    for (let line = 0; line < 3; line++) for (let k = 0; k < 14; k++) {
      const cx = 60 + k * 20, cy = 110 + line * 30;
      const x = cx * Math.cos(r) - (cy - 150) * Math.sin(r), y = 150 + cx * Math.sin(r) + (cy - 150) * Math.cos(r);
      for (let yy = -6; yy < 6; yy++) for (let xx = -4; xx < 4; xx++) {
        if (Math.abs(xx) > 1 && Math.abs(yy) > 1) continue;
        const X = Math.round(x + xx), Y = Math.round(y + yy);
        if (X >= 0 && Y >= 0 && X < W && Y < H) { const i = (Y * W + X) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
      }
    }
    return { width: W, height: H, data };
  };
  const all = { x: 0, y: 0, w: 100, h: 100, bg: 'rgb(255,255,255)' };
  assert.equal(angle(page(0), all), 0, 'level text stays level');
  assert.equal(angle(page(-10), all), -10, 'rising lines');
  assert.equal(angle(page(12), all), 12, 'falling lines');
}
console.log('slanted text OK');

// ---------- a box grown over a neighbour's line: no text drawn over text, no line lost ----------
{
  const trim = vm.runInContext('trimOverlaps', fctx);
  const big = { x: 10, y: 10, w: 40, h: 40, text: 'Một câu khá dài trong khung lớn', fit: 'letters' };
  const small = { x: 12, y: 40, w: 10, h: 8, text: 'Câu nhỏ', fit: 'letters' };
  const out = trim([big, small]);
  const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  assert.ok(out.length === 1 ? out[0].text.includes('Câu nhỏ') && out[0].text.includes('khung lớn') : inter(out[0], out[1]) === 0, 'cut apart or merged: ' + JSON.stringify(out));
  const inside = trim([{ x: 10, y: 10, w: 40, h: 40, text: 'Lời dẫn dài một khung', fit: 'letters' }, { x: 25, y: 25, w: 10, h: 10, text: 'Ở giữa', fit: 'letters' }]);
  assert.equal(inside.length, 1, 'small box in the middle of a big one: merged');
  assert.ok(inside[0].text.includes('Ở giữa') && inside[0].full.w >= 40, 'merged text keeps both lines and the full erase area');
}
console.log('contained boxes OK');

// ---------- GPT answers with xmax repeated where ymax belongs: repaired, not dropped ----------
{
  const bctx = { TextEncoder, crypto, URL, console, chrome: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } }, storage: { local: {} } } };
  vm.createContext(bctx);
  vm.runInContext(R('manga-dich/background.js'), bctx);
  const parse = vm.runInContext('parseBubbles', bctx);
  const out = parse(JSON.stringify({ bubbles: [
    { box_2d: [139, 663, 887, 888], text: 'Một', kind: 'bubble' },  // ymax = xmax and absurdly tall
    { box_2d: [521, 329, 412, 413], text: 'Hai', kind: 'bubble' },  // ymax = xmax, above ymin
    { box_2d: [499, 187, 610, 289], text: 'Ba', kind: 'bubble' },   // a normal box stays as it is
    { box_2d: [134, 593, 173], text: 'Bốn', kind: 'bubble' },       // only 3 numbers
    { box_2d: [199, 812, 921, 291], text: 'Năm', kind: 'bubble' },  // [top, left, right, bottom]
  ] }));
  assert.equal(out.length, 5, 'no line lost: ' + JSON.stringify(out));
  const four = out.find((b) => b.text === 'Bốn'), five = out.find((b) => b.text === 'Năm');
  assert.ok(Math.abs(four.y - 13.4) < 0.1 && Math.abs(four.x - 59.3) < 0.1, '3-number box keeps top-left: ' + JSON.stringify(four));
  assert.ok(Math.abs(five.x - 81.2) < 0.1 && Math.abs(five.w - 10.9) < 0.1 && Math.abs(five.h - 9.2) < 0.1, 'top,left,right,bottom read right: ' + JSON.stringify(five));
  const one = out.find((b) => b.text === 'Một'), two = out.find((b) => b.text === 'Hai'), three = out.find((b) => b.text === 'Ba');
  assert.ok(Math.abs(one.y - 13.9) < 0.1 && Math.abs(one.x - 66.3) < 0.1 && one.h < 15, 'top-left kept, height estimated: ' + JSON.stringify(one));
  assert.ok(Math.abs(two.y - 52.1) < 0.1 && Math.abs(two.x + two.w - 41.3) < 0.1, 'xmax kept: ' + JSON.stringify(two));
  assert.ok(Math.abs(three.h - 11.1) < 0.1, 'normal box untouched');
}
console.log('malformed GPT boxes OK');

// ---------- ellipseLines: middle lines longer than the first/last ----------
{
  const measure = (t) => t.length * 8; // 8px per char
  const lines = shape('Anh không được tán tỉnh bạn gái của cựu anh rể đâu đấy nhé', measure, 200, 120, 20);
  assert.ok(lines && lines.length >= 3, 'wrapped into several lines: ' + JSON.stringify(lines));
  const mid = lines[lines.length >> 1].length;
  assert.ok(mid >= lines[0].length && mid >= lines[lines.length - 1].length, 'diamond/oval profile: ' + JSON.stringify(lines));
  assert.equal(shape('Xiết chặtttttttttttttttttttttttttttttttttt', measure, 60, 40, 20), null, 'a word wider than the box does not fit');
  assert.deepEqual(shape('Ừ', measure, 100, 40, 20), ['Ừ']);
}
console.log('ellipseLines OK');

// ---------- only chapter pages cost tokens; the script survives being injected twice ----------
{
  const sc = {}; vm.createContext(sc);
  vm.runInContext(R('manga-dich/series.js'), sc);
  vm.runInContext(R('manga-dich/series.js'), sc); // MangaDex: same page, started again
  const isReader = vm.runInContext('mdIsReader', sc);
  for (const p of ['/chapter/b805a043-f95e/14', '/manga/one-piece/chapter-1000', '/read/one-piece/1000', '/one-piece-chapter-1000.html', '/truyen-tranh/kaoru/chap-12/']) assert.ok(isReader(p), 'reader: ' + p);
  for (const p of ['/', '/title/418791c0/kaoru-hana', '/titles/latest', '/search', '/user/me', '/manga/one-piece']) assert.ok(!isReader(p), 'not a reader: ' + p);
  assert.match(R('manga-dich/background.js'), /READER_URL\.test\(new URL\(tab\.url\)\.pathname\)/, 'auto-start gated on chapter URLs');
}
console.log('chapter-only OK');

// ---------- overlap split: two crowded bubbles each keep their half; a box inside another is left alone ----------
{
  const trim = vm.runInContext('trimOverlaps', fctx);
  const [a, b] = trim([{ x: 68, y: 37, w: 17, h: 12, text: 'Nên giá bán rẻ bèo, sát nút để khỏi phải đóng thuế.', fit: 'letters' },
    { x: 71, y: 37, w: 21, h: 9, text: 'Ổng chỉ muốn tống quách đi cho xong chuyện.', fit: 'letters' }]);
  assert.ok(a.x + a.w <= b.x + 1e-9, 'no overlap left: ' + JSON.stringify([a, b]));
  assert.ok(Math.abs(a.x + a.w - (71 + 85) / 2) < 1e-9, 'split at the middle of the overlap');
  const [big, inner] = trim([{ x: 60, y: 70, w: 20, h: 12, text: 'Một câu khá dài nằm ở bong bóng lớn', fit: 'letters' }, { x: 62, y: 72, w: 6, h: 4, text: 'Ơ', fit: 'letters' }]);
  assert.deepEqual([big.h, inner.h], [12, 4], 'box inside another: not split');
}
console.log('overlap split OK');

// ---------- background: polish model, corrections, characters ----------
(async () => {
  let store = { provider: 'openai', keys: { openai: 'k' }, models: { openai: 'reader-m' }, polishModels: { openai: 'writer-m' }, polish: true, sfx: true }, listener;
  const local = { get: async (k) => (k === null ? { ...store } : Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]]))), set: async (o) => { Object.assign(store, o); }, remove: async () => {} };
  const seen = [];
  let lastPolishPrompt = '', polishDown = false; const polishPrompts = [];
  const c = { AbortSignal, crypto, TextEncoder, URL, setTimeout, clearTimeout, console, btoa,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      const isPolish = typeof body.messages[1].content === 'string'; // text-only call
      seen.push((isPolish ? 'polish:' : 'read:') + body.model);
      if (isPolish && polishDown) return { ok: false, status: 503, text: async () => 'busy', json: async () => ({}) };
      if (isPolish) lastPolishPrompt = body.messages[1].content;
      if (isPolish) polishPrompts.push(body.messages[1].content);
      const content = isPolish ? JSON.stringify({ lines: ['Ổng bán được bao nhiêu thế?'], glossary: '', names: [], chars: 'Roka: nam sinh ~16, con trai chủ núi' })
        : '{"bubbles":[{"box_2d":[100,100,300,300],"text":"Bố đã bán với giá bao nhiêu?","src":"¿Por cuánto la vendió?","who":"Roka → chú","sfx":false,"style":"","kind":"bubble"}]}';
      return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
    },
    chrome: { runtime: { onMessage: { addListener: (f) => (listener = f) }, onConnect: { addListener() {} } }, storage: { local } } };
  vm.createContext(c);
  vm.runInContext(R('manga-dich/background.js'), c);
  const call = (m) => new Promise((res) => listener(m, null, res));
  const site = 'mangadex.org/title/sangeki';

  const r1 = await call({ type: 'translate', data: 'P1', mime: 'image/jpeg', site, seriesLabel: 'Sangeki' });
  assert.deepEqual(seen, ['read:reader-m', 'polish:writer-m'], 'image read by the reader model, rewrite by the polish model: ' + seen);
  assert.ok(r1.key && r1.key.startsWith('c:'), 'translate returns its cache key');
  assert.equal(r1.bubbles[0].kind, 'bubble', 'kind survives parsing');
  let mem = (await call({ type: 'mem', site })).mem;
  assert.match(mem.chars, /Roka: nam sinh/, 'character list learned');

  // reader fixes a line: cache shows it, memory keeps it as an example the next prompt carries
  await call({ type: 'correct', site, key: r1.key, src: '¿Por cuánto la vendió?', ai: 'Ổng bán được bao nhiêu thế?', fix: 'Bố cháu bán được bao nhiêu thế ạ?' });
  const again = await call({ type: 'translate', data: 'P1', mime: 'image/jpeg', site });
  assert.equal(again.bubbles[0].text, 'Bố cháu bán được bao nhiêu thế ạ?', 'cached page shows the fix');
  // a fix on one piece of a line the page split over two bubbles changes only that piece in the cache
  await call({ type: 'correct', key: r1.key, src: '¿Por cuánto la vendió?', ai: 'bao nhiêu thế ạ?', fix: 'bao nhiêu vậy ạ?' });
  assert.equal((await call({ type: 'translate', data: 'P1', mime: 'image/jpeg', site })).bubbles[0].text, 'Bố cháu bán được bao nhiêu vậy ạ?', 'piece fix keeps the rest of the line');
  await call({ type: 'correct', key: r1.key, src: '¿Por cuánto la vendió?', ai: 'bao nhiêu vậy ạ?', fix: 'bao nhiêu thế ạ?' });
  mem = (await call({ type: 'mem', site })).mem;
  assert.equal(mem.examples.length, 1);
  await call({ type: 'translate', data: 'P2', mime: 'image/jpeg', site });
  assert.match(lastPolishPrompt, /BẠN ĐỌC ĐÃ SỬA[\s\S]*Bố cháu bán được bao nhiêu thế ạ\?/, 'next page learns from the fix');
  assert.match(lastPolishPrompt, /NHÂN VẬT[\s\S]*Roka/, 'next page knows the characters');

  // switching the polish model is a different cached result
  store.polishModels = { openai: 'other-writer' };
  seen.length = 0;
  await call({ type: 'translate', data: 'P1', mime: 'image/jpeg', site });
  assert.ok(seen.includes('polish:other-writer'), 'new polish model is not shadowed by the old cache');
  console.log('polish model + corrections + characters OK');

  // two pages of a new series read in parallel: polished one after the other, the second with what the first learnt
  polishPrompts.length = 0;
  await Promise.all([call({ type: 'translate', data: 'Q1', mime: 'image/jpeg', site: 'x/couple' }), call({ type: 'translate', data: 'Q2', mime: 'image/jpeg', site: 'x/couple' })]);
  assert.equal(polishPrompts.length, 2);
  assert.ok(!/NHÂN VẬT/.test(polishPrompts[0]) && /NHÂN VẬT[\s\S]*Roka: nam sinh/.test(polishPrompts[1]), 'second page polished after the first stored its characters');
  console.log('series polish order OK');

  // polish keeps failing (gateway down, tab reloaded mid-page): the page shows the read pass's lines,
  // and the next try only redoes the polish - the image is never sent twice
  const realRemove = local.remove;
  local.remove = async (ks) => { for (const k of [].concat(ks)) delete store[k]; };
  vm.runInContext('Q_RETRY_MS = 1', c);
  const drafts = () => Object.keys(store).filter((k) => k.startsWith('d:')).length, before = drafts();
  polishDown = true; seen.length = 0;
  const down = await call({ type: 'translate', data: 'P9', mime: 'image/jpeg', site });
  assert.ok(down.unpolished && down.bubbles[0].text === 'Bố đã bán với giá bao nhiêu?', 'draft shown instead of an error: ' + JSON.stringify(down));
  assert.equal(seen.filter((x) => x.startsWith('read:')).length, 1, 'image read once across all retries: ' + seen);
  polishDown = false; seen.length = 0;
  const up = await call({ type: 'translate', data: 'P9', mime: 'image/jpeg', site });
  assert.deepEqual(seen, ['polish:other-writer'], 'next visit: polish only, no image: ' + seen);
  assert.ok(!up.unpolished && drafts() === before, 'draft dropped once final is cached');
  local.remove = realRemove;
  console.log('draft reuse after errors OK');

  // UI wiring: every id the settings script uses exists
  const h = R('manga-dich/options.html');
  for (const [, id] of R('manga-dich/options.js').matchAll(/\$\('([\w-]+)'\)/g)) assert.ok(h.includes(`id="${id}"`), `options.html has #${id}`);
  const man = JSON.parse(R('manga-dich/manifest.json'));
  assert.ok(man.web_accessible_resources?.[0]?.resources.includes('fonts/*.ttf'), 'font is web accessible');
  for (const f of ['Mali-SemiBold.ttf', 'Mali-Bold.ttf', 'OFL.txt']) assert.ok(fs.existsSync(path.join(ROOT, 'manga-dich/fonts', f)), f);
  console.log('UI + font files OK');
  console.log('ALL v0.6 TESTS PASS');
})().catch((e) => { console.error(e); process.exit(1); });
