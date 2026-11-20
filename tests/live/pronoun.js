// Real run: does the polish pass pick the right Vietnamese pronouns from context? Each case is one page of
// drafts with a known correct pair; checked by regex on the rewritten lines. Needs GEMINI_API_KEY in .env.
//   node tests/live/pronoun.js [model] [runs]
const ROOT = require('path').join(__dirname, '..', '..'); // repo root: .env, manga-dich/, tests/fixtures/
const fs = require('fs'), vm = require('vm'), path = require('path');
for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) process.env[m[1]] = m[2]; }
const [MODEL = 'gemini-flash-lite-latest', RUNS = '2'] = process.argv.slice(2);
const ctx = { fetch, btoa, AbortSignal, URL, crypto, TextEncoder, setTimeout, clearTimeout, console,
  chrome: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } }, storage: { local: { get: async () => ({}), set: async () => {} } } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'manga-dich/background.js'), 'utf8'), ctx);
const polish = vm.runInContext('polish', ctx);
// PROVIDER=custom uses CUSTOM_API_KEY + CUSTOM_BASE_URL (a gateway) instead of Gemini
const PROV = process.env.PROVIDER || 'gemini';
const P = vm.runInContext('providerFor', ctx)(PROV, PROV === 'custom' ? process.env.CUSTOM_BASE_URL : undefined);
const KEY = PROV === 'custom' ? process.env.CUSTOM_API_KEY : process.env.GEMINI_API_KEY;

// whole Vietnamese words only ("anh" must not match "Khanh"/"xanh", "bạn" must not match "bạn của Mio")
const w = (alts) => new RegExp(`(?<!\\p{L})(${alts})(?!\\p{L})`, 'iu');
const ANY = /./;
// [name, bubbles (src, who, draft), glossary, context (previous page), checks: [line index, must match, must NOT match]]
const CASES = [
  ['mẹ của bạn ↔ nam sinh', [
    { src: '¿Eres amigo de Mio? Pasa, pasa.', who: 'phụ nữ trung niên (mẹ của Mio) → nam sinh', draft: 'Bạn là bạn của Mio à? Vào đi, vào đi.' },
    { src: 'Sí, perdone la molestia.', who: 'nam sinh → phụ nữ trung niên (mẹ của Mio)', draft: 'Vâng, xin lỗi vì đã làm phiền.' }],
    '', '', [[0, w('cháu'), /^bạn|cậu/i], [1, w('cháu|cô'), w('tớ|cậu|tôi')]]],
  ['anh trai ↔ em gái nhỏ', [
    { src: 'Onii-chan, ¿me compras un helado?', who: 'em gái nhỏ (~7) → anh trai (học sinh)', draft: 'Anh trai, bạn mua cho tôi kem không?' },
    { src: 'Solo uno, ¿eh?', who: 'anh trai → em gái nhỏ', draft: 'Chỉ một cái thôi, hả?' }],
    '', '', [[0, w('anh|anh hai'), w('bạn|tôi')], [1, ANY, w('bạn|cậu')]]],
  ['nhân viên nữ trẻ ↔ sếp nữ', [
    { src: 'Jefa, ya terminé el informe.', who: 'nhân viên nữ (~23) → sếp nữ (~40)', draft: 'Sếp, tôi đã hoàn thành báo cáo.' },
    { src: 'Buen trabajo. Puedes irte a casa.', who: 'sếp nữ (~40) → nhân viên nữ (~23)', draft: 'Làm tốt lắm. Bạn có thể về nhà.' }],
    '', '', [[0, w('em|chị|sếp'), w('tớ|bạn')], [1, w('em|cô'), w('bạn|cậu')]]],
  ['thanh niên lạ ↔ cụ ông', [
    { src: 'Disculpe, ¿sabe dónde está la estación?', who: 'thanh niên (~20) → cụ ông (~75, người lạ)', draft: 'Xin lỗi, bạn có biết nhà ga ở đâu không?' },
    { src: 'Sigue recto, muchacho.', who: 'cụ ông → thanh niên', draft: 'Cứ đi thẳng, chàng trai.' }],
    '', '', [[0, w('ông|bác|cụ|cháu'), w('bạn|anh')], [1, ANY, w('bạn')]]],
  ['bạn thân cãi nhau', [
    { src: '¡Cállate! ¡Tú no sabes nada de mí!', who: 'nam sinh A (giận) → nam sinh B (bạn thân)', draft: 'Im đi! Bạn không biết gì về tôi cả!' }],
    'Kenta ↔ Ryo (bạn thân): Kenta xưng tớ gọi Ryo là cậu; Ryo xưng tớ gọi Kenta là cậu', '', [[0, w('mày|cậu'), w('bạn|tôi')]]],
  ['hiệp sĩ ↔ vua', [
    { src: 'Su Majestad, el enemigo se acerca.', who: 'hiệp sĩ → nhà vua', draft: 'Thưa Bệ hạ, kẻ thù đang đến gần.' },
    { src: 'Prepara a tus hombres.', who: 'nhà vua → hiệp sĩ', draft: 'Hãy chuẩn bị người của bạn.' }],
    '', '', [[0, /bệ hạ/i, w('bạn')], [1, ANY, w('bạn|anh')]]],
  ['bé tự xưng bằng tên', [
    { src: '¡Hina también quiere ir!', who: 'cô bé (~6, tên Hina) → chị gái (học sinh)', draft: 'Hina cũng muốn đi!' }],
    '', '', [[0, w('Hina|em'), w('tôi|tớ')]]],
  ['giới tính từ đuôi chữ', [
    { src: '¿Estás cansada? Te ves pálida.', who: 'nam sinh → bạn cùng lớp', draft: 'Bạn mệt à? Trông bạn xanh xao.' }],
    '', '', [[0, w('cậu'), w('bạn|anh')]]],
  ['tụi mình / chúng tôi', [
    { src: 'Nosotros ya nos vamos. Ustedes quédense aquí.', who: 'nam sinh (nhóm bạn) → hai bạn cùng lớp khác', draft: 'Chúng tôi đi đây. Các bạn ở lại đây.' }],
    '', '', [[0, /(tụi|bọn) (mình|tớ)|chúng tớ/i, /các bạn|chúng tôi/i]]],
  ['thầy ↔ trò', [
    { src: 'Tanaka, ¿hiciste la tarea?', who: 'thầy giáo → nam sinh Tanaka', draft: 'Tanaka, bạn đã làm bài tập chưa?' },
    { src: 'L-lo olvidé en casa...', who: 'nam sinh Tanaka → thầy giáo', draft: 'T-tôi quên ở nhà...' }],
    '', '', [[0, w('em'), w('bạn')], [1, w('em|thầy'), w('tôi|tớ')]]],
  ['senpai ↔ kouhai', [
    { src: '¡Senpai! ¿Almorzamos juntos?', who: 'nữ sinh năm nhất → nam sinh năm ba (senpai)', draft: 'Senpai! Chúng ta ăn trưa cùng nhau nhé?' }],
    '', '', [[0, w('senpai|anh|em'), w('bạn|cậu')]]],
  ['vợ chồng già', [
    { src: 'Querido, ¿ya tomaste tu medicina?', who: 'bà cụ (~70) → chồng (ông cụ)', draft: 'Anh yêu, anh đã uống thuốc chưa?' }],
    '', '', [[0, w('ông|mình'), /anh yêu/i]]],
  // ----- harder: clues only in gender endings, age gaps, conversation flow, roles -----
  ['người lạ nữ (señorita)', [
    { src: '¿Se encuentra bien, señorita?', who: 'cảnh sát (~30) → người qua đường', draft: 'Bạn có ổn không, thưa cô?' }],
    '', '', [[0, w('cô|chị|em'), w('bạn|anh')]]],
  ['khách trẻ ↔ bà chủ quán', [
    { src: 'Señora, ¿me da dos croquetas?', who: 'nam sinh (~16) → bà chủ quán (~60)', draft: 'Thưa bà, bạn có thể cho tôi hai cái croquette không?' },
    { src: '¡Claro, cariño! Aquí tienes.', who: 'bà chủ quán → nam sinh', draft: 'Tất nhiên rồi, cưng! Của bạn đây.' }],
    '', '', [[0, w('cháu|bác|bà|cô'), w('tôi|bạn')], [1, w('cháu|con'), w('bạn')]]],
  ['người nói suy ra từ mạch thoại', [
    { src: '¡Kaito! ¡La cena está lista!', who: 'mẹ → con trai Kaito (~10)', draft: 'Kaito! Bữa tối đã sẵn sàng!' },
    { src: '¡Ya voy, ya voy!', who: '', draft: 'Tôi đến đây, tôi đến đây!' }],
    '', '', [[1, w('con|vâng|dạ|ra'), w('tôi|tớ')]]],
  ['ma vương ↔ dũng sĩ', [
    { src: 'Así que por fin llegaste, héroe.', who: 'ma vương → dũng sĩ', draft: 'Vậy là cuối cùng bạn cũng đến, anh hùng.' },
    { src: '¡Hoy acabaré contigo!', who: 'dũng sĩ → ma vương', draft: 'Hôm nay tôi sẽ kết liễu bạn!' }],
    '', '', [[0, w('ngươi|mi'), w('bạn')], [1, w('ta|ngươi|mày|tao'), w('bạn')]]],
  ['nhân viên ↔ khách', [
    { src: 'Bienvenido. ¿Qué desea ordenar?', who: 'nhân viên quán cà phê (~20) → khách nam (~30)', draft: 'Chào mừng. Bạn muốn gọi gì?' }],
    '', '', [[0, w('anh|quý khách'), w('bạn')]]],
  ['trẻ kể về bố với cô giáo', [
    { src: 'Profesora, mi papá dice que hoy no vendrá.', who: 'bé trai (~8) → cô giáo', draft: 'Cô giáo, bố tôi nói rằng hôm nay ông ấy sẽ không đến.' }],
    '', '', [[0, /(bố|ba) (em|con|cháu)/i, w('tôi|ông ấy')]]],
  ['bảng cũ sai tuổi', [
    { src: 'Gracias por traer a mi hija, jovencito.', who: 'đàn ông trung niên (bố của Yui) → nam sinh', draft: 'Cảm ơn cậu đã đưa con gái tớ về.' }],
    'bố của Yui ↔ nam sinh: bố của Yui xưng tớ gọi nam sinh là cậu', '', [[0, w('chú|bác|cháu|cậu'), w('tớ')]]],
  ['thầy nói với cả lớp', [
    { src: 'Ustedes, siéntense. Empezamos.', who: 'thầy giáo → cả lớp', draft: 'Các bạn, ngồi xuống. Chúng ta bắt đầu.' }],
    '', '', [[0, /các em|cả lớp/i, /các bạn/i]]],
  ['bạn gái hơn tuổi (dẫn truyện + thoại)', [
    { src: 'Sakura Mana. Tres años mayor que yo.', who: 'dẫn truyện (Haruma, nam sinh cấp hai)', draft: 'Sakura Mana. Lớn hơn tôi ba tuổi.' },
    { src: 'Cuando empezamos a salir, ella estaba en preparatoria y yo... en secundaria.', who: 'dẫn truyện (Haruma)', draft: 'Khi chúng tôi bắt đầu hẹn hò, cô ấy học cấp ba còn tôi... học cấp hai.' },
    { src: '¡Mana-chan! ¡Perdón por hacerte esperar!', who: 'Haruma (nam sinh cấp hai) → Mana (bạn gái, nữ sinh cấp ba)', draft: 'Mana-chan! Xin lỗi vì đã để bạn đợi!' },
    { src: 'No pasa nada. Oye, Haruma-kun... ¿podrías dejar de decirme "chan"?', who: 'Mana (bạn gái, cấp ba) → Haruma (bạn trai, cấp hai)', draft: 'Không sao đâu. Này, Haruma-kun... bạn có thể đừng gọi tôi là "chan" nữa không?' }],
    '', '', [[1, w('chị ấy|chị'), w('cô ấy')], [2, w('em|chị'), w('cậu|bạn')], [3, w('em|chị|Haruma'), w('cậu|bạn|tôi')]]],
  ['thầy trò: câu sau không nhắc chức danh', [
    { src: 'Sensei...', who: 'cô gái trẻ (cựu học trò) → chàng trai (thầy giáo cũ)', draft: 'Thầy ơi...' },
    { src: "I can't believe you brought me straight to your place... Not that I mind at all.", who: 'cô gái → chàng trai', draft: 'Không ngờ cậu lại đưa tớ thẳng về nhà cậu... Tớ cũng không phiền đâu.' },
    { src: 'People will get the wrong idea and call the police.', who: 'chàng trai → cô gái', draft: 'Người ta sẽ hiểu lầm và gọi cảnh sát mất.' }],
    '', '', [[1, w('thầy|em'), w('cậu|tớ|bạn')], [2, ANY, w('cậu|tớ|bạn')]]],
  ['thầy trò: đã chốt từ trang trước', [
    { src: "Then I'll make dinner for you, okay?", who: 'cô gái → chàng trai', draft: 'Vậy tớ nấu bữa tối cho cậu nhé?' }],
    'Yui ↔ Kudo (cựu học trò ↔ thầy giáo cũ): Yui xưng em gọi Kudo là thầy; Kudo xưng thầy gọi Yui là em', 'Yui: Thầy ơi...', [[0, w('em|thầy'), w('cậu|tớ')]]],
  ['bác sĩ ↔ cụ bà', [
    { src: 'Abuela, tiene que descansar más.', who: 'bác sĩ trẻ (~30) → bệnh nhân cụ bà (~80)', draft: 'Bà ơi, bạn phải nghỉ ngơi nhiều hơn.' }],
    '', '', [[0, w('bà|cụ'), w('bạn')]]],
];

(async () => {
  let pass = 0, total = 0;
  for (const [name, bubbles, glossary, context, checks] of CASES) {
    if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
    for (let r = 0; r < +RUNS; r++) {
      let out;
      for (let t = 0; t < 6; t++) { // free tier: "high demand" 503s come and go
        out = await polish(P, KEY, MODEL, bubbles.map((b) => ({ ...b, text: b.draft })), context, glossary);
        if (!out.failed || !/demand|503|429|quota|overloaded/i.test(out.failed)) break;
        await new Promise((r) => setTimeout(r, 4000 * (t + 1)));
      }
      const lines = out.bubbles.map((b) => b.text);
      const bad = out.failed ? ['call failed: ' + out.failed.slice(0, 80)]
        : checks.filter(([i, must, not]) => !must.test(lines[i]) || not.test(lines[i])).map(([i]) => `#${i} "${lines[i]}"`);
      total++; if (!bad.length) pass++;
      console.log(bad.length ? 'FAIL' : 'ok  ', name, '|', bad.length ? bad.join(' ; ') : lines.join(' / '));
    }
  }
  console.log(`PRONOUN ${pass}/${total}`);
})();
