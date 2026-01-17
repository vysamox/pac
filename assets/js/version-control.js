/* ============================================================
   VERSION CONTROL SYSTEM — ENTERPRISE++ EDITION
   ES Module | Atomic | Audited | Restore-Safe | PERF-OPTIMIZED
============================================================ */

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
  orderBy,
  runTransaction,
  serverTimestamp
} from "./firebase-config.js";


/* ============================================================
   GITHUB LIVE COMMIT LINK
============================================================ */

const GITHUB_OWNER  = "vysamox";
const GITHUB_REPO   = "pac";
const GITHUB_BRANCH = "main"; // or master

let _cachedCommit = null;

async function getLatestGitCommit() {
  if (_cachedCommit) return _cachedCommit;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${window.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json"
        }
      }
    );

    const data = await res.json();

    _cachedCommit = {
      hash: data.sha.substring(0, 7),
      fullHash: data.sha,
      message: data.commit.message,
      author: data.commit.author.name,
      date: data.commit.author.date,
      url: data.html_url
    };

  } catch (e) {
    _cachedCommit = { hash: "unknown", message: "GitHub unavailable" };
  }

  return _cachedCommit;
}


/* ============================================================
   CONFIG
============================================================ */
const versionRef = doc(db, "system", "version");

const ENABLE_SOFT_DELETE = true;
const CURRENT_ROLE = "admin";
const ENV = "PROD";

/* ============================================================
   SAFE NOTIFY
============================================================ */
const notify = (msg, type = "info", timeout = 4000) => {
  if (typeof window.notify === "function") {
    window.notify(msg, type, timeout);
  } else {
    console.log(`[${type.toUpperCase()}]`, msg);
    alert(msg);
  }
};

/* ============================================================
   UTILITIES
============================================================ */
const nextVersion = (v = "1.0.0") => {
  const [a = 1, b = 0, c = 0] = v.split(".").map(n => +n || 0);
  return `${a}.${b}.${c + 1}`;
};

const versionKey = v => `${v.version}__${v.buildNumber}`;
const historyId = (v, b) => `v${v}__build_${b}__${Date.now()}`;

const canRestore = () => ["admin", "superadmin"].includes(CURRENT_ROLE);
const canDelete  = () => ["admin", "superadmin"].includes(CURRENT_ROLE);

/* ============================================================
   CLIENT IP (CACHED)
============================================================ */
let _cachedIP = null;
async function getClientIP() {
  if (_cachedIP) return _cachedIP;
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const j = await r.json();
    _cachedIP = j.ip || "unknown";
  } catch {
    _cachedIP = "unknown";
  }
  return _cachedIP;
}

/* ============================================================
   AUDIT LOGGER (IMMUTABLE)
============================================================ */
async function audit(action, payload = {}) {
  await setDoc(
    doc(db, "system_version_audit", `${action}__${Date.now()}`),
    {
      action,
      role: CURRENT_ROLE,
      env: ENV,
      at: serverTimestamp(),
      ip: await getClientIP(),
      ...payload
    }
  );
}

/* ============================================================
   ENSURE VERSION DOCUMENT
============================================================ */
async function ensureVersionDoc() {
  const snap = await getDoc(versionRef);
  if (!snap.exists()) {
    await setDoc(versionRef, {
      version: "1.0.0",
      buildNumber: 1,
      buildTime: Date.now(),
      env: ENV,
      createdAt: serverTimestamp()
    });
  }
}

/* ============================================================
   ATOMIC VERSION UPDATE
============================================================ */
export async function autoUpdateVersion(changelog = []) {
  await ensureVersionDoc();

  await runTransaction(db, async tx => {
    const liveSnap = await tx.get(versionRef);
    if (!liveSnap.exists()) throw new Error("Version doc missing");

    const live = liveSnap.data();
    const ip = await getClientIP();
    const git = await getLatestGitCommit();

    

    tx.set(
  doc(db, "system_version_history", historyId(live.version, live.buildNumber)),
  {
    version: live.version,
    buildNumber: live.buildNumber,
    buildTime: live.buildTime,
    env: live.env,
    action: "UPDATE",
    changelog,

    git, // 🧬 GitHub commit snapshot

    savedAt: Date.now(),
    savedBy: CURRENT_ROLE,
    ip,
    deleted: false,
    lockRestore: false
  }
);


    tx.update(versionRef, {
      version: nextVersion(live.version),
      buildNumber: live.buildNumber + 1,
      buildTime: Date.now(),
      lastUpdate: {
        by: CURRENT_ROLE,
        at: Date.now(),
        ip
      }
    });
  });

  await audit("UPDATE");
  notify("Version updated atomically", "success");
}

/* ============================================================
   LIVE VERSION CARD
============================================================ */
let versionUnsub = null;

export function bindVersionCard() {
  if (versionUnsub) versionUnsub();

  versionUnsub = onSnapshot(versionRef, snap => {
    if (!snap.exists()) return;
    const v = snap.data();

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set("currentVersion", `v${v.version}`);
    set("nextVersion", `v${nextVersion(v.version)}`);
    set("currentBuild", `#${v.buildNumber}`);
    set("currentDate", new Date(v.buildTime).toLocaleString("en-GB"));
  });
}

/* ============================================================
   VERSION VIEW
============================================================ */
export async function openVersionView() {
  const modal = document.getElementById("versionViewModal");
  if (!modal) return;

  const snap = await getDoc(versionRef);
  if (!snap.exists()) return;

  const v = snap.data();
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set("viewCurrentVersion", `v${v.version}`);
  set("viewBuildNumber", `#${v.buildNumber}`);
  set("viewBuildDate", new Date(v.buildTime).toLocaleString("en-GB"));
  set("viewNextVersion", `v${nextVersion(v.version)}`);
  set("viewNextBuild", `#${v.buildNumber + 1}`);

  modal.style.display = "flex";
}

export function closeVersionView() {
  const modal = document.getElementById("versionViewModal");
  if (modal) modal.style.display = "none";
}

/* ============================================================
   VERSION HISTORY (SINGLE SNAPSHOT)
============================================================ */
let historyUnsub = null;

export async function openVersionHistory() {
  const modal = document.getElementById("versionHistoryModal");
  const body  = document.getElementById("versionHistoryBody");
  if (!modal || !body) return;

  modal.style.display = "flex";
  body.innerHTML = `<tr><td colspan="6">Loading…</td></tr>`;

  if (historyUnsub) historyUnsub();

  const liveSnap = await getDoc(versionRef);
  const live = liveSnap.data();

  historyUnsub = onSnapshot(
    query(collection(db, "system_version_history"), orderBy("savedAt", "desc")),
    snap => {
      const frag = document.createDocumentFragment();
      body.innerHTML = "";

      snap.forEach(s => {
        const d = s.data();
        if (ENABLE_SOFT_DELETE && d.deleted) return;

        const isLive =
          d.version === live.version &&
          d.buildNumber === live.buildNumber;

        const tr = document.createElement("tr");
        tr.innerHTML = `
<td data-label="Date">${new Date(d.savedAt).toLocaleString("en-GB")}</td>
<td data-label="Version">v${d.version}</td>
<td data-label="Build">#${d.buildNumber}</td>
<td data-label="Environment">${d.env || "—"}</td>
<td data-label="IP Address" class="mono">${d.ip || "unknown"}</td>
<td data-label="Actions">
  <div class="vh-actions">
    <button class="vh-btn restore"
      ${!canRestore() || isLive || d.lockRestore ? "disabled" : ""}
      onclick="restoreVersion('${s.id}')">
      <i class="fa-solid fa-rotate-left"></i>
    </button>

    <button class="vh-btn delete"
      ${!canDelete() || isLive ? "disabled" : ""}
      onclick="deleteVersionHistory('${s.id}','v${d.version}')">
      <i class="fa-solid fa-trash"></i>
    </button>

    ${isLive ? `<span class="vh-badge live">LIVE</span>` : ""}
  </div>
</td>`;
        frag.appendChild(tr);
      });

      body.appendChild(frag);
    }
  );
}

export function closeVersionHistory() {
  const modal = document.getElementById("versionHistoryModal");
  if (modal) modal.style.display = "none";
  if (historyUnsub) historyUnsub();
}

/* ============================================================
   GLOBAL ACTIONS
============================================================ */
window.restoreVersion = async id => {
  if (!canRestore()) return notify("Permission denied", "error");

  await runTransaction(db, async tx => {
    const histRef = doc(db, "system_version_history", id);
    const histSnap = await tx.get(histRef);
    if (!histSnap.exists()) throw new Error("History not found");

    const target = histSnap.data();
    const liveSnap = await tx.get(versionRef);
    const live = liveSnap.data();

tx.set(
  doc(db, "system_version_history", historyId(live.version, live.buildNumber)),
  {
    version: live.version,
    buildNumber: live.buildNumber,
    buildTime: live.buildTime,
    env: live.env,
    action: "UPDATE",
    changelog,

    git, // 🧬 GitHub commit snapshot

    savedAt: Date.now(),
    savedBy: CURRENT_ROLE,
    ip,
    deleted: false,
    lockRestore: false
  }
);


    tx.update(versionRef, {
      version: target.version,
      buildNumber: target.buildNumber,
      buildTime: Date.now(),
      restoredFrom: id
    });
  });

  await audit("RESTORE", { id });
  notify("Version restored safely", "success");
};

window.deleteVersionHistory = async (id, label) => {
  if (!canDelete()) return notify("Permission denied", "error");

  const typed = prompt(`Type "${label}" to confirm delete`);
  if (typed !== label) return notify("Cancelled", "warn");

  const ref = doc(db, "system_version_history", id);

  if (ENABLE_SOFT_DELETE) {
    await updateDoc(ref, {
      deleted: true,
      deletedAt: Date.now(),
      deletedBy: CURRENT_ROLE
    });
    await audit("SOFT_DELETE", { id });
  } else {
    await deleteDoc(ref);
    await audit("HARD_DELETE", { id });
  }

  notify("History entry deleted", "success");
};
