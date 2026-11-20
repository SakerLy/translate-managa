// Which manga series is this page? The AI's memory (pronoun pairs, names) is kept per series, so two
// series read on the same site never share - and corrupt - each other's glossary.
// Self-contained (no outer variables): the popup runs it in the tab through chrome.scripting with `func`.
//   returns { key: 'host/series-id', label: 'readable series name' }
// A chapter/reader URL (MangaDex /chapter/<id>/4, /read/<slug>/12, <slug>-chapter-12.html…), as opposed
// to a home page, a series page or a search: auto-translate only runs there (live report: the home page's
// big banner was sent to the AI). Duplicated in background.js, which can't load this file.
// A function, not a const: the script is injected again on every start and a second `const` would throw.
// eslint-disable-next-line no-unused-vars
function mdIsReader(path) {
  return /\/(chapter|chap|ch|read|reader|viewer|episode|ep)(\/|[-_.]?\d)|[-_](chapter|chap|ch|episode|ep)[-_.]?\d/i.test(path);
}

// eslint-disable-next-line no-unused-vars
function mdSeries(loc = location, doc = document) {
  const host = loc.hostname.replace(/^www\./, '');
  const nice = (s) => decodeURIComponent(s).replace(/\.[a-z]{3,5}$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const isId = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || /^\d+$/.test(s);
  // The series name as the tab shows it: "7 | Chapter 6 - Sangeki - MangaDex" -> "Sangeki". Parts that are the
  // site, a chapter/volume/page marker or a bare number are dropped; the longest part left is the series.
  const siteWords = host.split('.')[0].toLowerCase();
  const fromTitle = () => {
    const parts = String(doc.title || '').split(/\s+[|–—-]\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean)
      .filter((p) => p.toLowerCase().replace(/\s+/g, '') !== siteWords && !/^(read\s+)?(ch(apter)?|chap|vol(ume)?|ep(isode)?|page|trang|chương)\b[\s.\d:-]*/i.test(p) && !/^[\d\s./:-]+$/.test(p));
    return parts.sort((a, z) => z.length - a.length)[0] || '';
  };
  // A link's own text is the cleanest when it is short: cards also carry tags and a blurb glued on
  // ("…Natta no ka?SuggestiveComedyRomance…", live report) - so the shortest real text wins.
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const pick = (texts) => texts.map(clean).filter((t) => t.length >= 2 && t.length <= 150 && !isId(t)).sort((a, z) => a.length - z.length)[0] || '';
  // 1. The reader links back to its series page (MangaDex: /title/<uuid>/<slug>, repeated in the header).
  //    The most frequent such link wins; /title/random and friends are not a series.
  const counts = new Map();
  for (const a of doc.querySelectorAll('a[href*="/title/"]')) {
    const m = (a.getAttribute('href') || '').match(/\/title\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/([^/?#]+))?/i);
    if (!m) continue;
    const c = counts.get(m[1]) || { n: 0, slug: '', texts: [] };
    c.n++; c.slug ||= m[2] || '';
    c.texts.push(a.getAttribute('title') || '', a.textContent);
    counts.set(m[1], c);
  }
  const best = [...counts].sort((a, z) => z[1].n - a[1].n)[0];
  if (best) {
    const label = (mdIsReader(loc.pathname) && fromTitle()) || pick(best[1].texts) || (best[1].slug && !isId(best[1].slug) ? nice(best[1].slug) : '') || fromTitle() || host;
    return { key: `${host}/title/${best[0].toLowerCase()}`, label };
  }
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
  if (named.length) return { key: `${host}/${keep.join('/')}`.slice(0, 160), label: fromTitle() || nice(named[named.length - 1]) };
  // 3. Nothing recognisable: the whole site shares one memory (the old behaviour). The page asks the
  //    background for the site's own answer first (MangaDex API) - see content.js seriesNow().
  return { key: host, label: host };
}
