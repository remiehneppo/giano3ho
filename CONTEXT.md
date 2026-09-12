# Zalo PC Linux Runtime Context

Tài liệu định nghĩa các khái niệm và thuật ngữ miền cho dự án đóng gói và tương thích Zalo PC trên hệ điều hành Linux.

## Language

**Platform Capability Adapter**:
Adapter cụ thể tại Seam `nativelibs` cung cấp các tính năng hệ điều hành (thao tác file, thông tin ổ đĩa, đồ họa native) cho các tiến trình của Zalo.
_Avoid_: Native stub, native mock, native plugin.

**Compatibility Coordinator**:
Module hợp nhất chịu trách nhiệm đồng phối mọi can thiệp môi trường (chuẩn hóa đường dẫn, cấu hình metadata, bắt lỗi tiến trình) để Zalo chạy được trên Linux.
_Avoid_: Linux patcher, hack script, bootstrap hooks.

**Storage Engine**:
Cơ chế lưu trữ dữ liệu cục bộ của Zalo; trên Linux được cố định sang IndexedDB thay vì SQLite đa tiến trình.
_Avoid_: Database manager, DB layer.

**Diagnostic Observer**:
Thành phần giám sát, thu thập và định tuyến nhật ký (log) bất đồng bộ từ các tiến trình Main, Renderer và Worker mà không gây nghẽn luồng.
_Avoid_: Console logger, debug printer.

## Relationships

- **Compatibility Coordinator** khởi tạo môi trường và kích hoạt **Diagnostic Observer** khi ứng dụng bắt đầu chạy.
- Các tiến trình Zalo (Main, Renderer, Worker) tương tác với hệ điều hành thông qua **Platform Capability Adapter**.
- **Storage Engine** vận hành hoàn toàn trong tiến trình Renderer thông qua Web API chuẩn của Chromium.

## Example dialogue

> **Dev:** "Tại sao không gọi thẳng binary `.node` cho `zfile`?"
> **Domain expert:** "Vì binary Windows không chạy được trên Linux; ta dùng **Platform Capability Adapter** để hiện thực hóa các lời gọi này qua POSIX API của Node.js."

## Flagged ambiguities

- "native stub" thường bị hiểu là các hàm rỗng `() => {}` — giải quyết: đối với Zalo PC, **Platform Capability Adapter** phải hiện thực hóa đủ hành vi tối thiểu (hoặc Null Object hợp lệ) để không làm vỡ Interface Contract của caller.
