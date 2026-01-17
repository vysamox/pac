/* ============================================================
   FIRESTORE STORAGE STATUS — ADVANCED & SAFE (CLIENT SIDE)
   ✔ No Firebase API abuse
   ✔ Defensive coding
   ✔ Production ready
============================================================ */

(() => {

  /* ================= CONFIG ================= */

  const CONFIG = Object.freeze({
    FIRESTORE_LIMIT_MB: 1024,          // Free plan limit
    UPDATE_INTERVAL: 4000,             // ms (lower = noisy)
    DEFAULT_DOC_KB: 2.5,               // fallback size

    // Weighted sizes per collection type (more accurate)
    WEIGHTED_DOC_KB: {
      livePacCount: 3.0,
      usedPacCount: 2.5,
      userAccountCount: 2.0,
      studentCount: 3.5,
      pacNavCount: 1.5,
      uclRequestCount: 2.8
    }
  });

  /* ================= SAFE HELPERS ================= */

  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function readCounter(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return safeNumber(el.textContent);
  }

  function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  }

  /* ================= CORE LOGIC ================= */

  function calculateUsageMB() {

    let totalKB = 0;

    for (const [id, weight] of Object.entries(CONFIG.WEIGHTED_DOC_KB)) {
      const count = readCounter(id);
      totalKB += count * weight;
    }

    return totalKB / 1024;
  }

  function resolveStatus(percent) {
    if (percent < 60) return "OK";
    if (percent < 80) return "WARNING";
    return "CRITICAL";
  }

  function applyBadgeStyle(badge, status) {

    badge.className = "status-ok"; // reset

    badge.style.background = "";
    badge.style.color = "";

    if (status === "WARNING") {
      badge.style.background =
        "linear-gradient(135deg,#ffcc33,#ff9900)";
      badge.style.color = "#2b1a00";
    }
    else if (status === "CRITICAL") {
      badge.style.background =
        "linear-gradient(135deg,#ff5555,#ff0000)";
      badge.style.color = "#330000";
    }
  }

  /* ================= UI UPDATE ================= */

  function updateFirestoreStorageStatus() {

    const textEl = document.getElementById("storageStatusText");
    const badgeEl = document.getElementById("storageBadge");

    if (!textEl || !badgeEl) return;

    const usedMB = calculateUsageMB();
    const percent = clamp(
      Math.round((usedMB / CONFIG.FIRESTORE_LIMIT_MB) * 100),
      0,
      100
    );

    const status = resolveStatus(percent);

    textEl.textContent =
      `${usedMB.toFixed(1)} MB / ${CONFIG.FIRESTORE_LIMIT_MB} MB (${percent}%)`;

    badgeEl.textContent = status;
    applyBadgeStyle(badgeEl, status);
  }

  /* ================= INIT ================= */

  // Initial delayed run (wait for counters to load)
  setTimeout(updateFirestoreStorageStatus, 1500);

  // Periodic refresh
  setInterval(
    updateFirestoreStorageStatus,
    CONFIG.UPDATE_INTERVAL
  );

})();
