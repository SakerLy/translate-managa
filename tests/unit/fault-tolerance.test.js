// v0.7.2: fault-tolerance fixes from an external fault-injection report (local Qwen2-VL-2B + mock gateway),
// each checked on the real background.js.   node tests/unit/fault-tolerance.test.js
const ROOT = require('path').join(__dirname, '..', '..'); // repo root: .env, manga-dich/, tests/fixtures/
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let listener, reply = null, calls = 0;
const store = { provider: 'custom', keys: { custom: 'k' }, bases: { custom: 'http://mock' }, models: { custom: 'm' }, polish: false, sfx: true };
const local = {
  get: async (k) => (k === null ? { ...store } : Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]]))),
  set: async (o) => { Object.assign(store, o); }, remove: async (ks) => { for (const x of [].concat(ks)) delete store[x]; },
};
const ctx = { btoa, AbortSignal, URL, crypto, TextEncoder, console, clearTimeout,
  setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 20)), // quota sleeps shortened
  fetch: async () => { calls++; return reply(calls); },
  chrome: { runtime: { onMessage: { addListener: (f) => (listener = f) }, onConnect: { addListener() {} } }, storage: { local } } };
vm.createContext(ctx);
vm.runInContext(R('manga-dich/background.js'), ctx);
vm.runInContext('Q_RETRY_MS = 1', ctx);
const call = (m) => new Promise((r) => listener(m, null, r));
const parse = vm.runInContext('parseBubbles', ctx), reset = vm.runInContext('resetSeconds', ctx);
const ok = (content) => ({ ok: true, json: async () => ({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
const err = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });
const B = (box, text) => ({ box_2d: box, text, sfx: false, style: '', kind: 'bubble' });
const J = (...b) => JSON.stringify({ bubbles: b });
let n = 0;

(async () => {
  // Bug 1: "Reset after" in any case and wording
  assert.equal(reset('Quota exceeded. Reset after 1m 50s'), 110);
  assert.equal(reset('quota exceeded. retry after 30s'), 30);
  // Groq per-minute cap without a countdown: wait the minute out (live: every polish of a page failed)
  assert.equal(reset('Request too large for model `qwen/qwen3.8-27b` on output tokens per minute (OTPM): Limit 1000, Requested 1260.'), 60);
  assert.equal(reset('500 internal error'), 0);
  assert.equal(reset('Generate content requests per day limit exceeded. Please retry in 17h27m17.32s.'), 0, 'daily cap: no wait');
  console.log('quota wording OK');

  // Bug 2: a quota that never clears costs the api() sleeps once, not again per queue retry
  reply = () => err(403, 'Quota exceeded. Reset after 0m 1s'); calls = 0;
  const q = await call({ type: 'translate', data: 'q' + n++, mime: 'image/jpeg' });
  assert.ok(q.error && calls === 3, 'persistent quota: ' + calls + ' calls (was 9)');
  console.log('no double sleep OK');

  // Bug 3: reasoning text or a sentence before the JSON
  const one = J(B([100, 100, 200, 300], 'Xin chào'));
  assert.equal(parse('<think>phân tích trang</think>\n' + one)[0].text, 'Xin chào');
  assert.equal(parse('Đây là kết quả:\n' + one)[0].text, 'Xin chào');
  assert.throws(() => parse('Quota exceeded, try later'), 'plain text without JSON still fails');
  console.log('think-tag / preamble OK');

  // F3: answer cut off mid-list: complete items survive
  const two = J(B([100, 100, 200, 300], 'Câu một'), B([400, 100, 500, 300], 'Câu hai bị cắt giữa chừng'));
  assert.deepEqual(parse(two.slice(0, -30)).map((b) => b.text), ['Câu một']);
  console.log('truncated JSON OK');

  // Bug 4: 12 lines on one spot are a broken answer: never merged into 1, the queue asks again
  const stacked = J(...Array.from({ length: 12 }, (_, i) => B([100, 50, 300, 500], 'Câu số ' + i)));
  assert.throws(() => parse(stacked), /cùng một chỗ/);
  const good = J(B([100, 100, 200, 300], 'Một'), B([400, 100, 500, 300], 'Hai'));
  reply = (c) => ok(c === 1 ? stacked : good); calls = 0;
  const s = await call({ type: 'translate', data: 's' + n++, mime: 'image/jpeg' });
  assert.deepEqual(s.bubbles.map((b) => b.text), ['Một', 'Hai'], 'retried into a usable answer');
  // two lines that really share one bubble's box are both kept
  assert.equal(parse(J(B([100, 100, 300, 400], 'Dòng A'), B([100, 100, 300, 400], 'Dòng B'), B([600, 100, 700, 300], 'Khác'))).length, 3);
  console.log('stacked boxes OK');

  // F6: one sentence in 3+ boxes kept once; short repeated SFX left alone
  const col = J(...Array.from({ length: 8 }, (_, i) => B([i * 120, 670, i * 120 + 110, 720], 'Cùng một câu lặp lại')));
  assert.equal(parse(col).length, 1);
  const sfx = J(...Array.from({ length: 4 }, (_, i) => B([i * 200, 100, i * 200 + 60, 200], 'Thịch')));
  assert.equal(parse(sfx).length, 4);
  console.log('repeated line OK');

  // F1: the instruction echoed back as a line is dropped (then the empty-page retry asks again)
  const echo = J({ ...B([50, 10, 240, 860], 'Đây là trang đầu tiên.'), style: 'narration', kind: 'box' });
  reply = (c) => ok(c === 1 ? echo : good); calls = 0;
  const e = await call({ type: 'translate', data: 'e' + n++, mime: 'image/jpeg' });
  assert.deepEqual(e.bubbles.map((b) => b.text), ['Một', 'Hai']);
  console.log('prompt echo OK');

  // a bubble holding only "!" gets no invented line ("Hả?!" drawn on a face, live 66dcdbac/8)
  reply = () => ok(J({ ...B([300, 100, 360, 140], 'Hả?!'), src: '!' }, { ...B([500, 200, 800, 700], 'Một'), src: 'One' })); calls = 0;
  const bang = await call({ type: 'translate', data: 'm' + n++, mime: 'image/jpeg' });
  assert.deepEqual(bang.bubbles.map((b) => b.text), ['Một']);
  // a recovery crop answers without src: "..." for a dotted bubble goes too
  reply = () => ok(J(B([300, 100, 360, 140], '...'), B([500, 200, 800, 700], 'Hai'))); calls = 0;
  const dots = await call({ type: 'translate', data: 'm' + n++, mime: 'image/jpeg' });
  assert.deepEqual(dots.bubbles.map((b) => b.text), ['Hai']);
  console.log('marks-only bubble OK');

  // F2: pixel coordinates rescaled with the page size the content script sends
  const pix = J(B([100, 100, 300, 400], 'A'), B([500, 200, 800, 700], 'B'), B([900, 100, 1080, 760], 'C'));
  const p = parse(pix, { w: 768, h: 1087 });
  assert.equal(p.length, 3, 'no line dropped');
  assert.ok(Math.abs(p[2].y - 900 / 1087 * 100) < 0.1 && Math.abs(p[2].x + p[2].w - 760 / 768 * 100) < 0.1, JSON.stringify(p[2]));
  assert.equal(parse(J(B([100, 100, 200, 300], 'x')), { w: 768, h: 1087 })[0].y, 10, '0-1000 answers untouched');
  console.log('pixel scale OK');
  // two text stacks in one box (two lobes of a cloud bubble, no outline between): one merged line is split
  {
    const f = {}; vm.createContext(f); vm.runInContext(R('manga-dich/fit.js'), f);
    const W = 500, H = 500, data = new Uint8ClampedArray(W * H * 4).fill(255);
    const ink = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; } };
    const line = (x0, y, n) => { for (let k = 0; k < n; k++) { const x = x0 + k * 13; ink(x, y, x + 2, y + 14); ink(x + 7, y, x + 9, y + 14); ink(x, y + 6, x + 9, y + 8); } };
    for (let r = 0; r < 4; r++) line(260, 100 + r * 20, 9); // first stack, upper right
    for (let r = 0; r < 3; r++) line(150, 190 + r * 20, 6); // second stack, lower left, barely under the first
    const out = f.fitBubbles({ width: W, height: H, data }, [{ x: 25, y: 15, w: 60, h: 40, text: 'Câu thứ nhất dài hơn. Câu thứ hai.', kind: 'bubble' }], false);
    assert.equal(out.length, 2, 'split per stack: ' + JSON.stringify(out.map((b) => b.text)));
    assert.equal(out.find((b) => b.x > 45).text, 'Câu thứ nhất dài hơn.');
    assert.equal(out.find((b) => b.x < 45).text, 'Câu thứ hai.');
    // a caption is never split this way
    assert.equal(f.fitBubbles({ width: W, height: H, data }, [{ x: 25, y: 15, w: 60, h: 40, text: 'Một. Hai.', kind: 'box' }], false).length, 1);
  }
  console.log('two-lobe bubble OK');
  // GPT placement: half the answer swapped x/y, a box aimed at another box's lettering, and a box no pixel can
  // judge (a logo) at the end of the answer, after the swapped ones (live GPT pages 66dcdbac/8, aa77c143/4)
  {
    const f = {}; vm.createContext(f); vm.runInContext(R('manga-dich/fit.js'), f);
    const W = 600, H = 600, data = new Uint8ClampedArray(W * H * 4).fill(255);
    const ink = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; } };
    const block = (x0, y0) => { for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) { const x = x0 + k * 13, y = y0 + r * 20; ink(x, y, x + 2, y + 14); ink(x + 7, y, x + 9, y + 14); ink(x, y + 6, x + 9, y + 8); } };
    block(60, 60); block(60, 250); block(380, 100); block(240, 420); // A, B, C, D (C, D come back swapped)
    const B = (x, y, w, h, src, kind = 'bubble') => ({ x, y, w, h, text: src, src, kind });
    const out = f.fitBubbles({ width: W, height: H, data }, [
      B(9, 9, 17, 11, 'A'), B(4, 2, 32, 24, 'F aimed at A'), B(9, 40, 17, 11, 'B'),
      B(16, 62, 11, 17, 'C'), B(69, 39, 11, 17, 'D'), // [x, y] instead of [y, x]
      B(85, 40, 4, 20, '異世界', 'box'), // blank on both sides: follows the swapped run before it
    ], false);
    const at = (s) => out.find((b) => b.src === s);
    assert.ok(at('C').swap && Math.abs(at('C').x - 63) < 6 && Math.abs(at('C').y - 17) < 6, 'C swapped back: ' + JSON.stringify(at('C')));
    assert.ok(at('D').swap && Math.abs(at('D').x - 40) < 6 && Math.abs(at('D').y - 70) < 6, 'D swapped back: ' + JSON.stringify(at('D')));
    assert.ok(at('異世界').swap, 'undecided box follows its swapped neighbours');
    assert.equal(at('F aimed at A').fit, 'kept', 'a box on lettering another box fits better is unverified');
    assert.ok(!at('A').swap && at('A').fit !== 'kept', 'correct boxes stay');
  }
  console.log('GPT swapped run + misplaced box OK');
  // series name: from the tab title on a reader page, never an id, never a card's glued tags
  {
    const sc = {}; vm.createContext(sc); vm.runInContext(R('manga-dich/series.js'), sc);
    const ser = vm.runInContext('mdSeries', sc);
    const link = (href, text, title = '') => ({ getAttribute: (k) => (k === 'href' ? href : k === 'title' ? title : null), textContent: text });
    const doc = (title, links) => ({ title, querySelectorAll: () => links });
    const loc = (path) => ({ hostname: 'mangadex.org', pathname: path });
    const id = '16dcfceb-4382-45f1-adb0-d57fc5ea0d06';
    let r = ser(loc('/chapter/abc/7'), doc('7 | Chapter 6 - Sangeki - MangaDex', [link('/title/' + id, ''), link('/title/' + id, '')]));
    assert.equal(r.key, 'mangadex.org/title/' + id);
    assert.equal(r.label, 'Sangeki', 'tab title, not the id');
    r = ser(loc('/title/' + id), doc('MangaDex', [link('/title/' + id + '/oneesan', 'Oneesan-ha no Ore ga Naze Chicchai Kimi o Suki ni Natta no ka?SuggestiveComedyRomanceSlice of LifeDuring the Spring break'), link('/title/' + id + '/oneesan', 'Oneesan-ha no Ore ga Naze Chicchai Kimi o Suki ni Natta no ka?')]));
    assert.equal(r.label, 'Oneesan-ha no Ore ga Naze Chicchai Kimi o Suki ni Natta no ka?', 'shortest clean link text: ' + r.label);
    r = ser(loc('/chapter/abc/1'), doc('', [link('/title/' + id, id)]));
    assert.notEqual(r.label, id, 'an id is never a name');
  }
  console.log('series name OK');

  // memory merges: a page that returns only its own pairs/characters keeps the earlier ones
  {
    const learn = vm.runInContext('learnFromPage', ctx), load = vm.runInContext('loadMem', ctx);
    await learn('t/merge', { glossary: 'Ken ↔ Mio (anh em): Ken xưng anh gọi Mio là em', names: ['Ken'], chars: 'Ken: nam, 17' }, 'Mio ↔ Yui (bạn): Mio xưng tớ gọi Yui là cậu', ['Yui'], 'Yui: nữ, 16');
    let m = await load('t/merge');
    assert.ok(/Ken ↔ Mio/.test(m.glossary) && /Mio ↔ Yui/.test(m.glossary), 'old pair kept: ' + m.glossary);
    assert.ok(/Ken: nam/.test(m.chars) && /Yui: nữ/.test(m.chars), 'old character kept: ' + m.chars);
    await learn('t/merge', m, 'BẢNG XƯNG HÔ:\nKen ↔ Mio (anh em): Ken xưng anh hai gọi Mio là em', [], 'Ken: nam, 17, anh trai Mio');
    m = await load('t/merge');
    assert.equal(m.glossary.split('\n').length, 2, 'same pair replaced, header dropped: ' + m.glossary);
    assert.ok(/anh hai/.test(m.glossary) && /anh trai Mio/.test(m.chars));
    // a name learnt later replaces the generic role (live 66dcdbac/10: "Thầy giáo" -> "Akasumi Goro (thầy giáo)")
    await learn('t/alias', { glossary: 'Ninose Ema ↔ thầy giáo (cựu học sinh ↔ thầy): Ema xưng em gọi thầy', chars: 'Ninose Ema: nữ, 25\nThầy giáo: nam, từng dạy Ema' },
      null, [], 'Akasumi Goro (thầy giáo): nam, 23 tuổi trong hồi tưởng');
    m = await load('t/alias');
    assert.ok(/^Ninose Ema ↔ Akasumi Goro \(cựu học sinh ↔ thầy\): Ema xưng em/.test(m.glossary), 'pair renamed: ' + m.glossary);
    assert.ok(!/^Thầy giáo:/m.test(m.chars) && /Akasumi Goro \(thầy giáo\)/.test(m.chars) && /Ninose Ema: nữ/.test(m.chars), 'generic row replaced: ' + m.chars);
  }
  console.log('memory merge OK');
  // a series memory saved without a name gets it from any page of the series, cached ones included
  {
    store['mem:t/named'] = { label: '', glossary: 'A ↔ B: x', names: [], notes: [], chars: '', examples: [] };
    reply = () => ok(J(B([100, 100, 200, 300], 'Một'))); calls = 0;
    await call({ type: 'translate', data: 'named-page', mime: 'image/jpeg', site: 't/named', seriesLabel: 'Batsu-Hare' });
    store['mem:t/named'].label = '';
    await call({ type: 'translate', data: 'named-page', mime: 'image/jpeg', site: 't/named', seriesLabel: 'Batsu-Hare' }); // cache hit
    assert.equal(store['mem:t/named'].label, 'Batsu-Hare');
    assert.equal(store['mem:t/named'].glossary, 'A ↔ B: x', 'nothing else touched');
  }
  console.log('series name on cached pages OK');

  // moving a translation: kept for the page, and a consistent offset is learnt per model
  {
    store.provider = 'custom'; store.models = { custom: 'm' };
    reply = () => ok(J(B([100, 100, 200, 300], 'Câu A'), B([500, 100, 600, 300], 'Câu B')));
    const first = await call({ type: 'translate', data: 'mv-1', mime: 'image/jpeg' });
    await call({ type: 'move', key: first.key, text: 'Câu A', box: [10, 13, 20, 10] }); // model had y 10..20 -> centre 15 ; moved to 13..23 -> 18
    const again = await call({ type: 'translate', data: 'mv-1', mime: 'image/jpeg' });
    assert.deepEqual(again.moves["câua"], [10, 13, 20, 10], 'the spot comes back with the cached page');
    // three more pages corrected the same way: the model's boxes sit 3% too high
    for (const k of ['mv-2', 'mv-3', 'mv-4']) {
      const r = await call({ type: 'translate', data: k, mime: 'image/jpeg' });
      await call({ type: 'move', key: r.key, text: 'Câu B', box: [10, 53, 20, 10] });
    }
    const learnt = await call({ type: 'translate', data: 'mv-5', mime: 'image/jpeg' });
    assert.ok(Math.abs(learnt.bubbles[0].y - 13) < 0.01, 'new page shifted by the learnt offset: ' + learnt.bubbles[0].y);
    assert.ok(Math.abs(learnt.bubbles[0].x - 10) < 0.01, 'no horizontal offset was learnt');
  }
  console.log('move + learnt placement OK');
  console.log('ALL v0.7 TESTS PASS');
})().catch((e) => { console.error(e); process.exit(1); });
