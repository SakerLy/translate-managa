// Real API test (costs a few cents). Uses the same background.js code the extension runs.
//   Keys: env vars or a .env file next to this script (ANTHROPIC_API_KEY=..., OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY)
//   Optional: MODEL_GEMINI=gemini-x (etc.) to test one model instead of "newest that works"
//   node test-live.js [page.png]          (default: test-fixtures/page4.png)
// If <page>.truth.json exists, scores box placement: each bubble must get a translation box whose
// centre lands on it (recall), and each box must land on some bubble (precision). Both must be >= 80%.
const fs = require('fs'), vm = require('vm'), path = require('path');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const img = (require.main === module && process.argv[2]) || path.join(__dirname, 'test-fixtures/page4.png'); // argv only when run directly
const page = { data: fs.readFileSync(img).toString('base64'), mime: /\.png$/i.test(img) ? 'image/png' : 'image/jpeg' };
const truthFile = img.replace(/\.(png|jpe?g)$/i, '.truth.json');
const truth = fs.existsSync(truthFile) ? JSON.parse(fs.readFileSync(truthFile, 'utf8')) : null;

const ENV = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
let listener;
const ctx = { fetch, btoa, AbortSignal, chrome: { runtime: { onMessage: { addListener: (f) => (listener = f) } } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.env.BG || path.join(__dirname, 'manga-dich/background.js'), 'utf8'), ctx); // BG=other.js to A/B a variant
ctx.testImage = async () => page; // Node has no OffscreenCanvas: probe with the real page instead
const PROVIDERS = vm.runInContext('PROVIDERS', ctx); // top-level const isn't a context property
const call = (msg) => new Promise((res) => listener(msg, null, res));

function score(bubbles) {
  const { width: W, height: H } = truth, M = 15; // px tolerance around each truth box
  const centre = (b) => [(b.x + b.w / 2) * W / 100, (b.y + b.h / 2) * H / 100];
  const inside = ([cx, cy], [x0, y0, x1, y1]) => cx >= x0 - M && cx <= x1 + M && cy >= y0 - M && cy <= y1 + M;
  const missed = truth.bubbles.filter((t) => !bubbles.some((b) => inside(centre(b), t.box))).map((t) => t.id);
  const stray = bubbles.filter((b) => !truth.bubbles.some((t) => inside(centre(b), t.box))).map((b) => b.text);
  const recall = 1 - missed.length / truth.bubbles.length;
  const precision = bubbles.length ? 1 - stray.length / bubbles.length : 0;
  return { recall, precision, missed, stray, pass: recall >= 0.8 && precision >= 0.8 };
}

module.exports = { score, truth };
if (require.main === module) (async () => {
  let failed = false, ran = 0;
  for (const [provider, env] of Object.entries(ENV)) {
    const key = process.env[env];
    if (process.env.ONLY && process.env.ONLY !== provider) continue; // ONLY=openrouter tests one provider
    if (!key) { console.log(`- ${provider}: bỏ qua (chưa có ${env})`); continue; }
    ran++;
    const models = await call({ type: 'models', provider, key });
    if (models.error) { console.log(`✗ ${provider}: lấy danh sách model lỗi: ${models.error}`); failed = true; continue; }
    const forced = process.env['MODEL_' + provider.toUpperCase()];
    console.log(`\n${provider}: ${models.list.length} model, mới nhất: ${models.list.slice(0, 5).join(', ')}`);
    let ok = false;
    for (const model of forced ? [forced] : models.list.slice(0, 6)) {
      const t0 = Date.now();
      let bubbles;
      try {
        bubbles = ctx.parseBubbles(await PROVIDERS[provider].translate(key, model, page, 'Đây là trang đầu tiên.'));
      } catch (e) { console.log(`  ✗ ${model}: ${e.message}`); continue; }
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${model} (${secs}s) — ${bubbles.length} bong bóng`);
      for (const b of bubbles) console.log(`     [x${Math.round(b.x)} y${Math.round(b.y)} w${Math.round(b.w)} h${Math.round(b.h)}] ${b.text}`);
      const out = path.join(path.dirname(img), `result-${provider}-${model.replace(/[^\w.-]/g, '_')}.json`);
      fs.writeFileSync(out, JSON.stringify({ model, secs, bubbles }, null, 2));
      if (truth) {
        const s = score(bubbles);
        console.log(`  vị trí: trúng ${Math.round(s.recall * 100)}% bong bóng, ${Math.round(s.precision * 100)}% ô đặt đúng chỗ → ${s.pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
        if (s.missed.length) console.log(`     bỏ sót: ${s.missed.join(' | ')}`);
        if (s.stray.length) console.log(`     đặt lệch: ${s.stray.join(' | ')}`);
        ok = s.pass;
      } else ok = bubbles.length > 0;
      console.log(`  kết quả lưu ở ${out}`);
      break;
    }
    if (!ok) { console.log(`✗ ${provider}: không đạt`); failed = true; }
  }
  if (!ran) { console.log('Chưa có API key nào (đặt biến môi trường hoặc tạo file .env).'); process.exit(1); }
  process.exit(failed ? 1 : 0);
})();
