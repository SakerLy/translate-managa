// Auto mode: once started on a tab, keeps translating the page you're looking at first, then the
// next few pages, up to MAX_PARALLEL requests at a time, and picks up new pages as you flip/scroll.
// No innerHTML anywhere: MangaDex enforces Trusted Types, which makes innerHTML assignments throw.
(() => {
  const MAX_PARALLEL = 3; // requests in flight; the background queues and throttles the actual API calls
  // pages past the last visible one to translate in advance (setting "ahead", 0-10): hidden preloaded pages
  // of a single-page reader and the next pages of a long strip alike
  let AHEAD = 0; // until the setting arrives (async): the first pick must not run ahead of what you allowed

  if (window.__md) {
    // Button/shortcut pressed again: resume if stopped, retry pages that failed or were cancelled, look for work.
    // A manual press binds translation to the series on screen now (a new series needs its own press).
    window.__md.resume(true);
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
  // chrome.runtime.id is gone once the extension is reloaded; sendMessage then throws synchronously
  // ("Uncaught Error: Extension context invalidated", live report), which .catch() can't swallow
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const quiet = (m) => { if (alive()) try { chrome.runtime.sendMessage(m).catch(() => {}); } catch { /* gone */ } };
  const lineKey = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const series = () => (typeof mdSeries === 'function' ? mdSeries() : { key: SITE, label: SITE });
  // The page's own answer, or - when it only knows the site - the site's API (MangaDex: chapter -> series),
  // cached per chapter URL so every page of a chapter asks once
  const seriesByUrl = new Map();
  const seriesNow = async () => {
    const s = series();
    if (s.key !== SITE) return s;
    const url = location.href.split('#')[0];
    if (!seriesByUrl.has(url)) {
      seriesByUrl.set(url, chrome.runtime.sendMessage({ type: 'series-info', url }).then((r) => (r?.key ? r : s), () => s));
    }
    return seriesByUrl.get(url);
  };
  const reader = () => typeof mdIsReader !== 'function' || mdIsReader(location.pathname);

  const css = document.createElement('style');
  css.textContent = `
    .md-layer{position:fixed;pointer-events:none;z-index:2147483646;--md-font:"Segoe UI",Arial,sans-serif}
    .md-layer.manga-font{--md-font:"MangaDich","Segoe UI",Arial,sans-serif}
    .md-patch{position:absolute;pointer-events:none;image-rendering:auto}
    .md-patch.off{display:none}
    .md-b{position:absolute;pointer-events:auto;cursor:pointer;display:flex;align-items:center;justify-content:center;
      text-align:center;background:#fff;color:#111;border-radius:8px;padding:2px;box-sizing:border-box;overflow:hidden;
      font-family:var(--md-font);font-weight:600;line-height:1.15;white-space:normal;text-wrap:balance;overflow-wrap:normal;word-break:normal}
    .md-b.shaped{white-space:pre;text-wrap:nowrap}
    .md-b.clean{background:transparent!important;box-shadow:none!important}
    .md-b.clean.k-art,.md-b.clean.k-sfx{text-shadow:0 0 2px var(--md-bg),0 0 2px var(--md-bg),0 0 3px var(--md-bg),0 0 4px var(--md-bg)}
    .md-b.editing{outline:2px solid #ff6740;cursor:text;background:#fffffff2!important;color:#111!important;text-shadow:none!important}
    .md-b.off{opacity:.08}
    .md-b{touch-action:none;user-select:none}
    .md-b.dragging{cursor:grabbing;opacity:.85;outline:2px dashed #ff6740}
    .md-b.st-small,.md-b.st-whisper{line-height:1.05;letter-spacing:-.2px}
    .md-b.st-big{line-height:1.05;font-weight:800}
    .md-b.st-shout{line-height:1;font-weight:800;font-style:italic;letter-spacing:.5px}
    .md-b.st-narration{font-weight:500}
    /* st-vertical: no writing-mode - Vietnamese is never set top-to-bottom; the tall narrow box itself gives the
       one-or-two-words-per-line column scanlators use (live report: a logo and a name label in tiny vertical text) */
    .md-b.k-box{border-radius:2px}
    .md-b.k-art{border-radius:40%/30%;box-shadow:0 0 6px 5px var(--md-bg,#fff)}
    .md-status{position:absolute;top:4px;left:4px;max-width:calc(100% - 24px);background:#000c;color:#fff;font:12px/1.4 sans-serif;padding:4px 8px;border-radius:4px;pointer-events:auto}
    .md-retry.ghost{background:#ffffff26}
    .md-miss{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;border:1.5px solid #ff6740;
      background:#fffc;color:#ff6740;font:700 15px/18px sans-serif;padding:0;cursor:pointer;pointer-events:auto;opacity:.4;z-index:2}
    .md-miss:hover{opacity:1}
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
  // Speech bubbles get lines shaped like the bubble (ellipseLines in fit.js: short top/bottom, long middle),
  // measured on a canvas with the box's own font; boxes, captions and art text keep balanced wrapping.
  const mctx = document.createElement('canvas').getContext('2d');
  const shapeAt = (b, size) => {
    const cs = getComputedStyle(b);
    mctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const lh = size * (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) || 1.15);
    return ellipseLines(b.dataset.raw || b.textContent, (t) => mctx.measureText(t).width * 1.04, b.clientWidth - 6, b.clientHeight - 4, lh);
  };
  const shaped = (b) => b.dataset.shape === '1' && typeof ellipseLines === 'function' && !b.classList.contains('editing');
  const search = (b, lo, hi) => {
    let best = lo, bestLines = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      b.style.fontSize = mid + 'px';
      let ok;
      if (shaped(b)) { const lines = shapeAt(b, mid); ok = !!lines; if (ok) bestLines = lines; } else ok = fits(b);
      if (ok) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    b.style.fontSize = best + 'px';
    if (shaped(b)) {
      const lines = bestLines && parseFloat(b.style.fontSize) === best ? bestLines : shapeAt(b, best);
      if (lines) { b.classList.add('shaped'); b.textContent = lines.join('\n'); }
      else { b.classList.remove('shaped'); b.textContent = b.dataset.raw; } // not even the floor fits: let CSS wrap
    }
    return best;
  };
  // place a box at (x, y, w, h) %, never past the bubble's own outline when it is known (cleanPatch inner)
  const setBox = (b, x, y, w, h) => {
    if (b.dataset.limit) {
      const [lx, ly, lw, lh] = JSON.parse(b.dataset.limit);
      const x1 = Math.min(x + w, lx + lw), y1 = Math.min(y + h, ly + lh);
      x = Math.max(x, lx); y = Math.max(y, ly); w = Math.max(0.5, x1 - x); h = Math.max(0.5, y1 - y);
    }
    Object.assign(b.style, { left: x + '%', top: y + '%', width: w + '%', height: h + '%' });
  };
  const fit = (b) => {
    const st = b.dataset.style || '';
    let lo = 8, hi = 30;
    if (st === 'big' || st === 'shout') hi = 38;
    else if (st === 'small' || st === 'whisper') { lo = 7; hi = 18; }
    else if (st === 'narration') hi = 24;
    const src = (+b.dataset.lh || 0) / 100 * (b.parentElement?.clientHeight || 0); // source letter height, px
    // never capped below ~13px: a measured height can come from a tiny romaji line under a big logo (live run:
    // the series title in 5px text inside its own black block)
    if (src) hi = Math.max(lo, Math.min(hi, Math.max(13, Math.round(src * (st === 'big' || st === 'shout' ? 1.9 : 1.5)))));
    const best = search(b, lo, hi);
    if (src && best < src * 0.9 && !b.dataset.grown && b.dataset.box) {
      const [x, y, w, h] = JSON.parse(b.dataset.box);
      const w2 = Math.min(100, w * 1.3), h2 = Math.min(100, h * 1.2);
      b.dataset.grown = '1';
      setBox(b, Math.max(0, Math.min(100 - w2, x - (w2 - w) / 2)), Math.max(0, Math.min(100 - h2, y - (h2 - h) / 2)), w2, h2);
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
    return { msg: { data: c.toDataURL('image/jpeg', 0.88).split(',')[1], mime: 'image/jpeg', w: c.width, h: c.height }, px: g.getImageData(0, 0, c.width, c.height), clean: src };
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
    setBox(b, Math.max(0, Math.min(100 - w2, x - (w2 - w) / 2)), Math.max(0, Math.min(100 - h2, y - (h2 - h) / 2)), w2, h2);
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
  const MAX_RECOVER = 8; // one API call for all of them (stacked crops), so more is cheap
  const blockKey = (t) => Math.round(t.x) + ',' + Math.round(t.y);
  async function recover(img, px, have, o, only) {
    if (typeof textBlocks !== 'function') return [];
    // A block counts as translated only when a pixel-verified box covers most of it. A box that merely
    // touches it (the model merged two bubbles and parked the line next door, live Sangeki run: "VENDIÓ MI
    // PAPÁ LA MONTAÑA?" never re-read) or a blind box the pixels didn't confirm does not.
    const covered = (t) => have.some((b) => {
      if (b.fit === 'kept') return false;
      const x = Math.max(0, Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x));
      const y = Math.max(0, Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y));
      return x * y >= 0.6 * t.w * t.h;
    });
    const missing = only || textBlocks(px).filter((t) => !t.faded && !covered(t)).sort((a, b) => b.n - a.n).slice(0, MAX_RECOVER);
    if (!missing.length) return [];
    o.asked ||= new Set();
    for (const t of missing) o.asked.add(blockKey(t));
    o.say(`Dịch bù ${missing.length} khối chữ bị sót…`);
    const src = o.clean || img; // untainted copy: cropping a cross-origin <img> would throw
    const NW = src.naturalWidth, NH = src.naturalHeight;
    // All missed blocks go out as ONE image: the crops stacked with black bars between them, then each
    // returned box is mapped back to the crop it sits in. One API call instead of up to four (free tiers
    // allow ~15 a minute), and the model still reads every block at full resolution.
    const crops = missing.map((t) => ({ t, ...(() => {
      const padX = Math.max(t.w * 0.5, 4), padY = Math.max(t.h * 0.5, 3); // the block plus room for its bubble
      const x = Math.max(0, t.x - padX), y = Math.max(0, t.y - padY);
      const w = Math.min(100 - x, t.w + 2 * padX), h = Math.min(100 - y, t.h + 2 * padY);
      const sw = w / 100 * NW, sh = h / 100 * NH;
      const k = Math.min(2, 900 / Math.max(sw, sh)); // upscale small crops: tiny text reads better bigger
      return { x, y, w, h, sx: x / 100 * NW, sy: y / 100 * NH, sw, sh, cw: Math.round(sw * k), ch: Math.round(sh * k) };
    })() }));
    const GAP = 16;
    const sheet = document.createElement('canvas');
    sheet.width = Math.max(...crops.map((c) => c.cw));
    sheet.height = crops.reduce((n, c) => n + c.ch, 0) + GAP * (crops.length - 1);
    const sg = sheet.getContext('2d');
    sg.fillStyle = '#000'; sg.fillRect(0, 0, sheet.width, sheet.height);
    let top = 0;
    for (const c of crops) { c.top = top; sg.drawImage(src, c.sx, c.sy, c.sw, c.sh, 0, top, c.cw, c.ch); top += c.ch + GAP; }
    let found = [];
    try {
      const r = await chrome.runtime.sendMessage({ type: 'translate', data: sheet.toDataURL('image/jpeg', 0.9).split(',')[1], mime: 'image/jpeg', w: sheet.width, h: sheet.height,
        context: have.map((b) => b.text).join('\n'), glossary: window.__md.glossary, site: (o.series || series()).key, seriesLabel: (o.series || series()).label, part: true, tag: o.tag });
      o.recoverError = r.error || ''; // the reader's "+" says why nothing came back
      if (!r.error && r.bubbles?.length) {
        // Each crop was cut around ONE detected block, so the block's own rectangle is where its translation
        // goes - the model's coordinates only say which returned line belongs to which crop. Placing by the
        // model's box inside the crop lost lines (anchoring/dropping moved them off). A crop also shows bits
        // of neighbouring bubbles: keep the line(s) sitting on the block, else the one nearest to it.
        const mapped = r.bubbles.map((b) => {
          const cy = (b.y + b.h / 2) / 100 * sheet.height, cx = (b.x + b.w / 2) / 100 * sheet.width;
          const c = crops.find((q) => cy >= q.top && cy < q.top + q.ch && cx < q.cw);
          if (!c) return null; // on a black bar or past a narrow crop: not a real block
          return { b, c, px: c.x + cx / c.cw * c.w, py: c.y + (cy - c.top) / c.ch * c.h }; // centre in page %
        }).filter(Boolean);
        const placed = crops.flatMap((c) => {
          const mine = mapped.filter((m) => m.c === c);
          if (!mine.length) return [];
          const t = c.t, near = (m) => Math.hypot(m.px - (t.x + t.w / 2), m.py - (t.y + t.h / 2));
          const on = mine.filter((m) => m.px > t.x - t.w * 0.3 && m.px < t.x + t.w * 1.3 && m.py > t.y - t.h * 0.3 && m.py < t.y + t.h * 1.3);
          const pick = on.length ? on.sort((a, z) => a.py - z.py) : [mine.sort((a, z) => near(a) - near(z))[0]];
          const text = pick.map((m) => m.b.text).join(' ').trim();
          if (!text) return [];
          const first = pick[0].b;
          return [{ x: t.x, y: t.y, w: t.w, h: t.h, text, ...(first.src && { src: pick.map((m) => m.b.src).join(' ') }),
            ...(first.kind && { kind: first.kind }), ...(first.style && { style: first.style }), ...(first.sfx && { sfx: true }), rec: true }];
        });
        found = typeof fitBubbles === 'function' ? fitBubbles(px, placed, false) : placed;
      }
    } catch { /* recovery is best-effort */ }
    o.status.remove();
    if (o.cancelled) return [];
    // a recovered box landing on text another box already holds is the model re-reading it: drop it
    return found.filter((b) => !covered({ x: b.x + b.w * 0.25, y: b.y + b.h * 0.25, w: b.w * 0.5, h: b.h * 0.5 }));
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
      // Only chapter pages cost tokens (live reports: the home page banner, a series page's covers). Not a
      // known chapter URL - MangaDex also moves to its home page without reloading - means: auto-started
      // tabs skip everything; a manual start only takes images shown like a reader page, portrait and at
      // least ~45% of the window wide (covers and chapter-list thumbnails never are).
      // portrait both as a file and as shown: the home page hero is a square file cropped into a wide strip
      if (!reader() && (window.__mdQuiet || i.naturalHeight < i.naturalWidth * 1.15 || r.height < r.width * 1.15 || r.width < innerWidth * 0.45)) continue;
      pages.push(i); rects.push(r);
    }
    const vh = innerHeight;
    const onScreen = (r) => r.width && r.bottom > 0 && r.top < vh;
    let cur = -1;
    rects.forEach((r, i) => { if (onScreen(r)) cur = i; }); // last page on screen
    let best = null;
    pages.forEach((img, idx) => {
      if (img.dataset.mdDone) return;
      const r = rects[idx];
      let s = null;
      if (onScreen(r)) s = 0;
      else if (cur >= 0 && idx > cur && idx <= cur + AHEAD) s = idx - cur + (r.width ? 0.5 : 0.6);
      else if (r.width && AHEAD && r.bottom <= 0 && r.bottom > -vh) s = 1 + AHEAD; // just above: scrolling back
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
      quiet({ type: 'cancel', tag: o.tag });
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
      el.classList.toggle('manga-font', fontReady);
      const patches = document.createElement('div'); // erased source text, always below every translation
      patches.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      el.append(patches);
      if (!list.length) { // say so instead of silently clearing the status
        status.textContent = 'Không thấy chữ nào để dịch trên trang này';
        el.append(status);
      }
      // tách các khung chồng nhau TRƯỚC khi vẽ (lỗi "khung dịch đè lên nhau" trong ảnh chụp)
      // Pixel-fitted boxes already sit on their own letters and never overlap (fit.js stops each one at its
      // neighbours); pushing them apart moved a translation off its bubble (real run: "Với lại…" shoved up
      // over the art, its Indonesian text left showing). Only raw model boxes still need separate().
      const separated = list.some((t) => t.fit) ? (typeof trimOverlaps === 'function' ? trimOverlaps(list) : list.slice()) : separate(list.slice());
      o.drawn = separated; // what the reader actually sees (unverified boxes may have been dropped here)
      separated.sort((a, z) => (a.text || '').length - (z.text || '').length); // still overlapping: longer text drawn on top
      // boxes without their own letter height (blind/anchored) borrow the page's typical one
      const lhs = separated.map((t) => t.lh).filter(Boolean).sort((a, z) => a - z);
      const pageLh = lhs.length ? lhs[lhs.length >> 1] : 0;
      const made = [], jobs = [];
      const gen = (o.drawGen = (o.drawGen || 0) + 1); // a newer draw (draft -> final) abandons this one's work
      const blocks = o.px && typeof textBlocks === 'function' ? textBlocks(o.px) : [];
      for (const t of separated) {
        const b = document.createElement('div');
        // kind (from the model: bubble/box/art/sfx) decides the look: text drawn on the art gets a soft-edged
        // patch in the art's own colour instead of a hard rectangle, captions keep square corners
        b.className = 'md-b' + (t.style ? ' st-' + t.style : '') + (t.kind ? ' k-' + t.kind : '');
        if (t.bg) b.style.setProperty('--md-bg', t.bg);
        b.dataset.style = t.style || '';
        // Line breaks chosen for THIS bubble's shape (a narrow bubble gets short, few-word lines),
        // then white-space:pre-line renders them verbatim - the fit below only scales the font.
        // The browser wraps at the box's real width with balanced lines (text-wrap: balance). Pre-broken
        // lines from wrapText() were re-wrapped by CSS whenever the font cap left them wider than the box
        // (real run: "…đến đây / khi / hôm nay được / nghỉ / học…"); a word never splits mid-syllable.
        b.textContent = t.text;
        b.dataset.raw = t.text;
        if (!t.kind || t.kind === 'bubble') b.dataset.shape = '1';
        b.dataset.text = JSON.stringify({ text: t.text, sfx: !!t.sfx, style: t.style || '' }); // SFX toggle re-wraps without a new call
        b.dataset.ar = t.w / t.h;
        if (t.lh || pageLh) b.dataset.lh = t.lh || pageLh;
        b.dataset.box = JSON.stringify([t.x, t.y, t.w, t.h]);
        b.title = 'Bấm: ẩn/hiện bản dịch · Bấm đúp: sửa câu · Kéo: di chuyển · Shift+kéo: đổi cỡ';
        Object.assign(b.style, { left: t.x + '%', top: t.y + '%', width: t.w + '%', height: t.h + '%' },
          t.bg && { background: t.bg, color: t.fg }); // dark/coloured bubbles keep their look
        if (faded) b.style.opacity = '.75';
        // Erase the source lettering itself (cleanPatch, fit.js) instead of covering it with a block: the
        // translation then sits on clean paper / continued screentone, like a real scanlation. Boxes the
        // pixels couldn't verify (kept) still get the coloured block.
        let patch = null;
        const mine = o.moves?.[lineKey(t.text)]; // where the reader put this line (drag), kept across reloads
        if (mine) {
          Object.assign(b.style, { left: mine[0] + '%', top: mine[1] + '%', width: mine[2] + '%', height: mine[3] + '%' });
          b.dataset.box = JSON.stringify(mine); b.dataset.ar = mine[2] / mine[3]; b.dataset.user = '1';
        }
        // Erasing and the slant are pixel work (~50-100ms a box): done in small chunks after the page is drawn,
        // so scrolling never freezes while a page is being translated (live report: the page stuttered)
        const dress = () => {
          const lum = /(\d+),\s*(\d+),\s*(\d+)/.exec(t.bg || '');
          const toned = lum && (() => { const v = 0.299 * lum[1] + 0.587 * lum[2] + 0.114 * lum[3]; return v > 70 && v < 190; })();
          if (o.px && t.fit && t.fit !== 'kept' && !toned && typeof cleanPatch === 'function') {
            try {
              // erase the whole lettering: the box (all of it, even if its text got half after a split) grown to
              // every detected text block it sits on - a box covering only the top of a bubble's text left the
              // last lines ("BERNIAT…", "SEMPAT MIKIR") standing
              // full = letters this line answers for; once it spans another line still drawn, erasing it hit that
              // neighbour's bubble and left this caption untouched (live 66dcdbac/9: "BECAUSE SHE WAS—")
              const f = t.full, holds = (u) => u !== t && u.x + u.w / 2 > f.x && u.x + u.w / 2 < f.x + f.w && u.y + u.h / 2 > f.y && u.y + u.h / 2 < f.y + f.h;
              const r0 = { ...(f && !separated.some(holds) ? f : t), kind: t.kind, bg: t.bg };
              let er = { ...r0 };
              for (const k of blocks) {
                const ix = Math.max(0, Math.min(k.x + k.w, r0.x + r0.w) - Math.max(k.x, r0.x)), iy = Math.max(0, Math.min(k.y + k.h, r0.y + r0.h) - Math.max(k.y, r0.y));
                if (ix * iy < 0.3 * k.w * k.h) continue;
                const x0 = Math.min(er.x, k.x), y0 = Math.min(er.y, k.y);
                er = { ...er, x: x0, y: y0, w: Math.max(er.x + er.w, k.x + k.w) - x0, h: Math.max(er.y + er.h, k.y + k.h) - y0 };
              }
              const c = cleanPatch(o.px, er);
              if (c) {
                patch = document.createElement('canvas');
                patch.className = 'md-patch';
                patch.width = c.pw; patch.height = c.ph;
                patch.getContext('2d').putImageData(new ImageData(c.data, c.pw, c.ph), 0, 0);
                Object.assign(patch.style, { left: c.x + '%', top: c.y + '%', width: c.w + '%', height: c.h + '%' });
                patches.append(patch);
                b.classList.add('clean');
                // the bubble's own shape is known: a box that spilled past its outline is pulled back inside it,
                // so the translation is laid out in the bubble, not across its edge
                const n = c.inner;
                if (n && !b.dataset.user) b.dataset.limit = JSON.stringify([n.x, n.y, n.w, n.h]);
                if (n && !b.dataset.user && n.w * n.h < 0.9 * t.w * t.h) {
                  const pad = 0.08, nx = n.x + n.w * pad, ny = n.y + n.h * pad, nw = n.w * (1 - 2 * pad), nh = n.h * (1 - 2 * pad);
                  Object.assign(b.style, { left: nx + '%', top: ny + '%', width: nw + '%', height: nh + '%' });
                  b.dataset.ar = nw / nh;
                  b.dataset.box = JSON.stringify([nx, ny, nw, nh]);
                }
              }
            } catch { /* keep the coloured block */ }
          }
          // Not erased: an opaque block. Over the whole box it spilled past the bubble's outline onto the art
          // (live reports), because the box was widened into the bubble or came bigger from the model. The
          // lettering's own extent is inside the bubble: the block covers that, a little margin around it.
          if (!patch && t.core && t.fit !== 'kept' && !b.dataset.user) {
            const [cx, cy, cw, ch] = t.core, px2 = Math.min(1.2, cw * 0.06), py2 = Math.min(1, ch * 0.08);
            const nx = cx - px2, ny = cy - py2, nw = cw + 2 * px2, nh = ch + 2 * py2;
            if (nw * nh < 0.85 * t.w * t.h) {
              Object.assign(b.style, { left: nx + '%', top: ny + '%', width: nw + '%', height: nh + '%' });
              b.dataset.box = JSON.stringify([nx, ny, nw, nh]);
              b.dataset.ar = nw / nh;
              b.dataset.limit = JSON.stringify([nx - nw * 0.1, ny - nh * 0.1, nw * 1.2, nh * 1.2]); // growing for a readable size stays near
            }
          }
          // A shout drawn on the art that can't be erased (its letters touch the drawing - live 66dcdbac/9: a
          // vertical "AARGHHH!!" fused with a white face) became a black block over the face. A band across its
          // middle carries the translation; the source shout stays visible above and below, like an SFX note.
          if (!patch && t.kind === 'art' && (t.style === 'shout' || t.sfx) && !b.dataset.user && t.h > 8) {
            const [bx, by, bw, bh] = JSON.parse(b.dataset.box), nh = Math.max(6, bh * 0.28), ny = by + (bh - nh) / 2;
            Object.assign(b.style, { top: ny + '%', height: nh + '%' });
            b.dataset.box = JSON.stringify([bx, ny, bw, nh]);
            b.dataset.ar = bw / nh;
            delete b.dataset.limit;
          }
          // Slanted lettering (a hand-written note, a tilted sign): the translation follows its angle (live report:
          // a letter written in slanted lines came out in level lines). The box shrinks to the rotated rectangle
          // whose bounding box is the source's, so the turned text stays on it.
          const deg = !b.dataset.user && o.px && typeof textAngle === 'function' && t.fit && t.fit !== 'kept' && t.kind !== 'sfx' && t.style !== 'vertical' ? textAngle(o.px, t.full || t) : 0;
          if (deg) {
            const [bx, by, bw, bh] = JSON.parse(b.dataset.box), IW = o.px.width, IH = o.px.height, Wp = bw / 100 * IW, Hp = bh / 100 * IH;
            const r = Math.abs(deg) * Math.PI / 180, co = Math.cos(r), si = Math.sin(r), den = co * co - si * si;
            let w2 = (Wp * co - Hp * si) / den, h2 = (Hp * co - Wp * si) / den;
            if (!(w2 > 0.3 * Wp && h2 > 0.3 * Hp)) { w2 = Wp * 0.85; h2 = Hp * 0.85; } // steep and squarish: just turn it
            const nw = w2 / IW * 100, nh = h2 / IH * 100, nx = bx + (bw - nw) / 2, ny = by + (bh - nh) / 2;
            Object.assign(b.style, { left: nx + '%', top: ny + '%', width: nw + '%', height: nh + '%', transform: `rotate(${deg}deg)` });
            b.dataset.box = JSON.stringify([nx, ny, nw, nh]);
            b.dataset.ar = nw / nh;
            delete b.dataset.limit;
          }
        };
        jobs.push(dress);
        // Drag a translation to move it, Shift+drag to resize it. The spot is kept for this page and teaches the
        // extension where this model's boxes tend to land (background.js learnPlacement).
        let dragged = false;
        b.onpointerdown = (e) => {
          if (b.classList.contains('editing') || e.button !== 0) return;
          b.endDrag?.(); // a drag whose release never arrived (pointer lost): drop its listeners first
          try { b.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
          const L = el.getBoundingClientRect(), [x0, y0, w0, h0] = JSON.parse(b.dataset.box), sx = e.clientX, sy = e.clientY, resize = e.shiftKey;
          dragged = false;
          const mv = (ev) => {
            if (!dragged && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; // a click, not a drag
            dragged = true; b.classList.add('dragging');
            const dx = (ev.clientX - sx) / L.width * 100, dy = (ev.clientY - sy) / L.height * 100;
            const box = resize ? [x0, y0, Math.max(2, w0 + dx), Math.max(1.5, h0 + dy)] : [x0 + dx, y0 + dy, w0, h0];
            Object.assign(b.style, { left: box[0] + '%', top: box[1] + '%', width: box[2] + '%', height: box[3] + '%' });
            b.dataset.box = JSON.stringify(box);
          };
          const end = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', end); b.endDrag = null; b.classList.remove('dragging'); };
          const up = () => {
            end();
            if (!dragged) return;
            const box = JSON.parse(b.dataset.box);
            b.dataset.user = '1'; b.dataset.ar = box[2] / box[3]; b.style.transform = '';
            delete b.dataset.limit; delete b.dataset.grown; delete b.dataset.grownK;
            fit(b);
            (o.moves ||= {})[lineKey(t.text)] = box;
            quiet({ type: 'move', key: o.key, text: t.text, box });
          };
          addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', end);
          b.endDrag = end;
        };
        b.onclick = () => {
          if (dragged) { dragged = false; return; }
          if (b.classList.contains('editing')) return;
          b.classList.toggle('off'); patch?.classList.toggle('off', b.classList.contains('off'));
        };
        // Double-click: fix the line. The fix replaces it in the cache and becomes an example the AI imitates
        // on the next pages of this series.
        b.ondblclick = (e) => {
          e.stopPropagation();
          b.classList.remove('off'); patch?.classList.remove('off');
          b.classList.add('editing'); b.classList.remove('shaped');
          b.textContent = b.dataset.raw; b.contentEditable = 'plaintext-only';
          b.focus();
          const done = (save) => {
            b.contentEditable = 'false'; b.classList.remove('editing');
            const fix = b.textContent.replace(/\s+/g, ' ').trim();
            if (save && fix && fix !== t.text) {
              quiet({ type: 'correct', site: (o.series || series()).key, seriesLabel: (o.series || series()).label, key: o.key, src: t.src || '', ai: t.text, fix });
              t.text = fix; b.dataset.raw = fix;
              b.dataset.text = JSON.stringify({ text: fix, sfx: !!t.sfx, style: t.style || '' });
            }
            b.textContent = b.dataset.raw; fit(b);
          };
          b.onkeydown = (k) => { if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); b.blur(); } if (k.key === 'Escape') { b.textContent = t.text; b.blur(); } };
          b.onblur = () => { b.onblur = null; done(true); };
        };
        made.push(b);
      }
      // Opaque blocks (boxes whose source text couldn't be erased) go UNDER every transparent one: a white
      // block drawn later sat on top of a neighbour's translation and hid it (live reports). Within each
      // group the order stays: longer text on top.
      made.sort((a, z) => a.classList.contains('clean') - z.classList.contains('clean'));
      el.append(...made);
      o.fitW = null; // force a fit for the new bubbles
      place();
      const step = () => {
        if (o.drawGen !== gen || o.cancelled || !el.isConnected) return;
        const t0 = performance.now();
        while (jobs.length && performance.now() - t0 < 12) jobs.shift()(); // ~one frame of work, then let the page breathe
        if (jobs.length) { setTimeout(step, 0); return; }
        // all patches in: opaque blocks go under the transparent (erased) ones again, then re-lay the text
        const order = made.slice().sort((a, z) => a.classList.contains('clean') - z.classList.contains('clean'));
        for (const m of order) if (m.isConnected) el.append(m);
        o.fitW = null;
        place();
      };
      setTimeout(step, 0);
    };
    try {
      const { msg, px, clean } = await encode(img);
      o.clean = clean || img;
      o.px = px;
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
      o.series = await seriesNow();
      if (!window.__mdQuiet && !boundKey && o.series.key !== SITE) boundKey = o.series.key;
      const final = chrome.runtime.sendMessage({ type: 'translate', ...msg, context, glossary: window.__md.glossary, site: o.series.key, seriesLabel: o.series.label, urgent, draftPort: portName })
        .finally(() => { stage = 'final'; try { port.disconnect(); } catch { /* already gone */ } });
      let early = null; // the missed-text pass, started on the draft's boxes while polish still runs
      draft.then((bubbles) => { // read pass done, polish still running: show the draft now
        if (stage !== 'waiting' || o.cancelled || !px || typeof fitBubbles !== 'function') return;
        stage = 'draft';
        const fitted = fitBubbles(px, bubbles);
        draw(fitted, true);
        // polish changes words, never boxes: what the draft misses the final misses too. Starting the crop
        // call now saves a whole API round trip per page (live GPT run: read 21s + polish 15s + crops after)
        if (window.__md.recover) early = recover(img, px, fitted, o).catch(() => []);
        clearInterval(timer);
        o.say('Đang trau chuốt văn phong…');
      }).catch(() => {});
      const res = await final;
      if (o.cancelled) return;
      if (res.error) throw new Error(res.error);
      o.key = res.key;
      o.moves = res.moves || {};
      if (res.glossary) window.__md.glossary = res.glossary; // pronoun pairs agreed so far, shared by later pages
      // snap boxes to the real bubbles and take their colours (fit.js, injected before this file)
      if (px && typeof fitBubbles === 'function') res.bubbles = fitBubbles(px, res.bubbles);
      draw(res.bubbles);
      texts.set(img, res.bubbles.map((t) => t.text).join('\n'));
      if (px && window.__md.recover) {
        // Round 2 only when round 1 dropped a misplaced duplicate: that box sat on a bubble of its own
        // (live Sangeki run: "POR CUÁNTO..." left bare after its merged line moved to "VENDIÓ…").
        for (let round = 0, dropped = 0; round < 2 && (round === 0 || dropped) && !o.cancelled; round++) {
          const extra = round === 0 && early ? await early : await recover(img, px, res.bubbles, o);
          dropped = absorb(extra);
        }
      }
      offerMissing();
      // Recovered lines join the page: re-reads of an existing line are folded into it, a line the page pass
      // put in the wrong place gives way to the crop's copy. Returns how many page lines were dropped.
      function absorb(extra) {
        const before = res.bubbles.length;
        let lost = 0;
        if (extra.length && !o.cancelled) {
          // The model often merges two neighbouring bubbles into one line and leaves the second bubble's
          // text untranslated; the recovered crop then repeats that part (live Sangeki run: "Thôi nào,
          // Roka. Giúp tớ một tay đi chứ." shown twice). Keep it in its own bubble only.
          // Same sentence twice = the page pass put that line in the wrong place (live Sangeki run: on a
          // character's hair beside the bubble) and the crop found its real bubble; the crop sits on verified
          // lettering, so it wins and the misplaced copy goes.
          const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
          // A recovered crop that only re-reads part of a caption the page pass already translated (it covered
          // the caption only partly, live GPT run: "Santa-sama được triệu hồi…" drawn twice, a narrow strip
          // "Nhưng... có... vấn đề..." beside "Nhưng chuyện đó lại có một vấn đề..."): same words nearby =
          // the same text. The page line stays (it was polished with context) and grows over the crop's
          // block, so its source letters get erased too; the crop's copy goes.
          const words = (t) => String(t || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
          const similar = (a, b) => {
            const A = words(a), B = new Set(words(b));
            if (A.length < 2 || B.size < 2) return false;
            return A.filter((w) => B.has(w)).length / Math.min(A.length, B.size) >= 0.6;
          };
          const near = (x, b) => x.x < b.x + b.w * 1.5 && x.x + x.w > b.x - b.w * 0.5 && x.y < b.y + b.h * 1.5 && x.y + x.h > b.y - b.h * 0.5;
          extra.splice(0, extra.length, ...extra.filter((x) => {
            const dup = res.bubbles.find((b) => norm(b.text) !== norm(x.text) && near(x, b) && (similar(x.text, b.text) || similar(x.src, b.src)));
            if (!dup) return true;
            const f = dup.full || dup, x0 = Math.min(f.x, x.x), y0 = Math.min(f.y, x.y);
            dup.full = { ...f, x: x0, y: y0, w: Math.max(f.x + f.w, x.x + x.w) - x0, h: Math.max(f.y + f.h, x.y + x.h) - y0 };
            if (dup.fit === 'kept') Object.assign(dup, { x: x.x, y: x.y, w: x.w, h: x.h, fit: x.fit }); // the crop found its real place
            return false;
          }));
          const again = new Set(extra.map((x) => norm(x.text)));
          res.bubbles = res.bubbles.filter((b) => !again.has(norm(b.text)));
          lost = before - res.bubbles.length;
          for (const x of extra) for (const b of res.bubbles) {
            const t = (x.text || '').trim();
            if (t.length >= 6 && b.text !== t && b.text.includes(t)) b.text = b.text.replace(t, '').replace(/\s{2,}/g, ' ').trim();
          }
          res.bubbles = res.bubbles.filter((b) => /[\p{L}\p{N}]/u.test(b.text)).concat(extra);
          draw(res.bubbles);
          texts.set(img, res.bubbles.map((t) => t.text).join('\n'));
        }
        return lost;
      }
      // A faint "+" on lettering still left untranslated, so the reader can ask for that spot alone (live
      // request). Only where the pixels are sure: a dialogue-sized block (6+ letters) that no translation
      // touches, that sits on clean paper, and that the automatic pass hasn't already shown to the AI.
      function offerMissing() {
        if (!px || typeof textBlocks !== 'function' || o.cancelled) return;
        el.querySelectorAll('.md-miss').forEach((m) => m.remove());
        const over = (t, b) => Math.max(0, Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x)) * Math.max(0, Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y));
        // lettering sits on paper: most of a ring around the block is plain light (hair, dark art are not)
        const onPaper = (t) => {
          const W = px.width, H = px.height, d = px.data, pad = Math.max(3, t.h / 100 * H * 0.6);
          const x0 = Math.max(0, Math.floor(t.x / 100 * W - pad)), x1 = Math.min(W, Math.ceil((t.x + t.w) / 100 * W + pad));
          const y0 = Math.max(0, Math.floor(t.y / 100 * H - pad)), y1 = Math.min(H, Math.ceil((t.y + t.h) / 100 * H + pad));
          const ix0 = t.x / 100 * W, ix1 = (t.x + t.w) / 100 * W, iy0 = t.y / 100 * H, iy1 = (t.y + t.h) / 100 * H;
          let n = 0, light = 0;
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
            if (x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue;
            const i = (y * W + x) * 4; n++;
            if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] > 215) light++;
          }
          return n > 0 && light >= 0.6 * n;
        };
        // the AI already looked at it (automatic recovery) and found no text: not offered again
        // 12+ letters: real dialogue blocks measured 12-125, the drawing that fooled the detector 6-8
        // inside a closed speech bubble (its own outline found around the letters): text for sure, even where the
        // AI already looked and came back empty (live report: two English bubbles left, no button shown)
        const inBubble = (t) => typeof cleanPatch === 'function' && !!cleanPatch(px, { x: t.x, y: t.y, w: t.w, h: t.h, kind: 'bubble', bg: 'rgb(255,255,255)' })?.inner;
        const shown = o.drawn || res.bubbles;
        const open = textBlocks(px).filter((t) => !t.faded && t.n >= 12 && onPaper(t)
          && !shown.some((b) => over(t, b) > 0.3 * t.w * t.h || over(t, b.full || b) > 0.3 * t.w * t.h)
          && (!o.asked?.has(blockKey(t)) || inBubble(t)));
        for (const t of open.slice(0, 6)) {
          const m = document.createElement('button');
          m.className = 'md-miss';
          m.textContent = '+';
          m.title = 'Chỗ này còn chữ chưa dịch - bấm để dịch riêng chỗ này';
          Object.assign(m.style, { left: t.x + t.w / 2 + '%', top: t.y + t.h / 2 + '%' });
          m.onclick = async (e) => {
            e.stopPropagation();
            m.disabled = true; m.textContent = '…';
            const extra = await recover(img, px, res.bubbles, o, [t]).catch(() => []);
            if (extra.length) { absorb(extra); offerMissing(); return; }
            if (o.recoverError) { // API trouble (quota, network): keep the button for another try
              m.disabled = false; m.textContent = '+';
              toast('Lỗi: ' + String(o.recoverError).split('\n')[0].slice(0, 120));
              return;
            }
            m.remove(); toast('Không thấy chữ cần dịch ở chỗ đó');
          };
          el.append(m);
        }
      }
    } catch (e) {
      if (o.cancelled) return;
      // The extension was reloaded/updated under this page: this script can't reach it any more and retrying
      // can't help (live report: "Extension context invalidated" with a useless Thử lại button).
      if (/context invalidated|Extension context/i.test(String(e.message))) {
        stopped = true;
        status.textContent = 'Extension vừa được cập nhật - bấm F5 để dịch tiếp';
        el.replaceChildren(status);
        return;
      }
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
  // A manual start (button/shortcut, not a site set to auto-translate) belongs to the series it was pressed
  // on: moving to another series, the home page or a series' info page stops translating until the button is
  // pressed again - no tokens spent on something you didn't ask for (live request). The next page or chapter
  // of the same series carries on. MangaDex changes the URL without reloading, so every URL change is checked
  // before the next page is picked.
  let boundKey = null, lastUrl = location.href, checking = false;
  const leftSeries = (why) => {
    stop();
    toast(why + ' - bấm nút Manga Dịch (hoặc Alt+Shift+D) để dịch tiếp.');
  };
  const checkPlace = async () => {
    checking = true;
    try {
      if (!reader()) { leftSeries('Đã dừng dịch vì bạn rời trang đọc truyện'); return; }
      const s = await seriesNow();
      if (boundKey && s.key !== boundKey && s.key !== SITE) leftSeries('Đã dừng dịch vì bạn chuyển sang bộ truyện khác');
    } finally { checking = false; }
  };
  function pump() {
    if (!stopped && !window.__mdQuiet && location.href !== lastUrl) { lastUrl = location.href; checkPlace().then(() => pump()); return; }
    if (checking) return;
    // extension reloaded/updated under this tab: every chrome.* call now throws, so stop picking pages
    if (!stopped && !alive()) { stopped = true; toast('Extension vừa được cập nhật - bấm F5 để dịch tiếp'); return; }
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
        else { b.textContent = t.text; b.dataset.raw = t.text; }
      }
      o.fitW = null;
    }
    place();
  };

  // Dừng dịch cả tab (popup): cancel every page in progress and stop picking new ones. Pages already
  // translated stay on screen. resume() (popup/shortcut again, or "Dịch lại" on a page) starts again.
  const stop = () => { stopped = true; for (const o of overlays) o.cancel?.(); };
  const bindHere = () => { // the series on screen when the button is pressed
    if (window.__mdQuiet) return;
    lastUrl = location.href;
    seriesNow().then((s) => { if (s.key !== SITE) boundKey = s.key; }, () => {});
  };
  const resume = (rebind) => { stopped = false; if (rebind) { boundKey = null; bindHere(); } };
  // Comic lettering font (Mali, OFL, full Vietnamese) bundled with the extension. Loaded as bytes through
  // FontFace, not a url(): the manga site's CSP font-src can't block an ArrayBuffer. "system" = old look.
  let fontReady = false;
  const loadFont = async () => {
    try {
      const { font = 'manga' } = await chrome.storage.local.get('font');
      if (font === 'system' || !chrome.runtime.getURL) return;
      for (const [file, weight] of [['fonts/Mali-SemiBold.ttf', '600'], ['fonts/Mali-Bold.ttf', '800']]) {
        const buf = await (await fetch(chrome.runtime.getURL(file))).arrayBuffer();
        const face = new FontFace('MangaDich', buf, { weight });
        await face.load();
        document.fonts.add(face);
      }
      fontReady = true;
      for (const o of overlays) { o.el.classList.add('manga-font'); o.fitW = null; }
      place();
    } catch { /* system font */ }
  };
  loadFont();

  bindHere();
  window.__md = { overlays, pump, setSfx, stop, resume, running: () => !stopped, glossary: '', textOnly: true, sfx: true, recover: true, site: SITE };
  chrome.storage.local.get(['sfx', 'textOnly', 'recover', 'ahead']).then((s) => {
    AHEAD = s.ahead ?? 2;
    pump();
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
    if (ch.ahead) { AHEAD = ch.ahead.newValue ?? 2; pump(); }
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
