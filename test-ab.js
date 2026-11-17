// So sánh prompt (A/B) trên trang test có đáp án: chạy một model N lần, chấm recall/precision từng lần
// rồi báo trung bình — một lần chạy duy nhất là không đủ kết luận vì model trả về hơi khác nhau mỗi lần.
//   node test-ab.js <model> [số lần chạy, mặc định 3]
//   BG=path/variant.js để chạy một biến thể background.js (mặc định: manga-dich/background.js)
//   PROVIDER=custom|gemini|... KEY_ENV=CUSTOM_API_KEY (mặc định theo provider, đọc từ .env)
//   BASE_URL để chỉ endpoint cho provider custom (mặc định CUSTOM_BASE_URL trong .env)
const fs = require('fs'), vm = require('vm'), path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const img = path.join(__dirname, process.env.PAGE || 'test-fixtures/page4.png');
const page = { data: fs.readFileSync(img).toString('base64'), mime: 'image/png' };
// chấm theo đáp án của chính trang đó (không dùng score của test-live vì nó gắn với page4)
const truth = JSON.parse(fs.readFileSync(img.replace(/\.(png|jpe?g)$/i, '.truth.json'), 'utf8'));
const score = (bubbles) => {
  const { width: W, height: H } = truth, M = 15; // px tolerance around each truth box
  const centre = (b) => [(b.x + b.w / 2) * W / 100, (b.y + b.h / 2) * H / 100];
  const inside = ([cx, cy], [x0, y0, x1, y1]) => cx >= x0 - M && cx <= x1 + M && cy >= y0 - M && cy <= y1 + M;
  const missed = truth.bubbles.filter((t) => !bubbles.some((b) => inside(centre(b), t.box))).map((t) => t.id);
  const stray = bubbles.filter((b) => !truth.bubbles.some((t) => inside(centre(b), t.box))).map((b) => b.text);
  const recall = 1 - missed.length / truth.bubbles.length;
  const precision = bubbles.length ? 1 - stray.length / bubbles.length : 0;
  return { recall, precision, pass: recall >= 0.8 && precision >= 0.8 };
};

const provider = process.env.PROVIDER || 'custom';
const KEY_ENV = { custom: 'CUSTOM_API_KEY', gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', openrouter: 'OPENROUTER_API_KEY', anthropic: 'ANTHROPIC_API_KEY', groq: 'GROQ_API_KEY' };
const key = process.env[process.env.KEY_ENV || KEY_ENV[provider]];
const base = process.env.BASE_URL || (provider === 'custom' ? process.env.CUSTOM_BASE_URL : '');

let listener;
const ctx = { fetch, btoa, AbortSignal, URL, chrome: { runtime: { onMessage: { addListener: (f) => (listener = f) } } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.env.BG || path.join(__dirname, 'manga-dich/background.js'), 'utf8'), ctx);
const call = (msg) => new Promise((res) => listener(msg, null, res));

(async () => {
  const [model, nArg] = process.argv.slice(2);
  const N = +(nArg || process.env.REPEATS || 3);
  const P = ctx.providerFor(provider, base);
  const one = async (i) => {
    const t0 = Date.now();
    try {
      const bubbles = ctx.parseBubbles(await P.translate(key, model, page, 'Đây là trang đầu tiên.'));
      const s = score(bubbles);
      return `  lần ${i + 1}: ${((Date.now() - t0) / 1000).toFixed(0)}s — trúng ${Math.round(s.recall * 100)}%, đúng chỗ ${Math.round(s.precision * 100)}% (${bubbles.length} ô) ${s.pass ? 'ĐẠT' : 'không đạt'}`;
    } catch (e) {
      return `  lần ${i + 1}: LỖI ${((Date.now() - t0) / 1000).toFixed(0)}s — ${String(e.message).split('\n')[0].slice(0, 100)}`;
    }
  };
  const label = `${path.basename(process.env.BG || 'manga-dich/background.js')} × ${model} × ${N} lần`;
  console.log(`\n== ${label}`);
  const out = [];
  for (let i = 0; i < N; i += 3) out.push(...await Promise.all([0, 1, 2].slice(0, Math.min(3, N - i)).map((j) => one(i + j))));
  console.log(out.join('\n'));
})();
