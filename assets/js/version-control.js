import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  orderBy
} from "./firebase-config.js";

/* ==================================================
   CONSTANTS / REFS
================================================== */
const versionRef = doc(db, "system", "version");

/* ==================================================
   FUTURE FLAGS
================================================== */
const ENABLE_SOFT_DELETE = true;   // set false for hard delete
const CURRENT_ROLE = "admin";      // future auth hook

/* ==================================================
   UTILITIES
================================================== */
function nextVersion(version) {
  const [a = 1, b = 0, c = 0] = String(version || "1.0.0")
    .split(".")
    .map(n => parseInt(n, 10));
  return `${a}.${b}.${c + 1}`;
}

function versionKey(v = {}) {
  return `${v.version || "x"}__${v.buildNumber || "x"}`;
}

function getHistoryDocId(version, buildNumber) {
  return `v${version}__build_${buildNumber}__${Date.now()}`;
}

/* ==================================================
   CLIENT IP
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
   ROLE CHECKS
================================================== */
function canRestore(role = CURRENT_ROLE) {
  return ["admin", "superadmin"].includes(role);
}

function canDelete(role = CURRENT_ROLE) {
  return ["admin", "superadmin"].includes(role);
}

/* ==================================================
   ENSURE LIVE VERSION DOC
================================================== */
async function ensureVersionDoc() {
  const snap = await getDoc(versionRef);
  if (!snap.exists()) {
    await setDoc(versionRef, {
      version: "1.0.0",
      buildNumber: 1,
      buildTime: Date.now(),
      env: "PROD",
      createdAt: Date.now()
    });
  }
}

/* ==================================================
   AUTO UPDATE VERSION (IMMUTABLE)
================================================== */
export async function autoUpdateVersion(changelog = []) {
  await ensureVersionDoc();

  const snap = await getDoc(versionRef);
  if (!snap.exists()) return;

  const d = snap.data();
  const clientIP = await getClientIP();

  const historyId = getHistoryDocId(d.version, d.buildNumber);

  await setDoc(
    doc(db, "system_version_history", historyId),
    {
      version: d.version,
      buildNumber: d.buildNumber,
      buildTime: d.buildTime,
      env: d.env,

      action: "UPDATE",
      ip: clientIP,
      changelog,

      savedAt: Date.now(),
      savedBy: CURRENT_ROLE,

      pinned: false,
      lockRestore: false,
      deleted: false,

      audit: {
        checksum: null,
        verified: false
      }
    }
  );

  await updateDoc(versionRef, {
    version: nextVersion(d.version),
    buildNumber: d.buildNumber + 1,
    buildTime: Date.now(),
    lastUpdate: {
      by: CURRENT_ROLE,
      at: Date.now(),
      ip: clientIP
    }
  });

  alert("Version updated successfully");
}

/* ==================================================
   VERSION CARD (LIVE)
================================================== */
let versionUnsub = null;

export function bindVersionCard() {
  const cur = document.getElementById("currentVersion");
  const next = document.getElementById("nextVersion");
  const build = document.getElementById("currentBuild");
  const date = document.getElementById("currentDate");

  if (!cur || !next) return;
  if (versionUnsub) versionUnsub();

  versionUnsub = onSnapshot(versionRef, snap => {
    if (!snap.exists()) return;
    const v = snap.data();

    cur.textContent = `v${v.version}`;
    next.textContent = `v${nextVersion(v.version)}`;
    if (build) build.textContent = `#${v.buildNumber}`;
    if (date) date.textContent = new Date(v.buildTime).toLocaleString("en-GB");
  });
}

/* ==================================================
   VERSION VIEW MODAL
================================================== */
export async function openVersionView() {
  const modal = document.getElementById("versionViewModal");
  if (!modal) return;

  const snap = await getDoc(versionRef);
  if (!snap.exists()) return;

  const v = snap.data();

  document.getElementById("viewCurrentVersion").textContent = `v${v.version}`;
  document.getElementById("viewBuildNumber").textContent = `#${v.buildNumber}`;
  document.getElementById("viewBuildDate").textContent =
    new Date(v.buildTime).toLocaleString("en-GB");
  document.getElementById("viewNextVersion").textContent =
    `v${nextVersion(v.version)}`;
  document.getElementById("viewNextBuild").textContent =
    `#${v.buildNumber + 1}`;

  modal.style.display = "flex";
}

export function closeVersionView() {
  const modal = document.getElementById("versionViewModal");
  if (modal) modal.style.display = "none";
}

/* ==================================================
   VERSION HISTORY (LIVE)
================================================== */
let historyUnsub = null;

export async function openVersionHistory() {
  const modal = document.getElementById("versionHistoryModal");
  const body = document.getElementById("versionHistoryBody");
  if (!modal || !body) return;

  modal.style.display = "flex";
  body.innerHTML = "<tr><td colspan='6'>Loading…</td></tr>";

  if (historyUnsub) historyUnsub();

  const liveSnap = await getDoc(versionRef);
  if (!liveSnap.exists()) return;
  const live = liveSnap.data();

  const q = query(
    collection(db, "system_version_history"),
    orderBy("savedAt", "desc")
  );

  historyUnsub = onSnapshot(q, snap => {
    body.innerHTML = "";
    if (snap.empty) {
      body.innerHTML = "<tr><td colspan='6'>No history found</td></tr>";
      return;
    }

    const counts = {};
    snap.forEach(s => {
      const d = s.data();
      if (ENABLE_SOFT_DELETE && d.deleted) return;
      const k = versionKey(d);
      counts[k] = (counts[k] || 0) + 1;
    });

    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (ENABLE_SOFT_DELETE && d.deleted) return;

      const isDup = counts[versionKey(d)] > 1;
      const isLive =
        d.version === live.version &&
        d.buildNumber === live.buildNumber;

      body.innerHTML += `
        <tr>
          <td>${new Date(d.savedAt).toLocaleString("en-GB")}</td>
          <td>v${d.version}</td>
          <td>#${d.buildNumber}</td>
          <td>${d.env || "—"}</td>
          <td class="mono">${d.ip || "unknown"}</td>
          <td>
            <div class="vh-actions">

              <button class="vh-btn view"
                onclick="viewVersion('${d.version}','${d.buildNumber}')">
                <i class="fa-solid fa-eye"></i>
              </button>

              <button class="vh-btn restore"
                ${!canRestore() || isLive || d.lockRestore ? "disabled" : ""}
                onclick="restoreVersion('${docSnap.id}')">
                <i class="fa-solid fa-rotate-left"></i>
              </button>

              <button class="vh-btn delete"
                ${!canDelete() || isLive ? "disabled" : ""}
                onclick="deleteVersionHistory('${docSnap.id}')">
                <i class="fa-solid fa-trash"></i>
              </button>

              ${
                isLive
                  ? `<span class="vh-badge live">LIVE</span>`
                  : isDup
                  ? `<span class="vh-badge dup">DUP</span>`
                  : `<span class="vh-badge ok">OK</span>`
              }

            </div>
          </td>
        </tr>
      `;
    });
  });
}

export function closeVersionHistory() {
  const modal = document.getElementById("versionHistoryModal");
  if (modal) modal.style.display = "none";

  if (historyUnsub) {
    historyUnsub();
    historyUnsub = null;
  }
}

/* ==================================================
   GLOBAL ACTIONS
================================================== */
window.viewVersion = (v, b) =>
  alert(`Version v${v}\nBuild #${b}`);

window.restoreVersion = async id => {
  if (!canRestore()) return;

  const snap = await getDoc(doc(db, "system_version_history", id));
  if (!snap.exists()) return;

  const d = snap.data();
  if (d.lockRestore) return;

  await setDoc(
    doc(db, "system_version_history", `restore__${Date.now()}`),
    {
      ...d,
      action: "RESTORE",
      restoredFrom: id,
      restoredAt: Date.now(),
      restoredBy: CURRENT_ROLE
    }
  );

  await updateDoc(versionRef, {
    version: d.version,
    buildNumber: d.buildNumber,
    buildTime: Date.now(),
    restoredFrom: id
  });

  alert("Version restored successfully");
};

window.deleteVersionHistory = async id => {
  try {
    const ref = doc(db, "system_version_history", id);

    if (ENABLE_SOFT_DELETE) {
      await updateDoc(ref, {
        deleted: true,
        deletedAt: Date.now(),
        deletedBy: CURRENT_ROLE
      });
    } else {
      await deleteDoc(ref);
    }

    alert("Deleted successfully");
  } catch (err) {
    console.error("Delete failed", err);
  }
};
