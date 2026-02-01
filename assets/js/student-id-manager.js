/* ============================================================
   STUDENT ID MANAGER — ADVANCED FINAL (SAFE)
   Collection: StudentsDetails, ✔ No delete, ✔ No overwrite, ✔ Preview ID before generate, ✔ DOB update SAFE, ✔ Already formatted DOB → OK
============================================================ */

import {
  db,
  collection,
  getDocs,
  doc,
  updateDoc
} from "./firebase-config.js";


import { getCourseShortName } from "./course-utils.js";
import { writeBatch } from "./firebase-config.js";



/* ================= CONFIG ================= */
const PAGE_SIZE = 15;

/* ================= STATE ================= */
let students = [];
let page = 1;
let filteredStudents = [];


/* ================= DOM ================= */
const table    = document.getElementById("studentTable");
const pageInfo = document.getElementById("pageInfo");
const prevBtn  = document.getElementById("prevBtn");
const nextBtn  = document.getElementById("nextBtn");
const genBtn   = document.getElementById("generateBtn");
const updateDobBtn = document.getElementById("updateDobBtn");

/* ================= UTIL ================= */
function formatUID(num) {
  return String(num).padStart(6, "0");
}

/* 🔥 NEW: detect if already DD-MM-YYYY */
function isAlreadyDMY(value) {
  return /^\d{2}-\d{2}-\d{4}$/.test(String(value || "").trim());
}

/* ---- Robust DOB formatter (ALL formats supported) ---- */
function formatDateDMY(value) {
  if (!value) return "-";

  try {
    // Firestore Timestamp
    if (value?.toDate) {
      const d = value.toDate();
      return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
    }

    const str = String(value).trim();
    let d;

    if (str.includes("T")) {
      d = new Date(str);
    } else {
      const p = str.split(/[-/]/);
      if (p.length !== 3) return "-";

      let day, month, year;

      if (p[0].length === 4) {
        year = p[0]; month = p[1]; day = p[2];
      } else if (Number(p[0]) > 12) {
        day = p[0]; month = p[1]; year = p[2];
      } else if (Number(p[1]) > 12) {
        month = p[0]; day = p[1]; year = p[2];
      } else {
        day = p[0]; month = p[1]; year = p[2];
      }

      d = new Date(`${year}-${month}-${day}`);
    }

    if (isNaN(d)) return "-";

    return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
  } catch {
    return "-";
  }
}

/* ================= LOAD STUDENTS ================= */
async function loadStudents() {
  const snap = await getDocs(collection(db, "StudentsDetails"));

  students = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

filteredStudents = students;
page = 1;
render();

}

/* ================= PREVIEW ID MAP ================= */
function getNextUIDMap() {
  let max = 0;

  students.forEach(s => {
    if (s.studentUID && /^\d{6}$/.test(s.studentUID)) {
      max = Math.max(max, Number(s.studentUID));
    }
  });

  const map = {};
  let counter = max;

  students.forEach(s => {
    if (!s.studentUID) {
      counter++;
      map[s.id] = formatUID(counter);
    }
  });

  return map;
}

/* ================= RENDER ================= */
function render() {
  table.innerHTML = "";

  if (students.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center;padding:20px;opacity:.7">
          No students found
        </td>
      </tr>
    `;
    pageInfo.textContent = "Page 0 / 0";
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    return;
  }

  const previewMap = getNextUIDMap();
const list = filteredStudents.length ? filteredStudents : students;
const totalPages = Math.ceil(list.length / PAGE_SIZE);
const start = (page - 1) * PAGE_SIZE;
const slice = list.slice(start, start + PAGE_SIZE);


  slice.forEach((s, i) => {

    /* 🔥 NEW: decide what to show in DOB formatted column */
    const dobDisplay = isAlreadyDMY(s.DOB_DMY)
      ? `<span style="color:#00ff99;font-weight:700">OK</span>`
      : (s.DOB_DMY || formatDateDMY(s.DOB));

    table.innerHTML += `
      <tr>
        <td>${start + i + 1}</td>
        <td>${s.name || s.studentName || "-"}</td>

        <td>${s.DOB_DMY || "-"}</td>


        <td>${s.phone || "-"}</td>
        <td class="short-course">
  ${s.courseShort || getCourseShortName(s.department || s.course || "")}
</td>
        <td>${s.CourseYear || s.year || "-"}</td>

        <td>${formatDateDMY(s.DateofAdmission)}</td>

        <td class="${s.studentUID ? "uid" : "missing"}">
          ${s.studentUID || "-"}
        </td>

        <td class="actions">
  <button class="btn view" data-id="${s.id}">View</button>
  <button class="btn edit" data-id="${s.id}">Edit</button>
  <button class="btn delete" data-id="${s.id}">Delete</button>
</td>

      </tr>
    `;
  });

  pageInfo.textContent = `Page ${page} / ${totalPages}`;
  prevBtn.disabled = page === 1;
  nextBtn.disabled = page === totalPages;
}

/* ================= PAGINATION ================= */
prevBtn.onclick = () => {
  if (page > 1) {
    page--;
    render();
  }
};

nextBtn.onclick = () => {
  const totalPages = Math.ceil(students.length / PAGE_SIZE);
  if (page < totalPages) {
    page++;
    render();
  }
};

/* ================= GENERATE UNIQUE IDS ================= */
genBtn.onclick = async () => {

  if (!confirm(
    "Generate UNIQUE 6-digit IDs for students without ID?\nExisting data will NOT be modified."
  )) return;

  genBtn.disabled = true;
  genBtn.textContent = "Generating...";

  let max = 0;
  students.forEach(s => {
    if (s.studentUID && /^\d{6}$/.test(s.studentUID)) {
      max = Math.max(max, Number(s.studentUID));
    }
  });

  let generated = 0;

  for (const s of students) {
    if (s.studentUID) continue;

    const updates = {};
    max++;
    updates.studentUID = formatUID(max);
    updates.uidGeneratedAt = Date.now();

    // 🔥 NEW: Only update DOB if NOT already DD-MM-YYYY
    if (!isAlreadyDMY(s.DOB_DMY)) {
      const formattedDOB = formatDateDMY(s.DOB);
      if (formattedDOB !== "-") {
        updates.DOB_DMY = formattedDOB;
        updates.dobUpdatedAt = Date.now();
      }
    }

    await updateDoc(doc(db, "StudentsDetails", s.id), updates);
    Object.assign(s, updates);
    generated++;
  }

  genBtn.disabled = false;
  genBtn.textContent = "Generate Missing IDs";

  alert(`✅ ${generated} Student IDs generated`);
  render();
};

table.addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) return;

  if (btn.classList.contains("view")) {
    openStudentView(id);
  }

  if (btn.classList.contains("edit")) {
    alert("Edit coming soon for " + id);
  }

  if (btn.classList.contains("delete")) {
    alert("Delete is disabled for safety");
  }
});


/* ================= UPDATE DOB BUTTON ================= */
updateDobBtn.onclick = async () => {

  if (!confirm(
    "Update DOB to DD-MM-YYYY format?\nExisting formatted DOB will NOT be changed."
  )) return;

  updateDobBtn.disabled = true;
  updateDobBtn.textContent = "Updating DOB...";

  let updated = 0;

  for (const s of students) {

    if (!s.DOB) continue;

    // 🔥 NEW: skip if already correct
    if (isAlreadyDMY(s.DOB_DMY)) continue;

    const formattedDOB = formatDateDMY(s.DOB);
    if (formattedDOB === "-") continue;

    await updateDoc(
      doc(db, "StudentsDetails", s.id),
      {
        DOB_DMY: formattedDOB,
        dobUpdatedAt: Date.now()
      }
    );

    s.DOB_DMY = formattedDOB;
updated++;

/* 🔥 LIVE OK badge */
showLiveOK(s.id);

  }

  updateDobBtn.disabled = false;
  updateDobBtn.textContent = "Update DOB (DD-MM-YYYY)";

  alert(`✅ DOB updated for ${updated} students`);
  render();
};

function showLiveOK(studentId) {
  const rows = table.querySelectorAll("tr");

  rows.forEach(row => {
    const nameCell = row.cells[1];
    if (!nameCell) return;

    const student = students.find(s => (s.name || s.studentName) === nameCell.textContent);
    if (student && student.id === studentId) {
      row.cells[3].innerHTML = `<span class="ok-live">OK</span>`;
    }
  });
}

window.openStudentView = function(studentId) {
  const s = students.find(x => x.id === studentId);
  if (!s) return;

  document.getElementById("viewModal").style.display = "flex";

  document.getElementById("viewAvatar").textContent =
    (s.name || s.studentName || "?").charAt(0).toUpperCase();

  document.getElementById("viewName").textContent =
    s.name || s.studentName || "Unknown Student";

  document.getElementById("viewUID").textContent =
    "Student ID: " + (s.studentUID || "Not generated");

const grid = document.getElementById("viewGrid");

grid.innerHTML = `
<table class="view-table">


  <tbody>

  <tr>
  <th colspan="2" style="color:#00eaff;padding:8px;text-align:left">👤 Personal Info</th>
</tr>

<tr>
  <td colspan="2">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td>Phone</td>
        <td>${s.phone || "-"}</td>
        <td>Email</td>
        <td>${s.email || "-"}</td>
      </tr>
      <tr>
        <td>DOB</td>
        <td>${s.DOB_DMY || formatDateDMY(s.DOB)}</td>
        <td>Gender</td>
        <td>${s.gender || "-"}</td>
      </tr>
      <tr>
        <td>Blood Group</td>
        <td>${s.bloodGroup || "-"}</td>
        <td>Religion</td>
        <td>${s.religion || "-"}</td>
      </tr>
    </table>
  </td>
</tr>


<tr>
  <th colspan="2" style="color:#00eaff;padding:8px;text-align:left">👪 Family</th>
</tr>

<tr>
  <td colspan="2">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td>Father</td>
        <td>${s.father || "-"}</td>
        <td>Father Contact</td>
        <td>${s.FatherContact || "-"}</td>
      </tr>
      <tr>
        <td>Mother</td>
        <td>${s.mother || "-"}</td>
        <td>Guardian</td>
        <td>${s.Guardian || "-"}</td>
      </tr>
      <tr>
        <td>Guardian Contact</td>
        <td>${s.GuardianContact || "-"}</td>
        <td></td>
        <td></td>
      </tr>
    </table>
  </td>
</tr>


 <tr>
  <th colspan="2" style="color:#00eaff;padding:8px;text-align:left">🎓 Course</th>
</tr>

<tr>
  <td colspan="2">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td>Department</td>
        <td>${s.department || "-"}</td>
        <td>Session</td>
        <td>${s.CourseSession || "-"}</td>
      </tr>
      <tr>
        <td>Course Year</td>
        <td>${s.CourseYear || "-"}</td>
        <td>Quota</td>
        <td>${s.Quota || "-"}</td>
      </tr>
      <tr>
        <td>Campus</td>
        <td>${s.campus || "-"}</td>
        <td></td>
        <td></td>
      </tr>
    </table>
  </td>
</tr>


<tr>
  <th colspan="2" style="color:#00eaff;padding:8px;text-align:left">💰 Fees</th>
</tr>

<tr>
  <td>Total Fees</td>
  <td>₹${s.TotalFees || 0}</td>
</tr>

<tr>
  <td colspan="2">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td>Admission Fees</td>
        <td>₹${s.AdmissionFees || "-"}</td>
        <td>Semester 1</td>
        <td>₹${s.SemesterFee1 || "-"}</td>
      </tr>
      <tr>
        <td>Semester 2</td>
        <td>₹${s.SemesterFee2 || "-"}</td>
        <td>Semester 3</td>
        <td>₹${s.SemesterFee3 || "-"}</td>
      </tr>
      <tr>
        <td>Semester 4</td>
        <td>₹${s.SemesterFee4 || "-"}</td>
        <td>Semester 5</td>
        <td>₹${s.SemesterFee5 || "-"}</td>
      </tr>
      <tr>
        <td>Semester 6</td>
        <td>₹${s.SemesterFee6 || "-"}</td>
        <td></td>
        <td></td>
      </tr>
    </table>
  </td>
</tr>


<tr>
  <th colspan="2" style="color:#00eaff;padding:8px;text-align:left">🧑‍💼 Agent</th>
</tr>

<tr>
  <td colspan="2">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td>Agent Name</td>
        <td>${s.AgentName || "-"}</td>
        <td>Agent Type</td>
        <td>${s.AgentType || "-"}</td>
      </tr>
      <tr>
        <td>Agent Contact</td>
        <td>${s.AgentContact || "-"}</td>
        <td>Agent Amount</td>
        <td>₹${s.AgentAmount || "-"}</td>
      </tr>
    </table>
  </td>
</tr>


  <tr><th colspan="2" style="color:#00eaff;padding:8px;text-align:left">🏠 Address</th></tr>
  <tr><td>Permanent</td><td>
    ${s.PermanentCity || ""}, ${s.PermanentPost || ""}, ${s.PermanentPolice || ""}, ${s.PermanentDistrict || ""}, ${s.PermanentState || ""} - ${s.PermanentPin || ""}
  </td></tr>
  <tr><td>Present</td><td>
    ${s.PresentCity || ""}, ${s.PresentPost || ""}, ${s.PresentPolice || ""}, ${s.PresentDistrict || ""}, ${s.PresentState || ""} - ${s.PresentPin || ""}
  </td></tr>

 <!-- 🪪 Identity -->
<tr>
  <th colspan="2" style="color:#00eaff;padding:8px;text-align:left">🪪 Identity</th>
</tr>
<tr>
  <td colspan="2">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td>Aadhaar</td>
        <td>${s.aadhaar || "-"}</td>
        <td>Nationality</td>
        <td>${s.Nationality || "-"}</td>
      </tr>
      <tr>
        <td>Caste</td>
        <td>${s.caste || "-"}</td>
        <td></td>
        <td></td>
      </tr>
    </table>
  </td>
</tr>

<!-- 📚 Academics -->
<tr>
  <th colspan="2" style="color:#00eaff;padding:8px;text-align:left">📚 Academics</th>
</tr>
<tr>
  <td colspan="2">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td>Secondary</td>
        <td>${s.SecondaryBoard || "-"} (${s.SecondaryPassingYear || "-"})</td>
        <td>HS Board</td>
        <td>${s.HigherSecondaryBoard || "-"}</td>
      </tr>
      <tr>
        <td>Last Institute</td>
        <td>${s.LastInstitute || "-"}</td>
        <td></td>
        <td></td>
      </tr>
    </table>
  </td>
</tr>

<!-- 🧾 System -->
<tr>
  <th colspan="2" style="color:#00eaff;padding:8px;text-align:left">🧾 System</th>
</tr>
<tr>
  <td colspan="2">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td>Financial Year</td>
        <td>${s.FinancialYear || "-"}</td>
        <td>Student UID</td>
        <td>${s.studentUID || "-"}</td>
      </tr>
      <tr>
        <td>Remarks</td>
        <td>${s.Remarks || "-"}</td>
        <td>Student UID Generate</td>
        <td>${s.uidGeneratedAt}</td>
      </tr>
    </table>
  </td>
</tr>
  </tbody>
</table>
`;


};

window.closeView = function() {
  document.getElementById("viewModal").style.display = "none";
};

const searchInput = document.getElementById("searchInput");

searchInput.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase().trim();

  if (!q) {
    filteredStudents = students;
  } else {
    filteredStudents = students.filter(s =>
      (s.name || s.studentName || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q) ||
      (s.studentUID || "").includes(q)
    );
  }

  page = 1;
  render();
});

genBtn.onclick = () => {
  const tbody = document.getElementById("idFixTable");
  tbody.innerHTML = "";

  const previewMap = getNextUIDMap();

  students.forEach(s => {
    if (s.studentUID) return;

    tbody.innerHTML += `
      <tr>
        <td>${s.name || s.studentName}</td>
        <td class="missing">—</td>
        <td class="uid">${previewMap[s.id]}</td>
      </tr>
    `;
  });

  document.getElementById("idFixModal").style.display = "flex";
};


updateDobBtn.onclick = () => {
  const tbody = document.getElementById("dobFixTable");
  tbody.innerHTML = "";

  students.forEach(s => {
    if (!s.DOB || isAlreadyDMY(s.DOB_DMY)) return;

    const fixed = formatDateDMY(s.DOB);
    if (fixed === "-") return;

    tbody.innerHTML += `
      <tr>
      <td>${s.studentUID}</td>
        <td>${s.name || s.studentName}</td>
        <td>${s.DOB}</td>
        <td class="uid">${fixed}</td>
      </tr>
    `;
  });

  document.getElementById("dobFixModal").style.display = "flex";
};

window.closeFixModals = function () {
  document.getElementById("idFixModal").style.display = "none";
  document.getElementById("dobFixModal").style.display = "none";
};



function renderMobileCards(list) {
  const container = document.getElementById("mobileStudentList");
  if (!container) return;

  container.innerHTML = "";

  list.forEach((s, i) => {
    container.innerHTML += `
      <div class="mobile-card">
        <div class="mobile-header">
          <div class="mobile-name">
            ${startIndexName(i)} ${s.name || s.studentName || "Unknown"}
          </div>
          <div class="mobile-uid">
            ${s.studentUID || "—"}
          </div>
        </div>

        <div class="mobile-row">
          <span>DOB</span>
          <span>${s.DOB_DMY || formatDateDMY(s.DOB) || "-"}</span>
        </div>

        <div class="mobile-row">
          <span>Phone</span>
          <span>${s.phone || "-"}</span>
        </div>

        <div class="mobile-row">
          <span>Course</span>
          <span>${s.department || s.course || "-"}</span>
        </div>

        <div class="mobile-row">
          <span>Year</span>
          <span>${s.CourseYear || s.year || "-"}</span>
        </div>

        <div class="mobile-actions">
          <button onclick="openStudentView('${s.id}')">👁 View</button>
        </div>
      </div>
    `;
  });
}

/* helper for numbering */
function startIndexName(i) {
  return `<span style="opacity:.6;font-size:12px">#${i + 1}</span>`;
}


  // 📱 Mobile cards (render together with table)
  const mobileList = filteredStudents.length ? filteredStudents : students;
  renderMobileCards(mobileList);

async function getUserIP() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return data.ip || "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function getNowDateTime() {
  const d = new Date();
  return d.toISOString().replace("T", " ").substring(0, 19);
}

document.addEventListener("DOMContentLoaded", () => {

  const courseFixBtn = document.getElementById("courseFixBtn");
  const courseGenStatus = document.getElementById("courseGenStatus");
  const courseAlreadyEl = document.getElementById("courseAlready");
  const courseDoneEl = document.getElementById("courseDone");
  const coursePendingEl = document.getElementById("coursePending");

  // 🔐 Safety: page without course UI
  if (!courseFixBtn || !courseGenStatus || !courseAlreadyEl || !courseDoneEl || !coursePendingEl) {
    console.warn("Course ID UI not found – skipping course generator");
    return;
  }

  let isRunning = false; // ⛔ prevent double click
  const BATCH_LIMIT = 400; // Firestore safe limit (<500)

  courseFixBtn.onclick = async () => {

    if (isRunning) return;

    if (!confirm(
      "Generate Course IDs?\n\n• Only pending students will be updated\n• Existing Course IDs will NOT be touched"
    )) return;

    isRunning = true;
    courseFixBtn.disabled = true;
    courseFixBtn.textContent = "Initializing...";

    // ✅ Already generated
    const alreadyDone = students.filter(s => s.courseShort);

    // ✅ Pending students (sorted: latest admission first)
    const pendingStudents = students
      .filter(s => !s.courseShort && (s.department || s.course))
      .sort((a, b) => {
        return new Date(b.DateofAdmission || 0) - new Date(a.DateofAdmission || 0);
      });

    const totalPending = pendingStudents.length;

    courseGenStatus.style.display = "block";
    courseAlreadyEl.textContent = `Already Done: ${alreadyDone.length}`;
    courseDoneEl.textContent = `Prepared: 0 / ${totalPending}`;
    coursePendingEl.textContent = `Pending: ${totalPending}`;

    if (totalPending === 0) {
      alert("✅ All students already have Course IDs");
      courseFixBtn.disabled = false;
      courseFixBtn.textContent = "🎓 Generate Course IDs";
      isRunning = false;
      return;
    }

    courseFixBtn.textContent = "Preparing Course IDs...";

    const ip = await getUserIP();
    const dateTime = getNowDateTime();
    const ts = Date.now();

    let doneNow = 0;
    let pending = totalPending;

    // 🔥 BATCH + CHUNK PROCESSING
    for (let i = 0; i < pendingStudents.length; i += BATCH_LIMIT) {

      const batch = writeBatch(db);
      const chunk = pendingStudents.slice(i, i + BATCH_LIMIT);

      for (const s of chunk) {

        const short = getCourseShortName(s.department || s.course);
        if (!short) {
          pending--;
          continue;
        }

        batch.update(doc(db, "StudentsDetails", s.id), {
          courseShort: short,
          courseShortGeneratedAt: ts,
          courseShortGeneratedDate: dateTime,
          courseShortGeneratedIP: ip
        });

        // update local cache
        s.courseShort = short;
        s.courseShortGeneratedAt = ts;
        s.courseShortGeneratedDate = dateTime;
        s.courseShortGeneratedIP = ip;

        doneNow++;
        pending--;
      }

      // 🔥 LIVE UI UPDATE (per batch)
      courseDoneEl.textContent = `Prepared: ${doneNow} / ${totalPending}`;
      coursePendingEl.textContent = `Pending: ${pending}`;

      // ⚡ ONE NETWORK CALL
      await batch.commit();
    }

    // ✅ FINISH
    courseFixBtn.disabled = false;
    courseFixBtn.textContent = "🎓 Generate Course IDs";
    isRunning = false;

    courseDoneEl.textContent = `Done: ${doneNow} / ${totalPending}`;
    coursePendingEl.textContent = `Pending: 0`;

    alert(`✅ Course IDs generated for ${doneNow} students`);
    render();
  };
});

/* ================= INIT ================= */
loadStudents();