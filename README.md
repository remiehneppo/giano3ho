# Zalo PC trên Linux (Ubuntu)

Dự án đóng gói và vá lỗi tương thích để chạy **Zalo PC (v26.7.10)** trên nền tảng Linux (Ubuntu) thông qua Electron runtime.

---

## 1. Cấu trúc dự án

```text
.
├── app.asar               # Gói asar gốc trích xuất từ Zalo PC Windows
├── app.asar.unpacked/     # Các thư viện native được giải nén từ asar
├── app-extracted/         # Mã nguồn ứng dụng sau khi trích xuất và vá lỗi
│   ├── bootstrap.js       # Entry point khởi động ứng dụng
│   ├── linux-compat/      # TẦNG TƯƠNG THÍCH LINUX (đã refactor modular)
│   │   ├── index.js       # Bộ điều phối trung tâm (initLinuxCompat)
│   │   ├── path-patcher.js# Vá Module._resolveFilename để hỗ trợ đường dẫn Windows
│   │   ├── config-init.js # Khởi tạo thư mục config & các file .meta cần thiết
│   │   ├── logger.js      # Ghi log ra file và đồng bộ console
│   │   ├── devtools.js    # Phím tắt F12/Ctrl+Shift+I & giám sát BrowserWindow
│   │   └── error-handler.js# Bắt lỗi unhandledRejection để tránh crash
│   ├── native/nativelibs/ # Thư viện native & các stub dự phòng (sqlite3, db-cross-v4,...)
│   ├── main-dist/         # Bundle tiến trình Main (Electron)
│   └── pc-dist/           # Bundle tiến trình Renderer (Giao diện React)
├── run.sh                 # Script tự động dò tìm Electron và khởi chạy
├── zalo-debug.log         # Nhật ký debug khi chạy ứng dụng
└── README.md              # Tài liệu kiến trúc dự án
```

---

## 2. Kiến trúc tầng tương thích Linux (`linux-compat`)

Do Zalo PC được phát triển chính thức cho Windows và macOS, khi chạy trên Linux sẽ gặp một số hạn chế về hệ điều hành và thư viện native C++. Thư mục `app-extracted/linux-compat/` giải quyết các vấn đề này một cách có cấu trúc:

| Module | Nhiệm vụ |
| :--- | :--- |
| **`path-patcher.js`** | Hook vào `Module._resolveFilename` của Node.js để tự động chuyển đổi dấu gạch chéo ngược `\` (chuẩn Windows) thành gạch chéo `/` (chuẩn Unix) khi require module. |
| **`config-init.js`** | Tự động tạo thư mục `~/.config/ZaloData/cal/` và các file metadata (`main.meta`, `preload-sqlite.meta`, `shared-worker.meta`, `render.meta`) để tránh lỗi *"Failed to parse meta"*. |
| **`logger.js`** | Ghi log toàn bộ output của tiến trình (Main log, Renderer log, Navigation) vào file `zalo-debug.log` tại thư mục gốc mà không bị hardcode đường dẫn. |
| **`devtools.js`** | Đăng ký phím tắt **F12** hoặc **Ctrl+Shift+I** để bật/tắt Chrome DevTools khi cửa sổ Zalo mở, hỗ trợ debug trực tiếp giao diện. |
| **`error-handler.js`** | Bắt các unhandled rejection từ các tính năng Windows không khả dụng trên Linux để không làm sập ứng dụng. |

---

## 3. Thư viện Native & Cơ chế lưu trữ Database

- **SQLite3 (`sqlite3`)**: Đã tích hợp sẵn binary NAPI v6 tương thích Linux 64-bit (`binding/napi-v6-linux-x64/node_sqlite3.node`) kèm fallback stub nếu không thể nạp.
- **Addons phụ trợ (`db-cross-v4`, `zwalker`, `zcall`, `zimage`, `file-utilities`, `v8-profiles`)**: Cung cấp các stub an toàn (mock implementations) trả về dữ liệu rỗng/hợp lệ thay vì ném lỗi khi thiếu binary Windows `.node`/`.dll`.
- **IndexedDB Database Engine (`IDB`)**: Trên Linux, Zalo PC được cấu hình chạy toàn diện trên **IndexedDB** tích hợp sẵn của Chromium/Electron thay vì SQLite đa tiến trình:
  - Bỏ qua các tác vụ mã hóa SQLite (`tryEncryptFastTrack`) và chuyển đổi C++ native (`db-cross-v4`).
  - Toàn bộ dữ liệu chat, danh bạ, tin nhắn, nhãn và cài đặt vận hành 100% cục bộ trong renderer, ngăn chặn triệt để tình trạng treo vô hạn ở màn hình *"Đang đăng nhập..."*.

---

## 4. Hướng dẫn khởi chạy

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
