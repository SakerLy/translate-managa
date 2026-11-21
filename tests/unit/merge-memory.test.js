// v0.4 features: mergeBubbles (khử box trùng), site memory (học tích lũy), quota-reset retry,
// style hint sống sót qua parse, và separate() chống đè (content.js, chạy bằng vm với DOM giả).
//   node tests/unit/merge-memory.test.js
const ROOT = require('path').join(__dirname, '..', '..'); // repo root: .env, manga-dich/, tests/fixtures/
const fs = require('fs'), vm = require('vm'), assert = require('assert');

let store = {}, listener, replies = {};
const local = {
  get: async (k) => (k === null ? { ...store } : Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]]))),
  set: async (o) => { Object.assign(store, o); },
  remove: async (ks) => { for (const x of [].concat(ks)) delete store[x]; },
};
const ctx = {
  AbortSignal, crypto, TextEncoder, URL, setTimeout, clearTimeout, console,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  fetch: async (url) => { const k = Object.keys(replies).find((x) => url.startsWith(x)); return replies[k] || { ok: true, json: async () => ({}) }; },
  chrome: { runtime: { onMessage: { addListener: (f) => (listener = f) }, onConnect: { addListener() {} } }, storage: { local } },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/manga-dich/background.js', 'utf8'), ctx);
const call = (msg) => new Promise((res) => listener(msg, null, res));

(async () => {
  // ---------- mergeBubbles ----------
  const merge = vm.runInContext('mergeBubbles', ctx);
  // 1. trùng hoàn toàn (model trả 2 box cho 1 bubble): giữ 1, box nhỏ hơn thắng
  let out = merge([
    { x: 10, y: 10, w: 20, h: 20, text: 'Cậu đi đâu?' },
    { x: 8, y: 8, w: 24, h: 24, text: 'cậu đi đâu?' }, // same text sau normalize
  ]);
  assert.equal(out.length, 1, 'duplicate box merged');
  assert.equal(out[0].w, 20, 'tighter box wins');
  // 2. box khổng lồ ôm cả trang chứa box nhỏ (ảnh chụp lỗi thật): giữ text dài hơn
  out = merge([
    { x: 5, y: 3, w: 94, h: 95, text: 'Cả khung' },
    { x: 40, y: 40, w: 10, h: 10, text: 'Lời thoại dài hơn trong bong bóng' },
  ]);
  assert.equal(out.length, 1, 'nested box merged');
  assert.equal(out[0].text, 'Lời thoại dài hơn trong bong bóng', 'longer text wins');
  // 3. sfx flag được chuyển cho box còn lại khi merge
  out = merge([
    { x: 10, y: 10, w: 20, h: 20, text: 'RẦM!!' },
    { x: 12, y: 12, w: 16, h: 16, text: 'RẦM!!', sfx: true },
  ]);
  assert.equal(out.length, 1); assert.equal(out[0].sfx, true, 'sfx flag rides the merge');
  // 4. box kề nhau KHÔNG trùng: không merge (2 bubble thật)
  out = merge([
    { x: 10, y: 10, w: 20, h: 20, text: 'A' },
    { x: 35, y: 10, w: 20, h: 20, text: 'B' },
  ]);
  assert.equal(out.length, 2, 'distinct bubbles stay');
  // 5. style flag cũng chuyển qua merge
  out = merge([
    { x: 10, y: 10, w: 20, h: 20, text: 'ĐỪNG!' },
    { x: 11, y: 11, w: 18, h: 18, text: 'ĐỪNG!', style: 'shout' },
  ]);
  assert.equal(out[0].style, 'shout', 'style rides the merge');
  console.log('mergeBubbles OK');

  // ---------- style hint qua parseBubbles ----------
  const parse = vm.runInContext('parseBubbles', ctx);
  out = parse(JSON.stringify({ bubbles: [
    { box_2d: [100, 200, 300, 400], text: 'Ừ!', style: 'shout' },
    { box_2d: [400, 200, 450, 300], text: '(nghĩ thầm)', style: 'whisper' },
    { box_2d: [500, 200, 600, 300], text: 'giá trị lạ', style: 'wibble-wobble' }, // không hợp lệ -> bỏ
  ] }));
  assert.equal(out[0].style, 'shout'); assert.equal(out[1].style, 'whisper');
  assert.ok(!out[2].style, 'unknown style dropped');
  console.log('style hint parse OK');

  // ---------- quota reset retry: 503 "reset after 2s" -> ngủ rồi gọi lại, KHÔNG tốn try ----------
  {
    let n = 0;
    vm.runInContext('Q_RETRY_MS = 5', ctx); // test dùng backoff ngắn
    store = { provider: 'openai', keys: { openai: 'k' }, models: { openai: 'gpt-q' }, polish: false };
    const seen = [];
    ctx.fetch = async (url, init) => {
      n++; seen.push(n);
      if (n === 1) return { ok: false, status: 503, json: async () => ({ error: { message: '[X/y] You exceeded quota (reset after 1s)' } }) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"bubbles":[{"box_2d":[100,100,300,300],"text":"OK"}]}' } }] }) };
    };
    const t0 = Date.now();
    const r = await call({ type: 'translate', data: 'QUOTA', mime: 'image/jpeg' });
    const dt = Date.now() - t0;
    assert.equal(r.bubbles?.[0]?.text, 'OK', 'page translated after the quota sleep');
    assert.ok(dt >= 1000, `slept through the countdown (took ${dt}ms)`);
    assert.equal(n, 2, 'exactly one retry, served by the in-call sleep');
    // resetSeconds sanity: phút + giây, giới hạn 5 phút
    const rs = vm.runInContext('resetSeconds', ctx);
    assert.equal(rs('reset after 1m 50s'), 110);
    assert.equal(rs('reset after 30s'), 30);
    assert.equal(rs('reset after 2m'), 120);
    assert.equal(rs('reset after 999m'), 0, 'absurd waits ignored');
    assert.equal(rs('no countdown here'), 0);
  }
  console.log('quota reset retry OK');

  // ---------- site memory: học qua translate, dùng lại ở trang sau ----------
  {
    store = { provider: 'openai', keys: { openai: 'k' }, models: { openai: 'gpt-m' }, polish: true, sfx: true };
    let polishReply = { lines: ['Cậu đi đâu đấy?'], glossary: 'Iori ↔ bạn gái: Iori xưng tớ gọi cậu; bạn gái xưng cậu gọi Iori là tớ', names: ['Iori → Iori'] };
    ctx.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      const isPolish = !body.messages?.[1]?.content?.some?.((c) => c.type === 'image_url');
      if (isPolish) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(polishReply) } }] }) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ bubbles: [{ box_2d: [100, 100, 300, 300], text: 'Cậu đi đâu đấy?', src: 'IORI, BUENO, ¿ADÓNDE VAS? どこへ行くの？' }] }) } }] }) };
    };
    await call({ type: 'translate', data: 'M1', mime: 'image/jpeg', site: 'mangadex.org' });
    // memory đã lưu glossary + tên Iori
    const mem = (await call({ type: 'mem', site: 'mangadex.org' })).mem;
    assert.match(mem.glossary, /Iori ↔ bạn gái/, 'pronoun pair learned');
    assert.ok(mem.names.includes('Iori → Iori'), 'name learned from the polish pass: ' + mem.names);
    // all-caps scanlation words and plain CJK words are NOT names (old regex stored BUENO, どこへ行くの…)
    assert.ok(!mem.names.some((n) => /BUENO|ADÓNDE|どこ/.test(n)), 'plain words not stored as names: ' + mem.names);
    // site khác không thấy gì
    const other = (await call({ type: 'mem', site: 'other.site' })).mem;
    assert.equal(other.glossary, '', 'memory is per-site');
    // trang sau: prompt nhận BẢNG XƯNG HÔ + TÊN RIÊNG từ memory
    let pagePrompt = '';
    ctx.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      const isPolish = !body.messages?.[1]?.content?.some?.((c) => c.type === 'image_url');
      if (isPolish) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(polishReply) } }] }) };
      pagePrompt = body.messages[1].content.find((c) => c.type === 'text').text;
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ bubbles: [{ box_2d: [100, 100, 300, 300], text: 'Ừ', src: 'うん' }] }) } }] }) };
    };
    await call({ type: 'translate', data: 'M2', mime: 'image/jpeg', site: 'mangadex.org' });
    assert.match(pagePrompt, /BẢNG XƯNG HÔ/, 'next page prompt carries the learned glossary');
    assert.match(pagePrompt, /TÊN RIÊNG \(giữ đúng cách viết này\): .*Iori/, 'next page prompt carries the learned names');
    // reset
    await call({ type: 'mem-reset', site: 'mangadex.org' });
    assert.equal((await call({ type: 'mem', site: 'mangadex.org' })).mem.glossary, '', 'reset clears it');
    ctx.fetch = async () => ({ ok: true, json: async () => ({}) });
  }
  console.log('site memory OK');

  // ---------- content.js separate(): box chồng nhau được tách, DOM giả ----------
  {
    const cctx = {
      console, chrome: { runtime: { connect: () => ({}), sendMessage: async () => ({}) }, storage: { local: { get: async () => ({}), onChanged: { addListener() {} } } } },
      document: {
        head: { append() {} }, body: { append() {} },
        createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, toggle() {} }, append() {}, replaceChildren() {}, remove() {}, addEventListener() {} }),
        addEventListener() {},
      },
      location: { hostname: 'mangadex.org' },
      addEventListener() {}, setInterval() {}, alert() {},
      hasText: undefined, fitBubbles: undefined,
    };
    vm.createContext(cctx);
    // chỉ nạp hàm separate: bọc IIFE rồi expose
    const src = fs.readFileSync(ROOT + '/manga-dich/content.js', 'utf8');
    const fnSrc = src.match(/function separate\(list\) \{[\s\S]*?\n  \}/)[0];
    cctx.__separate = vm.runInContext(`(${fnSrc})`, cctx);
    // 2 box chồng nhau (như ảnh chụp lỗi: giao 35x170) -> tách ra không còn chồng
    const list = [
      { x: 20, y: 10, w: 40, h: 40, text: 'A' },
      { x: 40, y: 12, w: 35, h: 55, text: 'B' }, // chồng A
    ];
    const sep = cctx.__separate(list);
    const overlap = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    assert.ok(!overlap(sep[0], sep[1]), 'overlapping boxes pushed apart');
    assert.equal(sep[0].text, 'A'); assert.equal(sep[1].text, 'B', 'texts keep their identity');
    for (const b of sep) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 100 && b.y + b.h <= 100, 'stays inside the page');
    // 3 box chồng chéo nhau dây chuyền vẫn giải được
    const chain = [
      { x: 10, y: 10, w: 30, h: 30, text: 'A' },
      { x: 25, y: 25, w: 30, h: 30, text: 'B' },
      { x: 40, y: 40, w: 30, h: 30, text: 'C' },
    ];
    const sep3 = cctx.__separate(chain);
    assert.ok(!overlap(sep3[0], sep3[1]) && !overlap(sep3[1], sep3[2]) && !overlap(sep3[0], sep3[2]), 'chain fully separated');
    // box không chồng: giữ nguyên vị trí
    const apart = [{ x: 10, y: 10, w: 10, h: 10, text: 'A' }, { x: 50, y: 50, w: 10, h: 10, text: 'B' }];
    const sepA = cctx.__separate(apart.slice());
    assert.deepEqual([[sepA[0].x, sepA[0].y], [sepA[1].x, sepA[1].y]], [[10, 10], [50, 50]], 'non-overlapping untouched');
  }
  console.log('separate() OK');

  console.log('ALL v0.4 TESTS PASS');
  process.exitCode = 0;
  done = true;
})().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1; done = true; });
let done = false;
process.on('exit', () => { if (!done) { console.error('FAIL: exited before finishing'); process.exitCode = 1; } });
