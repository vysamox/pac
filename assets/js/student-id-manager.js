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



/* ================= CONFIG ================= */
const PAGE_SIZE = 15;

/* ================= STATE ================= */
let students = [];
let page = 1;

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
  const totalPages = Math.ceil(students.length / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE;
  const slice = students.slice(start, start + PAGE_SIZE);

  slice.forEach((s, i) => {

    /* 🔥 NEW: decide what to show in DOB formatted column */
    const dobDisplay = isAlreadyDMY(s.DOB_DMY)
      ? `<span style="color:#00ff99;font-weight:700">OK</span>`
      : (s.DOB_DMY || formatDateDMY(s.DOB));

    table.innerHTML += `
      <tr>
        <td>${start + i + 1}</td>
        <td>${s.name || s.studentName || "-"}</td>

        <td>${s.DOB || "-"}</td>
        <td>${dobDisplay}</td>

        <td>${s.phone || "-"}</td>
        <td>${s.department || s.course || "-"}</td>
        <td>${s.CourseYear || s.year || "-"}</td>

        <td>${formatDateDMY(s.DateofAdmission)}</td>

        <td class="${s.studentUID ? "uid" : "missing"}">
          ${s.studentUID || "-"}
        </td>

        <td class="uid-preview">
          ${s.studentUID ? "—" : previewMap[s.id]}
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

// ---------- Attach row action handlers ----------
document.querySelectorAll(".btn.view").forEach(btn => {
  btn.onclick = () => openStudentView(btn.dataset.id);
});

document.querySelectorAll(".btn.edit").forEach(btn => {
  btn.onclick = () => alert("Edit coming soon for " + btn.dataset.id);
});

document.querySelectorAll(".btn.delete").forEach(btn => {
  btn.onclick = () => alert("Delete is disabled for safety");
});


/* ================= INIT ================= */
loadStudents();
