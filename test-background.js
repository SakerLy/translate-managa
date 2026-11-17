// Run: node test-background.js  — loads background.js with fake chrome/fetch and checks model lists + parsing.
const fs = require('fs'), vm = require('vm'), assert = require('assert');

let replies = {}, store = {}, listener, fetches = 0;
// behaves like chrome.storage.local: get(null|key|keys), set, remove
const local = {
  get: async (k) => (k === null ? { ...store } : Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]]))),
  set: async (o) => { Object.assign(store, o); },
  remove: async (ks) => { for (const x of [].concat(ks)) delete store[x]; },
};
const ctx = {
  AbortSignal, crypto, TextEncoder,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  fetch: async (url) => {
    fetches++;
    const key = Object.keys(replies).find((k) => url.startsWith(k));
    return { ok: true, json: async () => replies[key] };
  },
  chrome: { runtime: { onMessage: { addListener: (f) => (listener = f) } }, storage: { local } },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/manga-dich/background.js', 'utf8'), ctx);
const call = (msg) => new Promise((res) => listener(msg, null, res));

(async () => {
  const buf = Buffer.alloc(100000).map((_, i) => i * 7);
  assert.equal(ctx.b64(buf), buf.toString('base64'));

  replies = { 'https://api.openai.com/v1/models': { data: [
    { id: 'gpt-4o', created: 1 }, { id: 'gpt-9', created: 9 }, { id: 'gpt-9-realtime', created: 10 },
    { id: 'text-embedding-3', created: 11 }, { id: 'o5', created: 5 }, { id: 'gpt-9-pro', created: 12 },
  ] } };
  assert.deepEqual((await call({ type: 'models', provider: 'openai', key: 'k' })).list, ['gpt-9-pro', 'gpt-9', 'o5', 'gpt-4o']);

  replies = { 'https://generativelanguage.googleapis.com': { models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-pro-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ] } };
  assert.deepEqual((await call({ type: 'models', provider: 'gemini', key: 'k' })).list,
    ['gemini-3-pro', 'gemini-3-pro-image', 'gemini-2.5-flash', 'gemini-flash-latest']);

  const cap = (img, so) => ({ image_input: { supported: img }, structured_outputs: { supported: so } });
  replies = { 'https://api.anthropic.com/v1/models': { data: [
    { id: 'claude-opus-5-5', capabilities: cap(true, true) }, { id: 'claude-old', capabilities: cap(true, false) },
  ] } };
  assert.deepEqual((await call({ type: 'models', provider: 'anthropic', key: 'k' })).list, ['claude-opus-5-5']);

  // OpenRouter against its real public model list, if downloaded (curl https://openrouter.ai/api/v1/models -o or-models.json)
  const orFile = process.env.TEMP + '/or-models.json';
  if (fs.existsSync(orFile)) {
    replies = { 'https://openrouter.ai/api/v1/models': JSON.parse(fs.readFileSync(orFile, 'utf8')) };
    const list = (await call({ type: 'models', provider: 'openrouter', key: 'k' })).list;
    const byId = Object.fromEntries(replies['https://openrouter.ai/api/v1/models'].data.map((m) => [m.id, m]));
    assert.ok(list.length > 0);
    for (const id of list) {
      assert.ok(byId[id].architecture.input_modalities.includes('image'), id);
      assert.ok(byId[id].supported_parameters.includes('structured_outputs'), id);
    }
    for (let i = 1; i < list.length; i++) assert.ok(byId[list[i - 1]].created >= byId[list[i]].created);
    console.log('openrouter real list:', list.length, 'models, newest:', list[0]);
  }

  // translate path: fenced JSON from an OpenAI-compatible model still parses
  store = { provider: 'openrouter', keys: { openrouter: 'k' }, models: { openrouter: 'x/y' } };
  replies = { 'https://openrouter.ai': { choices: [{ message: { content: '```json\n{"bubbles":[{"box_2d":[20,10,60,40],"text":"Chào"}]}\n```' } }] } };
  assert.deepEqual({ ...(await call({ type: 'translate', data: 'AA', mime: 'image/jpeg' })).bubbles[0] }, { x: 1, y: 2, w: 3, h: 4, text: 'Chào' });

  // box_2d conversion: swapped corners fixed, out-of-range clamped, malformed dropped
  const parse = vm.runInContext('parseBubbles', ctx);
  const out = parse(JSON.stringify({ bubbles: [
    { box_2d: [600, 900, 500, 1005], text: 'a' }, // ymax<ymin, xmax slightly >1000 (clamped)
    { box_2d: [1, 2, 3], text: 'b' }, // 3 numbers
    { box_2d: [100, 100, 100, 200], text: 'c' }, // zero height
    { box_2d: [0, 0, 1000, 1000], text: '' }, // no text
    { box_2d: [0, 0, 1000, 1000], text: 'whole page' }, // >25% of page
    { box_2d: [100, 100, 1087, 768], text: 'pixels' }, // pixel scale, not 0-1000
    { box_2d: [100, 100, 200, 200], text: '   ' }, // blank text
  ] }));
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [{ x: 90, y: 50, w: 10, h: 10, text: 'a' }]);

  // cache: same image + same model is answered from storage; a different image or model calls the API
  fetches = 0;
  const again = await call({ type: 'translate', data: 'AA', mime: 'image/jpeg', context: 'other context' });
  assert.equal(again.bubbles[0].text, 'Chào'); assert.equal(fetches, 0, 'same page must not hit the API again');
  // polish on (default): page call + text-only polish call; the polish reply here has no "lines" -> draft kept
  await call({ type: 'translate', data: 'BB', mime: 'image/jpeg' }); assert.equal(fetches, 2, 'new page = page call + polish call');
  store.models = { openrouter: 'x/z' };
  await call({ type: 'translate', data: 'AA', mime: 'image/jpeg' }); assert.equal(fetches, 4, 'new model must call the API');
  store.polish = false;
  await call({ type: 'translate', data: 'CC', mime: 'image/jpeg' }); assert.equal(fetches, 5, 'polish off = one call');
  await call({ type: 'translate', data: 'AA', mime: 'image/jpeg' }); assert.equal(fetches, 6, 'polish setting is part of the cache key');
  store.polish = true;

  // polish: valid lines replace the draft text but keep the boxes; bad replies keep the draft
  const pol = vm.runInContext('polish', ctx), draft = [{ x: 1, y: 2, w: 3, h: 4, text: 'Tôi không thể tin được' }, { x: 5, y: 6, w: 7, h: 8, text: 'Điều đó là không thể' }];
  const polished = (content) => { replies = { 'https://openrouter.ai': { choices: [{ message: { content } }] } }; return pol('openrouter', 'k', 'x/y', draft, ''); };
  let p = await polished('{"lines":["Không tin nổi luôn","Làm gì có chuyện đó!"]}');
  assert.deepEqual(p.map((b) => [b.x, b.text]), [[1, 'Không tin nổi luôn'], [5, 'Làm gì có chuyện đó!']]);
  assert.equal((await polished('{"lines":["chỉ một câu"]}'))[0].text, 'Tôi không thể tin được', 'wrong count keeps draft');
  assert.equal((await polished('{"lines":["", "x"]}'))[0].text, 'Tôi không thể tin được', 'blank line keeps draft');
  assert.equal((await polished('not json'))[1].text, 'Điều đó là không thể', 'bad JSON keeps draft');
  // eviction keeps the newest CACHE_MAX entries
  const max = vm.runInContext('CACHE_MAX', ctx), put = vm.runInContext('cachePut', ctx);
  for (let i = 0; i < max + 5; i++) store['c:m:' + i] = { t: i, bubbles: [] };
  await put('c:m:new', []);
  const left = Object.keys(store).filter((k) => k.startsWith('c:'));
  assert.equal(left.length, max); assert.ok(!('c:m:0' in store) && 'c:m:new' in store);

  store = {};
  assert.match((await call({ type: 'translate', data: 'AA', mime: 'image/jpeg' })).error, /API key/);

  // a request that never answers must end in a clear error (timeout shortened to 50ms for the test)
  ctx.AbortSignal = { timeout: () => AbortSignal.timeout(50) };
  const keepAlive = setTimeout(() => {}, 5000); // Node's AbortSignal.timeout timer doesn't hold the process open
  const realFetch = ctx.fetch;
  ctx.fetch = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  store = { provider: 'openai', keys: { openai: 'k' }, models: { openai: 'gpt-x' } };
  assert.match((await call({ type: 'translate', data: 'AA', mime: 'image/jpeg' })).error, /không trả lời sau 150 giây/);
  ctx.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  assert.match((await call({ type: 'translate', data: 'AA', mime: 'image/jpeg' })).error, /Không kết nối được/);
  ctx.fetch = realFetch;
  clearTimeout(keepAlive);
  console.log('OK');
  done = true;
})();
let done = false;
process.on('exit', () => { if (!done) { console.error('FAIL: test exited before finishing'); process.exitCode = 1; } });
