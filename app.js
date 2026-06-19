// =====================================================================
// Bản đồ vùng nguyên liệu & cơ sở CPART — logic chính
// Đọc dữ liệu từ Google Sheets (CSV public), render marker + polygon
// =====================================================================

(function () {
  "use strict";

  const els = {
    statusDot: document.getElementById("status-dot"),
    statusText: document.getElementById("status-text"),
    refreshBtn: document.getElementById("refresh-btn"),
    layerList: document.getElementById("layer-list"),
    emptyState: document.getElementById("empty-state"),
  };

  // ---------------------------------------------------------------
  // Map setup
  // ---------------------------------------------------------------
  const map = L.map("map", {
    zoomControl: true,
    minZoom: 5,
    maxZoom: 19,
  }).setView(MAP_CONFIG.DEFAULT_CENTER, MAP_CONFIG.DEFAULT_ZOOM);

  const baseLayers = {
    "Bản đồ thường": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }),
    "Địa hình (Terrain)": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, ' +
        '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      maxZoom: 17,
    }),
  };

  baseLayers["Bản đồ thường"].addTo(map);

  // layerName -> { group: L.LayerGroup, color: string, kind: 'marker'|'polygon', count: number }
  const layerRegistry = new Map();

  // ---------------------------------------------------------------
  // Basemap switcher (Bản đồ thường / Địa hình)
  // ---------------------------------------------------------------
  function buildBasemapPanel() {
    const container = document.getElementById("basemap-list");
    container.innerHTML = "";
    let activeName = "Bản đồ thường";

    Object.keys(baseLayers).forEach((name) => {
      const row = document.createElement("label");
      row.className = "layer-row";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "basemap";
      radio.checked = name === activeName;
      radio.addEventListener("change", () => {
        Object.values(baseLayers).forEach((layer) => map.removeLayer(layer));
        baseLayers[name].addTo(map);
      });

      const lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = name;

      row.appendChild(radio);
      row.appendChild(lbl);
      container.appendChild(row);
    });
  }

  buildBasemapPanel();

  // ---------------------------------------------------------------
  // CSV parsing (hỗ trợ dấu phẩy trong ô được bọc bởi dấu ngoặc kép)
  // ---------------------------------------------------------------
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (c === '"' && next === '"') {
          cell += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          cell += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ",") {
          row.push(cell);
          cell = "";
        } else if (c === "\n" || c === "\r") {
          if (c === "\r" && next === "\n") i++;
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else {
          cell += c;
        }
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    if (rows.length === 0) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows
      .slice(1)
      .filter((r) => r.some((v) => v && v.trim() !== ""))
      .map((r) => {
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = (r[idx] || "").trim();
        });
        return obj;
      });
  }

  async function fetchCSV(url) {
    const bust = (url.includes("?") ? "&" : "?") + "_=" + Date.now();
    const res = await fetch(url + bust, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    return parseCSV(text);
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function colorForLayer(layerName, fallback) {
    return (MAP_CONFIG.LAYER_COLORS && MAP_CONFIG.LAYER_COLORS[layerName]) || fallback;
  }

  function getOrCreateLayerEntry(layerName, kind, defaultColor) {
    if (!layerRegistry.has(layerName)) {
      layerRegistry.set(layerName, {
        group: L.layerGroup().addTo(map),
        color: defaultColor,
        kind,
        count: 0,
      });
    }
    return layerRegistry.get(layerName);
  }

  // ---------------------------------------------------------------
  // Render: DiaDiem (markers)
  // ---------------------------------------------------------------
  function renderDiaDiem(rows) {
    rows
      .filter((r) => (r.TrangThai || "").toLowerCase() !== "ẩn" && (r.TrangThai || "").toLowerCase() !== "an")
      .forEach((r) => {
        const lat = parseFloat(r.Lat);
        const lng = parseFloat(r.Lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const layerName = r.LopBanDo || "Khác";
        const color = colorForLayer(layerName, MAP_CONFIG.DEFAULT_MARKER_COLOR);
        const entry = getOrCreateLayerEntry(layerName, "marker", color);
        entry.count++;

        const marker = L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: entry.color,
          color: "#ffffff",
          weight: 2,
          fillOpacity: 0.95,
        });

        const imgHtml = r.AnhURL
          ? `<img class="popup-img" src="${escapeHTML(r.AnhURL)}" alt="">`
          : "";
        const phoneHtml = r.SDT
          ? `<div class="popup-row"><b>Điện thoại:</b> ${escapeHTML(r.SDT)}</div>`
          : "";
        const addrHtml = r.DiaChi
          ? `<div class="popup-row"><b>Địa chỉ:</b> ${escapeHTML(r.DiaChi)}</div>`
          : "";
        const descHtml = r.MoTa ? `<div class="popup-desc">${escapeHTML(r.MoTa)}</div>` : "";

        marker.bindPopup(`
          <div class="popup-eyebrow">${escapeHTML(layerName)}</div>
          <div class="popup-title">${escapeHTML(r.TenDiaDiem || "(Chưa đặt tên)")}</div>
          ${addrHtml}
          ${phoneHtml}
          ${descHtml}
          ${imgHtml}
        `);

        entry.group.addLayer(marker);
      });
  }

  // ---------------------------------------------------------------
  // Render: VungDienTich (polygons)
  // ---------------------------------------------------------------
  function parsePolygonCoords(str) {
    if (!str) return [];
    return str
      .split(";")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [latStr, lngStr] = pair.split(",");
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        return [lat, lng];
      })
      .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));
  }

  function renderVungDienTich(rows) {
    rows
      .filter((r) => (r.TrangThai || "").toLowerCase() !== "ẩn" && (r.TrangThai || "").toLowerCase() !== "an")
      .forEach((r) => {
        const coords = parsePolygonCoords(r.ToaDoPolygon);
        if (coords.length < 3) return;

        const layerName = r.LopBanDo || "Vùng nguyên liệu";
        const color = r.MauSac && r.MauSac.trim() !== ""
          ? r.MauSac.trim()
          : colorForLayer(layerName, MAP_CONFIG.DEFAULT_POLYGON_COLOR);
        const entry = getOrCreateLayerEntry(layerName, "polygon", color);
        entry.count++;

        const polygon = L.polygon(coords, {
          color: color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.28,
        });

        const areaHtml = r.DienTich_ha
          ? `<div class="popup-row"><b>Diện tích:</b> ${escapeHTML(r.DienTich_ha)} ha</div>`
          : "";
        const cropHtml = r.LoaiCayTrong
          ? `<div class="popup-row"><b>Loại cây trồng:</b> ${escapeHTML(r.LoaiCayTrong)}</div>`
          : "";
        const descHtml = r.MoTa ? `<div class="popup-desc">${escapeHTML(r.MoTa)}</div>` : "";

        polygon.bindPopup(`
          <div class="popup-eyebrow">${escapeHTML(layerName)}</div>
          <div class="popup-title">${escapeHTML(r.TenVung || "(Chưa đặt tên)")}</div>
          ${areaHtml}
          ${cropHtml}
          ${descHtml}
        `);

        entry.group.addLayer(polygon);
      });
  }

  // ---------------------------------------------------------------
  // Layer control panel (custom, giống bản mẫu)
  // ---------------------------------------------------------------
  function buildLayerPanel() {
    els.layerList.innerHTML = "";
    const sortedNames = Array.from(layerRegistry.keys()).sort();

    sortedNames.forEach((name) => {
      const entry = layerRegistry.get(name);
      const row = document.createElement("label");
      row.className = "layer-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          entry.group.addTo(map);
        } else {
          map.removeLayer(entry.group);
        }
      });

      const swatch = document.createElement("span");
      swatch.className = "swatch" + (entry.kind === "marker" ? " dot" : "");
      swatch.style.background = entry.color;

      const lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = name;

      const count = document.createElement("span");
      count.className = "count";
      count.textContent = entry.count;

      row.appendChild(checkbox);
      row.appendChild(swatch);
      row.appendChild(lbl);
      row.appendChild(count);
      els.layerList.appendChild(row);
    });
  }

  function fitToAllLayers() {
    const allBounds = [];
    layerRegistry.forEach((entry) => {
      entry.group.eachLayer((layer) => {
        if (layer.getBounds) {
          allBounds.push(layer.getBounds());
        } else if (layer.getLatLng) {
          allBounds.push(L.latLngBounds(layer.getLatLng(), layer.getLatLng()));
        }
      });
    });
    if (allBounds.length === 0) return;
    let combined = allBounds[0];
    for (let i = 1; i < allBounds.length; i++) combined.extend(allBounds[i]);
    map.fitBounds(combined.pad(0.15));
  }

  // ---------------------------------------------------------------
  // Status pill
  // ---------------------------------------------------------------
  function setStatus(state, text) {
    els.statusDot.className = "dot " + state;
    els.statusText.textContent = text;
  }

  function formatTime(d) {
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }

  // ---------------------------------------------------------------
  // Main load cycle
  // ---------------------------------------------------------------
  async function loadAll(isFirstLoad) {
    setStatus("loading", "Đang tải dữ liệu…");
    try {
      const [diaDiemRows, vungRows] = await Promise.all([
        fetchCSV(MAP_CONFIG.DIADIEM_CSV_URL).catch(() => []),
        fetchCSV(MAP_CONFIG.VUNGDIENTICH_CSV_URL).catch(() => []),
      ]);

      // Reset toàn bộ layer cũ trước khi vẽ lại
      layerRegistry.forEach((entry) => map.removeLayer(entry.group));
      layerRegistry.clear();

      renderVungDienTich(vungRows); // vẽ polygon trước để marker nổi lên trên
      renderDiaDiem(diaDiemRows);

      buildLayerPanel();

      const totalFeatures = Array.from(layerRegistry.values()).reduce((s, e) => s + e.count, 0);

      if (totalFeatures === 0) {
        els.emptyState.style.display = "block";
        setStatus("err", "Không có dữ liệu hiển thị");
      } else {
        els.emptyState.style.display = "none";
        setStatus("ok", `Cập nhật lúc ${formatTime(new Date())}`);
        if (isFirstLoad) fitToAllLayers();
      }
    } catch (err) {
      console.error(err);
      setStatus("err", "Lỗi tải dữ liệu — bấm ↻ để thử lại");
      els.emptyState.style.display = "block";
    }
  }

  els.refreshBtn.addEventListener("click", () => loadAll(false));

  // Initial load
  loadAll(true);

  // Auto refresh
  if (MAP_CONFIG.AUTO_REFRESH_MINUTES > 0) {
    setInterval(() => loadAll(false), MAP_CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);
  }
})();
