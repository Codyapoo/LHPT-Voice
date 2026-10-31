# 🎙️ LHPT Voice — Biến mọi văn bản thành giọng nói
> **YOUR WORDS. YOUR VOICE.**  
> Nền tảng chuyển văn bản thành giọng nói dành cho người Việt — tập trung vào trải nghiệm đơn giản, chất lượng âm thanh chuẩn, lưu trữ cục bộ an toàn (`IndexedDB`) và sử dụng hoàn toàn miễn phí ($0 Budget).

---

## 1. Giới thiệu Thương hiệu & Hệ thống Thiết kế (Brand Identity)

- **Tên sản phẩm**: **LHPT Voice**
- **Slogan**: `YOUR WORDS. YOUR VOICE.`
- **Thông điệp**: Biến mọi văn bản thành giọng nói – sáng tạo, tự nhiên và dễ dàng.
- **Bảng màu thương hiệu**:
  - `Primary`: `#00E5FF` (Neon Cyan)
  - `Secondary`: `#7C3AED` (Deep Violet)
  - `Accent`: `#A855F7` (Vibrant Purple)
  - `Dark`: `#080B20` (Deep Cosmic Dark)
  - `Surface`: `#121A3A` (Cosmic Card Surface)
  - `Text`: `#E8F0FF` (Ice White)
  - `Muted`: `#8DA4C5` (Muted Slate Blue)
- **Typography**: `Be Vietnam Pro` & `Inter` (hỗ trợ đầy đủ dấu tiếng Việt), kết hợp font chữ ký `Caveat`.
- **Bộ tài nguyên Logo độc quyền (`public/logo/`, `public/icons/`, `public/favicon/`)**:
  - `logo-main.svg`: Logo chính kết hợp chữ `LHPT` và biểu tượng sóng âm phát sáng.
  - `logo-horizontal.svg`: Logo ngang dùng cho thanh điều hướng.
  - `logo-square.svg`: Logo vuông cho hồ sơ mạng xã hội và PWA.
  - `icon.svg`: Biểu tượng ứng dụng.
  - `favicon.svg`: Biểu tượng trình duyệt.

---

## 2. Cấu trúc Mã nguồn (Source Code Architecture)

```text
lhpt-voice/
├── index.html                              # Giao diện ứng dụng hoàn chỉnh (chạy ngay hoặc qua Vite)
├── package.json                            # Cấu hình dependencies (React, Vite, TypeScript, Tailwind, lamejs)
├── tsconfig.json                           # Cấu hình TypeScript strict mode
├── vite.config.ts                          # Cấu hình Vite build
├── tailwind.config.js                      # Cấu hình hệ màu thương hiệu LHPT Voice
├── manifest.json                           # Cấu hình PWA đa nền tảng
├── .nojekyll                               # Hỗ trợ triển khai trực tiếp trên GitHub Pages
├── .github/workflows/deploy.yml            # GitHub Actions tự động deploy lên GitHub Pages
├── public/
│   ├── logo/
│   │   ├── logo-main.svg
│   │   ├── logo-horizontal.svg
│   │   └── logo-square.svg
│   ├── icons/
│   │   └── icon.svg
│   └── favicon/
│       └── favicon.svg
├── assets/
│   ├── css/style.css                       # Stylesheet Cosmic Glassmorphism & Responsive
│   ├── js/app.js                           # Engine thực thi trực tiếp trên trình duyệt
│   └── img/                                # Tài nguyên ảnh nền vũ trụ & vector
└── src/                                    # Kiến trúc Modular React + TypeScript
    ├── assets/
    ├── components/
    │   └── layout/Navbar.tsx
    ├── pages/
    │   ├── Home/HomePage.tsx
    │   ├── Studio/StudioPage.tsx
    │   ├── Library/LibraryPage.tsx
    │   ├── Settings/SettingsPage.tsx
    │   └── About/AboutPage.tsx
    ├── services/
    │   ├── tts/TTSAdapter.ts               # Kiến trúc Adapter (BrowserSpeech + AcousticFormantSynth)
    │   ├── audio/
    │   │   ├── WavEncoder.ts               # Bộ mã hóa IEEE RIFF WAVE PCM (audio/wav)
    │   │   ├── Mp3Encoder.ts               # Bộ mã hóa MPEG-1 Layer III thực tế qua lamejs (audio/mpeg)
    │   │   └── AudioMerger.ts              # Bộ ghép nối các đoạn AudioBuffer dài
    │   ├── storage/IndexedDBService.ts     # Lưu trữ dự án Local-first với IndexedDB
    │   └── import/FileParserService.ts     # Bộ đọc file .TXT, .DOCX (giải nén XML), .SRT, .MD
    ├── hooks/useTTS.ts                     # Hook quản lý tiến trình chia đoạn, hủy và thử lại
    ├── store/AppContext.tsx                # Quản lý cài đặt hệ thống
    ├── utils/vietnameseNormalizer.ts       # Đọc số tiếng Việt thành chữ & mở rộng từ viết tắt
    ├── styles/index.css
    ├── types/index.ts
    ├── App.tsx
    └── main.tsx
```

---

## 3. Báo cáo Tính năng đã hoàn thành & Minh bạch Kỹ thuật

### ✅ Các tính năng đã hoàn thiện 100%:
1. **Giao diện chuẩn thiết kế tham chiếu**:
   - Đầy đủ 5 khu vực: **Trang chủ (Hero)**, **Studio (3 cột)**, **Thư viện dự án**, **Cài đặt**, **Giới thiệu**, cùng khung **Mô phỏng Mobile trực quan** và **Bộ nhận diện thương hiệu**.
   - **Responsive thực sự** cho mọi kích thước màn hình (`360px`, `375px`, `390px`, `430px`, `768px`, `1024px`, `1440px+`): trên điện thoại có thanh điều hướng đáy (**Bottom Navigation Bar**), nút bấm lớn dễ chạm (`min-h-[44px]`), không tràn chữ hay cuộn ngang, hỗ trợ `prefers-reduced-motion`.
2. **Studio & Xử lý ngôn ngữ tiếng Việt**:
   - Đếm ký tự (`0/5000`), ước tính thời lượng, **Xóa nội dung**, **Hoàn tác (Undo)**, **Làm lại (Redo)**, **Chèn mẫu**.
   - **Nhập file thực tế**: Hỗ trợ `.TXT`, `.DOCX` (giải nén trực tiếp `word/document.xml` trong trình duyệt), `.SRT` (tự động lọc mốc thời gian phụ đề), và `.MD`.
   - **Chuẩn hóa văn bản tiếng Việt**: Tự động chuyển số thành chữ tiếng Việt (ví dụ: `2026` → `hai nghìn không trăm hai mươi sáu`, `100%` → `một trăm phần trăm`) và mở rộng từ viết tắt (`TP.HCM`, `HN`, `VN`, `CNTT`, `THPT`, `ĐH`, `AI`, `TTS`).
   - **Chia đoạn văn bản dài**: Tự động ngắt câu an toàn không cắt giữa từ, hiển thị thanh tiến trình xử lý từng đoạn, có nút **Hủy** và **Thử lại**, sau đó ghép nối (`AudioMerger`) thành một luồng âm thanh hoàn chỉnh.
3. **Kiến trúc TTS Đa Adapter & Xuất file WAV / MP3 thực tế**:
   - **Browser Speech Adapter**: Kết nối trực tiếp với `window.speechSynthesis` để liệt kê giọng hệ thống thực tế và phát xem trước độ trễ bằng 0.
   - **Acoustic Formant Synth Adapter**: Tổng hợp sóng âm thanh nhạc tính 6 thanh điệu tiếng Việt (ngang, huyền, sắc, hỏi, ngã, nặng) trực tiếp thành `AudioBuffer` PCM cho 4 giọng (`Nữ miền Bắc`, `Nam miền Bắc`, `Nữ miền Nam`, `Nam miền Nam`).
   - **Xuất file WAV thực tế (`audio/wav`)**: Mã hóa chuẩn RIFF WAVE PCM 16-bit với tùy chọn tần số lấy mẫu `22,050 Hz`, `44,100 Hz`, `48,000 Hz` và kênh `Mono / Stereo`.
   - **Xuất file MP3 thực tế (`audio/mpeg`)**: Mã hóa thực sự qua thư viện `lamejs` sang khung MPEG Layer III với tùy chọn bitrate `128 kbps`, `192 kbps`, `320 kbps` — tuyệt đối không đổi tên đuôi `.wav` sang `.mp3`.
4. **Thư viện dự án Local-First (`IndexedDB`)**:
   - Tạo mới, tìm kiếm, lọc (`Tất cả`, `Văn bản`, `Âm thanh`), **Đổi tên**, **Sao chép**, **Mở lại trong Studio**, **Nghe thử**, **Tải file WAV** và **Xóa dự án**.

### ⚠️ Giới hạn kỹ thuật được công bố minh bạch:
- Theo tiêu chuẩn bảo mật của W3C, Web Speech API (`window.speechSynthesis`) trên các trình duyệt hiện tại phát âm thanh trực tiếp ra tầng hệ điều hành và **không cung cấp quyền truy cập luồng dữ liệu PCM thô** cho JavaScript.
- Do đó, ở chế độ miễn phí 100% không cần backend:
  - Tính năng **Xem trước** ưu tiên giọng đọc hệ thống của trình duyệt (`SpeechSynthesis`).
  - Tính năng **Tạo file WAV & MP3 tải về** sử dụng **Acoustic Formant Synthesizer nội bộ** trên Web Audio API (luôn tạo ra file âm thanh thật, mở được trên mọi trình phát nhạc). Khi người dùng muốn chất lượng giọng đọc Neural Deep Learning cao hơn để xuất file, có thể cấu hình kết nối tới endpoint Piper/Sherpa-ONNX tự host trong mục `src/services/tts/TTSAdapter.ts`.

---

## 4. Hướng dẫn Chạy Local & Đưa lên GitHub / Cloudflare Pages

### A. Chạy trực tiếp hoặc qua môi trường Node.js / Vite
- **Cách 1 (Zero-build tĩnh)**: Mở trực tiếp `index.html` hoặc chạy `npx serve .` để sử dụng ngay toàn bộ tính năng.
- **Cách 2 (Phát triển với Vite + TypeScript)**:
  ```bash
  npm install
  npm run dev
  # Build bản production:
  npm run build
  ```

### B. Hướng dẫn đưa lên GitHub Pages (Ngân sách 0 đồng)
1. Tạo một repository mới trên GitHub (ví dụ: `lhpt-voice`).
2. Giải nén toàn bộ mã nguồn này và đẩy lên nhánh `main`:
   ```bash
   git init
   git add .
   git commit -m "Release LHPT Voice v2.0 Production"
   git branch -M main
   git remote add origin https://github.com/<username>/lhpt-voice.git
   git push -u origin main
   ```
3. Trên GitHub, mở **Settings → Pages**:
   - Tại mục **Build and deployment**, chọn **Deploy from a branch** → nhánh `main` / thư mục `/ (root)` → nhấn **Save** (hoặc chọn **GitHub Actions** để chạy file `.github/workflows/deploy.yml` có sẵn).
4. Sau 30–60 giây, truy cập ứng dụng tại: `https://<username>.github.io/lhpt-voice/`

### C. Hướng dẫn triển khai trên Cloudflare Pages
1. Đăng nhập vào [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Chọn repository `lhpt-voice` của bạn.
3. Để trống **Build command** và đặt **Build output directory** là `/` (hoặc `dist` nếu dùng lệnh `npm run build`), sau đó nhấn **Save and Deploy**.
