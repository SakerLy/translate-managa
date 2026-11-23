// The translation queue (background.js): the page on screen must not wait behind pages read ahead.
// User report: the visible page's missing bubbles were only translated after the NEXT pages were done - its
// missed-text (crop) call was not urgent and queued behind them, with both run slots busy.
const ROOT = require('path').join(__dirname, '..', '..');
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');

const store = {};
const local = { get: async (k) => (k === null ? { ...store } : Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]]))),
  set: async (o) => { Object.assign(store, o); }, remove: async () => {} };
const ctx = { btoa, AbortSignal, URL, crypto, TextEncoder, console, setTimeout, clearTimeout,
  chrome: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } }, storage: { local } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'manga-dich/background.js'), 'utf8'), ctx);

// stand-in API: every job stays "in flight" until the test releases it, and records when it started
const started = [], release = new Map();
vm.runInContext('translateJob = (job) => new Promise((res) => __jobStarted(job.key, res))', Object.assign(ctx, {
  __jobStarted: (key, res) => { started.push(key); release.set(key, () => res({ bubbles: [] })); },
}));
const enqueue = vm.runInContext('enqueue', ctx), QMAX = vm.runInContext('QMAX', ctx);
const job = (key) => ({ key, glossary: '' });
const tick = () => new Promise((r) => setTimeout(r, 10));

(async () => {
  // the visible page and the next page take both normal slots; two more pages wait
  for (const k of ['page1-visible', 'page2-ahead', 'page3-ahead', 'page4-ahead']) enqueue(k, job(k), k.includes('visible'), () => {});
  await tick();
  assert.deepEqual(started, ['page1-visible', 'page2-ahead'], `${QMAX} slots taken by the first two pages`);

  // the visible page's missed-text crop arrives: it runs NOW in the spare slot, ahead of pages 3 and 4
  enqueue('page1-crop', job('page1-crop'), true, () => {});
  await tick();
  assert.deepEqual(started, ['page1-visible', 'page2-ahead', 'page1-crop'], 'urgent crop starts at once');

  // a second urgent job does not get a 4th slot: it goes first in line instead
  enqueue('plus-press', job('plus-press'), true, () => {});
  await tick();
  assert.equal(started.length, 3, 'never more than QMAX + 1 in flight');
  release.get('page2-ahead')();
  await tick();
  assert.equal(started[3], 'plus-press', 'freed slot goes to the waiting urgent job before later pages');

  // normal work never uses the spare slot
  for (const k of ['page1-visible', 'page1-crop', 'plus-press']) release.get(k)();
  await tick();
  assert.deepEqual(started.slice(4), ['page3-ahead', 'page4-ahead']);
  console.log('queue OK');
})().catch((e) => { console.error(e); process.exit(1); });
