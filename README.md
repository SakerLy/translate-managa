<div align="center">

# Manga Dịch

**Đọc manga bằng tiếng Việt: bản dịch hiện ngay trên bong bóng thoại, từ bản gốc tiếng Nhật hay bản scan tiếng Anh, Tây Ban Nha, Indonesia…**

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](manga-dich/manifest.json) [![Brave · Chrome · Edge](https://img.shields.io/badge/Brave%20%C2%B7%20Chrome%20%C2%B7%20Edge-supported-FB542B?logo=brave&logoColor=white)](#cai-dat) [![AI](https://img.shields.io/badge/AI-Gemini%20%C2%B7%20Claude%20%C2%B7%20GPT%20%C2%B7%20OpenRouter%20%C2%B7%20Groq-8E75B2)](#model) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

<img src="docs/demo.png" alt="Trước và sau khi bật Manga Dịch" width="820">

[Tính năng](#tinh-nang) · [Cài đặt](#cai-dat) · [Sử dụng](#su-dung) · [Model](#model) · [Cách hoạt động](#cach-hoat-dong) · [Hỏi đáp](#faq) · [Phát triển](#phat-trien)

</div>

---

<a id="tinh-nang"></a>

## Tính năng

### Dịch đúng, đọc như truyện Việt
- **Chỉ dành cho manga:** bản gốc tiếng Nhật, hoặc bản scan mà nhóm dịch nước ngoài đã chuyển sang tiếng Anh, Tây Ban Nha, Indonesia, Pháp… Bản scan vẫn được dịch theo văn phong manga, và kính ngữ bị nhóm dịch đổi (Miss Tanaka, señor) được trả lại thành Tanaka-san.
- **Văn phong manga:**
  - Giữ -san/-kun/-chan/-sama, senpai, sensei. Tên Nhật giữ romaji (Tanaka Yuki).
  - Cách tự xưng gợi giọng nhân vật: 俺 → tao/tôi, 僕 → tớ/em, わし → lão, 拙者 → tại hạ.
  - Theo thể loại: học đường/romcom (cậu/tớ, nhẹ nhàng), shounen (gọn, có lực), isekai/fantasy (mạo hiểm giả, ma vương, kỹ năng), seinen/kinh dị (câu chắc, giữ không khí), samurai/cổ trang (ta/ngươi, bệ hạ/thần).

- **Xưng hô đúng quan hệ:** lượt đọc ảnh ghi lại *ai nói với ai* ("em gái → anh trai"), rồi lượt trau chuốt áp bảng quy tắc xưng hô Việt:
  - gia đình: anh/em, chị/em, bố mẹ/con, ông bà/cháu
  - họ hàng: bác, chú, cô, cậu, dì
  - trường lớp: cậu/tớ, senpai, thầy cô
  - người lớn với học sinh: cô/chú - cháu (không bao giờ cậu/tớ)
  - công sở, người lạ, kẻ thù, samurai/fantasy

  Ví dụ đo thật: お兄ちゃん、遅いよ！ → "Anh hai, chậm quá đi!"; ông nói với hai cháu → "Ồ, cả hai đứa đến rồi à."; nữ sinh với mẹ bạn (bản scan Tây Ban Nha) → "Cháu cảm ơn cô đã đưa Momiji về ạ."
- **AI nhớ riêng từng bộ truyện:** bảng xưng hô (kèm quan hệ) và tên riêng được lưu cho từng bộ, nên đọc nhiều bộ trên cùng một site không bị lẫn xưng hô của bộ này sang bộ kia. Đổi chapter hay tắt trình duyệt vẫn đúng như trước. **Sửa tay được** trong trang cài đặt nếu AI ghi sai.
  - Bộ truyện được nhận ra từ link về trang bộ truyện (MangaDex) hoặc từ đường dẫn (`/manga/ten-bo/chapter-12`). Site nào không nhận ra được thì dùng chung một trí nhớ cho cả site, như trước.
  - Lưu ý: AI không tự huấn luyện lại. Nó "học" bằng cách đọc lại ghi chú của các trang trước mỗi khi dịch trang mới.
  - **Danh sách nhân vật** (tuổi, vai, quan hệ) được AI ghi dần qua các chương, để chọn xưng hô đúng ngay từ đầu.
- **Dạy AI bằng chính bản sửa của bạn:** bấm đúp vào một bản dịch trên trang để sửa. Bản sửa được lưu (F5 vẫn còn) và trở thành ví dụ mẫu: các trang sau của bộ đó bắt chước đúng giọng và xưng hô bạn muốn.
- **Model trau chuốt riêng:** model đọc ảnh nên nhanh, model viết lại câu nên giỏi tiếng Việt. Lượt trau chuốt chỉ gửi chữ nên dùng model mạnh vẫn nhanh. Văn phong phụ thuộc chủ yếu vào model này.
- **Không dịch word-by-word:** câu chào, cảm thán, câu đùa, thành ngữ được viết lại theo cách nói tự nhiên của tiếng Việt.

### Trang dịch trông như bản scan thật
- **Xoá chữ gốc thay vì phủ ô trắng:** từng nét chữ gốc được xoá và lấp bằng điểm ảnh xung quanh. Bong bóng trông như chưa từng có chữ, không còn khung chữ nhật. Chỗ nào không xoá sạch được (chữ dính vào hoạ tiết) thì tự quay về cách phủ nền.
- **Font truyện tranh** (Mali, giấy phép OFL, đủ dấu tiếng Việt) đi kèm extension; tắt được trong Cài đặt.
- **Xếp dòng theo dáng bong bóng:** dòng giữa dài, dòng đầu và cuối ngắn, như chữ của người làm truyện.
- **AI nhận ra dạng chữ** (bong bóng, khung dẫn truyện, chữ vẽ trên tranh, SFX) và chèn bản dịch theo từng dạng; chữ trên tranh có viền cho dễ đọc.

### Ô dịch khớp bong bóng, không sót chữ
- **Bám theo điểm ảnh:**
  - Ô dịch bắt đầu từ chính các nét chữ gốc, rồi nới ra hết lòng bong bóng, nên chữ Việt to dễ đọc và không tràn ra tranh.
  - Lấy đúng màu nền của khung (khung tối thì chữ trắng).
- **Tự sửa tọa độ sai của model:**
  - Model trả tọa độ đảo trục (x↔y, hay gặp với GPT/Claude qua cổng trung gian) → tự phát hiện và lật lại.
  - Bộ sửa đảo trục vẫn hoạt động ở cảnh tối nhiều lá, mưa, nét gạch: những nét có cỡ lộn xộn không bị tính là chữ.
  - Ô chỉ phủ một phần khối chữ gốc → nới ra phủ trọn khối.
  - Ô nằm trên tranh, không có chữ → dời về khối chữ thật gần nhất.
  - Ô khổng lồ phủ nửa trang → bỏ.
- **Cỡ chữ theo chữ gốc:**
  - Chữ dịch lấy chiều cao chữ gốc của bong bóng làm chuẩn, giống cách người làm chữ truyện làm.
  - Câu ngắn trong bong bóng rộng không bị phóng khổng lồ.
  - Câu dài trong bong bóng hẹp thì ô tự nới ra thay vì thu chữ li ti.
- **Dịch bù chữ bị sót:**
  - Tự dò các khối chữ còn nguyên chữ gốc mà chưa có bản dịch, cả chữ tối trên nền sáng lẫn chữ trắng trên nền đen.
  - Mọi vùng sót được ghép vào **một** ảnh gửi AI trong một lượt gọi (tối đa 8 vùng/trang), ở độ phân giải gốc.
  - Bản dịch bù đặt đúng vào khối chữ đã dò, không phụ thuộc toạ độ model trả về.
  - Câu bị chia qua nhiều bong bóng được chia bản dịch theo từng bong bóng, không bỏ trống bong bóng nào.
- **Một bong bóng một ô:** khi AI gộp lời của 2-3 bong bóng dính nhau thành một câu, extension nhìn viền bong bóng trên ảnh để chia lại từng câu về đúng bong bóng của nó (theo thứ tự đọc manga), chữ không bao giờ tràn qua viền.
- **Kéo để chỉnh chỗ đặt chữ:** kéo ô dịch để di chuyển, Shift+kéo để đổi cỡ; vị trí được nhớ, và nếu AI hay đặt lệch về một phía thì các trang sau tự bù độ lệch đó.
- **Nút "+" cho chỗ còn sót:** nếu vẫn còn chữ chưa dịch, một nút "+" mờ hiện đúng chỗ đó; bấm để dịch riêng chỗ ấy.
- **Chữ nghiêng theo chữ gốc:** thư tay, biển hiệu viết chéo thì bản dịch cũng nghiêng đúng góc đó.
- **Bỏ qua chữ hồi tưởng:** chữ in mờ/xám nhắc lại lời thoại cũ (hồi tưởng chapter trước, tiếng vọng) là phông nền, không dịch và không tốn lượt dịch bù.
- Ô trùng nhau được gộp, ô chồng nhau được tách. Bấm vào ô để xem lại chữ gốc.

### Dễ dùng
- **Tự dịch theo site:** bật một lần cho MangaDex (hay site bất kỳ), sau đó mở chapter nào là tự dịch, không cần bấm icon nữa.
- **Bấm thủ công chỉ dịch đúng bộ đang đọc:** khi bấm nút (không bật tự dịch cho site), extension chỉ dịch bộ truyện bạn đang đọc lúc bấm. Sang chapter tiếp theo của bộ đó vẫn dịch tiếp; sang bộ khác, ra trang chủ hay trang giới thiệu bộ truyện thì dừng và nhắc bấm lại.
- **Chỉ tốn token cho trang truyện:** chỉ dịch các trang bên trong chapter (`/chapter/…`, `/read/…`, `…-chapter-12`…). Trang chủ, trang bộ truyện (danh sách chapter), trang tìm kiếm, banner và ảnh bìa không bao giờ được gửi cho AI.
- **Dịch trước bao nhiêu trang tuỳ bạn** (cài đặt, mặc định 2): đọc tới đâu đã có bản dịch tới đó; đặt 0 để chỉ dịch trang đang hiện trên màn hình (ít tốn lượt gọi nhất).
- **Không mất tiền oan khi lỗi giữa chừng:** lượt đọc ảnh (đắt nhất) được lưu ngay khi xong. F5, cập nhật extension hay cổng API lỗi lúc đang trau chuốt thì lần sau chỉ chạy lại lượt trau chuốt chỉ có chữ, không gửi lại ảnh; nếu trau chuốt hỏng hẳn, trang vẫn hiện bản dịch nháp thay vì báo lỗi.
- **Phím tắt** <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> để dịch tab đang mở.
- **Huỷ bất cứ lúc nào:**
  - mỗi trang đang dịch có nút **Huỷ** ngay trên trang
  - popup có nút **Dừng dịch tab này** để dừng cả tab

  Trang chưa gửi đi sẽ không tốn lượt gọi API.
- **Trang cài đặt riêng, tự lưu khi gõ:** không còn cảnh bấm ra ngoài popup là mất key đang nhập dở.
- **Tự chọn model:** gọi thử từng model bằng một ảnh mẫu, chọn model nhanh nhất trong số đọc đúng chữ và đặt đúng ô.
- **Dịch trước trang kế tiếp:** trang đang xem được dịch trước, rồi tới 2 trang sau. Chạy được với kiểu đọc từng trang, cuộn dọc và cuộn ngang.
- **Không trả tiền hai lần:** trang đã dịch được lưu theo nội dung ảnh, quay lại hay F5 không tốn token. Trang không có chữ (bìa, minh họa) được bỏ qua.
- **Chịu lỗi cổng trung gian:** gặp "reset after 1m 50s" thì chờ đúng thời gian rồi tự gọi lại; lỗi hiện rõ nguyên nhân thật thay vì "Provider returned error".

<a id="cai-dat"></a>

## Cài đặt

> Extension chưa có trên Chrome Web Store, nên bạn cài bằng chế độ dành cho nhà phát triển.

1. **Tải mã nguồn:** bấm **Code → Download ZIP** rồi giải nén, hoặc `git clone https://github.com/SakerLy/translate-managa.git`.
2. Mở trang quản lý extension: `brave://extensions` · `chrome://extensions` · `edge://extensions`.
3. Bật **Developer mode**.
4. Bấm **Load unpacked** và chọn thư mục **`manga-dich`** *(không phải thư mục gốc của repo)*.

> [!TIP]
> Sau khi cập nhật code, bấm ⟳ ở trang extensions rồi **tải lại trang truyện (F5)**. Nếu quên, popup sẽ nhắc và có sẵn nút tải lại.

<a id="su-dung"></a>

## Sử dụng

1. **Kết nối AI (một lần):** bấm icon **Manga Dịch** → **Mở cài đặt** (hoặc nút ⚙). Trang cài đặt mở trong tab mới:
   - chọn nhà cung cấp, dán **API key** (và **Base URL** nếu dùng cổng trung gian)
   - bấm **Tìm model tốt nhất**

   Mọi ô được lưu ngay khi gõ.
2. **Đọc truyện:** mở chapter rồi bấm **Dịch trang này**, hoặc nhấn <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>.
3. **Khỏi bấm lần sau:** bật **Tự dịch trên ‹site›** trong popup.

Trong lúc chờ, góc trang hiện `Đang dịch… 5s` cùng nút **Huỷ**. Bản nháp hiện trước, bản trau chuốt thay vào sau. Trang lỗi có nút **Thử lại**, trang đã huỷ có nút **Dịch lại**.

Muốn dừng cả tab: mở popup → **Dừng dịch tab này**. Các trang đã dịch vẫn giữ nguyên. Bấm **Dịch trang này** hoặc phím tắt để chạy tiếp.

Trang đang gọi API dở thì vẫn chạy nốt ở nền. Kết quả được lưu vào bộ nhớ đệm, nên **Dịch lại** sau đó không tốn thêm token.

| Công tắc | Tác dụng |
|---|---|
| Trau chuốt văn phong & xưng hô | Thêm 1 lượt gọi chỉ có chữ: câu tự nhiên, xưng hô đúng quan hệ và nhất quán. **Nên bật.** |
| Dịch bù chữ bị sót | Dò và dịch lại bong bóng model bỏ sót. |
| Dịch cả SFX | Tắt để chỉ giữ lời thoại; đổi ngay trên trang, không gọi lại. |
| Bỏ qua trang không có chữ | Không tốn lượt gọi cho trang bìa/minh họa; có nút "Vẫn dịch". |

<a id="model"></a>

## Chọn nhà cung cấp và model

| Nhà cung cấp | Lấy key | Chi phí |
|---|---|---|
| **Google Gemini** *(khuyên dùng)* | [aistudio.google.com](https://aistudio.google.com/apikey) | Có **gói miễn phí**; dòng `flash-lite` nhanh nhất. |
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | Một key dùng hàng trăm model; model miễn phí xếp đầu danh sách. |
| **Groq** | [console.groq.com/keys](https://console.groq.com/keys) | Có gói miễn phí nhưng giới hạn rất chặt (~7.000 token vào và ~1.000 token ra mỗi phút cho model đọc ảnh): khoảng **1 trang mỗi vài phút**. Đọc ảnh: `qwen/qwen3.8-27b`; trau chuốt: `openai/gpt-oss-120b` (chỉ đọc chữ, không đọc được ảnh). |
| **Anthropic** (Claude) | [console.anthropic.com](https://console.anthropic.com/settings/keys) | Trả phí |
| **OpenAI** (GPT) | [platform.openai.com](https://platform.openai.com/api-keys) | Trả phí |
| **Tùy chỉnh** | Cổng trung gian, Ollama, LM Studio… | Theo server. |

**Cổng trung gian bán API nhiều hãng**: chọn **Tùy chỉnh**, dán đúng Base URL ghi trong tài liệu của cổng (phần địa chỉ đứng trước `/chat/completions`; mỗi bên một kiểu, có bên có `/v1`, có bên không) và key của cổng. Cổng kiểu này thường nói theo chuẩn OpenAI cho mọi model, kể cả Claude và Gemini. Danh sách model được đọc nguyên văn, và bước gọi thử sẽ quyết định model nào dùng được.

| Server chạy trên máy | Base URL |
|---|---|
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |

<details>
<summary><b>Kết quả đo thật</b></summary>

<br>

Trang test MangaDex có 14 bong bóng, đáp án vị trí đo tay. Mỗi lần chạy model trả về hơi khác nhau, nên con số chỉ để tham khảo.

| Model | Bong bóng trúng: ô của model → sau khi khớp theo điểm ảnh | Ô lấn ra tranh |
|---|---|---|
| `gemini-flash-lite-latest` | 12/14 → **14/14** | 4% |
| `openai/gpt-6-luna` (OpenRouter) | 14/14 → **14/14** | 5% |
| `meta/muse-ember` (OpenRouter) | 12/14 → **14/14** | 11% → 5% |
| `anthropic/claude-haiku-5.5` (OpenRouter) | 13/14 → **14/14** | 6% → 1% |
| `openrouter/free` (trả tọa độ đảo trục) | 8/14 → **12/14** | 34% → 6% |

Extension luôn yêu cầu ảnh `detail: high`, và bước dịch bù sẽ bắt các bong bóng model bỏ sót.

</details>

<details>
<summary><b>Một trang tốn bao nhiêu token?</b></summary>

<br>

Mỗi request chỉ gửi **ảnh trang truyện**, lời dặn và lời thoại trang trước. Không gửi HTML hay nội dung nào khác của trang web.

| Chế độ | Request/trang | Token/trang (khoảng, Gemini flash-lite) |
|---|---|---|
| Tắt trau chuốt | 1 | 2.000 |
| Bật trau chuốt *(mặc định)* | 2 (3 ở trang có cặp nhân vật mới) | 4.000 |
| Dịch bù | +1 cho mỗi vùng sót (ảnh cắt nhỏ, không trau chuốt) | +~600 mỗi vùng |

</details>

<a id="cach-hoat-dong"></a>

## Cách hoạt động

```mermaid
flowchart LR
    A["Trang truyện"] --> B{"Đã dịch<br/>ảnh này?"}
    B -- "có" --> F["Bộ nhớ đệm"]
    B -- "chưa" --> C["Đọc ảnh: vị trí,<br/>chữ gốc, ai nói với ai"]
    C --> D["Trau chuốt: văn phong,<br/>xưng hô, tên riêng"]
    D --> E["Lưu + học vào<br/>trí nhớ của bộ truyện"]
    E --> G["Khớp ô theo điểm ảnh:<br/>sửa đảo trục, neo vào chữ,<br/>nới hết lòng bong bóng"]
    F --> G
    G --> H{"Còn chữ gốc<br/>chưa dịch?"}
    H -- "có" --> I["Cắt vùng đó,<br/>dịch bù"] --> J
    H -- "không" --> J["Vẽ bản dịch"]
```

- **Đọc ảnh:** model trả từng khối chữ với `box_2d = [ymin, xmin, ymax, xmax]` (thang 0–1000), bản dịch, chữ gốc và người nói → người nghe.
- **Trau chuốt** là bước riêng, chỉ gửi chữ. Gộp quy tắc văn phong vào cùng request đọc ảnh làm độ trúng bong bóng giảm từ 93% xuống 80% (đo 5 lần mỗi bản).
- **Khớp ô** ([`fit.js`](manga-dich/fit.js)) gồm các bước:
  1. Tìm các mảng mực cỡ chữ quanh ô của model.
  2. Lấy chúng làm lõi, rồi nới từng cạnh ra khi hàng/cột kế bên vẫn là nền bong bóng.
  3. Ô không có chữ bên dưới thì đổi trục hoặc dời sang khối chữ gần nhất mà [`textBlocks`](manga-dich/fit.js) tìm được.
- **Bộ nhớ đệm:** tối đa 500 trang trong `chrome.storage.local`, khóa theo SHA-256 của ảnh, model và chế độ dịch.

## Quyền riêng tư

- API key chỉ lưu trên máy bạn (`chrome.storage.local`) và chỉ được gửi tới nhà cung cấp hoặc Base URL bạn chọn.
- Ảnh trang truyện được gửi tới nhà cung cấp AI đó để dịch; việc lưu dữ liệu theo điều khoản của họ.
- Extension không có máy chủ riêng và không thu thập dữ liệu gì. Quyền `tabs` chỉ dùng để biết tab vừa tải có thuộc site bạn bật **Tự dịch** hay không.

<a id="faq"></a>

## Hỏi đáp

<details>
<summary><b>Ô dịch lệch hoặc còn lộ chữ gốc</b></summary>

Ô được khớp lại theo điểm ảnh và có bước dịch bù, nhưng bong bóng không viền liền với vùng tranh trắng có thể làm ô nới chưa chuẩn. Model mạnh hơn (hoặc gọi thẳng nhà cung cấp thay vì qua cổng trung gian) cho vị trí tốt hơn hẳn. Bấm vào ô để xem chữ gốc bên dưới.
</details>

<details>
<summary><b>Xưng hô vẫn sai (vd anh/em bị đảo)</b></summary>

Bật **Trau chuốt văn phong & xưng hô**. Nếu AI đã ghi sai quan hệ vào trí nhớ, mở **Cài đặt → Trí nhớ AI** và sửa dòng đó, ví dụ `Ken ↔ Mio (anh trai ↔ em gái): Ken xưng anh gọi Mio là em; Mio xưng em gọi Ken là anh hai`. Trang sau sẽ theo ngay. Trang đã dịch nằm trong bộ nhớ đệm giữ bản cũ.
</details>

<details>
<summary><b>Cổng trung gian báo "quota" / "reset after…" / 503</b></summary>

Cổng đang hết lượt cho model đó. Extension tự chờ và gọi lại (tối đa 2 lần, mỗi lần ≤ 5 phút). Nếu vẫn lỗi, thử model khác trong trang cài đặt (nút **Thử** từng model) hoặc đợi cổng hồi quota.
</details>

<details>
<summary><b>Cứ hiện "Đang dịch…" rất lâu</b></summary>

Model chậm hoặc quá tải. Sau 150 giây trang báo lỗi kèm nút **Thử lại**. Chọn model nhanh hơn: trang cài đặt hiện thời gian gọi thử của từng model.
</details>

<details>
<summary><b>"Provider returned error" hoặc lỗi JSON schema</b></summary>

Từ bản 0.5 lỗi hiện nguyên nhân thật của nhà cung cấp. Lỗi schema kiểu *"required … Missing 'x'"* là do model không hỗ trợ JSON schema strict; chọn model khác.
</details>

<a id="phat-trien"></a>

## Phát triển

<details>
<summary><b>Cấu trúc mã nguồn</b></summary>

```
manga-dich/                   thư mục extension (Load unpacked thư mục này)
├── manifest.json             Manifest V3: popup, trang cài đặt, phím tắt
├── background.js             Gọi API (theo Base URL), prompt đọc ảnh + trau chuốt (xưng hô, thể loại),
│                             hàng đợi, bộ nhớ đệm, trí nhớ theo bộ truyện, tự dịch theo site, phím tắt
├── content.js                Chọn trang cần dịch, vẽ lớp bản dịch, dịch bù vùng sót, nút Thử lại
├── fit.js                    Khớp ô theo điểm ảnh: sửa đảo trục, neo vào chữ, nới lòng bong bóng; textBlocks()
├── text.js                   Dò trang không có chữ
├── series.js                 Nhận ra bộ truyện đang đọc (khoá trí nhớ AI)
├── popup.html / popup.js     Popup gọn: Dịch trang này, tự dịch theo site, công tắc nhanh
├── options.html / options.js Trang cài đặt (mở trong tab, tự lưu): kết nối AI, model, cách dịch, trí nhớ AI
└── ui.css                    Giao diện chung (sáng/tối theo trình duyệt)
test-background.js            Test unit API/nhà cung cấp (không gọi mạng)
test-v04.js                   Test unit: gộp ô, style, quota, trí nhớ theo site, separate()
test-v05.js                   Test unit: sửa đảo trục, neo ô, textBlocks, schema strict, prompt manga, huỷ, trí nhớ theo bộ, UI
test-v07.js                   Test unit: chịu lỗi cổng/model (hết lượt, think-tag, JSON bị cắt, ô chồng, lặp câu, chép lệnh, toạ độ pixel)
test-pronoun.js               Test thật: xưng hô theo tuổi, giới, quan hệ, vai, mạch thoại (21 tình huống)
test-v06.js                   Test unit: xoá chữ gốc, xếp dòng dáng bong bóng, chỉ dịch trang chapter, tách ô chồng/bong bóng gộp,
                              model trau chuốt riêng, học từ bản sửa, dùng lại bản nháp khi lỗi, font
test-text.js                  Test ngắt dòng + dò trang không chữ
test-fit.js                   Đo fit.js trên điểm ảnh thật
test-live.js / test-ab.js     Test thật: dịch 1 trang, chấm vị trí ô theo đáp án; so sánh prompt A/B
test-probe.js / test-polish.js / test-tokens.js   Test thật bước gọi thử, trau chuốt, đo token
draw-boxes.py                 Vẽ ô của model (đỏ) và đáp án (xanh) lên ảnh
```

</details>

<details>
<summary><b>Chạy test</b></summary>

<br>

Cần [Node.js](https://nodejs.org) 18+. Các script `.py` cần Python và Pillow (`pip install pillow`).

```bash
node test-background.js && node test-v04.js && node test-v05.js && node test-v06.js && node test-v07.js && node test-text.js
```

Test thật cần key trong file `.env` ở thư mục gốc (đã nằm trong `.gitignore`):

```
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
CUSTOM_API_KEY=...                      # cổng trung gian (nhà cung cấp Tùy chỉnh)
CUSTOM_BASE_URL=...                     # Base URL theo tài liệu của cổng
```

Ảnh trang truyện dùng để test **không có trong repo** (bản quyền của tác giả và nhóm dịch). Tự lưu trang thành `test-fixtures/page4.png` / `page5.png`. Các file `*.truth.json` khớp trang 4–5, chương 12 của *Bijin de Okane Mochi no Kanojo ga Hoshii to Ittara…* trên MangaDex (768×1087).

```bash
node test-live.js test-fixtures/page4.png               # mọi nhà cung cấp có key
ONLY=custom MODEL_CUSTOM=gpt-6.1-terra node test-live.js test-fixtures/page5.png
python -c "from PIL import Image; open('page4.rgba','wb').write(Image.open('test-fixtures/page4.png').convert('RGBA').tobytes())"
node test-fit.js page4.rgba test-fixtures/result-*.json
```

Một trang **ĐẠT** khi ít nhất 80% bong bóng có ô dịch đặt lên và ít nhất 80% ô dịch nằm đúng một bong bóng.

</details>

<details>
<summary><b>Đánh số phiên bản</b></summary>

<br>

Theo [Semantic Versioning](https://semver.org/lang/vi/) `MAJOR.MINOR.PATCH` (trường `version` trong `manifest.json`). Lịch sử thay đổi ở [CHANGELOG.md](CHANGELOG.md).

| Thay đổi | Tăng | Ví dụ |
|---|---|---|
| Chỉ sửa lỗi, tinh chỉnh prompt/thuật toán, không thêm gì cho người dùng | PATCH | 0.6.0 → 0.6.1 |
| Thêm tính năng hoặc cài đặt mới, vẫn dùng được cài đặt cũ | MINOR | 0.6.1 → 0.7.0 |
| Cài đặt/trí nhớ cũ không dùng được nữa | MAJOR (từ 1.0 trở đi; trước 1.0 tăng MINOR) | 1.4.2 → 2.0.0 |

Chỉ chốt số phiên bản sau khi chủ dự án đã test và đồng ý. Trong lúc chờ, thay đổi ghi ở mục "Chưa phát hành" của CHANGELOG và `version_name` trong manifest mang hậu tố `-beta` (hiện trong popup và trang cài đặt).

Đổi prompt chỉ làm cache cũ hết hạn (`CACHE_V`), không tính là thay đổi phá vỡ.

</details>

## Giấy phép

Copyright © 2026 SakerLy

Phát hành theo **[GNU General Public License v3.0](LICENSE)**. Bạn được dùng, sửa và phân phối lại, với điều kiện bản sửa đổi khi phát hành cũng phải mở mã nguồn theo GPL-3.0. Phần mềm được cung cấp **không kèm bất kỳ bảo đảm nào**.

<sub>Manga Dịch chỉ là công cụ hỗ trợ đọc. Bản quyền nội dung truyện thuộc về tác giả, nhà xuất bản và nhóm dịch. Hãy ủng hộ bản chính thức khi có thể.</sub>
