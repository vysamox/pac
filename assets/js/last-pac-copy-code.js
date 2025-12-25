/* ============================================================
   LAST PAC COPY CODE MODULE (SAME AS LAST DELETED PAC)
============================================================ */

import {
  db,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  doc
} from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {

  const label = document.getElementById("lastPacCopyCode");
  const btn   = document.getElementById("viewLastPacCopyBtn");

  if (!label || !btn) return;

  let lastPacDocId = null;

  /* --------------------------------------------
     LIVE LAST COPIED PAC
  -------------------------------------------- */
  const q = query(
    collection(db, "pac_entries"),
    where("copied", "==", true),
    orderBy("copyDate", "desc"),
    orderBy("copyTime", "desc"),
    limit(1)
  );

  onSnapshot(q, snap => {

    if (snap.empty) {
      label.textContent = "—";
      btn.disabled = true;
      lastPacDocId = null;
      return;
    }

    const docSnap = snap.docs[0];
    const d = docSnap.data();

    label.textContent = d.pacCode || docSnap.id;
    lastPacDocId = docSnap.id;
    btn.disabled = false;
  });

  /* --------------------------------------------
     VIEW BUTTON
  -------------------------------------------- */
  btn.addEventListener("click", async () => {
    if (!lastPacDocId) return;

    document.getElementById("lastCopyModal").style.display = "flex";

    const box = document.getElementById("lastCopyDetails");
    box.innerHTML = "Loading…";

    try {
      const snap = await getDoc(doc(db, "pac_entries", lastPacDocId));
      if (!snap.exists()) {
        box.innerHTML = "PAC not found";
        return;
      }

      const p = snap.data();

      box.innerHTML = `
  <div class="group">
    <span class="lbl">PAC Code</span>
    <span class="val highlight">${p.pacCode || p.pacNo || lastPacDocId}</span>
  </div>

  <div class="group">
    <span class="lbl">UCL Owner</span>
    <span class="val">${p.uclOwnerName || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">UCL ID</span>
    <span class="val">${p.uclNo || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">CSC Ref</span>
    <span class="val mono">${p.cscRef || "-"}</span>
  </div>

  <hr class="sep">

  <div class="group">
    <span class="lbl">Purpose</span>
    <span class="val">${p.purpose || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">Amount</span>
    <span class="val highlight">₹ ${p.amount || "0.00"}</span>
  </div>

  <div class="group">
    <span class="lbl">Order Date</span>
    <span class="val">${p.orderDate || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">Entry Date</span>
    <span class="val">${p.entryDate || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">Entry Time</span>
    <span class="val">${p.entryTime || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">Copy Date</span>
    <span class="val">${p.copyDate || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">Copy Time</span>
    <span class="val">${p.copyTime || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">Copy IP</span>
    <span class="val mono">${p.copyIP || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">Saved From IP</span>
    <span class="val mono">${p.savedFromIp || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">Upload Type</span>
    <span class="val">${p.uploadType || "-"}</span>
  </div>

  <div class="group">
    <span class="lbl">UCL Owner IP</span>
    <span class="val mono">${p.uclOwnerIp || "-"}</span>
  </div>

  <hr class="sep">

  <div class="group">
    <span class="lbl">Status</span>
    <span class="status-ok">COPIED</span>
  </div>
`;

    } catch (e) {
      console.error(e);
      box.innerHTML = "Failed to load PAC details";
    }
  });

});

/* --------------------------------------------
   CLOSE MODAL
-------------------------------------------- */
window.closeLastCopyModal = function () {
  document.getElementById("lastCopyModal").style.display = "none";
};
