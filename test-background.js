// Run: node test-background.js  - loads background.js with fake chrome/fetch and checks model lists + parsing.
const fs = require('fs'), vm = require('vm'), assert = require('assert');

let replies = {}, store = {}, listener, fetches = 0;
const ports = new Map(); // name -> {postMessage spies}
// behaves like chrome.storage.local: get(null|key|keys), set, remove
const local = {
  get: async (k) => (k === null ? { ...store } : Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]]))),
  set: async (o) => { Object.assign(store, o); },
  remove: async (ks) => { for (const x of [].concat(ks)) delete store[x]; },
};
const ctx = {
  AbortSignal, crypto, TextEncoder, URL, setTimeout, clearTimeout,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  fetch: async (url) => {
    fetches++;
    const key = Object.keys(replies).find((k) => url.startsWith(k));
    return { ok: true, json: async () => replies[key] };
  },
  chrome: {
    runtime: {
      onMessage: { addListener: (f) => (listener = f) },
      onConnect: { addListener: (f) => (ctx.__onConnect = f) },
    },
    storage: { local },
  },
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

  // Base URL: user URL is used (trailing slash dropped), bad schemes rejected, custom needs a URL,
  // and a key-less custom server gets no auth header
  {
    const seen = []; const f0 = ctx.fetch;
    ctx.fetch = async (url, init) => { seen.push({ url, auth: init?.headers?.authorization }); return { ok: true, json: async () => ({ data: [{ id: 'gpt-9', created: 2 }, { id: 'llava', created: 1 }] }) }; };
    let r = await call({ type: 'models', provider: 'openai', key: 'k', base: 'https://proxy.example.com/v1/' });
    assert.deepEqual(r.list, ['gpt-9', 'llava'], 'behind a custom base nothing is filtered'); assert.equal(seen.at(-1).url, 'https://proxy.example.com/v1/models');
    r = await call({ type: 'models', provider: 'openai', key: 'k', base: '' });
    assert.equal(seen.at(-1).url, 'https://api.openai.com/v1/models', 'empty base = default URL');
    r = await call({ type: 'models', provider: 'custom', key: '', base: 'http://localhost:11434/v1' });
    assert.deepEqual(r.list, ['gpt-9', 'llava'], 'custom keeps every model'); assert.equal(seen.at(-1).url, 'http://localhost:11434/v1/models'); assert.equal(seen.at(-1).auth, undefined);
    const n = seen.length;
    assert.match((await call({ type: 'models', provider: 'custom', key: '', base: '' })).error, /Base URL/);
    assert.match((await call({ type: 'models', provider: 'openai', key: 'k', base: 'file:///etc/passwd' })).error, /http/);
    assert.match((await call({ type: 'models', provider: 'openai', key: 'k', base: 'javascript:alert(1)' })).error, /http/);
    assert.match((await call({ type: 'models', provider: 'openai', key: 'k', base: 'not a url' })).error, /không hợp lệ/);
    assert.equal(seen.length, n, 'rejected URLs are never fetched');

    // a real gateway's model list (OpenAI shape, no `created`): every provider family
    // must list all of it - before, OpenAI kept only gpt-*, Anthropic returned [], Gemini threw
    const gw = JSON.parse(fs.readFileSync(__dirname + '/test-fixtures/gateway-models.json', 'utf8'));
    const want = gw.data.map((m) => m.id);
    const auth = {};
    ctx.fetch = async (url, init) => { auth[url] = init.headers; return { ok: true, json: async () => gw }; };
    for (const p of ['openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'custom']) {
      const res = await call({ type: 'models', provider: p, key: 'K', base: 'https://gateway.example/v1' });
      assert.deepEqual(res.list, want, p + ' via gateway');
    }
    // the family's own auth header is still sent
    ctx.fetch = async (url, init) => { auth.last = init.headers; return { ok: true, json: async () => gw }; };
    await call({ type: 'models', provider: 'anthropic', key: 'K', base: 'https://gw.example/v1' }); assert.equal(auth.last['x-api-key'], 'K');
    await call({ type: 'models', provider: 'gemini', key: 'K', base: 'https://gw.example/v1' }); assert.equal(auth.last['x-goog-api-key'], 'K');
    await call({ type: 'models', provider: 'custom', key: 'K', base: 'https://gw.example/v1' }); assert.equal(auth.last.authorization, 'Bearer K');
    // other list shapes
    const shape = async (body, provider = 'custom') => { ctx.fetch = async () => ({ ok: true, json: async () => body }); return (await call({ type: 'models', provider, key: '', base: 'http://localhost:1/v1' })).list; };
    assert.deepEqual(await shape({ models: [{ name: 'models/gemini-x' }, { name: 'models/gemini-y' }] }, 'gemini'), ['gemini-x', 'gemini-y']);
    assert.deepEqual(await shape(['a', 'b', 'a', '']), ['a', 'b']);
    assert.deepEqual(await shape({ data: [{ id: 'm1' }, { name: 'm2' }, {}, null] }), ['m1', 'm2']);
    assert.deepEqual(await shape({ unexpected: true }), []);
    // 404 = wrong path: point at the server's docs, never guess a /v1 (servers mount the API differently)
    ctx.fetch = async () => ({ ok: false, status: 404, json: async () => { throw new SyntaxError('html'); } });
    for (const base of ['https://gateway.example', 'https://gateway.example/v1']) {
      const err = (await call({ type: 'models', provider: 'custom', key: '', base })).error;
      assert.match(err, /tài liệu của server/);
      assert.doesNotMatch(err, /thêm \/v1/);
    }
    ctx.fetch = f0;
  }

  // Groq: inactive models dropped, newest first (shape per Groq's API reference)
  replies = { 'https://api.groq.com/openai/v1/models': { data: [
    { id: 'qwen/qwen3.8-27b', created: 5, active: true }, { id: 'old-model', created: 9, active: false }, { id: 'whisper-x', created: 7, active: true },
  ] } };
  assert.deepEqual((await call({ type: 'models', provider: 'groq', key: 'k' })).list, ['whisper-x', 'qwen/qwen3.8-27b']);

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
    // free (price 0) first, then paid; newest first inside each group
    const isFree = (id) => +byId[id].pricing.prompt === 0 && +byId[id].pricing.completion === 0;
    const firstPaid = list.findIndex((id) => !isFree(id));
    assert.ok(firstPaid > 0, 'real list has free vision models and they come first');
    assert.ok(list.slice(firstPaid).every((id) => !isFree(id)), 'no free model after the first paid one');
    for (let i = 1; i < list.length; i++) {
      if (isFree(list[i - 1]) === isFree(list[i])) assert.ok(byId[list[i - 1]].created >= byId[list[i]].created);
    }
    console.log('openrouter real list:', list.length, 'models,', firstPaid, 'free first:', list.slice(0, firstPaid).join(', '));
  }

  // translate path: fenced JSON from an OpenAI-compatible model still parses (values here must stay on the
  // 0-1000 scale with some > 100, or the 0-100 rescale in parseBubbles would kick in)
  store = { provider: 'openrouter', keys: { openrouter: 'k' }, models: { openrouter: 'x/y' } };
  replies = { 'https://openrouter.ai': { choices: [{ message: { content: '```json\n{"bubbles":[{"box_2d":[200,100,600,400],"text":"Chào"}]}\n```' } }] } };
  assert.deepEqual({ ...(await call({ type: 'translate', data: 'AA', mime: 'image/jpeg' })).bubbles[0] }, { x: 10, y: 20, w: 30, h: 40, text: 'Chào' });

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

  // every box on a 0-100 percent scale (a gateway model ignoring the prompt) is rescaled ×10, not clamped
  // into the top-left corner
  const p100 = parse(JSON.stringify({ bubbles: [
    { box_2d: [10, 20, 30, 40], text: 'một' },
    { box_2d: [50, 60, 70, 80], text: 'hai' },
  ] }));
  assert.deepEqual(JSON.parse(JSON.stringify(p100)), [
    { x: 20, y: 10, w: 20, h: 20, text: 'một' },
    { x: 60, y: 50, w: 20, h: 20, text: 'hai' },
  ]);

  // gateway envelopes: the array wrapped in the gateway's own body parses; a 200-wrapped gateway error
  // surfaces the gateway's message instead of a vague shape error
  const env = parse(JSON.stringify({ data: [{ box_2d: [100, 200, 300, 400], text: 'gói data' }] }));
  assert.deepEqual(JSON.parse(JSON.stringify(env)), [{ x: 20, y: 10, w: 20, h: 20, text: 'gói data' }]);
  const gw = (() => { try { parse('{"code":402,"msg":"số dư không đủ"}'); } catch (e) { return e.message; } return ''; })();
  assert.match(gw, /số dư không đủ/);

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
  const OLD_G = 'Iori ↔ bạn gái: Iori xưng tớ, gọi cậu';
  const polished = (content) => { replies = { 'https://openrouter.ai': { choices: [{ message: { content } }] } }; return pol('openrouter', 'k', 'x/y', draft, '', OLD_G); };
  let p = await polished('{"lines":["Không tin nổi luôn","Làm gì có chuyện đó!"],"glossary":"' + OLD_G + '\\nIori ↔ mẹ: con/mẹ"}');
  assert.deepEqual(p.bubbles.map((b) => [b.x, b.text]), [[1, 'Không tin nổi luôn'], [5, 'Làm gì có chuyện đó!']]);
  assert.equal(p.glossary, OLD_G + '\nIori ↔ mẹ: con/mẹ', 'updated glossary is returned');
  assert.equal((await polished('{"lines":["a","b"],"glossary":""}')).glossary, OLD_G, 'empty glossary keeps the old one');
  assert.equal((await polished('{"lines":["chỉ một câu"],"glossary":"' + OLD_G + '"}')).bubbles[0].text, 'Tôi không thể tin được', 'wrong count keeps draft');
  assert.equal((await polished('{"lines":["", "x"]}')).bubbles[0].text, 'Tôi không thể tin được', 'blank line keeps draft');
  const bad = await polished('not json');
  assert.equal(bad.bubbles[1].text, 'Điều đó là không thể', 'bad JSON keeps draft'); assert.equal(bad.glossary, OLD_G, 'and the old glossary');
  // the glossary reaches the prompt
  let sentBody; const f0 = ctx.fetch; ctx.fetch = async (u, init) => { sentBody = init.body; return f0(u, init); };
  await polished('{"lines":["a","b"],"glossary":"x"}'); ctx.fetch = f0;
  assert.ok(JSON.parse(sentBody).messages[1].content.at(-1).text.startsWith('BẢNG XƯNG HÔ:\n' + OLD_G));
  // eviction keeps the newest CACHE_MAX entries
  const max = vm.runInContext('CACHE_MAX', ctx), put = vm.runInContext('cachePut', ctx);
  for (let i = 0; i < max + 5; i++) store['c:m:' + i] = { t: i, bubbles: [] };
  await put('c:m:new', []);
  const left = Object.keys(store).filter((k) => k.startsWith('c:'));
  assert.equal(left.length, max); assert.ok(!('c:m:0' in store) && 'c:m:new' in store);

  store = {};
  assert.match((await call({ type: 'translate', data: 'AA', mime: 'image/jpeg' })).error, /API key/);

  // parsePlainLines fallback: the three plain-text formats a real gateway model produced when it
  // ignored the JSON schema (glm-4.6v, 2 of 3 runs with the old prompt) all parse into bubbles
  {
    const parse = vm.runInContext('parseBubbles', ctx);
    const a = parse('[68, 75, 175, 340] "Định đi về đâu vậy?"\n[95, 510, 150, 700] "(Mau về nhà thôi...)"');
    assert.deepEqual(JSON.parse(JSON.stringify(a)), [
      { x: 7.5, y: 6.8, w: 26.5, h: 10.7, text: 'Định đi về đâu vậy?' },
      { x: 51, y: 9.5, w: 19, h: 5.5, text: '(Mau về nhà thôi...)' },
    ], 'quoted lines parse');
    const b = parse('[110, 60, 320, 320] ("Định đi đâu?")');
    assert.equal(b.length, 1); assert.equal(b[0].text, 'Định đi đâu?', 'parenthesised lines parse');
    const c = parse('[16, 60, 130, 340] Đi đâu vậy?');
    assert.equal(c.length, 1); assert.equal(c[0].text, 'Đi đâu vậy?', 'bare lines parse');
    // a gateway error in prose must NOT parse as bubbles - the queue must see the failure
    let threw = false;
    try { parse('số dư không đủ, vui lòng nạp thêm'); } catch { threw = true; }
    assert.ok(threw, 'prose error still throws');
    // plain-text lines on a 0-100 percent scale get the same ×10 rescale as JSON answers
    const e = parse('[10, 20, 30, 40] một');
    assert.deepEqual(JSON.parse(JSON.stringify(e)), [{ x: 20, y: 10, w: 20, h: 20, text: 'một' }]);
  }

  // polish: some models answer with the bare lines array despite the schema (glm-4.6v live run);
  // take it - the glossary falls back to the old one, which is the correct behaviour anyway
  {
    const pol = vm.runInContext('polish', ctx);
    const draft = [{ x: 1, y: 2, w: 3, h: 4, src: 'どこへ行くの？', text: 'Bạn đi đâu?' }];
    store = { provider: 'openrouter', keys: { openrouter: 'k' }, models: { openrouter: 'x/y' } };
    replies = { 'https://openrouter.ai': { choices: [{ message: { content: '["Cậu đi đâu đấy?"]' } }] } };
    const p = await pol('openrouter', 'k', 'x/y', draft, '', 'Ken ↔ Yuki: tớ/cậu');
    assert.equal(p.bubbles[0].text, 'Cậu đi đâu đấy?', 'bare-array reply replaces the draft');
    assert.equal(p.glossary, 'Ken ↔ Yuki: tớ/cậu', 'bare-array reply keeps the old glossary');
  }

  // draft port: the read pass's boxes are pushed through the caller's port before polish resolves
  {
    store = { provider: 'openrouter', keys: { openrouter: 'k' }, models: { openrouter: 'x/d' }, polish: false };
    replies = { 'https://openrouter.ai': { choices: [{ message: { content: '{"bubbles":[{"box_2d":[100,200,300,400],"text":"Nháp"}]}' } }] } };
    const pushed = [];
    const port = { name: 'md-draft-test', postMessage: (m) => pushed.push(m), onDisconnect: { addListener() {} } };
    ctx.__onConnect(port); // what chrome.runtime.connect(...) triggers in the worker
    const res = await call({ type: 'translate', data: 'FF', mime: 'image/jpeg', draftPort: 'md-draft-test' });
    assert.equal(res.bubbles[0].text, 'Nháp');
    assert.deepEqual(pushed, [{ type: 'draft', bubbles: res.bubbles }], 'draft pushed through the port');
  }

  // a page that comes back with zero boxes is a model flake: retried once (polish skips an empty page)
  store = { provider: 'openrouter', keys: { openrouter: 'k' }, models: { openrouter: 'x/e' } };
  fetches = 0;
  replies = { 'https://openrouter.ai': { choices: [{ message: { content: '{"bubbles":[]}' } }] } };
  await call({ type: 'translate', data: 'DD', mime: 'image/jpeg' });
  assert.equal(fetches, 2, 'empty answer retried once: 2 page calls, polish skips an empty page');

  // queue: two tabs requesting the same page make ONE set of API calls; a flaky first answer is retried
  // before anyone sees an error; the finished result is served to both, and later calls hit the cache
  vm.runInContext('Q_RETRY_MS = 5', ctx); // keep the retry backoff short for the test
  store = { provider: 'openrouter', keys: { openrouter: 'k' }, models: { openrouter: 'x/q' } };
  fetches = 0;
  let qn = 0;
  const keepFetch = ctx.fetch;
  ctx.fetch = async () => {
    qn++;
    if (qn === 1) return { ok: false, status: 503, json: async () => ({ error: { message: '503 tạm thời' } }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"bubbles":[{"box_2d":[200,100,600,400],"text":"X"}]}' } }] }) };
  };
  const [q1, q2] = await Promise.all([
    call({ type: 'translate', data: 'EE', mime: 'image/jpeg' }),
    call({ type: 'translate', data: 'EE', mime: 'image/jpeg' }),
  ]);
  ctx.fetch = keepFetch;
  assert.equal(q1.bubbles?.[0]?.text, 'X', 'flaky answer retried invisibly');
  assert.equal(q2.bubbles?.[0]?.text, 'X', 'twin request rides the same job');
  assert.equal(qn, 3, 'one failed page call + its retry + one polish - fetched once for both callers');
  const q3 = await call({ type: 'translate', data: 'EE', mime: 'image/jpeg' });
  assert.equal(q3.bubbles[0].text, 'X');
  assert.equal(qn, 3, 'a third request is served from the cache');

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
  // ---- SFX toggle: the model tags "sfx": true; sfx=false drops those bubbles before draft/polish/cache
  {
    let calls = 0, lastBody = null;
    ctx.fetch = async (url, init) => {
      lastBody = JSON.parse(init.body);
      const isPolish = !lastBody.messages?.[1]?.content?.some?.((c) => c.type === 'image_url');
      if (isPolish) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ lines: JSON.parse(lastBody.messages[1].content[0].text.match(/\[([\s\S]*)\]/)[1]).map(() => 'ok'), glossary: '' }) } }] }) };
      calls++;
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"bubbles":[{"box_2d":[100,100,300,300],"text":"Cậu đi đâu?"},{"box_2d":[500,100,700,300],"text":"RẦM!","sfx":true}]}' } }] }) };
    };
    store = { provider: 'openai', keys: { openai: 'k' }, models: { openai: 'gpt-x' }, polish: false, sfx: true };
    const on = await call({ type: 'translate', data: 'SFX-ON', mime: 'image/jpeg' });
    assert.equal(on.bubbles.length, 2, 'sfx on: dialogue + SFX');
    assert.equal(on.bubbles[1].sfx, true, 'sfx flag survives parsing');
    store = { provider: 'openai', keys: { openai: 'k' }, models: { openai: 'gpt-x' }, polish: false, sfx: false };
    const off = await call({ type: 'translate', data: 'SFX-OFF', mime: 'image/jpeg' });
    assert.equal(off.bubbles.length, 1, 'sfx off: SFX bubble dropped');
    assert.equal(off.bubbles[0].text, 'Cậu đi đâu?', 'dialogue kept');
    assert.equal(calls, 2, 'one page call per setting (different cache keys)');
    // the schema must ask for the sfx flag (otherwise no model would ever return it)
    assert.ok(lastBody.response_format.json_schema.schema.properties.bubbles.items.properties.sfx, 'schema carries sfx flag');
    store = {};
  }

  console.log('OK');
  done = true;
})();
let done = false;
process.on('exit', () => { if (!done) { console.error('FAIL: test exited before finishing'); process.exitCode = 1; } });
