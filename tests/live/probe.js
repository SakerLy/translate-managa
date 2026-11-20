// Runs the extension's real probe() (the popup's model check) against live models.
//   python tools/draw-probe.py tests/fixtures/probe.png    (same 2-bubble layout as background.js testImage)
//   node tests/live/probe.js openrouter model/a model/b ...   (keys from .env)
const ROOT = require('path').join(__dirname, '..', '..'); // repo root: .env, manga-dich/, tests/fixtures/
const fs = require('fs'), vm = require('vm'), path = require('path');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const [provider, ...models] = process.argv.slice(2);
const key = process.env[{ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', groq: 'GROQ_API_KEY' }[provider]];
let listener;
const ctx = { fetch, btoa, AbortSignal, URL, chrome: { runtime: { onMessage: { addListener: (f) => (listener = f) }, onConnect: { addListener() {} } } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'manga-dich/background.js'), 'utf8'), ctx);
const img = fs.readFileSync(path.join(ROOT, 'tests/fixtures/probe.png')).toString('base64');
ctx.testImage = async () => ({ data: img, mime: 'image/png' });
const call = (msg) => new Promise((res) => listener(msg, null, res));
Promise.all(models.map(async (model) => {
  const t0 = Date.now();
  const r = await call({ type: 'probe', provider, key, model });
  console.log(`${r.error ? '✗' : '✓'} ${model} ${((Date.now() - t0) / 1000).toFixed(1)}s ${r.error || r.sample}`);
}));
