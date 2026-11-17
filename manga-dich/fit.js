// Fits each translation box to the real speech bubble under it, using the page's own pixels.
// Works for any bubble shape (round, square, cloud, dark/colored): it floods the bubble's background
// colour from the model's box, stops at the outline, then covers all original text ink found inside.
// Pure function (no DOM) so it runs in the page and in Node tests alike.
//   px: { width, height, data: RGBA Uint8ClampedArray }   bubbles: [{ x, y, w, h, ... }] in % of the image
//   returns the same bubbles with x/y/w/h adjusted plus bg (css colour) and fg (text colour)
// eslint-disable-next-line no-unused-vars
function fitBubbles(px, bubbles) {
  const { width: W, height: H, data } = px;
  const at = (x, y) => (y * W + x) * 4;
  const TOL = 60; // max RGB distance still counted as "bubble background"

  // most common colour inside the model's box (text strokes are the minority)
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
  const boxes = bubbles.map(toPx);
  const centres = boxes.map(([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2]);
  // A letter belongs to the bubble whose box owns its centre (seen in a real run: growth crossed
  // into the neighbouring bubble's text). When two model boxes overlap — both aimed at the same
  // bubble after a merge miss — the NEARER box wins, so the duplicate can't grow on the same ink
  // and stays visibly empty instead of covering the twin's translation.
  const othersOwn = (me, cx, cy) => boxes.some((o, j) => j !== me && cx >= o[0] && cx < o[2] && cy >= o[1] && cy < o[3]
    && (Math.hypot(cx - centres[j][0], cy - centres[j][1]) <= Math.hypot(cx - centres[me][0], cy - centres[me][1])));
  const CHAR = Math.max(12, 0.08 * Math.min(W, H)); // bigger than this in either direction = not a letter
  const G = Math.max(4, Math.round(0.012 * Math.min(W, H))); // join distance for letters of the same text
  const P = 2;

  // Ink blobs (connected non-background pixels) in a window. Letters are small blobs; bubble outlines,
  // panel borders and artwork are big ones. Bubbles that spill over panel borders are common in manga,
  // so this doesn't need the bubble to be a closed shape.
  const lettersIn = (me, bg, wx0, wy0, wx1, wy1) => {
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
    return blobs.filter((bl) => !bl.edge && bl.x1 - bl.x0 < CHAR && bl.y1 - bl.y0 < CHAR
      && !othersOwn(me, (bl.x0 + bl.x1) / 2, (bl.y0 + bl.y1) / 2));
  };

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
    return [Math.max(0, x0 - P), Math.max(0, y0 - P), x1 + P, y1 + P];
  };

  return bubbles.map((b, me) => {
    const [bx0, by0, bx1, by1] = boxes[me];
    if (bx1 - bx0 < 4 || by1 - by0 < 4) return b;
    const bg = bgOf(bx0, by0, bx1, by1);
    const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
    const style = { bg: `rgb(${bg[0]},${bg[1]},${bg[2]})`, fg: lum < 110 ? '#fff' : '#111' };

    // A box over 8% of the page is already a model mistake (largest real bubble on the test page: 3.4%):
    // growing it would follow hair/screentone into the art. Try to shrink it to the text cluster inside
    // instead — the model aims its centre at the text even when the box is way too big — and keep the
    // model's box only if no plausible cluster is found.
    const shrink = () => {
      const mx = Math.round((bx1 - bx0) * 0.8), my = Math.round((by1 - by0) * 0.8);
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
      const [x0, y0, x1, y1] = grow(letters, seed.x0, seed.y0, seed.x1 + 1, seed.y1 + 1);
      if ((x1 - x0) * (y1 - y0) > 0.08 * W * H || letters.filter((bl) => bl.used).length < 3) return null;
      return { fit: 'shrink', x: x0 / W * 100, y: y0 / H * 100, w: (x1 - x0) / W * 100, h: (y1 - y0) / H * 100 };
    };
    if ((bx1 - bx0) * (by1 - by0) > 0.08 * W * H) return { ...b, ...style, ...(shrink() || { fit: 'kept' }) };

    const mx = Math.round((bx1 - bx0) * 0.8), my = Math.round((by1 - by0) * 0.8);
    const wx0 = Math.max(0, bx0 - mx), wy0 = Math.max(0, by0 - my), wx1 = Math.min(W, bx1 + mx), wy1 = Math.min(H, by1 + my);
    const letters = lettersIn(me, bg, wx0, wy0, wx1, wy1);
    const [x0, y0, x1, y1] = grow(letters, bx0, by0, bx1, by1);
    // runaway guard: a fit more than 2x the model's box means we followed artwork, not letters
    if ((x1 - x0) * (y1 - y0) > 2 * (bx1 - bx0) * (by1 - by0)) return { ...b, ...style, ...(shrink() || { fit: 'kept' }) };
    return { ...b, ...style, fit: 'letters', x: x0 / W * 100, y: y0 / H * 100, w: (x1 - x0) / W * 100, h: (y1 - y0) / H * 100 };
  });
}
