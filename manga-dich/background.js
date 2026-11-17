// Raw fetch instead of provider SDKs: a plain MV3 extension has no bundler step.
const SYSTEM = `Bạn là dịch giả truyện tranh (manga/manhwa/manhua) chuyên nghiệp sang tiếng Việt.
Nhìn trang truyện, tìm mọi bong bóng thoại, khung dẫn truyện và chữ quan trọng, rồi dịch sang tiếng Việt như một bản dịch chất lượng cao:
- Văn nói tự nhiên, đúng giọng và tính cách nhân vật; không dịch từng chữ.
- Xưng hô theo quan hệ và bối cảnh: bạn bè (tao/mày, tớ/cậu), người lạ/lịch sự (tôi/anh, tôi/cô), gia đình, cấp trên; truyện cổ trang/tu tiên dùng ta/ngươi, tại hạ, sư huynh...
- Giữ tên riêng; truyện Nhật giữ hậu tố -san, -kun, -chan, senpai.
- Câu ngắn gọn để vừa bong bóng. Giữ cảm thán, ngập ngừng ("...", "!?").
- Hiệu ứng âm thanh (SFX): chỉ dịch khi ngắn và có ý nghĩa, nếu không thì bỏ qua.
- Bỏ qua watermark, chữ ký nhóm dịch, số trang.
Với mỗi vùng chữ trả về `;
const BOX_RULE = 'box_2d = [ymin, xmin, ymax, xmax] chuẩn hóa 0-1000 theo kích thước ảnh, bao kín vùng chữ gốc. Thứ tự theo thứ tự đọc.';

// box_2d [ymin, xmin, ymax, xmax] on a 0-1000 scale is the box format Gemini is trained on (per Google's
// image-understanding docs); free-form x/y/w/h percentages came back misplaced on a real page.
const pageJob = (withSrc) => ({
  name: 'bubbles',
  // src (the original text) is only needed by polish(); it costs ~500 output tokens a page, so skip it otherwise
  system: SYSTEM + (withSrc ? 'src = chữ gốc đúng như trong ảnh, text = bản dịch, ' : '') + BOX_RULE, // off = the exact prompt measured at 93%
  schema: {
    type: 'object', additionalProperties: false, required: ['bubbles'],
    properties: {
      bubbles: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['box_2d', ...(withSrc ? ['src'] : []), 'text'],
          properties: { box_2d: { type: 'array', items: { type: 'number' } }, ...(withSrc && { src: { type: 'string' } }), text: { type: 'string' } },
        },
      },
    },
  },
});
const PAGE_JOB = pageJob(false);

// Second, text-only pass that rewrites the draft lines in natural Vietnamese. Kept out of the image prompt
// on purpose: adding these rules there dropped box accuracy (gemini-3.1-flash-lite, 5 runs each on a real
// page: 93% of bubbles hit with the short prompt vs 80% with this guide and 83% with a 3-line version).
const POLISH_SYSTEM = `Bạn là biên tập viên lời thoại truyện tranh tiếng Việt, được độc giả khen "đọc như truyện Việt".
Bạn nhận các bong bóng của MỘT trang theo thứ tự đọc, mỗi mục có "src" (chữ gốc trong ảnh) và "draft" (bản dịch nháp). Viết lại draft cho tự nhiên.
Giữ nghĩa là bắt buộc, văn hay là thứ hai:
- Đọc src để biết chính xác ai làm gì cho ai, ai xin/ai cho, phủ định hay khẳng định, câu hỏi hay câu kể. KHÔNG đảo chủ ngữ/tân ngữ, KHÔNG thêm chi tiết không có trong src (vd "từ đời nào", "con bé"), KHÔNG bỏ ý.
- Giữ người nói của draft. Xưng hô giữa cùng hai người phải thống nhất cả trang: nếu draft lẫn lộn (lúc cậu/tớ lúc anh/em) thì chọn một cặp hợp nhất và sửa mọi câu theo cặp đó.
- BẢNG XƯNG HÔ (nếu được đưa) là quyết định của các trang trước: cặp nào đã có trong bảng thì BẮT BUỘC dùng đúng cặp đó, kể cả khi draft dùng cặp khác. Không đổi cặp đã có.
- Trả về "glossary": bảng xưng hô sau trang này = bảng cũ + cặp mới gặp ở trang này, mỗi dòng một cặp, ghi CẢ HAI CHIỀU dạng "A ↔ B: A xưng X gọi B là Y; B xưng Y gọi A là X" (dùng tên hoặc mô tả ngắn: "Iori", "bạn gái của Iori", "người dẫn chương trình"). Sửa mọi câu của cả A và B theo đúng chiều của người nói. Không có gì mới thì trả lại bảng cũ.
- Draft đã đúng và tự nhiên thì giữ nguyên.
- Bản tin TV/radio, thông báo, khung dẫn truyện giữ giọng trang trọng, không thêm "đấy/nhé".
Cách viết:
- Viết như người Việt thật sự nói trong cảnh đó. Đổi cấu trúc câu thoải mái; giữ ý, bỏ chữ.
- Khẩu ngữ, câu ngắn, độ dài gần bằng bản nháp để vừa bong bóng. Tiểu từ tình thái (à, ừ, nhỉ, nhé, đấy, mà, chứ, cơ, hả, thôi, luôn) đúng chỗ, không câu nào cũng nhét.
- Bỏ văn dịch máy: "của cậu/của tôi" thừa, "một cách", "điều đó", "việc", "có thể" thừa, "đã/đang/sẽ" thừa, "coi như là", "có vẻ như", từ Hán Việt trang trọng trong chuyện đời thường.
- Lời nghĩ thầm viết như độc thoại trong đầu (gọn, có thể bỏ chủ ngữ). Dẫn truyện/TV/radio viết văn kể gọn.
- Cảm thán, trêu, mắng phải có lực; dùng cách nói tương đương của tiếng Việt nếu hợp nhân vật.
- Viết hoa bình thường, KHÔNG viết hoa toàn bộ. Giữ "...", "?!". Giữ tên riêng và -san/-kun/-chan.
Ví dụ cứng → tự nhiên:
"Tôi không thể tin được là bạn đã thực sự làm điều đó." → "Không tin nổi là cậu làm thật luôn đấy."
"Điều đó là không thể nào!" → "Làm gì có chuyện đó!"
"Nếu bạn không phiền, tôi sẽ giúp bạn như một lời cảm ơn." → "Không phiền thì để tớ giúp, coi như trả ơn nhé."
"Có vẻ như anh ấy đã quên mất cuộc hẹn của chúng tôi." (nghĩ thầm) → "Chắc lại quên béng vụ hẹn rồi..."
Trả về mảng lines đúng bằng số mục nhận được, cùng thứ tự, mỗi phần tử là câu đã viết lại.`;
const POLISH_JOB = {
  system: POLISH_SYSTEM, name: 'lines',
  schema: {
    type: 'object', additionalProperties: false, required: ['lines', 'glossary'],
    properties: { lines: { type: 'array', items: { type: 'string' } }, glossary: { type: 'string' } },
  },
};

// Never loses a translation: any failure or a wrong line count keeps the draft (and the old glossary).
// glossary: pronoun pairs agreed on earlier pages of this tab; returned updated for the next pages.
async function polish(provider, key, model, bubbles, context, glossary = '') {
  if (!bubbles.length) return { bubbles, glossary };
  try {
    const P = typeof provider === 'string' ? PROVIDERS[provider] : provider; // id (default URL) or providerFor()
    const prompt = (glossary ? `BẢNG XƯNG HÔ:\n${glossary}\n\n` : '') + (context ? `Lời thoại trang trước:\n${context}\n\n` : '')
      + 'Các bong bóng:\n' + JSON.stringify(bubbles.map((b) => ({ src: b.src || '', draft: b.text })));
    const raw = await P.translate(key, model, null, prompt, undefined, POLISH_JOB);
    const out = JSON.parse(raw.replace(/^\s*```(?:json)?|```\s*$/g, ''));
    const g = typeof out.glossary === 'string' && out.glossary.trim() ? out.glossary.trim().slice(0, 1500) : glossary; // cap: it rides in every later prompt
    const { lines } = out;
    if (!Array.isArray(lines) || lines.length !== bubbles.length || lines.some((l) => typeof l !== 'string' || !l.trim())) return { bubbles, glossary: g };
    return { bubbles: bubbles.map((b, i) => ({ ...b, text: lines[i].trim() })), glossary: g };
  } catch {
    return { bubbles, glossary };
  }
}

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Fallback for cross-origin images the page canvas can't read; host_permissions lets the worker fetch them.
async function fetchImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Không tải được ảnh: HTTP ' + r.status);
  return { data: b64(await r.arrayBuffer()), mime: (r.headers.get('content-type') || 'image/jpeg').split(';')[0] };
}

const TIMEOUT_S = 150; // a hung or very slow model must surface as an error, not an endless "Đang dịch…"

async function api(url, init) {
  const secs = init.timeoutS ?? TIMEOUT_S;
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(secs * 1000) });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error(`Model không trả lời sau ${secs} giây — chọn model nhanh hơn trong popup.`);
    throw new Error('Không kết nối được tới API: ' + e.message);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || 'HTTP ' + res.status);
  return body;
}

const json = (headers, body, timeoutS) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), timeoutS });

// A probe image is tiny: a model that needs more than this for it is unusable on real pages
// (a real run saw gemini-3.7-flash hang the full 150s while flash-lite did a whole page in 3.5s).
const PROBE_TIMEOUT_S = 30;

const anthropicHeaders = (key) => ({
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
});

// Real check that a model reads images, returns our JSON and places boxes: two bubbles at known spots.
const PROBE_W = 600, PROBE_H = 400;
const PROBE_BUBBLES = [ // [cx, cy, rx, ry, line1, line2]
  [160, 120, 130, 80, 'WHERE ARE', 'YOU GOING?!'],
  [440, 290, 130, 80, "I'M GOING", 'HOME NOW.'],
];
async function testImage() {
  const c = new OffscreenCanvas(PROBE_W, PROBE_H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, PROBE_W, PROBE_H);
  g.lineWidth = 4; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
  for (const [cx, cy, rx, ry, l1, l2] of PROBE_BUBBLES) {
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.strokeStyle = '#000'; g.stroke();
    g.fillStyle = '#000'; g.fillText(l1, cx, cy - 6); g.fillText(l2, cx, cy + 30);
  }
  return { data: b64(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()), mime: 'image/png' };
}

function parseBubbles(text) {
  const { bubbles } = JSON.parse(text.replace(/^\s*```(?:json)?|```\s*$/g, '')); // some models wrap JSON in fences
  if (!Array.isArray(bubbles)) throw new Error('Model trả JSON sai định dạng.');
  // box_2d (0-1000) -> x/y/w/h in % for the page overlay. Values far outside 0-1000 mean the model used
  // another scale (e.g. pixels): drop the box instead of clamping it into a page-covering white block.
  // A box over 25% of the page is never one speech bubble (largest on the test page is ~3.4%).
  const c = (v) => Math.min(1000, Math.max(0, v)) / 10;
  return bubbles.flatMap(({ box_2d: b, text: t, src }) => {
    if (!t?.trim() || !Array.isArray(b) || b.length !== 4 || !b.every((v) => Number.isFinite(v) && v >= -10 && v <= 1010)) return [];
    const [y0, x0, y1, x1] = [c(Math.min(b[0], b[2])), c(Math.min(b[1], b[3])), c(Math.max(b[0], b[2])), c(Math.max(b[1], b[3]))];
    const w = x1 - x0, h = y1 - y0;
    return w > 0 && h > 0 && w * h <= 2500 ? [{ x: x0, y: y0, w, h, text: t.trim(), ...(src && { src }) }] : [];
  });
}

async function probe({ provider, key, model, base }) {
  const bubbles = parseBubbles(await providerFor(provider, base).translate(key, model, await testImage(), 'Đây là trang đầu tiên.', PROBE_TIMEOUT_S));
  if (!bubbles.length) throw new Error('Model không đọc được chữ trong ảnh thử.');
  // every probe bubble must get a box whose centre lands inside it
  const hit = ([cx, cy, rx, ry]) => bubbles.some((b) => {
    const x = (b.x + b.w / 2) * PROBE_W / 100, y = (b.y + b.h / 2) * PROBE_H / 100;
    return Math.abs(x - cx) <= rx && Math.abs(y - cy) <= ry;
  });
  if (!PROBE_BUBBLES.every(hit)) throw new Error('Model đặt ô dịch sai vị trí trong ảnh thử.');
  return bubbles.map((b) => b.text).join(' / ');
}

// OpenAI, OpenRouter, Groq, custom: same chat-completions wire format, only base URL, model filter and
// extras differ. rank(m): lower sorts first (e.g. free models before paid); ties go newest first.
// Every provider reads its endpoint from this.base so the user can point it elsewhere (providerFor).
const bearer = (key) => (key ? { authorization: `Bearer ${key}` } : {}); // local servers (Ollama…) need no key
const openaiCompat = (base, keep, extra = () => ({}), rank = () => 0) => ({
  base,
  listHeaders: bearer,
  async models(key) {
    const { data } = await api(`${this.base}/models`, { headers: bearer(key) });
    return data.filter(keep).sort((a, b) => rank(a) - rank(b) || (b.created ?? 0) - (a.created ?? 0)).map((m) => m.id);
  },
  async translate(key, model, img, prompt, timeoutS, job = PAGE_JOB) {
    const body = await api(`${this.base}/chat/completions`, json(bearer(key), {
      model,
      messages: [
        { role: 'system', content: job.system },
        { role: 'user', content: [...(img ? [{ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } }] : []), { type: 'text', text: prompt }] },
      ],
      response_format: { type: 'json_schema', json_schema: { name: job.name, strict: true, schema: job.schema } },
      ...extra(model),
    }, timeoutS));
    if (body.choices?.[0]?.finish_reason === 'length') throw new Error('Model hết giới hạn token trước khi dịch xong trang này.');
    const msg = body.choices?.[0]?.message;
    if (!msg?.content) throw new Error(msg?.refusal || 'Model không trả về bản dịch.');
    return msg.content;
  },
});

// Sort Gemini ids by version number (gemini-3 before gemini-2.5); unversioned aliases go last.
const geminiVer = (id) => parseFloat(id.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);

const PROVIDERS = {
  anthropic: {
    base: 'https://api.anthropic.com/v1',
    listHeaders: anthropicHeaders,
    async models(key) {
      const { data } = await api(`${this.base}/models?limit=1000`, { headers: anthropicHeaders(key) });
      // API lists newest first and reports capabilities per model
      return data.filter((m) => m.capabilities?.image_input?.supported && m.capabilities?.structured_outputs?.supported).map((m) => m.id);
    },
    async translate(key, model, img, prompt, timeoutS, job = PAGE_JOB) {
      const body = await api(`${this.base}/messages`, json(
        anthropicHeaders(key),
        {
          model,
          max_tokens: 16000,
          system: job.system,
          output_config: { format: { type: 'json_schema', schema: job.schema } },
          messages: [{ role: 'user', content: [...(img ? [{ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } }] : []), { type: 'text', text: prompt }] }],
        },
        timeoutS,
      ));
      if (body.stop_reason === 'refusal') throw new Error('Model từ chối dịch trang này.');
      return body.content.find((b) => b.type === 'text').text;
    },
  },
  // OpenAI's /models has no capability fields: this name filter only skips obvious non-chat families;
  // probe() is what actually decides whether a model works.
  openai: openaiCompat('https://api.openai.com/v1', (m) =>
    /^(gpt-|o\d|chatgpt)/.test(m.id) && !/audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation/.test(m.id)),
  gemini: {
    base: 'https://generativelanguage.googleapis.com/v1beta',
    listHeaders: (key) => ({ 'x-goog-api-key': key }),
    async models(key) {
      const { models } = await api(`${this.base}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
      // No image-input or date field in Gemini's model list: keep generateContent models, order by the
      // version in the name; probe() decides which actually work.
      return models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace('models/', ''))
        .filter((id) => /^gemini-/.test(id))
        .sort((a, b) => geminiVer(b) - geminiVer(a) || a.localeCompare(b));
    },
    async translate(key, model, img, prompt, timeoutS, job = PAGE_JOB) {
      const body = await api(`${this.base}/models/${model}:generateContent`, json({ 'x-goog-api-key': key }, {
        systemInstruction: { parts: [{ text: job.system }] },
        contents: [{ role: 'user', parts: [...(img ? [{ inlineData: { mimeType: img.mime, data: img.data } }] : []), { text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: job.schema },
      }, timeoutS));
      const text = body.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || '').join('');
      if (!text) throw new Error('Gemini chặn trang này: ' + (body.promptFeedback?.blockReason || body.candidates?.[0]?.finishReason || 'không rõ'));
      return text;
    },
  },
  // Groq (OpenAI-compatible, has a free tier). Per its docs: GET /models items carry `active`; images go as
  // image_url data URIs; strict json_schema works on its vision models (qwen/qwen3.8-27b); max_tokens is
  // deprecated for max_completion_tokens. The list has no vision flag, so probe() decides which work.
  groq: openaiCompat('https://api.groq.com/openai/v1', (m) => m.active !== false, () => ({ max_completion_tokens: 4096 })),
  // Without max_tokens OpenRouter reserves credit for the model's full output limit (65536 seen in a real
  // run) and rejects low-balance keys. A dense real page's JSON is ~1100 chars; 4096 leaves room for reasoning.
  // :free models cost nothing to reserve, and a reasoning one (nemotron :free) ran out at 4096 on a real page.
  openrouter: openaiCompat('https://openrouter.ai/api/v1', (m) =>
    m.architecture?.input_modalities?.includes('image') && m.supported_parameters?.includes('structured_outputs')
    && !m.id.endsWith(':batch'), (model) => ({ max_tokens: model.endsWith(':free') ? 16000 : 4096 }),
    // free first: priced at 0 per the model list itself (also catches openrouter/free, which has no :free suffix)
    (m) => (+m.pricing?.prompt === 0 && +m.pricing?.completion === 0 ? 0 : 1)),
  // Any OpenAI-compatible server the user points at (Ollama, LM Studio, vLLM, a proxy…). No default URL.
  custom: openaiCompat('', () => true, () => ({ max_tokens: 4096 })),
};

// Model ids from any common list shape: {data:[…]} (OpenAI), {models:[…]} (Gemini), a bare array;
// items as strings or objects with id/name. Order kept as the server sent it.
function anyIds(j, stripModelsPrefix) {
  const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
  const ids = arr.map((m) => (typeof m === 'string' ? m : m?.id || m?.name)).filter((x) => typeof x === 'string' && x.trim());
  return [...new Set(stripModelsPrefix ? ids.map((x) => x.replace(/^models\//, '')) : ids)];
}

// A provider talking to `base` (user setting) instead of its default. Only http(s) URLs are accepted.
// A gateway/proxy behind a custom base (e.g. gatecheap.vn/v1) lists models without the vendor-specific
// fields our filters need (capabilities, supportedGenerationMethods, pricing…), and may serve other
// vendors' models too, so its list is read with anyIds() and nothing is filtered: probe() decides.
function providerFor(id, base) {
  const P = PROVIDERS[id];
  if (!P) throw new Error('Nhà cung cấp không hợp lệ: ' + id);
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (!b || b === P.base) {
    if (!P.base) throw new Error('Chưa nhập Base URL cho nhà cung cấp tùy chỉnh.');
    return P;
  }
  let u;
  try { u = new URL(b); } catch { throw new Error('Base URL không hợp lệ: ' + b); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Base URL phải bắt đầu bằng http:// hoặc https://');
  return Object.create(P, {
    base: { value: b },
    models: {
      value: async function (key) {
        try {
          return anyIds(await api(`${this.base}/models`, { headers: P.listHeaders(key) }), id === 'gemini');
        } catch (e) {
          // most OpenAI-style servers live under /v1; a bare host usually answers 404 with an HTML page
          if (/404/.test(e.message) && !/\/v\d+[a-z]*$/i.test(this.base)) throw new Error(`${e.message} — thử thêm /v1 vào cuối Base URL (vd ${this.base}/v1)`);
          throw e;
        }
      },
    },
  });
}

// Cache by image content + model: MangaDex recreates <img> tags for pages you go back to, and F5 reloads
// them, so without this the same page is paid for again. Entries are ~1-2 KB; keep the newest CACHE_MAX.
const CACHE_MAX = 500;
async function cacheKey(model, data) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
  return 'c:' + model + ':' + [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function cachePut(key, bubbles) {
  await chrome.storage.local.set({ [key]: { t: Date.now(), bubbles } });
  const all = await chrome.storage.local.get(null);
  const entries = Object.keys(all).filter((k) => k.startsWith('c:'));
  if (entries.length > CACHE_MAX) {
    await chrome.storage.local.remove(entries.sort((a, b) => all[a].t - all[b].t).slice(0, entries.length - CACHE_MAX));
  }
}

// Returns { bubbles, glossary }. glossary (pronoun pairs for this tab) only changes when polish runs.
async function translate({ data, mime, url, context, glossary = '' }) {
  if (!data) ({ data, mime } = await fetchImage(url));
  const { provider = 'anthropic', keys = {}, models = {}, bases = {}, polish: doPolish = true } = await chrome.storage.local.get(['provider', 'keys', 'models', 'bases', 'polish']);
  if ((!keys[provider] && provider !== 'custom') || !models[provider]) throw new Error('Chưa nhập API key / chọn model (bấm icon extension).');
  const P = providerFor(provider, bases[provider]);
  const key = await cacheKey(models[provider] + (doPolish ? '+p' : ''), data);
  const hit = (await chrome.storage.local.get(key))[key];
  if (hit) return { bubbles: hit.bubbles, glossary }; // same page already translated by this model: no API call
  const prompt = context ? `Lời thoại trang trước (giữ xưng hô nhất quán):\n${context}` : 'Đây là trang đầu tiên.';
  let bubbles = parseBubbles(await P.translate(keys[provider], models[provider], { data, mime }, prompt, undefined, pageJob(doPolish)));
  if (doPolish) {
    const before = glossary;
    ({ bubbles, glossary } = await polish(P, keys[provider], models[provider], bubbles, context, glossary));
    // This page just added pronoun pairs: polish it once more under them, so it follows its own decision.
    // (gemini-3.1-flash-lite, real page, 3 runs: 1-2 mixed lines left after one pass, 0 after this.)
    if (glossary !== before) ({ bubbles, glossary } = await polish(P, keys[provider], models[provider], bubbles, context, glossary));
  }
  await cachePut(key, bubbles);
  return { bubbles, glossary };
}

// Bump together with POPUP_API in popup.js whenever the messages change. An unpacked extension's popup
// reads its files fresh from disk, but this service worker keeps running the old code until the extension
// is reloaded; a real report ("Cannot read properties of undefined (reading 'translate')") was a new popup
// talking to an old worker that had no 'custom' provider.
const API = 4;

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  const job = msg.type === 'hello' ? Promise.resolve({ api: API })
    : msg.type === 'translate' ? translate(msg)
    : msg.type === 'models' ? Promise.resolve().then(() => providerFor(msg.provider, msg.base).models(msg.key)).then((list) => ({ list }))
    : msg.type === 'probe' ? probe(msg).then((sample) => ({ sample }))
    : msg.type === 'defaults' ? Promise.resolve({ bases: Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.base])) })
    : null;
  if (!job) return;
  job.then(send, (e) => send({ error: String(e.message || e) }));
  return true; // keep channel open for async reply
});
