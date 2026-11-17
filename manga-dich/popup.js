const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg).then((r) => { if (r.error) throw new Error(r.error); return r; });
let st, defaults = {};

const KEY_PAGES = {
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
  groq: 'https://console.groq.com/keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};
const CUSTOM_HINT = 'Bắt buộc. Ví dụ: Ollama http://localhost:11434/v1 · LM Studio http://localhost:1234/v1 · '
  + 'Gemini https://generativelanguage.googleapis.com/v1beta/openai';

const prov = () => $('provider').value;
const msg = (text, kind = '') => { $('msg').textContent = text; $('msg').className = kind; };
const ready = (p) => Boolean(st.models[p] && (st.keys[p] || p === 'custom'));

function refreshState() {
  const ok = ready(prov());
  $('state').textContent = ok ? 'Sẵn sàng' : 'Chưa cài đặt';
  $('state').classList.toggle('ready', ok);
  $('go').disabled = !ok;
}

function showResults(results) {
  $('results').replaceChildren(...results.map((r) => {
    const li = document.createElement('li');
    li.className = r.err ? 'err' : 'ok';
    li.textContent = r.err ? `✗ ${r.m}: ${r.err.split('\n')[0].slice(0, 120)}` : `✓ ${r.m}: ${r.secs.toFixed(1)}s`; // quota errors run 6+ lines
    return li;
  }));
  $('summary').textContent = `Kết quả gọi thử (${results.filter((r) => !r.err).length}/${results.length} đạt)`;
  $('details').hidden = !results.length;
}

// Fill the form with the saved settings of provider p.
function showProvider(p) {
  $('key').value = st.keys[p] || '';
  $('key').placeholder = p === 'custom' ? 'Không bắt buộc với server chạy trên máy' : 'Dán API key';
  $('base').value = st.bases[p] || '';
  $('base').placeholder = defaults[p] || 'http://localhost:11434/v1';
  $('base-hint').textContent = p === 'custom' ? CUSTOM_HINT : 'Để trống để dùng địa chỉ mặc định (chữ mờ trong ô). Chỉ đổi khi dùng proxy hoặc cổng trung gian.';
  $('getkey').hidden = !KEY_PAGES[p];
  $('getkey').href = KEY_PAGES[p] || '#';
  $('model').value = st.models[p] || '';
  $('models').replaceChildren();
  $('details').hidden = true;
  msg(ready(p) ? `Đang dùng ${st.models[p]}` : (p === 'custom' ? 'Nhập Base URL rồi bấm "Lưu và tìm model".' : 'Nhập API key rồi bấm "Lưu và tìm model".'), ready(p) ? 'ok' : '');
  refreshState();
}

// Real test call (reads text AND places boxes on a 2-bubble image). Resolves to seconds taken.
async function probe(p, model) {
  const t0 = Date.now();
  const { sample } = await send({ type: 'probe', provider: p, key: st.keys[p], base: st.bases[p], model });
  return { secs: (Date.now() - t0) / 1000, sample };
}

async function save(p, model) {
  st.models[p] = model;
  await chrome.storage.local.set({ models: st.models, provider: p });
  $('model').value = model;
  refreshState();
}

async function tryModel(p, model) {
  msg(`Đang gọi thử ${model}…`);
  const { secs, sample } = await probe(p, model);
  await save(p, model);
  msg(`✓ ${model} đạt, ảnh thử mất ${secs.toFixed(1)}s\nDịch thử: "${sample}"`, 'ok');
}

// List the models this key/URL can use; keep the saved (already tested) pick, else test the newest in
// parallel batches of 6 until some pass, and take the FASTEST that passes (newest alone picked a
// 64s/page model in a real run; on a free Gemini key the 6 newest all failed while flash-lite did 3.5s/page).
async function findModels() {
  const p = prov();
  msg('Đang tải danh sách model…');
  let list;
  try {
    ({ list } = await send({ type: 'models', provider: p, key: st.keys[p], base: st.bases[p] }));
  } catch (e) {
    // some servers have no /models: the user can still type a model name
    msg(`Không lấy được danh sách model: ${e.message}\nVẫn có thể gõ tên model vào ô Model.`, 'err');
    return;
  }
  $('models').replaceChildren(...list.map((id) => new Option(id, id)));
  if (list.includes(st.models[p])) { msg(`✓ Đang dùng ${st.models[p]}`, 'ok'); return; }
  if (!list.length) { msg('Không có model nào phù hợp. Có thể gõ tên model vào ô Model.', 'err'); return; }
  const results = [];
  for (let i = 0; i < list.length && i < 24 && !results.some((r) => !r.err); i += 6) { // cap: 4 batches
    const batch = list.slice(i, i + 6);
    msg(`Đang gọi thử model ${i + 1}–${i + batch.length} / ${list.length}…`);
    results.push(...await Promise.all(batch.map((m) => probe(p, m).then((r) => ({ m, ...r }), (e) => ({ m, err: e.message })))));
    showResults(results);
  }
  const ok = results.filter((r) => !r.err).sort((a, b) => a.secs - b.secs);
  if (ok.length) {
    await save(p, ok[0].m);
    msg(`✓ Chọn ${ok[0].m} (nhanh nhất trong số đạt, ${ok[0].secs.toFixed(1)}s). Đổi được ở ô Model.`, 'ok');
  } else {
    msg('Không model nào đạt. Xem kết quả bên dưới, hoặc gõ tên model khác.', 'err');
  }
}

(async () => {
  st = await chrome.storage.local.get(['provider', 'keys', 'models', 'bases', 'polish']);
  st.keys ||= {}; st.models ||= {}; st.bases ||= {};
  ({ bases: defaults } = await send({ type: 'defaults' }).catch(() => ({ bases: {} })));
  $('polish').checked = st.polish ?? true;
  $('provider').value = st.provider || 'gemini';
  showProvider(prov());
  if (!st.models[prov()] && (st.keys[prov()] || st.bases[prov()])) findModels();
})();

$('provider').onchange = async () => {
  await chrome.storage.local.set({ provider: prov() });
  showProvider(prov());
};

$('eye').onclick = () => {
  const show = $('key').type === 'password';
  $('key').type = show ? 'text' : 'password';
  $('eye').textContent = show ? 'Ẩn' : 'Hiện';
  $('eye').setAttribute('aria-label', show ? 'Ẩn key' : 'Hiện key');
};

$('save').onclick = async () => {
  const p = prov();
  st.keys[p] = $('key').value.trim();
  st.bases[p] = $('base').value.trim();
  if (p !== 'custom' && !st.keys[p]) { msg('Cần nhập API key.', 'err'); return; }
  if (p === 'custom' && !st.bases[p]) { msg('Nhà cung cấp tùy chỉnh cần Base URL.', 'err'); return; }
  st.models[p] = ''; // key/URL changed: re-check which models work
  await chrome.storage.local.set({ keys: st.keys, bases: st.bases, models: st.models, provider: p });
  refreshState();
  findModels();
};

$('polish').onchange = () => chrome.storage.local.set({ polish: $('polish').checked });

$('model').onchange = async () => {
  const p = prov(), picked = $('model').value.trim();
  if (!picked || picked === st.models[p]) return;
  try { await tryModel(p, picked); } catch (e) {
    msg(`✗ ${picked} không dùng được: ${e.message.split('\n')[0]}`, 'err');
    $('model').value = st.models[p] ?? '';
  }
};

$('go').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['fit.js', 'content.js'] });
  window.close();
};
