// =====================================================================
// CẤU HÌNH — chỉ cần sửa file này, không cần đụng vào app.js
// =====================================================================
//
// Cách lấy link CSV từ Google Sheets:
// 1. Mở file Google Sheet (đã import từ BanDo_CPART_DuLieu_Mau.xlsx)
// 2. Vào menu Tệp (File) > Chia sẻ (Share) > Xuất bản lên web (Publish to web)
// 3. Ở mục "Liên kết", chọn đúng sheet "DiaDiem", định dạng "Giá trị được phân tách bằng dấu phẩy (.csv)"
// 4. Bấm "Xuất bản" (Publish), copy link, dán vào DIADIEM_CSV_URL bên dưới
// 5. Lặp lại với sheet "VungDienTich", dán vào VUNGDIENTICH_CSV_URL
//
// LƯU Ý: "Publish to web" làm sheet đọc-công khai (ai có link đều xem được dữ liệu thô),
// nhưng KHÔNG cho phép chỉnh sửa. Phù hợp vì trang bản đồ chỉ cần đọc.

const MAP_CONFIG = {
  // Link CSV public của sheet DiaDiem (marker)
  DIADIEM_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIaaN5wcn5nbOeo6X1PImI4d9_wOBtvzk4nV9XWMmOvO-d3PeRO6GIaKbBMqzLplHnA8VNfHQMO9DM/pub?gid=121676385&single=true&output=csv",

  // Link CSV public của sheet VungDienTich (polygon)
  VUNGDIENTICH_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIaaN5wcn5nbOeo6X1PImI4d9_wOBtvzk4nV9XWMmOvO-d3PeRO6GIaKbBMqzLplHnA8VNfHQMO9DM/pub?gid=801267228&single=true&output=csv",

  CAYTRONG_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIaaN5wcn5nbOeo6X1PImI4d9_wOBtvzk4nV9XWMmOvO-d3PeRO6GIaKbBMqzLplHnA8VNfHQMO9DM/pub?gid=681597274&single=true&output=csv",
  // Độ chính xác GPS (mét) được coi là "tốt" — hiển thị màu xanh thay vì vàng cảnh báo
  GOOD_ACCURACY_METERS: 8,
  
  // Tâm bản đồ mặc định và mức zoom ban đầu (giống bản mẫu: Ba Bể, Bắc Kạn)
  DEFAULT_CENTER: [22.3488, 105.8244],
  DEFAULT_ZOOM: 12,

  // Tự động tải lại dữ liệu mỗi bao nhiêu phút (đặt 0 để tắt tự tải lại)
  AUTO_REFRESH_MINUTES: 10,

  // Màu mặc định cho polygon nếu dòng dữ liệu không điền cột MauSac
  DEFAULT_POLYGON_COLOR: "#3d5c3a",

  // Màu mặc định cho marker theo từng LopBanDo (nếu không khớp, dùng DEFAULT_MARKER_COLOR)
  LAYER_COLORS: {
    "Cơ sở sản xuất và kinh doanh": "#b5651d",
    "Điểm bán hàng": "#2f6fb0",
    "Vùng nguyên liệu": "#3d5c3a"
  },
  DEFAULT_MARKER_COLOR: "#5d655a"
};
