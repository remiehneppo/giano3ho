# Zalo PC trên Linux (Ubuntu)

Dự án đóng gói và vá lỗi tương thích để chạy **Zalo PC (v26.7.10)** trên nền tảng Linux (Ubuntu) thông qua Electron runtime.

---

## 1. Cấu trúc dự án

```text
.
├── app.asar               # Gói asar gốc trích xuất từ Zalo PC Windows
├── app.asar.unpacked/     # Các thư viện native được giải nén từ asar
├── app-extracted/         # Mã nguồn ứng dụng sau khi trích xuất và vá lỗi
│   ├── bootstrap.js       # Entry point khởi động ứng dụng (có bọc bảo vệ migration)
│   ├── linux-compat/      # BỘ ĐIỀU PHỐI TƯƠNG THÍCH LINUX (Deep Module)
│   │   └── index.js       # Module hợp nhất: path patcher, config init, non-blocking logger, devtools & error handler
│   ├── native/nativelibs/ # TẦNG ADAPTER NỀN TẢNG (Platform Capability Adapters)
│   │   ├── zfile/         # POSIX stat, permission check, diskInfo proxy cho Linux & Windows queries
│   │   ├── file-utils/    # getDiskUsage tính dung lượng ổ đĩa qua fs.statfsSync
│   │   ├── file-utilities/# Filesystem detector (ext4) & hardlinks array resolver
│   │   ├── zwalker/       # Directory walker stub tuân thủ 100% Interface Contract
│   │   ├── sqlite3/       # Binary NAPI v6 Linux x64 kèm fallback stub
│   │   └── db-cross-v4/   # Stub giải mã an toàn
│   ├── main-dist/         # Bundle tiến trình Main (Electron)
│   └── pc-dist/           # Bundle tiến trình Renderer (Giao diện React)
├── tests/                 # Bộ kiểm thử hợp đồng tự động (Contract Verification Tests)
│   └── contract/          # Kiểm tra tính toàn vẹn chữ ký hàm & shape dữ liệu của nativelibs & linux-compat
├── docs/adr/              # Architecture Decision Records ghi nhận các quyết định kiến trúc
├── CONTEXT.md             # Tài liệu thuật ngữ miền (Domain Glossary & Relationships)
├── run.sh                 # Script tự động dò tìm Electron và khởi chạy
├── zalo-debug.log         # Nhật ký debug khi chạy ứng dụng
└── README.md              # Tài liệu kiến trúc dự án
```

---

## 2. Kiến trúc tầng tương thích Linux (`linux-compat`)

Tầng tương thích được thiết kế theo nguyên lý **Deep Module** (giao diện nhỏ gọn nhưng nội hàm xử lý sâu):
- **Điều phối tập trung (`initLinuxCompat`)**: Một điểm kích hoạt duy nhất từ `bootstrap.js`, loại bỏ các module nông và ngăn chặn phân tán trạng thái.
- **Vá đường dẫn (`Module._resolveFilename`)**: Tự động chuyển đổi dấu gạch chéo ngược `\` (chuẩn Windows) thành gạch chéo `/` (chuẩn Unix) khi require module.
- **Khởi tạo cấu hình (`config-init`)**: Tự động tạo thư mục `~/.config/ZaloData/cal/` và các file metadata (`main.meta`, `preload-sqlite.meta`, `shared-worker.meta`, `render.meta`) để tránh lỗi *"Failed to parse meta"*.
- **Luồng chẩn đoán bất đồng bộ (Diagnostic Stream)**: Sử dụng Node.js write stream bất đồng bộ thay vì ghi đĩa đồng bộ (`appendFileSync`), loại bỏ hiện tượng nghẽn Event Loop trên Main process; tích hợp bộ lọc chống trùng lặp log giữa Renderer và Main.
- **Giám sát cửa sổ & phím tắt DevTools**: Bắt phím tắt **F12** hoặc **Ctrl+Shift+I** để bật/tắt Chrome DevTools, theo dõi điều hướng `did-navigate` và bắt lỗi `did-fail-load`.
- **Bảo vệ ngoại lệ**: Bắt unhandled promise rejections và uncaught exceptions, ghi lại toàn bộ stack trace giúp gỡ lỗi mà không làm sập ứng dụng.

---

## 3. Thư viện Native & Cơ chế lưu trữ Database

- **Platform Capability Adapters (`nativelibs`)**:
  - **`zfile`**: Cung cấp đầy đủ các phương thức `canReadAndWrite`, `canRead`, `canWrite`, `stat`, `copyFolder` qua POSIX Node.js APIs. Cung cấp hàm `diskInfo()` trả về `Proxy` hỗ trợ cả đường dẫn Linux (`/`) lẫn các truy vấn ký hiệu ổ đĩa Windows (`C:`, `C:\`, `D:\`), ngăn chặn triệt để lỗi `TypeError: Cannot create proxy with non-object as target`.
  - **`file-utils`**: Hiện thực hàm `getDiskUsage()` sử dụng `fs.statfsSync()` để báo cáo chính xác dung lượng tổng và dung lượng trống thực tế trên Linux cho `analyzeMainDisk()`.
  - **`file-utilities`**: Cung cấp `detectFilesystemSync` trả về `{ filesystem: 'ext4', filesystemType: 'ext4' }` và `detectHardlinksAsync` trả về `Array` rỗng, ngăn chặn lỗi `TypeError: toLocaleLowerCase is not a function` và `TypeError: filter is not a function`.
  - **`zwalker` & `win-utils`**: Chuẩn hóa cấu trúc trả về `{ fileNumber: 0, size: 0, deletedDirs: [] }` và `{ qlWin: null }`.
  - **`sqlite3`**: Tích hợp binary NAPI v6 tương thích Linux 64-bit (`binding/napi-v6-linux-x64/node_sqlite3.node`) kèm fallback stub.
- **IndexedDB Database Engine (`IDB`)**: Trên Linux, Zalo PC được cấu hình chạy toàn diện trên **IndexedDB** tích hợp sẵn của Chromium/Electron thay vì SQLite đa tiến trình:
  - Bỏ qua các tác vụ mã hóa SQLite (`tryEncryptFastTrack`) và chuyển đổi C++ native (`db-cross-v4`).
  - Toàn bộ dữ liệu chat, danh bạ, tin nhắn, nhãn và cài đặt vận hành 100% cục bộ trong renderer, ngăn chặn triệt để tình trạng treo vô hạn ở màn hình *"Đang đăng nhập..."*.

### Cửa sổ quét mã QR đăng nhập (Login QR Polling)
- Luồng đăng nhập QR long-poll endpoint `polling/qr/waiting`: server giữ kết nối ~20s rồi trả `HTTP 408` (đây là tín hiệu *"chưa quét"*, không phải lỗi) và mã QR vẫn còn hiệu lực trên server thêm vài phút.
- Bản gốc dùng thẳng `qr_retry` do server trả về (3 lần ≈ 60 giây) nên client **ngừng poll** khi mã QR vẫn còn hạn. Người dùng quét chậm hơn 60 giây sẽ thấy *"Mã QR đã hết hạn"*, bấm tải lại sẽ sinh mã mới và vô hiệu hoá mã vừa quét → lặp vô hạn ở bước quét QR.
- Bản vá (`pc-dist/lazy/login-startup.*.js`, hàm `Dr`) áp sàn số lần poll tối thiểu `i = Math.max(i || 0, 10)` (~200 giây) để cửa sổ quét khớp với thời gian sống thực tế của mã QR.

---

## 4. Kiểm thử tự động (Automated Contract Tests)

Để đảm bảo các adapter và bộ điều phối tương thích luôn tuân thủ đúng Interface Contract:
```bash
node tests/contract/nativelibs-contract.test.js
node tests/contract/linux-compat.test.js
node tests/contract/login-qr-polling.test.js
```

---

## 5. Hướng dẫn khởi chạy

### Yêu cầu
- Đã cài đặt **Electron** (phiên bản khuyến nghị: >= 20.x hoặc thông qua Node.js).
- Môi trường đồ họa X11 / Wayland (Display `:0` hoặc `:1`).

### Khởi động
Chạy script:
```bash
./run.sh
```

### Các tùy chọn nâng cao qua biến môi trường
- Chỉ định đường dẫn Electron cụ thể:
  ```bash
  ELECTRON_BIN=/duong/dan/toi/electron ./run.sh
  ```
- Chỉ định màn hình X11:
  ```bash
  DISPLAY=:0 ./run.sh
  ```
- Chỉ định vị trí file log:
  ```bash
  ZALO_DEBUG_LOG=/tmp/zalo.log ./run.sh
  ```
