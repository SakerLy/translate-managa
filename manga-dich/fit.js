// Fits each translation box to the real speech bubble under it, using the page's own pixels.
// Works for any bubble shape (round, square, cloud, dark/colored): it finds the original letters near
// the model's box, covers all of them, then widens the box over the bubble's empty interior so the
// (longer) Vietnamese text gets room for a readable font.
// Pure function (no DOM) so it runs in the page and in Node tests alike.
//   px: { width, height, data: RGBA Uint8ClampedArray }   bubbles: [{ x, y, w, h, ... }] in % of the image
//   returns the same bubbles with x/y/w/h adjusted plus bg (css colour), fg (text colour) and fit (how)
// eslint-disable-next-line no-unused-vars
function fitBubbles(px, bubbles, anchor = true) {
  const { width: W, height: H, data } = px;
  const at = (x, y) => (y * W + x) * 4;
  const TOL = 60; // max RGB distance still counted as "bubble background"
  const CHAR = Math.max(12, 0.08 * Math.min(W, H)); // bigger than this in either direction = not a letter
  const G = Math.max(4, Math.round(0.012 * Math.min(W, H))); // join distance for letters of the same text
  const P = 2;

  // most common colour inside a box (text strokes are the minority)
  const bgOf = (x0, y0, x1, y1) => {
    const n = new Map();
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = at(x, y), k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      n.set(k, (n.get(k) || 0) + 1);
    }
    let best = 0, cnt = -1;
    for (const [k, c] of n) if (c > cnt) { best = k; cnt = c; }
    return [((best >> 8) & 15) * 16 + 8, ((best >> 4) & 15) * 16 + 8, (best & 15) * 16 + 8];
  };
  const near = (i, c) => Math.abs(data[i] - c[0]) + Math.abs(data[i + 1] - c[1]) + Math.abs(data[i + 2] - c[2]) < TOL;
  const toPx = (b) => [Math.max(0, Math.floor(b.x / 100 * W)), Math.max(0, Math.floor(b.y / 100 * H)),
    Math.min(W, Math.ceil((b.x + b.w) / 100 * W)), Math.min(H, Math.ceil((b.y + b.h) / 100 * H))];

  let boxes = [], centres = [];
  // A letter belongs to the bubble whose box owns its centre (seen in a real run: growth crossed
  // into the neighbouring bubble's text). When two model boxes overlap - both aimed at the same
  // bubble after a merge miss - the NEARER box wins, so the duplicate can't grow on the same ink
  // and stays visibly empty instead of covering the twin's translation. me < 0: no ownership check.
  const othersOwn = (me, cx, cy) => me >= 0 && boxes.some((o, j) => j !== me && cx >= o[0] && cx < o[2] && cy >= o[1] && cy < o[3]
    && (Math.hypot(cx - centres[j][0], cy - centres[j][1]) <= Math.hypot(cx - centres[me][0], cy - centres[me][1])));

  // Ink blobs (connected non-background pixels) in a window. Letters are small blobs; bubble outlines,
  // panel borders and artwork are big ones. Bubbles that spill over panel borders are common in manga,
  // so this doesn't need the bubble to be a closed shape.
  const lettersIn = (me, bg, wx0, wy0, wx1, wy1, maxSize = CHAR) => {
    const ww = wx1 - wx0, wh = wy1 - wy0;
    const label = new Int32Array(ww * wh); // 0 = background / unvisited
    const blobs = [];
    for (let sy = wy0; sy < wy1; sy++) for (let sx = wx0; sx < wx1; sx++) {
      const s0 = (sy - wy0) * ww + (sx - wx0);
      if (label[s0] || near(at(sx, sy), bg)) continue;
      const id = blobs.length + 1, bl = { x0: sx, y0: sy, x1: sx, y1: sy, edge: false };
      label[s0] = id;
      const stack = [sx, sy];
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        if (x < bl.x0) bl.x0 = x; if (x > bl.x1) bl.x1 = x; if (y < bl.y0) bl.y0 = y; if (y > bl.y1) bl.y1 = y;
        if (x === wx0 || y === wy0 || x === wx1 - 1 || y === wy1 - 1) bl.edge = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < wx0 || ny < wy0 || nx >= wx1 || ny >= wy1) continue;
          const s = (ny - wy0) * ww + (nx - wx0);
          if (!label[s] && !near(at(nx, ny), bg)) { label[s] = id; stack.push(nx, ny); }
        }
      }
      blobs.push(bl);
    }
    return blobs.filter((bl) => !bl.edge && bl.x1 - bl.x0 < maxSize && bl.y1 - bl.y0 < maxSize
      && !othersOwn(me, (bl.x0 + bl.x1) / 2, (bl.y0 + bl.y1) / 2));
  };

  // Evidence that a box sits on text = letters of the verified text blocks it covers (textBlocks: one-size
  // dark lettering on paper). Raw ink blobs were fooled both ways on real pages: falling leaves on a night
  // scene and cover-art strokes counted as "letters" (a scanlation credits page got 15/23 boxes flung to
  // their mirror spots), while white-on-dark labels counted as none.
  const blocks = textBlocks(px);
  const evidence = (b) => blocks.reduce((n, t) => {
    const x = Math.max(0, Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x));
    const y = Math.max(0, Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y));
    return n + (x * y >= 0.4 * t.w * t.h ? t.n : 0);
  }, 0);
  const overlap = (a, b) => { // share of a's area covered by b (percent boxes)
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return a.w * a.h ? (x * y) / (a.w * a.h) : 0;
  };

  // Axis-swap repair. The prompt asks for [ymin, xmin, ymax, xmax] but GPT/Claude-family models behind
  // gateways often answer [xmin, ymin, xmax, ymax] for some or all boxes (real report: Spanish page,
  // translations sat at the mirror spot of their bubbles across the page diagonal). Pixels decide: when
  // most boxes find letters only once x and y are swapped, swap them all; otherwise swap a single box
  // only when it sits on no text, its swapped twin clearly does, and no other box already covers it.
  const swapped = (b) => ({ ...b, x: b.y, y: b.x, w: b.h, h: b.w });
  const ev = bubbles.map((b) => [evidence(b), evidence(swapped(b))]);
  const votes = ev.reduce((v, [o, s]) => v + (s >= 6 && s > 2 * o + 2 ? 1 : o >= 6 && o >= s ? -1 : 0), 0);
  const swapAll = votes > 0 && votes >= 0.3 * bubbles.length;
  bubbles = bubbles.map((b, i) => {
    const [o, s] = ev[i];
    if (swapAll) return s >= o ? { ...swapped(b), swap: true } : b;
    const sb = swapped(b);
    // a lone swap needs strong evidence: a few stray "letters" on the far side moved good boxes across the
    // page on a real Spanish page ("Chị ơi…" flung from bottom-left to the middle)
    return o === 0 && s >= 8 && !bubbles.some((x, j) => j !== i && overlap(sb, x) > 0.5) ? { ...sb, swap: true } : b;
  });
  boxes = bubbles.map(toPx);
  centres = boxes.map(([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2]);

  // grow a set of letter blobs from a seed box (within G px), repeat so whole lines join
  const grow = (letters, x0, y0, x1, y1) => {
    for (let pass = 0, grew = true; grew && pass < 6; pass++) {
      grew = false;
      for (const bl of letters) {
        if (bl.used || bl.x1 < x0 - G || bl.x0 > x1 + G || bl.y1 < y0 - G || bl.y0 > y1 + G) continue;
        bl.used = true; grew = true;
        x0 = Math.min(x0, bl.x0); y0 = Math.min(y0, bl.y0); x1 = Math.max(x1, bl.x1 + 1); y1 = Math.max(y1, bl.y1 + 1);
      }
    }
    return [Math.max(0, x0 - P), Math.max(0, y0 - P), Math.min(W, x1 + P), Math.min(H, y1 + P)];
  };

  const fitted = bubbles.map((b, me) => {
    const [bx0, by0, bx1, by1] = boxes[me];
    if (bx1 - bx0 < 4 || by1 - by0 < 4) return { b };
    const bg = bgOf(bx0, by0, bx1, by1);
    const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
    const style = { bg: `rgb(${bg[0]},${bg[1]},${bg[2]})`, fg: lum < 110 ? '#fff' : '#111' };

    // A box over 8% of the page is already a model mistake (largest real bubble on the test page: 3.4%):
    // growing it would follow hair/screentone into the art. Try to shrink it to the text cluster inside
    // instead - the model aims its centre at the text even when the box is way too big - and keep the
    // model's box only if no plausible cluster is found.
    const shrink = () => {
      // at least one letter-height of margin: a thin box (live run: 2% tall, just under a big
      // italic "...NO.") must still see letters that start above it, not cut them at the window edge
      const mx = Math.round(Math.max((bx1 - bx0) * 0.8, CHAR)), my = Math.round(Math.max((by1 - by0) * 0.8, CHAR));
      const wx0 = Math.max(0, bx0 - mx), wy0 = Math.max(0, by0 - my), wx1 = Math.min(W, bx1 + mx), wy1 = Math.min(H, by1 + my);
      const letters = lettersIn(me, bg, wx0, wy0, wx1, wy1);
      if (letters.length < 3) return null;
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      let seed = null, best = Infinity;
      for (const bl of letters) {
        const d = Math.hypot((bl.x0 + bl.x1) / 2 - cx, (bl.y0 + bl.y1) / 2 - cy);
        if (d < best) { best = d; seed = bl; }
      }
      seed.used = true;
      const r = grow(letters, seed.x0, seed.y0, seed.x1 + 1, seed.y1 + 1);
      r.letters = letters.filter((bl) => bl.used);
      if ((r[2] - r[0]) * (r[3] - r[1]) > 0.08 * W * H || letters.filter((bl) => bl.used).length < 3) return null;
      return r;
    };
    // lh: the source lettering's height (median letter, % of page height) - the translation's font is sized
    // from it, so a short line in a roomy bubble isn't blown up and a long one isn't shrunk to dust
    const kept = (r, how, used = r.letters) => {
      const hs = (used || []).map((bl) => bl.y1 - bl.y0 + 1).sort((a, z) => a - z);
      // a "text" of 1-3px tall blobs is dust/screentone (live MangaDex run: shrink locked onto it, lh=0.1%,
      // and the bubble's translation vanished into a 3%-wide box): give the model's box back instead
      if (!hs.length || hs[hs.length >> 1] < Math.max(4, 0.006 * H)) return { b: { ...b, ...style, fit: 'kept' } };
      // mixed: "letters" of every size = artwork strokes, not lettering (used to re-home the box)
      const mixed = hs.length >= 4 && hs[(hs.length * 0.75) | 0] > 2.5 * hs[(hs.length * 0.25) | 0] + 2;
      return { b, style, bg, px: r, fit: how, lh: hs.length ? hs[hs.length >> 1] / H * 100 : 0, mixed };
    };
    if ((bx1 - bx0) * (by1 - by0) > 0.08 * W * H) { const r = shrink(); return r ? kept(r, 'shrink') : { b: { ...b, ...style, fit: 'kept' } }; }

    const mx = Math.round((bx1 - bx0) * 0.8), my = Math.round((by1 - by0) * 0.8);
    const wx0 = Math.max(0, bx0 - mx), wy0 = Math.max(0, by0 - my), wx1 = Math.min(W, bx1 + mx), wy1 = Math.min(H, by1 + my);
    // display-size lettering (a shouted "MA·KA·NYA…" is 2-3x a normal letter) must be covered too
    const letters = lettersIn(me, bg, wx0, wy0, wx1, wy1, CHAR * 2.5);
    const touching = letters.filter((bl) => bl.x1 >= bx0 && bl.x0 <= bx1 && bl.y1 >= by0 && bl.y0 <= by1);
    if (touching.length < 2) {
      // no text under the model's box: it missed the bubble; the nearest text cluster may still be it
      const r = shrink();
      return r ? kept(r, 'shrink') : { b: { ...b, ...style, fit: 'kept' } };
    }
    // Seed from the letters themselves, not the model's box: a box drawn wider than its bubble (real
    // report: white block spilling over the sky around an oval bubble) must shrink to the text, and the
    // interior pass below then widens it only as far as the bubble really goes.
    for (const bl of touching) bl.used = true;
    const r = grow(letters, Math.min(...touching.map((bl) => bl.x0)), Math.min(...touching.map((bl) => bl.y0)),
      Math.max(...touching.map((bl) => bl.x1 + 1)), Math.max(...touching.map((bl) => bl.y1 + 1)));
    // runaway guard: a fit more than 2x the model's box means we followed artwork, not letters
    if ((r[2] - r[0]) * (r[3] - r[1]) > 2 * (bx1 - bx0) * (by1 - by0)) { const s = shrink(); return s ? kept(s, 'shrink') : { b: { ...b, ...style, fit: 'kept' } }; }
    return kept(r, 'letters', letters.filter((bl) => bl.used));
  });

  // Widen each text box over the bubble's empty interior: step every side outward while the next
  // row/column is almost all bubble background, never into another box, never past ~1.5x the text block.
  // Gives the translation the bubble's real room instead of the source text's tight footprint (a narrow
  // Spanish/English column otherwise forces 8px Vietnamese broken mid-word).
  const rects = fitted.map((f) => f.px);
  const clear = (k, x0, y0, x1, y1) => rects.every((o, j) => j === k || !o || x1 <= o[0] || x0 >= o[2] || y1 <= o[1] || y0 >= o[3]);
  const lineBg = (bg, x0, y0, x1, y1) => { // share of background pixels on a 1px line
    let n = 0, ok = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (near(at(x, y), bg)) ok++; }
    return n ? ok / n : 0;
  };
  const out = fitted.map((f, k) => {
    if (!f.px) return f.b;
    let [x0, y0, x1, y1] = f.px;
    const maxW = Math.min(W, Math.max(1.5 * (x1 - x0), x1 - x0 + 0.04 * W)), maxH = Math.min(H, Math.max(1.35 * (y1 - y0), y1 - y0 + 0.03 * H)); // open bubbles merge into white art: stay modest
    const live = [true, true, true, true]; // top, right, bottom, left
    for (let guard = 0; live.some(Boolean) && guard < 400; guard++) {
      if (live[0]) live[0] = y0 > 0 && y1 - y0 < maxH && lineBg(f.bg, x0, y0 - 1, x1, y0) >= 0.96 && clear(k, x0, y0 - 1, x1, y1) && !!y0--;
      if (live[2]) live[2] = y1 < H && y1 - y0 < maxH && lineBg(f.bg, x0, y1, x1, y1 + 1) >= 0.96 && clear(k, x0, y0, x1, y1 + 1) && !!++y1;
      if (live[3]) live[3] = x0 > 0 && x1 - x0 < maxW && lineBg(f.bg, x0 - 1, y0, x0, y1) >= 0.96 && clear(k, x0 - 1, y0, x1, y1) && !!x0--;
      if (live[1]) live[1] = x1 < W && x1 - x0 < maxW && lineBg(f.bg, x1, y0, x1 + 1, y1) >= 0.96 && clear(k, x0, y0, x1 + 1, y1) && !!++x1;
    }
    rects[k] = [x0, y0, x1, y1];
    return { ...f.b, ...f.style, fit: f.fit, ...(f.lh && { lh: f.lh }), ...(f.mixed && { mixed: true, orig: [f.b.x, f.b.y, f.b.w, f.b.h] }), x: x0 / W * 100, y: y0 / H * 100, w: (x1 - x0) / W * 100, h: (y1 - y0) / H * 100 };
  });
  return anchor ? anchorToText(px, out) : out;
}

// Boxes that found no letters ('kept') sit on artwork: the model aimed wrong. Re-home each to the nearest
// text block (textBlocks) that no good box covers yet, then fit it there. A blind box still unmatched is
// dropped when it's big (a real run: one box over half the page hid 6 bubbles AND made the missed-text
// pass think they were covered); small ones stay, they're often on textured or coloured bubbles.
function anchorToText(px, out) {
  const inter = (t, b) => {
    const x = Math.max(0, Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x));
    const y = Math.max(0, Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y));
    return x * y;
  };
  const covers = (t, b) => inter(t, b) >= 0.3 * t.w * t.h;
  const blocks = textBlocks(px);
  // A box that covers only part of a text block (real report: "TRANQUI-" hidden, "LOS..." still showing
  // below it) grows to the whole block - the block is the page's own lettering, owned by the box that
  // overlaps it most. Capped so a block glued to artwork can't balloon the box.
  let good = out.filter((b) => b.fit !== 'kept');
  for (const t of blocks) {
    let best = -1, most = 0;
    good.forEach((b, i) => { const a = inter(t, b); if (a > most) { most = a; best = i; } });
    if (best < 0 || most < 0.2 * t.w * t.h || most >= 0.95 * t.w * t.h) continue;
    const b = good[best];
    const x0 = Math.min(b.x, t.x), y0 = Math.min(b.y, t.y), x1 = Math.max(b.x + b.w, t.x + t.w), y1 = Math.max(b.y + b.h, t.y + t.h);
    // a block is already-verified lettering (one size, ≤ 8% of the page), so the cap is on the page, not on
    // the box: a seed that caught only a bubble's first paragraph (live run) must still cover the second
    if ((x1 - x0) * (y1 - y0) <= 600) good[best] = { ...b, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // A box that matched "letters" but sits on no text block at all followed artwork lines (real run: a
  // speech bubble's translation drawn tiny over a character's chest); if some text block is still free,
  // treat it as blind so it can move there.
  const onText = (b) => blocks.some((t) => inter(t, b) > 0);
  // mixed AND on text: the model's box spans the panel and the "letters" include art strokes (live run: a
  // translation box 40% of the page wide over a face). The detected block IS the lettering: snap to it.
  good = good.map((b) => {
    if (!b.mixed || !onText(b)) return b;
    const hit = blocks.filter((t) => inter(t, b) > 0.3 * t.w * t.h);
    if (!hit.length) return b;
    const x0 = Math.min(...hit.map((t) => t.x)), y0 = Math.min(...hit.map((t) => t.y));
    const x1 = Math.max(...hit.map((t) => t.x + t.w)), y1 = Math.max(...hit.map((t) => t.y + t.h));
    const { mixed, ...rest } = b;
    return { ...rest, x: x0 - 0.6, y: y0 - 0.4, w: x1 - x0 + 1.2, h: y1 - y0 + 0.8, fit: 'block' };
  });
  const stray = (b) => b.mixed && !onText(b);
  const kept = out.filter((b) => b.fit === 'kept').concat(good.filter(stray));
  good = good.filter((b) => !stray(b));
  if (!kept.length) return good;
  const free = blocks.filter((t) => !good.some((b) => covers(t, b)));
  const c = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  const pairs = [];
  kept.forEach((b, i) => free.forEach((t, j) => {
    const [ax, ay] = c(b), [bx, by] = c(t);
    const d = Math.hypot(ax - bx, ay - by);
    // near, and about the size of the box: a box re-homed onto a tiny far block shrank to an unreadable 4%
    // square on a real page; a translation that size can't be the right bubble's anyway
    const ratio = (t.w * t.h) / Math.max(0.01, b.w * b.h);
    if (t.n >= 6 && ratio > 0.2 && ratio < 5 && (d < 18 || covers(t, b))) pairs.push({ i, j, d: covers(t, b) ? d / 4 : d }); // a block under the box wins
  }));
  pairs.sort((a, b) => a.d - b.d);
  const usedK = new Set(), usedF = new Set(), moved = [];
  for (const { i, j } of pairs) {
    if (usedK.has(i) || usedF.has(j)) continue;
    usedK.add(i); usedF.add(j);
    const t = free[j];
    moved.push({ ...kept[i], x: t.x, y: t.y, w: t.w, h: t.h, anchored: true });
  }
  const refit = moved.length ? fitBubbles(px, moved, false) : [];
  // An unmatched box whose "letters" were art goes back to the model's own box: the shrink locked onto
  // part of a huge stylised word (live run: "...DIE?" half covered, "IE?" still showing)
  const rest = kept.filter((b, i) => !usedK.has(i) && (b.fit !== 'kept' || b.w * b.h <= 300)) // blind and ≤ 3% of the page, or fitted on something
    .map((b) => { // union: the model's box has the word's extent, the letters found its real vertical spot
      if (!b.orig) return b;
      const [ox, oy, ow, oh] = b.orig, x0 = Math.min(ox, b.x), y0 = Math.min(oy, b.y);
      return { ...b, x: x0, y: y0, w: Math.max(ox + ow, b.x + b.w) - x0, h: Math.max(oy + oh, b.y + b.h) - y0, fit: 'model' };
    });
  return good.concat(refit, rest);
}

// Page-wide text finder, independent of the model: clusters of dark letter-sized blobs sitting on a
// light background (speech bubbles, captions). Used to catch bubbles the model never returned (real
// report: a whole "BUENO, AHORA HAY..." bubble left untranslated) - each block no box covers gets a
// second, cropped call. Works on a grid of ~1100 cells along the long side.
//   returns [{ x, y, w, h, n }] in % of the image (n = letters found)
// eslint-disable-next-line no-unused-vars
function textBlocks(px) {
  const { width: W, height: H, data } = px;
  const s = Math.max(1, Math.round(Math.max(W, H) / 1100));
  const gw = Math.floor(W / s), gh = Math.floor(H / s);
  const lum = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = ((y * s) * W + x * s) * 4;
    lum[y * gw + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const DARK = 110, LIGHT = 200;
  const CH = Math.max(6, 0.045 * Math.min(gw, gh)); // tallest letter, in cells
  const label = new Int32Array(gw * gh), stack = [];
  const letters = [];
  for (let sy = 0; sy < gh; sy++) for (let sx = 0; sx < gw; sx++) {
    const s0 = sy * gw + sx;
    if (label[s0] || lum[s0] >= DARK) continue;
    const id = letters.length + 2; // label 1 is unused: ids start at 2
    let x0 = sx, y0 = sy, x1 = sx, y1 = sy, n = 0, big = false;
    label[s0] = id; stack.push(s0);
    while (stack.length) {
      const p = stack.pop(), x = p % gw, y = (p / gw) | 0;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x1 - x0 > CH * 1.6 || y1 - y0 > CH) big = true; // keep flooding to label it, but it's art
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const q = ny * gw + nx;
        if (!label[q] && lum[q] < DARK) { label[q] = id; stack.push(q); }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    letters.push(big || bh < 3 || n < 4 || n / (bw * bh) > 0.9 ? null : { x0, y0, x1, y1, id });
  }
  // a letter sits on paper: most cells around it (not part of it) are light
  const lit = letters.filter(Boolean).filter((l) => {
    let a = 0, b = 0;
    for (let y = Math.max(0, l.y0 - 2); y <= Math.min(gh - 1, l.y1 + 2); y++) for (let x = Math.max(0, l.x0 - 2); x <= Math.min(gw - 1, l.x1 + 2); x++) {
      const q = y * gw + x;
      if (label[q] === l.id) continue;
      a++; if (lum[q] > LIGHT) b++;
    }
    return a && b / a >= 0.6;
  }).slice(0, 4000);
  // cluster letters closer than J cells (one line's letters, a bubble's lines)
  const J = Math.max(3, Math.round(0.012 * Math.max(gw, gh)));
  const parent = lit.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const order = lit.map((_, i) => i).sort((a, b) => lit[a].x0 - lit[b].x0);
  for (let a = 0; a < order.length; a++) {
    const A = lit[order[a]];
    for (let b = a + 1; b < order.length; b++) {
      const B = lit[order[b]];
      if (B.x0 > A.x1 + J) break;
      if (B.y0 <= A.y1 + J && A.y0 <= B.y1 + J) parent[find(order[a])] = find(order[b]);
    }
  }
  const groups = new Map();
  lit.forEach((l, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(l); });
  const out = [];
  for (const g of groups.values()) {
    // short exclamations ("...NO.", "EH!?", "HẢ?") have 3-5 letters: accept them when the letters are big,
    // which tone dots and grass never are (live run: "...NO." was never detected)
    const med = g.map((l) => l.y1 - l.y0 + 1).sort((a, z) => a - z)[g.length >> 1];
    if (g.length < 3 || (g.length < 6 && med < 0.012 * Math.max(gw, gh))) continue;
    const x0 = Math.min(...g.map((l) => l.x0)), y0 = Math.min(...g.map((l) => l.y0));
    const x1 = Math.max(...g.map((l) => l.x1)) + 1, y1 = Math.max(...g.map((l) => l.y1)) + 1;
    const bw = x1 - x0, bh = y1 - y0;
    if (bw > 0.5 * gw || bh > 0.5 * gh || bw * bh > 0.08 * gw * gh) continue; // a whole panel of hatching, not text
    // real lettering is a few similar heights; scattered grass/hatching is not
    const hs = g.map((l) => l.y1 - l.y0 + 1).sort((a, b) => a - b);
    if (hs[(hs.length * 0.8) | 0] > 2.5 * hs[(hs.length * 0.2) | 0] + 2) continue;
    out.push({ x: x0 / gw * 100, y: y0 / gh * 100, w: bw / gw * 100, h: bh / gh * 100, n: g.length });
  }
  return out;
}
