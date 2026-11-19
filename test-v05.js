// v0.5: placement repair (axis swap, blind boxes re-homed to real text, missed-text finder),
// strict-schema shape, kinship/genre prompt rules, popup/options/background API handshake.
//   node test-v05.js
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// ---------- synthetic page: white paper, 3 oval bubbles with "letters" (small black bars) ----------
const W = 600, H = 900;
const data = new Uint8ClampedArray(W * H * 4).fill(255);
const ink = (x0, y0, x1, y1, v = 0) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; } };
// hatching art band (grey, many strokes) so not everything is clean paper
for (let y = 600; y < 900; y += 6) ink(0, y, W, y + 2, 90);
const BUBBLES = [ // text block [x0,y0,x1,y1] in px; each gets an outline ring around it
  [60, 60, 200, 140], [380, 90, 540, 170], [120, 380, 300, 470],
];
for (const [x0, y0, x1, y1] of BUBBLES) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + 30, ry = (y1 - y0) / 2 + 30;
  for (let a = 0; a < 6.283; a += 0.002) { const x = Math.round(cx + rx * Math.cos(a)), y = Math.round(cy + ry * Math.sin(a)); ink(x - 1, y - 1, x + 2, y + 2); }
  for (let y = y0; y + 14 <= y1; y += 22) for (let x = x0; x + 9 <= x1; x += 14) { ink(x, y, x + 2, y + 14); ink(x + 7, y, x + 9, y + 14); ink(x, y + 6, x + 9, y + 8); } // "H" letters 9x14: strokes, not solid blocks
}
const px = { width: W, height: H, data };
const pct = ([x0, y0, x1, y1]) => ({ x: x0 / W * 100, y: y0 / H * 100, w: (x1 - x0) / W * 100, h: (y1 - y0) / H * 100 });
const hits = (b, [x0, y0, x1, y1]) => { const cx = (b.x + b.w / 2) / 100 * W, cy = (b.y + b.h / 2) / 100 * H; return cx > x0 && cx < x1 && cy > y0 && cy < y1; };

const fctx = {}; vm.createContext(fctx);
vm.runInContext(R('manga-dich/fit.js'), fctx);
const fit = vm.runInContext('fitBubbles', fctx), blocks = vm.runInContext('textBlocks', fctx);

// textBlocks finds each bubble's text and nothing in the hatching
{
  const tb = blocks(px);
  for (const b of BUBBLES) assert.ok(tb.some((t) => hits(t, b)), 'block found for ' + b);
  assert.equal(tb.length, BUBBLES.length, 'no false blocks in hatching: ' + JSON.stringify(tb));
}
console.log('textBlocks OK');

// whole answer in [x,y] order instead of [y,x]: every box swapped back onto its text
{
  const swapped = BUBBLES.map((b, i) => { const p = pct(b); return { x: p.y, y: p.x, w: p.h, h: p.w, text: 'T' + i }; });
  const out = fit(px, swapped);
  BUBBLES.forEach((b, i) => assert.ok(hits(out.find((o) => o.text === 'T' + i), b), 'swapped box ' + i + ' repaired'));
}
console.log('axis swap OK');

// night page (real report): black scene full of white leaves of every size, ONE white bubble bottom-left,
// the model's box at its mirror spot top-right. The leaves must not count as letters; the box goes home.
{
  const NW = 700, NH = 900, d = new Uint8ClampedArray(NW * NH * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 30; d[i + 3] = 255; }
  const paint = (x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * NW + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; } };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 160; k++) { const x = (rnd() * (NW - 60)) | 0, y = (rnd() * (NH - 60)) | 0, w = 2 + (rnd() * 40) | 0, h = 2 + (rnd() * 40) | 0; paint(x, y, x + w, y + h, 235); }
  const T = [120, 640, 230, 700]; // text block of the bubble (bottom-left)
  paint(T[0] - 40, T[1] - 50, T[2] + 40, T[3] + 50, 255); // the white bubble
  for (let y = T[1]; y + 14 <= T[3]; y += 22) for (let x = T[0]; x + 9 <= T[2]; x += 14) { paint(x, y, x + 2, y + 14, 0); paint(x + 7, y, x + 9, y + 14, 0); paint(x, y + 6, x + 9, y + 8, 0); }
  const p = { x: T[0] / NW * 100, y: T[1] / NH * 100, w: (T[2] - T[0]) / NW * 100, h: (T[3] - T[1]) / NH * 100 };
  const out = fit({ width: NW, height: NH, data: d }, [{ x: p.y, y: p.x, w: p.h, h: p.w, text: 'Thôi, tớ đi đây.' }]);
  const b = out[0], cx = (b.x + b.w / 2) / 100 * NW, cy = (b.y + b.h / 2) / 100 * NH;
  assert.ok(cx > T[0] && cx < T[2] && cy > T[1] && cy < T[3], `night page: box back on the bubble (got centre ${cx | 0},${cy | 0})`);
}
console.log('night-page swap OK');

// good boxes stay; a box drawn too wide shrinks to its bubble instead of spilling over the page
{
  const p = pct(BUBBLES[0]);
  const out = fit(px, [{ ...p, x: p.x - 8, w: p.w + 30, text: 'wide' }]);
  assert.ok(hits(out[0], BUBBLES[0]), 'still on its bubble');
  assert.ok(out[0].w < p.w + 12, 'shrunk from ' + (p.w + 30).toFixed(1) + '% to ' + out[0].w.toFixed(1) + '%');
}
console.log('wide box shrink OK');

// a box on artwork with no text under it is re-homed to the free text block; a giant blind box is dropped
{
  const good = [pct(BUBBLES[0]), pct(BUBBLES[1])].map((p, i) => ({ ...p, text: 'G' + i }));
  const blind = { x: 30, y: 58, w: 20, h: 8, text: 'blind' }; // on the hatching, bubble 3 left uncovered
  const out = fit(px, [...good, blind]);
  assert.ok(hits(out.find((o) => o.text === 'blind'), BUBBLES[2]), 'blind box moved onto the uncovered bubble');
  const giant = fit(px, [...good, { ...pct(BUBBLES[2]), text: 'G2' }, { x: 2, y: 66, w: 90, h: 30, text: 'giant' }]);
  assert.ok(!giant.some((o) => o.text === 'giant'), 'giant blind box dropped');
}
console.log('anchor to text OK');

// ---------- background: schema + prompts ----------
const bctx = { AbortSignal, crypto, TextEncoder, URL, setTimeout, clearTimeout, console, btoa,
  chrome: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } }, storage: { local: { get: async () => ({}), set: async () => {} } } } };
vm.createContext(bctx);
vm.runInContext(R('manga-dich/background.js'), bctx);
{
  // OpenAI strict json_schema rejects any property missing from "required" (real 400 via OpenRouter)
  for (const withSrc of [false, true]) {
    const item = vm.runInContext(`pageJob(${withSrc})`, bctx).schema.properties.bubbles.items;
    assert.deepEqual(Object.keys(item.properties).sort(), [...item.required].sort(), 'every property required, withSrc=' + withSrc);
  }
  const polish = vm.runInContext('POLISH_JOB', bctx).schema;
  assert.deepEqual(Object.keys(polish.properties).sort(), [...polish.required].sort(), 'polish schema strict-complete');
}
console.log('strict schema OK');
{
  const sys = vm.runInContext('SYSTEM', bctx), pol = vm.runInContext('POLISH_SYSTEM', bctx);
  for (const k of ['anh trai↔em gái', 'chị gái↔em trai', 'ông bà↔cháu']) assert.ok(sys.includes(k), 'page prompt: ' + k);
  for (const k of ['Họ hàng', 'cậu (anh/em trai mẹ)', 'senpai', 'Samurai', 'お兄ちゃん', '俺', 'hermano', 'TUỔI QUYẾT ĐỊNH', 'VĂN PHONG MANGA']) assert.ok(pol.includes(k), 'polish prompt: ' + k);
  for (const k of ['manga', 'Tây Ban Nha', 'Indonesia', 'Tanaka-san']) assert.ok(sys.includes(k), 'manga + scanlation languages: ' + k);
  // the repo is manga-only: no manhwa/manhua rules left to confuse the model
  for (const k of [/manhwa/i, /manhua/i, /webtoon/i, /HÁN VIỆT/, /오빠/, /哥哥/]) assert.ok(!k.test(sys + pol), 'no non-manga rule: ' + k);
}
console.log('prompt rules OK');

// ---------- cancel: a queued page is dropped without an API call, the waiter answers at once ----------
(async () => {
  let store = { provider: 'openai', keys: { openai: 'k' }, models: { openai: 'm' }, polish: false, sfx: true }, listener, calls = 0;
  const local = { get: async (k) => (k === null ? { ...store } : Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]]))), set: async (o) => { Object.assign(store, o); }, remove: async () => {} };
  const c = { AbortSignal, crypto, TextEncoder, URL, setTimeout, clearTimeout, console, btoa,
    fetch: async () => { calls++; await new Promise((r) => setTimeout(r, 1500)); return { ok: true, json: async () => ({ choices: [{ message: { content: '{"bubbles":[{"box_2d":[100,100,300,300],"text":"Ừ","sfx":false,"style":""}]}' } }] }) }; },
    chrome: { runtime: { onMessage: { addListener: (f) => (listener = f) }, onConnect: { addListener() {} } }, storage: { local } } };
  vm.createContext(c);
  vm.runInContext(R('manga-dich/background.js'), c);
  const call = (m) => new Promise((res) => listener(m, null, res));
  const ask = (d) => call({ type: 'translate', data: d, mime: 'image/jpeg', draftPort: 'tag-' + d });
  const pages = [ask('P1'), ask('P2')];
  await new Promise((r) => setTimeout(r, 100)); // QMAX=2: P1, P2 take both slots…
  pages.push(ask('P3'));
  await new Promise((r) => setTimeout(r, 100)); // …so P3 waits in the queue
  const t0 = Date.now();
  const res = await call({ type: 'cancel', tag: 'tag-P3' });
  assert.equal(res.cancelled, 1, 'one waiter cancelled');
  const p3 = await pages[2];
  assert.equal(p3.error, 'Đã huỷ', 'cancelled page answers with Đã huỷ');
  assert.ok(Date.now() - t0 < 200, 'answered immediately, not after the running calls');
  const [p1, p2] = await Promise.all(pages.slice(0, 2));
  assert.equal(p1.bubbles[0].text, 'Ừ'); assert.equal(p2.bubbles[0].text, 'Ừ');
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(calls, 2, 'the cancelled page never reached the API');
  console.log('cancel OK');
})().then(() => {
// ---------- memory per series: two series on one site never share a glossary ----------
}).then(async () => {
  const sctx = { decodeURIComponent }; vm.createContext(sctx);
  vm.runInContext(R('manga-dich/series.js'), sctx);
  const ser = vm.runInContext('mdSeries', sctx);
  const doc = (links) => ({ querySelectorAll: () => links.map(([h, t]) => ({ getAttribute: () => h, textContent: t })) });
  const at = (u, links = []) => { const x = new URL(u); return ser({ hostname: x.hostname, pathname: x.pathname }, doc(links)); };
  // MangaDex: chapter URL has no series; the reader's own /title/<uuid> link (most frequent, not "random") decides
  const kaoru = ['/title/418791c0-35cf-4f87-936b-acd9cddf0989/kaoru-hana-wa-rin-to-saku', 'Kaoru Hana wa Rin to Saku'];
  const md = at('https://mangadex.org/chapter/8de3aa89-841d-4fe0-8ecd-072ed9efdde9/4', [['/title/random', 'Random'], kaoru, kaoru]);
  assert.deepEqual({ ...md }, { key: 'mangadex.org/title/418791c0-35cf-4f87-936b-acd9cddf0989', label: 'Kaoru Hana wa Rin to Saku' });
  assert.equal(at('https://www.example.com/manga/one-piece/chapter-1000').key, 'example.com/manga/one-piece');
  assert.equal(at('https://example.com/manga/one-piece/chapter-1001').key, at('https://example.com/manga/one-piece/chapter-1000').key, 'same series, any chapter');
  assert.equal(at('https://example.com/one-piece-chapter-1000.html').key, 'example.com/one-piece');
  assert.equal(at('https://example.com/read/frieren/45').label, 'frieren');
  assert.equal(at('https://example.com/chapter/12345').key, 'example.com', 'unknown series: whole site, like before');

  let store = { provider: 'openai', keys: { openai: 'k' }, models: { openai: 'm' }, polish: true, sfx: true }, listener;
  const local = { get: async (k) => (k === null ? { ...store } : Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]]))), set: async (o) => { Object.assign(store, o); }, remove: async () => {} };
  let reply = '';
  const c = { AbortSignal, crypto, TextEncoder, URL, setTimeout, clearTimeout, console, btoa,
    fetch: async (url, init) => {
      const isPolish = !JSON.parse(init.body).messages[1].content.some((x) => x.type === 'image_url');
      const content = isPolish ? JSON.stringify({ lines: ['Ừ'], glossary: reply, names: [] })
        : '{"bubbles":[{"box_2d":[100,100,300,300],"text":"Ừ","src":"うん","who":"","sfx":false,"style":""}]}';
      return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
    },
    chrome: { runtime: { onMessage: { addListener: (f) => (listener = f) }, onConnect: { addListener() {} } }, storage: { local } } };
  vm.createContext(c);
  vm.runInContext(R('manga-dich/background.js'), c);
  const call = (m) => new Promise((res) => listener(m, null, res));
  reply = 'Ken ↔ Mio (anh trai ↔ em gái): Ken xưng anh gọi Mio là em';
  await call({ type: 'translate', data: 'A1', mime: 'image/jpeg', site: 'mangadex.org/title/aaa', seriesLabel: 'Series A' });
  reply = 'Sora ↔ cô giáo (học sinh ↔ giáo viên): Sora xưng em gọi cô';
  await call({ type: 'translate', data: 'B1', mime: 'image/jpeg', site: 'mangadex.org/title/bbb', seriesLabel: 'Series B' });
  const a = (await call({ type: 'mem', site: 'mangadex.org/title/aaa' })).mem, b = (await call({ type: 'mem', site: 'mangadex.org/title/bbb' })).mem;
  assert.match(a.glossary, /Ken ↔ Mio/); assert.doesNotMatch(a.glossary, /Sora/, 'series A untouched by series B');
  assert.match(b.glossary, /Sora/); assert.doesNotMatch(b.glossary, /Ken/, 'series B starts clean');
  assert.equal(a.label, 'Series A', 'series name kept for the settings page');
  const { sites } = await call({ type: 'mem-list' });
  assert.deepEqual(sites.map((s) => s.label).sort(), ['Series A', 'Series B']);
  await call({ type: 'mem-reset', site: 'mangadex.org/title/aaa' });
  const reset = (await call({ type: 'mem', site: 'mangadex.org/title/aaa' })).mem;
  assert.equal(reset.glossary, ''); assert.equal(reset.label, 'Series A', 'reset keeps the name');
  console.log('memory per series OK');
}).then(() => {
// ---------- UI handshake: popup, options and worker agree on the message API ----------
{
  const api = +R('manga-dich/background.js').match(/const API = (\d+)/)[1];
  assert.equal(+R('manga-dich/popup.js').match(/POPUP_API = (\d+)/)[1], api, 'popup API');
  assert.equal(+R('manga-dich/options.js').match(/const API = (\d+)/)[1], api, 'options API');
  const man = JSON.parse(R('manga-dich/manifest.json'));
  assert.equal(man.options_ui.page, 'options.html');
  assert.ok(man.commands['translate-tab'], 'keyboard shortcut declared');
  for (const f of ['options.html', 'options.js', 'popup.html', 'popup.js', 'ui.css']) assert.ok(fs.existsSync(path.join(__dirname, 'manga-dich', f)), f);
  // every id the scripts look up exists in their page
  for (const [html, js] of [['popup.html', 'popup.js'], ['options.html', 'options.js']]) {
    const h = R('manga-dich/' + html);
    for (const [, id] of R('manga-dich/' + js).matchAll(/\$\('([\w-]+)'\)/g)) assert.ok(h.includes(`id="${id}"`), `${html} has #${id}`);
  }
}
console.log('UI handshake OK');
}).then(() => {
console.log('ALL v0.5 TESTS PASS');
}).catch((e) => { console.error(e); process.exit(1); });
