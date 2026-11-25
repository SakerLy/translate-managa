// Streamed read (background.js apiStream + completeItems): finished bubbles are known before the answer ends.
const ROOT = require('path').join(__dirname, '..', '..');
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
let reply; // what the fake server sends next
const ctx = { btoa, AbortSignal, URL, crypto, TextEncoder, TextDecoder, console, setTimeout, clearTimeout,
  fetch: async () => reply(),
  chrome: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } }, storage: { local: { get: async () => ({}), set: async () => {} } } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'manga-dich/background.js'), 'utf8'), ctx);
const completeItems = vm.runInContext('completeItems', ctx), providerFor = vm.runInContext('providerFor', ctx);

// half-written answers: only whole items count, braces and quotes inside strings don't confuse it
const full = '{"bubbles": [{"box_2d": [1,2,3,4], "text": "Cậu {ổn} chứ?\\" }"}, {"box_2d": [5,6,7,8], "text": "Ừ"}]}';
assert.equal(completeItems('{"bubbles": [').length, 0);
assert.equal(completeItems(full.slice(0, full.indexOf('}, {') + 1)).length, 1, 'first item done, second not started');
assert.equal(completeItems(full.slice(0, full.length - 10)).length, 1, 'second item still open');
assert.equal(completeItems(full).length, 2);
assert.equal(JSON.parse(completeItems(full)[0]).text, 'Cậu {ổn} chứ?" }');

const sse = (events) => {
  const body = events.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
  const bytes = new TextEncoder().encode(body);
  // delivered in small chunks, cut mid-line, like a real network
  return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } }),
    { headers: { 'content-type': 'text/event-stream' } });
};

(async () => {
  // OpenAI-compatible stream: deltas glued back together, onText sees it grow
  const parts = ['{"bubbles": [{"box_2d": [100,100,200,300],', ' "text": "Chào", "sfx": false, "style": "", "kind": "bubble"}', ']}'];
  reply = () => sse(parts.map((p) => ({ choices: [{ delta: { content: p } }] })).concat({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
  const seen = [];
  const out = await providerFor('custom', 'http://x/v1').translate('k', 'm', { data: 'AA', mime: 'image/png' }, 'p', 10, undefined, (t) => seen.push(completeItems(t).length));
  assert.equal(out, parts.join(''));
  assert.ok(seen.includes(1), 'a finished bubble was reported before the end');

  // a gateway that ignores "stream" and answers plain JSON
  reply = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"bubbles": []}' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
  assert.equal(await providerFor('custom', 'http://x/v1').translate('k', 'm', null, 'p', 10, undefined, () => {}), '{"bubbles": []}');

  // Gemini stream
  reply = () => sse([{ candidates: [{ content: { parts: [{ text: '{"bubbles": [' }] } }] }, { candidates: [{ content: { parts: [{ text: ']}' }] }, finishReason: 'STOP' }] }]);
  assert.equal(await providerFor('gemini').translate('k', 'gemini-3.1-flash-lite', null, 'p', 10, undefined, () => {}), '{"bubbles": []}');

  // HTTP error: thrown with the server's message
  reply = () => new Response(JSON.stringify({ error: { message: 'quota hết' } }), { status: 429, headers: { 'content-type': 'application/json' } });
  await assert.rejects(providerFor('custom', 'http://x/v1').translate('k', 'm', null, 'p', 10, undefined, () => {}), /quota hết/);
  // "AI đọc ảnh nhanh": the read pass asks for little thinking only when the job says so (the settings switch)
  let sent;
  reply = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"bubbles": []}' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
  const f0 = ctx.fetch;
  ctx.fetch = async (url, init) => { sent = JSON.parse(init.body); return reply(); };
  const pageJob = vm.runInContext('pageJob', ctx);
  await providerFor('custom', 'http://y/v1').translate('k', 'm', null, 'p', 10, { ...pageJob(false), fast: true });
  assert.equal(sent.reasoning_effort, 'low', 'switch on: low thinking asked');
  await providerFor('custom', 'http://y/v1').translate('k', 'm', null, 'p', 10, { ...pageJob(false), fast: false });
  assert.equal(sent.reasoning_effort, undefined, 'switch off: the model default');
  ctx.fetch = f0;
  console.log('stream OK');
})().catch((e) => { console.error(e); process.exit(1); });
