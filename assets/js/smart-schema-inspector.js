/* =========================================================
   SMART SCHEMA INSPECTOR — ENTERPRISE VERSION
========================================================= */

import {
  db,
  doc,
  writeBatch,
  collection,
  getDocs
} from "./firebase-config.js";

/* ================= OFFICIAL SCHEMA ================= */

const SCHEMA = {
  name: "string",
  phone: "string",
  email: "string",
  studentUID: "string",
  aadhaar: "string",
  bloodGroup: "string",
  gender: "string",
  caste: "string",
  religion: "string",
  nationality: "string",
  father: "string",
  fatherContact: "string",
  mother: "string",
  motherContact: "string",
  guardian: "string",
  guardianContact: "string",
  department: "string",
  courseSession: "string",
  courseYear: "string",
  campus: "string",
  courseQuota: "string",
  dob: "string",
  DOB_DMY: "string",
  dateOfAdmission: "string",
  totalFees: "number",
  admissionFees: "number",
  rollNo: "number",
  addedOn: "string"
};

/* ================= FIELD ALIASES ================= */

const ALIAS = {
  AdharNo: "aadhaar",
  BloodGroup: "bloodGroup",
  Sex: "gender",
  Category: "caste",
  Quota: "courseQuota",
  DateofAdmission: "dateOfAdmission",
  AdmissionFees: "admissionFees",
  TotalFees: "totalFees",
  FatherContact: "fatherContact",
  MotherContact: "motherContact",
  GuardianContact: "guardianContact"
};

/* ================= HELPERS ================= */

function isExcelSerial(value) {
  return typeof value === "number" && value > 20000 && value < 60000;
}

/* ================= INIT ================= */

export function initSmartInspector() {

  const scanBtn = document.getElementById("schemaScanBtn");
  const fixBtn  = document.getElementById("fixSchemaBtn");
  const table   = document.getElementById("schemaTable");

  if (!scanBtn || !fixBtn || !table) return;

  let issues = [];
  let rawDocs = [];

  /* ================= SCAN ================= */
scanBtn.onclick = async () => {

  table.innerHTML = `
    <tr>
      <td colspan="4" style="text-align:center;padding:20px">
        🔎 Scanning... please wait
      </td>
    </tr>
  `;

  issues = [];
  rawDocs = [];

  const snap = await getDocs(collection(db, "StudentsDetails"));
  rawDocs = snap.docs;

  const MAX_RENDER = 50;   // prevent UI overload
  let renderCount = 0;

  for (let i = 0; i < rawDocs.length; i++) {

    const docSnap = rawDocs[i];
    const data = docSnap.data();
    const studentName = data.name || "-";

    Object.keys(data).forEach(key => {

      if (renderCount > MAX_RENDER) return;

      if (ALIAS[key]) {
        issues.push({
          id: docSnap.id,
          student: studentName,
          type: "Alias",
          field: key,
          recommended: ALIAS[key]
        });
        renderCount++;
        return;
      }

      if (!SCHEMA[key]) {
        issues.push({
          id: docSnap.id,
          student: studentName,
          type: "Unknown",
          field: key,
          recommended: "Not in official schema"
        });
        renderCount++;
        return;
      }

      const expected = SCHEMA[key];
      const actual = typeof data[key];

      if (actual !== expected) {
        issues.push({
          id: docSnap.id,
          student: studentName,
          type: "Type Mismatch",
          field: key,
          recommended: `Should be ${expected}`
        });
        renderCount++;
      }

      if (key === "DOB" && isExcelSerial(data[key])) {
        issues.push({
          id: docSnap.id,
          student: studentName,
          type: "Excel Date",
          field: "DOB",
          recommended: "Convert to formatted string"
        });
        renderCount++;
      }

    });

    // yield to browser every 200 records
    if (i % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  renderIssues(issues);

  document.getElementById("schemaModal").style.display = "flex";
};

  /* ================= RENDER ================= */

  function renderIssues(list) {

    table.innerHTML = "";

    if (!list.length) {
      table.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center;padding:20px">
            ✅ Database perfectly aligned with official schema
          </td>
        </tr>
      `;
      return;
    }

    list.forEach(i => {
      table.innerHTML += `
        <tr>
          <td>${i.student}</td>
          <td style="color:#ff6666">${i.type}</td>
          <td>${i.field}</td>
          <td style="color:#00ffaa">${i.recommended}</td>
        </tr>
      `;
    });
  }

  /* ================= FIX ================= */

  fixBtn.onclick = async () => {

    if (!issues.length) {
      alert("No issues to fix.");
      return;
    }

    if (!confirm("Auto-fix all detected issues?")) return;

    fixBtn.disabled = true;
    fixBtn.textContent = "Normalizing...";

    const BATCH_LIMIT = 400;

    for (let i = 0; i < rawDocs.length; i += BATCH_LIMIT) {

      const batch = writeBatch(db);
      const chunk = rawDocs.slice(i, i + BATCH_LIMIT);

      chunk.forEach(docSnap => {

        const data = docSnap.data();
        const updates = {};

        /* FIX ALIASES */
        Object.keys(ALIAS).forEach(oldKey => {
          if (data[oldKey] !== undefined) {
            updates[ALIAS[oldKey]] = data[oldKey];
            updates[oldKey] = null;
          }
        });

        /* FIX TYPE */
        Object.keys(SCHEMA).forEach(field => {

          if (data[field] !== undefined) {

            const expected = SCHEMA[field];

            if (expected === "string" && typeof data[field] === "number") {
              updates[field] = String(data[field]);
            }

            if (expected === "number" && typeof data[field] === "string") {
              const num = Number(data[field]);
              if (!isNaN(num)) updates[field] = num;
            }
          }
        });

        if (Object.keys(updates).length > 0) {
          batch.update(doc(db, "StudentsDetails", docSnap.id), updates);
        }

      });

      await batch.commit();
    }

    fixBtn.disabled = false;
    fixBtn.textContent = "🛠 Fix All";

    alert("✅ Smart normalization complete");
    document.getElementById("schemaModal").style.display = "none";
  };
}