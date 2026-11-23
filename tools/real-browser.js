// Runs the real extension in a real browser (Edge, throw-away profile) on real manga pages and measures
// whether any translation is clipped (cut off at its box's edges) or lost.
//   node tools/real-browser.js <chapter-page-url> [more urls...]
// Keys come from .env (GEMINI_API_KEY by default; PROVIDER/MODEL/BASE env vars to change). The profile is
// deleted afterwards, so no key stays in the browser. Screenshots: $TEMP/md-real/<n>.png
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const PROVIDER = process.env.PROVIDER || 'gemini';
const MODEL = process.env.MODEL || 'gemini-3.1-flash-lite';
const KEY = process.env[{ gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', groq: 'GROQ_API_KEY', custom: 'CUSTOM_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }[PROVIDER]] || '';
const BROWSER = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const urls = process.argv.slice(2);
if (!urls.length) { console.error('usage: node tools/real-browser.js <chapter-page-url> ...'); process.exit(1); }
const OUT = path.join(os.tmpdir(), 'md-real'); fs.mkdirSync(OUT, { recursive: true });
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'md-profile-'));
const PORT = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- minimal CDP client over the browser websocket (flattened sessions) ---
let ws, seq = 0;
const pending = new Map(), listeners = [];
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
});
const evaluate = async (sessionId, expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

// Every translation box on the page: is any of its text drawn outside the box (clipped by overflow:hidden),
// and does the box still hold every word of the translation?
const MEASURE = `(() => {
  const out = [];
  for (const b of document.querySelectorAll('.md-layer .md-b')) {
    if (b.classList.contains('off') || !b.isConnected) continue;
    const layer = b.closest('.md-layer'); if (layer.style.display === 'none') continue;
    const br = b.getBoundingClientRect(); if (!br.width || !br.height) continue;
    const range = document.createRange(); range.selectNodeContents(b);
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    for (const r of range.getClientRects()) { if (!r.width) continue; top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); left = Math.min(left, r.left); right = Math.max(right, r.right); }
    const words = (s) => String(s || '').toLowerCase().split(/\\s+/).filter(Boolean).join(' ');
    const shown = words(b.textContent), raw = words(b.dataset.raw || b.textContent);
    const cut = { top: Math.max(0, br.top - top), bottom: Math.max(0, bottom - br.bottom), left: Math.max(0, br.left - left), right: Math.max(0, right - br.right) };
    out.push({ text: b.textContent.replace(/\\s+/g, ' ').slice(0, 60), font: parseFloat(b.style.fontSize) || 0,
      box: [Math.round(br.width), Math.round(br.height)], cut, clipped: Object.values(cut).some((v) => v > 1.5),
      overflow: b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1, lost: shown !== raw });
  }
  return out;
})()`;

(async () => {
  const args = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, `--load-extension=${path.join(ROOT, 'manga-dich')}`,
    '--disable-extensions-except=' + path.join(ROOT, 'manga-dich'), '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,1000', ...(process.env.HEADED ? [] : ['--headless=new']), 'about:blank'];
  const proc = spawn(BROWSER, args, { stdio: 'ignore' });
  // Edge spawns a dozen child processes: killing only the parent left them running (a crashed first run
  // slowed the user's machine). Kill the whole tree on every exit path, run it at low CPU priority, and
  // never let a run last more than 6 minutes.
  const killTree = () => { try { require('child_process').execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ } };
  process.on('exit', killTree);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { killTree(); process.exit(130); });
  setTimeout(() => { console.error('FAIL timeout after 6 min'); killTree(); process.exit(3); }, 6 * 60 * 1000).unref();
  setTimeout(() => { try { require('child_process').execSync(`wmic process where "CommandLine like '%${path.basename(PROFILE)}%'" CALL setpriority "idle"`, { stdio: 'ignore' }); } catch { /* best effort */ } }, 3000).unref();
  let version;
  for (let i = 0; i < 60 && !version; i++) { await sleep(500); version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null); }
  if (!version) throw new Error('browser did not start');
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else for (const l of listeners) l(m);
  });
  try {
    // the extension's service worker: write the settings the popup would save. Edge runs service workers of its
    // own (thunk.js, another background.js): pick ours by the manifest name.
    let sw, swS;
    for (let i = 0; i < 40 && !sw; i++) {
      const { targetInfos } = await send('Target.getTargets');
      for (const t of targetInfos.filter((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'))) {
        const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
        const name = await evaluate(sessionId, `typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().name : ''`).catch(() => '');
        if (name === 'Manga Dịch') { sw = t; swS = sessionId; break; }
        await send('Target.detachFromTarget', { sessionId }).catch(() => {});
      }
      if (!sw) await sleep(500);
    }
    if (!sw) throw new Error('Manga Dịch service worker not found (--load-extension refused?)');
    const hosts = [...new Set(urls.map((u) => new URL(u).hostname.replace(/^www\./, '')))];
    await evaluate(swS, `chrome.storage.local.set(${JSON.stringify({
      provider: PROVIDER, keys: { [PROVIDER]: KEY }, models: { [PROVIDER]: MODEL }, bases: { [PROVIDER]: process.env.BASE || '' }, autoSites: hosts,
    })}).then(() => 'ok')`);
    console.log(`extension ${sw.url.split('/')[2]} configured: ${PROVIDER}/${MODEL}, auto on ${hosts.join(', ')}`);
    // log every API job the worker runs (test session only): page read or missed-text crop, when it started and
    // ended, what came back - answers "did the visible page's recovery wait for later pages?" and "what did a
    // '+' click get back?"
    await evaluate(swS, `(() => {
      self.__log = []; const t0 = Date.now(), orig = translateJob;
      translateJob = async (job, onDraft) => {
        const e = { kind: job.part ? 'crop' : 'page', key: job.key.slice(-8), start: Date.now() - t0 };
        self.__log.push(e);
        try { const r = await orig(job, onDraft); e.end = Date.now() - t0; e.lines = (r.bubbles || []).map((b) => b.text.slice(0, 40)); return r; }
        catch (x) { e.end = Date.now() - t0; e.error = String(x.message || x).slice(0, 120); throw x; }
      };
      return 'logging';
    })()`);

    const report = [];
    for (const [n, url] of urls.entries()) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId: pg } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Page.enable', {}, pg);
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, pg);
      await send('Page.navigate', { url }, pg);
      // record the extension's toasts (fixed bottom-right notes) and when the visible page's status changes
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.__toasts = []; window.__status = [];
        new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && /bottom: 16px/.test(n.style?.cssText || '')) window.__toasts.push(n.textContent); })
          .observe(document.documentElement, { childList: true, subtree: true });` }, pg);
      await send('Page.reload', {}, pg);
      // wait for the visible page's translation: a layer with boxes or a final status, then a quiet spell
      let last = '', still = 0, state;
      for (let i = 0; i < 120 && still < 4; i++) {
        await sleep(2000);
        state = await evaluate(pg, `JSON.stringify([...document.querySelectorAll('.md-layer')].filter((l) => l.style.display !== 'none').map((l) => [l.querySelectorAll('.md-b').length, (l.querySelector('.md-status')?.textContent || '').slice(0, 80)]))`).catch(() => '');
        still = state && state === last && !/Đang dịch|Đang/.test(state) && state !== '[]' ? still + 1 : 0;
        last = state;
      }
      // click every "+" (text the pixels found but no translation covers) and see what comes back
      const plus = await evaluate(pg, `[...document.querySelectorAll('.md-layer .md-miss')].filter((m) => m.closest('.md-layer').style.display !== 'none').length`);
      const clicks = [];
      for (let i = 0; i < plus; i++) {
        const before = await evaluate(pg, `(() => { const m = [...document.querySelectorAll('.md-layer .md-miss')].filter((m) => !m.disabled && m.closest('.md-layer').style.display !== 'none')[0];
          if (!m) return null; const n = document.querySelectorAll('.md-b').length; window.__t = window.__toasts.length; m.click(); return n; })()`);
        if (before === null) break;
        for (let k = 0; k < 40; k++) { await sleep(1500); if (await evaluate(pg, `window.__toasts.length > window.__t || !document.querySelector('.md-miss[disabled]')`)) break; }
        const after = await evaluate(pg, `({ boxes: document.querySelectorAll('.md-b').length, toast: window.__toasts.slice(window.__t).join(' | ') })`);
        clicks.push(`+${after.boxes - before} ô  ${after.toast || ''}`);
      }
      const boxes = await evaluate(pg, MEASURE);
      const shot = await send('Page.captureScreenshot', { format: 'png' }, pg);
      const file = path.join(OUT, `${n + 1}.png`); fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      const bad = boxes.filter((b) => b.clipped || b.overflow || b.lost);
      report.push({ url, boxes: boxes.length, bad: bad.length });
      console.log(`\n[${n + 1}] ${url}\n    state ${state}\n    ${boxes.length} ô dịch, ${bad.length} ô bị cắt/mất chữ   ảnh: ${file}`);
      for (const b of bad) console.log(`    ✗ ${b.font}px box ${b.box.join('x')} cut ${JSON.stringify(Object.fromEntries(Object.entries(b.cut).map(([k, v]) => [k, Math.round(v)])))}${b.overflow ? ' overflow' : ''}${b.lost ? ' LOST' : ''}  "${b.text}"`);
      console.log(`    nút "+": ${plus}${clicks.length ? '\n      ' + clicks.join('\n      ') : ''}`);
      const toasts = await evaluate(pg, 'window.__toasts');
      if (toasts.length) console.log(`    thông báo: ${toasts.map((t) => t.slice(0, 90)).join(' | ')}`);
      // API jobs in the order they ran: did this page's crop call wait behind later pages?
      const log = await evaluate(swS, 'self.__log.splice(0)');
      for (const e of log) console.log(`    [api] ${e.kind.padEnd(4)} ${String(e.start).padStart(6)}ms -> ${String(e.end ?? '…').padStart(6)}ms  ${e.error ? '✗ ' + e.error : (e.lines || []).length + ' câu'}${e.kind === 'crop' && e.lines ? '  ' + JSON.stringify(e.lines) : ''}`);
      await send('Target.closeTarget', { targetId });
    }
    const tot = report.reduce((a, r) => ({ boxes: a.boxes + r.boxes, bad: a.bad + r.bad }), { boxes: 0, bad: 0 });
    console.log(`\nTỔNG: ${tot.boxes} ô dịch trên ${report.length} trang, ${tot.bad} ô bị cắt/mất chữ`);
    process.exitCode = tot.bad ? 1 : 0;
  } finally {
    ws.close(); killTree();
    await sleep(1500);
    fs.rmSync(PROFILE, { recursive: true, force: true }); // the profile held the key
  }
})().catch((e) => { console.error('FAIL', e.message); process.exitCode = 2; });
