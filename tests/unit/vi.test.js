// A chapter already in Vietnamese is not translated (background.js viPage): the model's "src" lines tell.
// Spanish/Portuguese/French accents must not pass for Vietnamese.
const ROOT = require('path').join(__dirname, '..', '..');
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { btoa, AbortSignal, URL, crypto, TextEncoder, console, setTimeout, clearTimeout,
  chrome: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } }, storage: { local: { get: async () => ({}), set: async () => {} } } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'manga-dich/background.js'), 'utf8'), ctx);
const viPage = vm.runInContext('viPage', ctx);
const page = (...src) => src.map((s) => ({ src: s, text: s }));

assert.equal(viPage(page('Cậu định đi đâu vậy?', 'Tôi cũng chỉ nghe loáng thoáng thôi.', 'Thôi nào')), true, 'Vietnamese scanlation');
assert.equal(viPage(page('¿Qué está pasando aquí?', 'No sé, mamá. Está raro.', 'Vámonos ya.')), false, 'Spanish accents');
assert.equal(viPage(page('Não sei, você é louca!', 'Ótimo, vamos lá.')), false, 'Portuguese accents');
assert.equal(viPage(page('À bientôt, mon frère.', 'Ça va très bien.')), false, 'French accents');
assert.equal(viPage(page('WHERE ARE YOU GOING?', 'I only heard about it in passing.')), false, 'English');
assert.equal(viPage(page('Á!', 'Hả?')), false, 'one-word exclamations prove nothing');
assert.equal(viPage([{ src: 'Rầm rầm', text: 'Rầm rầm', sfx: true }, ...page('Where is he?', 'Over there!')]), false, 'a Vietnamese SFX on an English page');
console.log('vi OK');
