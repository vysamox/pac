/* =========================================================
   ADVANCED DELETE MANAGER — PAC SYSTEM
   Author: Samrat
   ========================================================= */

let deleteLock = false;

/* ---------- DEVICE ID ---------- */
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = "DEVICE-" + Math.random().toString(16).slice(2, 10).toUpperCase();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

/* ---------- DEVICE INFO ---------- */
function getDeviceInfo() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android Phone";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Mac/i.test(ua)) return "Mac OS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown Device";
}

/* ---------- DELETE ID GENERATOR ---------- */
async function generateDeleteViewId(db) {
  const ref = db.collection("system_counters").doc("delete_counter");
  const snap = await ref.get();
  const next = snap.exists ? snap.data().count + 1 : 1;
  await ref.set({ count: next });
  return "DEL-" + String(next).padStart(5, "0");
}

/* =========================================================
   MAIN DELETE FUNCTION (SINGLE SOURCE OF TRUTH)
   ========================================================= */
async function deletePACAdvanced({
  db,
  docId,
  pacCode,
  showToast
}) {

  if (deleteLock) {
    showToast("⏳ Delete in progress…", "#ff9800");
    return;
  }

  if (!confirm(`Delete PAC ${pacCode} permanently?`)) return;

  deleteLock = true;
  setTimeout(() => deleteLock = false, 1500);

  try {
    // 🔹 Read before delete
    const snap = await db.collection("pac_entries").doc(docId).get();
    if (!snap.exists) {
      showToast("PAC not found", "#dc3545");
      return;
    }

    const pacData = snap.data();

    // 🔹 Generate audit ID
    const deleteViewId = await generateDeleteViewId(db);

    // 🔥 FAST DELETE (UI first)
    await db.collection("pac_entries").doc(docId).delete();
    showToast(`🗑️ Deleted (${deleteViewId})`, "#dc3545");

    // 🔹 Background audit logging
    setTimeout(async () => {
      let deleteIP = "UNKNOWN";
      try {
        deleteIP = await fetch("https://api.ipify.org?format=json")
          .then(r => r.json())
          .then(d => d.ip);
      } catch (_) {}

      const now = new Date();

      await db.collection("delete_pac").doc(docId).set({
        pacCode,
        firestoreId: docId,

        ...pacData,

        deleteViewId,
        deleteType: "single",
        deleteIP,
        deleteDevice: getDeviceInfo(),
        deleteDeviceId: getDeviceId(),
        deletedByUA: navigator.userAgent,
        deletedAt: now.toLocaleString("en-IN"),
        deletedAtTimestamp: now.getTime()
      }, { merge: true });

    }, 50);

  } catch (err) {
    console.error("Delete failed:", err);
    showToast("❌ Delete failed", "#dc3545");
  }
}

/* ---------- EXPORT (GLOBAL) ---------- */
window.deletePACAdvanced = deletePACAdvanced;
