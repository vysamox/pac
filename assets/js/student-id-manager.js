/* ============================================================
   STUDENT ID MANAGER — FULLY UPGRADED (SAFE)
   ✔ No overwrite  ✔ Preview before generate  ✔ DOB safe
   ✔ Batch Firestore  ✔ Live UI bridge  ✔ Smart search
   ✔ Edit modal  ✔ Soft delete  ✔ Toast feedback
   ✔ Schema fixer  ✔ DOB fixer  ✔ Course ID generator
   ✔ Excel export  ✔ IP audit trail  ✔ Debounced search
============================================================ */

import {
  db,
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  writeBatch,
} from "./firebase-config.js";

import { exportStudentsToExcel } from "./export-students.js";
import { getCourseShortName }    from "./course-utils.js";


/* ============================================================
   CONFIG
============================================================ */
const COLLECTION   = "Students";
const BATCH_LIMIT  = 400;          // Firestore safe limit (<500)


/* ============================================================
   STATE
============================================================ */
let students         = [];          // raw full list from Firestore
let _editTargetId    = null;        // student being edited


/* ============================================================
   TOAST HELPER (works with new HTML toast system)
============================================================ */
function toast(msg, type = "info", duration = 3200) {
  // If new HTML bridge is present use it
  if (typeof window.showToast === "function") {
    window.showToast(msg, type, duration);
    return;
  }
  // Fallback: basic console
  console[type === "error" ? "error" : "log"](`[${type}] ${msg}`);
}


/* ============================================================
   UTILITY FUNCTIONS
============================================================ */

/** Zero-pad number to 6 digits → "000042" */
function formatUID(num) {
  return String(num).padStart(6, "0");
}

/** True if value is already DD-MM-YYYY */
function isAlreadyDMY(value) {
  return /^\d{2}-\d{2}-\d{4}$/.test(String(value || "").trim());
}

/**
 * Robust DOB formatter — handles:
 * Firestore Timestamp | ISO string | YYYY-MM-DD | DD-MM-YYYY | DD/MM/YYYY | MM/DD/YYYY
 */
function formatDateDMY(value) {
  if (!value) return "-";
  try {
    if (value?.toDate) {
      const d = value.toDate();
      return dmyStr(d);
    }
    const str = String(value).trim();
    if (str.includes("T")) return dmyStr(new Date(str));

    const p = str.split(/[-/]/);
    if (p.length !== 3) return "-";

    let day, month, year;
    if (p[0].length === 4)        { year = p[0]; month = p[1]; day = p[2]; }
    else if (Number(p[0]) > 12)   { day = p[0]; month = p[1]; year = p[2]; }
    else if (Number(p[1]) > 12)   { month = p[0]; day = p[1]; year = p[2]; }
    else                           { day = p[0]; month = p[1]; year = p[2]; }

    const d = new Date(`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
    if (isNaN(d)) return "-";
    return dmyStr(d);
  } catch { return "-"; }
}

function dmyStr(d) {
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
}

/** Get safe value from student using multiple possible field names */
function gv(s, ...keys) {
  for (const k of keys) {
    const v = s[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "-";
}

/** Current ISO datetime string */
function nowDT() {
  return new Date().toISOString().replace("T"," ").substring(0,19);
}

/** Fetch caller's public IP (for audit trail) */
async function getUserIP() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json();
    return d.ip || "UNKNOWN";
  } catch { return "UNKNOWN"; }
}

/** Debounce wrapper */
function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}


/* ============================================================
   SCHEMA / FIELD NORMALISATION
   Detects common misnamed fields and reports them
============================================================ */
const FIELD_MAP = {
  // wrong → correct
  "Student Name"  : "name",
  "studentName"   : "name",
  "student_name"  : "name",
  "Phone No"      : "phone",
  "PhoneNo"       : "phone",
  "mobile"        : "phone",
  "Mobile"        : "phone",
  "dob"           : "DOB",
  "Date of Birth" : "DOB",
  "dateOfBirth"   : "DOB",
  "StudentId"     : "studentId",
  "student_id"    : "studentId",
  "StudentID"     : "studentId",
  "Campus Name"   : "campus",
  "CampusName"    : "campus",
  "Department"    : "department",
  "Course"        : "department",
};

function detectSchemaIssues(studentList) {
  const issues = [];
  studentList.forEach(s => {
    Object.entries(FIELD_MAP).forEach(([wrong, correct]) => {
      if (s[wrong] !== undefined) {
        issues.push({
          studentFirebaseId: s.id,
          studentName: s.name || s.studentName || s["Student Name"] || s.id,
          issueType: "Wrong field name",
          field: wrong,
          recommended: correct,
        });
      }
    });
  });
  return issues;
}


/* ============================================================
   LOAD STUDENTS FROM FIRESTORE
============================================================ */
async function loadStudents() {
  try {
    toast("Loading students…", "info", 1800);
    const snap = await getDocs(collection(db, COLLECTION));

    students = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => !s.deleted);   // soft-delete filter

    // push to new HTML UI
    if (typeof window.renderStudentUI === "function") {
      window.renderStudentUI(buildUIList(students));
    }

    renderCampusSummary();
    checkSchemaIssues();
    checkDOBIssues();

    toast(`Loaded ${students.length} students`, "success", 2000);
  } catch (err) {
    console.error("loadStudents error:", err);
    toast("Failed to load students: " + err.message, "error", 5000);
  }
}

/**
 * Build a normalised list for the UI layer.
 * Maps all variant field names to consistent keys.
 */
function buildUIList(raw) {
  return raw.map(s => ({
    // preserve original for edit/view
    ...s,
    // normalised display keys
    name       : gv(s, "name","studentName","Student Name"),
    campus     : gv(s, "campus","Campus","CampusName","Campus Name"),
    phone      : gv(s, "phone","Phone","PhoneNo","Phone No","mobile","Mobile"),
    dob        : isAlreadyDMY(s.DOB_DMY) ? s.DOB_DMY : formatDateDMY(gv(s,"DOB","dob","Date of Birth","dateOfBirth")),
    courseId   : gv(s, "courseShort","CourseID","course_id","Course ID"),
    year       : gv(s, "CourseYear","year","Year"),
    admission  : formatDateDMY(gv(s,"DateofAdmission","admissionDate","Admission")),
    studentId  : gv(s, "studentId","StudentID","student_id","StudentId"),
  }));
}

/** Expose reload for the refresh button in HTML */
window.reloadStudentData = loadStudents;


/* ============================================================
   CAMPUS SUMMARY (legacy DOM, kept for backward compat)
============================================================ */
function renderCampusSummary() {
  const container = document.getElementById("campusSummary");
  if (!container) return;

  const campusMap = {};
  students.forEach(s => {
    const name = String(gv(s,"campus","Campus","CampusName") === "-" ? "Not Set" : gv(s,"campus","Campus","CampusName")).trim();
    campusMap[name] = (campusMap[name] || 0) + 1;
  });

  // The new HTML handles campus tiles via renderStudentUI → updateStats
  // This keeps old HTML layouts working too
  const isNewUI = !!document.querySelector(".campus-grid");
  if (isNewUI) return; // new UI handles it

  container.innerHTML = `<div class="campus-summary-title">📍 Campus Overview</div>`;
  Object.entries(campusMap)
    .sort((a,b) => b[1]-a[1])
    .forEach(([name, count]) => {
      container.innerHTML += `
        <div class="campus-row">
          <span class="campus-name">${name}</span>
          <span class="campus-count">${count} Students</span>
        </div>`;
    });
}


/* ============================================================
   SCHEMA ISSUE CHECKER
============================================================ */
function checkSchemaIssues() {
  const issues = detectSchemaIssues(students);
  const btn = document.getElementById("fixSchemaModalBtn");
  if (!btn) return;

  if (issues.length) {
    btn.style.display = "";
    const badge = document.getElementById("schemaBadgeCount");
    if (badge) badge.textContent = `(${issues.length})`;
    populateSchemaTable(issues);
  } else {
    btn.style.display = "none";
  }
}

function populateSchemaTable(issues) {
  const tbody = document.getElementById("schemaTable");
  if (!tbody) return;
  tbody.innerHTML = issues.map(i => `
    <tr class="schema-issue">
      <td>${i.studentName}</td>
      <td>${i.issueType}</td>
      <td><span style="font-family:var(--font-mono);color:var(--red)">${i.field}</span></td>
      <td><span style="font-family:var(--font-mono);color:var(--green)">${i.recommended}</span></td>
    </tr>
  `).join("");

  // wire Fix All button
  const fixBtn = document.getElementById("fixSchemaBtn");
  if (fixBtn) {
    fixBtn.onclick = () => fixSchemaIssues(issues);
  }
}

async function fixSchemaIssues(issues) {
  const confirmed = confirm(`Fix ${issues.length} field name issue(s)? This renames mismatched fields to standard names.`);
  if (!confirmed) return;

  try {
    const batch = writeBatch(db);
    const grouped = {};
    issues.forEach(i => {
      if (!grouped[i.studentFirebaseId]) grouped[i.studentFirebaseId] = [];
      grouped[i.studentFirebaseId].push(i);
    });

    const student = students;
    for (const [sid, issueList] of Object.entries(grouped)) {
      const s = students.find(x => x.id === sid);
      if (!s) continue;
      const updates = {};
      issueList.forEach(i => {
        updates[i.recommended] = s[i.field];   // copy value to correct key
        updates[i.field]       = null;          // clear old key (Firestore deleteField workaround)
      });
      batch.update(doc(db, COLLECTION, sid), updates);
    }

    await batch.commit();
    toast(`✅ Fixed ${issues.length} schema issues`, "success");
    closeFixModals();
    await loadStudents();
  } catch (err) {
    toast("Schema fix failed: " + err.message, "error");
  }
}


/* ============================================================
   DOB ISSUE CHECKER
============================================================ */
function checkDOBIssues() {
  const dobBtn = document.getElementById("dobFixBtn");
  const issues = students.filter(s => {
    const raw = gv(s,"DOB","dob","Date of Birth","dateOfBirth");
    return raw !== "-" && !isAlreadyDMY(s.DOB_DMY);
  });

  if (!dobBtn) return;

  if (issues.length) {
    dobBtn.style.display = "";
    populateDOBTable(issues);
  } else {
    dobBtn.style.display = "none";
  }
}

function populateDOBTable(issues) {
  const tbody = document.getElementById("dobFixTable");
  if (!tbody) return;
  tbody.innerHTML = issues.map(s => {
    const raw      = gv(s,"DOB","dob","Date of Birth","dateOfBirth");
    const formatted = formatDateDMY(raw);
    return `
      <tr>
        <td class="mono" style="font-size:12px">${s.studentId || s.id}</td>
        <td>${gv(s,"name","studentName","Student Name")}</td>
        <td style="color:var(--amber)">${raw}</td>
        <td style="color:var(--green);font-weight:700">${formatted}</td>
      </tr>`;
  }).join("");

  const confirmBtn = document.getElementById("confirmDobFix");
  if (confirmBtn) confirmBtn.onclick = () => fixDOB(issues);
}

async function fixDOB(issues) {
  try {
    const ip = await getUserIP();
    const dt = nowDT();
    let done = 0;

    for (let i = 0; i < issues.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      const chunk = issues.slice(i, i + BATCH_LIMIT);
      chunk.forEach(s => {
        const raw       = gv(s,"DOB","dob","Date of Birth","dateOfBirth");
        const formatted = formatDateDMY(raw);
        if (formatted === "-") return;
        batch.update(doc(db, COLLECTION, s.id), {
          DOB_DMY              : formatted,
          dobFixedAt           : dt,
          dobFixedIP           : ip,
        });
        s.DOB_DMY = formatted;
        done++;
      });
      await batch.commit();
    }

    toast(`✅ Fixed DOB for ${done} students`, "success");
    closeFixModals();
    await loadStudents();
  } catch (err) {
    toast("DOB fix failed: " + err.message, "error");
  }
}


/* ============================================================
   COURSE ID GENERATOR
============================================================ */
async function handleCourseIDGeneration() {
  const alreadyDone    = students.filter(s => s.courseShort);
  const pendingStudents = students
    .filter(s => !s.courseShort && (s.department || s.course))
    .sort((a,b) => new Date(b.DateofAdmission||0) - new Date(a.DateofAdmission||0));

  // Populate preview table
  const tbody = document.getElementById("idFixTable");
  if (tbody) {
    if (!pendingStudents.length) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--green);padding:20px">
        ✅ All students already have Course IDs
      </td></tr>`;
    } else {
      tbody.innerHTML = pendingStudents.slice(0, 100).map(s => {
        const short = getCourseShortName(s.department || s.course);
        return `
          <tr>
            <td>${gv(s,"name","studentName","Student Name")}</td>
            <td style="color:var(--text-muted);font-family:var(--font-mono)">${s.courseShort || "—"}</td>
            <td style="color:var(--teal);font-family:var(--font-mono);font-weight:700">${short || "—"}</td>
          </tr>`;
      }).join("");

      if (pendingStudents.length > 100) {
        tbody.innerHTML += `<tr><td colspan="3" style="color:var(--text-muted);padding:10px;text-align:center">
          … and ${pendingStudents.length - 100} more
        </td></tr>`;
      }
    }
  }

  // Update status line
  const statusEl  = document.getElementById("courseGenStatus");
  const alreadyEl = document.getElementById("courseAlready");
  const doneEl    = document.getElementById("courseDone");
  const pendingEl = document.getElementById("coursePending");

  if (statusEl) statusEl.style.display = "block";
  if (alreadyEl) alreadyEl.textContent = `Already Done: ${alreadyDone.length}`;
  if (doneEl)    doneEl.textContent    = `Pending: ${pendingStudents.length}`;
  if (pendingEl) pendingEl.textContent = ``;

  // open modal for confirmation
  const modal = document.getElementById("idFixModal");
  if (modal) {
    if (typeof window.openModal === "function") window.openModal("idFixModal");
    else modal.classList.add("active");
  }

  // wire confirm button
  const confirmBtn = document.getElementById("confirmIdGen");
  if (confirmBtn) {
    // clone to remove old listeners
    const fresh = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(fresh, confirmBtn);
    fresh.onclick = () => executeCourseIDGeneration(pendingStudents);
  }
}

async function executeCourseIDGeneration(pendingStudents) {
  if (!pendingStudents.length) {
    toast("No pending students to update", "info");
    return;
  }

  const confirmBtn = document.getElementById("confirmIdGen");
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Generating…"; }

  const progressWrap = document.getElementById("idGenProgress");
  const barEl        = document.getElementById("idGenBar");
  const countEl      = document.getElementById("idGenCount");
  const totalEl      = document.getElementById("idGenTotal");
  const pctEl        = document.getElementById("idGenPercent");

  if (progressWrap) progressWrap.style.display = "block";
  if (totalEl) totalEl.textContent = pendingStudents.length;

  const ip = await getUserIP();
  const dt = nowDT();
  const ts = Date.now();
  let done = 0;

  try {
    for (let i = 0; i < pendingStudents.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      const chunk = pendingStudents.slice(i, i + BATCH_LIMIT);

      for (const s of chunk) {
        const short = getCourseShortName(s.department || s.course);
        if (!short) continue;
        batch.update(doc(db, COLLECTION, s.id), {
          courseShort                : short,
          courseShortGeneratedAt     : ts,
          courseShortGeneratedDate   : dt,
          courseShortGeneratedIP     : ip,
        });
        s.courseShort              = short;
        s.courseShortGeneratedAt   = ts;
        s.courseShortGeneratedDate = dt;
        s.courseShortGeneratedIP   = ip;
        done++;
      }

      await batch.commit();

      // live progress
      const pct = Math.round((done / pendingStudents.length) * 100);
      if (barEl)   barEl.style.width    = pct + "%";
      if (countEl) countEl.textContent  = done;
      if (pctEl)   pctEl.textContent    = pct + "%";
    }

    toast(`✅ Course IDs generated for ${done} students`, "success");
    closeFixModals();
    await loadStudents();
  } catch (err) {
    toast("Course ID generation failed: " + err.message, "error");
  } finally {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "🚀 Generate IDs"; }
    if (progressWrap) progressWrap.style.display = "none";
  }
}


/* ============================================================
   STUDENT ID (UID) GENERATOR
   Generates sequential numeric IDs for students missing them.
   Format: 000001, 000002 …
============================================================ */
async function generateStudentIDs() {
  // find highest existing ID
  let maxNum = 0;
  students.forEach(s => {
    const uid = s.studentId;
    if (uid && /^\d+$/.test(uid)) {
      const n = parseInt(uid, 10);
      if (n > maxNum) maxNum = n;
    }
  });

  const pending = students.filter(s => !s.studentId || s.studentId === "-");

  if (!pending.length) {
    toast("All students already have Student IDs", "success");
    return;
  }

  // Preview
  const tbody = document.getElementById("idFixTable");
  if (tbody) {
    tbody.innerHTML = pending.slice(0, 100).map((s, i) => {
      const newId = formatUID(maxNum + i + 1);
      return `
        <tr>
          <td>${gv(s,"name","studentName","Student Name")}</td>
          <td style="color:var(--red);font-family:var(--font-mono)">${s.studentId || "—"}</td>
          <td style="color:var(--teal);font-family:var(--font-mono);font-weight:700">${newId}</td>
        </tr>`;
    }).join("");

    if (pending.length > 100) {
      tbody.innerHTML += `<tr><td colspan="3" style="color:var(--text-muted);padding:10px;text-align:center">
        … and ${pending.length - 100} more
      </td></tr>`;
    }
  }

  // open modal
  if (typeof window.openModal === "function") window.openModal("idFixModal");
  else {
    const m = document.getElementById("idFixModal");
    if (m) m.classList.add("active");
  }

  const confirmBtn = document.getElementById("confirmIdGen");
  if (confirmBtn) {
    const fresh = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(fresh, confirmBtn);
    fresh.onclick = () => executeStudentIDGeneration(pending, maxNum);
  }
}

async function executeStudentIDGeneration(pending, startFrom) {
  const confirmBtn   = document.getElementById("confirmIdGen");
  const progressWrap = document.getElementById("idGenProgress");
  const barEl        = document.getElementById("idGenBar");
  const countEl      = document.getElementById("idGenCount");
  const totalEl      = document.getElementById("idGenTotal");
  const pctEl        = document.getElementById("idGenPercent");

  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Generating…"; }
  if (progressWrap) progressWrap.style.display = "block";
  if (totalEl) totalEl.textContent = pending.length;

  const ip = await getUserIP();
  const dt = nowDT();
  const ts = Date.now();
  let done = 0;

  try {
    for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      const chunk = pending.slice(i, i + BATCH_LIMIT);

      for (const s of chunk) {
        const newId = formatUID(startFrom + done + 1);
        batch.update(doc(db, COLLECTION, s.id), {
          studentId              : newId,
          studentIdGeneratedAt   : ts,
          studentIdGeneratedDate : dt,
          studentIdGeneratedIP   : ip,
        });
        s.studentId              = newId;
        s.studentIdGeneratedAt   = ts;
        s.studentIdGeneratedDate = dt;
        s.studentIdGeneratedIP   = ip;
        done++;
      }

      await batch.commit();

      const pct = Math.round((done / pending.length) * 100);
      if (barEl)   barEl.style.width   = pct + "%";
      if (countEl) countEl.textContent = done;
      if (pctEl)   pctEl.textContent   = pct + "%";
    }

    toast(`✅ Student IDs generated for ${done} students`, "success");
    closeFixModals();
    await loadStudents();
  } catch (err) {
    toast("Student ID generation failed: " + err.message, "error");
  } finally {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "🚀 Generate IDs"; }
    if (progressWrap) progressWrap.style.display = "none";
  }
}


/* ============================================================
   STUDENT VIEW MODAL
   Works with both old and new HTML layouts
============================================================ */
window.openStudentView = function(studentIdOrIdx) {
  // support both firebase ID (string) and array index (number)
  let s;
  if (typeof studentIdOrIdx === "number") {
    s = students[studentIdOrIdx];
  } else {
    s = students.find(x => x.id === studentIdOrIdx);
  }
  if (!s) return;

  const name = gv(s,"name","studentName","Student Name");
  const uid  = s.studentId || "Not assigned";

  // new HTML UI
  const viewModal = document.getElementById("viewModal");
  if (!viewModal) return;

  document.getElementById("viewAvatar").textContent    = name.charAt(0).toUpperCase();
  document.getElementById("viewName").textContent      = name;
  document.getElementById("viewUID").textContent       = uid;

  // Try new view-fields layout first
  const viewGrid = document.getElementById("viewGrid");
  if (viewGrid) {
    // If new HTML uses .view-fields grid, it will already be populated by renderStudentUI.
    // Re-populate here with full detail sections.
    viewGrid.innerHTML = buildViewGridHTML(s);
  }

  // open
  if (viewModal.classList !== undefined) {
    viewModal.classList.add("active");
  } else {
    viewModal.style.display = "flex";
  }
};

function buildViewGridHTML(s) {
  const sections = [
    {
      title: "👤 Personal",
      fields: [
        ["Phone",        gv(s,"phone","Phone","PhoneNo","mobile")],
        ["Email",        gv(s,"email","Email")],
        ["DOB",          s.DOB_DMY || formatDateDMY(gv(s,"DOB","dob","Date of Birth"))],
        ["Gender",       gv(s,"Sex","sex","Gender","gender")],
        ["Blood Group",  gv(s,"BloodGroup")],
        ["Religion",     gv(s,"Religion")],
        ["Nationality",  gv(s,"Nationality")],
        ["Category",     gv(s,"Category")],
        ["Marital Status",gv(s,"MartialStatus","MaritalStatus")],
        ["Aadhaar",      gv(s,"AdharNo","AadhaarNo","Aadhaar")],
        ["Handicap",     gv(s,"Handicap")],
      ],
    },
    {
      title: "👪 Family",
      fields: [
        ["Father",             gv(s,"father","Father")],
        ["Father Contact",     gv(s,"FatherContact")],
        ["Father Email",       gv(s,"FatherEmail")],
        ["Father Occupation",  gv(s,"FatherOccupation")],
        ["Mother",             gv(s,"mother","Mother")],
        ["Mother Contact",     gv(s,"MotherContact")],
        ["Guardian",           gv(s,"Guardian")],
        ["Guardian Contact",   gv(s,"GuardianContact")],
      ],
    },
    {
      title: "🎓 Course",
      fields: [
        ["Department",        gv(s,"department","Department","course","Course")],
        ["Session",           gv(s,"CourseSession")],
        ["Course Year",       gv(s,"CourseYear","year","Year")],
        ["Course ID",         gv(s,"courseShort","CourseID","course_id")],
        ["Quota",             gv(s,"Quota")],
        ["Campus",            gv(s,"campus","Campus")],
        ["Roll No",           gv(s,"RollNo")],
        ["Student Status",    gv(s,"StudentStatus")],
        ["Admission Status",  gv(s,"Status")],
        ["Date of Admission", formatDateDMY(gv(s,"DateofAdmission","admissionDate"))],
      ],
    },
    {
      title: "💰 Fees",
      fields: [
        ["Total Fees",        s.TotalFees ? `₹${Number(s.TotalFees).toLocaleString("en-IN")}` : "-"],
        ["In Words",          gv(s,"TotalFeesInWords")],
        ["Admission Fees",    s.AdmissionFees ? `₹${s.AdmissionFees}` : "-"],
        ["Semester 1",        s.SemesterFee1  ? `₹${s.SemesterFee1}` : "-"],
        ["Semester 2",        s.SemesterFee2  ? `₹${s.SemesterFee2}` : "-"],
        ["Semester 3",        s.SemesterFee3  ? `₹${s.SemesterFee3}` : "-"],
        ["Semester 4",        s.SemesterFee4  ? `₹${s.SemesterFee4}` : "-"],
        ["Semester 5",        s.SemesterFee5  ? `₹${s.SemesterFee5}` : "-"],
        ["Semester 6",        s.SemesterFee6  ? `₹${s.SemesterFee6}` : "-"],
        ["Agent Commission",  s.AgentAmount   ? `₹${s.AgentAmount}`  : "-"],
      ],
    },
    {
      title: "🧑‍💼 Agent",
      fields: [
        ["Agent Name",    gv(s,"AgentName")],
        ["Agent Type",    gv(s,"AgentType")],
        ["Agent Contact", gv(s,"AgentContact")],
        ["Agent Amount",  s.AgentAmount ? `₹${s.AgentAmount}` : "-"],
        ["Agent Address", gv(s,"AgentAddress")],
        ["Agent Role",    gv(s,"AgentRoll","AgentRole")],
      ],
    },
    {
      title: "🏠 Address",
      fields: [
        ["Permanent", [s.PermanentCity, s.PermanentPost, s.PermanentPolice, s.PermanentDistrict, s.PermanentState, s.PermanentPin].filter(Boolean).join(", ") || "-"],
        ["Present",   [s.PresentCity,   s.PresentPost,   s.PresentPolice,   s.PresentDistrict,   s.PresentState,   s.PresentPin  ].filter(Boolean).join(", ") || "-"],
      ],
    },
    {
      title: "📚 Academics",
      fields: [
        ["Secondary Board",       gv(s,"SecondaryBoard")],
        ["Secondary YOP",         gv(s,"SecondaryYOP")],
        ["Secondary Total Marks", gv(s,"SecondaryFullMarks")],
        ["Secondary Obtained",    gv(s,"SecondaryGrandTotal")],
        ["Secondary %",           gv(s,"SecondaryPercentage")],
        ["Secondary Math",        gv(s,"SecondaryMath")],
        ["Secondary Physics",     gv(s,"SecondaryPhysics")],
        ["HS Board",              gv(s,"HigherSecondaryBoard")],
        ["HS YOP",                gv(s,"HigherSecondaryYOP")],
        ["HS Percentage",         gv(s,"HigherSecondaryPercentage")],
        ["Last Institute",        gv(s,"LastInstitute")],
      ],
    },
    {
      title: "🧾 System",
      fields: [
        ["Student ID",     s.studentId || "-"],
        ["Financial Year", gv(s,"FinancialYear")],
        ["Upload Date",    `${gv(s,"uploadedDate")} ${gv(s,"uploadedTime")}`.trim()],
        ["Device OS",      gv(s,"operatingSystem")],
        ["Upload City",    gv(s,"uploadedCity")],
        ["Region",         gv(s,"uploadedRegion")],
        ["Country",        gv(s,"uploadedCountry")],
        ["IPv4",           gv(s,"uploadedIPv4")],
        ["IPv6",           gv(s,"uploadedIPv6")],
        ["Remarks",        gv(s,"Remarks")],
      ],
    },
  ];

  return sections.map(sec => {
    const fieldRows = sec.fields.map(([label, value]) => `
      <div class="view-field">
        <div class="view-field-label">${label}</div>
        <div class="view-field-value">${value === "-" ? '<span style="color:var(--text-muted)">—</span>' : value}</div>
      </div>
    `).join("");

    return `
      <div style="grid-column:1/-1; margin-top:8px; margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;
                    color:var(--cyan);padding:6px 0;border-bottom:1px solid var(--border)">
          ${sec.title}
        </div>
      </div>
      ${fieldRows}
    `;
  }).join("");
}

window.closeView = function () {
  const m = document.getElementById("viewModal");
  if (!m) return;
  m.classList.remove("active");
  m.style.display = "none";
};


/* ============================================================
   EDIT STUDENT MODAL
   Generates a dynamic form from student fields
============================================================ */
window.editStudent = function(studentIdOrIdx) {
  let s;
  if (typeof studentIdOrIdx === "number") {
    s = students[studentIdOrIdx];
  } else {
    s = students.find(x => x.id === studentIdOrIdx);
  }
  if (!s) return;

  _editTargetId = s.id;

  // Editable fields — add or remove as needed
  const EDITABLE_FIELDS = [
    { key: "name",        label: "Name",          type: "text" },
    { key: "phone",       label: "Phone",         type: "tel" },
    { key: "email",       label: "Email",         type: "email" },
    { key: "campus",      label: "Campus",        type: "text" },
    { key: "department",  label: "Department",    type: "text" },
    { key: "CourseYear",  label: "Course Year",   type: "text" },
    { key: "CourseSession",label:"Session",       type: "text" },
    { key: "RollNo",      label: "Roll No",       type: "text" },
    { key: "Quota",       label: "Quota",         type: "text" },
    { key: "StudentStatus",label:"Student Status",type: "text" },
    { key: "Remarks",     label: "Remarks",       type: "text" },
  ];

  // Build or find modal
  let editModal = document.getElementById("editStudentModal");
  if (!editModal) {
    editModal = document.createElement("div");
    editModal.id = "editStudentModal";
    editModal.className = "modal-overlay";
    editModal.innerHTML = `
      <div class="modal-card" style="max-width:680px">
        <div class="modal-header">
          <div>
            <div class="modal-title">✏️ Edit Student</div>
            <div class="modal-subtitle" id="editStudentSub"></div>
          </div>
          <button class="modal-close" onclick="closeEditModal()">✕</button>
        </div>
        <div class="modal-body" id="editStudentBody"></div>
        <div class="modal-footer">
          <button class="action-btn success" onclick="saveStudentEdit()">💾 Save Changes</button>
          <button class="action-btn danger"  onclick="closeEditModal()">✕ Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(editModal);
  }

  document.getElementById("editStudentSub").textContent =
    `${gv(s,"name","studentName","Student Name")} · ${s.id}`;

  // Build form
  const body = document.getElementById("editStudentBody");
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${EDITABLE_FIELDS.map(f => `
        <div>
          <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;
                        letter-spacing:0.5px;color:var(--cyan);margin-bottom:5px">${f.label}</label>
          <input
            id="edit_${f.key}"
            type="${f.type}"
            value="${escapeHTML(String(gv(s, f.key, f.key.toLowerCase()) === "-" ? "" : gv(s, f.key, f.key.toLowerCase())))}"
            style="width:100%;padding:9px 12px;background:var(--bg-base);border:1px solid var(--border);
                   border-radius:var(--radius-sm);color:var(--text-primary);font-family:var(--font-ui);
                   font-size:13px;outline:none;transition:border-color 0.2s"
            onfocus="this.style.borderColor='var(--cyan-dim)'"
            onblur="this.style.borderColor='var(--border)'"
          />
        </div>
      `).join("")}
    </div>
    <div style="margin-top:16px;padding:12px;background:rgba(255,184,48,0.06);
                border:1px solid rgba(255,184,48,0.2);border-radius:var(--radius-md);font-size:12px;
                color:var(--amber)">
      ⚠️ Only listed fields can be edited. Student ID, DOB, and system fields are protected.
    </div>`;

  editModal.classList.add("active");
};

window.closeEditModal = function() {
  const m = document.getElementById("editStudentModal");
  if (m) m.classList.remove("active");
  _editTargetId = null;
};

window.saveStudentEdit = async function() {
  if (!_editTargetId) return;

  const s = students.find(x => x.id === _editTargetId);
  if (!s) return;

  const EDITABLE_FIELDS = ["name","phone","email","campus","department",
    "CourseYear","CourseSession","RollNo","Quota","StudentStatus","Remarks"];

  const updates = {};
  let changed = 0;

  EDITABLE_FIELDS.forEach(key => {
    const el = document.getElementById(`edit_${key}`);
    if (!el) return;
    const newVal = el.value.trim();
    const oldVal = String(s[key] || "");
    if (newVal !== oldVal) {
      updates[key] = newVal;
      changed++;
    }
  });

  if (!changed) {
    toast("No changes made", "info");
    return;
  }

  try {
    const ip = await getUserIP();
    updates._lastEditedAt = nowDT();
    updates._lastEditedIP = ip;

    await updateDoc(doc(db, COLLECTION, _editTargetId), updates);

    // update local cache
    Object.assign(s, updates);

    toast(`✅ ${changed} field(s) updated`, "success");
    closeEditModal();

    // refresh UI
    if (typeof window.renderStudentUI === "function") {
      window.renderStudentUI(buildUIList(students));
    }
  } catch (err) {
    toast("Save failed: " + err.message, "error");
  }
};

function escapeHTML(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}


/* ============================================================
   SOFT DELETE (sets deleted:true — does NOT remove from Firestore)
============================================================ */
window.softDeleteStudent = async function(studentIdOrIdx) {
  let s;
  if (typeof studentIdOrIdx === "number") {
    s = students[studentIdOrIdx];
  } else {
    s = students.find(x => x.id === studentIdOrIdx);
  }
  if (!s) return;

  const name = gv(s,"name","studentName","Student Name");
  const confirmed = confirm(
    `Mark "${name}" as deleted?\n\nThis is a SOFT delete — data is preserved in Firestore and can be restored by an admin.`
  );
  if (!confirmed) return;

  try {
    const ip = await getUserIP();
    await updateDoc(doc(db, COLLECTION, s.id), {
      deleted        : true,
      deletedAt      : nowDT(),
      deletedIP      : ip,
    });

    students = students.filter(x => x.id !== s.id);

    if (typeof window.renderStudentUI === "function") {
      window.renderStudentUI(buildUIList(students));
    }

    toast(`"${name}" marked as deleted`, "warning");
  } catch (err) {
    toast("Delete failed: " + err.message, "error");
  }
};


/* ============================================================
   EXCEL EXPORT
============================================================ */
function handleExport() {
  if (!students.length) {
    toast("No data to export", "warning");
    return;
  }
  try {
    exportStudentsToExcel(students);
    toast("✅ Excel file downloading…", "success");
  } catch (err) {
    toast("Export failed: " + err.message, "error");
  }
}


/* ============================================================
   CLOSE MODALS (global)
============================================================ */
window.closeFixModals = function () {
  ["idFixModal","dobFixModal","schemaModal"].forEach(id => {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove("active");
    m.style.display = "";
  });
};


/* ============================================================
   WIRE ALL BUTTONS
============================================================ */
function wireButtons() {

  // Course ID generator
  const courseFixBtn = document.getElementById("courseFixBtn");
  if (courseFixBtn) {
    courseFixBtn.addEventListener("click", async () => {
      if (courseFixBtn.disabled) return;
      courseFixBtn.disabled = true;
      try { await handleCourseIDGeneration(); }
      finally { courseFixBtn.disabled = false; }
    });
  }

  // Excel export
  const exportBtn = document.getElementById("exportExcelBtn");
  if (exportBtn) exportBtn.addEventListener("click", handleExport);

  // Refresh
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadStudents);

  // DOB fix trigger
  const dobFixBtn = document.getElementById("dobFixBtn");
  if (dobFixBtn) {
    dobFixBtn.addEventListener("click", () => {
      if (typeof window.openModal === "function") window.openModal("dobFixModal");
      else {
        const m = document.getElementById("dobFixModal");
        if (m) m.classList.add("active");
      }
    });
  }

  // Schema fix trigger (badge button)
  const schemaBtn = document.getElementById("fixSchemaModalBtn");
  if (schemaBtn) {
    schemaBtn.addEventListener("click", () => {
      if (typeof window.openModal === "function") window.openModal("schemaModal");
      else {
        const m = document.getElementById("schemaModal");
        if (m) m.classList.add("active");
      }
    });
  }

}


/* ============================================================
   SEARCH — advanced token-based (unchanged logic, wired here)
   Supports: campus:X  dept:X  year:X  id:X  phone:X  fees>N  fees<N
============================================================ */
function wireSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  const doSearch = debounce(() => {
    const raw  = searchInput.value.trim().toLowerCase();
    const tokens = raw.split(/\s+/).filter(Boolean);

    let result;
    if (!tokens.length) {
      result = students;
    } else {
      result = students.filter(s => {
        const name   = (gv(s,"name","studentName","Student Name") + "").toLowerCase();
        const phone  = String(gv(s,"phone","Phone","PhoneNo","mobile") + "");
        const sid    = String(s.studentId || "").toLowerCase();
        const campus = (gv(s,"campus","Campus") + "").toLowerCase();
        const dept   = (gv(s,"department","Department","course","Course") + "").toLowerCase();
        const year   = String(gv(s,"CourseYear","year","Year") + "");
        const fees   = Number(s.TotalFees || 0);
        const blob   = `${name} ${phone} ${sid} ${campus} ${dept} ${year}`;

        return tokens.every(token => {
          if (token.startsWith("campus:"))  return campus.includes(token.slice(7));
          if (token.startsWith("dept:"))    return dept.includes(token.slice(5));
          if (token.startsWith("year:"))    return year === token.slice(5);
          if (token.startsWith("id:"))      return sid.includes(token.slice(3));
          if (token.startsWith("phone:"))   return phone.includes(token.slice(6));
          if (token.startsWith("fees>"))    return fees > Number(token.slice(5));
          if (token.startsWith("fees<"))    return fees < Number(token.slice(5));
          return blob.includes(token);
        });
      });
    }

    if (typeof window.renderStudentUI === "function") {
      window.renderStudentUI(buildUIList(result));
    }
  }, 220);

  searchInput.addEventListener("input", doSearch);
}


/* ============================================================
   INIT
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  wireButtons();
  wireSearch();
  loadStudents();
});