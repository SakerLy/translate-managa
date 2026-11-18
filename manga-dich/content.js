// Auto mode: once started on a tab, keeps translating the page you're looking at first, then the
// next few pages, up to MAX_PARALLEL requests at a time, and picks up new pages as you flip/scroll.
// No innerHTML anywhere: MangaDex enforces Trusted Types, which makes innerHTML assignments throw.
(() => {
  const MAX_PARALLEL = 3; // requests in flight; the background queues and throttles the actual API calls
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
      font-family:"Segoe UI",Arial,sans-serif;font-weight:600;line-height:1.15;word-break:break-word;white-space:pre-line}
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

  // Largest font at which the translation fits its box, found by binary search (the old top-down
  // 1px scan capped every bubble at 22px, so big bubbles got needlessly tiny text). Floor 8px,
  // ceiling 30px: past that the box is bigger than any bubble's text should be.
  // 1px steps (not 2): with pre-wrapped lines the text no longer reflows when the font changes,
  // so the fit is exact and the extra iterations are cheap (≤4 more).
  const fits = (b) => b.scrollHeight <= b.clientHeight + 1 && b.scrollWidth <= b.clientWidth + 1;
  const fit = (b) => {
    let lo = 8, hi = 30, best = 8;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      b.style.fontSize = mid + 'px';
      if (fits(b)) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    b.style.fontSize = best + 'px';
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

  async function translate(img, context, urgent, forced = false) {
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
    // Draw the bubbles we have right now; used for the draft (fast first paint) and the final result.
    const draw = (list, faded) => {
      el.replaceChildren();
      if (!list.length) { // say so instead of silently clearing the status
        status.textContent = 'Không thấy chữ nào để dịch trên trang này';
        el.append(status);
      }
      for (const t of list) {
        const b = document.createElement('div');
        b.className = 'md-b';
        // Line breaks chosen for THIS bubble's shape (a narrow bubble gets short, few-word lines),
        // then white-space:pre-line renders them verbatim — the fit below only scales the font.
        b.textContent = (typeof wrapText === 'function' ? wrapText(t.text, t.w / t.h) : t.text);
        b.dataset.text = JSON.stringify({ text: t.text, sfx: !!t.sfx }); // SFX toggle re-wraps without a new call
        b.dataset.ar = t.w / t.h;
        b.title = 'Bấm để ẩn/hiện bản dịch';
        Object.assign(b.style, { left: t.x + '%', top: t.y + '%', width: t.w + '%', height: t.h + '%' },
          t.bg && { background: t.bg, color: t.fg }); // dark/coloured bubbles keep their look
        if (faded) b.style.opacity = '.75';
        b.onclick = () => b.classList.toggle('off');
        el.append(b);
      }
      o.fitW = null; // force a fit for the new bubbles
      place();
    };
    try {
      const { msg, px } = encode(img);
      // Textless pages (cover art, full-page illustrations) cost a full API call for nothing.
      // The pixel detector runs locally on the same ImageData the fit already uses; when it says
      // no text, show a small badge with an override instead of calling the model. A tainted
      // canvas (px == null) can't be checked, so those pages always translate.
      if (px && typeof hasText === 'function' && window.__md.textOnly && !forced && !hasText(px).has) {
        img.dataset.mdDone = 'skip'; // not '1': "Vẫn dịch" must be able to retry it
        status.textContent = 'Trang không có chữ — bỏ qua để tiết kiệm lượt gọi';
        const force = document.createElement('button');
        force.className = 'md-retry';
        force.textContent = 'Vẫn dịch';
        force.onclick = () => { // override once: mark translated and re-enter the pipeline
          const k = overlays.indexOf(o);
          if (k >= 0) overlays.splice(k, 1);
          o.el.remove();
          translate(img, context, urgent, true); // forced: skips the detector, straight to the API
        };
        status.append(force);
        el.replaceChildren(status);
        clearInterval(timer);
        return;
      }
      // Draft-first: open a port so the worker can push the read pass's boxes the moment they
      // exist, then swap in the polished text when it lands. Visible page = 1 call to first paint.
      const portName = 'md-draft-' + Math.random().toString(36).slice(2);
      const port = chrome.runtime.connect({ name: portName });
      let stage = 'waiting'; // waiting -> draft -> final: a late draft must never overwrite the final
      const draft = new Promise((res) => { port.onMessage.addListener((m) => { if (m.type === 'draft') res(m.bubbles); }); });
      const final = chrome.runtime.sendMessage({ type: 'translate', ...msg, context, glossary: window.__md.glossary, urgent, draftPort: portName })
        .finally(() => { stage = 'final'; try { port.disconnect(); } catch { /* already gone */ } });
      draft.then((bubbles) => { // read pass done, polish still running: show the draft now
        if (stage !== 'waiting' || !px || typeof fitBubbles !== 'function') return;
        stage = 'draft';
        draw(fitBubbles(px, bubbles), true);
        status.textContent = 'Đang trau chuốt văn phong…';
        el.append(status);
        clearInterval(timer);
      }).catch(() => {});
      const res = await final;
      if (res.error) throw new Error(res.error);
      if (res.glossary) window.__md.glossary = res.glossary; // pronoun pairs agreed so far, shared by later pages
      // snap boxes to the real bubbles and take their colours (fit.js, injected before this file)
      if (px && typeof fitBubbles === 'function') res.bubbles = fitBubbles(px, res.bubbles);
      draw(res.bubbles);
      texts.set(img, res.bubbles.map((t) => t.text).join('\n'));
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
      translate(n.img, (n.prev && texts.get(n.prev)) || '', n.s === 0).finally(() => { active--; pump(); });
    }
  }

  document.addEventListener('scroll', () => { place(); pump(); }, { capture: true, passive: true });
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') pump(); }, true); // new page image loaded
  addEventListener('resize', place);
  setInterval(() => { place(); pump(); }, 700); // page flips by keyboard/click don't scroll

  // SFX toggle from the popup: every fitted bubble carries its raw text (bubbles translated with
  // the other setting are filtered out), so swapping = re-wrap what's left and re-fit in place —
  // no API call, no page flip, works on drafts too.
  const setSfx = (on) => {
    window.__md.sfx = on;
    for (const o of overlays) {
      for (const b of o.el.querySelectorAll('.md-b[data-text]')) {
        const t = JSON.parse(b.dataset.text || '[]');
        if (t.sfx) b.remove();
        else b.textContent = (typeof wrapText === 'function' ? wrapText(t.text, +b.dataset.ar) : t.text);
      }
      o.fitW = null;
    }
    place();
  };

  window.__md = { overlays, pump, setSfx, glossary: '', textOnly: true, sfx: true };
  chrome.storage.local.get(['sfx', 'textOnly']).then((s) => {
    window.__md.sfx = s.sfx ?? true;
    window.__md.textOnly = s.textOnly ?? true;
  });
  // the popup flips the switches while this script keeps running: apply them live
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.sfx) setSfx(ch.sfx.newValue ?? true);
    if (ch.textOnly) window.__md.textOnly = ch.textOnly.newValue ?? true;
  });
  if (!next()) alert('Manga Dịch: không thấy trang truyện nào. Sẽ tự dịch khi trang truyện hiện ra.');
  pump();
})();
