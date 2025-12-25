/* ============================================================
   DUPLICATE DELETE ID REGISTRY
   Governance + Intelligence Engine (FINAL)
   Scope: delete_pac
============================================================ */

import {
  db,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  getDoc,
  setDoc
} from "./firebase-config.js";

/* ============================================================
   SYSTEM CONFIG (SAFE DEFAULTS)
============================================================ */
const SYS = {
  PREFIX: "DEL-",
  PAD: 5,

  ADMIN: "admin",          // replace with auth.uid later
  ENV: "PROD",

  DRY_RUN: false,          // preview-only
  AUTO_FIX: false,         // future toggle
  QUARANTINE_RATIO: 0.15,  // 15% corruption
  LOCK_TTL: 60_000,        // ms

  POLICY_VERSION: "2025.1",
  JURISDICTION: "IN"
};

/* ============================================================
   INTERNAL STATE (AUTHORITATIVE)
============================================================ */
let RECORDS = [];
let USED_IDS = new Set();
let FIX_QUEUE = new Map();          // pacNo → job
let SNAPSHOT_CACHE = new Map();     // pacNo → original
let MAX_ID_NUM = 0;
let SYSTEM_QUARANTINED = false;

/* ============================================================
   UTIL: SAFE ID GENERATOR (O(1))
============================================================ */
function generateNextId() {
  MAX_ID_NUM++;
  const id =
    SYS.PREFIX + String(MAX_ID_NUM).padStart(SYS.PAD, "0");
  USED_IDS.add(id);
  return id;
}

/* ============================================================
   UTIL: DATE FORMAT
============================================================ */
function fmt(r) {
  if (r.deletedAtTimestamp)
    return new Date(r.deletedAtTimestamp).toLocaleString();
  return r.deleteTime || r.deletedValue || "—";
}

/* ============================================================
   HEALTH SCORE
============================================================ */
function computeHealth(total, dup) {
  if (!total) return 100;
  const r = dup / total;
  if (r === 0) return 100;
  if (r < 0.02) return 90;
  if (r < 0.05) return 75;
  if (r < 0.1) return 55;
  return 30;
}

/* ============================================================
   INTEGRITY ENGINE (PASSIVE)
============================================================ */
function integrityCheck(records) {
  const issues = [];

  records.forEach(r => {
    if (!r.deleteViewId)
      issues.push({ type: "MISSING_ID", pacNo: r.pacNo });

    else if (!/^DEL-\d{5}$/.test(r.deleteViewId))
      issues.push({
        type: "INVALID_FORMAT",
        pacNo: r.pacNo,
        value: r.deleteViewId
      });
  });

  if (issues.length)
    console.warn("🧩 Integrity issues:", issues);

  return issues;
}

/* ============================================================
   SOFT LOCK (MULTI-ADMIN SAFE)
============================================================ */
async function acquireLock() {
  const ref = doc(db, "system_locks", "delete_fix");
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const d = snap.data();
    if (Date.now() - d.lockedAt < SYS.LOCK_TTL)
      throw new Error("System busy (another admin)");
  }

  await setDoc(ref, {
    lockedAt: Date.now(),
    lockedBy: SYS.ADMIN
  });
}

async function releaseLock() {
  await updateDoc(doc(db, "system_locks", "delete_fix"), {
    releasedAt: Date.now()
  });
}

/* ============================================================
   MAIN SNAPSHOT (SINGLE SOURCE)
============================================================ */
onSnapshot(collection(db, "delete_pac"), snap => {

  RECORDS = [];
  USED_IDS.clear();
  FIX_QUEUE.clear();
  SNAPSHOT_CACHE.clear();
  MAX_ID_NUM = 0;
  SYSTEM_QUARANTINED = false;

  const dupMap = {};
  let lastDeleted = null;

  snap.forEach(d => {
    const r = { id: d.id, ...d.data() };
    RECORDS.push(r);
    SNAPSHOT_CACHE.set(r.pacNo, { ...r });

    if (r.deleteViewId) {
      USED_IDS.add(r.deleteViewId);
      dupMap[r.deleteViewId] =
        (dupMap[r.deleteViewId] || 0) + 1;

      const n = parseInt(
        r.deleteViewId.replace(SYS.PREFIX, ""), 10
      );
      if (!isNaN(n)) MAX_ID_NUM = Math.max(MAX_ID_NUM, n);
    }

    if (
      r.deletedAtTimestamp &&
      (!lastDeleted ||
        r.deletedAtTimestamp > lastDeleted.deletedAtTimestamp)
    ) lastDeleted = r;
  });

  /* COUNTERS */
  const total = RECORDS.length;
  const dupCount =
    Object.values(dupMap).filter(v => v > 1).length;

  document.getElementById("deletePacCount").textContent = total;
  document.getElementById("duplicateDeleteIdCount").textContent = dupCount;

  /* LAST DELETED */
  const lastEl = document.getElementById("lastDeletedPac");
  if (lastEl) lastEl.textContent = lastDeleted?.deleteViewId || "—";

  /* HEALTH + QUARANTINE */
  const health = computeHealth(total, dupCount);
  console.log("🧠 Delete Health:", health + "%");

  if (dupCount / (total || 1) > SYS.QUARANTINE_RATIO) {
    SYSTEM_QUARANTINED = true;
    console.error("🚨 DELETE SYSTEM QUARANTINED");
  }

  /* INTEGRITY */
  integrityCheck(RECORDS);

  /* TABLE */
  const table = document.getElementById("duplicateTable");
  const container = document.querySelector(".table-container");
  table.innerHTML = "";

  const duplicates =
    Object.entries(dupMap).filter(([, c]) => c > 1);

  if (!duplicates.length) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";

  duplicates.forEach(([delId, count]) => {

    table.innerHTML += `
     <tr class="dup-header-row">
  <td data-label="Duplicate ID" colspan="10">
    <div class="dup-header">
      <div class="dup-title">
        Duplicate Delete ID:
        <span class="dup-id">${delId}</span>
        <span class="dup-count">(${count})</span>
      </div>

      <button
        class="dup-fix-btn"
        onclick="bulkFix('${delId}')">
        Fix All
      </button>
    </div>
  </td>
</tr>

    `;

    let keep = true;

    RECORDS
      .filter(r => r.deleteViewId === delId)
      .forEach(r => {

        const newId =
          keep ? r.deleteViewId : generateNextId();
        keep = false;

        FIX_QUEUE.set(r.pacNo, {
          pacNo: r.pacNo,
          docId: r.id,
          oldId: r.deleteViewId,
          newId
        });

        table.innerHTML += `
          <tr>
            <td data-label="Delete ID">${r.deleteViewId}</td>
            <td data-label="CSC Ref">${r.cscRef || "-"}</td>
            <td data-label="PAC No">${r.pacNo}</td>
            <td data-label="Amount">${r.amount}</td>
            <td data-label="Date">${r.entryDate || "-"}</td>
            <td data-label="Time">${r.entryTime || "-"}</td>
            <td data-label="Deleted">${fmt(r)}</td>
            <td data-label="IP">${r.deleteIP || "-"}</td>
            <td>
              <input id="fix_${r.pacNo}" value="${newId}"
                readonly
                style="width:130px;padding:6px;
                font-weight:700;background:#d4ffcf;
                border:none;border-radius:6px">
            </td>
            <td>
              <button onclick="fixOne('${r.pacNo}')"
                style="padding:6px 14px;background:#00eaff;
                border:none;border-radius:6px;font-weight:700">
                Fix
              </button>
            </td>
          </tr>
        `;
      });
  });
});

/* ============================================================
   FIX SINGLE
============================================================ */
window.fixOne = async function (pacNo) {
  if (SYSTEM_QUARANTINED)
    return alert("System quarantined");

  const job = FIX_QUEUE.get(pacNo);
  if (!job) return alert("Job missing");

  if (SYS.DRY_RUN) {
    console.table(job);
    return alert("Dry-run only");
  }

  await acquireLock();

  try {
    await updateDoc(doc(db, "delete_pac", job.docId), {
      deleteViewId: job.newId,
      fixedAt: Date.now(),
      fixedBy: SYS.ADMIN,
      fixMode: "single",
      previousDeleteId: job.oldId,

      deleteIdMeta: {
        version: 1,
        previous: job.oldId
      },

      compliance: {
        reason: "duplicate-resolution",
        authority: SYS.ADMIN,
        policyVersion: SYS.POLICY_VERSION,
        jurisdiction: SYS.JURISDICTION
      }
    });
  } finally {
    await releaseLock();
  }
};

/* ============================================================
   BULK FIX
============================================================ */
window.bulkFix = async function (oldId) {
  if (SYSTEM_QUARANTINED)
    return alert("System quarantined");

  const jobs =
    [...FIX_QUEUE.values()].filter(j => j.oldId === oldId);

  if (!jobs.length) return;
  if (!confirm(`Fix ${jobs.length} records?`)) return;

  if (SYS.DRY_RUN) {
    console.table(jobs);
    return alert("Dry-run only");
  }

  await acquireLock();

  try {
    for (const j of jobs) {
      await updateDoc(doc(db, "delete_pac", j.docId), {
        deleteViewId: j.newId,
        fixedAt: Date.now(),
        fixedBy: SYS.ADMIN,
        fixMode: "bulk",
        previousDeleteId: j.oldId,

        deleteIdMeta: {
          version: 1,
          previous: j.oldId
        },

        compliance: {
          reason: "duplicate-resolution",
          authority: SYS.ADMIN,
          policyVersion: SYS.POLICY_VERSION,
          jurisdiction: SYS.JURISDICTION
        }
      });
    }
  } finally {
    await releaseLock();
  }

  alert("Bulk fix completed");
};

/* ============================================================
   ROLLBACK (READY)
============================================================ */
window.rollbackFix = async function (pacNo) {
  const snap = SNAPSHOT_CACHE.get(pacNo);
  if (!snap) return alert("No snapshot");

  await updateDoc(doc(db, "delete_pac", snap.id), {
    deleteViewId: snap.deleteViewId,
    rollbackAt: Date.now(),
    rollbackBy: SYS.ADMIN
  });

  alert("Rollback completed");
};

/* ============================================================
   FUTURE HOOKS (INTENTIONALLY EMPTY)
============================================================ */
/*
  🤖 selfHealDetector(record)
  🔮 reserveNextIds(count)
  📤 exportFixReportCSV()
  📊 timelineGraphUI()
  🔐 auth.uid replace SYS.ADMIN
*/