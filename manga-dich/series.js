// Which manga series is this page? The AI's memory (pronoun pairs, names) is kept per series, so two
// series read on the same site never share - and corrupt - each other's glossary.
// Self-contained (no outer variables): the popup runs it in the tab through chrome.scripting with `func`.
//   returns { key: 'host/series-id', label: 'readable series name' }
// eslint-disable-next-line no-unused-vars
function mdSeries(loc = location, doc = document) {
  const host = loc.hostname.replace(/^www\./, '');
  const nice = (s) => decodeURIComponent(s).replace(/\.[a-z]{3,5}$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  // 1. The reader links back to its series page (MangaDex: /title/<uuid>/<slug>, repeated in the header).
  //    The most frequent such link wins; /title/random and friends are not a series.
  const counts = new Map();
  for (const a of doc.querySelectorAll('a[href*="/title/"]')) {
    const m = (a.getAttribute('href') || '').match(/\/title\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/([^/?#]+))?/i);
    if (!m) continue;
    const c = counts.get(m[1]) || { n: 0, slug: '', text: '' };
    c.n++; c.slug ||= m[2] || ''; c.text ||= a.textContent.trim();
    counts.set(m[1], c);
  }
  const best = [...counts].sort((a, z) => z[1].n - a[1].n)[0];
  if (best) return { key: `${host}/title/${best[0].toLowerCase()}`, label: best[1].text || nice(best[1].slug) || host };
  // 2. The series in the path: /manga/one-piece/chapter-1000, /read/one-piece/1000,
  //    /one-piece-chapter-1000.html - keep the path up to the first chapter-looking segment.
  const chapter = (s) => /^(chapter|chap|ch|c|episode|ep|vol|volume)([-_.]?\d.*)?$/i.test(s) || /^\d+([._-]\d+)*$/.test(s)
    || /^[0-9a-f-]{36}$/i.test(s);
  const keep = [];
  for (const seg of loc.pathname.split('/').filter(Boolean)) {
    if (chapter(seg)) break;
    const s = seg.replace(/[-_.](chapter|chap|ch|episode|ep)[-_.]?\d.*$/i, '');
    if (s) keep.push(s.toLowerCase());
    if (s !== seg) break; // "one-piece-chapter-1000": the series ended inside this segment
  }
  const generic = /^(manga|comic|comics|series|read|reader|viewer|title|truyen|truyen-tranh|webtoon|online)$/i;
  const named = keep.filter((s) => !generic.test(s));
  if (named.length) return { key: `${host}/${keep.join('/')}`.slice(0, 160), label: nice(named[named.length - 1]) };
  // 3. Nothing recognisable: the whole site shares one memory (the old behaviour).
  return { key: host, label: host };
}
