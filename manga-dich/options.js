// Settings page (opens in its own tab, so nothing typed is lost when focus moves away).
// Every input saves to chrome.storage.local as you type; the popup and running pages read from there.
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg).then((r) => { if (r?.error) throw new Error(r.error); return r; });
const API = 8; // must equal API in background.js

const KEY_PAGES = {
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
  groq: 'https://console.groq.com/keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};
const CUSTOM_HINT = 'Bắt buộc. Dán đúng Base URL trong tài liệu của server: phần địa chỉ đứng trước /chat/completions (mỗi bên một kiểu). Ví dụ trên máy bạn: Ollama http://localhost:11434/v1 · LM Studio http://localhost:1234/v1';
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
  $('base').placeholder = defaults[p] || 'Base URL theo tài liệu của server';
  $('base-hint').textContent = p === 'custom' ? CUSTOM_HINT : BASE_HINT;
  $('getkey').hidden = !KEY_PAGES[p];
  $('getkey').href = KEY_PAGES[p] || '#';
  $('model').value = st.models[p] || '';
  $('polish-model').value = (st.polishModels || {})[p] || '';
  $('polish-msg').textContent = '';
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

// ---------- polish model (text-only rewrite) ----------
const savePolishModel = debounce(async () => {
  st.polishModels ||= {};
  st.polishModels[prov()] = $('polish-model').value.trim();
  await store({ polishModels: st.polishModels });
}, 400);
$('polish-model').addEventListener('input', savePolishModel);
$('test-polish').onclick = async () => {
  const p = prov(), m = $('polish-model').value.trim() || st.models[p];
  if (!m) { $('polish-msg').textContent = 'Chưa có model nào.'; return; }
  $('polish-msg').className = 'status'; $('polish-msg').textContent = `Đang gọi thử ${m}…`;
  try {
    const t0 = Date.now();
    const { sample } = await send({ type: 'probe-text', provider: p, key: st.keys[p], base: st.bases[p], model: m });
    $('polish-msg').className = 'status ok';
    $('polish-msg').textContent = `✓ ${m} (${((Date.now() - t0) / 1000).toFixed(1)}s): “${sample}”`;
  } catch (e) { $('polish-msg').className = 'status err'; $('polish-msg').textContent = `✗ ${m}: ${e.message.split('\n')[0]}`; }
};

// ---------- switches ----------
for (const id of ['polish', 'recover', 'sfx', 'textOnly', 'skipVi', 'stream', 'fastRead']) $(id).onchange = () => store({ [id]: $(id).checked });
$('ahead').onchange = () => {
  const n = Math.max(0, Math.min(10, Math.round(+$('ahead').value || 0)));
  $('ahead').value = n;
  store({ ahead: n });
};
$('mangaFont').onchange = () => store({ font: $('mangaFont').checked ? 'manga' : 'system' });

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
  for (const id of ['mem-glossary', 'mem-names', 'mem-notes', 'mem-chars', 'mem-reset']) $(id).disabled = off;
  if (off) return;
  const { mem } = await send({ type: 'mem', site });
  $('mem-glossary').value = mem.glossary || '';
  $('mem-names').value = (mem.names || []).join(', ');
  $('mem-notes').value = (mem.notes || []).join('\n');
  $('mem-chars').value = mem.chars || '';
  renderExamples(site, mem.examples || []);
}
function renderExamples(site, list) {
  $('mem-examples').replaceChildren(...(list.length ? list.slice().reverse().map((e) => {
    const c = document.createElement('span'); c.className = 'chip'; c.title = e.src || '';
    c.textContent = `“${e.ai}” → “${e.fix}”`;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Bỏ câu sửa này');
    x.onclick = async () => {
      const rest = list.filter((v) => v !== e);
      await send({ type: 'mem-save', site, mem: { examples: rest } });
      renderExamples(site, rest); flashSaved();
    };
    c.append(x);
    return c;
  }) : [Object.assign(document.createElement('span'), { className: 'muted', textContent: 'Chưa có. Bấm đúp vào một bản dịch trên trang truyện để sửa.' })]));
}
// Only the fields you edited are sent: the others may be stale (the view doesn't refresh while you type), and
// sending them overwrote what the AI had just learnt on a page translating meanwhile.
const edited = new Set();
const fields = {
  glossary: () => $('mem-glossary').value.trim(),
  names: () => $('mem-names').value.split(',').map((s) => s.trim()).filter(Boolean),
  notes: () => $('mem-notes').value.split('\n').map((s) => s.trim()).filter(Boolean),
  chars: () => $('mem-chars').value.trim(),
};
const saveMem = debounce(async () => {
  const site = $('mem-site').value;
  if (!site || !edited.size) return;
  const mem = Object.fromEntries([...edited].map((k) => [k, fields[k]()]));
  edited.clear();
  await send({ type: 'mem-save', site, mem });
  flashSaved();
}, 600);
for (const k of Object.keys(fields)) $('mem-' + k).addEventListener('input', () => { edited.add(k); saveMem(); });
$('mem-site').onchange = () => { edited.clear(); loadMemSite(); }; // pending edits belong to the series you left
$('mem-reset').onclick = async () => {
  const site = $('mem-site').value;
  if (!site || !confirm(`Xoá toàn bộ xưng hô và tên riêng AI đã học cho “${$('mem-site').selectedOptions[0]?.textContent || site}”?`)) return;
  await send({ type: 'mem-reset', site });
  await loadMemSite(); flashSaved();
};

$('shortcuts').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
$('reload').onclick = () => chrome.runtime.reload();

(async () => {
  const hello = await chrome.runtime.sendMessage({ type: 'hello' }).catch(() => null);
  if (hello?.api !== API) { $('stale').hidden = false; return; }
  st = await chrome.storage.local.get(['provider', 'keys', 'models', 'bases', 'polishModels', 'polish', 'sfx', 'textOnly', 'recover', 'skipVi', 'stream', 'fastRead', 'autoSites', 'font', 'ahead']);
  st.keys ||= {}; st.models ||= {}; st.bases ||= {};
  ({ bases: defaults } = await send({ type: 'defaults' }).catch(() => ({ bases: {} })));
  const radio = document.querySelector(`input[name=provider][value="${st.provider || 'gemini'}"]`);
  if (radio) radio.checked = true;
  showProvider(prov());
  $('polish').checked = st.polish ?? true;
  $('recover').checked = st.recover ?? true;
  $('sfx').checked = st.sfx ?? true;
  $('textOnly').checked = st.textOnly ?? true;
  for (const id of ['skipVi', 'stream', 'fastRead']) $(id).checked = st[id] ?? true;
  $('ahead').value = st.ahead ?? 2;
  $('mangaFont').checked = (st.font || 'manga') !== 'system';
  renderSites();
  const { sites } = await send({ type: 'mem-list' }).catch(() => ({ sites: [] }));
  const want = new URLSearchParams(location.search).get('site');
  const all = sites.slice();
  if (want && !all.some((s) => s.key === want)) all.unshift({ key: want, label: '' });
  // "Kaoru Hana wa Rin to Saku · mangadex.org"; memories from before 0.5.1 were per site: "mangadex.org (cả site)"
  const name = ({ key, label }) => (key.includes('/') ? `${label || key.split('/').pop()} · ${key.split('/')[0]}` : `${key} (cả site)`);
  all.sort((a, z) => name(a).localeCompare(name(z)));
  $('mem-site').replaceChildren(...(all.length ? all.map((s) => new Option(name(s), s.key)) : [new Option('Chưa có bộ nào - dịch vài trang trước', '')]));
  if (want) $('mem-site').value = want;
  loadMemSite();
  // The page translating in another tab keeps teaching the AI: show it live (this page used to show what was
  // stored when it was opened, so new pairs and fixed names never appeared). Not while you are typing.
  const typing = () => ['mem-glossary', 'mem-names', 'mem-notes', 'mem-chars'].includes(document.activeElement?.id);
  const refresh = debounce(async () => {
    const keep = $('mem-site').value;
    const { sites: now } = await send({ type: 'mem-list' }).catch(() => ({ sites: [] }));
    now.sort((a, z) => name(a).localeCompare(name(z)));
    $('mem-site').replaceChildren(...now.map((s) => new Option(name(s), s.key)));
    $('mem-site').value = keep;
    if (!typing()) loadMemSite();
  }, 800);
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && Object.keys(ch).some((k) => k.startsWith('mem:'))) refresh(); });
})();

// version from the manifest (one source of truth, bumped per release)
try { const m = chrome.runtime.getManifest(); document.getElementById('ver').textContent = 'v' + (m.version_name || m.version); /* -beta until released */ } catch { /* outside the extension */ }
