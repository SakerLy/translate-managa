# Manga Dịch

Extension Chrome/Brave dịch truyện tranh (manga, manhwa, manhua) sang tiếng Việt ngay trên trang đọc truyện. Extension gửi ảnh trang truyện cho một model AI có khả năng nhìn ảnh, rồi đặt bản dịch đè lên đúng các bong bóng thoại.

Thử nghiệm chủ yếu trên [MangaDex](https://mangadex.org), nhưng chạy được trên mọi trang hiển thị trang truyện bằng thẻ `<img>`.

## Tính năng

- **Dịch đúng chỗ:** mỗi câu dịch nằm trên bong bóng thoại của nó, chữ tự co cho vừa ô. Bấm vào một ô để ẩn hoặc hiện bản dịch và xem chữ gốc.
- **Văn phong tự nhiên:** xưng hô theo quan hệ nhân vật (tớ/cậu, anh/em, ta/ngươi…), giữ tên riêng và hậu tố -san/-kun, phân biệt lời nói, lời nghĩ thầm và lời dẫn truyện. Lời thoại của trang trước được gửi kèm để xưng hô nhất quán.
- **Bước trau chuốt văn phong (tắt được):** một lượt gọi thứ hai, chỉ gửi chữ (không gửi ảnh), viết lại câu dịch cho tự nhiên. Bước này đối chiếu với chữ gốc để không đổi nghĩa.
- **Dịch tự động khi đọc:** trang đang xem được dịch trước, sau đó tới 2 trang kế tiếp, tối đa 3 request cùng lúc. Lật hoặc cuộn tới đâu dịch tới đó. Chạy được ở cả chế độ đọc từng trang, cuộn dọc và cuộn ngang của MangaDex.
- **Không dịch lại trang cũ:** bản dịch được lưu theo nội dung ảnh, nên quay lại trang cũ hay tải lại trang (F5) không tốn thêm token.
- **Nhiều nhà cung cấp AI:** Anthropic (Claude), OpenAI (GPT), Google (Gemini), OpenRouter (DeepSeek, Grok, Qwen, Llama… và các model miễn phí).
- **Tự chọn model:** popup lấy danh sách model mà key của bạn dùng được, gọi thử thật từng model bằng một ảnh có 2 bong bóng ở vị trí biết trước, rồi chọn model **nhanh nhất trong số đọc đúng chữ và đặt đúng ô**.

## Cài đặt

1. Tải mã nguồn: `git clone` repo này, hoặc tải file ZIP rồi giải nén.
2. Mở `chrome://extensions` (Brave: `brave://extensions`, Edge: `edge://extensions`).
3. Bật **Developer mode**.
4. Bấm **Load unpacked** và chọn thư mục **`manga-dich`** (không phải thư mục gốc của repo).

## Sử dụng

1. Bấm icon **Manga Dịch** trên thanh công cụ.
2. Chọn **nhà cung cấp AI**, dán **API key**, rồi bấm **Lưu key & tải model**. Lần đầu popup sẽ gọi thử các model, mất khoảng 10 giây tới 2 phút, sau đó tự chọn model tốt nhất. Bạn có thể đổi model khác trong danh sách; model bạn chọn cũng sẽ được gọi thử trước khi lưu.
3. Mở chương truyện, chờ ảnh tải xong, rồi bấm **Bật dịch tự động cho tab này**.
4. Đọc bình thường. Góc trên mỗi trang hiện "Đang dịch… Ns" trong lúc chờ. Nếu một trang bị lỗi, bấm lại nút trong popup để thử lại.

Sau khi cập nhật extension (bấm ⟳ trong trang extensions), hãy **tải lại trang truyện (F5)** để trang dùng code mới.

## Chọn nhà cung cấp và model

| Nhà cung cấp | Lấy key ở | Ghi chú |
|---|---|---|
| Google Gemini | [aistudio.google.com](https://aistudio.google.com) | Có gói **miễn phí**. Dòng `flash-lite` nhanh nhất trong các lần thử. |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | Một key dùng được hàng trăm model. Các model có đuôi `:free` miễn phí nhưng giới hạn 50 request/ngày (1.000/ngày nếu tài khoản đã nạp tổng cộng từ 10 USD). |
| Anthropic | [console.anthropic.com](https://console.anthropic.com) | Trả phí. |
| OpenAI | [platform.openai.com](https://platform.openai.com) | Trả phí. |

Kết quả đo ngày 17/11/2026 trên **một** trang MangaDex có 14 bong bóng. Mỗi lần chạy model trả về hơi khác nhau, nên các con số dưới đây chỉ để tham khảo:

| Model | Thời gian/trang | Bong bóng có ô dịch | Ô dịch đúng chỗ |
|---|---|---|---|
| `gemini-3.5-flash-lite` (miễn phí) | 3,5s | 100% | 100% |
| `gemini-3.1-flash-lite` (miễn phí) | 3–6s | 79–100% (trung bình 93%) | 92–100% |
| `particle-ai/particle-1:free` (OpenRouter, miễn phí) | 25s | 100% | 100% |
| `openai/gpt-6-luna` (OpenRouter) | 25s | 100% | 100% |
| `anthropic/claude-haiku-5.5` (OpenRouter) | 22s | 93% | 100% |

Model mạnh hơn thì bước trau chuốt văn phong cũng làm tốt hơn, nhưng chậm hơn.

## Chi phí token

Mỗi trang gồm ảnh, lời dặn (khoảng 290 token) và lời thoại trang trước. Extension không gửi HTML hay nội dung nào khác của trang web. Số đo với `gemini-3.1-flash-lite`:

| Chế độ | Request/trang | Token/trang (khoảng) |
|---|---|---|
| Tắt trau chuốt | 1 | 2.000 |
| Bật trau chuốt (mặc định) | 2 | 4.000 |

Với hai model Gemini đã đo (`3.1-flash-lite`, `3.5-flash-lite`), token ảnh cố định ở 1.092 token/ảnh bất kể kích thước ảnh. Thu nhỏ ảnh đã được thử và **không tiết kiệm token**, còn làm giảm độ chính xác. Với `particle-1:free`, ảnh nhỏ còn khiến model suy nghĩ nhiều hơn. Vì vậy extension gửi ảnh ở kích thước gốc (cạnh dài tối đa 1.568px).

## Quyền riêng tư

- API key chỉ lưu trong `chrome.storage.local` trên máy bạn và chỉ được gửi tới nhà cung cấp bạn chọn.
- Ảnh trang truyện được gửi tới nhà cung cấp AI đó để dịch. Chính sách lưu dữ liệu tuân theo điều khoản của nhà cung cấp.
- Extension không có máy chủ riêng và không thu thập dữ liệu.

## Giới hạn đã biết

- Vị trí ô dịch là do model ước lượng. Đôi khi model gộp 2 bong bóng sát nhau thành một ô, bỏ sót bong bóng nhỏ, hoặc ô hơi nhỏ khiến lộ một ít chữ gốc ở mép.
- Model nhỏ (`flash-lite`) đôi khi chưa thống nhất xưng hô trong cả trang.
- Hiệu ứng âm thanh (SFX) chỉ được dịch khi ngắn và có nghĩa.
- Ảnh hiển thị nhỏ hơn 200px (ảnh đại diện, ảnh bìa nhỏ) được bỏ qua.
- Gemini miễn phí đôi khi báo "high demand" (quá tải tạm thời); thử lại sau hoặc chọn model khác.

## Cấu trúc mã nguồn

```
manga-dich/          ← thư mục extension (Load unpacked thư mục này)
  manifest.json      Manifest V3
  background.js      Gọi API các nhà cung cấp, đọc kết quả, trau chuốt văn phong, bộ nhớ đệm, gọi thử model
  content.js         Chọn trang cần dịch, mã hóa ảnh, vẽ lớp bản dịch lên trang
  popup.html/.js     Chọn nhà cung cấp, key, model, bật/tắt trau chuốt
test-background.js   Test unit (không gọi mạng, chỉ cần node)
test-live.js         Test thật: dịch một trang, chấm vị trí ô dịch theo đáp án
test-probe.js        Test thật bước gọi thử model của popup
test-polish.js       Test thật bước trau chuốt văn phong
test-tokens.js       Đo token thật theo kích thước ảnh
draw-boxes.py        Vẽ ô của model (đỏ) và đáp án (xanh) lên ảnh để xem bằng mắt
draw-probe.py        Tạo ảnh 2 bong bóng dùng cho test-probe.js
test-fixtures/page4.truth.json   Vị trí 14 bong bóng của trang test, đo tay
```

## Chạy test

Cần [Node.js](https://nodejs.org) 18 trở lên. Các script `.py` cần Python và Pillow (`pip install pillow`).

```bash
node test-background.js
```

Test thật cần API key. Tạo file `.env` ở thư mục gốc (đã nằm trong `.gitignore`):

```
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
```

Ảnh trang truyện dùng để test **không có trong repo** vì thuộc bản quyền của tác giả và nhóm dịch. Hãy tự lưu một trang truyện thành `test-fixtures/page4.png`. File đáp án `page4.truth.json` khớp với trang 4, chương 12 của *Bijin de Okane Mochi no Kanojo ga Hoshii to Ittara…* trên MangaDex (ảnh 768×1087). Nếu dùng trang khác, hãy tự đo lại đáp án rồi kiểm tra bằng `draw-boxes.py`.

```bash
node test-live.js test-fixtures/page4.png
```

```bash
python draw-probe.py test-fixtures/probe.png
```

```bash
node test-probe.js gemini gemini-3.1-flash-lite
```

`test-live.js` chấm điểm vị trí: một trang **ĐẠT** khi ít nhất 80% bong bóng có ô dịch đặt lên và ít nhất 80% ô dịch nằm đúng một bong bóng. Có thể đặt `ONLY=gemini` để chỉ test một nhà cung cấp, và `MODEL_GEMINI=tên-model` để test một model cụ thể.

## Giấy phép

Copyright (C) 2026 SakerLy

Chương trình này là phần mềm tự do: bạn có thể phân phối lại và/hoặc sửa đổi nó theo các điều khoản của **GNU General Public License phiên bản 3** do Free Software Foundation công bố. Chương trình được phân phối với hy vọng sẽ hữu ích, nhưng **KHÔNG CÓ BẤT KỲ BẢO ĐẢM NÀO**. Xem chi tiết trong file [LICENSE](LICENSE).

Extension này chỉ là công cụ hỗ trợ đọc. Bản quyền nội dung truyện thuộc về tác giả, nhà xuất bản và nhóm dịch. Hãy ủng hộ bản chính thức khi có thể.
