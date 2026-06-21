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

  // Đổi link Google Drive dạng share (.../file/d/ID/view) sang dạng hiển thị ảnh trực tiếp.
  // Lưu ý: định dạng cũ "uc?export=view&id=" đã bị Google Drive hạn chế hotlink (hay trả lỗi/icon hỏng
  // dù file đã public). Dùng "thumbnail?id=...&sz=w1000" ổn định hơn nhiều cho việc nhúng trực tiếp.
  function toDirectImageURL(url) {
    if (!url) return url;
    const trimmed = url.trim();
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveMatch) {
      return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1000`;
    }
    const openMatch = trimmed.match(/drive\.google\.com\/open\?id=([^&]+)/);
    if (openMatch) {
      return `https://drive.google.com/thumbnail?id=${openMatch[1]}&sz=w1000`;
    }
    return trimmed;
  }

  // Parse cột AnhURLs: nhiều link cách nhau bởi ";"
  function parseImageList(str) {
    if (!str) return [];
    return str
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(toDirectImageURL);
  }

  function buildGalleryHTML(images, groupId) {
    if (!images || images.length === 0) return "";
    const max = MAP_CONFIG.MAX_POPUP_IMAGES || 6;
    const shown = images.slice(0, max);
    const encoded = encodeURIComponent(JSON.stringify(images));

    const tiles = shown
      .map((url, idx) => {
        const fallback = toFallbackImageURL(url);
        const onerror = fallback
          ? `this.onerror=null;this.src='${fallback.replace(/'/g, "\\'")}';`
          : `this.onerror=null;this.classList.add('img-broken');`;
        return `<img src="${escapeHTML(url)}" onerror="${onerror}" data-gallery="${encoded}" data-index="${idx}" loading="lazy" alt="">`;
      })
      .join("");

    return `<div class="popup-gallery" data-group="${groupId}">${tiles}</div>`;
  }

  // Link dự phòng nếu thumbnail?id=... lỗi: thử kiểu uc?export=view (đôi khi 1 trong 2 hoạt động tuỳ file)
  function toFallbackImageURL(thumbnailUrl) {
    const m = thumbnailUrl.match(/thumbnail\?id=([^&]+)/);
    if (!m) return null;
    return `https://drive.google.com/uc?export=view&id=${m[1]}`;
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

        const images = parseImageList(r.AnhURLs || r.AnhURL);
        const galleryHtml = buildGalleryHTML(images, "DD-" + (r.ID || layerName));
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
          ${galleryHtml}
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
        const images = parseImageList(r.AnhURLs);
        const galleryHtml = buildGalleryHTML(images, "VT-" + (r.ID || layerName));

        polygon.bindPopup(`
          <div class="popup-eyebrow">${escapeHTML(layerName)}</div>
          <div class="popup-title">${escapeHTML(r.TenVung || "(Chưa đặt tên)")}</div>
          ${areaHtml}
          ${cropHtml}
          ${descHtml}
          ${galleryHtml}
        `);

        entry.group.addLayer(polygon);
      });
  }

  // ---------------------------------------------------------------
  // Render: CayTrong (định vị từng cây — marker nhỏ, dày đặc)
  // ---------------------------------------------------------------
  function renderCayTrong(rows) {
    rows
      .filter((r) => (r.TrangThai || "").toLowerCase() !== "ẩn" && (r.TrangThai || "").toLowerCase() !== "an")
      .forEach((r) => {
        const lat = parseFloat(r.Lat);
        const lng = parseFloat(r.Lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const layerName = r.LopBanDo || "Cây trồng";
        const treeColors = MAP_CONFIG.TREE_TYPE_COLORS || {};
        const color = treeColors[r.LoaiCay] || colorForLayer(layerName, "#7a9a3d");
        const entry = getOrCreateLayerEntry(layerName, "marker", color);
        entry.count++;

        const marker = L.circleMarker([lat, lng], {
          radius: 4,
          fillColor: color,
          color: "#ffffff",
          weight: 1.2,
          fillOpacity: 0.95,
        });

        const accHtml = r.DoChinhXac_m
          ? `<div class="popup-row"><b>Độ chính xác GPS:</b> ±${escapeHTML(r.DoChinhXac_m)}m</div>`
          : "";
        const vungHtml = r.VungID
          ? `<div class="popup-row"><b>Thuộc vùng:</b> ${escapeHTML(r.VungID)}</div>`
          : "";
        const ngayHtml = r.NgayTrong
          ? `<div class="popup-row"><b>Ngày trồng:</b> ${escapeHTML(r.NgayTrong)}</div>`
          : "";
        const nguonHtml = r.NguonDuLieu
          ? `<div class="popup-row"><b>Nguồn dữ liệu:</b> ${escapeHTML(r.NguonDuLieu)}</div>`
          : "";
        const descHtml = r.GhiChu ? `<div class="popup-desc">${escapeHTML(r.GhiChu)}</div>` : "";

        marker.bindPopup(`
          <div class="popup-eyebrow">${escapeHTML(layerName)}</div>
          <div class="popup-title">${escapeHTML(r.LoaiCay || "(Chưa rõ loại)")}</div>
          ${vungHtml}
          ${ngayHtml}
          ${accHtml}
          ${nguonHtml}
          ${descHtml}
        `);

        entry.group.addLayer(marker);
      });
  }

  // Ẩn/hiện lớp Cây trồng theo mức zoom — tránh rối mắt khi xem toàn vùng,
  // chỉ hiện khi zoom đủ sâu để phân biệt từng cây
  function applyCayTrongZoomVisibility() {
    const entry = layerRegistry.get("Cây trồng");
    if (!entry) return;
    const minZoom = MAP_CONFIG.CAYTRONG_MIN_ZOOM || 17;
    const checkbox = document.querySelector('.layer-row input[data-layer="Cây trồng"]');
    const userEnabled = checkbox ? checkbox.checked : true;

    if (!userEnabled) return; // người dùng đã tắt thủ công, không can thiệp

    if (map.getZoom() >= minZoom) {
      if (!map.hasLayer(entry.group)) entry.group.addTo(map);
    } else {
      if (map.hasLayer(entry.group)) map.removeLayer(entry.group);
    }
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
      checkbox.dataset.layer = name;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          if (name === "Cây trồng") {
            applyCayTrongZoomVisibility();
          } else {
            entry.group.addTo(map);
          }
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
      if (name === "Cây trồng") {
        const hint = document.createElement("span");
        hint.style.cssText = "display:block;font-size:10px;color:#a8ad9f;font-weight:400;";
        hint.textContent = `Zoom ≥${MAP_CONFIG.CAYTRONG_MIN_ZOOM || 17} để xem`;
        lbl.appendChild(hint);
      }

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
      const [diaDiemRows, vungRows, cayRows] = await Promise.all([
        fetchCSV(MAP_CONFIG.DIADIEM_CSV_URL).catch(() => []),
        fetchCSV(MAP_CONFIG.VUNGDIENTICH_CSV_URL).catch(() => []),
        fetchCSV(MAP_CONFIG.CAYTRONG_CSV_URL).catch(() => []),
      ]);

      // Reset toàn bộ layer cũ trước khi vẽ lại
      layerRegistry.forEach((entry) => map.removeLayer(entry.group));
      layerRegistry.clear();

      renderVungDienTich(vungRows); // vẽ polygon trước để marker nổi lên trên
      renderDiaDiem(diaDiemRows);
      renderCayTrong(cayRows);

      buildLayerPanel();
      applyCayTrongZoomVisibility(); // áp dụng ngay theo mức zoom hiện tại

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

  // ---------------------------------------------------------------
  // Lightbox: phóng to ảnh khi click vào gallery trong popup
  // ---------------------------------------------------------------
  const lightbox = document.getElementById("lightbox");
  const lbImg = document.getElementById("lb-img");
  const lbCount = document.getElementById("lb-count");
  const lbPrev = document.getElementById("lb-prev");
  const lbNext = document.getElementById("lb-next");
  const lbClose = document.getElementById("lb-close");

  let currentGallery = [];
  let currentIndex = 0;

  function openLightbox(images, index) {
    currentGallery = images;
    currentIndex = index;
    updateLightboxImage();
    lightbox.classList.add("open");
  }

  function updateLightboxImage() {
    const url = currentGallery[currentIndex];
    lbImg.onerror = function () {
      const fallback = toFallbackImageURL(url);
      if (fallback && lbImg.src !== fallback) {
        lbImg.onerror = null;
        lbImg.src = fallback;
      }
    };
    lbImg.src = url;
    lbCount.textContent = `${currentIndex + 1} / ${currentGallery.length}`;
    const multi = currentGallery.length > 1;
    lbPrev.style.visibility = multi ? "visible" : "hidden";
    lbNext.style.visibility = multi ? "visible" : "hidden";
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lbImg.src = "";
  }

  lbPrev.addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + currentGallery.length) % currentGallery.length;
    updateLightboxImage();
  });
  lbNext.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % currentGallery.length;
    updateLightboxImage();
  });
  lbClose.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") lbPrev.click();
    if (e.key === "ArrowRight") lbNext.click();
  });

  // Event delegation: popup content được Leaflet tạo động nên gắn listener trên document
  document.addEventListener("click", (e) => {
    const img = e.target.closest("img[data-gallery]");
    if (!img) return;
    try {
      const images = JSON.parse(decodeURIComponent(img.dataset.gallery));
      const index = parseInt(img.dataset.index, 10) || 0;
      openLightbox(images, index);
    } catch (err) {
      console.error("Lightbox parse error", err);
    }
  });

  // Tự động ẩn/hiện lớp Cây trồng khi người dùng zoom vào/ra
  map.on("zoomend", applyCayTrongZoomVisibility);

  // Initial load
  loadAll(true);

  // Auto refresh
  if (MAP_CONFIG.AUTO_REFRESH_MINUTES > 0) {
    setInterval(() => loadAll(false), MAP_CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);
  }
})();
