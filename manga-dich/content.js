// Auto mode: once started on a tab, keeps translating the page you're looking at first, then the
// next few pages, up to MAX_PARALLEL requests at a time, and picks up new pages as you flip/scroll.
// No innerHTML anywhere: MangaDex enforces Trusted Types, which makes innerHTML assignments throw.
(() => {
  const MAX_PARALLEL = 3; // requests in flight; the background queues and throttles the actual API calls
  const AHEAD = 2; // hidden preloaded pages (single-page reader) to translate past the visible one

  if (window.__md) {
    // Button/shortcut pressed again: resume if stopped, retry pages that failed or were cancelled, look for work.
    window.__md.resume();
    for (const o of [...window.__md.overlays]) {
      if (o.img.dataset.mdDone === 'err' || o.img.dataset.mdDone === 'cancel') { o.el.remove(); window.__md.overlays.splice(window.__md.overlays.indexOf(o), 1); delete o.img.dataset.mdDone; }
    }
    return window.__md.pump();
  }

  const overlays = [];
  const texts = new WeakMap(); // img -> its translated lines, used as the next page's context
  let active = 0;
  const srcOf = (img) => img.currentSrc || img.src;
  // Memory key: the series being read (series.js), re-read on every page because readers like MangaDex
  // switch series without a page load. Falls back to the hostname when the series can't be told.
  const SITE = location.hostname.replace(/^www\./, '');
  const series = () => (typeof mdSeries === 'function' ? mdSeries() : { key: SITE, label: SITE });

  const css = document.createElement('style');
  css.textContent = `
    .md-layer{position:fixed;pointer-events:none;z-index:2147483646}
    .md-b{position:absolute;pointer-events:auto;cursor:pointer;display:flex;align-items:center;justify-content:center;
      text-align:center;background:#fff;color:#111;border-radius:8px;padding:2px;box-sizing:border-box;overflow:hidden;
      font-family:"Segoe UI",Arial,sans-serif;font-weight:600;line-height:1.15;white-space:normal;text-wrap:balance;overflow-wrap:normal;word-break:normal}
    .md-b.off{opacity:.08}
    .md-b.st-small,.md-b.st-whisper{line-height:1.05;letter-spacing:-.2px}
    .md-b.st-big{line-height:1.05;font-weight:800}
    .md-b.st-shout{line-height:1;font-weight:800;font-style:italic;letter-spacing:.5px}
    .md-b.st-narration{font-weight:500;font-style:italic}
    .md-b.st-vertical{writing-mode:vertical-rl}
    .md-status{position:absolute;top:4px;left:4px;max-width:calc(100% - 24px);background:#000c;color:#fff;font:12px/1.4 sans-serif;padding:4px 8px;border-radius:4px;pointer-events:auto}
    .md-retry.ghost{background:#ffffff26}
    .md-retry{margin-left:6px;padding:2px 10px;border:0;border-radius:4px;background:#ff6740;color:#fff;font:600 12px sans-serif;cursor:pointer}`;
  document.head.append(css);

  // Chống đè nhau: model trả box chồng nhau (ảnh chụp lỗi thật: 2 khung giao 35x170px) -> dịch
  // khung NHỎ hơn ra hướng còn trống gần nhất. Khung to giữ vị trí (thường khớp bong bóng thật).
  // Mỗi bước: thử 4 hướng đẩy 2%, chọn hướng giảm TỔNG DIỆN TÍCH chồng lấn nhiều nhất, tiến theo
  // hướng đó (gradient descent cho khung chữ). Tối đa 40 bước - đủ trượt qua khung rộng 40%.
  function separate(list) {
    const PAD = 1.2; // % khoảng hở tối thiểu giữa hai khung
    const overlaps = (a, b) => !(a.x + a.w + PAD <= b.x || b.x + b.w + PAD <= a.x || a.y + a.h + PAD <= b.y || b.y + b.h + PAD <= a.y);
    const interArea = (a, b) => {
      const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return x * y;
    };
    const clamp = (b, x, y) => ({ ...b, x: Math.max(0, Math.min(100 - b.w, x)), y: Math.max(0, Math.min(100 - b.h, y)) });
    // khung to đặt trước và giữ nguyên; khung nhỏ nhường đường
    const order = list.map((b, i) => ({ b, i })).sort((a, z) => (z.b.w * z.b.h) - (a.b.w * a.b.h));
    const placed = [];
    for (const { b, i } of order) {
      let cur = { x: b.x, y: b.y, w: b.w, h: b.h };
      for (let step = 0; step < 40 && placed.some((p) => overlaps(cur, p)); step++) {
        let best = null;
        for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) {
          const cand = clamp(cur, cur.x + dx, cur.y + dy);
          const cost = placed.reduce((s, p) => s + interArea(cand, p), 0);
          if (!best || cost < best.cost) best = { cand, cost };
        }
        cur = best.cand;
      }
      placed.push(cur);
      list[i] = { ...b, ...cur };
    }
    return list;
  }

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
      if (r.width && o.fitW !== r.width) { o.fitW = r.width; o.el.querySelectorAll('.md-b').forEach(fit); harmonize(o.el); } // refit only on resize
    }
  };

  // Largest font at which the translation fits its box, found by binary search (the old top-down
  // 1px scan capped every bubble at 22px, so big bubbles got needlessly tiny text). Floor 8px,
  // ceiling 30px: past that the box is bigger than any bubble's text should be.
  // 1px steps (not 2): with pre-wrapped lines the text no longer reflows when the font changes,
  // so the fit is exact and the extra iterations are cheap (≤4 more).
  // Style hint từ model nới trần/đáy theo ngữ nghĩa: big/shout to hơn (38px), small/whisper nhỏ
  // hơn (18px), narration vừa (24px) + in nghiêng văn kể - đúng yêu cầu "chỉnh size chữ theo nghĩa".
  const fits = (b) => b.scrollHeight <= b.clientHeight + 1 && b.scrollWidth <= b.clientWidth + 1;
  // Source-relative sizing (real reports: "chỗ cần bé thì to, chỗ cần to thì bé"): the original
  // lettering's height on screen (data-lh, from fit.js) is the reference a letterer would use. The
  // translation may not grow past ~1.5x it (a 3-word line in a roomy bubble stayed huge), and when the
  // box is so tight the text would drop well below it, the box widens around its centre once instead
  // (a long Vietnamese line squeezed into a narrow Spanish column came out unreadable).
  const search = (b, lo, hi) => {
    let best = lo;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      b.style.fontSize = mid + 'px';
      if (fits(b)) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    b.style.fontSize = best + 'px';
    return best;
  };
  const fit = (b) => {
    const st = b.dataset.style || '';
    let lo = 8, hi = 30;
    if (st === 'big' || st === 'shout') hi = 38;
    else if (st === 'small' || st === 'whisper') { lo = 7; hi = 18; }
    else if (st === 'narration') hi = 24;
    const src = (+b.dataset.lh || 0) / 100 * (b.parentElement?.clientHeight || 0); // source letter height, px
    if (src) hi = Math.max(lo, Math.min(hi, Math.round(src * (st === 'big' || st === 'shout' ? 1.9 : 1.5))));
    const best = search(b, lo, hi);
    if (src && best < src * 0.9 && !b.dataset.grown && b.dataset.box) {
      const [x, y, w, h] = JSON.parse(b.dataset.box);
      const w2 = Math.min(100, w * 1.3), h2 = Math.min(100, h * 1.2);
      b.dataset.grown = '1';
      Object.assign(b.style, { left: Math.max(0, Math.min(100 - w2, x - (w2 - w) / 2)) + '%', top: Math.max(0, Math.min(100 - h2, y - (h2 - h) / 2)) + '%', width: w2 + '%', height: h2 + '%' });
      search(b, lo, hi);
    }
  };

  const grab = (src, w, h) => {
    const k = Math.min(1, 1568 / Math.max(w, h)); // Claude's useful max edge
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, c.width, c.height);
    // pixels stay in the page (for fitBubbles); only the JPEG goes to the worker. Throws on a tainted canvas.
    return { msg: { data: c.toDataURL('image/jpeg', 0.88).split(',')[1], mime: 'image/jpeg' }, px: g.getImageData(0, 0, c.width, c.height), clean: src };
  };
  // Pages served from another host (MangaDex's image servers, most CDNs) taint the canvas: no pixels, so
  // no box fitting, no source-sized font, no missed-text pass - raw model boxes only (real reports: huge
  // white blocks with tiny text). The worker may fetch any host, so it hands back the bytes and the page
  // redraws them from a data: URL, which never taints. `clean` is the copy later crops are cut from.
  // One page, one lettering size (real report: "to nhỏ bất thường không đồng nhất"). After every box has
  // its own best size, plain dialogue is pulled toward the page's median: anything above 1.15x comes down,
  // anything under 0.85x gets its box widened (twice at most) to climb back up. Styled text (shout, whisper,
  // captions) keeps its deliberate difference.
  const grow = (b, k) => {
    const [x, y, w, h] = JSON.parse(b.dataset.box || '[0,0,0,0]');
    const n = (+b.dataset.grownK || 1) * k, w2 = Math.min(100, w * n), h2 = Math.min(100, h * Math.sqrt(n));
    b.dataset.grownK = n;
    Object.assign(b.style, { left: Math.max(0, Math.min(100 - w2, x - (w2 - w) / 2)) + '%', top: Math.max(0, Math.min(100 - h2, y - (h2 - h) / 2)) + '%', width: w2 + '%', height: h2 + '%' });
  };
  const harmonize = (el) => {
    const plain = [...el.querySelectorAll('.md-b')].filter((b) => !b.dataset.style || b.dataset.style === 'narration');
    if (plain.length < 3) return;
    const sizes = plain.map((b) => parseFloat(b.style.fontSize)).sort((a, z) => a - z);
    const med = sizes[sizes.length >> 1];
    for (const b of plain) {
      const f = parseFloat(b.style.fontSize);
      if (f > med * 1.15) { b.style.fontSize = Math.round(med * 1.15) + 'px'; continue; }
      for (let i = 0; i < 2 && parseFloat(b.style.fontSize) < med * 0.85; i++) { grow(b, 1.2); search(b, 7, Math.round(med)); }
    }
  };

  const encode = async (img) => {
    try { return grab(img, img.naturalWidth, img.naturalHeight); } catch { /* tainted: fetch a clean copy */ }
    try {
      const r = await chrome.runtime.sendMessage({ type: 'fetch-image', url: srcOf(img) });
      if (r?.error || !r?.data) throw new Error(r?.error);
      const im = new Image();
      im.src = `data:${r.mime};base64,${r.data}`;
      await im.decode();
      return grab(im, im.naturalWidth, im.naturalHeight);
    } catch { return { msg: { url: srcOf(img) } }; } // still nothing: translate without pixel fitting
  };

  // Second chance for text the model skipped: textBlocks() (fit.js) finds lettering on the page by
  // pixels; every block no translation box covers is cropped from the full-resolution image and sent
  // alone (a small crop is read far more reliably than the same bubble inside a whole page). At most
  // MAX_RECOVER crops a page; each is cached like a page, so F5 costs nothing.
  const MAX_RECOVER = 4;
  async function recover(img, px, have, o) {
    if (typeof textBlocks !== 'function') return [];
    const covered = (t) => have.some((b) => {
      const x = Math.max(0, Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x));
      const y = Math.max(0, Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y));
      return x * y >= 0.3 * t.w * t.h;
    });
    const missing = textBlocks(px).filter((t) => !covered(t)).sort((a, b) => b.n - a.n).slice(0, MAX_RECOVER);
    if (!missing.length) return [];
    o.say(`Dịch bù ${missing.length} khối chữ bị sót…`);
    const src = o.clean || img; // untainted copy: cropping a cross-origin <img> would throw
    const NW = src.naturalWidth, NH = src.naturalHeight;
    const found = await Promise.all(missing.map(async (t) => {
      try {
        // crop = the block plus room for the whole bubble around it
        const padX = Math.max(t.w * 0.5, 4), padY = Math.max(t.h * 0.5, 3);
        const x = Math.max(0, t.x - padX), y = Math.max(0, t.y - padY);
        const w = Math.min(100 - x, t.w + 2 * padX), h = Math.min(100 - y, t.h + 2 * padY);
        const sx = x / 100 * NW, sy = y / 100 * NH, sw = w / 100 * NW, sh = h / 100 * NH;
        const k = Math.min(2, 1024 / Math.max(sw, sh)); // upscale small crops: tiny text reads better bigger
        const c = document.createElement('canvas');
        c.width = Math.round(sw * k); c.height = Math.round(sh * k);
        c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
        const r = await chrome.runtime.sendMessage({ type: 'translate', data: c.toDataURL('image/jpeg', 0.9).split(',')[1], mime: 'image/jpeg',
          context: have.map((b) => b.text).join('\n'), glossary: window.__md.glossary, site: series().key, seriesLabel: series().label, part: true, tag: o.tag });
        if (r.error || !r.bubbles?.length) return [];
        // crop % -> page %, then snap to the page's own pixels like any other box
        const mapped = r.bubbles.map((b) => ({ ...b, x: x + b.x * w / 100, y: y + b.y * h / 100, w: b.w * w / 100, h: b.h * h / 100, rec: true }));
        return typeof fitBubbles === 'function' ? fitBubbles(px, mapped) : mapped;
      } catch { return []; }
    }));
    o.status.remove();
    if (o.cancelled) return [];
    // a recovered box landing on text another box already holds is the model re-reading it: drop it
    return found.flat().filter((b) => !covered({ x: b.x + b.w * 0.25, y: b.y + b.h * 0.25, w: b.w * 0.5, h: b.h * 0.5 }));
  }

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
    const o = { img, el, src: srcOf(img), status, busy: true, tag: 'md-draft-' + Math.random().toString(36).slice(2) };
    // Huỷ: stop waiting for this page and drop its queued API call. A call already in flight finishes in
    // the background and lands in the cache, so "Dịch lại" later costs nothing.
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'md-retry ghost';
    cancelBtn.textContent = 'Huỷ';
    o.cancel = () => {
      if (!o.busy || o.cancelled) return;
      o.cancelled = true; o.busy = false;
      clearInterval(timer);
      chrome.runtime.sendMessage({ type: 'cancel', tag: o.tag }).catch(() => {});
      if (el.querySelector('.md-b')) { status.remove(); return; } // a draft is already up: keep it
      const again = document.createElement('button');
      again.className = 'md-retry';
      again.textContent = 'Dịch lại';
      again.onclick = () => { // same as Thử lại: drop the overlay, let next() pick the page up
        const k = overlays.indexOf(o);
        if (k >= 0) overlays.splice(k, 1);
        o.el.remove(); delete img.dataset.mdDone; window.__md.resume(); pump();
      };
      status.replaceChildren('Đã huỷ dịch trang này', again);
      el.replaceChildren(status);
      img.dataset.mdDone = 'cancel'; // not picked again until "Dịch lại", the popup or the shortcut
    };
    cancelBtn.onclick = (e) => { e.stopPropagation(); o.cancel(); };
    o.say = (text) => { if (!o.cancelled) { status.replaceChildren(text, cancelBtn); el.append(status); } };
    const t0 = Date.now();
    const tick = () => o.say(`Đang dịch… ${Math.round((Date.now() - t0) / 1000)}s`);
    tick();
    const timer = setInterval(tick, 1000);
    document.body.append(el);
    overlays.push(o);
    place();
    // Draw the bubbles we have right now; used for the draft (fast first paint) and the final result.
    const draw = (list, faded) => {
      el.replaceChildren();
      if (!list.length) { // say so instead of silently clearing the status
        status.textContent = 'Không thấy chữ nào để dịch trên trang này';
        el.append(status);
      }
      // tách các khung chồng nhau TRƯỚC khi vẽ (lỗi "khung dịch đè lên nhau" trong ảnh chụp)
      // Pixel-fitted boxes already sit on their own letters and never overlap (fit.js stops each one at its
      // neighbours); pushing them apart moved a translation off its bubble (real run: "Với lại…" shoved up
      // over the art, its Indonesian text left showing). Only raw model boxes still need separate().
      const separated = list.some((t) => t.fit) ? (typeof trimOverlaps === 'function' ? trimOverlaps(list) : list.slice()) : separate(list.slice());
      separated.sort((a, z) => (a.text || '').length - (z.text || '').length); // still overlapping: longer text drawn on top
      // boxes without their own letter height (blind/anchored) borrow the page's typical one
      const lhs = separated.map((t) => t.lh).filter(Boolean).sort((a, z) => a - z);
      const pageLh = lhs.length ? lhs[lhs.length >> 1] : 0;
      for (const t of separated) {
        const b = document.createElement('div');
        b.className = 'md-b' + (t.style ? ' st-' + t.style : '');
        b.dataset.style = t.style || '';
        // Line breaks chosen for THIS bubble's shape (a narrow bubble gets short, few-word lines),
        // then white-space:pre-line renders them verbatim - the fit below only scales the font.
        // The browser wraps at the box's real width with balanced lines (text-wrap: balance). Pre-broken
        // lines from wrapText() were re-wrapped by CSS whenever the font cap left them wider than the box
        // (real run: "…đến đây / khi / hôm nay được / nghỉ / học…"); a word never splits mid-syllable.
        b.textContent = t.text;
        b.dataset.text = JSON.stringify({ text: t.text, sfx: !!t.sfx, style: t.style || '' }); // SFX toggle re-wraps without a new call
        b.dataset.ar = t.w / t.h;
        if (t.lh || pageLh) b.dataset.lh = t.lh || pageLh;
        b.dataset.box = JSON.stringify([t.x, t.y, t.w, t.h]);
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
      const { msg, px, clean } = await encode(img);
      o.clean = clean || img;
      // Textless pages (cover art, full-page illustrations) cost a full API call for nothing.
      // The pixel detector runs locally on the same ImageData the fit already uses; when it says
      // no text, show a small badge with an override instead of calling the model. A tainted
      // canvas (px == null) can't be checked, so those pages always translate.
      if (px && typeof hasText === 'function' && window.__md.textOnly && !forced && !hasText(px).has) {
        img.dataset.mdDone = 'skip'; // not '1': "Vẫn dịch" must be able to retry it
        status.textContent = 'Trang không có chữ - bỏ qua để tiết kiệm lượt gọi';
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
        o.busy = false;
        return;
      }
      // Draft-first: open a port so the worker can push the read pass's boxes the moment they
      // exist, then swap in the polished text when it lands. Visible page = 1 call to first paint.
      const portName = o.tag;
      const port = chrome.runtime.connect({ name: portName });
      let stage = 'waiting'; // waiting -> draft -> final: a late draft must never overwrite the final
      const draft = new Promise((res) => { port.onMessage.addListener((m) => { if (m.type === 'draft') res(m.bubbles); }); });
      const final = chrome.runtime.sendMessage({ type: 'translate', ...msg, context, glossary: window.__md.glossary, site: series().key, seriesLabel: series().label, urgent, draftPort: portName })
        .finally(() => { stage = 'final'; try { port.disconnect(); } catch { /* already gone */ } });
      draft.then((bubbles) => { // read pass done, polish still running: show the draft now
        if (stage !== 'waiting' || o.cancelled || !px || typeof fitBubbles !== 'function') return;
        stage = 'draft';
        draw(fitBubbles(px, bubbles), true);
        clearInterval(timer);
        o.say('Đang trau chuốt văn phong…');
      }).catch(() => {});
      const res = await final;
      if (o.cancelled) return;
      if (res.error) throw new Error(res.error);
      if (res.glossary) window.__md.glossary = res.glossary; // pronoun pairs agreed so far, shared by later pages
      // snap boxes to the real bubbles and take their colours (fit.js, injected before this file)
      if (px && typeof fitBubbles === 'function') res.bubbles = fitBubbles(px, res.bubbles);
      draw(res.bubbles);
      texts.set(img, res.bubbles.map((t) => t.text).join('\n'));
      if (px && window.__md.recover) {
        const extra = await recover(img, px, res.bubbles, o);
        if (extra.length && !o.cancelled) {
          // The model often merges two neighbouring bubbles into one line and leaves the second bubble's
          // text untranslated; the recovered crop then repeats that part (live Sangeki run: "Thôi nào,
          // Roka. Giúp tớ một tay đi chứ." shown twice). Keep it in its own bubble only.
          // Same sentence twice = the page pass put that line in the wrong place (live Sangeki run: on a
          // character's hair beside the bubble) and the crop found its real bubble; the crop sits on verified
          // lettering, so it wins and the misplaced copy goes.
          const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
          const again = new Set(extra.map((x) => norm(x.text)));
          res.bubbles = res.bubbles.filter((b) => !again.has(norm(b.text)));
          for (const x of extra) for (const b of res.bubbles) {
            const t = (x.text || '').trim();
            if (t.length >= 6 && b.text !== t && b.text.includes(t)) b.text = b.text.replace(t, '').replace(/\s{2,}/g, ' ').trim();
          }
          res.bubbles = res.bubbles.filter((b) => /[\p{L}\p{N}]/u.test(b.text)).concat(extra);
          draw(res.bubbles);
          texts.set(img, res.bubbles.map((t) => t.text).join('\n'));
        }
      }
    } catch (e) {
      if (o.cancelled) return;
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
      o.busy = false;
    }
  }

  let stopped = false;
  function pump() {
    while (!stopped && active < MAX_PARALLEL) {
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
  // the other setting are filtered out), so swapping = re-wrap what's left and re-fit in place -
  // no API call, no page flip, works on drafts too.
  const setSfx = (on) => {
    window.__md.sfx = on;
    for (const o of overlays) {
      for (const b of o.el.querySelectorAll('.md-b[data-text]')) {
        const t = JSON.parse(b.dataset.text || '[]');
        if (t.sfx) b.remove();
        else b.textContent = t.text;
      }
      o.fitW = null;
    }
    place();
  };

  // Dừng dịch cả tab (popup): cancel every page in progress and stop picking new ones. Pages already
  // translated stay on screen. resume() (popup/shortcut again, or "Dịch lại" on a page) starts again.
  const stop = () => { stopped = true; for (const o of overlays) o.cancel?.(); };
  const resume = () => { stopped = false; };
  window.__md = { overlays, pump, setSfx, stop, resume, running: () => !stopped, glossary: '', textOnly: true, sfx: true, recover: true, site: SITE };
  chrome.storage.local.get(['sfx', 'textOnly', 'recover']).then((s) => {
    window.__md.sfx = s.sfx ?? true;
    window.__md.textOnly = s.textOnly ?? true;
    window.__md.recover = s.recover ?? true;
  });
  // the popup flips the switches while this script keeps running: apply them live
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.sfx) setSfx(ch.sfx.newValue ?? true);
    if (ch.textOnly) window.__md.textOnly = ch.textOnly.newValue ?? true;
    if (ch.recover) window.__md.recover = ch.recover.newValue ?? true;
  });
  // small self-dismissing notice instead of alert(): never blocks the page; silent on auto-started sites
  const toast = (text) => {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:320px;padding:10px 14px;border-radius:10px;'
      + 'background:#1c1c1fee;color:#fff;font:13px/1.4 "Segoe UI",system-ui,sans-serif;box-shadow:0 4px 16px #0005;pointer-events:none';
    document.body.append(t);
    setTimeout(() => t.remove(), 4000);
  };
  if (next()) { if (!window.__mdQuiet) toast('Manga Dịch: đang dịch trang này…'); }
  else if (!window.__mdQuiet) toast('Manga Dịch: chưa thấy trang truyện nào - sẽ tự dịch khi trang truyện hiện ra.');
  pump();
})();
