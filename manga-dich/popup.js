// Compact popup: start this tab, switch auto-translate for this site, a few live switches.
// Everything that needs typing lives in the settings page (options.html), which opens in a tab and
// survives focus changes - a popup closes and drops unsaved input as soon as you click elsewhere.
const $ = (id) => document.getElementById(id);
const POPUP_API = 8; // must equal API in background.js
const NAMES = { gemini: 'Gemini', openrouter: 'OpenRouter', groq: 'Groq', anthropic: 'Claude', openai: 'OpenAI', custom: 'Tùy chỉnh' };

const openSettings = (hash = '', site = '') => {
  const url = chrome.runtime.getURL('options.html') + (site ? '?site=' + encodeURIComponent(site) : '') + hash;
  chrome.tabs.create({ url });
  window.close();
};
$('settings').onclick = () => openSettings();
$('setup-go').onclick = () => openSettings('#ai');
$('change').onclick = () => openSettings('#ai');
$('reload').onclick = () => chrome.runtime.reload();

(async () => {
  const hello = await chrome.runtime.sendMessage({ type: 'hello' }).catch(() => null);
  if (hello?.api !== POPUP_API) { $('stale').hidden = false; return; }
  const st = await chrome.storage.local.get(['provider', 'keys', 'models', 'polish', 'sfx', 'autoSites']);
  const p = st.provider || 'gemini', model = st.models?.[p];
  const ready = Boolean(model && (st.keys?.[p] || p === 'custom'));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { if (/^https?:/.test(tab?.url)) host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { /* chrome:// etc. */ }

  $('setup').hidden = ready;
  $('ready').hidden = !ready;
  $('quick').hidden = !ready;
  if (!ready) return;

  $('model').textContent = `${NAMES[p] || p} · ${model}`;
  $('model').title = model;
  $('polish').checked = st.polish ?? true;
  $('sfx').checked = st.sfx ?? true;
  $('polish').onchange = () => chrome.storage.local.set({ polish: $('polish').checked });
  $('sfx').onchange = () => chrome.storage.local.set({ sfx: $('sfx').checked });

  if (!host) {
    $('go').disabled = true;
    $('go').textContent = 'Mở một trang truyện để dịch';
    $('auto').closest('label').hidden = true;
    return;
  }
  $('host').textContent = host;
  $('sub').textContent = host;
  const autoSites = st.autoSites || [];
  $('auto').checked = autoSites.includes(host);
  $('auto').onchange = async () => {
    const on = $('auto').checked;
    const list = (await chrome.storage.local.get('autoSites')).autoSites || [];
    await chrome.storage.local.set({ autoSites: on ? [...new Set([...list, host])] : list.filter((s) => s !== host) });
    if (on) chrome.runtime.sendMessage({ type: 'start', tabId: tab.id }); // start right away on this page too
  };

  $('go').onclick = async () => {
    $('go').disabled = true;
    const r = await chrome.runtime.sendMessage({ type: 'start', tabId: tab.id }).catch((e) => ({ error: e.message }));
    if (r?.error) { $('go').disabled = false; $('go').textContent = 'Không chạy được trên trang này'; return; }
    window.close();
  };

  // Already translating here? Offer to stop. (Pages already translated stay on screen.)
  const [{ result: running } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__md?.running?.() ?? false }).catch(() => []);
  if (running) {
    $('go').textContent = 'Dịch tiếp / thử lại trang lỗi';
    $('stop').hidden = false;
    $('stop').onclick = async () => {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__md?.stop() }).catch(() => {});
      window.close();
    };
  }

  // what the AI has learned about this series (series.js runs in the tab: it reads the page's own links)
  let [{ result: ser } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: mdSeries }).catch(() => []);
  // the page only knew the site: ask the site's API (MangaDex chapter -> series), as the page itself does
  if (!ser || ser.key === host) {
    const r = await chrome.runtime.sendMessage({ type: 'series-info', url: tab.url }).catch(() => null);
    if (r?.key) ser = r;
  }
  const sk = ser?.key || host;
  const { mem } = await chrome.runtime.sendMessage({ type: 'mem', site: sk }).catch(() => ({}));
  const pairs = (mem?.glossary || '').split('\n').filter((l) => l.trim()).length;
  const names = mem?.names?.length || 0;
  if (pairs || names) {
    $('mem').hidden = false;
    $('mem-text').textContent = `AI đã nhớ ${pairs} cặp xưng hô, ${names} tên riêng của ${ser?.label && sk !== host ? '“' + ser.label + '”' : 'site này'}`;
    $('mem-text').title = $('mem-text').textContent;
    $('mem-open').onclick = () => openSettings('#memory', sk);
  }
})();

// version from the manifest (one source of truth, bumped per release)
try { const m = chrome.runtime.getManifest(); document.getElementById('ver').textContent = 'v' + (m.version_name || m.version); /* -beta until released */ } catch { /* outside the extension */ }
