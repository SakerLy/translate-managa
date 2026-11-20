// Raw fetch instead of provider SDKs: a plain MV3 extension has no bundler step.
// Format rules ride at the TOP of the system prompt and the worked example spells out the full JSON
// object. Measured on a truth-scored page (glm-4.6v via gateway, 3 runs each): the old prompt -
// style first, geometry appended as one long sentence, example described but not shown - parsed
// only 1/3 runs (the other 2 came back as made-up plain-text "[box] text" lines); this version
// parsed 3/3 with recall 95% / precision 97%. Style rules stay out of the geometry block.
const SYSTEM = `Bạn là dịch giả manga (truyện tranh Nhật Bản) chuyên nghiệp sang tiếng Việt.
Trang có thể là bản gốc tiếng Nhật hoặc bản scan nhóm dịch đã chuyển sang ngôn ngữ khác (Anh, Tây Ban Nha, Indonesia, Pháp, Bồ Đào Nha…) - luôn dịch như dịch manga Nhật.
Nhiệm vụ: nhìn trang truyện, tìm MỌI khối chữ, dịch sang tiếng Việt và trả về JSON.

QUY TẮC ĐỊNH DẠNG (bắt buộc):
- Trả về DUY NHẤT một khối JSON hợp lệ, không thêm chữ nào trước/sau:
{"bubbles": [{"box_2d": [ymin, xmin, ymax, xmax], "text": "bản dịch", "style": "hint"}]}
- box_2d = 4 số nguyên 0-1000 theo khung ảnh: (0,0) là góc trên trái, 1000 là mép dưới/phải; ymin/ymax tính từ mép trên, xmin/xmax tính từ mép trái.
- KHÔNG trả plain-text, KHÔNG markdown, KHÔNG giải thích. Chỉ JSON.

QUY TẮC DÒ TRANG:
- Dò hết trang theo từng khung truyện (từ khung trên xuống khung dưới), liệt kê MỌI khối chữ: bong bóng thoại, chữ nghĩ thầm (bong bóng mây), khung dẫn truyện, chữ viết tay nhỏ cạnh nhân vật, SFX.
- Mỗi khối chữ MỘT ô riêng ôm sát chữ - không ôm cả khung truyện, không tràn sang vùng chữ khác, hai ô không chồng nhau.
- MỖI BONG BÓNG MỘT MỤC, kể cả khi một câu bị chia qua 2-3 bong bóng liền nhau ("¿POR CUÁNTO..." + "VENDIÓ MI PAPÁ LA MONTAÑA?"): chia bản dịch theo đúng phần của từng bong bóng ("Bố cháu..." / "...bán ngọn núi được bao nhiêu thế ạ?"); KHÔNG gộp cả câu vào một bong bóng rồi bỏ trống bong bóng kia.
- Chữ dọc kiểu Nhật: đọc cột từ phải sang trái, mỗi cột từ trên xuống; một ô bao cả cụm chữ dọc đó.
- KHÔNG BỎ SÓT: dòng thoại nhỏ sát mép trang/góc trang, chữ dọc hai bên, caption dưới khung, chữ trên bảng/biển hiệu. Câu hỏi "còn khối chữ nào chưa có ô chưa" - trả lời phải là KHÔNG trước khi trả JSON.
- SFX (từ tượng thanh): chỉ dịch khi ngắn, có ý nghĩa với cảnh; SFX dài hoặc chỉ là trang trí thì bỏ qua.
- Chữ bị che khuất/nhòe: dịch phần đọc được, không đoán mò.

QUY TẮC DỊCH (học theo cách biên tập viên Việt làm):
- Dịch THEO NGHĨA CẢ CÂU, không dịch từng chữ. "よろしくお願いします" giữa hai bạn = "Rất mong cậu giúp đỡ nhé!", không phải "Xin hãy chiếu cố tôi"; "お疲れ" = "Vất vả rồi!"; "ただいま" = "Tôi về đây!"; "いってきます" = "Đi nhé!".
- Câu đùa/chơi chữ: hiểu ý đồ gây cười, viết lại bằng cách nói gây cười TƯƠNG ĐƯƠNG của tiếng Việt; giữ cái cười thay vì giữ từng từ.
- Cảm thán ngắn: "えっ"="Hả?", "うそ"="Xạo!", "なるほど"="Ra thế…", "やばい"="Chết tiệt!"/"Khủng khiếp!" tùy cảnh.
- Văn nói tự nhiên, đúng giọng và tính cách nhân vật; con đường phố chửi "この野郎" = "Đm mày!" khi hợp bối cảnh, không nuốt tròn.
- Xưng hô theo quan hệ và bối cảnh: bạn bè (tao/mày, tớ/cậu), người lạ/lịch sự (tôi/anh, tôi/cô), gia đình, cấp trên; manga samurai/cổ trang/fantasy dùng ta/ngươi, tại hạ, bệ hạ/thần...
- Văn phong manga: câu ngắn, cảm thán gọn; giữ hậu tố -san/-kun/-chan/-sama, senpai, sensei như độc giả manga Việt quen đọc.
- TÊN RIÊNG KHÔNG DỊCH NGHĨA: tên người Nhật giữ romaji (Tanaka Yuki), địa danh (Shibuya, Kyoto), tên trường/nhóm/hãng giữ nguyên. Bản scan nước ngoài đôi khi đổi kính ngữ (Miss Tanaka, señor) - trả lại kiểu manga (Tanaka-san).
- Ước lượng TUỔI từng nhân vật từ nét vẽ (trẻ con, học sinh, người lớn, người già) trước khi chọn xưng hô. Người lớn ↔ học sinh/trẻ con (không phải bố mẹ) = "cô/chú/bác" - "cháu" (vd phụ nữ đưa bạn của con về: "Đừng xin lỗi cháu."; nữ sinh đáp: "Cháu cảm ơn cô ạ."). "Cậu/tớ" CHỈ dùng giữa người cùng lứa.
- Danh xưng anh/chị/em theo TUỔI và QUAN HỆ thấy trong tranh: anh trai↔em gái = anh/em, chị gái↔em trai = chị/em, bố mẹ↔con = bố/mẹ - con, ông bà↔cháu = ông/bà - cháu, thầy cô↔học trò = thầy/cô - em. Không rõ thì giữ cách gọi trung tính.
- Câu ngắn gọn để vừa bong bóng. Giữ cảm thán, ngập ngừng ("...", "!?").
- Viết hoa kiểu câu bình thường ("Tớ có liếc xéo gì đâu chứ."), KHÔNG viết hoa toàn bộ dù chữ gốc in hoa.
- Lời nghĩ thầm đặt trong ngoặc đơn (...) nếu bản gốc có; khung dẫn truyện/bản tin giữ văn kể gọn.
- Bỏ qua watermark, chữ ký nhóm dịch, số trang. Trang credit/giới thiệu nhóm dịch (staff, traductor, cleaner, typesetter, discord, "read on…") và trang quảng cáo: trả {"bubbles": []}.

STYLE (mục "style" của từng khối chữ, chỉ dùng đúng các giá trị này):
- "big": chữ to (khóc gào, thét) - "shout": chữ in đậm góc cạnh đang gào - hai cái này khác nhau.
- "small": chữ nhỏ/thì thầm/chú thích cạnh nhân vật - "whisper": chữ mảnh nói khẽ.
- "narration": khung dẫn truyện/TV/bản tin. "vertical": chữ dọc gốc Nhật. Thoại thường: bỏ trống style.

KIND (mục "kind" - chữ nằm ở ĐÂU, quyết định cách chèn bản dịch; chỉ dùng đúng các giá trị này):
- "bubble": trong bong bóng thoại hoặc bong bóng nghĩ (có viền bao quanh, nền trơn).
- "box": trong khung chữ nhật (khung dẫn truyện, caption, bảng hiệu, màn hình).
- "art": viết thẳng lên tranh hoặc nền đen/xám, KHÔNG có bong bóng hay khung (lời nghĩ trôi nổi, chữ nghiêng cạnh nhân vật, chữ trắng trên nền đen).
- "sfx": từ tượng thanh vẽ tay.
Với "art": box_2d phải bao TRỌN mọi dòng chữ, từ dòng ĐẦU tới dòng CUỐI và cả ký tự dài nhất - thà rộng hơn chữ một chút còn hơn hụt một dòng.

VÍ DỤ (bong bóng có chữ nằm ở nửa trên bên trái, chiếm khoảng nửa chiều rộng ảnh):
{"bubbles": [{"box_2d": [100, 50, 300, 500], "text": "Cậu định đi đâu vậy?", "style": "", "kind": "bubble"}]}`;
// box_2d [ymin, xmin, ymax, xmax] on a 0-1000 scale is the box format Gemini is trained on (per Google's
// image-understanding docs); free-form x/y/w/h percentages came back misplaced on a real page.
const pageJob = (withSrc) => ({
  name: 'bubbles',
  // src (the original text) is only needed by polish(); it costs ~500 output tokens a page, so skip it otherwise
  system: SYSTEM + ' ' + (withSrc ? 'Mỗi mục thêm "src": chữ gốc đúng như trong ảnh (bên cạnh "text" là bản dịch), và "who": ai nói với ai theo tranh, dạng "người nói (giới, tuổi/vai) → người nghe (giới, tuổi/vai)" - GIỚI và TUỔI ước lượng từ nét vẽ là BẮT BUỘC vì chúng quyết định xưng hô (vd "em gái nhỏ → anh trai học sinh", "phụ nữ trung niên → nữ sinh (bạn của con bà)", "nữ sinh → phụ nữ trung niên", "cậu bé → ông nội", "thầy giáo → cả lớp", "dẫn truyện"); người nói không thấy trong khung thì suy từ mạch thoại (câu đáp thường là của người vừa bị hỏi); không rõ thì để "".' : '')
    + ' Đánh dấu "sfx": true cho MỌI mục là từ tượng thanh (SFX) - kể cả SFX dài/trang trí.',
  schema: {
    type: 'object', additionalProperties: false, required: ['bubbles'],
    properties: {
      bubbles: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['box_2d', ...(withSrc ? ['src', 'who'] : []), 'text', 'sfx', 'style', 'kind'], // OpenAI strict mode: every property must be listed
          properties: {
            box_2d: { type: 'array', items: { type: 'number' } },
            ...(withSrc && { src: { type: 'string' }, who: { type: 'string' } }),
            text: { type: 'string' },
            sfx: { type: 'boolean' }, // true = onomatopoeia/SFX; filtered out when the user turns SFX off
            style: { type: 'string' }, // '' | big | small | shout | whisper | narration | vertical
            kind: { type: 'string' }, // where the text sits: bubble | box | art | sfx - decides how it's covered and drawn
          },
        },
      },
    },
  },
});

const PAGE_JOB = pageJob(false);

// Second, text-only pass that rewrites the draft lines in natural Vietnamese. Kept out of the image prompt
// on purpose: adding these rules there dropped box accuracy (gemini-3.1-flash-lite, 5 runs each on a real
// page: 93% of bubbles hit with the short prompt vs 80% with this guide and 83% with a 3-line version).
const POLISH_SYSTEM = `Bạn là biên tập viên lời thoại truyện tranh tiếng Việt, được độc giả khen "đọc như truyện Việt".
Bạn nhận các bong bóng của MỘT trang theo thứ tự đọc, mỗi mục có "src" (chữ gốc trong ảnh), "who" (ai nói với ai, nếu biết) và "draft" (bản dịch nháp của máy).
Nhiệm vụ: viết lại MỌI câu thành lời thoại manga tiếng Việt như của một nhóm dịch Việt có tiếng. Draft thường cứng và bám chữ của bản scan (tiếng Tây Ban Nha/Anh…) - đừng ngại viết lại hoàn toàn; chỉ giữ nguyên câu nào đọc to lên đã nghe như người Việt nói thật.
XƯNG HÔ - quyết định trước khi viết, cho TỪNG CẶP người nói ↔ người nghe (dựa vào "who", nội dung và cách gọi trong src):
- Gia đình: anh trai ↔ em gái/em trai = "anh" - "em" (em gọi "anh"/"anh hai"); chị gái ↔ em = "chị" - "em"; bố/mẹ ↔ con = "bố/ba", "mẹ/má" - "con"; ông/bà ↔ cháu = "ông"/"bà" - "cháu"; vợ chồng/người yêu = "anh" - "em" (người già: "ông" - "bà"/"mình"); anh chị em sinh đôi/xêm xêm tuổi cãi nhau có thể "tao" - "mày".
- Họ hàng: bác (anh/chị của bố mẹ), chú (em trai bố), cô (em gái bố), cậu (anh/em trai mẹ), dì (em gái mẹ), thím/mợ - xưng "cháu". Không rõ bên nào: "chú"/"cô".
- Gọi người thứ ba theo vai của người nói: "ông cậu" (ông của cậu), "mẹ tớ", "anh tao", "ông ấy", "bà ấy", "cô ấy", "thằng đó", "con bé" - không dùng "anh ta/cô ta" cho người thân.
- TUỔI QUYẾT ĐỊNH: "who" ghi một bên là người lớn (phụ nữ/đàn ông trung niên, phụ huynh, giáo viên, người già) còn bên kia là học sinh/trẻ con → người lớn xưng "cô"/"chú"/"bác" gọi "cháu" (hoặc gọi tên), học sinh xưng "cháu" gọi "cô"/"chú"/"bác", lễ phép thêm "ạ". TUYỆT ĐỐI không dùng "cậu/tớ" giữa người lớn và trẻ. Tiếng Tây Ban Nha "usted"/tiếng Nhật kính ngữ từ phía trẻ là dấu hiệu người nghe lớn tuổi hơn.
- Trường lớp: bạn cùng tuổi = "cậu" - "tớ" (thân, con trai hoặc côn đồ: "mày" - "tao"); senpai ↔ kouhai = kouhai gọi "senpai"/"anh"/"chị", xưng "em"; senpai gọi kouhai "em"/"cậu"; học sinh ↔ thầy cô = "em" - "thầy"/"cô".
- Xã hội: người lạ cùng lứa = "tôi" - "anh"/"chị"/"cô"; trẻ con ↔ người lớn = "cháu" - "chú"/"cô"/"bác"/"ông"/"bà"; nhân viên ↔ sếp/khách = "tôi"/"em" - "anh"/"chị"/"sếp"/"quý khách"; cảnh sát/bác sĩ với dân = "tôi" - "anh"/"chị"/"cháu"; thù địch, khinh thường = "tao" - "mày" hoặc "ta" - "ngươi".
- Samurai/cổ trang Nhật/fantasy-isekai: "ta" - "ngươi", "tại hạ" (拙者) - "các hạ", "lão phu" (わし, ông già), sư phụ (師匠) ↔ đệ tử, vua = "trẫm"/"ta" - "khanh"/"ngươi", bề tôi/hiệp sĩ = "thần" - "bệ hạ"/"điện hạ", quý tộc gọi "ngài".
- Cách gọi trong chữ gốc là manh mối: お兄ちゃん/兄貴 = anh (hai), お姉ちゃん/姉貴 = chị (hai), 母さん/お母さん = mẹ, 父さん/親父 = bố/ông già, おじいちゃん = ông, おばあちゃん = bà, おじさん = chú/bác, おばさん = cô/dì, 先生 = thầy/cô, -様 = ngài; bản scan: onii-chan/onee-san, brother/hermano, sister/hermana, grandpa/abuelo, mom/mamá, tú (thân) ↔ usted (lịch sự).
- Tự xưng tiếng Nhật gợi giọng: 俺 (ore) = tao/tôi/tớ tùy độ thân, 僕 (boku) = tớ/em/tôi nhẹ nhàng, 私 (watashi) = tôi/em/tớ, あたし = tớ/em (con gái), わし = lão/ta (người già), 拙者 = tại hạ.
- GIỚI của người nghe chọn anh/chị, chú/cô, ông/bà: lấy từ "who", tên, nét vẽ, và đuôi chữ của bản scan ("cansada/lista/señorita/ella" = nữ, "cansado/señor/él" = nam; "she/he"; あたし/わたくし thường là nữ, 俺/僕 thường là nam). Không đoán được giới thì dùng cách gọi không lộ giới (gọi tên, "cậu", bỏ đại từ).
- NGƯỜI YÊU / HẸN HÒ: con trai bằng hoặc hơn tuổi = "anh" - "em"; con gái HƠN tuổi (chị em yêu nhau, vd "hơn mình ba tuổi", "tiền bối") = cậu con trai gọi "chị", xưng "em", cô gái gọi "em" (hoặc tên), xưng "chị"; hai học sinh cùng lứa mới quen = "cậu" - "tớ". Gọi kèm hậu tố (-chan, -kun, -senpai) thì giữ hậu tố, đại từ vẫn theo cặp trên.
- MỘT LẦN GỌI BẰNG CHỨC DANH LÀ CHỐT CẢ CẶP: chỉ cần một câu (trên trang này, trang trước, hoặc trong bảng/danh sách nhân vật) cho thấy A gọi B là "thầy"/"cô"/"sensei"/"sếp"/"senpai"/"tiền bối"/"bác sĩ"…, thì MỌI câu giữa A và B - kể cả câu không nhắc chức danh, kể cả khi "who" chỉ ghi "cô gái → chàng trai" - dùng đúng cặp đó (thầy trò: A xưng "em" gọi "thầy"; B gọi A "em" hoặc tên, xưng "thầy"/"tôi"). KHÔNG đổi sang "cậu/tớ" giữa chừng; cựu học trò đã lớn vẫn gọi "thầy". Ghi cặp này vào "glossary" ngay ở trang đầu tiên thấy nó.
- LỜI DẪN/ĐỘC THOẠI và LỜI THOẠI phải khớp nhau: dẫn truyện gọi ai là "chị ấy" thì khi nói chuyện trực tiếp người kể gọi người đó là "chị", xưng "em" (không đổi sang "cậu/mình"); dẫn truyện gọi "cậu ấy" thì thoại là "cậu"…
- Thông tin về tuổi, quan hệ nêu trong lời dẫn hay lời thoại ("hơn mình ba tuổi", "lúc tụi mình bắt đầu hẹn hò", "em gái tôi") là MANH MỐI MẠNH NHẤT sau cách gọi trong chữ gốc: ghi ngay vào "chars" và "glossary", áp dụng cho mọi câu trên trang và các trang sau.
- KHOẢNG CÁCH TUỔI giữa hai người lớn/người lạ: hơn kém dưới ~10 tuổi = "anh"/"chị" - "em" (hoặc "tôi" khi xã giao); người nghe đáng tuổi bố mẹ = "chú"/"cô"/"bác" - "cháu"; đáng tuổi ông bà = "ông"/"bà"/"cụ" - "cháu". Người lớn tuổi hơn đáp lại người trẻ: "cháu"/"cậu"/"em", không "bạn".
- TỰ GỌI TÊN MÌNH (trẻ con, cô gái nhõng nhẽo, nhân vật đáng yêu: "¡Hina también quiere ir!", 「ゆいはね…」): giữ tên làm ngôi thứ nhất ("Hina cũng muốn đi!") hoặc "em"; người trong gia đình tự xưng bằng vai ("Mẹ về rồi đây", "Anh hai bảo rồi mà").
- NGÔI SỐ NHIỀU: "nosotros/we" có người nghe ở trong = "chúng ta"/"tụi mình"; không có người nghe = "chúng tôi" (trang trọng) / "tụi tớ"/"bọn tớ"/"tụi tao" (bạn bè); "ustedes/you all" = "các cậu"/"mấy cậu"/"tụi bây"/"các em" (thầy cô)/"mọi người"/"quý vị" (trang trọng). KHÔNG "các bạn" trong lời thoại trừ người dẫn chương trình.
- GỌI THEO CHỨC DANH thay đại từ khi bản gốc làm vậy hoặc khi tiếng Việt tự nhiên hơn: "sếp", "thầy", "bác sĩ", "đội trưởng", "hội trưởng", "tiền bối"/"senpai", "điện hạ", "sư phụ", "quý khách"; nhân viên phục vụ gọi khách "anh"/"chị"/"quý khách", xưng "em"/"tôi". Thân quen nhắc người thứ ba theo vai của mình ("bố em", "mẹ con", "ông tớ").
- CẢM XÚC NHẤT THỜI: cãi nhau, nổi giận có thể đổi tạm sang "tao - mày" (bạn bè, anh em) hoặc lạnh lùng "tôi - cậu/anh" (người yêu giận dỗi); mỉa mai có thể lễ phép giả ("Vâng, thưa ngài"). Đây là nhất thời: KHÔNG ghi vào "glossary", trang sau trở lại cặp cũ trừ khi quan hệ đổi thật (chia tay, thành kẻ thù, thân thiết hơn).
- Phi nhân/quái vật/ma vương/thần linh nói với người: "ta" - "ngươi"/"các ngươi"/"lũ người"; người đáp trả kẻ thù: "ta"/"tao" - "ngươi"/"mày". Động vật, robot đáng yêu: theo giọng nhân vật.
- THỨ TỰ ƯU TIÊN khi các manh mối mâu thuẫn: (1) cách gọi rõ trong chữ gốc (mamá, onii-chan, jefa, Su Majestad, señora) > (2) BẢNG XƯNG HÔ đã chốt (trừ khi trái tuổi/quan hệ) > (3) danh sách NHÂN VẬT (tuổi, giới, quan hệ) > (4) "who" và nét vẽ > (5) mạch hội thoại trang trước > (6) mặc định trung tính. Không bao giờ dùng "bạn"/"tôi" kiểu sách vở giữa người quen chỉ vì thiếu manh mối - chọn cặp hợp lứa tuổi nhất.
VĂN PHONG MANGA THEO THỂ LOẠI (nhận ra từ bối cảnh, nét vẽ, cách nói):
- Học đường/romcom/slice of life: tự nhiên, nhẹ, cậu/tớ giữa bạn bè; senpai/kouhai giữ nguyên.
- Shounen/hành động: gọn, mạnh; tên chiêu thức giữ hoặc dịch ngắn có lực.
- Isekai/fantasy: thuật ngữ quen thuộc với độc giả manga Việt (mạo hiểm giả, hội, ma vương, kỹ năng, cấp độ, ma pháp).
- Seinen/kinh dị/trinh thám: câu chắc, ít tiểu từ, giữ không khí.
- Một nhân vật xưng hô KHÁC NHAU với từng người (cậu bé gọi bạn là "cậu" nhưng gọi ông là "ông", xưng "cháu"). Giữ nguyên cặp suốt truyện, chỉ đổi khi quan hệ đổi thật (cãi nhau, thân hơn).
Giữ nghĩa là bắt buộc, văn hay là thứ hai:
- Đọc src để biết chính xác ai làm gì cho ai, ai xin/ai cho, phủ định hay khẳng định, câu hỏi hay câu kể. KHÔNG đảo chủ ngữ/tân ngữ, KHÔNG thêm chi tiết không có trong src (vd "từ đời nào", "con bé"), KHÔNG bỏ ý.
- Đối chiếu từng chi tiết dễ sai với src: cũ/hiện tại ("la novia de tu ex-novio" = bạn gái HIỆN TẠI của bạn trai cũ, không phải "bạn gái cũ"), quá khứ/tương lai, số lượng, ai là người được nói tới.
- "tú/usted/you/te/tu" trong src là NGƯỜI NGHE ghi trong "who": gọi họ bằng ngôi thứ hai theo đúng cặp xưng hô ("anh", "cậu", "cháu"…), KHÔNG biến thành ngôi thứ ba ("cậu ta", "anh ta").
- Câu bị chia qua nhiều bong bóng (draft của mục sau nối tiếp mục trước): giữ nguyên cách chia, mỗi mục chỉ viết phần của mình, đọc liền vẫn thành một câu tự nhiên.
- Giữ người nói của draft. Xưng hô giữa cùng hai người phải thống nhất cả trang: nếu draft lẫn lộn (lúc cậu/tớ lúc anh/em) thì chọn một cặp hợp nhất và sửa mọi câu theo cặp đó.
- BẢNG XƯNG HÔ (nếu được đưa) là quyết định của các trang trước: cặp nào đã có trong bảng thì BẮT BUỘC dùng đúng cặp đó, kể cả khi draft dùng cặp khác. Ngoại lệ duy nhất: cặp trong bảng rõ ràng trái với tuổi/quan hệ ở trang này (vd ghi "cậu/tớ" giữa người lớn và học sinh) - khi đó sửa cặp đó trong "glossary" cho đúng và dùng cặp đã sửa.
- Mọi câu của cùng một người nói với cùng một người nghe trên trang phải dùng CÙNG một cặp xưng hô; rà lại cả trang trước khi trả về.
- Trả về "glossary": bảng xưng hô sau trang này = bảng cũ + cặp mới gặp ở trang này, mỗi dòng một cặp, ghi CẢ HAI CHIỀU dạng "A ↔ B (quan hệ): A xưng X gọi B là Y; B xưng Y gọi A là X" (vd "Ken ↔ Mio (anh trai ↔ em gái): Ken xưng anh gọi Mio là em; Mio xưng em gọi Ken là anh hai") (dùng tên hoặc mô tả ngắn: "Iori", "bạn gái của Iori", "người dẫn chương trình"). Sửa mọi câu của cả A và B theo đúng chiều của người nói. Không có gì mới thì trả lại bảng cũ.
- DỊCH TỰ NHIÊN, KHÔNG WORD-BY-WORD (quan trọng):
  + Chào: "よろしくお願いします" (bạn bè) → "Rất mong cậu giúp đỡ nhé!"; (công sở) → "Rất mong anh/chị chỉ giáo."; "お疲れ様" → "Vất vả rồi!"; "ただいま" → "Tôi về đây!"; "いってらっしゃい" → "Đi cẩn thận nhé!".
  + Cảm thán: "えっ" → "Hả?"; "うそ！" → "Xạo!"; "なるほど" → "Ra thế…"; "やばい" → "Chết tiệt!" / "Khủng khiếp!".
  + Câu đùa: giữ ý đồ gây cười, đổi cách nói cho vui kiểu Việt; KHÔNG dịch word-by-word.
  + Thành ngữ: đổi sang thành ngữ Việt tương đương ("泣きっ面に蜂" → "Vận xui chưa đủ còn thêm hoạ").
- Viết lại cho tự nhiên nhưng KHÔNG bịa chữ: mọi từ phải là tiếng Việt đúng chính tả, đúng nghĩa ("tống khứ", không phải "tống quái"; "bọn mình", không phải "tọn mình"); không chắc một cách nói thì dùng cách nói đơn giản. Trước khi trả về, đọc lại từng câu: còn đủ ý của src không, có từ nào lạ không.
- Cùng một câu không trộn ngôi: đã gọi người nghe là "em" thì không gọi tên họ ở ngôi thứ ba ("Cứ gặp em là em lại xinh hơn", không phải "...là Momiji lại xinh hơn").
- BẪY DỊCH SÁT CHỮ của bản scan Tây Ban Nha/Anh - gặp là bỏ: "càng sớm càng tốt" (cuanto antes / ASAP) → "cho nhanh", "cho xong"; "hay đại loại thế" (o algo así / or something) → "hay gì đó"; "điều gì đó/có điều gì đó" (algo) → "gì đó/có gì đó"; "khoảng tầm" → "tầm" hoặc "khoảng"; "với giá bao nhiêu" → "được bao nhiêu"; "thực sự/thật sự" (de verdad / really) → "thật" hoặc bỏ; "suy cho cùng" (después de todo / after all) → "rốt cuộc" hoặc bỏ; "Tôi đoán/Tớ đoán" (supongo / I guess) → "Chắc"; "Cậu biết không?" (¿sabes? / you know?) → "Này," hoặc bỏ; "ý tớ là" (o sea / I mean, like) → bỏ; "chúng ta" giữa bạn bè → "tụi mình", "bọn mình"; "Hình như," không có dấu phẩy.
- Bản tin TV/radio, thông báo, khung dẫn truyện giữ giọng trang trọng, không thêm "đấy/nhé".
Cách viết:
- Viết như người Việt thật sự nói trong cảnh đó. Đổi cấu trúc câu thoải mái; giữ ý, bỏ chữ.
- Khẩu ngữ, câu ngắn, độ dài gần bằng bản nháp để vừa bong bóng. Tiểu từ tình thái (à, ừ, nhỉ, nhé, đấy, mà, chứ, cơ, hả, thôi, luôn) đúng chỗ, không câu nào cũng nhét.
- Bỏ văn dịch máy: "của cậu/của tôi" thừa, "một cách", "điều đó", "việc", "có thể" thừa, "đã/đang/sẽ" thừa, "coi như là", "có vẻ như", từ Hán Việt trang trọng trong chuyện đời thường.
- Lời nghĩ thầm viết như độc thoại trong đầu (gọn, có thể bỏ chủ ngữ). Dẫn truyện/TV/radio viết văn kể gọn.
- Cảm thán, trêu, mắng phải có lực; dùng cách nói tương đương của tiếng Việt nếu hợp nhân vật.
- Viết hoa bình thường, KHÔNG viết hoa toàn bộ. Giữ "...", "?!". Giữ tên riêng và -san/-kun/-chan.
Ví dụ cứng → tự nhiên (bản scan Tây Ban Nha/Anh):
"Tớ muốn về nhà càng sớm càng tốt." → "Tớ muốn về nhà cho nhanh."
"Cô ấy là ca sĩ hay đại loại thế." → "Cô ấy là ca sĩ hay gì đó."
"Chúng ta có nên báo cho thầy giáo không?" (giữa bạn học) → "Tụi mình có nên báo thầy không?"
"Dù vậy mà vẫn bỏ đi thì chắc chắn có điều gì đó không ổn." → "Vậy mà vẫn bỏ đi, kiểu gì cũng có chuyện."
"Cái xe được bán với giá khoảng tầm 50.000 yên." → "Cái xe bán được tầm 50.000 yên."
"Sí, lo rompiste tú." (Kazu → anh họ) nháp "Cậu ta làm vỡ nó đấy." → "Anh làm vỡ chứ ai."
Ví dụ cứng → tự nhiên (chung):
"Tôi không thể tin được là bạn đã thực sự làm điều đó." → "Không tin nổi là cậu làm thật luôn đấy."
"Điều đó là không thể nào!" → "Làm gì có chuyện đó!"
"Nếu bạn không phiền, tôi sẽ giúp bạn như một lời cảm ơn." → "Không phiền thì để tớ giúp, coi như trả ơn nhé."
"Có vẻ như anh ấy đã quên mất cuộc hẹn của chúng tôi." (nghĩ thầm) → "Chắc lại quên béng vụ hẹn rồi..."
"Yoroshiku onegaishimasu" (hai bạn mới quen) → "Từ giờ mong cậu chỉ bảo nhiều nhé!"
Biên tập như editor/typesetter nhóm dịch chuyên nghiệp (chữ phải vừa bong bóng gốc, không được tràn):
- ĐỘ DÀI: tiếng Việt vốn dài hơn tiếng Anh/Nhật, mà bong bóng không to ra. Mỗi câu KHÔNG dài hơn bản nháp; bong bóng gốc ít chữ (1-3 từ) thì bản dịch cũng 1-4 từ. Rút gọn bằng cách bỏ chủ ngữ đã rõ, bỏ từ đệm, chọn từ ngắn hơn ("không biết" → "chả biết" khi hợp giọng) - không bỏ ý.
- TÊN PHIÊN ÂM: tên viết bằng katakana/hiragana là TÊN, phiên âm sang chữ Latin (クーガー → Kuuga, アストレア → Astrea), KHÔNG đổi thành một từ tiếng Anh có nghĩa trùng âm ("Cougar", "Rose"…). Bản scan đã viết tên bằng chữ Latin thì giữ đúng cách viết đó.
- DẤU CÂU kiểu sách Việt: "…" cho ngập ngừng (không "....." dài), "?!" cho hỏi-gắt; không cách trước "! ? … ,"; câu bị ngắt giữa chừng kết bằng "—"; tối đa hai dấu "!!".
- SFX (mục có "sfx" hoặc src là từ tượng thanh): 1-3 âm tiết tượng thanh tiếng Việt ("ドキドキ" → "Thình thịch", "バン" → "Rầm!", "ぽろぽろ" → "Lã chã", "しくしく" → "Thút thít"), không viết câu mô tả.
- Bong bóng nghĩ thầm và lời dẫn: câu gọn, không chủ ngữ thừa; thoại hét (style big/shout) ngắn và có lực.
Trả về DUY NHẤT một khối JSON, không thêm chữ nào trước/sau:
{"lines": ["câu đã viết lại 1", "câu đã viết lại 2"], "glossary": "bảng xưng hô sau trang này", "names": ["田中 → Tanaka"], "chars": "danh sách nhân vật sau trang này"}
"lines" phải đủ đúng số mục nhận được, cùng thứ tự. Không có cặp xưng hô mới thì "glossary" = bảng cũ nguyên văn.
"chars": danh sách NHÂN VẬT của bộ truyện = danh sách cũ (nếu được đưa) + nhân vật mới/thông tin mới ở trang này; mỗi dòng một người: "Tên hoặc mô tả: giới, tuổi ước lượng, vai trò, quan hệ với các nhân vật khác, cách tự xưng đặc trưng nếu có" (vd "Roka: nam, ~16, học sinh, bạn thân Miko; gọi mẹ Miko là cô; tự xưng tớ"). Giữ ngắn, không bịa; không có gì mới thì trả lại danh sách cũ nguyên văn. Dùng danh sách này để chọn xưng hô.
"names": CHỈ tên riêng thật (người, địa danh, môn phái, chiêu thức, tổ chức) xuất hiện trong src của trang này, dạng "tên gốc → cách viết trong bản dịch". Không đưa từ thường, câu cảm thán hay chữ viết hoa thường. Không có thì [].`;
const POLISH_JOB = {
  system: POLISH_SYSTEM, name: 'lines', maxTokens: 2500,
  schema: {
    type: 'object', additionalProperties: false, required: ['lines', 'glossary', 'names', 'chars'],
    properties: { lines: { type: 'array', items: { type: 'string' } }, glossary: { type: 'string' }, names: { type: 'array', items: { type: 'string' } }, chars: { type: 'string' } },
  },
};

// Never loses a translation: any failure or a wrong line count keeps the draft (and the old glossary).
// glossary: pronoun pairs agreed on earlier pages of this tab; returned updated for the next pages.
async function polish(provider, key, model, bubbles, context, glossary = '') {
  if (!bubbles.length) return { bubbles, glossary };
  try {
    const P = typeof provider === 'string' ? PROVIDERS[provider] : provider; // id (default URL) or providerFor()
    // the whole series memory arrives already labelled (memBlock); a bare pair table gets its label here
    const head = !glossary ? '' : /^(BẢNG XƯNG HÔ|TÊN RIÊNG|GHI CHÚ|NHÂN VẬT|BẠN ĐỌC)/.test(glossary) ? glossary : `BẢNG XƯNG HÔ:\n${glossary}`;
    const prompt = (head ? head + '\n\n' : '') + (context ? `Lời thoại trang trước:\n${context}\n\n` : '')
      + 'Các bong bóng:\n' + JSON.stringify(bubbles.map((b) => ({ src: b.src || '', ...(b.who && { who: b.who }), draft: b.text })));
    const raw = await P.translate(key, model, null, prompt, undefined, POLISH_JOB);
    let out = JSON.parse(raw.replace(/^\s*```(?:json)?|```\s*$/g, ''));
    // some models answer with the bare lines array despite the schema (seen live: glm-4.6v returned
    // ["Cậu đi đâu đấy?", "Ừ!"] - polish then silently kept every draft). Take it: the glossary
    // just stays the old one, which is the correct fallback anyway.
    if (Array.isArray(out)) out = { lines: out, glossary: '' };
    // null = the model kept the table as it was. Never echo the input back: that is the whole memory block,
    // and saving it as "the glossary" nested every section inside it again on each page.
    const g = typeof out.glossary === 'string' && out.glossary.trim() ? out.glossary.trim().slice(0, 1500) : null; // cap: it rides in every later prompt
    const names = Array.isArray(out.names) ? out.names.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim().slice(0, 60)) : [];
    const chars = typeof out.chars === 'string' ? out.chars.trim().slice(0, 2000) : '';
    const { lines } = out;
    if (!Array.isArray(lines) || lines.length !== bubbles.length || lines.some((l) => typeof l !== 'string' || !l.trim())) return { bubbles, glossary: g, names, chars };
    return { bubbles: bubbles.map((b, i) => ({ ...b, text: lines[i].trim() })), glossary: g, names, chars };
  } catch (e) {
    return { bubbles, glossary: null, failed: String(e?.message || e) };
  }
}

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Fallback for cross-origin images the page canvas can't read; host_permissions lets the worker fetch them.
async function fetchImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Không tải được ảnh: HTTP ' + r.status);
  return { data: b64(await r.arrayBuffer()), mime: (r.headers.get('content-type') || 'image/jpeg').split(';')[0] };
}

const TIMEOUT_S = 150; // a hung or very slow model must surface as an error, not an endless "Đang dịch…"

// Some API gateways answer 503/403 with a per-provider quota countdown ("reset after 1m 50s").
// Sleeping through it INSIDE the same call beats burning the queue's 3 fast retries: the page still
// translates on its own instead of ending at "Thử lại". Two sleeps max, ≤5 min each, then give up.
// any case and wording: gateways write "Quota exceeded. Reset after 1m 50s" (capital R missed it: an error page
// where waiting 2 minutes was enough), "retry after", "resets after"
const RESET_IN = /re(?:set|try)s? after (?:(\d+)m)?\s*(?:(\d+)(?:\s*s)?)?/i;
// Groq/OpenAI rate limits: "Please try again in 18.17s" / "in 1m12.5s" / "in 450ms" (live Groq run: pages
// failed instead of waiting the few seconds out)
const TRY_AGAIN = /(?:try again|retry) (?:in|after) (?:(\d+)m(?!s))?\s*(?:([\d.]+)\s*(ms|s)?)?/i;
function resetSeconds(msg) {
  const m = RESET_IN.exec(String(msg));
  if (m) {
    const s = (+(m[1] || 0)) * 60 + (+(m[2] || 0));
    return s > 0 && s <= 300 ? s : 0;
  }
  const t = TRY_AGAIN.exec(String(msg));
  // a per-minute cap with no countdown (Groq: "Request too large … on output tokens per minute (OTPM)"): the
  // 5s/10s retries all landed in the same minute and the page lost its polish every time
  if ((!t || (!t[1] && !t[2])) && /per minute|\b[OR]?TPM\b|\bRPM\b/i.test(String(msg))) return 60;
  if (!t || (!t[1] && !t[2])) return 0;
  const s = Math.ceil((+(t[1] || 0)) * 60 + (t[3] === 'ms' ? +(t[2] || 0) / 1000 : +(t[2] || 0)));
  return s > 0 && s <= 300 ? Math.max(1, s) : 0;
}

async function api(url, init) {
  const secs = init.timeoutS ?? TIMEOUT_S;
  const resets = init.resetLeft ?? 2; // sleeps through quota countdowns still allowed for this call
  for (let tries = 0; ; tries++) {
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(secs * 1000) });
    } catch (e) {
      if (e.name === 'TimeoutError') throw new Error(`Model không trả lời sau ${secs} giây - chọn model nhanh hơn trong Cài đặt.`);
      throw new Error('Không kết nối được tới API: ' + e.message);
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    // OpenRouter wraps the upstream's real reason in metadata.raw ("Provider returned error" alone says nothing)
    let raw = body?.error?.metadata?.raw;
    try { raw = JSON.parse(raw)?.error?.message || raw; } catch { /* plain text */ }
    const errMsg = [body?.error?.message || body?.msg || '', typeof raw === 'string' ? raw.slice(0, 300) : ''].filter(Boolean).join(': ');
    const wait = resetSeconds(errMsg);
    if (wait && tries < resets) { await new Promise((r) => setTimeout(r, (wait + 2) * 1000)); continue; }
    const err = new Error(errMsg || 'HTTP ' + res.status);
    // still blocked after sleeping its windows: the queue retrying would sleep them all over again (9 calls
    // for one persistent quota error, ~22 minutes with a 110s window) - fail now instead
    if (wait) err.sleptThrough = true;
    throw err;
  }
}

const json = (headers, body, timeoutS) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), timeoutS });

// A probe image is tiny: a model that needs more than this for it is unusable on real pages
// (a real run saw gemini-3.7-flash hang the full 150s while flash-lite did a whole page in 3.5s).
const PROBE_TIMEOUT_S = 30;

const anthropicHeaders = (key) => ({
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
});

// Real check that a model reads images, returns our JSON and places boxes: two bubbles at known spots.
const PROBE_W = 600, PROBE_H = 400;
const PROBE_BUBBLES = [ // [cx, cy, rx, ry, line1, line2]
  [160, 120, 130, 80, 'WHERE ARE', 'YOU GOING?!'],
  [440, 290, 130, 80, "I'M GOING", 'HOME NOW.'],
];
async function testImage() {
  const c = new OffscreenCanvas(PROBE_W, PROBE_H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, PROBE_W, PROBE_H);
  g.lineWidth = 4; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
  for (const [cx, cy, rx, ry, l1, l2] of PROBE_BUBBLES) {
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.strokeStyle = '#000'; g.stroke();
    g.fillStyle = '#000'; g.fillText(l1, cx, cy - 6); g.fillText(l2, cx, cy + 30);
  }
  return { data: b64(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()), mime: 'image/png' };
}

// Fallback for models that answer with plain-text lines instead of the required JSON:
//   [68, 75, 175, 340] "Định đi về đâu vậy?"
//   [110, 60, 320, 320] ("Ừ!")
//   [16, 60, 130, 340] Đi đâu vậy?
// Returns [{box_2d, text}]; [] when nothing looks like a box line (caller keeps the JSON error).
const BOX_LINE = /^\s*\[?\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*\]?\s*[\)\]]?\s*[:\-]?\s*[\(\[]?\s*(.*?)\s*[\)\]]?\s*$/;
function parsePlainLines(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(BOX_LINE);
    if (!m) continue;
    const t = m[5].replace(/^["'“”]|["'“”]$/g, '').trim();
    if (!t) continue;
    const b = [ +m[1], +m[2], +m[3], +m[4] ];
    // same sanity rules as the JSON path: 4 finite numbers roughly on the 0-1000 scale
    if (b.every((v) => Number.isFinite(v) && v >= -10 && v <= 1010)) out.push({ box_2d: b, text: t });
  }
  return out;
}

// Merge duplicates the model produces when it aims two boxes at one bubble or splits one bubble's
// lines into several boxes (real screenshots: a giant box over half the page + small ones inside;
// two boxes 60%+ overlapping with the same text). Percent-space, runs after parseBubbles converts.
//   same text (case/punct-insensitive) + overlap ≥40% of the smaller box -> one bubble: keep the
//     tighter box, OR-in the sfx/style flags.
//   one box inside another ≥90%, different text -> keep whichever carries the longer text (the
//     outer is usually a panel-covering miss; the inner a precise split).
//   overlap ≥85% of the smaller box, different text -> same: longer text wins.
function mergeBubbles(bubbles) {
  if (bubbles.length < 2) return bubbles;
  const norm = (t) => String(t ?? '').toLowerCase().replace(/[.!?…、。！？\s]+/g, '');
  const area = (b) => b.w * b.h;
  const inter = (a, b) => {
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  };
  const out = bubbles.slice();
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length && !merged; j++) {
        const a = out[i], b = out[j];
        const ov = inter(a, b), small = Math.min(area(a), area(b));
        if (!small || ov / small < 0.4) continue;
        const same = norm(a.text) && norm(a.text) === norm(b.text);
        // the very same box with a different line: the model stacked lines on one spot (a 2B model gave 12
        // lines all at [100,50,300,500]) - merging kept 1 of 12; keep every line, parseBubbles judges the page
        const twin = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
        if (twin && !same) continue;
        let keep, drop;
        if (same) {
          keep = area(a) <= area(b) ? a : b; // tighter box fits the bubble better
          drop = keep === a ? b : a;
          keep.sfx ||= drop.sfx; keep.style ||= drop.style;
        } else if (ov / small >= 0.9 || ov / small >= 0.85) {
          keep = a.text.length >= b.text.length ? a : b;
          drop = keep === a ? b : a;
          keep.sfx ||= drop.sfx; keep.style ||= drop.style;
        } else continue;
        out.splice(out.indexOf(drop), 1);
        merged = true;
      }
    }
  }
  return out;
}

// The JSON part of an answer: reasoning models leak <think>…</think> or a sentence before the object, and a
// gateway can cut the answer at max_tokens without saying so. Returns the parsed value or throws.
function jsonOf(text) {
  const t = String(text).replace(/^\s*```(?:json)?|```\s*$/g, '');
  try { return JSON.parse(t); } catch (first) {
    const body = t.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').replace(/^[\s\S]*?(?=[{[])/, '');
    try { return JSON.parse(body); } catch { /* maybe cut off */ }
    // cut off mid-list: keep every complete item and close the brackets (a lost tail beats a lost page)
    for (let i = body.lastIndexOf('}'); i > 0; i = body.lastIndexOf('}', i - 1)) {
      for (const tail of [']}', ']', '}]}']) {
        try { const v = JSON.parse(body.slice(0, i + 1) + tail); if (v && typeof v === 'object') return v; } catch { /* try shorter */ }
      }
      if (body.length - i > 4000) break;
    }
    throw first;
  }
}

function parseBubbles(text, size) {
  // Some models wrap JSON in fences; a few (measured: glm-4.6v via gateway, 2 of 3 runs with the
  // old prompt) ignore the schema entirely and answer with one "[ymin, xmin, ymax, xmax] text" line
  // per bubble. JSON.parse throws on that, so fall back to a line parser before giving up - it
  // recovered both runs verbatim (same boxes as the JSON run would give).
  let out;
  try {
    out = jsonOf(text);
  } catch (e) {
    const lines = parsePlainLines(text);
    if (lines.length) out = { bubbles: lines };
    else throw e;
  }
  // despite the schema some models answer with a bare array instead of {"bubbles": [...]}, and gateways
  // wrap the array one level deep in their own envelope ({"data": [...]}). Take any bubble-like array.
  const look = (v) => Array.isArray(v) && (!v.length || (v[0] && typeof v[0] === 'object'
    && ('box_2d' in v[0] || 'text' in v[0] || 'box' in v[0])));
  const bubbles = Array.isArray(out) ? out : Array.isArray(out?.bubbles) ? out.bubbles : Object.values(out ?? {}).find(look);
  if (!Array.isArray(bubbles)) {
    // a 200 response carrying the gateway's own error lands here ("số dư không đủ", rate limit…):
    // surface it - it tells the user what's actually wrong, and the queue retries it the same way
    const why = [out?.msg, out?.message, out?.error?.message, typeof out?.error === 'string' ? out.error : '']
      .find((v) => typeof v === 'string' && v.trim());
    throw new Error('Model trả JSON sai định dạng' + (why ? ': ' + why.trim().slice(0, 120) : '.'));
  }
  // A model that answered on a 0-100 percent scale despite the prompt would have every box clamped into
  // the top-left corner; all coordinates <= 100 gives it away (a full manga page never keeps every bubble
  // there). Rescale the whole answer instead of clamping it.
  // Pixel coordinates instead of 0-1000 (some local models): with the image size known, rescale every box
  // rather than dropping the ones past 1000 (2 of 3 lines lost in a fault test)
  if (size?.w > 0 && size?.h > 0) {
    const all = bubbles.flatMap((o) => (Array.isArray(o.box_2d) && o.box_2d.length === 4 ? [o.box_2d] : []));
    const ys = all.flatMap((b) => [b[0], b[2]]), xs = all.flatMap((b) => [b[1], b[3]]);
    if (all.length && Math.max(...ys, ...xs) > 1010 && Math.max(...ys) <= size.h * 1.02 && Math.max(...xs) <= size.w * 1.02 && Math.min(...ys, ...xs) >= 0) {
      for (const o of bubbles) if (Array.isArray(o.box_2d) && o.box_2d.length === 4) {
        const [y0, x0, y1, x1] = o.box_2d;
        o.box_2d = [y0 / size.h * 1000, x0 / size.w * 1000, y1 / size.h * 1000, x1 / size.w * 1000];
      }
    }
  }
  const vals = bubbles.flatMap((o) => (Array.isArray(o.box_2d) && o.box_2d.length === 4) ? o.box_2d : []);
  const x10 = vals.length && vals.every((v) => Number.isFinite(v) && v >= -10 && v <= 100) ? 10 : 1;
  // box_2d (0-1000) -> x/y/w/h in % for the page overlay. Values far outside 0-1000 mean the model used
  // another scale (e.g. pixels): drop the box instead of clamping it into a page-covering white block.
  // A box over 25% of the page is never one speech bubble (largest on the test page is ~3.4%).
  const c = (v) => Math.min(1000, Math.max(0, v * x10)) / 10;
  const STYLES = new Set(['big', 'small', 'shout', 'whisper', 'narration', 'vertical']);
  const KINDS = new Set(['bubble', 'box', 'art', 'sfx']);
  const parsed = bubbles.flatMap(({ box_2d: b, text: t, src, who, sfx, style, kind }) => {
    // GPT models garble box_2d now and then; each shape below lost lines on live MangaDex pages:
    //   3 numbers [134, 593, 173]: top, left, bottom - guess the right edge, the pixel fit finds the bubble
    if (Array.isArray(b) && b.length === 3 && b.every(Number.isFinite) && b[2] - b[0] >= 10) b = [b[0], b[1], b[2], b[1] + Math.max(60, b[2] - b[0])];
    if (!t?.trim() || !Array.isArray(b) || b.length !== 4 || !b.every((v) => Number.isFinite(v) && v >= -10 && v <= 1010)) return [];
    //   [top, left, right, bottom] ([199, 812, 921, 291]): read as given the right edge is left of the left one
    if (b[3] < b[1] && b[2] > b[1] && b[3] > b[0]) b = [b[0], b[1], b[3], b[2]];
    // gpt-6.2-sol sometimes repeats xmax where ymax belongs: [139, 663, 887, 888], [521, 329, 412, 413]
    // (live MangaDex page: 3 of 11 lines lost). Top-left and xmax are right; estimate the height and let
    // the pixel fit find the real bubble.
    if (Math.abs(b[2] - b[3]) <= 3 && b[3] > b[1] && (b[2] <= b[0] || b[2] - b[0] > 2.5 * (b[3] - b[1]))) {
      b = [b[0], b[1], Math.min(1000, b[0] + Math.max(25, 0.5 * (b[3] - b[1]))), b[3]]; // short: a tall guess reached the art below
    }
    const [y0, x0, y1, x1] = [c(Math.min(b[0], b[2])), c(Math.min(b[1], b[3])), c(Math.max(b[0], b[2])), c(Math.max(b[1], b[3]))];
    const w = x1 - x0, h = y1 - y0;
    const st = STYLES.has(style) ? style : '';
    return w > 0 && h > 0 && w * h <= 2500 ? [{ x: x0, y: y0, w, h, text: t.trim(), ...(src && { src }), ...(who && { who }), ...(KINDS.has(kind) && { kind }), ...(sfx && { sfx: true }), ...(st && { style: st }) }] : [];
  });
  const merged = mergeBubbles(parsed);
  // Most lines stacked on one spot = the model didn't locate anything: let the queue ask again
  const spot = (b) => [b.x, b.y, b.w, b.h].map((v) => Math.round(v)).join(',');
  const stacks = new Map();
  for (const b of merged) stacks.set(spot(b), (stacks.get(spot(b)) || 0) + 1);
  if (merged.length >= 3 && Math.max(...stacks.values()) >= Math.max(3, 0.5 * merged.length)) {
    throw new Error('Model đặt nhiều câu vào cùng một chỗ - không xác định được vị trí bong bóng.');
  }
  // F6: one sentence repeated in 3+ separate boxes (a weak model filling a column with the same line):
  // keep its first box. Short lines (SFX "Thịch", "Hộc", "...") legitimately repeat and are left alone.
  const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const count = new Map();
  for (const b of merged) count.set(norm(b.text), (count.get(norm(b.text)) || 0) + 1);
  const seen = new Set();
  return merged.filter((b) => {
    const k = norm(b.text);
    if (k.length < 12 || count.get(k) < 3) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function probe({ provider, key, model, base }) {
  const bubbles = parseBubbles(await providerFor(provider, base).translate(key, model, await testImage(), 'Đây là trang đầu tiên.', PROBE_TIMEOUT_S));
  if (!bubbles.length) throw new Error('Model không đọc được chữ trong ảnh thử.');
  // every probe bubble must get a box whose centre lands inside it
  const hit = ([cx, cy, rx, ry]) => bubbles.some((b) => {
    const x = (b.x + b.w / 2) * PROBE_W / 100, y = (b.y + b.h / 2) * PROBE_H / 100;
    return Math.abs(x - cx) <= rx && Math.abs(y - cy) <= ry;
  });
  if (!PROBE_BUBBLES.every(hit)) throw new Error('Model đặt ô dịch sai vị trí trong ảnh thử.');
  return bubbles.map((b) => b.text).join(' / ');
}

// OpenAI, OpenRouter, Groq, custom: same chat-completions wire format, only base URL, model filter and
// extras differ. rank(m): lower sorts first (e.g. free models before paid); ties go newest first.
// Every provider reads its endpoint from this.base so the user can point it elsewhere (providerFor).
const bearer = (key) => (key ? { authorization: `Bearer ${key}` } : {}); // local servers (Ollama…) need no key
// text-only jobs answer short: asking for less output keeps a low-balance key working (OpenRouter
// refuses a call whose max_tokens it can't reserve: "can only afford 4063")
const cap = (ex, maxTokens) => (maxTokens && ex.max_tokens > maxTokens ? { ...ex, max_tokens: maxTokens } : ex);
// jsonObject: ask for {"type": "json_object"} with the schema spelled out in the system prompt instead of
// strict json_schema. Groq's constrained decoding broke qwen3.8's output 2 times in 5 ({"bubs"}, {"b-inter:
// "Failed to generate JSON"); json_object came back valid 10 times in 10 on the same image.
const openaiCompat = (base, keep, extra = () => ({}), rank = () => 0, jsonObject = false) => ({
  base,
  listHeaders: bearer,
  async models(key) {
    const { data } = await api(`${this.base}/models`, { headers: bearer(key) });
    return data.filter(keep).sort((a, b) => rank(a) - rank(b) || (b.created ?? 0) - (a.created ?? 0)).map((m) => m.id);
  },
  async translate(key, model, img, prompt, timeoutS, job = PAGE_JOB) {
    const body = await api(`${this.base}/chat/completions`, json(bearer(key), {
      model,
      messages: [
        { role: 'system', content: jsonObject ? job.system + '\nTrả lời DUY NHẤT một object JSON theo đúng JSON Schema này: ' + JSON.stringify(job.schema) : job.system },
        // text-only (polish): a plain string - Groq's text models (gpt-oss) reject the parts array
        { role: 'user', content: img ? [{ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}`, detail: 'high' } }, { type: 'text', text: prompt }] : prompt },
      ],
      response_format: jsonObject ? { type: 'json_object' } : { type: 'json_schema', json_schema: { name: job.name, strict: true, schema: job.schema } },
      ...cap(extra(model), job.maxTokens),
    }, timeoutS));
    if (body.choices?.[0]?.finish_reason === 'length') throw new Error('Model hết giới hạn token trước khi dịch xong trang này.');
    const msg = body.choices?.[0]?.message;
    if (!msg?.content) throw new Error(msg?.refusal || 'Model không trả về bản dịch.');
    return msg.content;
  },
});

// Sort Gemini ids by version number (gemini-3 before gemini-2.5); unversioned aliases go last.
const geminiVer = (id) => parseFloat(id.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);

const PROVIDERS = {
  anthropic: {
    base: 'https://api.anthropic.com/v1',
    listHeaders: anthropicHeaders,
    async models(key) {
      const { data } = await api(`${this.base}/models?limit=1000`, { headers: anthropicHeaders(key) });
      // API lists newest first and reports capabilities per model
      return data.filter((m) => m.capabilities?.image_input?.supported && m.capabilities?.structured_outputs?.supported).map((m) => m.id);
    },
    async translate(key, model, img, prompt, timeoutS, job = PAGE_JOB) {
      const body = await api(`${this.base}/messages`, json(
        anthropicHeaders(key),
        {
          model,
          max_tokens: 16000,
          system: job.system,
          output_config: { format: { type: 'json_schema', schema: job.schema } },
          messages: [{ role: 'user', content: [...(img ? [{ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } }] : []), { type: 'text', text: prompt }] }],
        },
        timeoutS,
      ));
      if (body.stop_reason === 'refusal') throw new Error('Model từ chối dịch trang này.');
      return body.content.find((b) => b.type === 'text').text;
    },
  },
  // OpenAI's /models has no capability fields: this name filter only skips obvious non-chat families;
  // probe() is what actually decides whether a model works.
  openai: openaiCompat('https://api.openai.com/v1', (m) =>
    /^(gpt-|o\d|chatgpt)/.test(m.id) && !/audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation/.test(m.id)),
  gemini: {
    base: 'https://generativelanguage.googleapis.com/v1beta',
    listHeaders: (key) => ({ 'x-goog-api-key': key }),
    async models(key) {
      const { models } = await api(`${this.base}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
      // No image-input or date field in Gemini's model list: keep generateContent models, order by the
      // version in the name; probe() decides which actually work.
      return models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace('models/', ''))
        .filter((id) => /^gemini-/.test(id) && !/tts|embedding|audio|live|image-generation|imagen|veo|aqa/.test(id)) // no image input: probing them only wastes the search
        // flash-lite first: on free keys it's the one that answers (newer pro/flash hit "quota" or 30s timeouts)
        .sort((a, b) => /flash-lite/.test(b) - /flash-lite/.test(a) || geminiVer(b) - geminiVer(a) || a.localeCompare(b));
    },
    async translate(key, model, img, prompt, timeoutS, job = PAGE_JOB) {
      const body = await api(`${this.base}/models/${model}:generateContent`, json({ 'x-goog-api-key': key }, {
        systemInstruction: { parts: [{ text: job.system }] },
        contents: [{ role: 'user', parts: [...(img ? [{ inlineData: { mimeType: img.mime, data: img.data } }] : []), { text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: job.schema },
      }, timeoutS));
      const text = body.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || '').join('');
      if (!text) throw new Error('Gemini chặn trang này: ' + (body.promptFeedback?.blockReason || body.candidates?.[0]?.finishReason || 'không rõ'));
      return text;
    },
  },
  // Groq (OpenAI-compatible, has a free tier). Per its docs: GET /models items carry `active`; images go as
  // image_url data URIs; strict json_schema works on its vision models (qwen/qwen3.8-27b); max_tokens is
  // deprecated for max_completion_tokens. The list has no vision flag, so probe() decides which work.
  // Speech (whisper), voice (orpheus) and guard/classifier models can't chat or read pages: not listed.
  groq: openaiCompat('https://api.groq.com/openai/v1', (m) => m.active !== false && !/whisper|orpheus|tts|guard|playai|distil/i.test(m.id),
    () => ({ max_completion_tokens: 4096 }), () => 0, true),
  // Without max_tokens OpenRouter reserves credit for the model's full output limit (65536 seen in a real
  // run) and rejects low-balance keys. A dense real page's JSON is ~1100 chars; 4096 leaves room for reasoning.
  // :free models cost nothing to reserve, and a reasoning one (nemotron :free) ran out at 4096 on a real page.
  openrouter: openaiCompat('https://openrouter.ai/api/v1', (m) =>
    m.architecture?.input_modalities?.includes('image') && m.supported_parameters?.includes('structured_outputs')
    && !m.id.endsWith(':batch'), (model) => ({ max_tokens: model.endsWith(':free') ? 16000 : 4096 }),
    // free first: priced at 0 per the model list itself (also catches openrouter/free, which has no :free suffix)
    (m) => (+m.pricing?.prompt === 0 && +m.pricing?.completion === 0 ? 0 : 1)),
  // Any OpenAI-compatible server the user points at (Ollama, LM Studio, vLLM, a proxy…). No default URL.
  custom: openaiCompat('', () => true, () => ({ max_tokens: 4096 })),
};

// Model ids from any common list shape: {data:[…]} (OpenAI), {models:[…]} (Gemini), a bare array;
// items as strings or objects with id/name. Order kept as the server sent it.
function anyIds(j, stripModelsPrefix) {
  const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
  const ids = arr.map((m) => (typeof m === 'string' ? m : m?.id || m?.name)).filter((x) => typeof x === 'string' && x.trim());
  return [...new Set(stripModelsPrefix ? ids.map((x) => x.replace(/^models\//, '')) : ids)];
}

// A provider talking to `base` (user setting) instead of its default. Only http(s) URLs are accepted.
// A gateway/proxy behind a custom base lists models without the vendor-specific
// fields our filters need (capabilities, supportedGenerationMethods, pricing…), and may serve other
// vendors' models too, so its list is read with anyIds() and nothing is filtered: probe() decides.
function providerFor(id, base) {
  const P = PROVIDERS[id];
  if (!P) throw new Error('Nhà cung cấp không hợp lệ: ' + id);
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (!b || b === P.base) {
    if (!P.base) throw new Error('Chưa nhập Base URL cho nhà cung cấp tùy chỉnh.');
    return P;
  }
  let u;
  try { u = new URL(b); } catch { throw new Error('Base URL không hợp lệ: ' + b); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Base URL phải bắt đầu bằng http:// hoặc https://');
  return Object.create(P, {
    base: { value: b },
    models: {
      value: async function (key) {
        try {
          return anyIds(await api(`${this.base}/models`, { headers: P.listHeaders(key) }), id === 'gemini');
        } catch (e) {
          // servers mount the OpenAI-style API at different paths (/v1, /api/v1, /openai/v1, none…): a 404
          // means the path is wrong - point at the docs instead of guessing one
          if (/404/.test(e.message)) throw new Error(`${e.message} - kiểm tra lại Base URL theo tài liệu của server (phần địa chỉ đứng trước /chat/completions)`);
          throw e;
        }
      },
    },
  });
}

// Cache by image content + model: MangaDex recreates <img> tags for pages you go back to, and F5 reloads
// them, so without this the same page is paid for again. Entries are ~1-2 KB; keep the newest CACHE_MAX.
// Bump CACHE_V when the prompt changes, so results from the old prompt don't shadow the new ones.
const CACHE_MAX = 500, CACHE_V = 16;
async function cacheKey(model, data) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
  return 'c:' + model + ':v' + CACHE_V + ':' + [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function cachePut(key, bubbles) {
  await chrome.storage.local.set({ [key]: { t: Date.now(), bubbles } });
  const all = await chrome.storage.local.get(null);
  const entries = Object.keys(all).filter((k) => /^[cd]:/.test(k));
  if (entries.length > CACHE_MAX) {
    await chrome.storage.local.remove(entries.sort((a, b) => all[a].t - all[b].t).slice(0, entries.length - CACHE_MAX));
  }
}

// ---------- học hỏi tích lũy (memory theo bộ truyện, sống qua reload/chapter) ----------
// Bảng xưng hô + tên riêng + ghi chú văn phong cho mỗi bộ truyện (series.js; không nhận ra bộ thì theo site),
// lưu trong chrome.storage.local dưới khóa "mem:<host/series>". Mỗi trang: load -> đút vào prompt -> polish -> gộp lại cái mới học được.
// Đây là "AI học sau mỗi lần dịch": chapter sau dùng đúng xưng hô/tên riêng chapter trước đã chốt.
const MEM_MAX = 4000; // ký tự mỗi mục; đủ cho cả series, prompt không phình
async function loadMem(site) {
  if (!site) return { glossary: '', names: [], notes: [] };
  const k = 'mem:' + site;
  const m = (await chrome.storage.local.get(k))[k];
  return { glossary: '', names: [], notes: [], chars: '', examples: [], ...(m || {}) };
}
async function saveMem(site, mem) {
  if (!site) return;
  await chrome.storage.local.set({ ['mem:' + site]: {
    label: String(mem.label ?? '').slice(0, 120), // series name shown in the settings page
    glossary: String(mem.glossary ?? '').slice(0, MEM_MAX),
    names: [...new Set((mem.names || []).map(String))].slice(0, 60),
    notes: [...new Set((mem.notes || []).map(String))].slice(0, 30),
    chars: String(mem.chars ?? '').slice(0, 2000),
    // reader corrections, newest last: the next pages imitate them (in-context learning, no retraining)
    examples: (mem.examples || []).filter((e) => e && e.fix).slice(-30),
  } });
}
// Gộp bài học của trang này vào memory; trả về bản mới để trang sau dùng ngay.
async function learnFromPage(site, mem, glossary, found, chars = '') {
  if (!site) return mem;
  const next = { ...mem };
  // Merged, never replaced: the model is asked for "old table + new pairs" but often returns only this page's
  // pairs, and every earlier pair was lost (live report: memory "not saved"). Old rows first, a row for the
  // same pair is replaced by the newer one (key = "A ↔ B", before ":" or "("). Section headers the model
  // echoes back ("BẢNG XƯNG HÔ:", "NHÂN VẬT …") are not pairs.
  const header = /^(BẢNG XƯNG HÔ|TÊN RIÊNG|GHI CHÚ|NHÂN VẬT|BẠN ĐỌC|Lời thoại)/i;
  const rowsOf = (t) => String(t || '').split('\n').map((l) => l.trim().replace(/^[-•*]\s*/, '').replace(/\s{2,}/g, ' ')).filter((l) => l && !header.test(l));
  // A name learnt later: the model writes "Akasumi Goro (thầy giáo): …" once the teacher is named. The old
  // "Thầy giáo" character row goes, and pairs keyed on "thầy giáo" are renamed - the table kept saying "thầy
  // giáo" beside a new "Akasumi Goro" row (live MangaDex run, looked like memory not updating).
  const alias = new Map();
  for (const r of rowsOf(chars)) {
    const m = /^([^:(]+?)\s*\(([^)]+)\)\s*:/.exec(r);
    if (m && m[2].trim().toLowerCase() !== m[1].trim().toLowerCase()) alias.set(m[2].trim().toLowerCase(), m[1].trim());
  }
  const renamed = (r) => {
    const cut = r.search(/[:(]/), head = cut < 0 ? r : r.slice(0, cut);
    let h = head;
    for (const [a, name] of alias) h = h.split(/\s*↔\s*/).map((p) => (p.trim().toLowerCase() === a ? name : p.trim())).join(' ↔ ');
    return h === head.trim() ? r : h + (cut < 0 ? '' : ' ' + r.slice(cut));
  };
  const byHead = new Map();
  for (const r of [...rowsOf(mem.glossary), ...rowsOf(glossary)].map(renamed)) byHead.set(r.split(/[:(]/)[0].trim().toLowerCase(), r);
  next.glossary = [...byHead.values()].join('\n').slice(-MEM_MAX);
  // names: the polish pass lists real proper names ("田中 → Tanaka"). A regex over src used to do
  // this and stored every capitalised word: an all-caps Spanish/English scan put "BUENO", "AHORA"…
  // into "TÊN RIÊNG KHÔNG DỊCH", telling the next page to leave plain words untranslated.
  const names = new Set(mem.names || []);
  for (const n of found || []) names.add(n);
  next.names = [...names].slice(-60); // newest kept when full
  // characters: one line per person, merged the same way (key = the name before ":")
  if (chars) {
    const byName = new Map();
    for (const r of rowsOf(mem.chars)) if (!alias.has(r.split(/[:(]/)[0].trim().toLowerCase())) byName.set(r.split(':')[0].trim().toLowerCase(), r);
    for (const r of rowsOf(chars)) byName.set(r.split(':')[0].trim().toLowerCase(), r);
    next.chars = [...byName.values()].join('\n').slice(-2000);
  }
  await saveMem(site, next);
  return next;
}
function memBlock(mem) {
  const parts = [];
  if (mem.glossary) parts.push('BẢNG XƯNG HÔ:\n' + mem.glossary);
  if (mem.names?.length) parts.push('TÊN RIÊNG (giữ đúng cách viết này): ' + mem.names.join(', '));
  if (mem.notes?.length) parts.push('GHI CHÚ VĂN PHONG:\n' + mem.notes.join('\n'));
  if (mem.chars) parts.push('NHÂN VẬT (tuổi, vai, quan hệ - dùng để chọn xưng hô):\n' + mem.chars);
  // the reader's own fixes: the strongest signal for this series' voice
  if (mem.examples?.length) parts.push('BẠN ĐỌC ĐÃ SỬA (bắt chước đúng giọng, xưng hô và cách nói này):\n'
    + mem.examples.slice(-12).map((e) => `${e.src ? '"' + e.src.replace(/\s+/g, ' ').slice(0, 80) + '" ' : ''}AI: "${e.ai}" → đúng: "${e.fix}"`).join('\n'));
  return parts.join('\n\n');
}

// ---------- hàng đợi dịch ----------
// Mọi yêu cầu xếp hàng theo id (chính là key cache: ảnh+model), worker xử lý tối đa QMAX job cùng lúc:
// nhiều tab không dồn API tới hỏng gateway (503/524), trang đang xem được ưu tiên lên đầu, và một câu
// trả lời hỏng tạm thời được tự thử lại - người dùng không gặp lỗi là mấy. Kết quả xong được lưu vào
// cache theo id (bền vững qua reload): lật lại trang đã dịch là hiện ngay, không tốn thêm lần gọi nào.
const QMAX = 2, Q_TRIES = 3;
let Q_RETRY_MS = 5000; // per-try backoff; the unit test shortens it
const pending = [], running = new Set(), waiters = new Map(); // waiters: key -> Set of {resolve, onDraft}
let wakeTimer = null;

async function enqueue(key, job, urgent, resolve, onDraft, tag) {
  // a twin request may have finished while we were getting here: its result is already in the cache
  const hit = (await chrome.storage.local.get(key))[key];
  if (hit) { resolve({ bubbles: hit.bubbles, glossary: job.glossary }); return; }
  let w = waiters.get(key);
  if (!w) waiters.set(key, (w = new Set()));
  w.add({ resolve, onDraft, tag });
  if (running.has(key)) return; // job in flight: our waiter resolves when it does
  const q = pending.find((p) => p.key === key);
  if (q) { // already waiting: just bump priority if asked
    q.urgent ||= urgent;
    if (q.urgent && q !== pending[0]) { pending.splice(pending.indexOf(q), 1); pending.unshift(q); }
    return;
  }
  urgent ? pending.unshift({ key, job, urgent }) : pending.push({ key, job });
  pump();
}

// The page cancelled (Huỷ / Dừng dịch): resolve its waiters now and drop a queued job nobody waits for
// any more. A job already running can't be pulled back from the API; it finishes into the cache.
function cancel(tag) {
  if (!tag) return 0;
  let n = 0;
  for (const [key, set] of waiters) {
    for (const w of [...set]) if (w.tag === tag) { set.delete(w); w.resolve({ error: 'Đã huỷ' }); n++; }
    if (set.size) continue;
    waiters.delete(key);
    const i = pending.findIndex((p) => p.key === key);
    if (i >= 0) pending.splice(i, 1);
  }
  return n;
}

function pump() {
  clearTimeout(wakeTimer);
  while (running.size < QMAX) {
    const i = pending.findIndex((p) => p.urgent || !(p.notBefore > Date.now())); // backoff only defers non-urgent retries
    if (i < 0) { // everything left is in backoff: wake up when the first one is due
      if (pending.length) wakeTimer = setTimeout(pump, Math.min(...pending.map((p) => p.notBefore)) - Date.now());
      return;
    }
    const item = pending.splice(i, 1)[0];
    running.add(item.key);
    run(item);
  }
}

async function run(item) {
  const { key, job } = item;
  try {
    const res = await translateJob(job, (draft) => {
      // the read pass just produced boxes: show them before polish runs (a visible page goes from
      // ~2 calls' latency to 1 - measured on glm-4.6v: draft at 5-8s, polished +2.5s later)
      for (const w of waiters.get(key) || []) w.onDraft?.(draft);
    });
    const w = waiters.get(key);
    waiters.delete(key);
    running.delete(key); // before resolving: a caller arriving now re-checks the cache instead of attaching to a dead waiter
    w?.forEach((f) => f.resolve(res));
  } catch (e) {
    running.delete(key);
    job.tries = e.sleptThrough ? Q_TRIES : (job.tries || 0) + 1;
    if (job.tries < Q_TRIES) {
      // flaky answer (broken JSON, HTTP 524, a 200-wrapped gateway error): retry with backoff, but
      // back in the queue, not asleep in the slot - the other pages keep their turn meanwhile.
      // A quota countdown means waiting it out once beats burning tries: sleep until it resets
      // (resetSeconds is in SECONDS; Q_RETRY_MS is already in ms - do not scale it again).
      const waitS = resetSeconds(String(e.message || ''));
      item.notBefore = Date.now() + (waitS ? waitS * 1000 : job.tries * Q_RETRY_MS);
      pending.unshift(item);
    } else {
      const w = waiters.get(key);
      waiters.delete(key);
      // the read pass worked, only the polish kept failing: its lines beat an error page (not cached as
      // final, so the next visit polishes them - still without resending the image)
      const d = job.draftKey && (await chrome.storage.local.get(job.draftKey).catch(() => ({})))[job.draftKey];
      // the reason travels with it: the page tells the reader this page taught the AI nothing (it looked like
      // "memory never updates" - live Groq run: every polish hit the tokens-per-minute cap, silently)
      w?.forEach((f) => f.resolve(d ? { bubbles: d.bubbles, glossary: job.glossary, unpolished: true, reason: String(e.message || e).slice(0, 160) } : { error: String(e.message || e) }));
    }
  } finally {
    pump();
  }
}

// translate(): resolve provider + cache check, then hand the work to the queue
async function translate({ data, mime, w, h, url, context, glossary = '', site, seriesLabel = '', urgent, onDraft, part = false, tag, draftPort }) {
  if (!data) ({ data, mime } = await fetchImage(url));
  const { provider = 'anthropic', keys = {}, models = {}, bases = {}, polishModels = {}, polish: polishOn = true, sfx = true }
    = await chrome.storage.local.get(['provider', 'keys', 'models', 'bases', 'polishModels', 'polish', 'sfx']);
  // the text-only rewrite can run on a stronger model than the image reader (reading wants fast, writing
  // wants good: on the same drafts gemini-3.5-flash left 0 stiff lines where flash-lite left 3)
  const polishModel = polishModels[provider] || models[provider];
  const doPolish = polishOn && !part; // a recovery crop is one or two lines: one call, no polish pass
  if ((!keys[provider] && provider !== 'custom') || !models[provider]) throw new Error('Chưa nhập API key / chọn model (bấm icon extension).');
  // sfx rides in the cache key: the same page under the other setting must not shadow it
  const key = await cacheKey(models[provider] + (doPolish ? '+p:' + polishModel : '') + (sfx ? '' : '-sfx') + (part ? '+part' : ''), data);
  // the series' name follows the page on every request, cached or not: an entry made earlier without a name
  // (shown as an id in the settings) or with a card's glued tags is fixed as soon as any page of it is opened
  if (site && seriesLabel && !part) {
    const mk = 'mem:' + site, cur = (await chrome.storage.local.get(mk))[mk];
    if (cur && cur.label !== seriesLabel) await chrome.storage.local.set({ [mk]: { ...cur, label: String(seriesLabel).slice(0, 120) } });
  }
  const hit = (await chrome.storage.local.get(key))[key];
  if (hit) return { bubbles: hit.bubbles, glossary, key, moves: hit.moves }; // same page already translated by this model: no API call
  // the read pass alone (no polish model in it): reused when only the polish was lost (reload, error)
  const draftKey = 'd' + (await cacheKey(models[provider] + (sfx ? '' : '-sfx') + (part ? '+part' : ''), data)).slice(1);
  const job = { key, draftKey, size: w > 0 && h > 0 ? { w, h } : null, data, mime, context, glossary, site, seriesLabel, provider, base: bases[provider], model: models[provider], polishModel, apiKey: keys[provider], doPolish, sfx, part };
  return new Promise((resolve) => enqueue(key, job, urgent, (r) => resolve(r?.error ? r : { ...r, key }), onDraft, tag || draftPort));
}

// One polish at a time per series (site key): the next waits for the previous one's memory update.
const turns = new Map();
function seriesTurn(site, fn) {
  if (!site) return fn();
  const prev = turns.get(site) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  turns.set(site, tail);
  tail.then(() => { if (turns.get(site) === tail) turns.delete(site); });
  return run;
}

// Returns { bubbles, glossary }. glossary (pronoun pairs for this tab) only changes when polish runs.
// onDraft(bubbles): called with the read pass's boxes as soon as they exist, before polish.
// sfx=false drops the model's SFX-tagged bubbles before polish and before the draft is pushed,
// so both paints and the cache agree on what the user asked to see.
async function translateJob(job, onDraft) {
  const { key, draftKey, size, data, mime, context, glossary = '', site, seriesLabel = '', provider, base, model, polishModel = model, apiKey, doPolish, sfx = true, part = false } = job;
  const P = providerFor(provider, base);
  // memory của site: xưng hô/tên riêng/văn phong học từ các trang & chapter trước
  const mem = await loadMem(site).catch(() => ({ glossary: '', names: [], notes: [] }));
  const head = memBlock(mem);
  const where = part
    ? 'ẢNH NÀY GHÉP một hoặc nhiều VÙNG CẮT của trang truyện (xếp dọc, ngăn bằng vạch đen), mỗi vùng chứa khối chữ mà lượt đọc trước bỏ sót. Dịch MỌI chữ trong từng vùng; box_2d tính theo khung ảnh ghép này, mỗi ô nằm gọn trong một vùng. Không có chữ thì trả {"bubbles": []}.\n'
      + 'Lời thoại đã dịch của trang này (giữ đúng xưng hô):\n' + (context || '(chưa có)')
    : context ? `Lời thoại trang trước (giữ xưng hô nhất quán):\n${context}` : 'Đây là trang đầu tiên.';
  const prompt = (head ? head + '\n\n' : '') + where;
  const call = () => P.translate(apiKey, model, { data, mime }, prompt, undefined, pageJob(doPolish));
  // Already read before (F5 / extension reload / a polish error mid-page): the image was paid for once,
  // reuse those lines and only redo the text-only polish - never send the image again.
  const saved = draftKey && !part && (await chrome.storage.local.get(draftKey))[draftKey];
  // F1: a weak model can answer the instruction itself ("Đây là trang đầu tiên.") as a line on the page
  const ECHO = ['đây là trang đầu tiên', 'lời thoại trang trước', 'giữ xưng hô nhất quán', 'lời thoại đã dịch của trang này'];
  // a bubble holding only "!" / "?!" / "..." has nothing to translate; models still invent a line for it
  // ("Hả?!") and place it beside the bubble, on the art (live MangaDex 66dcdbac/8)
  // (recovery crops answer without src: "..." for a dotted bubble, drawn as a strip over the hair, 66dcdbac/9)
  const marksOnly = (b) => (typeof b.src === 'string' && b.src.trim() && !/[\p{L}\p{N}]/u.test(b.src)) || !/[\p{L}\p{N}]/u.test(String(b.text));
  const notEcho = (list) => list.filter((b) => !marksOnly(b) && !ECHO.some((e) => String(b.text).toLowerCase().includes(e)));
  const read = async () => shiftByLearnt(notEcho(parseBubbles(await call(), size)), provider + '/' + model, part);
  let bubbles = saved ? saved.bubbles : await read();
  if (!saved) {
  // a page that clearly has text but came back with zero boxes is a model flake (seen with gpt-5.6-sol,
  // 1 run in 7): one retry, not a loop - a genuinely textless page pays a second call instead of lying.
  // A recovery crop may hold no text at all (the pixel finder's false alarm): no retry there.
  if (!bubbles.length && !part) bubbles = await read();
  // Vietnamese almost always carries diacritics; a multi-word "translation" without any is the source text
  // copied back (live MangaDex run: a recovery crop answered in Indonesian). Ask once more, then drop.
  const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  const untranslated = (b) => !b.sfx && b.text.split(/\s+/).length >= 3 && !VI.test(b.text);
  if (bubbles.some(untranslated)) {
    const warn = 'LƯU Ý: lần trước trường "text" bị trả NGUYÊN VĂN ngôn ngữ gốc. "text" PHẢI là bản dịch TIẾNG VIỆT.\n\n';
    const again = await P.translate(apiKey, model, { data, mime }, warn + prompt, undefined, pageJob(doPolish)).then((t) => notEcho(parseBubbles(t, size)), () => []);
    if (again.length && !again.some(untranslated)) bubbles = again;
    else bubbles = bubbles.filter((b) => !untranslated(b));
  }
  if (!sfx) bubbles = bubbles.filter((b) => !b.sfx); // user turned SFX off: drop tagged bubbles
  if (draftKey && !part && doPolish) await chrome.storage.local.set({ [draftKey]: { t: Date.now(), bubbles } });
  }
  onDraft?.(bubbles);
  let g = glossary;
  if (doPolish) await seriesTurn(site, async () => {
    // Pages are read in parallel but polished one at a time per series, each with the memory as the
    // previous page left it: page 6 polished before page 4 had stored "she's 3 years older, we're dating"
    // switched a couple from chị/em to cậu/mình (live report)
    const mem = await loadMem(site).catch(() => ({ glossary: '', names: [], notes: [] }));
    const head = memBlock(mem);
    const known = mem.glossary || glossary; // the pair table so far
    const first = await polish(P, apiKey, polishModel, bubbles, context, head || glossary);
    // polish lost (gateway error): the queue retries - only this text call, the read pass is saved -
    // and the last try shows the draft. An unpolished page is never cached or learnt from as final.
    if (first.failed) throw new Error(first.failed);
    let { names = [], chars = '' } = first;
    bubbles = first.bubbles;
    g = first.glossary || known;
    // This page just added pronoun pairs: polish it once more under them, so it follows its own decision.
    // (gemini-3.1-flash-lite, real page, 3 runs: 1-2 mixed lines left after one pass, 0 after this.)
    // Only while the series has no table yet: later pages are polished with the table from the start, and a
    // second call there cost 5-10s a page for little (live GPT run: read 21s, polish 8s + 7s)
    if (first.glossary && first.glossary !== known && !known) {
      const second = await polish(P, apiKey, polishModel, bubbles, context, memBlock({ ...mem, glossary: g }));
      if (!second.failed) {
        bubbles = second.bubbles; g = second.glossary || g;
        names = names.concat(second.names || []); chars = second.chars || chars;
      }
    }
    // học hỏi tích lũy: gộp bảng xưng hô + tên riêng của trang này vào memory của site
    await learnFromPage(site, { ...mem, label: seriesLabel || mem.label }, g, names, chars).catch(() => {});
  });
  await cachePut(key, bubbles);
  if (draftKey && doPolish) await chrome.storage.local.remove(draftKey).catch(() => {});
  return { bubbles, glossary: g };
}

// Bump together with POPUP_API in popup.js whenever the messages change. An unpacked extension's popup
// reads its files fresh from disk, but this service worker keeps running the old code until the extension
// is reloaded; a real report ("Cannot read properties of undefined (reading 'translate')") was a new popup
// talking to an old worker that had no 'custom' provider.
const API = 8;

// Draft-first streaming: content.js opens a port named "md-draft-<imgsrc-hash>" and names it in the
// translate message; while that page's job runs we hold the port and push the read pass's boxes
// through it the moment they exist. A page you're looking at shows text after 1 call instead of 2.
const draftPorts = new Map(); // portName -> port
chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith('md-draft-')) return;
  draftPorts.set(port.name, port);
  port.onDisconnect.addListener(() => draftPorts.delete(port.name));
});
const pushDraft = (portName, bubbles) => {
  const port = draftPorts.get(portName);
  if (!port) return;
  try { port.postMessage({ type: 'draft', bubbles }); } catch { draftPorts.delete(portName); }
};

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  const job = msg.type === 'hello' ? Promise.resolve({ api: API })
    : msg.type === 'translate' ? translate(msg.draftPort ? { ...msg, onDraft: (bubbles) => pushDraft(msg.draftPort, bubbles) } : msg)
    : msg.type === 'models' ? Promise.resolve().then(() => providerFor(msg.provider, msg.base).models(msg.key)).then((list) => ({ list }))
    : msg.type === 'probe' ? probe(msg).then((sample) => ({ sample }))
    : msg.type === 'defaults' ? Promise.resolve({ bases: Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.base])) })
    : msg.type === 'mem' ? loadMem(msg.site).then((m) => ({ mem: m })) // popup: xem AI đã học gì về site này
    : msg.type === 'mem-reset' ? loadMem(msg.site).then((m) => saveMem(msg.site, { label: m.label, glossary: '', names: [], notes: [] })).then(() => ({ ok: true }))
    : msg.type === 'mem-save' ? loadMem(msg.site).then((m) => saveMem(msg.site, { ...m, ...msg.mem })).then(() => ({ ok: true })) // settings page: user edits
    : msg.type === 'mem-list' ? chrome.storage.local.get(null).then((all) => ({ sites: Object.keys(all).filter((k) => k.startsWith('mem:')).map((k) => ({ key: k.slice(4), label: all[k]?.label || '' })) }))
    : msg.type === 'start' ? inject(msg.tabId).then(() => ({ ok: true }))
    : msg.type === 'cancel' ? Promise.resolve({ cancelled: cancel(msg.tag) })
    : msg.type === 'correct' ? correct(msg)
    : msg.type === 'series-info' ? seriesInfo(msg).catch(() => ({ key: '' }))
    : msg.type === 'move' ? moveLine(msg)
    : msg.type === 'probe-text' ? probeText(msg).then((sample) => ({ sample }))
    : msg.type === 'fetch-image' ? fetchImage(msg.url) // page canvas tainted by a cross-origin image: hand it clean bytes
    : null;
  if (!job) return;
  job.then(send, (e) => send({ error: String(e.message || e) }));
  return true; // keep channel open for async reply
});

// ---------- placement learnt from the reader ----------
// Dragging a translation (content.js) saves its spot for that page and records how far the model's own box
// for that line was from it. When a model's boxes keep landing off the same way (4+ corrections, mostly the
// same direction, 0.8%+ of the page), new pages get that offset applied to the model's boxes before the pixel
// fit snaps them onto the lettering. Per model, last 40 corrections; one-off fixes cancel out.
const lineKey = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
async function moveLine({ key, text, box }) {
  if (!key || !Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return { ok: false };
  const hit = (await chrome.storage.local.get(key))[key];
  if (!hit) return { ok: false };
  hit.moves = { ...(hit.moves || {}), [lineKey(text)]: box.map((v) => +v.toFixed(2)) };
  await chrome.storage.local.set({ [key]: hit });
  const raw = hit.bubbles.find((b) => lineKey(b.text) === lineKey(text)) || hit.bubbles.find((b) => lineKey(b.text).includes(lineKey(text)) && lineKey(text).length >= 6);
  const { provider = 'anthropic', models = {} } = await chrome.storage.local.get(['provider', 'models']);
  if (raw && models[provider]) {
    const dx = box[0] + box[2] / 2 - (raw.x + raw.w / 2), dy = box[1] + box[3] / 2 - (raw.y + raw.h / 2);
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) { // farther = a different bubble, not an offset
      const pk = 'place:' + provider + '/' + models[provider];
      const list = ((await chrome.storage.local.get(pk))[pk] || []).concat({ dx: +dx.toFixed(2), dy: +dy.toFixed(2) }).slice(-40);
      await chrome.storage.local.set({ [pk]: list });
    }
  }
  return { ok: true };
}
// The model's consistent offset, if the reader's corrections show one: [dx, dy] in % of the page, or null
async function learntOffset(model) {
  const list = (await chrome.storage.local.get('place:' + model))['place:' + model] || [];
  if (list.length < 4) return null;
  const axis = (k) => {
    const v = list.map((d) => d[k]).sort((a, z) => a - z), med = v[v.length >> 1];
    const same = v.filter((x) => Math.sign(x) === Math.sign(med)).length / v.length;
    return Math.abs(med) >= 0.8 && same >= 0.7 ? med : 0;
  };
  const dx = axis('dx'), dy = axis('dy');
  return dx || dy ? [dx, dy] : null;
}
async function shiftByLearnt(bubbles, model, part) {
  if (part || !bubbles.length) return bubbles; // recovery crops have their own coordinates
  const off = await learntOffset(model).catch(() => null);
  if (!off) return bubbles;
  return bubbles.map((b) => ({ ...b, x: Math.min(100 - b.w, Math.max(0, b.x + off[0])), y: Math.min(100 - b.h, Math.max(0, b.y + off[1])) }));
}

// Which series a MangaDex chapter belongs to, from MangaDex's own API: the reader page draws its link to the
// series late (or not at all while loading), and the page then fell back to one memory for the whole site
// (live report: "mangadex.org (cả site)" collecting what belonged to several series).
const seriesCache = new Map();
async function seriesInfo({ url }) {
  const m = String(url || '').match(/^https?:\/\/(?:www\.)?mangadex\.org\/chapter\/([0-9a-f-]{36})/i);
  if (!m) return { key: '' };
  if (seriesCache.has(m[1])) return seriesCache.get(m[1]);
  const r = await fetch(`https://api.mangadex.org/chapter/${m[1]}?includes[]=manga`, { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  const manga = (j?.data?.relationships || []).find((x) => x.type === 'manga');
  if (!manga?.id) return { key: '' };
  const t = manga.attributes?.title || {};
  const label = t.en || t['ja-ro'] || Object.values(t)[0] || (manga.attributes?.altTitles || []).map((x) => Object.values(x)[0]).find(Boolean) || '';
  const out = { key: `mangadex.org/title/${manga.id.toLowerCase()}`, label: String(label).slice(0, 120) };
  seriesCache.set(m[1], out);
  return out;
}

// Settings: check a model for the text-only rewrite (no image) with one stiff line it must fix.
async function probeText({ provider, key, model, base }) {
  const raw = await providerFor(provider, base).translate(key, model, null,
    'Các bong bóng:\n' + JSON.stringify([{ src: '¿Por cuánto vendió mi papá la montaña?', who: 'cậu bé → chú (người lớn)', draft: 'Bố tôi đã bán ngọn núi với giá bao nhiêu?' }]),
    PROBE_TIMEOUT_S, POLISH_JOB);
  const out = JSON.parse(String(raw).replace(/^\s*```(?:json)?|```\s*$/g, ''));
  const line = (Array.isArray(out) ? out : out.lines)?.[0];
  if (typeof line !== 'string' || !line.trim()) throw new Error('Model không trả về câu viết lại.');
  return line.trim();
}

// The reader fixed a line on the page: keep the fix in the cached page (F5 shows it) and in the series
// memory as an example the next pages imitate - the only "learning" an API model can do.
async function correct({ site, key, src = '', ai = '', fix = '', seriesLabel = '' }) {
  fix = String(fix).trim();
  if (!fix || fix === ai) return { ok: true };
  if (key) {
    const hit = (await chrome.storage.local.get(key))[key];
    if (hit) {
      // the page may show a cached line split over several bubbles (fit.js splitMerged): the fixed piece is
      // then part of a cached line - replace just that part, never the whole line by its shared src
      let i = hit.bubbles.findIndex((b) => b.text === ai);
      let text = fix;
      if (i < 0 && ai) { i = hit.bubbles.findIndex((b) => b.text.includes(ai)); if (i >= 0) text = hit.bubbles[i].text.replace(ai, fix); }
      if (i < 0 && src) i = hit.bubbles.findIndex((b) => b.src === src);
      if (i >= 0) { hit.bubbles[i] = { ...hit.bubbles[i], text }; await chrome.storage.local.set({ [key]: hit }); }
    }
  }
  if (site) {
    const m = await loadMem(site);
    m.examples = (m.examples || []).filter((e) => e.ai !== ai).concat({ src: String(src).slice(0, 200), ai: String(ai).slice(0, 200), fix: fix.slice(0, 200) });
    if (seriesLabel) m.label = seriesLabel; // a memory created by a correction had no name (shown as an id)
    await saveMem(site, m);
  }
  return { ok: true };
}

// ---------- starting a tab: popup button, keyboard shortcut, or a site the user set to auto-translate ----------
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
async function inject(tabId, quiet = false) {
  // every start says how it was started: a manual press after an auto start must count as manual (it binds
  // translation to the series you pressed on - content.js), and an auto start stays quiet
  await chrome.scripting.executeScript({ target: { tabId }, func: (q) => { window.__mdQuiet = q; }, args: [!!quiet] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['fit.js', 'text.js', 'series.js', 'content.js'] });
}
// Auto sites: every page load on a host the user switched on starts translating by itself, so a reader
// never has to open the popup per chapter. quiet: no "no manga page here" notice on the site's other pages.
// same as MD_READER in series.js: a chapter page, not the site's home/search/series pages
const READER_URL = /\/(chapter|chap|ch|read|reader|viewer|episode|ep)(\/|[-_.]?\d)|[-_](chapter|chap|ch|episode|ep)[-_.]?\d/i;
chrome.tabs?.onUpdated.addListener(async (tabId, info, tab) => {
  // 'complete' = full page load; info.url alone = a single-page site moving into a chapter (MangaDex)
  if ((info.status !== 'complete' && !info.url) || !/^https?:/.test(tab.url || '')) return;
  if (!READER_URL.test(new URL(tab.url).pathname)) return; // home page, search, series page: nothing to read
  const { autoSites = [] } = await chrome.storage.local.get('autoSites');
  if (autoSites.includes(hostOf(tab.url))) inject(tabId, true).catch(() => {});
});
chrome.commands?.onCommand.addListener(async (cmd) => {
  if (cmd !== 'translate-tab') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) inject(tab.id).catch(() => {});
});
