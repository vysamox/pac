/* ============================================================
   PAC ENTRY DELETE MODULE (ARCHIVE SAFE)
   File: pac-entry-delete.js
============================================================ */

import {
  db,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocFromServer
} from "./firebase-config.js";

import { logAdminAction } from "./admin-audit-log.js";

/* ============================================================
   HELPERS
============================================================ */

function getNowMeta() {
  const now = new Date();
  return {
    ts: Date.now(),
    date: now.toLocaleDateString("en-GB"), // DD/MM/YYYY
    time: now.toLocaleTimeString("en-GB")  // HH:MM:SS
  };
}

function getUserIpSafe() {
  return window.USER_IP || window.userIP || "UNKNOWN";
}

/* ============================================================
   DELETE VIEW ID (v9 SAFE)
============================================================ */

async function generateDeleteViewId() {
  const ref = doc(db, "system_counters", "delete_counter");
  const snap = await getDocFromServer(ref);

  let newNumber = 1;

  if (snap.exists()) {
    newNumber = (snap.data().count || 0) + 1;
    await setDoc(ref, { count: newNumber }, { merge: true });
  } else {
    await setDoc(ref, { count: 1 });
  }

  return "DEL-" + String(newNumber).padStart(5, "0");
}

/* ============================================================
   MAIN DELETE FUNCTION (EXPOSED)
============================================================ */

window.deletePacEntry = async function (pacDocId) {

  const reason = prompt(
    "DELETE PAC ENTRY\n\nReason (mandatory):"
  );

  if (!reason || !reason.trim()) {
    alert("Delete reason is mandatory");
    return;
  }

  if (!confirm(
    "This PAC will be ARCHIVED (not permanently deleted).\n\nContinue?"
  )) {
    return;
  }

  try {

    const ref = doc(db, "pac_entries", pacDocId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("PAC entry not found");
      return;
    }

    const pacData = snap.data();
    const now = getNowMeta();
    const deleteViewId = await generateDeleteViewId();

    /* ---------------- ARCHIVE DATA ---------------- */
    const archivedPac = {
      ...pacData,

      deleteViewId,

      deletedAt: now.ts,
      deletedDate: now.date,
      deletedTime: now.time,

      deletedBy: "admin",
      deletedFromIp: getUserIpSafe(),

      deletedDeviceId: getDeviceId(),
      deletedDeviceInfo: getDeviceInfo(),

      deleteReason: reason.trim(),
      deleteCount: (pacData.deleteCount || 0) + 1,

      originalDocId: pacDocId
    };

    /* ---------------- MOVE → ARCHIVE ---------------- */
    await setDoc(
      doc(db, "deleted_pac_entries", pacDocId),
      archivedPac
    );

    /* ---------------- REMOVE LIVE DOC ---------------- */
    await deleteDoc(ref);

    /* ---------------- AUDIT LOG ---------------- */
    await logAdminAction({
      action: "PAC_DELETE",
      module: "PAC",
      targetId: pacData.pacNo || pacDocId,
      description: "PAC archived from mismatch alert",
      severity: "CRITICAL",
      meta: {
        deleteViewId,
        ip: archivedPac.deletedFromIp
      }
    });

    alert("PAC entry archived successfully");

  } catch (err) {
    console.error("PAC delete failed:", err);
    alert("Delete failed — check console");
  }
};
