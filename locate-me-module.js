/**
 * ============================================================
 * MODULE: Nút định vị vị trí hiện tại của thiết bị trên bản đồ
 * Dùng cho: nhatkydientu.cpart.vn (Leaflet.js)
 * Không phụ thuộc thư viện ngoài — chỉ dùng Leaflet + Geolocation API
 * ============================================================
 *
 * CÁCH DÙNG:
 * Sau khi khởi tạo map (biến window.CPART_MAP), gọi:
 *   initLocateMeControl(window.CPART_MAP);
 *
 * LƯU Ý: trình duyệt chỉ cho phép lấy vị trí (Geolocation API)
 * trên trang chạy qua HTTPS (GitHub Pages đã là HTTPS nên OK),
 * và sẽ hiện popup xin quyền truy cập vị trí ở lần bấm đầu tiên.
 */

function initLocateMeControl(map, options) {
  options = options || {};
  const zoomLevel = options.zoomLevel || 18;

  const LocateControl = L.Control.extend({
    options: { position: options.position || 'topright' },

    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control locate-control');
      const link = L.DomUtil.create('a', 'locate-btn', container);
      link.href = '#';
      link.title = 'Định vị vị trí hiện tại của bạn';
      link.setAttribute('role', 'button');
      link.innerHTML = '📍';

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, 'click', L.DomEvent.stop);
      L.DomEvent.on(link, 'click', () => this._locate());

      this._link = link;
      return container;
    },

    _locate: function () {
      if (!navigator.geolocation) {
        alert('Thiết bị/trình duyệt này không hỗ trợ định vị vị trí.');
        return;
      }

      this._link.innerHTML = '⏳';
      this._link.style.pointerEvents = 'none';

      navigator.geolocation.getCurrentPosition(
        (pos) => this._onSuccess(pos),
        (err) => this._onError(err),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
      );
    },

    _onSuccess: function (pos) {
      const { latitude, longitude, accuracy } = pos.coords;
      const latlng = [latitude, longitude];

      map.flyTo(latlng, zoomLevel, { duration: 0.8 });

      if (this._marker) map.removeLayer(this._marker);
      if (this._circle) map.removeLayer(this._circle);

      this._circle = L.circle(latlng, {
        radius: accuracy,
        color: '#2f6fb0',
        weight: 1,
        fillColor: '#2f6fb0',
        fillOpacity: 0.12
      }).addTo(map);

      this._marker = L.circleMarker(latlng, {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#2f6fb0',
        fillOpacity: 1
      }).addTo(map).bindPopup(
        `Vị trí hiện tại của bạn<br>Độ chính xác: ±${Math.round(accuracy)} m`
      );

      this._link.innerHTML = '📍';
      this._link.style.pointerEvents = '';
    },

    _onError: function (err) {
      this._link.innerHTML = '📍';
      this._link.style.pointerEvents = '';
      let msg = 'Không lấy được vị trí hiện tại.';
      if (err.code === 1) msg = 'Bạn chưa cho phép truy cập vị trí. Vào cài đặt trình duyệt để bật quyền vị trí cho trang này.';
      else if (err.code === 2) msg = 'Không xác định được vị trí (tín hiệu GPS/mạng yếu).';
      else if (err.code === 3) msg = 'Hết thời gian chờ định vị, thử lại.';
      alert(msg);
    }
  });

  map.addControl(new LocateControl());
}
