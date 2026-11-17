const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg).then((r) => { if (r.error) throw new Error(r.error); return r; });
let st;

// Real test call (reads text AND places boxes on a 2-bubble image). Resolves to seconds taken.
async function probe(p, model) {
  const t0 = Date.now();
  const { sample } = await send({ type: 'probe', provider: p, key: st.keys[p], model });
  return { secs: (Date.now() - t0) / 1000, sample };
}

async function save(p, model) {
  st.models[p] = model;
  await chrome.storage.local.set({ models: st.models });
  $('model').value = model;
}

async function tryModel(p, model) {
  $('msg').textContent = `Đang gọi thử ${model}…`;
  const { secs, sample } = await probe(p, model);
  await save(p, model);
  $('msg').textContent = `✓ ${model} đạt, ảnh thử mất ${secs.toFixed(1)}s (dịch thử: "${sample}")`;
}

// Ask the provider which models this key can use; keep the saved (already tested) pick, else test the
// newest in parallel batches of 6 until some pass, and take the FASTEST that passes (newest alone picked a
// 64s/page model in a real run; on a free Gemini key the 6 newest all failed while flash-lite did 3.5s/page).
async function loadModels() {
  const p = $('provider').value, key = st.keys[p];
  $('model').innerHTML = '';
  $('msg').textContent = key ? 'Đang tải danh sách model…' : 'Nhập API key rồi bấm Lưu.';
  if (!key) return;
  try {
    const { list } = await send({ type: 'models', provider: p, key });
    $('model').append(...list.map((id) => new Option(id, id)));
    if (list.includes(st.models[p])) {
      $('model').value = st.models[p];
      $('msg').textContent = `✓ Đang dùng ${st.models[p]}`;
      return;
    }
    if (!list.length) { $('msg').textContent = 'Key này không có model nào phù hợp.'; return; }
    const results = [];
    for (let i = 0; i < list.length && i < 24 && !results.some((r) => !r.err); i += 6) { // cap: 4 batches
      const batch = list.slice(i, i + 6);
      $('msg').textContent = `Đang gọi thử model ${i + 1}–${i + batch.length} / ${list.length}…`;
      results.push(...await Promise.all(batch.map((m) => probe(p, m).then((r) => ({ m, ...r }), (e) => ({ m, err: e.message })))));
    }
    const ok = results.filter((r) => !r.err).sort((a, b) => a.secs - b.secs);
    if (ok.length) await save(p, ok[0].m);
    $('msg').textContent = (ok.length ? `✓ Chọn ${ok[0].m} (nhanh nhất trong số đạt). Đổi được ở danh sách trên.\n` : 'Không model nào đạt:\n') +
      results.map((r) => (r.err ? `✗ ${r.m}: ${r.err.split('\n')[0].slice(0, 90)}` : `✓ ${r.m}: ${r.secs.toFixed(1)}s`)).join('\n'); // quota errors run 6+ lines
  } catch (e) {
    $('msg').textContent = 'Lỗi: ' + e.message;
  }
}

(async () => {
  st = await chrome.storage.local.get(['provider', 'keys', 'models', 'polish']);
  $('polish').checked = st.polish ?? true;
  st.keys ||= {};
  st.models ||= {};
  $('provider').value = st.provider || 'anthropic';
  $('key').value = st.keys[$('provider').value] || '';
  loadModels();
})();

$('provider').onchange = async () => {
  const p = $('provider').value;
  $('key').value = st.keys[p] || '';
  await chrome.storage.local.set({ provider: p });
  loadModels();
};

$('save').onclick = async () => {
  st.keys[$('provider').value] = $('key').value.trim();
  await chrome.storage.local.set({ keys: st.keys, provider: $('provider').value });
  loadModels();
};

$('polish').onchange = () => chrome.storage.local.set({ polish: $('polish').checked });

$('model').onchange = async () => {
  const p = $('provider').value, picked = $('model').value;
  try { await tryModel(p, picked); } catch (e) {
    $('msg').textContent = `✗ ${picked} không dùng được: ${e.message}`;
    $('model').value = st.models[p] ?? '';
  }
};

$('go').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  window.close();
};
