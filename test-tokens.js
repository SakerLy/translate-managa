// Measures real token usage (from the API's own usage report) and box accuracy for one page at several
// image sizes, through the extension's real background.js request code.
//   python -c "..." makes resized copies; node test-tokens.js gemini MODEL page.png [page-640.png ...]
const fs = require('fs'), vm = require('vm'), path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const [provider, model, ...images] = process.argv.slice(2);
const key = process.env[{ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY' }[provider]];
let usage;
const ctx = {
  btoa, AbortSignal, chrome: { runtime: { onMessage: { addListener() {} } } },
  // pass-through fetch that records the usage block of each response
  fetch: async (url, init) => {
    const r = await fetch(url, init); const j = await r.clone().json().catch(() => ({}));
    usage = j.usageMetadata || j.usage; return r;
  },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'manga-dich/background.js'), 'utf8'), ctx);
const PROVIDERS = vm.runInContext('PROVIDERS', ctx);
const { score } = require('./test-live.js');
(async () => {
  for (const img of images) {
    const page = { data: fs.readFileSync(img).toString('base64'), mime: /\.png$/i.test(img) ? 'image/png' : 'image/jpeg' };
    const t0 = Date.now();
    try {
      const bubbles = ctx.parseBubbles(await PROVIDERS[provider].translate(key, model, page, 'Đây là trang đầu tiên.'));
      const s = score(bubbles); // boxes are in % so they score against the full-size truth at any image size
      console.log(`${path.basename(img)}  ${((Date.now() - t0) / 1000).toFixed(1)}s  usage=${JSON.stringify(usage)}  trúng ${Math.round(s.recall * 100)}% / đúng chỗ ${Math.round(s.precision * 100)}% ${s.pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
    } catch (e) { console.log(`${path.basename(img)}  ✗ ${e.message.split('\n')[0]}`); }
  }
})();
