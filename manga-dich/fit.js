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
  const SPECK = Math.max(5, Math.round((0.0035 * Math.min(W, H)) ** 2)); // fewest pixels a letter stroke has

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
  // A letter inside another box but outside mine is theirs, however far their centre is (live Sangeki
  // run: a tall neighbour's first line sat nearer to MY centre, so my box swallowed it and doubled).
  // The centre distance only settles letters inside both boxes.
  const inBox = (o, cx, cy) => cx >= o[0] && cx < o[2] && cy >= o[1] && cy < o[3];
  const othersOwn = (me, cx, cy) => me >= 0 && boxes.some((o, j) => j !== me && inBox(o, cx, cy)
    && (!inBox(boxes[me], cx, cy) || Math.hypot(cx - centres[j][0], cy - centres[j][1]) <= Math.hypot(cx - centres[me][0], cy - centres[me][1])));

  // Ink blobs (connected non-background pixels) in a window. Letters are small blobs; bubble outlines,
  // panel borders and artwork are big ones. Bubbles that spill over panel borders are common in manga,
  // so this doesn't need the bubble to be a closed shape.
  // Speed (live report: the page stuttered while translating): "is this pixel ink" was asked ~9 times per
  // pixel per window (scan + 8 neighbours) and windows of neighbouring boxes overlap - 4.6 of 7 seconds on 10
  // pages. One answer per pixel and background colour, cached for the whole page.
  const inkMaps = new Map();
  const inkMap = (bg) => {
    const k = bg.join(',');
    let m = inkMaps.get(k);
    if (!m) inkMaps.set(k, (m = new Uint8Array(W * H))); // 0 unknown, 1 background, 2 ink
    return m;
  };
  const lettersIn = (me, bg, wx0, wy0, wx1, wy1, maxSize = CHAR) => {
    const ww = wx1 - wx0, wh = wy1 - wy0;
    const label = new Int32Array(ww * wh); // 0 = background / unvisited
    const blobs = [];
    const map = inkMap(bg), [br, bgr, bb] = bg;
    // fill this window's unknown pixels in one tight loop (per-pixel function calls were the cost)
    for (let y = wy0; y < wy1; y++) for (let p = y * W + wx0, i = p * 4, e = y * W + wx1; p < e; p++, i += 4) {
      if (!map[p]) map[p] = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bgr) + Math.abs(data[i + 2] - bb) < TOL ? 1 : 2;
    }
    const isInk = (x, y) => map[y * W + x] === 2;
    for (let sy = wy0; sy < wy1; sy++) for (let sx = wx0; sx < wx1; sx++) {
      const s0 = (sy - wy0) * ww + (sx - wx0);
      if (label[s0] || !isInk(sx, sy)) continue;
      const id = blobs.length + 1, bl = { x0: sx, y0: sy, x1: sx, y1: sy, edge: false, n: 0 };
      label[s0] = id;
      const stack = [sx, sy];
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        bl.n++;
        if (x < bl.x0) bl.x0 = x; if (x > bl.x1) bl.x1 = x; if (y < bl.y0) bl.y0 = y; if (y > bl.y1) bl.y1 = y;
        if (x === wx0 || y === wy0 || x === wx1 - 1 || y === wy1 - 1) bl.edge = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < wx0 || ny < wy0 || nx >= wx1 || ny >= wy1) continue;
          const s = (ny - wy0) * ww + (nx - wx0);
          if (!label[s] && isInk(nx, ny)) { label[s] = id; stack.push(nx, ny); }
        }
      }
      blobs.push(bl);
    }
    // past normal letter size only solid shapes count: a shouted letter is a thick stroke, a piece of the
    // bubble's outline is a thin arc filling little of its box (live run: an outline arc pulled a "!" box
    // across a face)
    const solid = (bl) => (bl.x1 - bl.x0 < CHAR && bl.y1 - bl.y0 < CHAR) || bl.n >= 0.15 * (bl.x1 - bl.x0 + 1) * (bl.y1 - bl.y0 + 1);
    // JPEG specks (a few pixels) are not letters: scattered around the text they let the letter chain jump
    // across the whole region, the box ballooned, tripped the runaway guard and fell back to blind (live
    // benchmark: 6 boxes on one Spanish page, 351 "letters" in one bubble, most of them 1-2px dust)
    return blobs.filter((bl) => bl.n >= SPECK && !bl.edge && bl.x1 - bl.x0 < maxSize && bl.y1 - bl.y0 < maxSize && solid(bl)
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
  // letter-sized ink where the box already is: lettering the block detector can't see (a framed, decorated
  // Japanese title; credits) - never flip such a box across the diagonal (live GPT page: the title's
  // translation drawn as a tall black column over a character, the credits as thin vertical strips)
  const inkHere = (b) => { const r = toPx(b); return r[2] - r[0] < 4 || r[3] - r[1] < 4 ? 0 : lettersIn(-1, bgOf(...r), ...r).length; };
  bubbles = bubbles.map((b, i) => {
    const [o, s] = ev[i];
    if (swapAll) return s >= o && !(s < 6 && inkHere(b) >= 6) ? { ...swapped(b), swap: true } : b;
    const sb = swapped(b);
    // a lone swap needs strong evidence: a few stray "letters" on the far side moved good boxes across the
    // page on a real Spanish page ("Chị ơi…" flung from bottom-left to the middle)
    // ...and only onto text no other box claims: a white-on-black caption (no detectable letters where it
    // really is) was mirrored onto a neighbour bubble's text, its Spanish left showing (live Sangeki run)
    // "no text here" was too strict: GPT-6.1-sol swapped half a page's boxes and one landed on 3 stray letters
    // (34 on its mirror) - "Well, I knew…" stayed on the hair, its bubble untranslated (live 66dcdbac/8)
    return s >= 8 && s > 3 * o + 4 && !bubbles.some((x, j) => j !== i && (overlap(sb, x) > 0.3 || overlap(x, sb) > 0.3)) && inkHere(b) < 6 ? { ...sb, swap: true } : b;
  });
  // No lettering to vote on either side (a bubble the block finder misses), yet this answer already swapped
  // 2+ boxes: the shape decides. Latin text written in lines is never a column 2.5x taller than wide in
  // pixels (live GPT 66dcdbac/8: "RIGHT…?" came as a 1.8%x8.8% strip on a face; swapped, it is its bubble).
  // A strip 4x taller than wide is wrong for one line of Latin text even when nothing else on the page was swapped
  // (with numbered text blocks most lines no longer go through the swap vote, so "RIGHT…?" stayed on its own)
  if (!swapAll) {
    const k = bubbles.filter((b) => b.swap).length >= 2 ? 2.5 : 4;
    bubbles = bubbles.map((b, i) => {
      const [o, s] = ev[i];
      if (b.swap || b.marked || o >= 6 || s >= 6 || /[぀-ヿ㐀-鿿가-힯]/.test(b.src || '') || b.style === 'vertical') return b;
      const tall = b.h / 100 * H > k * (b.w / 100 * W);
      return tall && b.h / 100 * W > b.w / 100 * H ? { ...swapped(b), swap: true } : b;
    });
  }
  // GPT drifts into [x, y] partway through its answer and stays there: the first lines right, the rest swapped
  // (live aa77c143/4 - bubbles then the title logo and credits, which no pixel test can verify). A box the
  // pixels can't judge follows the boxes around it in the answer: the nearest decided one before it swapped,
  // and the nearest after it too (or none left) -> swap it, unless that lands on a box confirmed in place.
  if (!swapAll) {
    const dec = ev.map(([o, s]) => (s >= 6 && s > 2 * o + 2 ? 1 : o >= 6 && o >= s ? -1 : 0));
    bubbles = bubbles.map((b, i) => {
      if (b.swap || dec[i] === -1) return b;
      let p = i - 1, n = i + 1;
      while (p >= 0 && !dec[p]) p--;
      while (n < bubbles.length && !dec[n]) n++;
      if (p < 0 || dec[p] !== 1 || (n < bubbles.length && dec[n] !== 1)) return b;
      const sb = swapped(b);
      if (bubbles.some((x, j) => j !== i && dec[j] === -1 && (overlap(sb, x) > 0.3 || overlap(x, sb) > 0.3))) return b;
      return { ...sb, swap: true };
    });
  }
  // An SFX box on lettering a speech box also covers is misplaced (GPT swapped "ばふっ" into the "Could you…"
  // bubble, whose line was then squeezed tiny - live 822342aa/7): its mirror spot if that is free of speech,
  // else it is not drawn there (unverified -> trimOverlaps drops it).
  const onSpeech = (b, self) => blocks.some((t) => t.n >= 6 && overlap(t, b) >= 0.15
    && bubbles.some((o, j) => j !== self && o.kind !== 'sfx' && overlap(t, o) >= 0.4));
  bubbles = bubbles.map((b, i) => {
    if (b.kind !== 'sfx' || !onSpeech(b, i)) return b;
    const sb = swapped(b);
    return !b.swap && !onSpeech(sb, i) ? { ...sb, swap: true } : { ...b, misplaced: true };
  });
  bubbles = splitMerged(bubbles);
  boxes = bubbles.map(toPx);
  centres = boxes.map(([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2]);

  // One item covering two or three touching bubbles (live reports: "Hừm... À, chú có mì ramen. Hay dùng
  // gói bột nêm này?" laid across three bubbles' outlines, the next two bubbles merged the same way) -
  // the model ignores "one bubble, one item" now and then. When the box holds 2+ separate text blocks with
  // a bubble outline (dark pixels) between them, and the text has at least as many sentences, give each
  // block its share of sentences in manga reading order (higher first, then right to left).
  function splitMerged(list) {
    const lumAt = (x, y) => { const i = at(Math.min(W - 1, Math.max(0, x | 0)), Math.min(H - 1, Math.max(0, y | 0))); return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
    const outlineBetween = (a, b) => { // a dark pixel on the segment between the two blocks, outside both
      const ax = (a.x + a.w / 2) / 100 * W, ay = (a.y + a.h / 2) / 100 * H, bx = (b.x + b.w / 2) / 100 * W, by = (b.y + b.h / 2) / 100 * H;
      const n = Math.ceil(Math.hypot(bx - ax, by - ay));
      const inside = (t, x, y) => x >= t.x / 100 * W - 2 && x <= (t.x + t.w) / 100 * W + 2 && y >= t.y / 100 * H - 2 && y <= (t.y + t.h) / 100 * H + 2;
      for (let k = 1; k < n; k++) {
        const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n;
        if (!inside(a, x, y) && !inside(b, x, y) && lumAt(x, y) < 90) return true;
      }
      return false;
    };
    return list.flatMap((b, i) => {
      if (b.kind === 'art' || b.sfx) return [b];
      const mine = blocks.filter((t) => !t.faded && overlap(t, b) >= 0.7
        && !list.some((o, j) => j !== i && overlap(t, o) >= 0.5)); // a block another item covers is that item's
      // Letters of two touching bubbles often cluster into ONE block (live report: "I CAN'T BELIEVE…" and
      // "NOT THAT I MIND…" - their lines nearly meet across the shared outline): then the bubbles themselves
      // decide - closed paper areas around the box that hold lettering.
      const byStacks = () => { // captions are one block of text: never split this way
        const st = !b.kind || b.kind === 'bubble' ? textBubbles(b) : [];
        return st.length >= 2 ? splitInto(b, st) : [b];
      };
      if (mine.length < 2) return byStacks();
      if (mine.length > 12) return [b];
      // blocks with no outline between them are lines/paragraphs of the same bubble: one group
      const root = mine.map((_, k) => k), find = (k) => (root[k] === k ? k : (root[k] = find(root[k])));
      for (let u = 0; u < mine.length; u++) for (let v = u + 1; v < mine.length; v++) if (!outlineBetween(mine[u], mine[v])) root[find(u)] = find(v);
      const groups = new Map();
      mine.forEach((t, k) => { const r = find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); });
      if (groups.size < 2) return byStacks(); // no outline between them: maybe two lobes of one bubble
      if (groups.size > 4) return [b];
      const order = [...groups.values()].map((g) => {
        const x0 = Math.min(...g.map((t) => t.x)), y0 = Math.min(...g.map((t) => t.y));
        return { x: x0, y: y0, w: Math.max(...g.map((t) => t.x + t.w)) - x0, h: Math.max(...g.map((t) => t.y + t.h)) - y0, n: g.reduce((n, t) => n + t.n, 0) };
      });
      return splitInto(b, order);
    });
  }

  // b's sentences shared out over the given areas (each { x, y, w, h, n letters }) in manga reading order
  function splitInto(b, areas) {
    {
      const order = areas.slice().sort((p, q) => (p.y + p.h <= q.y ? -1 : q.y + q.h <= p.y ? 1 : (q.x + q.w / 2) - (p.x + p.w / 2)));
      const sentences = (t) => String(t || '').match(/[^.!?…]+(?:[.!?…]+["”»)]*|$)\s*/g)?.map((x) => x.trim()).filter(Boolean) || [];
      const parts = sentences(b.text);
      if (parts.length < order.length) return [b];
      // contiguous sentences per block, matching each block's share of the letters
      const total = order.reduce((n, t) => n + t.n, 0), chars = parts.map((x) => x.length), all = chars.reduce((n, c) => n + c, 0);
      const out = [];
      let p = 0, seen = 0, want = 0;
      order.forEach((t, k) => {
        want += t.n / total;
        const take = [];
        const left = order.length - k - 1;
        while (p < parts.length - left && (!take.length || (seen + chars[p] / 2) / all < want || k === order.length - 1)) { take.push(parts[p]); seen += chars[p]; p++; }
        out.push({ ...b, x: t.x, y: t.y, w: t.w, h: t.h, text: take.join(' '), ...(k && { src: '' }), split: true });
      });
      return out;
    }
  }

  // Separate stacks of text lines inside one box: two bubbles - or two lobes of one cloud bubble - each carry
  // their own stack of centred lines, and the second stack starts beside the first rather than under it (live
  // report: "…YOUR PLACE…" over "NOT THAT I MIND AT ALL." in a two-lobed bubble, one merged translation box
  // spilling over the art). A line continues a stack when it sits right below and shares most of its width.
  // Returns the extent and letter count of every stack holding 4+ letters.
  function textBubbles(b) {
    const x0 = Math.max(0, Math.floor((b.x - b.w * 0.1) / 100 * W)), y0 = Math.max(0, Math.floor((b.y - b.h * 0.1) / 100 * H));
    const x1 = Math.min(W, Math.ceil((b.x + b.w * 1.1) / 100 * W)), y1 = Math.min(H, Math.ceil((b.y + b.h * 1.1) / 100 * H));
    const w = x1 - x0, h = y1 - y0;
    if (w < 20 || h < 20 || w * h > 0.45 * W * H) return [];
    const dark = (x, y) => { const i = at(x0 + x, y0 + y); return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 110; };
    const lab = new Int32Array(w * h), st = [], L = [];
    for (let s0 = 0; s0 < w * h; s0++) {
      if (lab[s0] || !dark(s0 % w, (s0 / w) | 0)) continue;
      const id = L.length + 1;
      let n = 0, ax0 = w, ay0 = h, ax1 = 0, ay1 = 0;
      lab[s0] = id; st.push(s0);
      while (st.length) {
        const p = st.pop(), x = p % w, y = (p / w) | 0;
        n++;
        if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (y < ay0) ay0 = y; if (y > ay1) ay1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, q = ny * w + nx;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !lab[q] && dark(nx, ny)) { lab[q] = id; st.push(q); }
        }
      }
      L.push({ id, n, x0: ax0, y0: ay0, x1: ax1, y1: ay1 });
    }
    const hs = L.filter((l) => l.n >= 6).map((l) => l.y1 - l.y0 + 1).sort((a, z) => a - z);
    if (hs.length < 8) return [];
    const lh = hs[hs.length >> 1]; // a letter's height
    const letters = L.filter((l) => l.n >= 6 && l.y1 - l.y0 + 1 <= 2.5 * lh && l.x1 - l.x0 + 1 <= 3 * lh && l.y1 - l.y0 + 1 >= 0.4 * lh);
    if (letters.length < 8) return [];
    // letters -> lines (overlapping vertically, close horizontally)
    letters.sort((a, z) => a.x0 - z.x0);
    const lines = [];
    for (const l of letters) {
      const ln = lines.find((q) => Math.min(q.y1, l.y1) - Math.max(q.y0, l.y0) >= 0.5 * Math.min(q.y1 - q.y0, l.y1 - l.y0) + 0.5 && l.x0 - q.x1 <= 1.5 * lh);
      if (ln) { ln.x1 = Math.max(ln.x1, l.x1); ln.y0 = Math.min(ln.y0, l.y0); ln.y1 = Math.max(ln.y1, l.y1); ln.n++; }
      else lines.push({ x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1, n: 1 });
    }
    // lines -> stacks: the next line continues the stack when it sits right below and shares most of its width
    lines.sort((a, z) => a.y0 - z.y0);
    const groups = [];
    for (const ln of lines) {
      const g = groups.find((q) => {
        const last = q[q.length - 1];
        const gap = ln.y0 - last.y1, share = Math.min(ln.x1, last.x1) - Math.max(ln.x0, last.x0);
        return gap >= -0.5 * lh && gap <= 1.5 * lh && share >= 0.4 * Math.min(ln.x1 - ln.x0, last.x1 - last.x0);
      });
      if (g) g.push(ln); else groups.push([ln]);
    }
    const total = letters.length;
    // a stack is 2+ lines: a single line broken by a wide gap (a caption, a strip of text) is not two bubbles
    const stacks = groups.map((g) => ({ g, n: g.reduce((k, ln) => k + ln.n, 0) })).filter(({ n }) => n >= 4 && n >= 0.15 * total);
    if (stacks.some(({ g }) => g.length < 2)) return [];
    return stacks.map(({ g, n }) => {
      const gx0 = Math.min(...g.map((l) => l.x0)), gy0 = Math.min(...g.map((l) => l.y0)), gx1 = Math.max(...g.map((l) => l.x1)), gy1 = Math.max(...g.map((l) => l.y1));
      return { x: (x0 + gx0) / W * 100, y: (y0 + gy0) / H * 100, w: (gx1 - gx0 + 1) / W * 100, h: (gy1 - gy0 + 1) / H * 100, n };
    });
  }

  // grow a set of letter blobs from a seed box (within G px), repeat so whole lines join
  const grow = (letters, x0, y0, x1, y1, g = G) => {
    for (let pass = 0, grew = true; grew && pass < 6; pass++) {
      grew = false;
      for (const bl of letters) {
        if (bl.used || bl.x1 < x0 - g || bl.x0 > x1 + g || bl.y1 < y0 - g || bl.y0 > y1 + g) continue;
        bl.used = true; grew = true;
        x0 = Math.min(x0, bl.x0); y0 = Math.min(y0, bl.y0); x1 = Math.max(x1, bl.x1 + 1); y1 = Math.max(y1, bl.y1 + 1);
      }
    }
    return [Math.max(0, x0 - P), Math.max(0, y0 - P), Math.min(W, x1 + P), Math.min(H, y1 + P)];
  };

  // Two boxes on one block of lettering, one of them clearly aimed elsewhere: GPT put "People outside might
  // get the wrong idea…" (a caption on hatching, which the block finder can't see) over the "I CAN'T BELIEVE…"
  // bubble that its own box already covered - the caption's translation replaced the bubble's (live
  // 66dcdbac/8). The box that fits the block best keeps it; a rival whose only lettering is that block and that
  // fits it far worse is treated as unverified, so it never paints over its neighbour (trimOverlaps drops it,
  // the missed-text pass reads what is really there).
  const stolen = new Set();
  const iou = (t, b) => {
    const x = Math.max(0, Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x)), y = Math.max(0, Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y));
    return x * y / (t.w * t.h + b.w * b.h - x * y);
  };
  for (const t of blocks) {
    if (t.n < 6 || t.faded) continue;
    const on = bubbles.map((b, i) => [i, iou(t, b)]).filter(([i]) => overlap(t, bubbles[i]) >= 0.4);
    if (on.length < 2) continue;
    const best = Math.max(...on.map(([, v]) => v)), bi = on.find(([, v]) => v === best)[0];
    // the rival's own lettering: blocks it covers that the best box doesn't (a sub-block of the same text
    // inside the bubble is not its own)
    const own = (i) => blocks.some((u) => u.n >= 6 && overlap(u, bubbles[i]) >= 0.4 && overlap(u, bubbles[bi]) < 0.4);
    for (const [i, v] of on) if (i !== bi && v < 0.5 * best && !own(i)) stolen.add(i);
  }
  const fitted = bubbles.map((b, me) => {
    const [bx0, by0, bx1, by1] = boxes[me];
    if (bx1 - bx0 < 4 || by1 - by0 < 4) return { b };
    const bg = bgOf(bx0, by0, bx1, by1);
    const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
    const style = { bg: `rgb(${bg[0]},${bg[1]},${bg[2]})`, fg: lum < 110 ? '#fff' : '#111' };
    if (stolen.has(me) || b.misplaced) return { b: { ...b, ...style, fit: 'kept' } };

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
      // Letter-sized decoration next to the text (a pattern of hearts on screentone, hair strands) chained the
      // growth far past the lettering (live report: a bubble's box twice its text, over the hearts and a head -
      // unerasable, so an opaque block covered the art). The page's own text blocks know where the lettering
      // is: a fit much bigger than the text blocks inside it is cut back to them. Every path (letters, shrink)
      // goes through here: a recovered line's shrink grew over the hearts to 25% wide (live 66dcdbac/8).
      // n >= 6: a 3-letter speck (a heart at the far edge) stretched the lettering's extent until a box 2.6x
      // its text no longer looked oversized. Captions are left alone: their tight lettering is often only
      // partly detected.
      // a block counts when at least half of it lies in the fit: the bubble's main lettering block reaching a
      // little past the fit was ignored and the box was cut down to one small word beside it (live 66dcdbac/9)
      // share of a block (in %) that lies inside the fit r (in px)
      const share = (t) => {
        const ix = Math.min(r[2], (t.x + t.w) * W / 100) - Math.max(r[0], t.x * W / 100), iy = Math.min(r[3], (t.y + t.h) * H / 100) - Math.max(r[1], t.y * H / 100);
        return ix > 0 && iy > 0 ? ix * iy / ((t.w * W / 100) * (t.h * H / 100)) : 0;
      };
      const half = (t) => share(t) >= 0.5;
      const big = blocks.filter((t) => !t.faded && t.n >= 6 && half(t));
      // a short word (3-5 letters) right next to that lettering is its last line, not a speck: "YOU." under
      // "I'LL KILL" was cut off and left unerased (live GPT 66dcdbac/10). A lone speck far off still doesn't count.
      const gap = (a, c) => Math.max(0, Math.max(a.x, c.x) - Math.min(a.x + a.w, c.x + c.w)) * W / 100 + Math.max(0, Math.max(a.y, c.y) - Math.min(a.y + a.h, c.y + c.h)) * H / 100;
      const inR = big.concat(blocks.filter((t) => !t.faded && t.n >= 3 && t.n < 6 && half(t)
        && big.some((c) => gap(t, c) < 2 * t.h * H / 100)));
      // ...and only when no bigger block is cut through: one lobe of a split bubble covers part of the whole
      // bubble's block, and clamping it to the small word inside left the rest of its English (live GPT 66dcdbac/9)
      const cutThrough = blocks.some((t) => !t.faded && t.n >= 6 && share(t) > 0.1 && share(t) < 0.5);
      if (inR.length && !cutThrough && (!b.kind || b.kind === 'bubble')) {
        const pad = Math.max(P + 2, Math.round(0.006 * H));
        const u = [Math.min(...inR.map((t) => t.x)) * W / 100 - pad, Math.min(...inR.map((t) => t.y)) * H / 100 - pad,
          Math.max(...inR.map((t) => t.x + t.w)) * W / 100 + pad, Math.max(...inR.map((t) => t.y + t.h)) * H / 100 + pad];
        // letters the block finder missed (white "YOU." on a black bubble, live GPT 66dcdbac/10) but that are
        // letter-height and within about a line of the lettering are its next line: keep them inside the cut
        const lhs = (used || []).map((bl) => bl.y1 - bl.y0 + 1).filter((h) => h >= 3).sort((a, z) => a - z);
        const mh = lhs.length ? lhs[lhs.length >> 1] : 0;
        for (let grew = mh > 0; grew;) {
          grew = false;
          for (const bl of used || []) {
            const h = bl.y1 - bl.y0 + 1, inside = bl.x0 >= u[0] && bl.x1 <= u[2] && bl.y0 >= u[1] && bl.y1 <= u[3];
            if (inside || h < 0.5 * mh || h > 1.8 * mh) continue;
            // the line above or below only (within the lettering's width): hearts and hair beside it stay out
            const dx = Math.max(0, u[0] - bl.x1, bl.x0 - u[2]), dy = Math.max(0, u[1] - bl.y1, bl.y0 - u[3]);
            // ...and never wider: hearts under a bubble widened it one by one (live 66dcdbac/8)
            if (dx > 0 || bl.x0 < u[0] || bl.x1 > u[2] || dy > 1.2 * mh) continue;
            u[1] = Math.min(u[1], bl.y0 - pad); u[3] = Math.max(u[3], bl.y1 + pad);
            grew = true;
          }
        }
        if ((r[2] - r[0]) * (r[3] - r[1]) > 1.6 * (u[2] - u[0]) * (u[3] - u[1])) {
          const cut = [Math.max(r[0], Math.round(u[0])), Math.max(r[1], Math.round(u[1])), Math.min(r[2], Math.round(u[2])), Math.min(r[3], Math.round(u[3]))];
          const keep = (used || []).filter((bl) => bl.x0 >= cut[0] && bl.x1 < cut[2] && bl.y0 >= cut[1] && bl.y1 < cut[3]);
          if (keep.length) used = keep;
          r = cut;
        }
      }
      // heights of real strokes only: JPEG specks (1-2px) sit around every letter and dragged the median to
      // 1px, so every box on a live Sangeki page was thrown away as "dust" (and flagged mixed); they're still
      // covered by the box, they just don't vote on the lettering size
      const hs = (used || []).map((bl) => bl.y1 - bl.y0 + 1).filter((h) => h >= 3).sort((a, z) => a - z);
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
    let touching = letters.filter((bl) => bl.x1 >= bx0 && bl.x0 <= bx1 && bl.y1 >= by0 && bl.y0 <= by1);
    // a long flat stroke (an arc of the drawing under a short line, live GPT page: "...AH..." lost to a
    // 70x14 curve that blew the fit past the runaway guard) is art, not a letter
    const tallest = touching.map((bl) => bl.y1 - bl.y0 + 1).filter((h) => h >= 6).sort((a, z) => a - z);
    const letterH = tallest.length ? tallest[tallest.length >> 1] : 0;
    if (letterH) {
      // sparse too: joined lettering ("¿EN SERIO?!" in one blob) is as wide but far denser than a thin curve
      const flat = (bl) => bl.x1 - bl.x0 + 1 > 3 * letterH && bl.y1 - bl.y0 + 1 < letterH && bl.n < 0.25 * (bl.x1 - bl.x0 + 1) * (bl.y1 - bl.y0 + 1);
      touching = touching.filter((bl) => !flat(bl));
      for (const bl of letters) if (flat(bl)) bl.used = true; // and grow() must not pick it up either
    }
    // one blob shaped like a word is a word: hand-lettered "OUCH" is a single joined stroke (live GPT 6b101d55/5),
    // and "no text here" sent its line onto a hair strand 17% away
    const word = (bl) => { const w = bl.x1 - bl.x0 + 1, h = bl.y1 - bl.y0 + 1; return h >= Math.max(6, 0.006 * H) && h <= CHAR && w >= 1.5 * h && bl.n >= 0.15 * w * h; };
    if (touching.length < 2 && !(touching.length === 1 && word(touching[0]))) {
      // no text under the model's box: it missed the bubble; the nearest text cluster may still be it
      const r = shrink();
      return r ? kept(r, 'shrink') : { b: { ...b, ...style, fit: 'kept' } };
    }
    // Seed from the letters themselves, not the model's box: a box drawn wider than its bubble (real
    // report: white block spilling over the sky around an oval bubble) must shrink to the text, and the
    // interior pass below then widens it only as far as the bubble really goes.
    for (const bl of touching) bl.used = true;
    // join distance grows with the lettering: a shout's line gap is wider than the fixed one, and the last
    // line was left unerased under its translation (live GPT 66dcdbac/10: "YOU." under "I'LL KILL")
    const r = grow(letters, Math.min(...touching.map((bl) => bl.x0)), Math.min(...touching.map((bl) => bl.y0)),
      Math.max(...touching.map((bl) => bl.x1 + 1)), Math.max(...touching.map((bl) => bl.y1 + 1)), Math.max(G, Math.round(0.9 * letterH)));
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
    if (!f.px) {
      // No letters found = text drawn straight on art (screentone, hatching), where the model's box is all we
      // have and it tends to stop a line short (live Sangeki run: "...SE DA CUENTA?" left under a caption).
      // A little margin all round; the box sits on art anyway, there's no bubble to spill out of.
      const b = f.b;
      if (b.fit !== 'kept' || !(b.w > 0) || !(b.h > 0)) return b;
      const mx = Math.min(b.w * 0.08, 2), my = Math.min(b.h * 0.3, 3); // ~one line of lettering above and below
      const x = Math.max(0, b.x - mx), y = Math.max(0, b.y - my);
      return { ...b, x, y, w: Math.min(100 - x, b.w + 2 * mx), h: Math.min(100 - y, b.h + 2 * my) };
    }
    let [x0, y0, x1, y1] = f.px;
    if (f.b.kind === 'art') {
      // Free text on the artwork (the model says so): there's no bubble interior to widen into. The model is
      // asked to box EVERY line of such text, the letters found may miss a line in the art (live Sangeki
      // run: "O LE ESTÁ" left above a white-on-black caption), so take both, plus about half a line of margin.
      const [mx0, my0, mx1, my1] = boxes[k];
      // The model's box and a detected block of lettering agree (most of the block inside the box, box at most
      // ~2.5x the block): that pair is the text. The letter growth followed the hatching around it and the
      // white block reached a face (live GPT 66dcdbac/9: block 19x7%, drawn 26.5x13.6%).
      const pxOf = (t) => [t.x * W / 100, t.y * H / 100, (t.x + t.w) * W / 100, (t.y + t.h) * H / 100];
      const agree = blocks.filter((t) => !t.faded && t.n >= 6).map(pxOf).filter(([a, c, e, g]) => {
        const ix = Math.min(e, mx1) - Math.max(a, mx0), iy = Math.min(g, my1) - Math.max(c, my0);
        return ix > 0 && iy > 0 && ix * iy >= 0.6 * (e - a) * (g - c);
      });
      const ba = agree.reduce((s, [a, c, e, g]) => s + (e - a) * (g - c), 0);
      if (agree.length && (mx1 - mx0) * (my1 - my0) <= 2.5 * ba) {
        x0 = Math.min(mx0, ...agree.map((t) => t[0])); y0 = Math.min(my0, ...agree.map((t) => t[1]));
        x1 = Math.max(mx1, ...agree.map((t) => t[2])); y1 = Math.max(my1, ...agree.map((t) => t[3]));
      } else if ((mx1 - mx0) * (my1 - my0) <= 3 * (x1 - x0) * (y1 - y0)) { x0 = Math.min(x0, mx0); y0 = Math.min(y0, my0); x1 = Math.max(x1, mx1); y1 = Math.max(y1, my1); }
      const line = Math.max(4, (f.lh || 1.5) / 100 * H * 1.25);
      x0 = Math.max(0, Math.round(x0 - line * 0.5)); x1 = Math.min(W, Math.round(x1 + line * 0.5));
      y0 = Math.max(0, Math.round(y0 - line * 0.6)); y1 = Math.min(H, Math.round(y1 + line * 0.6));
      rects[k] = [x0, y0, x1, y1];
      return { ...f.b, ...f.style, fit: f.fit, ...(f.lh && { lh: f.lh }), x: x0 / W * 100, y: y0 / H * 100, w: (x1 - x0) / W * 100, h: (y1 - y0) / H * 100 };
    }
    const maxW =Math.min(W, Math.max(1.5 * (x1 - x0), x1 - x0 + 0.04 * W)), maxH = Math.min(H, Math.max(1.35 * (y1 - y0), y1 - y0 + 0.03 * H)); // open bubbles merge into white art: stay modest
    const live = [true, true, true, true]; // top, right, bottom, left
    for (let guard = 0; live.some(Boolean) && guard < 400; guard++) {
      if (live[0]) live[0] = y0 > 0 && y1 - y0 < maxH && lineBg(f.bg, x0, y0 - 1, x1, y0) >= 0.96 && clear(k, x0, y0 - 1, x1, y1) && !!y0--;
      if (live[2]) live[2] = y1 < H && y1 - y0 < maxH && lineBg(f.bg, x0, y1, x1, y1 + 1) >= 0.96 && clear(k, x0, y0, x1, y1 + 1) && !!++y1;
      if (live[3]) live[3] = x0 > 0 && x1 - x0 < maxW && lineBg(f.bg, x0 - 1, y0, x0, y1) >= 0.96 && clear(k, x0 - 1, y0, x1, y1) && !!x0--;
      if (live[1]) live[1] = x1 < W && x1 - x0 < maxW && lineBg(f.bg, x1, y0, x1 + 1, y1) >= 0.96 && clear(k, x0, y0, x1 + 1, y1) && !!++x1;
    }
    rects[k] = [x0, y0, x1, y1];
    // the lettering's own extent before widening: always inside the bubble (used when the page can't erase)
    const [c0, c1, c2, c3] = f.px, core = [c0 / W * 100, c1 / H * 100, (c2 - c0) / W * 100, (c3 - c1) / H * 100];
    return { ...f.b, ...f.style, fit: f.fit, ...(f.lh && { lh: f.lh }), ...(f.mixed && { mixed: true, orig: [f.b.x, f.b.y, f.b.w, f.b.h] }), core, x: x0 / W * 100, y: y0 / H * 100, w: (x1 - x0) / W * 100, h: (y1 - y0) / H * 100 };
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
  // also a dialogue box that fitted art strokes as "letters" (hatching is one-size too) and sits on no text,
  // while lettering right next to it has no translation (live report: "Cô chủ nhà trọ…?" drawn on the
  // ground under its bubble, "LA POSADERA…" left in the bubble)
  const freeNear = (b) => blocks.some((t) => t.n >= 6 && !t.faded && !good.some((o) => covers(t, o))
    && t.w * t.h > 0.3 * b.w * b.h && t.w * t.h < 3 * b.w * b.h // a short word the detector missed ("¡CURAR!") must not jump to a speck
    && Math.hypot(t.x + t.w / 2 - b.x - b.w / 2, t.y + t.h / 2 - b.y - b.h / 2) < 12);
  const stray = (b) => b.fit !== 'kept' && !onText(b) && (b.mixed || ((!b.kind || b.kind === 'bubble') && b.fit !== 'block' && freeNear(b)));
  // white lettering on a black/dark-toned caption: the letter finder can't confirm it, yet the model's
  // spot is right - moving it to the nearest free block put it on another bubble (live Sangeki run)
  const darkLum = (b) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(b.bg || ''); return m ? 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3] : 255; };
  // an SFX/art line is drawn on the art, never moved onto a free block of lettering (those are speech): GPT's
  // right spot for "ぇぇぇ…" was swapped for a block on a boy's face (live 822342aa/7)
  // ...at a plausible size only: a giant unverified art box (GPT boxed half a panel for "I WONDER WHO…") must
  // still be dropped so the missed-text pass translates the real lettering in place (live GPT 6b101d55/7)
  const fixedKind = (b) => (b.kind === 'sfx' || b.kind === 'art') && b.w * b.h <= 150;
  const stays = out.filter((b) => b.fit === 'kept' && (darkLum(b) < 60 || fixedKind(b)));
  good = good.concat(stays);
  const kept = out.filter((b) => b.fit === 'kept' && darkLum(b) >= 60 && !fixedKind(b)).concat(good.filter((b) => stray(b) && !fixedKind(b)));
  good = good.filter((b) => !stray(b) || fixedKind(b));
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
    // the size test only guards against tiny far blocks; a wrong-shaped box (a wide strip drawn for a tall
    // bubble, live report) may still belong to the block it overlaps or sits next to
    // ratio < 3: a one-word line never belongs to a block 3x its size - "OUCH!" (unverified small lettering,
    // GPT's box right) jumped 17% onto a hair "block" and its bubble stayed English (live GPT 6b101d55/5)
    if (t.n >= 6 && ratio > 0.05 && ratio < 3 && (d < 18 || covers(t, b))) pairs.push({ i, j, d: covers(t, b) ? d / 4 : d }); // a block under the box wins
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
  // A blind box nobody could re-home is drawn on art: over ~1.5% of the page it hid the panel (live report:
  // two white strips across a page). Dropping it leaves its bubble's source text uncovered, which the
  // missed-text pass then translates in place.
  const rest = kept.filter((b, i) => !usedK.has(i) && (b.fit !== 'kept' || b.w * b.h <= 150))
    .map((b) => { // union: the model's box has the word's extent, the letters found its real vertical spot
      if (!b.orig) return b;
      const [ox, oy, ow, oh] = b.orig, x0 = Math.min(ox, b.x), y0 = Math.min(oy, b.y);
      return { ...b, x: x0, y: y0, w: Math.max(ox + ow, b.x + b.w) - x0, h: Math.max(oy + oh, b.y + b.h) - y0, fit: 'model' };
    });
  // An unverified box becomes an opaque block at the model's size: shrink it to the lettering found inside
  // (white-outlined text on dark art: the block covered half a panel around a 4-line caption, live report)
  const tight = (b) => {
    if (b.fit !== 'kept') return b;
    const inBox = blocks.filter((t) => inter(t, b) >= 0.5 * t.w * t.h);
    if (!inBox.length) return b;
    const x0 = Math.min(...inBox.map((t) => t.x)), y0 = Math.min(...inBox.map((t) => t.y));
    const x1 = Math.max(...inBox.map((t) => t.x + t.w)), y1 = Math.max(...inBox.map((t) => t.y + t.h));
    if ((x1 - x0) * (y1 - y0) >= 0.6 * b.w * b.h) return b;
    const mx = Math.min(2, (x1 - x0) * 0.08), my = Math.min(2, (y1 - y0) * 0.1);
    return { ...b, x: Math.max(0, x0 - mx), y: Math.max(0, y0 - my), w: x1 - x0 + 2 * mx, h: y1 - y0 + 2 * my };
  };
  // Faded lettering (a flashback echoing an earlier chapter, a ghostly background voice) is not translated -
  // decided here from the pixels, not asked of the model: the prompt rule made Gemini skip 8% of ordinary
  // bubbles (89 vs 97 lines on 8 pages). A line goes only when ALL the lettering under it is faint grey.
  const faint = (b) => {
    const under = blocks.filter((t) => inter(t, b) >= 0.5 * t.w * t.h);
    return under.length > 0 && under.every((t) => t.faded) && under.reduce((n, t) => n + inter(t, b), 0) >= 0.4 * b.w * b.h;
  };
  return good.concat(refit, rest.map(tight)).filter((b) => b.fit === 'kept' || !faint(b));
}

// Page-wide text finder, independent of the model: clusters of dark letter-sized blobs sitting on a
// light background (speech bubbles, captions). Used to catch bubbles the model never returned (real
// report: a whole "BUENO, AHORA HAY..." bubble left untranslated) - each block no box covers gets a
// second, cropped call. Works on a grid of ~1100 cells along the long side.
//   returns [{ x, y, w, h, n }] in % of the image (n = letters found)
// eslint-disable-next-line no-unused-vars
// Dark lettering on paper, then light lettering on dark (white captions on black panels, thoughts on night
// scenes) - the first pass alone never re-read those, so they stayed untranslated.
// Same pixels, same blocks: computed once per page image (fitBubbles, drawing, recovery and the "+" buttons
// each asked again - ~130ms a time on the page's main thread)
const textBlocksMemo = new WeakMap();
function textBlocks(px) {
  let r = textBlocksMemo.get(px);
  if (!r) textBlocksMemo.set(px, (r = textBlocksIn(px, false).concat(textBlocksIn(px, true))));
  return r.slice();
}
function textBlocksIn(px, invert) {
  const { width: W, height: H, data } = px;
  const s = Math.max(1, Math.round(Math.max(W, H) / 1100));
  const gw = Math.floor(W / s), gh = Math.floor(H / s);
  const lum = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = ((y * s) * W + x * s) * 4;
    const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum[y * gw + x] = invert ? 255 - v : v;
  }
  const DARK = 110, LIGHT = 200, FADED = 70;
  const CH = Math.max(6, 0.045 * Math.min(gw, gh)); // tallest letter, in cells
  const label = new Int32Array(gw * gh), stack = [];
  const letters = [];
  for (let sy = 0; sy < gh; sy++) for (let sx = 0; sx < gw; sx++) {
    const s0 = sy * gw + sx;
    if (label[s0] || lum[s0] >= DARK) continue;
    const id = letters.length + 2; // label 1 is unused: ids start at 2
    let x0 = sx, y0 = sy, x1 = sx, y1 = sy, n = 0, big = false, min = 255;
    label[s0] = id; stack.push(s0);
    while (stack.length) {
      const p = stack.pop(), x = p % gw, y = (p / gw) | 0;
      n++;
      if (lum[p] < min) min = lum[p];
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
    // a letter is roughly as wide as tall (I and 1 aside, which sit among wider ones); a strand of hair or a
    // fold line is a long thin stroke (live benchmark: blocks found on hair, wasting recovery crops)
    const thin = (bh > 4 * bw && bh > 12) || (bw > 5 * bh && bw > 12);
    letters.push(big || thin || bh < 3 || n < 4 || n / (bw * bh) > 0.9 ? null : { x0, y0, x1, y1, id, min });
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
    // printed lettering has a near-black core; a flashback echo / faded background voice is grey all through
    // (live report: those must not be translated - recovery used to send them to the AI)
    const ink = g.map((l) => l.min).sort((a, z) => a - z)[g.length >> 1];
    out.push({ x: x0 / gw * 100, y: y0 / gh * 100, w: bw / gw * 100, h: bh / gh * 100, n: g.length, ...(ink > FADED && { faded: true }) });
  }
  return out;
}

// Two fitted boxes that still overlap (a bubble's box and a neighbouring shout/SFX box, live Sangeki run:
// "Gahaha!" hid the first words of the bubble beside it). Nothing moves - moving put text off its bubble -
// the box with less text gives up the overlap along whichever side costs it the least area, as long as it
// keeps at least 40% of itself; otherwise both stay and the longer text is drawn on top.
// eslint-disable-next-line no-unused-vars
function trimOverlaps(list) {
  const out = list.map((b) => ({ ...b, full: b.full || { x: b.x, y: b.y, w: b.w, h: b.h, bg: b.bg, kind: b.kind } }));
  for (let i = 0; i < out.length; i++) for (let j = 0; j < out.length; j++) {
    if (i === j) continue;
    const a = out[i], b = out[j];
    if ((a.text || '').length < (b.text || '').length || ((a.text || '').length === (b.text || '').length && i > j)) continue; // b is the smaller text
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix <= 0 || iy <= 0) continue;
    // a blind box (no source letters under it) lying on another box's bubble was put there by mistake: it
    // can't be shown right there, so it goes (the missed-text pass re-reads any lettering left uncovered)
    if (b.fit === 'kept' && a.fit !== 'kept' && b.kind !== 'art' && b.kind !== 'box' && ix * iy >= 0.3 * b.w * b.h) { b.drop = true; continue; }
    const cut = [ // b trimmed so it ends where a begins, or starts where a ends
      { x: b.x, y: b.y, w: a.x - b.x, h: b.h }, { x: a.x + a.w, y: b.y, w: b.x + b.w - (a.x + a.w), h: b.h },
      { x: b.x, y: b.y, w: b.w, h: a.y - b.y }, { x: b.x, y: a.y + a.h, w: b.w, h: b.y + b.h - (a.y + a.h) },
    ].filter((c) => c.w > 0 && c.h > 0).sort((p, q) => q.w * q.h - p.w * p.h)[0];
    if (cut && cut.w * cut.h >= 0.4 * b.w * b.h) { Object.assign(b, cut); continue; }
    // b sits mostly INSIDE a: a grew over a neighbour's letters (benchmark: a caption box swallowing the
    // line beside it, "¡¡SÍ SEÑOR!!" inside a tall box, two bubbles under one box) - text was drawn over
    // text. Give a the part of itself away from b; if that leaves too little, a speaks for both.
    if (ix * iy >= 0.7 * b.w * b.h) {
      const rest = [
        { x: a.x, y: a.y, w: b.x - a.x, h: a.h }, { x: b.x + b.w, y: a.y, w: a.x + a.w - (b.x + b.w), h: a.h },
        { x: a.x, y: a.y, w: a.w, h: b.y - a.y }, { x: a.x, y: b.y + b.h, w: a.w, h: a.y + a.h - (b.y + b.h) },
      ].filter((c) => c.w > 0 && c.h > 0).sort((p, q) => q.w * q.h - p.w * p.h)[0];
      if (rest && rest.w * rest.h >= 0.45 * a.w * a.h) { Object.assign(a, rest); continue; }
      if (b.fit !== 'kept' && b.text && !(a.text || '').includes(b.text)) {
        a.text = b.y + b.h / 2 < a.y + a.h / 2 ? b.text + ' ' + a.text : a.text + ' ' + b.text;
        if (b.src) a.src = (a.src ? a.src + ' ' : '') + b.src;
      }
      // a now answers for b's letters too: erase them with a's patch
      const fa = a.full, fb = b.full, x0 = Math.min(fa.x, fb.x), y0 = Math.min(fa.y, fb.y);
      a.full = { ...fa, x: x0, y: y0, w: Math.max(fa.x + fa.w, fb.x + fb.w) - x0, h: Math.max(fa.y + fa.h, fb.y + fb.h) - y0 };
      if (a.core && b.core) { // the letters of both, for a block that can't be erased
        const [ax, ay, aw, ah] = a.core, [bx, by, bw, bh] = b.core, ux = Math.min(ax, bx), uy = Math.min(ay, by);
        a.core = [ux, uy, Math.max(ax + aw, bx + bw) - ux, Math.max(ay + ah, by + bh) - uy];
      }
      b.drop = true;
      continue;
    }
    // Neither can give way alone (two crowded bubbles, live Sangeki run: "Nên giá bán…" over "Ổng chỉ
    // muốn…"): split the overlap down the middle, each keeps its half. Not when one
    // box mostly sits inside the other - that's a duplicate, and splitting would gut the big one.
    if (ix * iy > 0.9 * Math.min(a.w * a.h, b.w * b.h)) continue;
    // cut across the direction the two boxes sit apart in (side by side -> vertical cut)
    const sx = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) / (a.w + b.w), sy = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) / (a.h + b.h);
    if (sx >= sy) {
      const mid = Math.max(a.x, b.x) + ix / 2;
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      l.w = mid - l.x; r.w = r.x + r.w - mid; r.x = mid;
    } else {
      const mid = Math.max(a.y, b.y) + iy / 2;
      const [t, u] = a.y <= b.y ? [a, b] : [b, a];
      t.h = mid - t.y; u.h = u.y + u.h - mid; u.y = mid;
    }
  }
  return out.filter((b) => !b.drop);
}

// Erases the source lettering under a translation box instead of hiding it under a coloured block.
// Letters = blobs of non-background pixels inside the box that don't touch its edge (the bubble outline and
// panel borders do) and are letter-sized; they're grown by 1px for the anti-aliased halo, then filled from
// the surrounding pixels inward, ring by ring. On a plain bubble that gives clean paper; on screentone or a
// dark panel it continues the texture around the strokes, so no rectangle shows.
//   b: a fitted box { x, y, w, h (in %), bg: 'rgb(r,g,b)' }
//   returns { x, y, w, h (in %), pw, ph, data: RGBA of the cleaned region } or null
// eslint-disable-next-line no-unused-vars
// Only the pixels it changed are opaque: two overlapping boxes each copied the ORIGINAL page into their
// patch, so the one drawn second painted the first one's erased letters back (benchmark: "ADO ELLA…" left).
// eslint-disable-next-line no-unused-vars
function cleanPatch(px, b) {
  // Speech bubbles first by their own shape, in a window wide enough to hold the whole bubble: letters
  // touching the outline survived the per-letter erase (live report: "WHAT'RE YOU DOING…" half left), and a
  // box smaller than its bubble never saw the outline at all
  const c = (b.kind !== 'art' && b.kind !== 'sfx' && cleanPatchRaw(px, { ...b, wide: true })) || cleanPatchRaw(px, b);
  if (!c) return c;
  const { width: W, data } = px, x0 = Math.round(c.x / 100 * W), y0 = Math.round(c.y / 100 * px.height);
  for (let y = 0; y < c.ph; y++) for (let x = 0; x < c.pw; x++) {
    const i = (y * c.pw + x) * 4, j = ((y0 + y) * W + x0 + x) * 4;
    if (c.data[i] === data[j] && c.data[i + 1] === data[j + 1] && c.data[i + 2] === data[j + 2]) c.data[i + 3] = 0;
  }
  return c;
}
function cleanPatchRaw(px, b) {
  const { width: W, height: H, data } = px;
  // the box itself (core) + a margin of about one stroke: letters poking out of the box were left half
  // erased, and strokes touching the box edge were taken for the bubble outline (live reports)
  const cx0 = Math.max(0, Math.floor(b.x / 100 * W)), cy0 = Math.max(0, Math.floor(b.y / 100 * H));
  const cx1 = Math.min(W, Math.ceil((b.x + b.w) / 100 * W)), cy1 = Math.min(H, Math.ceil((b.y + b.h) / 100 * H));
  if (cx1 - cx0 < 4 || cy1 - cy0 < 4) return null;
  const M = b.wide ? Math.round(Math.max(6, Math.min(0.08 * Math.min(W, H), 0.8 * Math.max(cx1 - cx0, cy1 - cy0)))) : Math.max(4, Math.round(0.012 * Math.min(W, H)));
  const x0 = Math.max(0, cx0 - M), y0 = Math.max(0, cy0 - M), x1 = Math.min(W, cx1 + M), y1 = Math.min(H, cy1 + M);
  const w = x1 - x0, h = y1 - y0;
  const inCore = (x, y) => x + x0 >= cx0 && x + x0 < cx1 && y + y0 >= cy0 && y + y0 < cy1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1) * 4), y * w * 4);
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(b.bg || '');
  const bg = m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
  const ink = (i) => Math.abs(out[i] - bg[0]) + Math.abs(out[i + 1] - bg[1]) + Math.abs(out[i + 2] - bg[2]) >= 60;
  const bgL0 = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  if (b.kind !== 'art' && b.kind !== 'sfx' && bgL0 > 200) {
    const r = bubbleInterior(out, w, h, inCore, ink, bg);
    if (r) return { x: x0 / W * 100, y: y0 / H * 100, w: w / W * 100, h: h / H * 100, pw: w, ph: h, data: out,
      inner: { x: (x0 + r[0]) / W * 100, y: (y0 + r[1]) / H * 100, w: (r[2] - r[0]) / W * 100, h: (r[3] - r[1]) / H * 100 } };
  }
  if (b.wide) return null; // the wide window is only for the bubble's shape
  const BIG = 2.5 * Math.max(12, 0.08 * Math.min(W, H)); // display lettering still counts as letters
  const label = new Int32Array(w * h), keep = [false], stack = [];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (label[s0] || !ink(s0 * 4)) continue;
    const id = keep.length;
    let bx0 = w, by0 = h, bx1 = 0, by1 = 0, edge = false, cnt = 0, core = false;
    label[s0] = id; stack.push(s0);
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      cnt++;
      if (!core && inCore(x, y)) core = true;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!label[q] && ink(q * 4)) { label[q] = id; stack.push(q); }
      }
    }
    const small = bx1 - bx0 < BIG && by1 - by0 < BIG;
    // a blob big in BOTH directions and solid = lettering fused with screentone/art: it can't be lifted
    // cleanly, give up (live run); long thin ones are outlines or panel lines inside the box - left alone
    if (!edge && !small && Math.min(bx1 - bx0, by1 - by0) >= BIG / 2.5 && cnt >= 0.15 * (bx1 - bx0 + 1) * (by1 - by0 + 1)) return null;
    // a letter touches the box; the bubble outline in the margin doesn't - it stays
    keep.push(!edge && small && core);
  }
  // mask = kept blobs + 2px halo, then any faint pixel touching the mask (anti-aliasing greys that a 60
  // threshold misses left a ghost outline of every letter)
  const mask = new Uint8Array(w * h);
  let n = 0;
  for (let p = 0; p < w * h; p++) {
    if (!keep[label[p]]) continue;
    const x = p % w, y = (p / w) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !mask[ny * w + nx]) { mask[ny * w + nx] = 1; n++; }
    }
  }
  // On light paper the JPEG's soft letter edges run wider than one ring: a pale outline of every erased letter
  // stayed visible (live GPT 66dcdbac/8, a bubble erased stroke by stroke). Four rings, a lower threshold;
  // never into other ink (outline, art), which stays in its own blobs.
  const light = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2] > 200;
  const faint = (i) => Math.abs(out[i] - bg[0]) + Math.abs(out[i + 1] - bg[1]) + Math.abs(out[i + 2] - bg[2]) >= (light ? 9 : 24);
  for (let ring = 0; ring < (light ? 4 : 1); ring++) {
    const halo = [];
    for (let p = 0; p < w * h; p++) {
      if (mask[p] || !faint(p * 4) || (label[p] && !keep[label[p]])) continue;
      const x = p % w, y = (p / w) | 0;
      if ((x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w])) halo.push(p);
    }
    if (!halo.length) break;
    for (const p of halo) { mask[p] = 1; n++; }
  }
  if (!n || n > 0.85 * w * h) return null; // nothing to erase, or the "letters" are the whole region
  // Self-check: most of the ink in the box must be the letters we lift. On textured art the strokes fuse
  // with the hatching at the box edge and stay; the box would then turn transparent over the original
  // text (live run: "POR SOLO 200,000 YENES?" left under its translation). Fall back to the block.
  // Judged around the lettering itself (kept blobs' bounding box + a stroke): a box reaching past an open
  // bubble into hair or a sleeve failed here on art it never meant to erase (benchmark: 16 of 190 bubbles).
  let lx0 = w, ly0 = h, lx1 = -1, ly1 = -1;
  for (let p = 0; p < w * h; p++) if (keep[label[p]]) { const x = p % w, y = (p / w) | 0; if (x < lx0) lx0 = x; if (x > lx1) lx1 = x; if (y < ly0) ly0 = y; if (y > ly1) ly1 = y; }
  // a letter height around the kept letters: a letter fused with hair next to them ("Vistazo" -> "ZO" left)
  // must count against the erase
  const pad = Math.max(3, Math.round(Math.min(ly1 - ly0, lx1 - lx0) > 0 ? Math.min(0.25 * (ly1 - ly0 + 1), 0.25 * (lx1 - lx0 + 1), M * 2) : 3));
  let inkAll = 0, inkGone = 0;
  for (let y = Math.max(0, ly0 - pad); y <= Math.min(h - 1, ly1 + pad); y++) for (let x = Math.max(0, lx0 - pad); x <= Math.min(w - 1, lx1 + pad); x++) {
    const p = y * w + x;
    if (inCore(x, y) && ink(p * 4)) { inkAll++; if (mask[p]) inkGone++; }
  }
  if (inkGone < 0.5 * inkAll) return null;
  // Plain paper or plain black: the erased strokes take the exact background colour. Spreading the
  // neighbours inward dragged the grey anti-aliasing along and left a smudge where each letter was.
  const bgL = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  if (bgL > 200 || bgL < 50) {
    const pc = paperColour(out, w * h, (p) => !mask[p] && !faint(p * 4), bg);
    for (let p = 0; p < w * h; p++) if (mask[p]) { out[p * 4] = pc[0]; out[p * 4 + 1] = pc[1]; out[p * 4 + 2] = pc[2]; out[p * 4 + 3] = 255; }
    return { x: x0 / W * 100, y: y0 / H * 100, w: w / W * 100, h: h / H * 100, pw: w, ph: h, data: out };
  }
  // fill ring by ring from the known pixels inward
  let front = [];
  for (let p = 0; p < w * h; p++) if (mask[p]) front.push(p);
  for (let guard = 0; front.length && guard < 200; guard++) {
    const done = [], next = [];
    for (const p of front) {
      const x = p % w, y = (p / w) | 0;
      let r = 0, g = 0, bl = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q]) continue;
        r += out[q * 4]; g += out[q * 4 + 1]; bl += out[q * 4 + 2]; k++;
      }
      if (k) done.push([p, r / k, g / k, bl / k]); else next.push(p);
    }
    if (!done.length) { for (const p of next) { out[p * 4] = bg[0]; out[p * 4 + 1] = bg[1]; out[p * 4 + 2] = bg[2]; } break; }
    for (const [p, r, g, bl] of done) { out[p * 4] = r; out[p * 4 + 1] = g; out[p * 4 + 2] = bl; out[p * 4 + 3] = 255; mask[p] = 0; }
    front = next;
  }
  return { x: x0 / W * 100, y: y0 / H * 100, w: w / W * 100, h: h / H * 100, pw: w, ph: h, data: out };
}

// The paper's real colour (mean of the given pixels). The box's bg is a 16-level estimate (248 for white
// paper that is really 255): filling erased letters with it left a grey ghost of every letter (live report).
function paperColour(out, n, pick, fallback) {
  let r = 0, g = 0, b = 0, k = 0;
  for (let p = 0; p < n; p++) if (pick(p)) { r += out[p * 4]; g += out[p * 4 + 1]; b += out[p * 4 + 2]; k++; }
  return k ? [Math.round(r / k), Math.round(g / k), Math.round(b / k)] : fallback;
}

// A box larger than its bubble (the model's box, or one spilling past the outline) reached into the art:
// erasing per letter then failed on the art strokes and the fallback was a white block over the art (live
// reports: tall white rectangles across a bubble's edge). Instead find the bubble itself - the paper
// connected to the box centre, 4-connected so a thin outline stops it - and repaint everything inside it.
// The outline and the art around stay untouched. Returns the bubble's bounding box in patch pixels, or null
// when this isn't a closed bubble inside the patch (paper running out of the patch = open bubble, white art,
// or a box inside a bigger bubble - the per-letter erase handles those).
function bubbleInterior(out, w, h, inCore, ink, bg) {
  const paper = (p) => !ink(p * 4);
  const comp = new Int32Array(w * h);
  const regions = [];
  let id = 0;
  const stack = [];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (comp[s0] || !paper(s0) || !inCore(s0 % w, (s0 / w) | 0)) continue;
    id++;
    let n = 0, border = 0;
    comp[s0] = id; stack.push(s0);
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      n++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border++;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && !comp[q] && paper(q)) { comp[q] = id; stack.push(q); }
      }
    }
    // paper leaving the window = not a closed bubble here (open bubble, white art, a box inside a bigger bubble)
    if (border <= 0.02 * 2 * (w + h) && n >= 64) regions.push({ id, n });
  }
  regions.sort((a, z) => z.n - a.n);
  for (const r of regions.slice(0, 4)) {
    const got = shapeOf(r.id);
    if (got) return got;
  }
  return null;

  function shapeOf(best) {
  // filled shape = inside both the row span and the column span of the paper (letters are holes in it)
  const rowL = new Int32Array(h).fill(w), rowR = new Int32Array(h).fill(-1), colT = new Int32Array(w).fill(h), colB = new Int32Array(w).fill(-1);
  for (let p = 0; p < w * h; p++) {
    if (comp[p] !== best) continue;
    const x = p % w, y = (p / w) | 0;
    if (x < rowL[y]) rowL[y] = x; if (x > rowR[y]) rowR[y] = x; if (y < colT[x]) colT[x] = y; if (y > colB[x]) colB[x] = y;
  }
  const inside = (x, y) => x >= rowL[y] && x <= rowR[y] && y >= colT[x] && y <= colB[x];
  let area = 0, coreArea = 0, inkIn = 0, bx0 = w, by0 = h, bx1 = 0, by1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inCore(x, y)) coreArea++;
    if (!inside(x, y)) continue;
    area++;
    if (comp[y * w + x] !== best) inkIn++;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  // a real bubble: a good part of the box, with lettering in it but mostly paper (a pocket of white in the
  // art, or texture fused with letters, fails this)
  if (area < 0.2 * coreArea || inkIn < 0.01 * area || inkIn > 0.45 * area) return null;
  // it must be the bubble holding the lettering: most of the box's ink inside the shape (a wider window
  // could pick a bigger blank area beside the bubble and paint that instead, letters left standing)
  // counted on letter-sized marks only: a box drawn bigger than its bubble also holds screentone dots and
  // big art strokes, which made every such bubble fail and fall back to a white block over the art
  const lseen = new Uint8Array(w * h), big = 0.25 * Math.max(w, h);
  let coreInk = 0, coreInkIn = 0;
  for (let s0 = 0; s0 < w * h; s0++) {
    if (lseen[s0] || !inCore(s0 % w, (s0 / w) | 0) || !ink(s0 * 4)) continue;
    const px0 = [];
    let mx0 = w, my0 = h, mx1 = 0, my1 = 0;
    lseen[s0] = 1; stack.push(s0);
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      px0.push(p);
      if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !lseen[q] && ink(q * 4)) { lseen[q] = 1; stack.push(q); }
      }
    }
    if (px0.length < 8 || Math.max(mx1 - mx0, my1 - my0) > big) continue; // tone dot, or outline/hair/art stroke
    for (const p of px0) { if (!inCore(p % w, (p / w) | 0)) continue; coreInk++; if (inside(p % w, (p / w) | 0)) coreInkIn++; }
  }
  if (!coreInk || coreInkIn < 0.6 * coreInk) return null;
  // lettering = many separate small marks; a face (closed white skin with two eyes and a mouth) is a few
  // (live benchmark: a girl's eyes were erased as if they were text)
  const seen = new Uint8Array(w * h);
  let marks = 0, artPix = 0, lx0 = w, ly0 = h, lx1 = -1, ly1 = -1;
  const maxMark = Math.max(bx1 - bx0, by1 - by0) * 0.6, letterMax = Math.max(bx1 - bx0, by1 - by0) * 0.3;
  for (let s0 = 0; s0 < w * h; s0++) {
    const sx = s0 % w, sy = (s0 / w) | 0;
    if (seen[s0] || comp[s0] === best || !inside(sx, sy)) continue;
    let mx0 = sx, my0 = sy, mx1 = sx, my1 = sy, cnt = 0;
    seen[s0] = 1; stack.push(s0);
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      cnt++;
      if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[q] && comp[q] !== best && inside(nx, ny)) { seen[q] = 1; stack.push(q); }
      }
    }
    if (Math.max(mx1 - mx0, my1 - my0) < maxMark) {
      marks++;
      if (cnt >= 8) { lx0 = Math.min(lx0, mx0); ly0 = Math.min(ly0, my0); lx1 = Math.max(lx1, mx1); ly1 = Math.max(ly1, my1); }
    }
    if (Math.max(mx1 - mx0, my1 - my0) > letterMax) artPix += cnt;
  }
  if (marks < 5) return null;
  // a bubble holds lettering only: big strokes inside the shape are drawing (text lettered straight onto a
  // jacket or hair - the light gaps between strokes looked like paper and got painted white, live benchmark)
  if (artPix > 0.03 * area) return null;
  // a bubble leaves paper around its lettering; white gaps in shaded art hug the letters (lettering on a jacket:
  // shape/letters 0.99, real bubbles 1.1 and up on 31 pages)
  if (lx1 < 0 || area < 1.05 * (lx1 - lx0 + 1) * (ly1 - ly0 + 1)) return null;
  const pc = paperColour(out, w * h, (p) => comp[p] === best, bg);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const i = (y * w + x) * 4;
    out[i] = pc[0]; out[i + 1] = pc[1]; out[i + 2] = pc[2]; out[i + 3] = 255;
  }
  return [bx0, by0, bx1 + 1, by1 + 1];
  }
}

// Slant of the lettering in a box, in CSS degrees (clockwise +), or 0 when it runs straight. Hand-lettered
// notes, signs and shouted captions are often written at an angle and the translation drawn level looked
// pasted on (live report: a letter written in slanted lines). Pixels decide, so it works with any model:
// letter centres projected across the lines pile up in sharp rows only at the right angle.
// eslint-disable-next-line no-unused-vars
function textAngle(px, b) {
  const { width: W, height: H, data } = px;
  const x0 = Math.max(0, Math.floor(b.x / 100 * W)), y0 = Math.max(0, Math.floor(b.y / 100 * H));
  const x1 = Math.min(W, Math.ceil((b.x + b.w) / 100 * W)), y1 = Math.min(H, Math.ceil((b.y + b.h) / 100 * H));
  const w = x1 - x0, h = y1 - y0;
  if (w < 20 || h < 12) return 0;
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(b.bg || '');
  const bg = m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
  const ink = (x, y) => { const i = ((y0 + y) * W + x0 + x) * 4; return Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) >= 90; };
  const label = new Int32Array(w * h), stack = [], pts = [], hs = [];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (label[s0] || !ink(s0 % w, (s0 / w) | 0)) continue;
    label[s0] = 1; stack.push(s0);
    let n = 0, sx = 0, sy = 0, bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      n++; sx += x; sy += y;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!label[q] && ink(nx, ny)) { label[q] = 1; stack.push(q); }
      }
    }
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    if (n < 6 || bh < 4 || bw > w * 0.5 || bh > h * 0.6) continue; // specks, outlines, panel lines
    pts.push([sx / n, sy / n]); hs.push(bh);
  }
  if (pts.length < 8) return 0;
  hs.sort((a, z) => a - z);
  const bin = Math.max(2, hs[hs.length >> 1] * 0.5); // half a letter
  // rows scored at two bin offsets: a lucky rounding of few letters made level bubbles look slanted
  const score = (deg) => {
    const r = deg * Math.PI / 180, sn = Math.sin(r), cs = Math.cos(r);
    let q = 0;
    for (const off of [0, 0.5]) {
      const cnt = new Map();
      for (const [x, y] of pts) { const k = Math.round((y * cs - x * sn) / bin + off); cnt.set(k, (cnt.get(k) || 0) + 1); }
      for (const c of cnt.values()) q += c * c;
    }
    return q;
  };
  let best = 0, bestS = score(0);
  for (let d = -35; d <= 35; d++) { const sc = score(d); if (sc > bestS) { bestS = sc; best = d; } }
  // a clear win, not noise: a few degrees and visibly sharper rows than level
  // calibrated on 18 hand-judged boxes from 31 pages: slanted lettering scored 1.48-2.1x level, level bubbles
  // up to 1.44x - and those had few letters (a dozen), where any angle can look tidy
  const r = bestS / score(0);
  return Math.abs(best) >= 4 && ((pts.length >= 20 && r >= 1.45) || r >= 1.9) ? best : 0;
}

// Lines shaped like a speech bubble: an ellipse fitted in the box gives each line its own width (short at
// the top and bottom, long in the middle), the way manga letterers break text. measure(text) -> px width.
// Returns the lines for the fewest rows that fit at this font size, or null when nothing fits.
// eslint-disable-next-line no-unused-vars
function ellipseLines(text, measure, boxW, boxH, lineH) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const maxRows = Math.floor(boxH / lineH);
  for (let n = 1; n <= Math.min(maxRows, words.length); n++) {
    const widths = Array.from({ length: n }, (_, i) => {
      // the ellipse wraps the text block itself (not the whole box), so even 3 lines in a tall bubble get
      // the letterer's diamond: short first and last lines, the longest in the middle
      const yc = (i + 0.5) * lineH - (n * lineH) / 2; // line centre relative to the block centre
      const r = Math.min(1, Math.abs(yc) / ((n * lineH) / 2 + lineH * 0.35));
      return boxW * Math.sqrt(Math.max(0.2, 1 - r * r));
    });
    const lines = [];
    let cur = '', row = 0, ok = true;
    for (const wd of words) {
      const cand = cur ? cur + ' ' + wd : wd;
      if (measure(cand) <= widths[row]) { cur = cand; continue; }
      if (!cur || row + 1 >= n) { ok = false; break; } // a single word wider than its row, or out of rows
      lines.push(cur); row++; cur = wd;
      if (measure(cur) > widths[row]) { ok = false; break; }
    }
    if (ok && cur) {
      lines.push(cur);
      // a letterer never leaves one lone syllable on the last line ("…không nhận / ra"): pull the previous
      // line's last word down when the last row has room for both
      const last = lines.length - 1;
      if (last >= 1 && !/\s/.test(lines[last])) {
        const prev = lines[last - 1].split(' ');
        const down = prev[prev.length - 1] + ' ' + lines[last];
        if (prev.length >= 3 && measure(down) <= widths[last]) { prev.pop(); lines[last - 1] = prev.join(' '); lines[last] = down; }
      }
      return lines;
    }
  }
  return null;
}
