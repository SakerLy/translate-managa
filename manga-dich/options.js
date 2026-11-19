// Settings page (opens in its own tab, so nothing typed is lost when focus moves away).
// Every input saves to chrome.storage.local as you type; the popup and running pages read from there.
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg).then((r) => { if (r?.error) throw new Error(r.error); return r; });
const API = 6; // must equal API in background.js

const KEY_PAGES = {
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
  groq: 'https://console.groq.com/keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};
const CUSTOM_HINT = 'Bắt buộc. Cổng trung gian: dán địa chỉ có /v1 ở cuối. Máy bạn: Ollama http://localhost:11434/v1 · LM Studio http://localhost:1234/v1';
const BASE_HINT = 'Để trống để dùng địa chỉ mặc định (chữ mờ). Cổng trung gian bán key nhiều hãng: chọn “Tùy chỉnh”.';

let st, defaults = {};
const prov = () => document.querySelector('input[name=provider]:checked')?.value || 'gemini';

// ---------- autosave ----------
let savedTimer;
const flashSaved = () => { $('saved').classList.add('on'); clearTimeout(savedTimer); savedTimer = setTimeout(() => $('saved').classList.remove('on'), 1400); };
const store = async (obj) => { await chrome.storage.local.set(obj); flashSaved(); };
const debounce = (f, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

const msg = (text, kind = '') => { $('msg').textContent = text; $('msg').className = 'status ' + kind; };

let run = 0; // bumped by every new search and by switching provider: a stale search stops and can't touch the UI
function showProvider(p) {
  run++;
  rows = [];
  $('find').disabled = false;
  $('key').value = st.keys[p] || '';
  $('key').placeholder = p === 'custom' ? 'Key của cổng (bỏ trống nếu server trên máy)' : 'Dán API key';
  $('base').value = st.bases[p] || '';
  $('base').placeholder = defaults[p] || 'https://.../v1';
  $('base-hint').textContent = p === 'custom' ? CUSTOM_HINT : BASE_HINT;
  $('getkey').hidden = !KEY_PAGES[p];
  $('getkey').href = KEY_PAGES[p] || '#';
  $('model').value = st.models[p] || '';
  $('model-list').replaceChildren();
  $('models').hidden = true;
  msg(st.models[p] ? `✓ Đang dùng ${st.models[p]}` : 'Nhập key (và Base URL nếu cần), rồi bấm “Tìm model tốt nhất”.', st.models[p] ? 'ok' : '');
}

const saveConn = debounce(async () => {
  const p = prov();
  st.keys[p] = $('key').value.trim();
  st.bases[p] = $('base').value.trim();
  await store({ keys: st.keys, bases: st.bases, provider: p });
});
$('key').addEventListener('input', saveConn);
$('base').addEventListener('input', saveConn);

$('providers').addEventListener('change', async () => {
  await store({ provider: prov() });
  showProvider(prov());
});

$('eye').onclick = () => {
  const show = $('key').type === 'password';
  $('key').type = show ? 'text' : 'password';
  $('eye').textContent = show ? 'Ẩn' : 'Hiện';
  $('eye').setAttribute('aria-label', show ? 'Ẩn key' : 'Hiện key');
};

// ---------- models ----------
async function probe(p, model) {
  const t0 = Date.now();
  const { sample } = await send({ type: 'probe', provider: p, key: st.keys[p], base: st.bases[p], model });
  return { secs: (Date.now() - t0) / 1000, sample };
}
async function useModel(p, model) {
  st.models[p] = model;
  $('model').value = model;
  await store({ models: st.models, provider: p });
  renderRows();
}

let rows = []; // [{ m, secs?, err?, sample?, pending? }]
function renderRows() {
  const p = prov();
  $('models').hidden = !rows.length;
  $('models').replaceChildren(...rows.map((r) => {
    const d = document.createElement('div');
    if (r.m === st.models[p]) d.className = 'cur';
    const name = document.createElement('span'); name.className = 'name'; name.textContent = r.m; name.title = r.m;
    const res = document.createElement('span');
    res.className = 'res ' + (r.err ? 'err' : r.secs != null ? 'ok' : '');
    res.textContent = r.pending ? 'đang thử…' : r.err ? '✗ ' + r.err.split('\n')[0] : r.secs != null ? `✓ ${r.secs.toFixed(1)}s` : 'chưa thử';
    res.title = r.err || r.sample || '';
    const b = document.createElement('button');
    b.className = 'btn small'; b.type = 'button';
    b.textContent = r.m === st.models[p] ? 'Đang dùng' : r.secs != null ? 'Dùng' : 'Thử';
    b.disabled = r.pending || r.m === st.models[p];
    b.onclick = () => (r.secs != null ? useModel(p, r.m) : testOne(r));
    d.append(name, res, b);
    return d;
  }));
}
async function testOne(r) {
  const p = prov();
  r.pending = true; renderRows();
  try { Object.assign(r, await probe(p, r.m), { err: undefined }); } catch (e) { r.err = e.message; }
  r.pending = false; renderRows();
  return r;
}

async function loadList() {
  const p = prov();
  if (p !== 'custom' && !st.keys[p]) { msg('Cần nhập API key trước.', 'err'); return null; }
  if (p === 'custom' && !st.bases[p]) { msg('Nhà cung cấp tùy chỉnh cần Base URL.', 'err'); return null; }
  msg('Đang tải danh sách model…');
  try {
    const { list } = await send({ type: 'models', provider: p, key: st.keys[p], base: st.bases[p] });
    $('model-list').replaceChildren(...list.map((id) => new Option(id, id)));
    return list;
  } catch (e) {
    msg(`Không lấy được danh sách model: ${e.message}\nVẫn có thể gõ tên model rồi bấm “Kiểm tra”.`, 'err');
    return null;
  }
}

// Test the list in batches of 6 until some pass; take the FASTEST that passes.
$('find').onclick = async () => {
  saveConn(); await new Promise((r) => setTimeout(r, 450)); // flush a key typed just now
  const p = prov(), my = ++run;
  const list = await loadList();
  if (!list || my !== run) return;
  if (!list.length) { msg('Server không liệt kê model nào. Gõ tên model rồi bấm “Kiểm tra”.', 'err'); return; }
  rows = list.map((m) => ({ m }));
  renderRows();
  $('find').disabled = true;
  try {
    for (let i = 0; i < rows.length && i < 24 && !rows.some((r) => r.secs != null); i += 6) {
      msg(`Đang gọi thử model ${i + 1}–${Math.min(i + 6, rows.length)} / ${rows.length}…`);
      await Promise.all(rows.slice(i, i + 6).map(testOne));
      if (my !== run) return; // provider switched or a new search started meanwhile
    }
    const ok = rows.filter((r) => r.secs != null).sort((a, b) => a.secs - b.secs);
    if (ok.length) {
      await useModel(p, ok[0].m);
      msg(`✓ Chọn ${ok[0].m} - nhanh nhất trong số đạt (${ok[0].secs.toFixed(1)}s).\nDịch thử: “${ok[0].sample}”`, 'ok');
    } else msg('Chưa model nào đạt. Lỗi “quota/reset after…” nghĩa là cổng đang hết lượt: đợi một chút rồi thử lại, hoặc bấm “Thử” từng model.', 'err');
  } finally { if (my === run) $('find').disabled = false; }
};

$('test').onclick = async () => {
  const p = prov(), m = $('model').value.trim();
  if (!m) { msg('Gõ hoặc chọn tên model trước.', 'err'); return; }
  saveConn(); await new Promise((r) => setTimeout(r, 450));
  msg(`Đang gọi thử ${m}…`);
  try {
    const { secs, sample } = await probe(p, m);
    await useModel(p, m);
    msg(`✓ ${m} đạt (${secs.toFixed(1)}s) và đã được chọn.\nDịch thử: “${sample}”`, 'ok');
  } catch (e) { msg(`✗ ${m} không dùng được: ${e.message.split('\n')[0]}`, 'err'); }
};
$('model').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('test').click(); });

// ---------- switches ----------
for (const id of ['polish', 'recover', 'sfx', 'textOnly']) $(id).onchange = () => store({ [id]: $(id).checked });

function renderSites() {
  const list = st.autoSites || [];
  $('sites').replaceChildren(...(list.length ? list.map((s) => {
    const c = document.createElement('span'); c.className = 'chip'; c.textContent = s;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Bỏ ' + s);
    x.onclick = async () => { st.autoSites = list.filter((v) => v !== s); await store({ autoSites: st.autoSites }); renderSites(); };
    c.append(x);
    return c;
  }) : [Object.assign(document.createElement('span'), { className: 'muted', textContent: 'Chưa có site nào.' })]));
}

// ---------- memory ----------
async function loadMemSite() {
  const site = $('mem-site').value;
  const off = !site;
  for (const id of ['mem-glossary', 'mem-names', 'mem-notes', 'mem-reset']) $(id).disabled = off;
  if (off) return;
  const { mem } = await send({ type: 'mem', site });
  $('mem-glossary').value = mem.glossary || '';
  $('mem-names').value = (mem.names || []).join(', ');
  $('mem-notes').value = (mem.notes || []).join('\n');
}
const saveMem = debounce(async () => {
  const site = $('mem-site').value;
  if (!site) return;
  await send({ type: 'mem-save', site, mem: {
    glossary: $('mem-glossary').value.trim(),
    names: $('mem-names').value.split(',').map((s) => s.trim()).filter(Boolean),
    notes: $('mem-notes').value.split('\n').map((s) => s.trim()).filter(Boolean),
  } });
  flashSaved();
}, 600);
for (const id of ['mem-glossary', 'mem-names', 'mem-notes']) $(id).addEventListener('input', saveMem);
$('mem-site').onchange = loadMemSite;
$('mem-reset').onclick = async () => {
  const site = $('mem-site').value;
  if (!site || !confirm(`Xoá toàn bộ xưng hô và tên riêng AI đã học cho ${site}?`)) return;
  await send({ type: 'mem-reset', site });
  await loadMemSite(); flashSaved();
};

$('shortcuts').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
$('reload').onclick = () => chrome.runtime.reload();

(async () => {
  const hello = await chrome.runtime.sendMessage({ type: 'hello' }).catch(() => null);
  if (hello?.api !== API) { $('stale').hidden = false; return; }
  st = await chrome.storage.local.get(['provider', 'keys', 'models', 'bases', 'polish', 'sfx', 'textOnly', 'recover', 'autoSites']);
  st.keys ||= {}; st.models ||= {}; st.bases ||= {};
  ({ bases: defaults } = await send({ type: 'defaults' }).catch(() => ({ bases: {} })));
  const radio = document.querySelector(`input[name=provider][value="${st.provider || 'gemini'}"]`);
  if (radio) radio.checked = true;
  showProvider(prov());
  $('polish').checked = st.polish ?? true;
  $('recover').checked = st.recover ?? true;
  $('sfx').checked = st.sfx ?? true;
  $('textOnly').checked = st.textOnly ?? true;
  renderSites();
  const { sites } = await send({ type: 'mem-list' }).catch(() => ({ sites: [] }));
  const want = new URLSearchParams(location.search).get('site');
  const all = [...new Set([...(want ? [want] : []), ...sites])];
  $('mem-site').replaceChildren(...(all.length ? all.map((s) => new Option(s, s)) : [new Option('Chưa có site nào - dịch vài trang trước', '')]));
  if (want) $('mem-site').value = want;
  loadMemSite();
})();
