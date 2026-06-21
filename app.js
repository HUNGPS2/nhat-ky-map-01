(function () {
  "use strict";

  const els = {
    btnGps: document.getElementById("btn-gps"),
    gpsStatus: document.getElementById("gps-status"),
    gpsCoords: document.getElementById("gps-coords"),
    gpsAccuracy: document.getElementById("gps-accuracy"),
    loaiCay: document.getElementById("loai-cay"),
    vungId: document.getElementById("vung-id"),
    ghiChu: document.getElementById("ghi-chu"),
    btnSubmit: document.getElementById("btn-submit"),
    recentList: document.getElementById("recent-list"),
    toast: document.getElementById("toast"),
  };

  let currentPosition = null; // { lat, lng, accuracy }
  let watchId = null;
  let sessionCount = 0;
  const recentTrees = [];

  // ---------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------
  function showToast(message, kind) {
    els.toast.textContent = message;
    els.toast.className = "toast show" + (kind ? " " + kind : "");
    setTimeout(() => {
      els.toast.className = "toast";
    }, 2800);
  }

  // ---------------------------------------------------------------
  // GPS
  // ---------------------------------------------------------------
  function startLocating() {
    if (!navigator.geolocation) {
      showToast("Trình duyệt không hỗ trợ định vị GPS", "err");
      return;
    }

    els.btnGps.disabled = true;
    els.btnGps.classList.add("locating");
    els.btnGps.textContent = "📡 Đang định vị…";
    els.gpsStatus.textContent = "Đang dò tín hiệu GPS, đứng yên vài giây…";
    els.btnSubmit.disabled = true;

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }

    let bestAccuracy = Infinity;
    let samples = 0;
    const maxSamples = 5;
    const startTime = Date.now();
    const maxWaitMs = 12000;

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        samples++;
        const { latitude, longitude, accuracy } = pos.coords;

        if (accuracy < bestAccuracy) {
          bestAccuracy = accuracy;
          currentPosition = { lat: latitude, lng: longitude, accuracy };
          renderPosition(currentPosition);
        }

        const elapsed = Date.now() - startTime;
        const goodEnough = bestAccuracy <= TREE_FORM_CONFIG.GOOD_ACCURACY_METERS;

        if (samples >= maxSamples || elapsed >= maxWaitMs || goodEnough) {
          stopLocating();
        }
      },
      (err) => {
        stopLocating();
        let msg = "Không lấy được vị trí. ";
        if (err.code === err.PERMISSION_DENIED) {
          msg += "Vui lòng cho phép truy cập vị trí trong cài đặt trình duyệt.";
        } else if (err.code === err.TIMEOUT) {
          msg += "Hết thời gian chờ, thử lại ở nơi thoáng (ngoài trời).";
        } else {
          msg += "Thử lại sau.";
        }
        els.gpsStatus.textContent = msg;
        showToast(msg, "err");
      },
      {
        enableHighAccuracy: true,
        timeout: maxWaitMs,
        maximumAge: 0,
      }
    );
  }

  function stopLocating() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    els.btnGps.disabled = false;
    els.btnGps.classList.remove("locating");
    els.btnGps.textContent = "📍 Lấy lại vị trí";
    validateForm();
  }

  function renderPosition(p) {
    els.gpsCoords.textContent = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
    els.gpsStatus.textContent = "Đã có vị trí";

    const goodAcc = TREE_FORM_CONFIG.GOOD_ACCURACY_METERS || 8;
    const accText = `Độ chính xác: ±${Math.round(p.accuracy)}m`;
    els.gpsAccuracy.textContent = accText;
    els.gpsAccuracy.className = "gps-accuracy " + (p.accuracy <= goodAcc ? "good" : "warn");
  }

  // ---------------------------------------------------------------
  // Form validation
  // ---------------------------------------------------------------
  function validateForm() {
    const valid = currentPosition !== null && els.loaiCay.value !== "";
    els.btnSubmit.disabled = !valid;
  }

  els.loaiCay.addEventListener("change", validateForm);
  els.btnGps.addEventListener("click", startLocating);

  // ---------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------
  function generateTreeId() {
    const ts = Date.now().toString(36).toUpperCase();
    return `C-${ts}`;
  }

  async function submitTree() {
    if (!currentPosition || !els.loaiCay.value) return;

    els.btnSubmit.disabled = true;
    els.btnSubmit.textContent = "Đang lưu…";

    const payload = {
      ID: generateTreeId(),
      LoaiCay: els.loaiCay.value,
      VungID: els.vungId.value.trim(),
      Lat: currentPosition.lat,
      Lng: currentPosition.lng,
      DoChinhXac_m: Math.round(currentPosition.accuracy),
      GhiChu: els.ghiChu.value.trim(),
      NguonDuLieu: "Điền dã",
      ThoiGianGhi: new Date().toISOString(),
    };

    try {
      const res = await fetch(TREE_FORM_CONFIG.WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("HTTP " + res.status);

      sessionCount++;
      recentTrees.unshift(payload);
      renderRecentList();
      showToast(`✓ Đã lưu cây #${sessionCount}: ${payload.LoaiCay}`, "ok");
      resetFormKeepLocation();
    } catch (err) {
      console.error(err);
      showToast("Lỗi gửi dữ liệu — kiểm tra kết nối mạng và thử lại", "err");
    } finally {
      els.btnSubmit.textContent = "Lưu cây này";
      validateForm();
    }
  }

  function resetFormKeepLocation() {
    // Giữ vị trí GPS hiện tại (vì cây tiếp theo thường rất gần), chỉ xóa loại cây + ghi chú
    // để người dùng nhập nhanh cây kế tiếp mà không phải bấm GPS lại liên tục nếu đi dọc hàng cây
    els.ghiChu.value = "";
    els.loaiCay.value = "";
    validateForm();
  }

  function renderRecentList() {
    if (recentTrees.length === 0) {
      els.recentList.innerHTML = '<div style="color:#a8ad9f;">Chưa có cây nào</div>';
      return;
    }
    els.recentList.innerHTML = recentTrees
      .slice(0, 8)
      .map((t) => {
        const time = new Date(t.ThoiGianGhi).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<div class="recent-item"><span><b>${escapeHTML(t.LoaiCay)}</b> ${t.VungID ? "· " + escapeHTML(t.VungID) : ""}</span><span>${time}</span></div>`;
      })
      .join("");
  }

  function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  els.btnSubmit.addEventListener("click", submitTree);

  // Lấy vị trí ngay khi mở trang để tiết kiệm thao tác
  startLocating();
})();
