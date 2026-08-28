/**
 * ============================================================
 * MODULE: Nút bật/tắt tính năng "bấm vào bản đồ → hiện toạ độ"
 * Dùng cho: nhatkydientu.cpart.vn (Leaflet.js)
 * Không phụ thuộc thư viện ngoài — chỉ dùng Leaflet
 * ============================================================
 *
 * CÁCH DÙNG:
 * Sau khi khởi tạo map (biến window.CPART_MAP), gọi:
 *   initCoordClickToggleControl(window.CPART_MAP);
 *
 * Module này chỉ tạo nút bật/tắt và lưu trạng thái vào map.coordClickEnabled
 * (mặc định false = tắt). Logic hiện popup toạ độ khi bấm bản đồ nằm ở app.js,
 * và app.js tự đọc map.coordClickEnabled trước khi hiện popup.
 */

function initCoordClickToggleControl(map, options) {
  options = options || {};

  const CoordClickToggleControl = L.Control.extend({
    options: { position: options.position || 'topright' },

    onAdd: function () {
      // Mặc định TẮT — chỉ bật khi người dùng chủ động bấm nút này
      map.coordClickEnabled = false;

      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control coord-click-toggle-control');
      const link = L.DomUtil.create('a', 'coord-click-toggle-btn', container);
      link.href = '#';
      link.title = 'Bật/tắt: bấm vào bản đồ để xem toạ độ';
      link.innerHTML = '📌';
      link.setAttribute('role', 'button');
      link.setAttribute('aria-pressed', 'false');

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, 'click', (e) => {
        L.DomEvent.stop(e);
        map.coordClickEnabled = !map.coordClickEnabled;
        link.classList.toggle('active', map.coordClickEnabled);
        link.setAttribute('aria-pressed', String(map.coordClickEnabled));
        link.title = map.coordClickEnabled
          ? 'Đang bật: bấm vào bản đồ để xem toạ độ (bấm lại để tắt)'
          : 'Bật/tắt: bấm vào bản đồ để xem toạ độ';

        // Tắt tính năng thì dọn luôn marker toạ độ đang hiển thị (nếu có)
        if (!map.coordClickEnabled && typeof window.__clearCoordClickMarker === 'function') {
          window.__clearCoordClickMarker();
        }
      });

      return container;
    },
  });

  map.addControl(new CoordClickToggleControl());
}
