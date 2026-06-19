# Bản đồ vùng nguyên liệu & cơ sở BND

Trang bản đồ tương tác đọc dữ liệu trực tiếp từ Google Sheets, hiển thị marker (cơ sở, điểm bán) và polygon (vùng nguyên liệu, diện tích) theo lớp

## Cấu trúc file

- `index.html` — khung trang, không cần sửa
- `app.js` — logic đọc CSV, vẽ bản đồ, layer control — không cần sửa
- `config.js` — **file duy nhất cần chỉnh sửa**, chứa link CSV và cấu hình màu sắc

## Bước 1 — Publish 2 sheet ra CSV công khai

Trong file Google Sheet (đã import từ `BanDo_CPART_DuLieu_Mau.xlsx`):

1. **Tệp (File) → Chia sẻ (Share) → Xuất bản lên web (Publish to web)**
2. Ở dropdown đầu tiên, chọn sheet **DiaDiem**
3. Ở dropdown thứ hai, chọn **Giá trị được phân tách bằng dấu phẩy (.csv)**
4. Bấm **Xuất bản (Publish)** → xác nhận
5. Copy link hiện ra, dán vào `DIADIEM_CSV_URL` trong `config.js`
6. Lặp lại bước 2–5 với sheet **VungDienTich**, dán vào `VUNGDIENTICH_CSV_URL`

> Lưu ý: "Publish to web" chỉ cho phép người có link **xem** dữ liệu dạng CSV thô, không cho sửa. Sheet gốc trong Drive vẫn an toàn theo phân quyền bình thường của bạn.

## Bước 2 — Deploy lên GitHub Pages

```bash
# Tạo repo mới (hoặc dùng repo có sẵn như hungps2.github.io)
git init
git add index.html app.js config.js
git commit -m "Bản đồ vùng nguyên liệu BND"
git branch -M main
git remote add origin https://github.com/<tai-khoan>/<ten-repo>.git
git push -u origin main
```

Sau đó vào **Settings → Pages** của repo, chọn nguồn là branch `main`, thư mục `/ (root)`. Trang sẽ chạy tại `https://<tai-khoan>.github.io/<ten-repo>/`.

Nếu muốn gắn vào domain phụ giống `map.yenduongcoop.vn`, trỏ CNAME của subdomain (vd `map.cpart.vn`) tới `<tai-khoan>.github.io`, rồi thêm file `CNAME` chứa domain đó vào repo.

## Bước 3 — Kiểm tra

Mở trang vừa deploy, kiểm tra:
- Marker hiện đúng vị trí, popup hiện đủ thông tin
- Polygon hiện đúng vùng + diện tích trong popup
- Bảng điều khiển lớp (góc dưới trái) cho phép ẩn/hiện từng lớp
- Số đếm cạnh mỗi lớp khớp với số dòng `Active` trong Sheet

## Cập nhật dữ liệu

Mọi thay đổi trong Google Sheet (thêm dòng, sửa tọa độ, đổi `TrangThai` thành "Ẩn") sẽ tự động phản ánh lên bản đồ:
- Khi người dùng bấm nút **↻** trên trang
- Hoặc tự động mỗi `AUTO_REFRESH_MINUTES` phút (mặc định 10 phút, chỉnh trong `config.js`)

Không cần deploy lại trang khi chỉ thay đổi dữ liệu — chỉ cần deploy lại nếu sửa `config.js`, `app.js`, hoặc `index.html`.

## Quy trình thêm vùng nguyên liệu mới (polygon)

1. Vẽ vùng trên Google My Maps, export KML
2. Upload KML vào folder Drive cố định, đặt tên theo ID
3. Thêm dòng mới vào sheet `VungDienTich` (điền `FileKML_TenFile`)
4. Chạy workflow n8n "Map - Parse KML to VungDienTich" để tự động điền `ToaDoPolygon` và `DienTich_ha`
5. Bản đồ tự cập nhật ở lần refresh tiếp theo
