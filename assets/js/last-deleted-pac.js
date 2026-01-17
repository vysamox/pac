/* ============================================================
   LAST DELETED PAC — MODULE (ENTERPRISE SAFE)
============================================================ */

import {
  db,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "./firebase-config.js";

/* ============================================================
   STATE
============================================================ */
let lastDeletedRecord = null;
let unsubscribeLastDelete = null;

/* ============================================================
   INIT FUNCTION
============================================================ */
export function initLastDeletedPac() {

  const label = document.getElementById("lastDeletedPac");
  const btn   = document.getElementById("viewLastDeletedBtn");

  if (!label || !btn) {
    console.warn("Last Deleted PAC UI not found");
    return;
  }

  const lastDeletedQuery = query(
    collection(db, "delete_pac"),
    orderBy("deletedAtTimestamp", "desc"),
    limit(1)
  );

  // 🔥 Cleanup old listener if re-init
  if (unsubscribeLastDelete) unsubscribeLastDelete();

  unsubscribeLastDelete = onSnapshot(
    lastDeletedQuery,
    snap => {

      if (snap.empty) {
        label.textContent = "—";
        btn.disabled = true;
        lastDeletedRecord = null;
        return;
      }

      const docSnap = snap.docs[0];
      const d = docSnap.data();

      lastDeletedRecord = { id: docSnap.id, ...d };

      label.textContent = d.deleteViewId || "—";
      btn.disabled = false;
    },
    err => {
      console.error("Last Deleted PAC listener error:", err);
      label.textContent = "⚠ Error";
      btn.disabled = true;
      lastDeletedRecord = null;
    }
  );

  /* ============================
     VIEW BUTTON
  ============================ */
  btn.onclick = () => {

    if (!lastDeletedRecord) return;

    const r = lastDeletedRecord;
    const box   = document.getElementById("lastDeleteDetails");
    const modal = document.getElementById("lastDeleteModal");

    if (!box || !modal) return;

    const deletedTime =
      r.deletedAtTimestamp?.toDate
        ? r.deletedAtTimestamp.toDate().toLocaleString()
        : (r.deleteTime || "—");

    /* ---------- FULL DETAILS (AUDIT VIEW) ---------- */
    box.innerHTML = `
      <div style="line-height:1.7; font-size:14px;">

        <div style="margin-bottom:12px;">
          <span class="lbl">Delete ID:</span>
          <span class="val highlight">${r.deleteViewId || "—"}</span>
        </div>

        <div class="group">
          <span class="lbl">Delete Type:</span>
          <span class="val">${r.deleteType || "—"}</span>
        </div>

        <hr class="sep">

        <div class="group">
          <span class="lbl">PAC No:</span>
          <span class="val">${r.pacNo || "—"}</span>
        </div>

        <div class="group">
          <span class="lbl">PAC Code:</span>
          <span class="val">${r.pacCode || "—"}</span>
        </div>

        <div class="group">
          <span class="lbl">Amount:</span>
          <span class="val highlight">${r.amount ?? "—"}</span>
        </div>

        <hr class="sep">

        <div class="group">
          <span class="lbl">UCL No:</span>
          <span class="val">${r.uclNo || "—"}</span>
        </div>

        <div class="group">
          <span class="lbl">UCL Owner:</span>
          <span class="val">${r.uclOwnerName || "—"}</span>
        </div>

        <div class="group">
          <span class="lbl">UCL Owner IP:</span>
          <span class="val">${r.uclOwnerIp || "—"}</span>
        </div>

        <hr class="sep">

        <div class="group">
          <span class="lbl">CSC Ref:</span>
          <span class="val">${r.cscRef || "—"}</span>
        </div>

        <div class="group">
          <span class="lbl">Purpose:</span>
          <span class="val">${r.purpose || "—"}</span>
        </div>

        <hr class="sep">

        <div class="group">
          <span class="lbl">Deleted At:</span>
          <span class="val">${deletedTime}</span>
        </div>

        <div class="group">
          <span class="lbl">Delete IP:</span>
          <span class="val">${r.deleteIP || "—"}</span>
        </div>

        <div class="group">
          <span class="lbl">Saved From IP:</span>
          <span class="val">${r.savedFromIp || "—"}</span>
        </div>

        <hr class="sep">

        <div class="group">
          <span class="lbl">User Browser:</span>
          <span class="val mono">${r.userBrowser || "—"}</span>
        </div>

        <div class="group">
          <span class="lbl">Device ID:</span>
          <span class="val mono">${r.deleteDeviceId || "—"}</span>
        </div>

        <hr class="sep">

        <div class="group">
          <span class="lbl">Upload Type:</span>
          <span class="val">${r.uploadType || "—"}</span>
        </div>

        <hr class="sep">

        <div class="group">
          <span class="lbl">Status:</span>
          <span class="status-ok">RECORDED</span>
        </div>

      </div>
    `;

    modal.style.display = "flex";

    /* ============================
       EXACT ROW HIGHLIGHT
    ============================ */
    if (r.deleteViewId) {
      document.querySelectorAll("#duplicateTable tr").forEach(row => {
        const cell = row.querySelector("td");
        if (!cell) return;

        if (cell.textContent.trim() === r.deleteViewId) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          row.style.boxShadow = "0 0 22px rgba(0,238,255,0.9)";
          row.style.background = "rgba(0,238,255,0.18)";

          setTimeout(() => {
            row.style.boxShadow = "";
            row.style.background = "";
          }, 3000);
        }
      });
    }
  };
}

/* ============================================================
   CLOSE MODAL
============================================================ */
window.closeLastDeleteModal = function () {
  const modal = document.getElementById("lastDeleteModal");
  if (modal) modal.style.display = "none";
};