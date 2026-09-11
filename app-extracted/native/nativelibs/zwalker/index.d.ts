/* tslint:disable */
/* eslint-disable */

/**
 * Struct chứa thông tin cơ bản về một file đã được cập nhật.
 *
 * `BaseFileInfoUpdated` lưu trữ đường dẫn và ID của file đã cập nhật.
 *
 * # Các trường
 *
 * - `file_path`: Đường dẫn đến file.
 * - `id`: ID của file.
 */
export interface BaseFileInfoUpdated {
	/** Đường dẫn đến file. */
	filePath: string;
	/** ID của file. */
	id: string;
}

/**
 * Hàm `scan_directory` quét toàn bộ nội dung thư mục và các đường dẫn được theo dõi,
 * lưu kết quả vào file JSON.
 *
 * - `directory`: Thư mục gốc cần quét.
 * - `tracking_paths`: Các đường dẫn cần theo dõi.
 * - Trả về: `Response` chứa kết quả quét và các thông tin liên quan.
 */
export declare function scanDirectory(
	directory: string,
	trackingPaths: Array<string>
): Promise<{
	fileNumber: number;
	size: bigint;
	trackingPath: string;
}>;

/**
 * Hàm không đồng bộ để cập nhật `reference_message_id` cho một loạt các file trong thư mục.
 *
 * # Tham số
 * - `directory`: Đường dẫn đến thư mục chứa file JSON.
 * - `file_stats`: Danh sách các file cần cập nhật.
 *
 * # Trả về
 * Trả về `Response` chứa số lượng file đã cập nhật thành công.
 *
 * # Lỗi
 * - `FILE_NOT_FOUND`: Nếu file không tồn tại.
 * - `FILE_OPEN_ERROR`: Nếu không mở được file.
 * - `WRITE_ERROR`: Nếu không thể ghi lại file.
 *
 * # Ví dụ
 * ```rust
 * let response = update_reference_message_id("path/to/directory".to_string(), vec![]).await;
 * assert!(response.is_ok());
 * ```
 */
export declare function updateReferenceMessageId(
	directory: string,
	fileStats: Array<BaseFileInfoUpdated>
): Promise<{ updateCount: number }>;

/**
 * Hàm xóa các file không còn được sử dụng.
 *
 * Hàm này nhận một thư mục gốc, danh sách các pattern cần bỏ qua,
 * và các đường dẫn file được tracking. Nó sẽ tìm và xóa các file
 * không còn liên kết với bất kỳ `reference_message_id` nào.
 *
 * # Tham số
 *
 * - `directory`: Đường dẫn tới thư mục chứa các file cần kiểm tra.
 * - `ignore_patterns`: Danh sách các pattern (theo glob) cần bỏ qua.
 * - `tracking_paths`: Các đường dẫn file được tracking.
 *
 * # Trả về
 *
 * Trả về một `Result` chứa struct `Response` với thông tin số file còn lại
 * và tổng kích thước sau khi quá trình xóa hoàn thành, hoặc một `Error` nếu có lỗi xảy ra.
 *
 * # Lỗi
 *
 * - `FILE_NOT_FOUND`: Khi không tìm thấy file JSON thống kê.
 * - `FILE_OPEN_ERROR`: Khi không thể mở file JSON.
 * - `READ_ERROR`: Khi gặp lỗi trong quá trình đọc file JSON.
 * - `BYTE_TO_JSON_CONVERSION_ERROR`: Khi không thể parse nội dung JSON.
 */
export declare function deleteHomelessFiles(
	directory: string,
	ignorePatterns: Array<string>,
	trackingPaths: Array<string>,
	isDeleteStatFile: boolean
): Promise<{
	/** Số lượng file còn lại sau khi đã xóa. */
	fileNumber: number;
	/** Tổng kích thước của các file (sau khi đã xóa). */
	size: bigint;
	/** Các đường dẫn file đang được tracking dưới dạng chuỗi JSON. */
	trackingPath: string;
	/** Số lượng các file không xoá được */
	failedFileNumber: number;
	/** tổng dung lượng các file không xoá được */
	failedSize: bigint;
}>;

export declare function statUnmarkedFiles(
	directory: string,
	ignorePatterns: Array<string>,
	trackingPaths: Array<string>,
	trackingATime: Array<number>
): Promise<{
	/** Số lượng file còn lại sau khi đã xóa. */
	fileNumber: number;
	/** Tổng kích thước của các file (sau khi đã xóa). */
	size: bigint;
	/** Các đường dẫn file đang được tracking dưới dạng chuỗi JSON. */
	trackingPath: string;
	/** Các đối tượng trong rangetime đang được tracking dưới dạng chuỗi JSON. */
	trackingATime: string;
}>;

export declare function deleteEmptyFolders(
	directory: string
): Promise<{
	deletedCount: number,
	deletedDirs: Array<string>
}>;