/* =========================================================
   TEMP LINK MONITOR — ADMIN DASHBOARD (FINAL)
   File: temp-link-monitor.js
   ✔ Firestore v9
   ✔ No memory leaks
   ✔ Mobile-safe table
   ✔ Future-ready hooks
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
let tempLinksUnsub = null;

/* =========================================================
   LIVE COUNT (SAFE)
========================================================= */
onSnapshot(collection(db, "temp_links"), snap => {
  if (countEl) countEl.textContent = snap.size;
});

/* =========================================================
   START / STOP LISTENER (NO LEAKS)
========================================================= */
function startTempLinksListener() {
  if (tempLinksUnsub) return;

  tempLinksUnsub = onSnapshot(
    query(collection(db, "temp_links"), orderBy("createdAt", "desc")),
    snap => renderTempLinks(snap)
  );
}

function stopTempLinksListener() {
  if (tempLinksUnsub) {
    tempLinksUnsub();
    tempLinksUnsub = null;
  }
}

/* =========================================================
   RENDER TABLE
========================================================= */
function renderTempLinks(snap) {
  if (!tableBody) return;

  tableBody.innerHTML = "";
  const now = Date.now();

  snap.forEach(docSnap => {
    const d = docSnap.data();

    /* ---------- STATUS ---------- */
    const expired = d.expiresAt && now > d.expiresAt;
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

    const rowBg =
      locked
        ? "background:rgba(255,80,80,0.15)"
        : expired
          ? "background:rgba(255,170,0,0.15)"
          : "";

    /* ---------- URL DETECTION (FUTURE SAFE) ---------- */
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

    /* ---------- HEARTBEAT (FUTURE LIVE STATUS) ---------- */
    const isLive =
      d.lastHeartbeatAt &&
      now - d.lastHeartbeatAt < 45_000;

    /* ---------- ROW ---------- */
    tableBody.insertAdjacentHTML("beforeend", `
<tr style="${rowBg}">

  <!-- TOKEN -->
  <td class="val mono" data-label="Token">
    ${docSnap.id.slice(0, 12)}…
    <button class="ucl-view-btn"
      title="Copy full token"
      onclick="navigator.clipboard.writeText('${docSnap.id}')">
      <i class="fa-solid fa-copy"></i>
    </button>
  </td>

  <!-- STATUS -->
  <td data-label="Status">
    <span style="color:${color}; font-weight:800;">
      ${status}
    </span>
    ${
      isLive
        ? `<span class="vh-badge live">LIVE</span>`
        : ""
    }
  </td>

  <!-- MAIN URL -->
  <td class="val mono" data-label="Page URL" title="${mainUrl}">
    ${shortUrl}
    ${
      mainUrl !== "—"
        ? `<button class="ucl-view-btn"
             title="Open page"
             onclick="window.open('${mainUrl}', '_blank')">
             <i class="fa-solid fa-arrow-up-right-from-square"></i>
           </button>`
        : ""
    }
  </td>

  <!-- ACCESS -->
  <td data-label="Access">
    ${d.accessCount || 0}
  </td>

  <!-- RELOAD -->
  <td data-label="Reloads">
    ${d.reloadCount || 0}
  </td>

  <!-- FINGERPRINT -->
  <td class="val mono" data-label="Fingerprint">
    ${(d.fingerprint || "").slice(0, 22)}…
  </td>

  <!-- CREATED -->
  <td data-label="Created">
    ${fmt(d.createdAt)}
  </td>

  <!-- EXPIRES -->
  <td data-label="Expires">
    ${fmt(d.expiresAt)}
  </td>

  <!-- LAST ACCESS -->
  <td data-label="Last Access">
    ${fmt(d.lastAccessAt)}
  </td>

</tr>
`);
  });
}

/* =========================================================
   MODAL CONTROLS (EXPOSED)
========================================================= */
window.openTempLinksModal = function () {
  const modal = document.getElementById("tempLinksModal");
  if (modal) modal.style.display = "flex";
  startTempLinksListener();
};

window.closeTempLinksModal = function () {
  const modal = document.getElementById("tempLinksModal");
  if (modal) modal.style.display = "none";
  stopTempLinksListener();
};

/* =========================================================
   TIME FORMATTER (SAFE)
========================================================= */
function fmt(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

/* =========================================================
   🔮 FUTURE EXTENSION POINTS (READY)
========================================================= */

/*
  1️⃣ Token revoke:
      updateDoc(doc(db,"temp_links",id),{ locked:true })

  2️⃣ Token delete:
      deleteDoc(doc(db,"temp_links",id))

  3️⃣ Filter by status:
      client-side filter before render

  4️⃣ Usage analytics:
      use accessCount + reloadCount + lastHeartbeatAt

  5️⃣ Export CSV:
      iterate snap.docs and stringify

  6️⃣ Role-based visibility:
      hide modal if not admin
*/
