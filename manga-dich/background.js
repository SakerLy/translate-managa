// Raw fetch instead of provider SDKs: a plain MV3 extension has no bundler step.
// Format rules ride at the TOP of the system prompt and the worked example spells out the full JSON
// object. Measured on a truth-scored page (glm-4.6v via gateway, 3 runs each): the old prompt -
// style first, geometry appended as one long sentence, example described but not shown - parsed
// only 1/3 runs (the other 2 came back as made-up plain-text "[box] text" lines); this version
// parsed 3/3 with recall 95% / precision 97%. Style rules stay out of the geometry block.
const SYSTEM = `Bạn là dịch giả truyện tranh (manga/manhwa/manhua) chuyên nghiệp sang tiếng Việt.
Nhiệm vụ: nhìn trang truyện, tìm MỌI khối chữ, rồi dịch sang tiếng Việt và trả về JSON.

QUY TẮC ĐỊNH DẠNG (bắt buộc):
- Trả về DUY NHẤT một khối JSON hợp lệ, không thêm chữ nào trước/sau:
{"bubbles": [{"box_2d": [ymin, xmin, ymax, xmax], "text": "bản dịch", "style": "hint"}]}
- box_2d = 4 số nguyên 0-1000 theo khung ảnh: (0,0) là góc trên trái, 1000 là mép dưới/phải; ymin/ymax tính từ mép trên, xmin/xmax tính từ mép trái.
- KHÔNG trả plain-text, KHÔNG markdown, KHÔNG giải thích. Chỉ JSON.

QUY TẮC DÒ TRANG:
- Dò hết trang theo từng khung truyện (từ khung trên xuống khung dưới), liệt kê MỌI khối chữ: bong bóng thoại, chữ nghĩ thầm (bong bóng mây), khung dẫn truyện, chữ viết tay nhỏ cạnh nhân vật, SFX.
- Mỗi khối chữ MỘT ô riêng ôm sát chữ - không ôm cả khung truyện, không tràn sang vùng chữ khác, hai ô không chồng nhau.
- Chữ dọc kiểu Nhật: đọc cột từ phải sang trái, mỗi cột từ trên xuống; một ô bao cả cụm chữ dọc đó.
- KHÔNG BỎ SÓT: dòng thoại nhỏ sát mép trang/góc trang, chữ dọc hai bên, caption dưới khung, chữ trên bảng/biển hiệu. Câu hỏi "còn khối chữ nào chưa có ô chưa" - trả lời phải là KHÔNG trước khi trả JSON.
- SFX (từ tượng thanh): chỉ dịch khi ngắn, có ý nghĩa với cảnh; SFX dài hoặc chỉ là trang trí thì bỏ qua.
- Chữ bị che khuất/nhòe: dịch phần đọc được, không đoán mò.

QUY TẮC DỊCH (học theo cách biên tập viên Việt làm):
- Dịch THEO NGHĨA CẢ CÂU, không dịch từng chữ. "よろしくお願いします" giữa hai bạn = "Rất mong cậu giúp đỡ nhé!", không phải "Xin hãy chiếu cố tôi"; "お疲れ" = "Vất vả rồi!"; "ただいま" = "Tôi về đây!"; "いってきます" = "Đi nhé!".
- Câu đùa/chơi chữ: hiểu ý đồ gây cười, viết lại bằng cách nói gây cười TƯƠNG ĐƯƠNG của tiếng Việt; giữ cái cười thay vì giữ từng từ.
- Cảm thán ngắn: "えっ"="Hả?", "うそ"="Xạo!", "なるほど"="Ra thế…", "やばい"="Chết tiệt!"/"Khủng khiếp!" tùy cảnh.
- Văn nói tự nhiên, đúng giọng và tính cách nhân vật; con đường phố chửi "この野郎" = "Đm mày!" khi hợp bối cảnh, không nuốt tròn.
- Xưng hô theo quan hệ và bối cảnh: bạn bè (tao/mày, tớ/cậu), người lạ/lịch sự (tôi/anh, tôi/cô), gia đình, cấp trên; truyện cổ trang/tu tiên dùng ta/ngươi, tại hạ, sư huynh...
- TÊN RIÊNG KHÔNG DỊCH: tên nhân vật, địa danh (Shibuya, Shinjuku), tên trường/nhóm/hãng. Chữ Hán tên riêng giữ cách đọc phổ biến (Ling Yu, không dịch nghĩa). Giữ hậu tố -san, -kun, -chan, senpai.
- Danh xưng anh/chị/em theo TUỔI và QUAN HỆ thấy trong tranh; không rõ thì giữ cách gọi trung tính.
- Câu ngắn gọn để vừa bong bóng. Giữ cảm thán, ngập ngừng ("...", "!?").
- Lời nghĩ thầm đặt trong ngoặc đơn (...) nếu bản gốc có; khung dẫn truyện/bản tin giữ văn kể gọn.
- Bỏ qua watermark, chữ ký nhóm dịch, số trang.

STYLE (mục "style" của từng khối chữ, chỉ dùng đúng các giá trị này):
- "big": chữ to (khóc gào, thét) - "shout": chữ in đậm góc cạnh đang gào - hai cái này khác nhau.
- "small": chữ nhỏ/thì thầm/chú thích cạnh nhân vật - "whisper": chữ mảnh nói khẽ.
- "narration": khung dẫn truyện/TV/bản tin. "vertical": chữ dọc gốc Nhật. Thoại thường: bỏ trống style.

VÍ DỤ (bong bóng có chữ nằm ở nửa trên bên trái, chiếm khoảng nửa chiều rộng ảnh):
{"bubbles": [{"box_2d": [100, 50, 300, 500], "text": "Cậu định đi đâu vậy?", "style": ""}]}`;
// box_2d [ymin, xmin, ymax, xmax] on a 0-1000 scale is the box format Gemini is trained on (per Google's
// image-understanding docs); free-form x/y/w/h percentages came back misplaced on a real page.
const pageJob = (withSrc) => ({
  name: 'bubbles',
  // src (the original text) is only needed by polish(); it costs ~500 output tokens a page, so skip it otherwise
  system: SYSTEM + ' ' + (withSrc ? 'Mỗi mục thêm "src": chữ gốc đúng như trong ảnh (bên cạnh "text" là bản dịch).' : '')
    + ' Đánh dấu "sfx": true cho MỌI mục là từ tượng thanh (SFX) - kể cả SFX dài/trang trí.',
  schema: {
    type: 'object', additionalProperties: false, required: ['bubbles'],
    properties: {
      bubbles: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['box_2d', ...(withSrc ? ['src'] : []), 'text'],
          properties: {
            box_2d: { type: 'array', items: { type: 'number' } },
            ...(withSrc && { src: { type: 'string' } }),
            text: { type: 'string' },
            sfx: { type: 'boolean' }, // true = onomatopoeia/SFX; filtered out when the user turns SFX off
            style: { type: 'string' }, // '' | big | small | shout | whisper | narration | vertical
          },
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
- DỊCH TỰ NHIÊN, KHÔNG WORD-BY-WORD (quan trọng):
  + Chào: "よろしくお願いします" (bạn bè) → "Rất mong cậu giúp đỡ nhé!"; (công sở) → "Rất mong anh/chị chỉ giáo."; "お疲れ様" → "Vất vả rồi!"; "ただいま" → "Tôi về đây!"; "いってらっしゃい" → "Đi cẩn thận nhé!".
  + Cảm thán: "えっ" → "Hả?"; "うそ！" → "Xạo!"; "なるほど" → "Ra thế…"; "やばい" → "Chết tiệt!" / "Khủng khiếp!".
  + Câu đùa: giữ ý đồ gây cười, đổi cách nói cho vui kiểu Việt; KHÔNG dịch word-by-word.
  + Thành ngữ: đổi sang thành ngữ Việt tương đương ("泣きっ面に蜂" → "Vận xui chưa đủ còn thêm hoạ").
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
"Yoroshiku onegaishimasu" (hai bạn mới quen) → "Từ giờ mong cậu chỉ bảo nhiều nhé!"
Trả về DUY NHẤT một khối JSON, không thêm chữ nào trước/sau:
{"lines": ["câu đã viết lại 1", "câu đã viết lại 2"], "glossary": "bảng xưng hô sau trang này"}
"lines" phải đủ đúng số mục nhận được, cùng thứ tự. Không có cặp xưng hô mới thì "glossary" = bảng cũ nguyên văn.`;
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
    let out = JSON.parse(raw.replace(/^\s*```(?:json)?|```\s*$/g, ''));
    // some models answer with the bare lines array despite the schema (seen live: glm-4.6v returned
    // ["Cậu đi đâu đấy?", "Ừ!"] - polish then silently kept every draft). Take it: the glossary
    // just stays the old one, which is the correct fallback anyway.
    if (Array.isArray(out)) out = { lines: out, glossary: '' };
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

// gatecheap-style gateways answer 503/403 with a per-provider quota countdown ("reset after 1m 50s").
// Sleeping through it INSIDE the same call beats burning the queue's 3 fast retries: the page still
// translates on its own instead of ending at "Thử lại". Two sleeps max, ≤5 min each, then give up.
const RESET_IN = /reset after (?:(\d+)m)?\s*(?:(\d+)(?:\s*s)?)?/;
function resetSeconds(msg) {
  const m = RESET_IN.exec(String(msg));
  if (!m) return 0;
  const s = (+(m[1] || 0)) * 60 + (+(m[2] || 0));
  return s > 0 && s <= 300 ? s : 0;
}

async function api(url, init) {
  const secs = init.timeoutS ?? TIMEOUT_S;
  const resets = init.resetLeft ?? 2; // sleeps through quota countdowns still allowed for this call
  for (let tries = 0; ; tries++) {
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(secs * 1000) });
    } catch (e) {
      if (e.name === 'TimeoutError') throw new Error(`Model không trả lời sau ${secs} giây - chọn model nhanh hơn trong popup.`);
      throw new Error('Không kết nối được tới API: ' + e.message);
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    const errMsg = body?.error?.message || body?.msg || '';
    const wait = resetSeconds(errMsg);
    if (wait && tries < resets) { await new Promise((r) => setTimeout(r, (wait + 2) * 1000)); continue; }
    throw new Error(errMsg || 'HTTP ' + res.status);
  }
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

// Fallback for models that answer with plain-text lines instead of the required JSON:
//   [68, 75, 175, 340] "Định đi về đâu vậy?"
//   [110, 60, 320, 320] ("Ừ!")
//   [16, 60, 130, 340] Đi đâu vậy?
// Returns [{box_2d, text}]; [] when nothing looks like a box line (caller keeps the JSON error).
const BOX_LINE = /^\s*\[?\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*\]?\s*[\)\]]?\s*[:\-]?\s*[\(\[]?\s*(.*?)\s*[\)\]]?\s*$/;
function parsePlainLines(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(BOX_LINE);
    if (!m) continue;
    const t = m[5].replace(/^["'“”]|["'“”]$/g, '').trim();
    if (!t) continue;
    const b = [ +m[1], +m[2], +m[3], +m[4] ];
    // same sanity rules as the JSON path: 4 finite numbers roughly on the 0-1000 scale
    if (b.every((v) => Number.isFinite(v) && v >= -10 && v <= 1010)) out.push({ box_2d: b, text: t });
  }
  return out;
}

// Merge duplicates the model produces when it aims two boxes at one bubble or splits one bubble's
// lines into several boxes (real screenshots: a giant box over half the page + small ones inside;
// two boxes 60%+ overlapping with the same text). Percent-space, runs after parseBubbles converts.
//   same text (case/punct-insensitive) + overlap ≥40% of the smaller box -> one bubble: keep the
//     tighter box, OR-in the sfx/style flags.
//   one box inside another ≥90%, different text -> keep whichever carries the longer text (the
//     outer is usually a panel-covering miss; the inner a precise split).
//   overlap ≥85% of the smaller box, different text -> same: longer text wins.
function mergeBubbles(bubbles) {
  if (bubbles.length < 2) return bubbles;
  const norm = (t) => String(t ?? '').toLowerCase().replace(/[.!?…、。！？\s]+/g, '');
  const area = (b) => b.w * b.h;
  const inter = (a, b) => {
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  };
  const out = bubbles.slice();
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length && !merged; j++) {
        const a = out[i], b = out[j];
        const ov = inter(a, b), small = Math.min(area(a), area(b));
        if (!small || ov / small < 0.4) continue;
        const same = norm(a.text) && norm(a.text) === norm(b.text);
        let keep, drop;
        if (same) {
          keep = area(a) <= area(b) ? a : b; // tighter box fits the bubble better
          drop = keep === a ? b : a;
          keep.sfx ||= drop.sfx; keep.style ||= drop.style;
        } else if (ov / small >= 0.9 || ov / small >= 0.85) {
          keep = a.text.length >= b.text.length ? a : b;
          drop = keep === a ? b : a;
          keep.sfx ||= drop.sfx; keep.style ||= drop.style;
        } else continue;
        out.splice(out.indexOf(drop), 1);
        merged = true;
      }
    }
  }
  return out;
}

function parseBubbles(text) {
  // Some models wrap JSON in fences; a few (measured: glm-4.6v via gateway, 2 of 3 runs with the
  // old prompt) ignore the schema entirely and answer with one "[ymin, xmin, ymax, xmax] text" line
  // per bubble. JSON.parse throws on that, so fall back to a line parser before giving up - it
  // recovered both runs verbatim (same boxes as the JSON run would give).
  let out;
  try {
    out = JSON.parse(text.replace(/^\s*```(?:json)?|```\s*$/g, ''));
  } catch (e) {
    const lines = parsePlainLines(text);
    if (lines.length) out = { bubbles: lines };
    else throw e;
  }
  // despite the schema some models answer with a bare array instead of {"bubbles": [...]}, and gateways
  // wrap the array one level deep in their own envelope ({"data": [...]}). Take any bubble-like array.
  const look = (v) => Array.isArray(v) && (!v.length || (v[0] && typeof v[0] === 'object'
    && ('box_2d' in v[0] || 'text' in v[0] || 'box' in v[0])));
  const bubbles = Array.isArray(out) ? out : Array.isArray(out?.bubbles) ? out.bubbles : Object.values(out ?? {}).find(look);
  if (!Array.isArray(bubbles)) {
    // a 200 response carrying the gateway's own error lands here ("số dư không đủ", rate limit…):
    // surface it - it tells the user what's actually wrong, and the queue retries it the same way
    const why = [out?.msg, out?.message, out?.error?.message, typeof out?.error === 'string' ? out.error : '']
      .find((v) => typeof v === 'string' && v.trim());
    throw new Error('Model trả JSON sai định dạng' + (why ? ': ' + why.trim().slice(0, 120) : '.'));
  }
  // A model that answered on a 0-100 percent scale despite the prompt would have every box clamped into
  // the top-left corner; all coordinates <= 100 gives it away (a full manga page never keeps every bubble
  // there). Rescale the whole answer instead of clamping it.
  const vals = bubbles.flatMap((o) => (Array.isArray(o.box_2d) && o.box_2d.length === 4) ? o.box_2d : []);
  const x10 = vals.length && vals.every((v) => Number.isFinite(v) && v >= -10 && v <= 100) ? 10 : 1;
  // box_2d (0-1000) -> x/y/w/h in % for the page overlay. Values far outside 0-1000 mean the model used
  // another scale (e.g. pixels): drop the box instead of clamping it into a page-covering white block.
  // A box over 25% of the page is never one speech bubble (largest on the test page is ~3.4%).
  const c = (v) => Math.min(1000, Math.max(0, v * x10)) / 10;
  const STYLES = new Set(['big', 'small', 'shout', 'whisper', 'narration', 'vertical']);
  const parsed = bubbles.flatMap(({ box_2d: b, text: t, src, sfx, style }) => {
    if (!t?.trim() || !Array.isArray(b) || b.length !== 4 || !b.every((v) => Number.isFinite(v) && v >= -10 && v <= 1010)) return [];
    const [y0, x0, y1, x1] = [c(Math.min(b[0], b[2])), c(Math.min(b[1], b[3])), c(Math.max(b[0], b[2])), c(Math.max(b[1], b[3]))];
    const w = x1 - x0, h = y1 - y0;
    const st = STYLES.has(style) ? style : '';
    return w > 0 && h > 0 && w * h <= 2500 ? [{ x: x0, y: y0, w, h, text: t.trim(), ...(src && { src }), ...(sfx && { sfx: true }), ...(st && { style: st }) }] : [];
  });
  return mergeBubbles(parsed);
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
// A gateway/proxy behind a custom base lists models without the vendor-specific
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
          if (/404/.test(e.message) && !/\/v\d+[a-z]*$/i.test(this.base)) throw new Error(`${e.message} - thử thêm /v1 vào cuối Base URL (vd ${this.base}/v1)`);
          throw e;
        }
      },
    },
  });
}

// Cache by image content + model: MangaDex recreates <img> tags for pages you go back to, and F5 reloads
// them, so without this the same page is paid for again. Entries are ~1-2 KB; keep the newest CACHE_MAX.
// Bump CACHE_V when the prompt changes, so results from the old prompt don't shadow the new ones.
const CACHE_MAX = 500, CACHE_V = 4;
async function cacheKey(model, data) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
  return 'c:' + model + ':v' + CACHE_V + ':' + [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function cachePut(key, bubbles) {
  await chrome.storage.local.set({ [key]: { t: Date.now(), bubbles } });
  const all = await chrome.storage.local.get(null);
  const entries = Object.keys(all).filter((k) => k.startsWith('c:'));
  if (entries.length > CACHE_MAX) {
    await chrome.storage.local.remove(entries.sort((a, b) => all[a].t - all[b].t).slice(0, entries.length - CACHE_MAX));
  }
}

// ---------- học hỏi tích lũy (memory theo site, sống qua reload/chapter) ----------
// Bảng xưng hô + tên riêng + ghi chú văn phong cho mỗi site truyện, lưu trong chrome.storage.local
// dưới khóa "mem:<site>". Mỗi trang: load -> đút vào prompt -> polish -> gộp lại cái mới học được.
// Đây là "AI học sau mỗi lần dịch": chapter sau dùng đúng xưng hô/tên riêng chapter trước đã chốt.
const MEM_MAX = 4000; // ký tự mỗi mục; đủ cho cả series, prompt không phình
async function loadMem(site) {
  if (!site) return { glossary: '', names: [], notes: [] };
  const k = 'mem:' + site;
  const m = (await chrome.storage.local.get(k))[k];
  return { glossary: '', names: [], notes: [], ...(m || {}) };
}
async function saveMem(site, mem) {
  if (!site) return;
  await chrome.storage.local.set({ ['mem:' + site]: {
    glossary: String(mem.glossary ?? '').slice(0, MEM_MAX),
    names: [...new Set((mem.names || []).map(String))].slice(0, 60),
    notes: [...new Set((mem.notes || []).map(String))].slice(0, 30),
  } });
}
// Gộp bài học của trang này vào memory; trả về bản mới để trang sau dùng ngay.
async function learnFromPage(site, mem, glossary, bubbles) {
  if (!site) return mem;
  const next = { ...mem };
  // glossary: giữ dòng MỚI NHẤT cho mỗi cặp (khóa = đầu dòng "A ↔ B")
  const rows = String(glossary || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const byHead = new Map();
  for (const r of rows) byHead.set(r.split(':')[0].trim(), r);
  next.glossary = [...byHead.values()].join('\n').slice(0, MEM_MAX);
  // names: mót tên riêng từ src (chữ CJK dài, chữ Latin viết hoa) - model đã giữ nguyên chúng,
  // liệt kê lại cho trang sau thấy "tên này đã biết, đừng dịch"
  const names = new Set(mem.names || []);
  for (const b of bubbles || []) {
    for (const m of String(b.src || '').matchAll(/([\u4e00-\u9fff\u3040-\u30ff]{2,}|[A-Z][a-zA-Z]{2,})/g)) names.add(m[1]);
  }
  next.names = [...names].slice(0, 60);
  await saveMem(site, next);
  return next;
}
function memBlock(mem) {
  const parts = [];
  if (mem.glossary) parts.push('BẢNG XƯNG HÔ:\n' + mem.glossary);
  if (mem.names?.length) parts.push('TÊN RIÊNG KHÔNG DỊCH: ' + mem.names.join(', '));
  if (mem.notes?.length) parts.push('GHI CHÚ VĂN PHONG:\n' + mem.notes.join('\n'));
  return parts.join('\n\n');
}

// ---------- hàng đợi dịch ----------
// Mọi yêu cầu xếp hàng theo id (chính là key cache: ảnh+model), worker xử lý tối đa QMAX job cùng lúc:
// nhiều tab không dồn API tới hỏng gateway (503/524), trang đang xem được ưu tiên lên đầu, và một câu
// trả lời hỏng tạm thời được tự thử lại - người dùng không gặp lỗi là mấy. Kết quả xong được lưu vào
// cache theo id (bền vững qua reload): lật lại trang đã dịch là hiện ngay, không tốn thêm lần gọi nào.
const QMAX = 2, Q_TRIES = 3;
let Q_RETRY_MS = 5000; // per-try backoff; the unit test shortens it
const pending = [], running = new Set(), waiters = new Map(); // waiters: key -> Set of {resolve, onDraft}
let wakeTimer = null;

async function enqueue(key, job, urgent, resolve, onDraft) {
  // a twin request may have finished while we were getting here: its result is already in the cache
  const hit = (await chrome.storage.local.get(key))[key];
  if (hit) { resolve({ bubbles: hit.bubbles, glossary: job.glossary }); return; }
  let w = waiters.get(key);
  if (!w) waiters.set(key, (w = new Set()));
  w.add({ resolve, onDraft });
  if (running.has(key)) return; // job in flight: our waiter resolves when it does
  const q = pending.find((p) => p.key === key);
  if (q) { // already waiting: just bump priority if asked
    q.urgent ||= urgent;
    if (q.urgent && q !== pending[0]) { pending.splice(pending.indexOf(q), 1); pending.unshift(q); }
    return;
  }
  urgent ? pending.unshift({ key, job, urgent }) : pending.push({ key, job });
  pump();
}

function pump() {
  clearTimeout(wakeTimer);
  while (running.size < QMAX) {
    const i = pending.findIndex((p) => p.urgent || !(p.notBefore > Date.now())); // backoff only defers non-urgent retries
    if (i < 0) { // everything left is in backoff: wake up when the first one is due
      if (pending.length) wakeTimer = setTimeout(pump, Math.min(...pending.map((p) => p.notBefore)) - Date.now());
      return;
    }
    const item = pending.splice(i, 1)[0];
    running.add(item.key);
    run(item);
  }
}

async function run(item) {
  const { key, job } = item;
  try {
    const res = await translateJob(job, (draft) => {
      // the read pass just produced boxes: show them before polish runs (a visible page goes from
      // ~2 calls' latency to 1 - measured on glm-4.6v: draft at 5-8s, polished +2.5s later)
      for (const w of waiters.get(key) || []) w.onDraft?.(draft);
    });
    const w = waiters.get(key);
    waiters.delete(key);
    running.delete(key); // before resolving: a caller arriving now re-checks the cache instead of attaching to a dead waiter
    w?.forEach((f) => f.resolve(res));
  } catch (e) {
    running.delete(key);
    job.tries = (job.tries || 0) + 1;
    if (job.tries < Q_TRIES) {
      // flaky answer (broken JSON, HTTP 524, a 200-wrapped gateway error): retry with backoff, but
      // back in the queue, not asleep in the slot - the other pages keep their turn meanwhile.
      // A quota countdown means waiting it out once beats burning tries: sleep until it resets
      // (resetSeconds is in SECONDS; Q_RETRY_MS is already in ms - do not scale it again).
      const waitS = resetSeconds(String(e.message || ''));
      item.notBefore = Date.now() + (waitS ? waitS * 1000 : job.tries * Q_RETRY_MS);
      pending.unshift(item);
    } else {
      const w = waiters.get(key);
      waiters.delete(key);
      w?.forEach((f) => f.resolve({ error: String(e.message || e) }));
    }
  } finally {
    pump();
  }
}

// translate(): resolve provider + cache check, then hand the work to the queue
async function translate({ data, mime, url, context, glossary = '', site, urgent, onDraft }) {
  if (!data) ({ data, mime } = await fetchImage(url));
  const { provider = 'anthropic', keys = {}, models = {}, bases = {}, polish: doPolish = true, sfx = true }
    = await chrome.storage.local.get(['provider', 'keys', 'models', 'bases', 'polish', 'sfx']);
  if ((!keys[provider] && provider !== 'custom') || !models[provider]) throw new Error('Chưa nhập API key / chọn model (bấm icon extension).');
  // sfx rides in the cache key: the same page under the other setting must not shadow it
  const key = await cacheKey(models[provider] + (doPolish ? '+p' : '') + (sfx ? '' : '-sfx'), data);
  const hit = (await chrome.storage.local.get(key))[key];
  if (hit) return { bubbles: hit.bubbles, glossary }; // same page already translated by this model: no API call
  const job = { key, data, mime, context, glossary, site, provider, base: bases[provider], model: models[provider], apiKey: keys[provider], doPolish, sfx };
  return new Promise((resolve) => enqueue(key, job, urgent, resolve, onDraft));
}

// Returns { bubbles, glossary }. glossary (pronoun pairs for this tab) only changes when polish runs.
// onDraft(bubbles): called with the read pass's boxes as soon as they exist, before polish.
// sfx=false drops the model's SFX-tagged bubbles before polish and before the draft is pushed,
// so both paints and the cache agree on what the user asked to see.
async function translateJob(job, onDraft) {
  const { key, data, mime, context, glossary = '', site, provider, base, model, apiKey, doPolish, sfx = true } = job;
  const P = providerFor(provider, base);
  // memory của site: xưng hô/tên riêng/văn phong học từ các trang & chapter trước
  const mem = await loadMem(site).catch(() => ({ glossary: '', names: [], notes: [] }));
  const head = memBlock(mem);
  const prompt = (head ? head + '\n\n' : '') + (context ? `Lời thoại trang trước (giữ xưng hô nhất quán):\n${context}` : 'Đây là trang đầu tiên.');
  const call = () => P.translate(apiKey, model, { data, mime }, prompt, undefined, pageJob(doPolish));
  let bubbles = parseBubbles(await call());
  // a page that clearly has text but came back with zero boxes is a model flake (seen with gpt-5.6-sol,
  // 1 run in 7): one retry, not a loop - a genuinely textless page pays a second call instead of lying
  if (!bubbles.length) bubbles = parseBubbles(await call());
  if (!sfx) bubbles = bubbles.filter((b) => !b.sfx); // user turned SFX off: drop tagged bubbles
  onDraft?.(bubbles);
  let g = glossary;
  if (doPolish) {
    const before = glossary;
    ({ bubbles, glossary: g } = await polish(P, apiKey, model, bubbles, context, head || glossary));
    // This page just added pronoun pairs: polish it once more under them, so it follows its own decision.
    // (gemini-3.1-flash-lite, real page, 3 runs: 1-2 mixed lines left after one pass, 0 after this.)
    if (g !== before) ({ bubbles, glossary: g } = await polish(P, apiKey, model, bubbles, context, g));
    // học hỏi tích lũy: gộp bảng xưng hô + tên riêng của trang này vào memory của site
    await learnFromPage(site, mem, g, bubbles).catch(() => {});
  }
  await cachePut(key, bubbles);
  return { bubbles, glossary: g };
}

// Bump together with POPUP_API in popup.js whenever the messages change. An unpacked extension's popup
// reads its files fresh from disk, but this service worker keeps running the old code until the extension
// is reloaded; a real report ("Cannot read properties of undefined (reading 'translate')") was a new popup
// talking to an old worker that had no 'custom' provider.
const API = 5;

// Draft-first streaming: content.js opens a port named "md-draft-<imgsrc-hash>" and names it in the
// translate message; while that page's job runs we hold the port and push the read pass's boxes
// through it the moment they exist. A page you're looking at shows text after 1 call instead of 2.
const draftPorts = new Map(); // portName -> port
chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith('md-draft-')) return;
  draftPorts.set(port.name, port);
  port.onDisconnect.addListener(() => draftPorts.delete(port.name));
});
const pushDraft = (portName, bubbles) => {
  const port = draftPorts.get(portName);
  if (!port) return;
  try { port.postMessage({ type: 'draft', bubbles }); } catch { draftPorts.delete(portName); }
};

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  const job = msg.type === 'hello' ? Promise.resolve({ api: API })
    : msg.type === 'translate' ? translate(msg.draftPort ? { ...msg, onDraft: (bubbles) => pushDraft(msg.draftPort, bubbles) } : msg)
    : msg.type === 'models' ? Promise.resolve().then(() => providerFor(msg.provider, msg.base).models(msg.key)).then((list) => ({ list }))
    : msg.type === 'probe' ? probe(msg).then((sample) => ({ sample }))
    : msg.type === 'defaults' ? Promise.resolve({ bases: Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.base])) })
    : msg.type === 'mem' ? loadMem(msg.site).then((m) => ({ mem: m })) // popup: xem AI đã học gì về site này
    : msg.type === 'mem-reset' ? saveMem(msg.site, { glossary: '', names: [], notes: [] }).then(() => ({ ok: true }))
    : null;
  if (!job) return;
  job.then(send, (e) => send({ error: String(e.message || e) }));
  return true; // keep channel open for async reply
});
