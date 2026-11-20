// Đo hiệu năng pipeline: thời gian tới BẢN NHÁP (bước 1) vs BẢN CHỐT (sau polish)
// qua code THẬT của background.js với fetch mock có độ trễ giống model thật.
const ROOT = require('path').join(__dirname, '..', '..'); // repo root: .env, manga-dich/, tests/fixtures/
const fs = require('fs'), vm = require('vm'), assert = require('assert');

const store = {};
const local = {
  get: async (k) => (k === null ? { ...store } : Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]]))),
  set: async (o) => { Object.assign(store, o); },
  remove: async (ks) => { for (const x of [].concat(ks)) delete store[x]; },
};
const DELAY = { page: 6000, polish: 2500 }; // ms, theo đo thật glm-4.6v: page ~6s, polish ~2.5s
let nPage = 0, nPolish = 0;
const ctx = {
  AbortSignal, crypto, TextEncoder, URL, setTimeout, clearTimeout,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    const isPolish = !body.messages?.[1]?.content?.some?.((c) => c.type === 'image_url');
    const d = isPolish ? DELAY.polish : DELAY.page;
    await new Promise((r) => setTimeout(r, d));
    if (isPolish) {
      nPolish++;
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"lines":["Cậu đi đâu đấy?","Ừ!"],"glossary":"A ↔ B: tớ/cậu"}' } }] }) };
    }
    nPage++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"bubbles":[{"box_2d":[100,200,300,400],"text":"Bạn đi đâu?"},{"box_2d":[200,100,600,400],"text":"Vâng!"}]}' } }] }) };
  },
  chrome: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } }, storage: { local } },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/manga-dich/background.js', 'utf8'), ctx);

const translate = vm.runInContext('translate', ctx);
store.provider = 'openrouter'; store.keys = { openrouter: 'k' }; store.models = { openrouter: 'x' };

(async () => {
  // without draft callback (old behaviour): one await for the whole thing
  const t0 = Date.now();
  const res = await translate({ data: 'PERF1', mime: 'image/jpeg' });
  const finalMs = Date.now() - t0;
  assert.equal(res.bubbles[0].text, 'Cậu đi đâu đấy?');

  // with draft callback (new): draft should arrive ~page-delay, final ~page+polish
  const t1 = Date.now();
  let draftMs = null;
  const res2 = await translate({
    data: 'PERF2', mime: 'image/jpeg',
    onDraft: (b) => { if (draftMs === null) draftMs = Date.now() - t1; },
  });
  const finalMs2 = Date.now() - t1;
  console.log(`trang 1 lệnh gọi: nháp sau ${draftMs}ms, cuối cùng sau ${finalMs2}ms (page=${DELAY.page}ms, polish=${DELAY.polish}ms)`);
  console.log(`tổng lệnh gọi API: page=${nPage}, polish=${nPolish}`);
  assert.ok(draftMs !== null && draftMs < DELAY.page + 800, 'draft arrives after the read pass only');
  assert.ok(finalMs2 >= DELAY.page + DELAY.polish - 500, 'final result waits for polish');
  console.log('OK - bản nháp tới trước bản cuối đúng như thiết kế');
})();
