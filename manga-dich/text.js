// Text layout for the inserted translations + a textless-page detector. Pure functions, no DOM,
// so the very same code runs in the page, in Node tests, and in the Python overlay renderer.
//   wrapText(t, ar): break a translation into balanced lines that match the bubble's shape.
//   hasText(px):    does this page carry any letter-sized ink clusters at all?

// Wraps `text` into 1..maxLines lines. A bubble needs few, WIDE lines; a narrow one few, TALL lines:
// `ar` is the bubble's width/height ratio. Tries every line count and picks the arrangement whose
// line aspect (widest line / count) is closest to the bubble's - so a "2 words per line" look falls
// out of the bubble's own shape instead of a fixed rule that fights it. Long words are never split;
// punctuation keeps Vietnamese semantics (break at spaces, not inside a word).
// eslint-disable-next-line no-unused-vars
function wrapText(text, ar, maxLines = 6) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words.join(' ') || '';

  // cost(w, h): how square-ish the rendered block is vs the bubble (smaller = better fit)
  const cost = (w, h) => Math.abs(Math.log((w / h) / ar)); // ratio error, scale-invariant

  // For a given number of lines, distribute words so the longest line is as short as possible:
  // greedy binary-search on the allowed line length (first-fit packing, O(words·log) per count).
  const layout = (n) => {
    let lo = Math.max(...words.map((w) => w.length)), hi = words.join(' ').length;
    let best = null;
    while (lo <= hi) {
      const cap = (lo + hi) >> 1;
      const lines = [];
      let cur = [];
      for (const w of words) {
        const joint = [...cur, w].join(' ').length;
        if (cur.length && joint > cap) { lines.push(cur); cur = [w]; } else cur.push(w);
        if (lines.length > n) break;
      }
      if (cur.length) lines.push(cur);
      if (lines.length > n) { lo = cap + 1; continue; } // too tight: lines overflow the count
      best = lines;
      hi = cap - 1; // try tighter: fewer chars per line is never worse for the max-length goal
    }
    return best;
  };

  let best = null;
  for (let n = 1; n <= Math.min(maxLines, words.length); n++) {
    const lines = layout(n);
    if (!lines) continue;
    const w = Math.max(...lines.map((l) => l.join(' ').length));
    const h = lines.length;
    const c = cost(w, h);
    if (!best || c < best.c) best = { lines, c };
  }
  return (best?.lines || [words]).map((l) => l.join(' ')).join('\n');
}

// Textless-page detector, BEFORE any API call: letter-sized ink clusters are counted on a
// downsampled grayscale of the page. Manga lettering is small, dense and sparse on the page
// (art strokes/screentone are either huge or everywhere); a text page carries many small clusters,
// a textless one carries ~none. Returns { ratio, has } - ratio = small clusters / all clusters.
//   px: { width, height, data } RGBA - any resolution (samples every 4th pixel; W*H ≈ 300k is fine)
// Thresholds tuned on the synth suite: text pages 0.36+, textless (art/screentone/noise) ≤ 0.07.
// eslint-disable-next-line no-unused-vars
function hasText(px) {
  const { width: W, height: H, data } = px;
  // luminance grid, downsampled 4x: detector quality doesn't need full resolution
  const gw = Math.max(1, W >> 2), gh = Math.max(1, H >> 2);
  const g = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = ((y * 4) * W + (x * 4)) * 4;
    g[y * gw + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  // A page's dominant tone is its "paper": white paper, toned art or a night page all keep most of
  // the grid near the paper level (letters are a small share of pixels). The 75th-brightest
  // percentile is that level - robust where a plain mean fails (a full-bleed screentone drags the
  // mean down until letters stop clearing the ink threshold).
  const sorted = Float32Array.from(g).sort();
  const paper = sorted[(sorted.length * 0.75) | 0];
  // ink both ways: dark marks on light paper AND light marks on dark paper (white lettering in
  // night/flashback bubbles)
  const ink = new Uint8Array(gw * gh);
  for (let i = 0; i < g.length; i++) ink[i] = Math.abs(g[i] - paper) > 55 ? 1 : 0;

  // connected components on the ink grid (8-neighbour flood fill, iterative)
  const label = new Int32Array(gw * gh); // 0 = unvisited
  const stack = new Int32Array(gw * gh);
  let small = 0, total = 0;
  // (density check below needs no blob list)
  // Real lettering spans a size BAND. A letter is a few grid cells; letters of a word may touch,
  // so a text blob goes up to a few letters; hand-lettered SFX can be a bit bigger still. Below
  // SMIN it's screentone dots or JPEG dust (they stay at 1-2 cells); above the caps it's art
  // strokes, panel borders or big SFX art (fine to skip: those pages have dialogue too).
  const LMAX = Math.max(6, 0.05 * Math.min(gw, gh)); // one letter ≈ ≤ 5% of the short side
  const SMAX = Math.max(16, LMAX * LMAX * 6); // ≤ ~6 letters of area
  const SMIN = 6;
  for (let sy = 0; sy < gh; sy++) for (let sx = 0; sx < gw; sx++) {
    const s0 = sy * gw + sx;
    if (label[s0] || !ink[s0]) continue;
    let sp = 0; stack[sp++] = s0; label[s0] = 1;
    let x0 = sx, y0 = sy, x1 = sx, y1 = sy, n = 0;
    while (sp) {
      const p = stack[--sp], x = p % gw, y = (p / gw) | 0;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const q = ny * gw + nx;
        if (!label[q] && ink[q]) { label[q] = 1; stack[sp++] = q; }
      }
    }
    total++;
    // Text blobs are letter-shaped, i.e. two-dimensional: a JPEG shard or a speedline fragment is
    // a thin 1-2 cell strip (measured on the JPEG test pages: 9x2, 10x2), while a glyph has real
    // extent on BOTH axes (6x7, 8x8). They are also DENSE in their box - bold strokes, fill
    // 0.35-0.95 - where tone dust and hollow art fragments sit at 0.05-0.25. Size band does the rest.
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fillRatio = n / (bw * bh);
    if (n >= SMIN && n <= SMAX && bw >= 3 && bh >= 3 && bw <= LMAX * 4 && bh <= LMAX * 4 && fillRatio >= 0.35 && fillRatio <= 0.95) small++;
  }
  // Absolute count, not a share: tone dust makes thousands of tiny blobs (each below SMIN) that
  // would drown a ratio. A real text page keeps ≥8 dense letter-band blobs even when nearby tone
  // merges some; a lone SFX or page number is skipped - the "Vẫn dịch" button covers rare misses.
  const has = small >= 8;
  return { ratio: total ? small / total : 0, small, total, has };
}
