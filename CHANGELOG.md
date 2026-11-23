# Changelog

Mọi thay đổi đáng chú ý của Manga Dịch. Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số theo [Semantic Versioning](https://semver.org/lang/vi/).

**Quy ước phát hành:** thay đổi mới được gom vào mục "Chưa phát hành". Chỉ khi chủ dự án đã test và đồng ý thì mới chốt số phiên bản và đẩy lên. Trong lúc chờ, popup và trang cài đặt hiện số phiên bản kèm `-beta`.

Các bản tạm "ver 0.6.0" … "ver 0.8.0" (19–20/11/2026) chưa được test và chưa từng được phát hành; chúng đã được gộp thành một commit "0.6.0-beta", nội dung nằm trong mục dưới đây.

## [Chưa phát hành] - dự kiến 0.6.0

### Thêm
- **Xoá chữ gốc thay vì phủ khối trắng:** bong bóng được xoá theo đúng hình của nó (giữ viền và tranh), chữ thường được xoá từng nét; bản dịch vẽ bằng font truyện tranh Mali (đủ dấu tiếng Việt), xếp dòng theo dáng bong bóng.
- **Chữ nghiêng theo chữ gốc:** thư tay, biển hiệu viết chéo thì bản dịch cũng nghiêng đúng góc (đo từ điểm ảnh, không tốn token).
- **Nút "+" ở chỗ còn chữ chưa dịch:** bấm để dịch riêng chỗ đó; chỉ hiện ở chỗ điểm ảnh xác nhận là chữ.
- **Trí nhớ AI theo bộ truyện mở rộng:** danh sách nhân vật, học từ câu bạn sửa (bấm đúp vào bản dịch), model trau chuốt riêng.
- **Kéo để chỉnh vị trí bản dịch:** kéo một ô để di chuyển, Shift+kéo để đổi cỡ. Vị trí được nhớ cho trang đó (F5 vẫn giữ). Extension so chỗ bạn đặt với chỗ AI đặt ban đầu; khi một model liên tục đặt lệch cùng một hướng (từ 4 lần sửa, ít nhất 0,8% trang), các trang sau tự dời ô của model đó theo độ lệch ấy trước khi khớp vào chữ.
- **Đánh số khối chữ trên ảnh gửi cho AI** (học từ các bộ dịch manga mã nguồn mở: máy tự tìm chữ, AI chỉ đọc và dịch). Chữ extension tìm được bằng điểm ảnh được đóng khung đỏ đánh số trên bản ảnh gửi đi; AI ghi số khung cho từng câu và câu đó được đặt đúng vào khung, không phụ thuộc toạ độ AI đoán. Chữ không có khung (chữ trắng nền đen, SFX…) vẫn dùng toạ độ của AI như cũ. Thử với GPT: trang từng bị đảo x/y hàng loạt giờ đặt đúng mọi câu; "I WONDER WHO…" về đúng chỗ thay vì bị gán sang chữ "THROB".
- **Cài đặt số trang dịch trước** (0–10).
- Hiện số phiên bản trong popup và trang cài đặt.

### Thay đổi
- Chỉ dịch trang bên trong chapter; trang chủ, trang giới thiệu bộ truyện, tìm kiếm không bao giờ gửi cho AI.
- **Bấm dịch thủ công chỉ áp dụng cho bộ truyện đang mở:** sang bộ khác, ra trang chủ hay trang giới thiệu thì dừng và nhắc bấm lại; chapter tiếp theo của cùng bộ vẫn dịch. Site bật tự dịch không đổi.
- Nhanh hơn: dịch bù chạy song song với bước trau chuốt; lượt trau chuốt thứ hai chỉ ở các trang đầu của bộ.
- Lượt đọc ảnh được lưu ngay khi xong: F5 hay lỗi giữa chừng không gửi lại ảnh.
- Bỏ quy tắc "bỏ qua chữ mờ (hồi tưởng)" khỏi câu lệnh gửi AI (làm Gemini bỏ sót 8% bong bóng: 89 so với 97 câu trên 8 trang); chữ hồi tưởng do extension tự nhận ra bằng điểm ảnh.
- Groq dùng chế độ JSON object (chế độ nghiêm ngặt làm hỏng câu trả lời của qwen3.8 2/5 lần); model chỉ đọc chữ (gpt-oss) dùng được làm model trau chuốt.

### Sửa lỗi
**Đặt chữ và xoá chữ**
- Lớp phủ trắng tràn ra ngoài bong bóng: ô lớn hơn bong bóng được xoá theo hình bong bóng; khi không xoá được thì khối phủ chỉ che phần có chữ; ô bị nới sang hoạ tiết bên cạnh (tim, tóc) được cắt về đúng phần chữ.
- Chữ gốc dính viền bong bóng còn sót; "bóng ma" xám của chữ đã xoá; ô chồng nhau vẽ lại chữ gốc đã xoá.
- Chữ dịch đè lên nhau khi một ô phình qua dòng chữ bên cạnh.
- Lớp phủ tràn khỏi bong bóng ở chapter 66dcdbac/8 (kiểm tra trên trang MangaDex thật): một đốm 3 nét (trái tim ở mép) làm extension tưởng chữ rộng gấp rưỡi nên không cắt ô 50% trang về đúng bong bóng; câu do lượt dịch bù đặt vào cũng không được cắt. Giờ mọi ô bong bóng đều được cắt về đúng phần chữ.
- Chữ hét vẽ trên tranh mà không xoá được (nét chữ dính vào hình, ví dụ "AARGHHH!!" dính mặt nhân vật ở 66dcdbac/9) bị phủ cả khối đen che mặt: giờ bản dịch nằm trên một dải ngang giữa chữ gốc, phần chữ gốc trên và dưới vẫn hiện như chú thích SFX.
- Bong bóng chỉ có "!" / "?!" / "…": model bịa ra một câu ("Hả?!") hoặc lượt dịch bù trả "..." rồi vẽ thành dải trắng lên tóc, mặt nhân vật; giờ bỏ qua.
- Chữ gốc còn sót ở trang 66dcdbac/9 (kiểm tra trên trang thật): vùng xoá của khung "BECAUSE SHE WAS—" bị gộp sang bong bóng bên cạnh nên xoá nhầm chỗ, khung giữ nguyên chữ Anh; bong bóng "ALL RIGHT, THEN…" bị cắt về một chữ nhỏ nên phần lớn chữ gốc không được xoá và bản dịch bị ép tí hon.
- Hai bong bóng sát nhau / hai thùy của một bong bóng bị gộp thành một câu: tách lại về đúng chỗ.
- Tiêu đề, credit, khung chữ trắng nền đen bị lật nhầm trục hoặc dời sang bong bóng khác.
- Chữ gốc dọc không còn dựng chữ Việt theo chiều dọc; cỡ chữ dịch không dưới ~13px; khung dẫn truyện không in nghiêng.

**Bỏ sót chữ**
- Dịch bù của trang đang đọc phải chờ các trang sau dịch xong mới chạy: lượt dịch bù không được ưu tiên nên xếp cuối hàng, sau các trang đọc trước. Giờ dịch bù của trang đang hiện trên màn hình và mọi lần bấm "+" đều được ưu tiên, có một chỗ chạy dự phòng riêng (việc thường vẫn tối đa 2 lượt gọi cùng lúc).
- Bộ dò chữ bằng điểm ảnh bỏ sót bong bóng nên dịch bù không biết mà dịch (đo trên trang thật có đáp án: 20/28 → 23/28 bong bóng, chữ Nhật 7 → 1 trên 14 khối bị sót, không thêm khối giả nào trên trang không chữ):
  - dấu chấm/phẩy làm dòng chữ ("MASA SIH?!") bị coi là "chiều cao lẫn lộn";
  - chữ nhỏ viết sát nhau bị loại vì chữ bên cạnh làm hỏng phép thử "chữ nằm trên giấy";
  - chữ to ("MA·KA·NYA...") bị coi là nét vẽ vì ngưỡng tính theo cạnh ngắn của trang;
  - chữ đen nhỏ qua nén JPEG bị gắn nhầm "chữ mờ hồi tưởng" và không bao giờ được dịch bù;
  - chữ Hán/kana bị tách thành từng nét rời (và nét đặc như 一, 丨 bị loại), nên cả dòng chữ Nhật bị bỏ.
- Chữ dịch bị cắt mất dòng đầu và dòng cuối khi dài hơn ô: cỡ chữ giờ được kiểm tra trên trang thật (không chỉ trên canvas), và khi nhỏ nhất vẫn không vừa thì ô tự nới ra theo chữ thay vì cắt.
- GPT trả toạ độ hỏng (lặp cạnh phải, chỉ 3 số, sai thứ tự) làm mất câu: được sửa lại rồi khớp vào bong bóng.
- Nét tranh dưới câu ngắn bị tính là chữ làm mất câu ("...AH...").
- Dịch bù đọc lại một phần khung chữ đã dịch nên hiện hai bản dịch.
- Model đặt nhiều câu vào cùng một ô (gộp còn 1/12 câu); một câu lặp ở nhiều ô; model chép lại câu lệnh; toạ độ theo pixel.

**Kiểm tra trên trình duyệt thật với GPT (gpt-6.1-sol), 3 bộ truyện**
- GPT trả nhiều ô bị đảo x/y trên cùng một trang: ô chỉ có vài nét lạc ở chỗ sai giờ cũng được đảo khi phía đối xứng rõ ràng có chữ; ô cao gầy vô lý cho một dòng chữ Latin được đảo theo hình dạng khi trang đã có ô bị đảo.
- Ô của GPT đặt nhầm lên chữ của bong bóng khác (bản dịch một khung dẫn chuyện thay mất câu của bong bóng): ô khớp kém hơn hẳn bị bỏ, không ghi đè bong bóng bên cạnh.
- SFX: không còn bị dời lên khối chữ khác (đã rơi lên mặt nhân vật); SFX nằm lên chữ của bong bóng thì thử vị trí đối xứng, không thì bỏ; SFX không xoá được hiện thành chữ viền, không còn khối trắng che tranh.
- Chữ xoá từng nét còn để lại viền mờ của chữ gốc: xoá rộng thêm phần viền nhoè của JPEG trên nền giấy.
- Dòng cuối của chữ to/hét bị bỏ sót khi xoá ("YOU." dưới "I'LL KILL"); một nửa của bong bóng hai cụm chữ bị cắt về một chữ nhỏ (chữ Anh còn nguyên, bản dịch tí hon); chữ trên tranh bị nới theo nét gạch bóng tới mặt nhân vật.
- Chữ hét trên tranh được GPT gắn nhãn "big" cũng dùng dải ngang thay khối đen.
- Ô tự nới khi chữ Việt dài hơn không còn nới đè lên bản dịch bên cạnh (cả bước đồng đều cỡ chữ trên trang).
- Các dòng credit/dẫn chuyện xếp sát nhau không còn mất một dòng vì bị coi là "ô lạc chỗ".

**Biên tập như nhóm dịch chuyên nghiệp**
- Bước trau chuốt có thêm quy tắc của editor/typesetter: câu dịch không dài hơn bản nháp (bong bóng không to ra), tên katakana phiên âm Latin chứ không đổi thành từ tiếng Anh, dấu câu kiểu sách Việt ("…", "?!", "—"), SFX 1-3 âm tiết tượng thanh tiếng Việt.
- Ngắt dòng không để một chữ lẻ trơ trọi ở dòng cuối của bong bóng.

**Kiểm tra với GPT trên 4 bộ manga Nhật mới (MangaDex)**
- Trang scan độ phân giải thấp (650×924) được phóng to tối đa 1,6 lần trước khi phân tích và gửi cho model: chữ nhỏ nét mảnh trước không xác minh được nên bản dịch bị dời đi chỗ khác.
- Chữ viết tay liền nét ("OUCH" một nét liền) được nhận là một từ, không còn bị coi là "không có chữ" rồi dời bản dịch lên tóc nhân vật.
- Chữ viết ngay dưới bong bóng (phần tiếp của câu trong bong bóng) không còn bị dịch bù thành một mẩu riêng ("Làm…"): lượt dịch bù chép lại câu đã có, câu đó giữ nguyên chỗ và xoá luôn phần chữ tiếng Anh bên dưới.
- Lượt dịch bù: bỏ câu bịa ra từ một vết bẩn (vết máu trên băng đầu thành "Tôi…"), bỏ câu chỉ đọc lại một phần bong bóng đã dịch ở chỗ khác.
- Bong bóng xoá còn sót cả một dòng chữ gốc (từ 20% nét chữ trở lên; bong bóng xoá tốt còn 0-12%) được thay bằng tấm nền phủ kín; nét chữ thuộc câu khác trong cùng bong bóng không bị tính là sót.
- Ô một dòng chữ Latin cao gấp 4 lần bề ngang (GPT đảo x/y, như "RIGHT…?") được đảo lại kể cả khi trang không có ô đảo nào khác.
- Ô chữ trên tranh mà model khoanh quá rộng (nửa khung truyện) lại bị bỏ như trước, để lượt dịch bù dịch đúng chỗ chữ thật.

**Kéo ô bản dịch**
- Chữ tự thu nhỏ khi kéo: ô kéo đi bắt đầu từ cỡ lưu ban đầu thay vì cỡ đang hiện (đã được nới cho vừa chữ Việt). Giờ giữ đúng cỡ đang thấy; ô bạn đã đặt cũng không bị tự nới hay tự chỉnh cỡ chữ theo trang nữa.

**Trang tiêu đề (logo, phụ đề, credit)**
- GPT hay chuyển sang trả toạ độ đảo x/y từ giữa câu trả lời trở đi; ô không kiểm chứng được bằng điểm ảnh (logo, credit) giờ đi theo các ô quanh nó trong câu trả lời: trước và sau đều bị đảo thì đảo theo. Logo, phụ đề và ba dòng credit về đúng chỗ.
- Sau khi xoá, extension kiểm tra còn bao nhiêu nét chữ gốc lộ ra (đo trên trang thật: bong bóng còn 0-1%, logo xoá dở còn 15%, phụ đề 44%). Khung chữ trên nền sáng còn sót nhiều thì thay bằng một tấm nền phủ kín vùng chữ, như thợ dịch làm với logo không vẽ lại được; tấm nền không lấn sang bản dịch bên cạnh và không bao giờ dùng trên nền tối.

**Xưng hô và trí nhớ**
- Hết lượt cả ngày ("retry in 17h…", Gemini miễn phí) bị hiểu thành chờ 17 giây: mỗi trang treo ~35 giây và gọi thêm 2 lần vô ích; giờ báo lỗi ngay.
- Sửa trí nhớ trong trang cài đặt trong lúc đang dịch có thể xoá mất cặp xưng hô/nhân vật AI vừa học: giờ chỉ lưu đúng ô bạn sửa.
- Trí nhớ không học được gì khi bước trau chuốt lỗi liên tục (hết lượt theo phút của Groq, gateway lỗi): trang giờ báo rõ "chưa trau chuốt được, AI chưa học từ trang này"; lỗi giới hạn theo phút được chờ hết phút thay vì thử lại ngay trong cùng phút.
- Nhân vật được biết tên sau (ví dụ "Akasumi Goro (thầy giáo)") thay dòng "Thầy giáo" cũ và đổi tên trong bảng xưng hô, không để hai dòng song song.
- Thêm quy tắc xưng hô: giới tính, khoảng cách tuổi, người yêu chị em, thầy trò / chức danh chốt cả cặp, ngôi số nhiều, lời dẫn phải khớp lời thoại; các trang của một bộ được trau chuốt lần lượt để trang sau dùng điều trang trước vừa học.
- Trí nhớ bị ghi đè mỗi trang (mất cặp xưng hô và nhân vật cũ): giờ gộp.
- Tên bộ truyện sai (mã ID, dính thẻ mô tả) và trí nhớ dồn vào "cả site": tên lấy từ tiêu đề tab, bộ truyện MangaDex lấy từ API; tên cập nhật cả khi mở trang đã dịch; trang cài đặt tự cập nhật.
- Bảng xưng hô bị nhồi cả khối trí nhớ khi lượt trau chuốt không trả bảng mới.

**Ổn định và hiệu năng**
- Giật lag khi dịch: tổng thời gian treo trang từ 9,5 giây còn 0,8 giây trên cùng một trang.
- Hết lượt "Reset after…" viết hoa / "try again in 18s" không được chờ; hết lượt kéo dài bị chờ chồng (9 lần gọi còn 3).
- Model "suy nghĩ" kèm `<think>`/câu dẫn trước JSON, câu trả lời bị cắt giữa chừng.
- "Extension context invalidated" sau khi cập nhật extension; popup tràn ngang; "dịch trước = 0" vẫn dịch trước.

### Đang chờ kiểm tra
Những lỗi bạn đã báo mà bản sửa chưa được xác nhận trên trang thật:
- Lớp phủ tràn ra ngoài bong bóng: trang 66dcdbac/8 đã hết tràn trên trình duyệt thật với Gemini và Groq qwen; chưa thử được với GPT (gateway và OpenRouter hết credit).
- Xoá chữ còn sót ở trang 66dcdbac/9: đã sạch trên trình duyệt thật với Gemini.
- Khối phủ trên chữ viết thẳng lên tranh (cố ý chưa thu nhỏ: có thể để lộ chữ gốc).
- Bỏ sót bong bóng với một số model.
- Tên bộ truyện và trí nhớ xưng hô trên MangaDex (chưa thử được trong trình duyệt do MangaDex chặn trình duyệt test).

## [0.5.4] - 2026-11-19
- Model gắn nhãn loại chữ (bong bóng/khung/chữ trên tranh/SFX).

## [0.5.3]
- Văn phong tự nhiên cho bản scan tiếng Tây Ban Nha/Anh, gộp ô gọn hơn.

## [0.5.2]
- Sửa vị trí ô trên trang JPEG thật.

## [0.5.1]
- Trí nhớ AI theo từng bộ truyện.

## [0.5]
- Chỉ tập trung manga; Base URL không mặc định /v1.
