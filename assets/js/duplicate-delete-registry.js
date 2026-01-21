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
   INTERNAL STATE (AUTHORITATIVE) — FIXED
============================================================ */
let RECORDS = [];

// Tracks all existing deleteViewIds to prevent collisions
let USED_IDS = new Set();

// 🔑 docId → job (was pacNo → job ❌)
let FIX_QUEUE = new Map();

// 🔑 docId → full original snapshot (was pacNo ❌)
let SNAPSHOT_CACHE = new Map();

// Highest numeric part of DEL-xxxxx observed
let MAX_ID_NUM = 0;

// System safety flag
let SYSTEM_QUARANTINED = false;


/* ============================================================
   UTIL: SAFE ID GENERATOR (ADVANCED + GUARDED)
============================================================ */
function generateNextId() {

  // Safety: ensure MAX_ID_NUM is a valid number
  if (!Number.isInteger(MAX_ID_NUM) || MAX_ID_NUM < 0) {
    console.warn("⚠ MAX_ID_NUM invalid, resetting to 0");
    MAX_ID_NUM = 0;
  }

  let attempts = 0;
  let id;

  do {
    MAX_ID_NUM++;
    attempts++;

    // Overflow protection
    if (String(MAX_ID_NUM).length > SYS.PAD) {
      throw new Error(
        "ID overflow: increase PAD or rotate prefix"
      );
    }

    id = SYS.PREFIX + String(MAX_ID_NUM).padStart(SYS.PAD, "0");

    // Hard validation
    if (!id.startsWith(SYS.PREFIX)) {
      throw new Error("Invalid ID prefix generated");
    }

    // Fail-safe loop guard (should never happen)
    if (attempts > 1000) {
      throw new Error("ID generation loop detected");
    }

  } while (USED_IDS.has(id));

  USED_IDS.add(id);

  // Optional telemetry hook (future-ready)
  if (SYS.ENV !== "PROD") {
    console.debug("🆔 Generated ID:", id);
  }

  return id;
}

/* ============================================================
   UTIL: DATE FORMAT (SAFE + CONSISTENT)
============================================================ */
function fmt(r) {
  if (!r || typeof r !== "object") return "—";

  // 1️⃣ Highest priority: numeric timestamp
  if (Number.isFinite(r.deletedAtTimestamp)) {
    const d = new Date(r.deletedAtTimestamp);
    if (!isNaN(d)) return d.toLocaleString("en-IN");
  }

  // 2️⃣ Explicit deleteTime string
  if (typeof r.deleteTime === "string" && r.deleteTime.trim()) {
    return r.deleteTime;
  }

  // 3️⃣ Legacy fallback
  if (typeof r.deletedValue === "string" && r.deletedValue.trim()) {
    return r.deletedValue;
  }

  return "—";
}

/* ============================================================
   HEALTH SCORE (SANITIZED + STABLE)
============================================================ */
function computeHealth(total, dup) {

  // Sanitize inputs
  total = Number(total);
  dup = Number(dup);

  if (!Number.isFinite(total) || total <= 0) return 100;
  if (!Number.isFinite(dup) || dup < 0) dup = 0;
  if (dup > total) dup = total;

  const ratio = dup / total;

  if (ratio === 0) return 100;
  if (ratio < 0.02) return 90;
  if (ratio < 0.05) return 75;
  if (ratio < 0.1) return 55;

  // Gradual floor degradation (never below 20)
  const degraded = Math.round(100 - ratio * 100);
  return Math.max(20, degraded);
}

/* ============================================================
   INTEGRITY ENGINE (PASSIVE + CLASSIFIED)
============================================================ */
function integrityCheck(records) {
  const issues = [];
  const stats = {
    total: 0,
    missingId: 0,
    invalidFormat: 0,
    duplicates: 0
  };

  if (!Array.isArray(records)) {
    console.error("❌ Integrity check failed: records not array");
    return issues;
  }

  const seenIds = new Map();
  stats.total = records.length;

  records.forEach(r => {
    if (!r || typeof r !== "object") return;

    const pacNo = r.pacNo ?? "—";
    const id = r.deleteViewId;

    // 1️⃣ Missing ID (CRITICAL)
    if (!id) {
      stats.missingId++;
      issues.push({
        severity: "CRITICAL",
        type: "MISSING_ID",
        pacNo
      });
      return;
    }

    // 2️⃣ Invalid format (WARN)
    if (!/^DEL-\d{5}$/.test(id)) {
      stats.invalidFormat++;
      issues.push({
        severity: "WARN",
        type: "INVALID_FORMAT",
        pacNo,
        value: id
      });
    }

    // Track duplicates
    seenIds.set(id, (seenIds.get(id) || 0) + 1);
  });

  // 3️⃣ Duplicate IDs (CRITICAL)
  for (const [id, count] of seenIds.entries()) {
    if (count > 1) {
      stats.duplicates++;
      issues.push({
        severity: "CRITICAL",
        type: "DUPLICATE_ID",
        value: id,
        count
      });
    }
  }

  // Structured logging (readable + useful)
  if (issues.length) {
    console.group("🧩 Integrity Report");
    console.table(stats);
    console.table(issues);
    console.groupEnd();
  }

  // Attach stats for future use (non-breaking)
  issues.stats = stats;

  return issues;
}

/* ============================================================
   SOFT LOCK (MULTI-ADMIN SAFE + OWNERSHIP)
============================================================ */

let LOCK_ACQUIRED = false;
let LOCK_TOKEN = null;

async function acquireLock() {
  const ref = doc(db, "system_locks", "delete_fix");
  const now = Date.now();
  const token = `${SYS.ADMIN}_${now}`;

  const snap = await getDoc(ref);

  if (snap.exists()) {
    const d = snap.data();

    // Active lock by another admin
    if (
      d.lockedAt &&
      now - d.lockedAt < SYS.LOCK_TTL &&
      d.lockedBy !== SYS.ADMIN
    ) {
      throw new Error(
        `System busy (locked by ${d.lockedBy})`
      );
    }
  }

  // Acquire / refresh lock
  await setDoc(ref, {
    lockedAt: now,
    lockedBy: SYS.ADMIN,
    lockToken: token,
    env: SYS.ENV,
    policyVersion: SYS.POLICY_VERSION
  });

  LOCK_ACQUIRED = true;
  LOCK_TOKEN = token;
}

async function releaseLock() {
  if (!LOCK_ACQUIRED || !LOCK_TOKEN) return;

  const ref = doc(db, "system_locks", "delete_fix");
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const d = snap.data();

  // Only the owner can release
  if (d.lockToken !== LOCK_TOKEN) {
    console.warn("⚠ Lock ownership mismatch. Release denied.");
    return;
  }

  await updateDoc(ref, {
    releasedAt: Date.now(),
    releasedBy: SYS.ADMIN
  });

  LOCK_ACQUIRED = false;
  LOCK_TOKEN = null;
}


/* ============================================================
   MAIN SNAPSHOT (SINGLE SOURCE — FIXED & DETERMINISTIC)
============================================================ */
onSnapshot(collection(db, "delete_pac"), snap => {

  // ---------- RESET STATE ----------
  RECORDS = [];
  USED_IDS.clear();
  FIX_QUEUE.clear();
  SNAPSHOT_CACHE.clear();
  MAX_ID_NUM = 0;
  SYSTEM_QUARANTINED = false;

  const dupMap = Object.create(null);
  let lastDeleted = null;

  // ---------- FIRST PASS: COLLECT & ANALYZE ----------
  snap.forEach(d => {
    const r = { id: d.id, ...d.data() };

    RECORDS.push(r);

    // 🔑 docId is the only safe key
    SNAPSHOT_CACHE.set(r.id, structuredClone(r));

    if (r.deleteViewId) {
      USED_IDS.add(r.deleteViewId);

      dupMap[r.deleteViewId] =
        (dupMap[r.deleteViewId] || 0) + 1;

      const n = parseInt(
        r.deleteViewId.replace(SYS.PREFIX, ""),
        10
      );
      if (!isNaN(n)) MAX_ID_NUM = Math.max(MAX_ID_NUM, n);
    }

    if (
      Number.isFinite(r.deletedAtTimestamp) &&
      (!lastDeleted ||
        r.deletedAtTimestamp > lastDeleted.deletedAtTimestamp)
    ) {
      lastDeleted = r;
    }
  });

  // ---------- COUNTERS ----------
  const total = RECORDS.length;
  const dupCount = Object.values(dupMap).filter(c => c > 1).length;

  document.getElementById("deletePacCount").textContent = total;
  document.getElementById("duplicateDeleteIdCount").textContent = dupCount;

  const lastEl = document.getElementById("lastDeletedPac");
  if (lastEl) lastEl.textContent = lastDeleted?.deleteViewId || "—";

  // ---------- HEALTH & QUARANTINE ----------
  const health = computeHealth(total, dupCount);
  console.log("🧠 Delete Health:", health + "%");

  if (dupCount / Math.max(total, 1) > SYS.QUARANTINE_RATIO) {
    SYSTEM_QUARANTINED = true;
    console.error("🚨 DELETE SYSTEM QUARANTINED");
  }

  // ---------- GLOBAL FIX BUTTON ----------
  const fixBtn = document.getElementById("fixAllDuplicatesBtn");
  if (fixBtn) {
    const disabled = dupCount === 0 || SYSTEM_QUARANTINED;
    fixBtn.disabled = disabled;
    fixBtn.style.opacity = disabled ? "0.4" : "1";
    fixBtn.title = disabled
      ? "No duplicates or system quarantined"
      : "Fix all duplicate delete IDs";
  }

  // ---------- INTEGRITY ----------
  integrityCheck(RECORDS);

  // ---------- TABLE RENDER ----------
  const table = document.getElementById("duplicateTable");
  const container = document.querySelector(".table-container");
  table.innerHTML = "";

  const duplicates = Object.entries(dupMap).filter(([, c]) => c > 1);
  if (!duplicates.length) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";

  // ---------- SECOND PASS: BUILD FIX QUEUE (ONCE) ----------
  duplicates.forEach(([delId, count]) => {

    table.innerHTML += `
      <tr class="dup-header-row">
        <td colspan="10">
          Duplicate Delete ID:
          <strong>${delId}</strong> (${count})
        </td>
      </tr>
    `;

    let keep = true;

    RECORDS
      .filter(r => r.deleteViewId === delId)
      .forEach(r => {

        let newId = r.deleteViewId;

        if (!keep) {
          // Generate only once per docId
          if (!FIX_QUEUE.has(r.id)) {
            newId = generateNextId();

            FIX_QUEUE.set(r.id, {
              docId: r.id,
              pacNo: r.pacNo,
              oldId: r.deleteViewId,
              newId
            });
          } else {
            newId = FIX_QUEUE.get(r.id).newId;
          }
        }

        keep = false;

        table.innerHTML += `
          <tr>
            <td>${r.deleteViewId}</td>
            <td>${r.cscRef || "-"}</td>
            <td>${r.pacNo}</td>
            <td>${r.amount}</td>
            <td>${r.entryDate || "-"}</td>
            <td>${r.entryTime || "-"}</td>
            <td>${fmt(r)}</td>
            <td>${r.deleteIP || "-"}</td>
            <td>
              <input
                value="${newId}"
                readonly
                style="
                  width:100px;
                  padding:6px;
                  font-weight:700;
                  background:#d4ffcf;
                  border:none;
                  border-radius:6px
                "
              >
            </td>
          </tr>
        `;
      });
  });
});



/* ============================================================
   BULK FIX (SAFE + IDEMPOTENT)
============================================================ */

let FIX_IN_PROGRESS = false;

window.bulkFix = async function (oldId) {

  if (FIX_IN_PROGRESS)
    return alert("Fix already in progress");

  if (SYSTEM_QUARANTINED)
    return alert("System quarantined");

  const jobs =
    [...FIX_QUEUE.values()].filter(j => j.oldId === oldId);

  if (!jobs.length)
    return alert("No records to fix");

  if (!confirm(`Fix ${jobs.length} records?`)) return;

  if (SYS.DRY_RUN) {
    console.table(jobs);
    return alert("Dry-run only");
  }

  FIX_IN_PROGRESS = true;

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  await acquireLock();

  try {
    for (const j of jobs) {

      // Safety: skip invalid jobs
      if (!j.docId || !j.newId || j.newId === j.oldId) {
        skipped++;
        continue;
      }

      try {
        await updateDoc(doc(db, "delete_pac", j.docId), {
          deleteViewId: j.newId,
          fixedAt: Date.now(),
          fixedBy: SYS.ADMIN,
          fixMode: "bulk",
          previousDeleteId: j.oldId,

          deleteIdMeta: {
            version: 1,
            previous: j.oldId,
            fixedAt: Date.now()
          },

          compliance: {
            reason: "duplicate-resolution",
            authority: SYS.ADMIN,
            policyVersion: SYS.POLICY_VERSION,
            jurisdiction: SYS.JURISDICTION
          }
        });

        fixed++;
      } catch (err) {
        console.error("❌ Bulk fix failed:", j, err);
        failed++;
      }
    }
  } finally {
    await releaseLock();
    FIX_IN_PROGRESS = false;
  }

  alert(
    `Bulk fix completed\n\n` +
    `Fixed: ${fixed}\n` +
    `Skipped: ${skipped}\n` +
    `Failed: ${failed}`
  );
};

/* ============================================================
   GLOBAL FIX (SAFE + IDEMPOTENT)
============================================================ */
window.fixAllDuplicates = async function () {

  if (FIX_IN_PROGRESS)
    return alert("Fix already in progress");

  if (SYSTEM_QUARANTINED)
    return alert("System quarantined. Fix disabled.");

  const totalJobs = FIX_QUEUE.size;
  if (!totalJobs)
    return alert("No duplicates to fix.");

  if (!confirm(
    `This will FIX ALL duplicate delete IDs.\n` +
    `Total affected PACs: ${totalJobs}\n\nProceed?`
  )) return;

  if (SYS.DRY_RUN) {
    console.table([...FIX_QUEUE.values()]);
    return alert("Dry-run only. No changes made.");
  }

  FIX_IN_PROGRESS = true;

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  await acquireLock();

  try {
    for (const job of FIX_QUEUE.values()) {

      // Skip invalid or already-correct jobs
      if (!job.docId || !job.newId || job.newId === job.oldId) {
        skipped++;
        continue;
      }

      try {
        await updateDoc(doc(db, "delete_pac", job.docId), {
          deleteViewId: job.newId,
          fixedAt: Date.now(),
          fixedBy: SYS.ADMIN,
          fixMode: "global",
          previousDeleteId: job.oldId,

          deleteIdMeta: {
            version: 1,
            previous: job.oldId,
            fixedAt: Date.now()
          },

          compliance: {
            reason: "global-duplicate-resolution",
            authority: SYS.ADMIN,
            policyVersion: SYS.POLICY_VERSION,
            jurisdiction: SYS.JURISDICTION
          }
        });

        fixed++;
      } catch (err) {
        console.error("❌ Global fix failed:", job, err);
        failed++;
      }
    }
  } finally {
    await releaseLock();
    FIX_IN_PROGRESS = false;
  }

  alert(
    `✅ Global fix completed\n\n` +
    `Fixed: ${fixed}\n` +
    `Skipped: ${skipped}\n` +
    `Failed: ${failed}`
  );
};


/* ============================================================
   ROLLBACK (SAFE + AUTHORITATIVE)
============================================================ */
window.rollbackFix = async function (pacNo) {

  if (!pacNo)
    return alert("Invalid PAC number");

  // Find snapshot by pacNo (authoritative copy)
  const snap = [...SNAPSHOT_CACHE.values()]
    .find(r => r.pacNo === pacNo);

  if (!snap)
    return alert("No snapshot found for rollback");

  if (!confirm(
    `Rollback changes for PAC ${pacNo}?\n` +
    `This will restore the original record state.`
  )) return;

  await acquireLock();

  try {
    // Restore only controlled fields (safe rollback)
    await updateDoc(doc(db, "delete_pac", snap.id), {
      deleteViewId: snap.deleteViewId,

      // Remove fix markers logically
      fixedAt: null,
      fixedBy: null,
      fixMode: null,
      previousDeleteId: null,
      deleteIdMeta: null,
      compliance: null,

      // Rollback audit
      rollbackAt: Date.now(),
      rollbackBy: SYS.ADMIN,
      rollbackSource: "snapshot-cache",
      rollbackPolicyVersion: SYS.POLICY_VERSION
    });
  } finally {
    await releaseLock();
  }

  alert("✅ Rollback completed successfully");
};

