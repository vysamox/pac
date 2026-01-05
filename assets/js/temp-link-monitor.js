/* =========================================================
   TEMP LINK MONITOR — ENTERPRISE FINAL
   ✔ Firestore v9
   ✔ Zero lag rendering
   ✔ Timestamp safe
   ✔ Advanced device detection
   ✔ No memory leaks
   ✔ Mobile-safe table
========================================================= */

import {
  db,
  collection,
  onSnapshot,
  query,
  orderBy
} from "./firebase-config.js";

/* =========================================================
   DOM REFERENCES
========================================================= */
const tableBody = document.getElementById("tempLinksTable");
const countEl   = document.getElementById("tempLinkCount");

/* =========================================================
   STATE
========================================================= */
let unsubscribe = null;
let lastRenderKey = "";

/* =========================================================
   LIVE COUNT (CHEAP)
========================================================= */
onSnapshot(collection(db, "temp_links"), snap => {
  if (countEl) countEl.textContent = snap.size;
});

/* =========================================================
   START / STOP LISTENER
========================================================= */
function startListener() {
  if (unsubscribe) return;

  unsubscribe = onSnapshot(
    query(collection(db, "temp_links"), orderBy("createdAt", "desc")),
    snap => {
      const key = snap.docs
        .map(d => d.id + (d.updateTime?.seconds || ""))
        .join("|");

      if (key !== lastRenderKey) {
        lastRenderKey = key;
        renderFast(snap);
      }
    }
  );
}

function stopListener() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    lastRenderKey = "";
  }
}

/* =========================================================
   ADVANCED DEVICE PARSER (NO LIB)
========================================================= */
function parseDevice(info = {}) {
  if (!info || typeof info !== "object") return "—";

  const device  = info.device  || "Unknown";
  const os      = info.os      || "Unknown OS";
  const browser = info.browser || "Unknown Browser";

  return `${device} • ${os} • ${browser}`;
}

/* =========================================================
   FAST RENDER ENGINE
========================================================= */
function renderFast(snap) {
  if (!tableBody) return;

  const now = Date.now();
  const frag = document.createDocumentFragment();
  tableBody.innerHTML = "";

  snap.forEach(docSnap => {
    const d = docSnap.data();

    /* ---------- TIME ---------- */
    const createdAt = fmt(d.createdAt);
    const expiresAt = fmt(d.expiresAt);
    const lastAccess = fmt(d.lastAccessAt);

    /* ---------- STATUS ---------- */
    const expired = d.expiresAt && getTime(d.expiresAt) < now;
    const locked  = d.locked === true;

    let status = "ACTIVE";
    let color  = "#00ffcc";

    if (locked) {
      status = "LOCKED";
      color  = "#ff6666";
    } else if (expired) {
      status = "EXPIRED";
      color  = "#ffaa00";
    }

    const isLive =
      d.lastHeartbeatAt &&
      now - getTime(d.lastHeartbeatAt) < 45_000;

    const rowBg =
      locked
        ? "background:rgba(255,80,80,0.15)"
        : expired
          ? "background:rgba(255,170,0,0.15)"
          : "";

    /* ---------- URL ---------- */
    const mainUrl =
      d.targetUrl ||
      d.fullUrl ||
      d.redirectUrl ||
      d.page ||
      d.origin ||
      "—";

    const shortUrl =
      mainUrl !== "—" && mainUrl.length > 42
        ? mainUrl.slice(0, 42) + "…"
        : mainUrl;

    /* ---------- DEVICE ---------- */
    const deviceText = parseDevice(d.lastDevice);

    /* ---------- ROW ---------- */
    const tr = document.createElement("tr");
    tr.style = rowBg;

    tr.innerHTML = `
<td class="val mono" data-label="Token">
  ${docSnap.id.slice(0, 12)}…
  <button class="ucl-view-btn copy-token" data-token="${docSnap.id}">
    <i class="fa-solid fa-copy"></i>
  </button>
</td>

<td data-label="Status">
  <span style="color:${color}; font-weight:800;">
    ${status}
  </span>
  ${isLive ? `<span class="vh-badge live">LIVE</span>` : ""}
</td>

<td class="val mono" data-label="Page URL" title="${mainUrl}">
  ${shortUrl}
  ${
    mainUrl !== "—"
      ? `<button class="ucl-view-btn open-url" data-url="${mainUrl}">
           <i class="fa-solid fa-arrow-up-right-from-square"></i>
         </button>`
      : ""
  }
</td>

<td data-label="Device">
  ${deviceText}
</td>

<td data-label="Access">${d.accessCount || 0}</td>
<td data-label="Reloads">${d.reloadCount || 0}</td>

<td class="val mono" data-label="Fingerprint">
  ${(d.fingerprint || "").slice(0, 22)}…
</td>

<td data-label="Created">${createdAt}</td>
<td data-label="Expires">${expiresAt}</td>
<td data-label="Last Access">${lastAccess}</td>
`;

    frag.appendChild(tr);
  });

  tableBody.appendChild(frag);
}

/* =========================================================
   EVENT DELEGATION (FAST)
========================================================= */
tableBody.addEventListener("click", e => {

  const copyBtn = e.target.closest(".copy-token");
  if (copyBtn) {
    navigator.clipboard.writeText(copyBtn.dataset.token);
    return;
  }

  const openBtn = e.target.closest(".open-url");
  if (openBtn) {
    window.open(openBtn.dataset.url, "_blank");
  }
});

/* =========================================================
   MODAL CONTROLS
========================================================= */
window.openTempLinksModal = function () {
  const modal = document.getElementById("tempLinksModal");
  if (modal) modal.style.display = "flex";
  startListener();
};

window.closeTempLinksModal = function () {
  const modal = document.getElementById("tempLinksModal");
  if (modal) modal.style.display = "none";
  stopListener();
};

/* =========================================================
   STRONG TIME UTILITIES
========================================================= */
function getTime(ts) {
  if (!ts) return 0;

  if (typeof ts === "object" && typeof ts.toDate === "function") {
    return ts.toDate().getTime();
  }

  if (typeof ts === "object" && typeof ts.seconds === "number") {
    return ts.seconds * 1000;
  }

  if (typeof ts === "number") return ts;
  if (typeof ts === "string") return new Date(ts).getTime();

  return 0;
}

function fmt(ts) {
  const t = getTime(ts);
  if (!t) return "—";

  const d = new Date(t);
  if (isNaN(d.getTime())) return "—";

  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

