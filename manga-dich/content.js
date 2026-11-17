// Auto mode: once started on a tab, keeps translating the page you're looking at first, then the
// next few pages, up to MAX_PARALLEL requests at a time, and picks up new pages as you flip/scroll.
// No innerHTML anywhere: MangaDex enforces Trusted Types, which makes innerHTML assignments throw.
(() => {
  const MAX_PARALLEL = 3; // concurrent API calls
  const AHEAD = 2; // hidden preloaded pages (single-page reader) to translate past the visible one

  if (window.__md) {
    // Button pressed again: retry pages that failed, then look for work.
    for (const o of [...window.__md.overlays]) {
      if (o.img.dataset.mdDone === 'err') { o.el.remove(); window.__md.overlays.splice(window.__md.overlays.indexOf(o), 1); delete o.img.dataset.mdDone; }
    }
    return window.__md.pump();
  }

  const overlays = [];
  const texts = new WeakMap(); // img -> its translated lines, used as the next page's context
  let active = 0;
  const srcOf = (img) => img.currentSrc || img.src;

  const css = document.createElement('style');
  css.textContent = `
    .md-layer{position:fixed;pointer-events:none;z-index:2147483646}
    .md-b{position:absolute;pointer-events:auto;cursor:pointer;display:flex;align-items:center;justify-content:center;
      text-align:center;background:#fff;color:#111;border-radius:8px;padding:2px;box-sizing:border-box;overflow:hidden;
      font-family:"Segoe UI",Arial,sans-serif;font-weight:600;line-height:1.15;word-break:break-word}
    .md-b.off{opacity:.08}
    .md-status{position:absolute;top:4px;left:4px;max-width:calc(100% - 24px);background:#000c;color:#fff;font:12px/1.4 sans-serif;padding:4px 8px;border-radius:4px;pointer-events:auto}
    .md-retry{margin-left:6px;padding:2px 10px;border:0;border-radius:4px;background:#ff6740;color:#fff;font:600 12px sans-serif;cursor:pointer}`;
  document.head.append(css);

  // fixed layer tracks the image; capture catches scrolls inside the reader's own scroll container
  const place = () => {
    for (let i = overlays.length - 1; i >= 0; i--) {
      const o = overlays[i];
      if (!o.img.isConnected || srcOf(o.img) !== o.src) { // page changed (reader reused the <img>)
        o.el.remove(); overlays.splice(i, 1); delete o.img.dataset.mdDone; continue;
      }
      const r = o.img.getBoundingClientRect();
      o.el.style.display = r.width ? '' : 'none';
      Object.assign(o.el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      if (r.width && o.fitW !== r.width) { o.fitW = r.width; o.el.querySelectorAll('.md-b').forEach(fit); } // refit only on resize
    }
  };

  // Largest font (<= 22px) at which the translation fits its box, measured, so long lines aren't cut off.
  const fit = (b) => {
    let fs = 22;
    b.style.fontSize = fs + 'px';
    while (fs > 7 && (b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1)) b.style.fontSize = --fs + 'px';
  };

  const encode = (img) => {
    try {
      const k = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight)); // Claude's useful max edge
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, c.width, c.height);
      // pixels stay in the page (for fitBubbles); only the JPEG goes to the worker
      return { msg: { data: c.toDataURL('image/jpeg', 0.88).split(',')[1], mime: 'image/jpeg' }, px: g.getImageData(0, 0, c.width, c.height) };
    } catch { return { msg: { url: srcOf(img) } }; } // tainted canvas: let the worker fetch it; no pixel fit
  };

  // Pages worth translating now, best first: visible (0), within one screen (1-2), hidden next pages (3+).
  // Anything else waits until you get near it, so reading costs only what you read.
  function next() {
    // Natural size alone isn't enough: MangaDex's avatar is 1065x1065 but shown at 40x40. Skip anything
    // rendered small; hidden (0-width) preloaded pages stay eligible through the AHEAD rule below.
    const pages = [], rects = [];
    for (const i of document.images) {
      if (!i.complete || i.naturalWidth < 400 || i.naturalHeight < 400) continue;
      const r = i.getBoundingClientRect();
      if (r.width && r.width < 200) continue;
      pages.push(i); rects.push(r);
    }
    const vh = innerHeight;
    const onScreen = (r) => r.width && r.bottom > 0 && r.top < vh;
    const cur = rects.findIndex(onScreen);
    let best = null;
    pages.forEach((img, idx) => {
      if (img.dataset.mdDone) return;
      const r = rects[idx];
      let s = null;
      if (onScreen(r)) s = 0;
      else if (r.width) { const d = r.top >= vh ? r.top - vh : -r.bottom; if (d < vh) s = 1 + d / vh; }
      else if (cur >= 0 && idx > cur && idx <= cur + AHEAD) s = 2 + idx - cur;
      if (s !== null && (!best || s < best.s)) best = { img, s, prev: pages[idx - 1] };
    });
    return best;
  }

  async function translate(img, context) {
    img.dataset.mdDone = '1';
    const el = document.createElement('div');
    el.className = 'md-layer';
    const status = document.createElement('div');
    status.className = 'md-status';
    const t0 = Date.now();
    const tick = () => { status.textContent = `Đang dịch… ${Math.round((Date.now() - t0) / 1000)}s`; };
    tick();
    const timer = setInterval(tick, 1000);
    el.append(status);
    document.body.append(el);
    const o = { img, el, src: srcOf(img) };
    overlays.push(o);
    place();
    try {
      const { msg, px } = encode(img);
      const res = await chrome.runtime.sendMessage({ type: 'translate', ...msg, context, glossary: window.__md.glossary });
      if (res.error) throw new Error(res.error);
      if (res.glossary) window.__md.glossary = res.glossary; // pronoun pairs agreed so far, shared by later pages
      // snap boxes to the real bubbles and take their colours (fit.js, injected before this file)
      if (px && typeof fitBubbles === 'function') res.bubbles = fitBubbles(px, res.bubbles);
      el.replaceChildren();
      if (!res.bubbles.length) { // say so instead of silently clearing the status
        status.textContent = 'Không thấy chữ nào để dịch trên trang này';
        el.append(status);
      }
      for (const t of res.bubbles) {
        const b = document.createElement('div');
        b.className = 'md-b';
        b.textContent = t.text;
        b.title = 'Bấm để ẩn/hiện bản dịch';
        Object.assign(b.style, { left: t.x + '%', top: t.y + '%', width: t.w + '%', height: t.h + '%' },
          t.bg && { background: t.bg, color: t.fg }); // dark/coloured bubbles keep their look
        b.onclick = () => b.classList.toggle('off');
        el.append(b);
      }
      texts.set(img, res.bubbles.map((t) => t.text).join('\n'));
      o.fitW = null; // force a fit for the new bubbles
      place();
    } catch (e) {
      status.textContent = 'Lỗi: ' + String(e.message).split('\n')[0].slice(0, 160);
      const retry = document.createElement('button');
      retry.className = 'md-retry';
      retry.textContent = 'Thử lại';
      // drop this page's overlay and flag so next() picks it again (covers timeouts too)
      retry.onclick = () => {
        const k = overlays.indexOf(o); // -1 if the reader already dropped this page; splice(-1) would hit another page
        if (k >= 0) overlays.splice(k, 1);
        o.el.remove(); delete img.dataset.mdDone; pump();
      };
      status.append(retry);
      el.replaceChildren(status);
      if (overlays.includes(o)) img.dataset.mdDone = 'err'; // no auto-retry loop; the button (or popup) retries
    } finally {
      clearInterval(timer);
    }
  }

  function pump() {
    while (active < MAX_PARALLEL) {
      const n = next();
      if (!n) return;
      active++;
      // context = previous page's lines if already translated; never wait for it
      translate(n.img, (n.prev && texts.get(n.prev)) || '').finally(() => { active--; pump(); });
    }
  }

  document.addEventListener('scroll', () => { place(); pump(); }, { capture: true, passive: true });
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') pump(); }, true); // new page image loaded
  addEventListener('resize', place);
  setInterval(() => { place(); pump(); }, 700); // page flips by keyboard/click don't scroll

  window.__md = { overlays, pump };
  if (!next()) alert('Manga Dịch: không thấy trang truyện nào. Sẽ tự dịch khi trang truyện hiện ra.');
  pump();
})();
