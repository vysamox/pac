    /* ============================================================
    PAC AMOUNT EDIT MODULE
    File: pac-amount-edit.js
    ============================================================ */

    import {
    db,
    doc,
    getDoc,
    updateDoc
    } from "./firebase-config.js";

    import { logAdminAction } from "./admin-audit-log.js";

    /* ============================================================
    STATE
    ============================================================ */
    let currentPacDocId = null;
    let currentPacSnapshot = null;

    /* ===============================
   LOAD USER IP (GLOBAL)
================================ */
fetch("https://api.ipify.org?format=json")
  .then(res => res.json())
  .then(data => {
    window.USER_IP = data.ip;
    console.log("🌐 User IP:", window.USER_IP);
  })
  .catch(() => {
    window.USER_IP = "UNKNOWN";
  });


    /* ============================================================
    OPEN EDIT MODAL
    ============================================================ */
    window.openPacAmountEditor = async function (pacDocId) {

    currentPacDocId = pacDocId;

    const ref = doc(db, "pac_entries", pacDocId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        alert("PAC entry not found");
        return;
    }

    currentPacSnapshot = snap.data();

    // Ensure editCount exists
currentPacSnapshot.editCount =
  Number(currentPacSnapshot.editCount || 0);


    // Fill modal fields
    document.getElementById("editPacNo").textContent =
        currentPacSnapshot.pacNo || "-";

    document.getElementById("editPacCurrentAmount").textContent =
        currentPacSnapshot.amount || 0;

    document.getElementById("editPacNewAmount").value =
        currentPacSnapshot.amount || 0;

    document.getElementById("editPacReason").value = "";

    document.getElementById("pacEditModal").style.display = "flex";
    };

    /* ============================================================
    CLOSE MODAL
    ============================================================ */
    window.closePacAmountEditor = function () {
    document.getElementById("pacEditModal").style.display = "none";
    currentPacDocId = null;
    currentPacSnapshot = null;
    };

    /* ============================================================
    SAVE EDIT
    ============================================================ */
    window.savePacAmountEdit = async function () {

        const editCount = currentPacSnapshot.editCount + 1;


    if (!currentPacDocId || !currentPacSnapshot) {
        alert("Invalid edit session");
        return;
    }

    const newAmount = Number(
        document.getElementById("editPacNewAmount").value
    );

    const reason =
        document.getElementById("editPacReason").value.trim();

    const oldAmount = Number(currentPacSnapshot.amount || 0);

    /* ---------------- VALIDATION ---------------- */
    if (!newAmount || newAmount <= 0) {
        alert("Enter a valid amount");
        return;
    }

    if (!reason) {
        alert("Correction reason is mandatory");
        return;
    }

    if (newAmount === oldAmount) {
        alert("Amount unchanged");
        return;
    }

    const ok = confirm(
        `Confirm PAC amount correction?\n\n` +
        `Old: ${oldAmount}\n` +
        `New: ${newAmount}`
    );

    if (!ok) return;

   /* ---------------- UPDATE ---------------- */
  const ref = doc(db, "pac_entries", currentPacDocId);

  const start = performance.now();
  const now = getNowMeta();
  const editorIp = getUserIpSafe();

await updateDoc(ref, {
  amount: newAmount,
  previousAmount: oldAmount,
  correctedAmount: newAmount,

  // 🔢 EDIT COUNT
  editCount: editCount,

  // 🕒 TIME META
  correctedAt: now.ts,
  correctedDate: now.date,
  correctedTime: now.time,

  // 👤 ADMIN META
  correctedBy: "admin",
  correctedFromIp: editorIp,

  // 📝 REASON
  correctionReason: reason
});



    /* ---------------- AUDIT LOG ---------------- */
   await logAdminAction({
    action: "PAC_AMOUNT_EDIT",
    module: "PAC",
    targetId: currentPacSnapshot.pacNo,
    description: "PAC amount corrected from mismatch alert",

    before: {
      amount: oldAmount
    },

    after: {
      amount: newAmount
    },

    meta: {
      ip: editorIp,
      date: now.date,
      time: now.time
    },

    severity: "HIGH",
    durationMs: Math.round(performance.now() - start)
  });

    alert("PAC amount updated successfully");

    closePacAmountEditor();
    };

    /* ============================================================
   HELPERS
============================================================ */
function getNowMeta() {
  const now = new Date();

  return {
    ts: Date.now(),
    date: now.toLocaleDateString("en-GB"), // DD/MM/YYYY
    time: now.toLocaleTimeString("en-GB"), // HH:MM:SS
  };
}

function getUserIpSafe() {
  return window.USER_IP || window.userIP || "UNKNOWN";
}
