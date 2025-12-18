import {
  db,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  orderBy
} from "./firebase-config.js";

/* ==================================================
   REFS
================================================== */
const versionRef = doc(db, "system", "version");

/* ==================================================
   UTIL: NEXT VERSION
================================================== */
function nextVersion(version) {
  const [a = 1, b = 0, c = 0] = String(version || "1.0.0")
    .split(".")
    .map(n => parseInt(n, 10));

  return `${a}.${b}.${c + 1}`;
}

/* ==================================================
   UTIL: DATETIME DOCUMENT ID
   FORMAT: dd-mm-yyyy_hh-mm-ss-ms
================================================== */
function getHistoryDocId() {
  const now = new Date();

  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();

  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");

  return `${dd}-${mm}-${yyyy}_${hh}-${min}-${ss}-${ms}`;
}

/* ==================================================
   UTIL: FETCH CLIENT IP (SAFE)
================================================== */
async function getClientIP() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return data.ip || "unknown";
  } catch {
    return "unknown";
  }
}

/* ==================================================
   ENSURE VERSION EXISTS (AUTO INIT)
================================================== */
async function ensureVersionDoc() {
  const snap = await getDoc(versionRef);

  if (!snap.exists()) {
    await setDoc(versionRef, {
      version: "1.0.0",
      buildNumber: 1,
      buildTime: Date.now(),
      env: "PROD",
      meta: {
        createdAt: Date.now()
      }
    });
  }
}

/* ==================================================
   UPDATE VERSION + SAVE PREVIOUS VERSION (HISTORY)
================================================== */
export async function autoUpdateVersion(changelog = []) {
  await ensureVersionDoc();

  const snap = await getDoc(versionRef);
  if (!snap.exists()) return;

  const d = snap.data();

  const currentVersion = d.version || "1.0.0";
  const currentBuild = Number(d.buildNumber) || 1;
  const env = d.env || "PROD";

  const clientIP = await getClientIP();

  const meta = {
    ip: clientIP,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };

  /* ------------------------------------
     SAVE PREVIOUS VERSION (IMMUTABLE)
  ------------------------------------ */
  const historyId = getHistoryDocId();

  await setDoc(
    doc(db, "system_version_history", historyId),
    {
      version: currentVersion,
      buildNumber: currentBuild,
      buildTime: d.buildTime || Date.now(),
      env,
      changelog,
      meta,
      action: "UPDATE",
      savedAt: Date.now(),
      savedBy: "admin" // 🔐 replace with auth later
    }
  );

  /* ------------------------------------
     UPDATE LIVE VERSION
  ------------------------------------ */
  const newVersion = nextVersion(currentVersion);

  await setDoc(
    versionRef,
    {
      version: newVersion,
      buildNumber: currentBuild + 1,
      buildTime: Date.now(),
      env,
      lastUpdate: {
        ip: clientIP,
        at: Date.now(),
        by: "admin"
      }
    },
    { merge: true }
  );

  alert(`Dashboard updated to v${newVersion}`);
}

/* ==================================================
   BIND VERSION CARD (SINGLE LIVE LISTENER)
================================================== */
let versionUnsub = null;

export function bindVersionCard() {
  const cur = document.getElementById("currentVersion");
  const next = document.getElementById("nextVersion");
  const build = document.getElementById("currentBuild");
  const dateEl = document.getElementById("currentDate");

  if (!cur || !next) return;

  if (versionUnsub) versionUnsub();

  versionUnsub = onSnapshot(versionRef, snap => {
    if (!snap.exists()) return;

    const v = snap.data();

    cur.textContent = `v${v.version || "—"}`;
    next.textContent = `v${nextVersion(v.version)}`;

    if (build) build.textContent = `#${v.buildNumber || "—"}`;

    if (dateEl) {
      dateEl.textContent = v.buildTime
        ? new Date(v.buildTime).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          })
        : "—";
    }
  });
}

/* ==================================================
   VIEW VERSION MODAL (ONE-TIME READ)
================================================== */
export async function openVersionView() {
  const modal = document.getElementById("versionViewModal");
  if (!modal) return;

  await ensureVersionDoc();

  const snap = await getDoc(versionRef);
  if (!snap.exists()) return;

  const v = snap.data();

  const date = v.buildTime
    ? new Date(v.buildTime).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      })
    : "—";

  document.getElementById("viewCurrentVersion").textContent = `v${v.version}`;
  document.getElementById("viewBuildNumber").textContent = `#${v.buildNumber}`;
  document.getElementById("viewBuildDate").textContent = date;
  document.getElementById("viewNextVersion").textContent = `v${nextVersion(v.version)}`;
  document.getElementById("viewNextBuild").textContent = `#${v.buildNumber + 1}`;

  modal.style.display = "flex";
}

/* ==================================================
   CLOSE MODAL
================================================== */
export function closeVersionView() {
  const modal = document.getElementById("versionViewModal");
  if (modal) modal.style.display = "none";
}

/* ==================================================
   OPEN VERSION HISTORY
================================================== */
window.openVersionHistory = function () {
  const modal = document.getElementById("versionHistoryModal");
  const body = document.getElementById("versionHistoryBody");

  if (!modal || !body) return;

  modal.style.display = "flex";
  body.innerHTML = "<tr><td colspan='6'>Loading…</td></tr>";

  const q = query(
    collection(db, "system_version_history"),
    orderBy("savedAt", "desc")
  );

  onSnapshot(q, snap => {
    body.innerHTML = "";

    if (snap.empty) {
      body.innerHTML = "<tr><td colspan='6'>No history found</td></tr>";
      return;
    }

    snap.forEach(doc => {
      const d = doc.data();

      const date = d.savedAt
        ? new Date(d.savedAt).toLocaleString("en-GB")
        : "—";

      body.innerHTML += `
        <tr>
          <td>${date}</td>
          <td>v${d.version}</td>
          <td>#${d.buildNumber}</td>
          <td>${d.env || "—"}</td>
          <td>${d.meta?.ip || d.ip || "—"}</td>
          <td>
            <span style="color:#00eaff; font-weight:600;">
              ${d.action || "UPDATE"}
            </span>
          </td>
        </tr>
      `;
    });
  });
};

/* ==================================================
   CLOSE VERSION HISTORY
================================================== */
window.closeVersionHistory = function () {
  document.getElementById("versionHistoryModal").style.display = "none";
};