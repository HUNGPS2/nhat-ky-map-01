/**
 * ============================================================
 * MODULE: Tìm kiếm theo toạ độ (lat, lng) và nhảy đến vị trí đó
 * Dùng cho: nhatkydientu.cpart.vn (Leaflet.js)
 * Không phụ thuộc thư viện ngoài — chỉ dùng Leaflet
 * ============================================================
 *
 * CÁCH DÙNG:
 * Sau khi khởi tạo map (biến window.CPART_MAP), gọi:
 *   initCoordSearchControl(window.CPART_MAP);
 *
 * Người dùng nhập toạ độ dạng: 20.701839930258853, 105.87287409129354
 * (chấp nhận cả có/không dấu cách, dấu phẩy hoặc dấu chấm phẩy)
 */

function initCoordSearchControl(map, options) {
  options = options || {};
  const zoomLevel = options.zoomLevel || 18;

  const CoordSearchControl = L.Control.extend({
    options: { position: options.position || 'topright' },

    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control coord-search-control');

      const toggleBtn = L.DomUtil.create('a', 'coord-search-toggle', container);
      toggleBtn.href = '#';
      toggleBtn.title = 'Tìm theo toạ độ (lat, lng)';
      toggleBtn.innerHTML = '🔍';

      const box = L.DomUtil.create('div', 'coord-search-box', container);
      box.innerHTML = `
        <input type="text" class="coord-search-input"
               placeholder="20.7018, 105.8728" />
        <button class="coord-search-go" title="Đi đến toạ độ">Đi</button>
        <div class="coord-search-status"></div>
      `;

      const input = box.querySelector('.coord-search-input');
      const goBtn = box.querySelector('.coord-search-go');
      const statusEl = box.querySelector('.coord-search-status');

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      L.DomEvent.on(toggleBtn, 'click', (e) => {
        L.DomEvent.stop(e);
        container.classList.toggle('open');
        if (container.classList.contains('open')) {
          setTimeout(() => input.focus(), 50);
        }
      });

      const doSearch = () => this._goToCoord(input.value, statusEl);
      L.DomEvent.on(goBtn, 'click', L.DomEvent.stop);
      L.DomEvent.on(goBtn, 'click', doSearch);
      L.DomEvent.on(input, 'keydown', (e) => {
        if (e.key === 'Enter') doSearch();
      });

      this._marker = null;
      return container;
    },

    _goToCoord: function (raw, statusEl) {
      statusEl.textContent = '';
      const parts = raw.trim().split(/[,;\s]+/).filter(Boolean);

      if (parts.length !== 2) {
        statusEl.textContent = '⚠️ Nhập đúng dạng: vĩ độ, kinh độ';
        return;
      }

      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);

      if (isNaN(lat) || isNaN(lng)) {
        statusEl.textContent = '⚠️ Toạ độ không hợp lệ';
        return;
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        statusEl.textContent = '⚠️ Toạ độ ngoài phạm vi cho phép';
        return;
      }

      const latlng = [lat, lng];
      map.flyTo(latlng, zoomLevel, { duration: 0.8 });

      if (this._marker) map.removeLayer(this._marker);
      this._marker = L.marker(latlng)
        .addTo(map)
        .bindPopup(`Toạ độ: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
        .openPopup();

      statusEl.textContent = '';
    }
  });

  map.addControl(new CoordSearchControl());
}
