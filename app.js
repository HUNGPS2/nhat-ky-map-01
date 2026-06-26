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
  // Map setup — tâm và zoom lấy từ URL params nếu có, fallback về config
  // Ví dụ: ?lat=22.3488&lng=105.8244&zoom=14
  // ---------------------------------------------------------------
  function getInitialView() {
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get("lat"));
    const lng = parseFloat(params.get("lng"));
    const zoom = parseInt(params.get("zoom"), 10);
    const validLatLng = !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    const validZoom = !isNaN(zoom) && zoom >= 1 && zoom <= 22;
    return {
      center: validLatLng ? [lat, lng] : MAP_CONFIG.DEFAULT_CENTER,
      zoom: validZoom ? zoom : MAP_CONFIG.DEFAULT_ZOOM,
      hasUrlView: validLatLng, // true = người dùng đã chỉ định tọa độ → không auto-fit
    };
  }

  const initialView = getInitialView();
  const map = L.map("map", {
    zoomControl: true,
    minZoom: 5,
    maxZoom: 19,
  }).setView(initialView.center, initialView.zoom);

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

  // VungID -> { id, tenLop, imageUrl, thumbUrl, bounds: {north,south,east,west}, doPhanGiai }
  const orthoRegistry = new Map();

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

  // ---------------------------------------------------------------
  // Video helpers — hỗ trợ YouTube và Google Drive
  // ---------------------------------------------------------------
  function detectVideoType(url) {
    if (!url) return null;
    const t = url.trim();
    if (t.match(/youtube\.com\/watch|youtu\.be\//)) return "youtube";
    if (t.match(/drive\.google\.com\/file\/d\//)) return "drive";
    return null;
  }

  function getYouTubeId(url) {
    const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function parseVideoList(str) {
    if (!str) return [];
    return str.split(";").map((s) => s.trim()).filter(Boolean)
              .filter((u) => detectVideoType(u) !== null);
  }

  function buildVideoGalleryHTML(videos, groupId) {
    if (!videos || videos.length === 0) return "";
    const tiles = videos.slice(0, 6).map((url, idx) => {
      const type = detectVideoType(url);
      if (type === "youtube") {
        const vid = getYouTubeId(url);
        if (!vid) return "";
        const thumb = `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;
        return `<div class="video-tile" data-video-type="youtube" data-video-id="${vid}" data-video-url="${escapeHTML(url)}">
          <img src="${thumb}" alt="" loading="lazy">
          <div class="video-play-btn">▶</div>
        </div>`;
      }
      if (type === "drive") {
        const dm = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        if (!dm) return "";
        return `<div class="video-tile video-tile--drive" data-video-type="drive" data-video-id="${dm[1]}" data-video-url="${escapeHTML(url)}">
          <div class="video-drive-icon">📹</div>
          <div class="video-play-btn">▶</div>
        </div>`;
      }
      return "";
    }).join("");
    if (!tiles.trim()) return "";
    return `<div class="video-gallery">${tiles}</div>`;
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
        const videos = parseVideoList(r.VideoURLs || "");
        const videoHtml = buildVideoGalleryHTML(videos, "DD-" + (r.ID || layerName));
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
          ${videoHtml}
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

  // ---------------------------------------------------------------
  // Orthomosaic registry — nạp từ sheet Orthomosaic, tra cứu theo VungID
  // ---------------------------------------------------------------
  function loadOrthomosaicRegistry(rows) {
    orthoRegistry.clear();
    rows
      .filter((r) => (r.TrangThai || "").toLowerCase() !== "ẩn" && (r.TrangThai || "").toLowerCase() !== "an")
      .forEach((r) => {
        const north = parseFloat(r.BoundsNorth);
        const south = parseFloat(r.BoundsSouth);
        const east = parseFloat(r.BoundsEast);
        const west = parseFloat(r.BoundsWest);
        if ([north, south, east, west].some((v) => isNaN(v))) return;
        if (!r.ImageURL) return;

        orthoRegistry.set(r.VungID, {
          id: r.ID,
          vungId: r.VungID,
          tenLop: r.TenLop || "Orthomosaic",
          imageUrl: toDirectImageURL(r.ImageURL),
          thumbUrl: r.ThumbURL ? toDirectImageURL(r.ThumbURL) : toDirectImageURL(r.ImageURL),
          bounds: { north, south, east, west },
          doPhanGiai: r.DoPhanGiai_cm || "",
        });
      });
  }

  function buildOrthoButtonHTML(vungId) {
    const ortho = orthoRegistry.get(vungId);
    if (!ortho) return "";
    return `
      <img class="ortho-thumb-preview" src="${escapeHTML(ortho.thumbUrl)}" loading="lazy" alt=""
           onclick="window.__openOrthoViewer('${escapeHTML(vungId)}')">
      <button class="ortho-btn" onclick="window.__openOrthoViewer('${escapeHTML(vungId)}')">
        <span class="ortho-ico">🛰️</span> Xem ảnh chi tiết (Orthomosaic)
      </button>
    `;
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
        const videos = parseVideoList(r.VideoURLs || "");
        const videoHtml = buildVideoGalleryHTML(videos, "VT-" + (r.ID || layerName));
        const orthoHtml = buildOrthoButtonHTML(r.ID);

        polygon.bindPopup(`
          <div class="popup-eyebrow">${escapeHTML(layerName)}</div>
          <div class="popup-title">${escapeHTML(r.TenVung || "(Chưa đặt tên)")}</div>
          ${areaHtml}
          ${cropHtml}
          ${descHtml}
          ${galleryHtml}
          ${videoHtml}
          ${orthoHtml}
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
        const orthoHtmlTree = buildOrthoButtonHTML(r.VungID);

        marker.bindPopup(`
          <div class="popup-eyebrow">${escapeHTML(layerName)}</div>
          <div class="popup-title">${escapeHTML(r.LoaiCay || "(Chưa rõ loại)")}</div>
          ${vungHtml}
          ${ngayHtml}
          ${accHtml}
          ${nguonHtml}
          ${descHtml}
          ${orthoHtmlTree}
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
      const [diaDiemRows, vungRows, cayRows, orthoRows] = await Promise.all([
        fetchCSV(MAP_CONFIG.DIADIEM_CSV_URL).catch(() => []),
        fetchCSV(MAP_CONFIG.VUNGDIENTICH_CSV_URL).catch(() => []),
        fetchCSV(MAP_CONFIG.CAYTRONG_CSV_URL).catch(() => []),
        fetchCSV(MAP_CONFIG.ORTHOMOSAIC_CSV_URL).catch(() => []),
      ]);

      // Nạp registry orthomosaic TRƯỚC khi vẽ popup, vì popup tra cứu registry này
      loadOrthomosaicRegistry(orthoRows);

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
        if (isFirstLoad && !initialView.hasUrlView) fitToAllLayers();
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
    // Dọn video player nếu đang ở mode video
    if (lightbox.dataset.mode === "video") {
      lightbox.querySelector(".video-player-container")?.remove();
      lbImg.style.display = "";
      lightbox.querySelector(".lb-nav").style.display = "";
      delete lightbox.dataset.mode;
      document.body.style.overflow = "";
    }
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
    // Click ảnh gallery
    const img = e.target.closest("img[data-gallery]");
    if (img) {
      try {
        const images = JSON.parse(decodeURIComponent(img.dataset.gallery));
        const index = parseInt(img.dataset.index, 10) || 0;
        openLightbox(images, index);
      } catch (err) {
        console.error("Lightbox parse error", err);
      }
      return;
    }
    // Click video tile
    const tile = e.target.closest(".video-tile");
    if (tile) {
      openVideoLightbox(tile.dataset.videoType, tile.dataset.videoId);
    }
  });

  // ---------------------------------------------------------------
  // Video lightbox — dùng lại khung #lightbox, swap nội dung thành player
  // ---------------------------------------------------------------
  function openVideoLightbox(type, videoId) {
    const lb = lightbox;
    // Ẩn ảnh + nav, chèn iframe player
    lbImg.style.display = "none";
    lb.querySelector(".lb-nav").style.display = "none";
    lb.querySelector(".video-player-container")?.remove();

    const container = document.createElement("div");
    container.className = "video-player-container";

    const src = type === "youtube"
      ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
      : `https://drive.google.com/file/d/${videoId}/preview`;

    container.innerHTML = `<iframe src="${src}" frameborder="0"
      allow="autoplay; fullscreen; picture-in-picture" allowfullscreen
      style="width:min(88vw,1000px);height:min(50vw,560px);border-radius:10px;"></iframe>`;

    lb.insertBefore(container, lb.querySelector(".lb-nav"));
    lb.dataset.mode = "video";
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  // Tự động ẩn/hiện lớp Cây trồng khi người dùng zoom vào/ra
  map.on("zoomend", applyCayTrongZoomVisibility);

  // ---------------------------------------------------------------
  // Chỉ số mức zoom hiện tại — đặt ngay dưới control +/- của Leaflet
  // ---------------------------------------------------------------
  const zoomIndicator = document.getElementById("zoom-indicator");

  function positionZoomIndicator() {
    const zoomControlEl = document.querySelector(".leaflet-control-zoom");
    if (!zoomControlEl) return;
    const rect = zoomControlEl.getBoundingClientRect();
    const mapRect = document.getElementById("map").getBoundingClientRect();
    zoomIndicator.style.top = (rect.bottom - mapRect.top + 8) + "px";
  }

  function updateZoomIndicator() {
    const z = map.getZoom();
    const minZoom = MAP_CONFIG.CAYTRONG_MIN_ZOOM || 17;
    zoomIndicator.textContent = "Z" + z;
    zoomIndicator.title = z >= minZoom
      ? "Đủ zoom để xem lớp Cây trồng"
      : `Zoom thêm ${minZoom - z} mức nữa để thấy lớp Cây trồng`;
    zoomIndicator.style.color = z >= minZoom ? "var(--moss-dark)" : "#8b9186";
  }

  map.on("zoomend", updateZoomIndicator);
  map.on("zoomend", positionZoomIndicator);
  map.whenReady(() => {
    positionZoomIndicator();
    updateZoomIndicator();
  });
  window.addEventListener("resize", positionZoomIndicator);

  // ---------------------------------------------------------------
  // Orthomosaic full-screen viewer — Leaflet riêng, dùng imageOverlay
  // để pan/zoom mượt trên ảnh độ phân giải cao, định vị đúng theo bounds thật
  // ---------------------------------------------------------------
  const orthoViewerEl = document.getElementById("ortho-viewer");
  const orthoViewerClose = document.getElementById("ortho-viewer-close");
  const orthoViewerTitle = document.getElementById("ortho-viewer-title");
  const orthoViewerSub = document.getElementById("ortho-viewer-sub");

  let orthoMap = null;
  let orthoImageLayer = null;

  function openOrthoViewer(vungId) {
    const ortho = orthoRegistry.get(vungId);
    if (!ortho) {
      showEmptyOrthoNotice();
      return;
    }

    orthoViewerTitle.textContent = ortho.tenLop + (vungId ? ` — ${vungId}` : "");
    orthoViewerSub.textContent = ortho.doPhanGiai
      ? `Độ phân giải ~${ortho.doPhanGiai}cm/pixel`
      : "Ảnh chụp độ phân giải cao";

    orthoViewerEl.classList.add("open");
    document.body.style.overflow = "hidden";

    const b = ortho.bounds;
    const leafletBounds = [
      [b.south, b.west],
      [b.north, b.east],
    ];

    // Khởi tạo map riêng cho viewer chỉ 1 lần, các lần sau tái sử dụng
    if (!orthoMap) {
      orthoMap = L.map("ortho-map", {
        crs: L.CRS.EPSG3857,
        minZoom: 10,
        maxZoom: 24,
        zoomControl: true,
        attributionControl: false,
      });
    }

    if (orthoImageLayer) {
      orthoMap.removeLayer(orthoImageLayer);
    }

    orthoImageLayer = L.imageOverlay(ortho.imageUrl, leafletBounds, {
      interactive: false,
    }).addTo(orthoMap);

    // Cho phép kéo/zoom tự do nhưng giới hạn không trôi quá xa khỏi ảnh
    const padded = L.latLngBounds(leafletBounds).pad(0.6);
    orthoMap.setMaxBounds(padded);

    // Đợi viewer hiện ra (display:flex áp dụng) rồi mới invalidateSize + fitBounds,
    // vì Leaflet cần kích thước container đã render xong để tính đúng
    requestAnimationFrame(() => {
      orthoMap.invalidateSize();
      orthoMap.fitBounds(leafletBounds, { padding: [20, 20] });
    });
  }

  function showEmptyOrthoNotice() {
    showToastIfAvailable("Vùng này chưa có dữ liệu orthomosaic");
  }

  function showToastIfAvailable(msg) {
    // Dùng lại style toast nếu trang có sẵn, fallback alert nhẹ nhàng nếu không
    console.warn(msg);
  }

  function closeOrthoViewer() {
    orthoViewerEl.classList.remove("open");
    document.body.style.overflow = "";
  }

  orthoViewerClose.addEventListener("click", closeOrthoViewer);
  orthoViewerEl.addEventListener("click", (e) => {
    if (e.target === orthoViewerEl) closeOrthoViewer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && orthoViewerEl.classList.contains("open")) {
      closeOrthoViewer();
    }
  });

  // Expose ra global để onclick inline trong popup HTML gọi được
  window.__openOrthoViewer = openOrthoViewer;

  // Initial load
  loadAll(true);

  // Auto refresh
  if (MAP_CONFIG.AUTO_REFRESH_MINUTES > 0) {
    setInterval(() => loadAll(false), MAP_CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);
  }
})();
