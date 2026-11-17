// Real run of the extension's polish() pass on saved draft translations, printing draft vs polished and
// the API's own token usage.   node test-polish.js gemini MODEL draft1.json [draft2.json ...]
const fs = require('fs'), vm = require('vm'), path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const [provider, model, ...files] = process.argv.slice(2);
const key = process.env[{ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', groq: 'GROQ_API_KEY' }[provider]];
let usage;
const ctx = {
  btoa, AbortSignal, crypto, TextEncoder, URL, chrome: { runtime: { onMessage: { addListener() {} } } },
  fetch: async (url, init) => { const r = await fetch(url, init); const j = await r.clone().json().catch(() => ({})); usage = j.usageMetadata || j.usage; return r; },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'manga-dich/background.js'), 'utf8'), ctx);
const polish = vm.runInContext('polish', ctx);
(async () => {
  for (const f of files) {
    const draft = JSON.parse(fs.readFileSync(f, 'utf8')).bubbles;
    usage = null;
    const t0 = Date.now();
    const out = await polish(provider, key, model, draft, '');
    const changed = out.filter((b, i) => b.text !== draft[i].text).length;
    console.log(`\n=== ${path.basename(f)}  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${changed}/${draft.length} câu được sửa  usage=${JSON.stringify(usage && { in: usage.promptTokenCount ?? usage.prompt_tokens, out: usage.candidatesTokenCount ?? usage.completion_tokens })}`);
    out.forEach((b, i) => console.log(b.text === draft[i].text ? `  = ${b.text}` : `  - ${draft[i].text}\n  + ${b.text}`));
  }
})();
