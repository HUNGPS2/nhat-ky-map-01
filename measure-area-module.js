/**
 * ============================================================
 * MODULE: Vẽ đa giác + Đo diện tích lô đất trên bản đồ Leaflet
 * Dùng cho: nhatkydientu.cpart.vn (Leaflet.js + Google Sheets)
 * Phụ thuộc: Leaflet.draw, turf.js
 * ============================================================
 *
 * CÁCH DÙNG:
 * 1. Thêm các thẻ <link>/<script> bên dưới vào <head>/trước </body> của index.html
 * 2. Sau khi khởi tạo map Leaflet của bạn (biến `map`), gọi:
 *      initAreaMeasureTool(map, { sheetWebhookUrl: 'https://script.google.com/macros/s/XXXX/exec' });
 *
 * <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
 * <script src="https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js"></script>
 * <script src="measure-area-module.js"></script>
 */

function initAreaMeasureTool(map, options) {
  options = options || {};
  const sheetWebhookUrl = options.sheetWebhookUrl || null; // URL Apps Script để lưu vào Google Sheets

  // ---- 1. Layer chứa các polygon đã vẽ ----
  const drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  // ---- 2. Control vẽ (chỉ bật polygon, tắt các loại khác cho gọn) ----
  const drawControl = new L.Control.Draw({
    position: 'topright',
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: false, // mình tự tính bằng turf.js cho chính xác & đơn vị VN
        shapeOptions: { color: '#ff6b00', weight: 3, fillOpacity: 0.15 }
      },
      polyline: false,
      rectangle: false,
      circle: false,
      circlemarker: false,
      marker: false
    },
    edit: {
      featureGroup: drawnItems,
      remove: true
    }
  });
  map.addControl(drawControl);

  // ---- 3. Hàm tính diện tích + chu vi bằng turf.js ----
  function calcAreaAndPerimeter(layer) {
    const geojson = layer.toGeoJSON();
    const areaM2 = turf.area(geojson); // m²
    const areaHa = areaM2 / 10000;
    const areaCong = areaM2 / 1000; // 1 công (Nam Bộ) ≈ 1.000 m²
    const areaSaoBac = areaM2 / 360; // 1 sào Bắc Bộ = 360 m²
    const areaSaoTrung = areaM2 / 500; // 1 sào Trung Bộ = 500 m²
    const line = turf.polygonToLine(geojson);
    const perimeterM = turf.length(line, { units: 'kilometers' }) * 1000;
    return { areaM2, areaHa, areaCong, areaSaoBac, areaSaoTrung, perimeterM, geojson };
  }

  function formatArea(stats) {
    return (
      `<b>Diện tích:</b> ${stats.areaM2.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m²<br>` +
      `≈ ${stats.areaHa.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} ha<br>` +
      `≈ ${stats.areaCong.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} công (Nam Bộ)<br>` +
      `≈ ${stats.areaSaoBac.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} sào (Bắc Bộ)<br>` +
      `≈ ${stats.areaSaoTrung.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} sào (Trung Bộ)<br>` +
      `<b>Chu vi:</b> ${stats.perimeterM.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m`
    );
  }

  // ---- 4. Popup nhập tên lô đất + nút Lưu ----
  function buildEditablePopup(layer, stats) {
    const container = L.DomUtil.create('div', 'area-popup');
    container.innerHTML = `
      <div style="min-width:200px">
        <input type="text" placeholder="Tên lô đất / khu vực" class="area-name-input"
               style="width:100%;margin-bottom:6px;padding:4px;box-sizing:border-box" />
        <div class="area-stats" style="font-size:13px;line-height:1.5">${formatArea(stats)}</div>
        <button class="area-save-btn" style="margin-top:8px;width:100%;padding:6px;
          background:#ff6b00;color:#fff;border:none;border-radius:4px;cursor:pointer">
          💾 Lưu lô đất
        </button>
        <div class="area-save-status" style="font-size:12px;margin-top:4px;color:#666"></div>
      </div>`;

    const nameInput = container.querySelector('.area-name-input');
    const saveBtn = container.querySelector('.area-save-btn');
    const statusEl = container.querySelector('.area-save-status');

    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim() || 'Chưa đặt tên';
      saveBtn.disabled = true;
      statusEl.textContent = 'Đang lưu...';
      try {
        await savePolygonToSheet({ name, stats, layer });
        statusEl.textContent = '✅ Đã lưu';
        layer.bindTooltip(name, { permanent: true, direction: 'center', className: 'area-label' }).openTooltip();
      } catch (err) {
        statusEl.textContent = '❌ Lỗi khi lưu: ' + err.message;
        saveBtn.disabled = false;
      }
    });

    return container;
  }

  // ---- 5. Gửi dữ liệu về Google Sheets qua Apps Script webhook ----
  async function savePolygonToSheet({ name, stats, layer }) {
    if (!sheetWebhookUrl) {
      console.warn('Chưa cấu hình sheetWebhookUrl — chỉ lưu tạm trên bản đồ, không ghi vào Sheets.');
      return;
    }
    const payload = {
      name: name,
      area_m2: Math.round(stats.areaM2 * 100) / 100,
      area_ha: Math.round(stats.areaHa * 10000) / 10000,
      area_cong: Math.round(stats.areaCong * 100) / 100,
      area_sao_bac: Math.round(stats.areaSaoBac * 100) / 100,
      area_sao_trung: Math.round(stats.areaSaoTrung * 100) / 100,
      perimeter_m: Math.round(stats.perimeterM * 100) / 100,
      geojson: JSON.stringify(stats.geojson.geometry),
      created_at: new Date().toISOString()
    };

    const res = await fetch(sheetWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tránh preflight CORS với Apps Script
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().catch(() => ({}));
  }

  // ---- 6. Sự kiện: vẽ xong polygon ----
  map.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer;
    drawnItems.addLayer(layer);
    const stats = calcAreaAndPerimeter(layer);
    layer.bindPopup(buildEditablePopup(layer, stats), { minWidth: 220 }).openPopup();
  });

  // ---- 7. Sự kiện: sửa polygon → tính lại diện tích ----
  map.on(L.Draw.Event.EDITED, function (e) {
    e.layers.eachLayer(function (layer) {
      const stats = calcAreaAndPerimeter(layer);
      if (layer.getPopup()) {
        layer.setPopupContent(buildEditablePopup(layer, stats));
      }
    });
  });

  // ---- 8. Hàm tải lại các lô đất đã lưu từ Google Sheets lên bản đồ ----
  async function loadSavedPolygons(fetchUrl) {
    const res = await fetch(fetchUrl);
    const rows = await res.json(); // kỳ vọng mảng object { name, geojson, area_m2, ... }
    rows.forEach((row) => {
      try {
        const geometry = JSON.parse(row.geojson);
        const layer = L.geoJSON(geometry, { style: { color: '#3388ff', weight: 2, fillOpacity: 0.1 } });
        layer.eachLayer((l) => {
          l.bindTooltip(row.name, { permanent: true, direction: 'center', className: 'area-label' });
          l.bindPopup(
            `<b>${row.name}</b><br>` +
            `Diện tích: ${Number(row.area_m2).toLocaleString('vi-VN')} m²<br>` +
            `≈ ${Number(row.area_sao_bac).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} sào (Bắc Bộ)`
          );
        });
        drawnItems.addLayer(layer);
      } catch (err) {
        console.error('Lỗi parse geojson dòng', row, err);
      }
    });
  }

  return { drawnItems, loadSavedPolygons, calcAreaAndPerimeter };
}
