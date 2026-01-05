/* ============================================================
   STUDENTS MONITOR — ADVANCED PAGINATED MODULE (SAFE DELETE)
   Collection: StudentsDetails
   Trash: StudentsTrash
============================================================ */

import {
  db,
  collection,
  doc,
  onSnapshot,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  startAfter
} from "./firebase-config.js";

/* ============================================================
   CONFIG
============================================================ */
const PAGE_SIZE = 10;

let lastVisibleDoc = null;
let firstVisibleDoc = null;
let pageStack = [];
let currentPage = 1;

/* ============================================================
   LIVE STUDENT COUNT
============================================================ */
const studentCountEl = document.getElementById("studentCount");

onSnapshot(collection(db, "StudentsDetails"), snap => {
  if (studentCountEl) studentCountEl.textContent = snap.size;

  if (snap.size > 500 && snap.size <= 1000) {
    notify("Student count crossed 500", "warn");
  }
  if (snap.size > 1000) {
    notify("High student volume detected!", "error");
  }
});

/* ============================================================
   LOAD STUDENTS (PAGINATED)
============================================================ */
async function loadStudentsPage(direction = "init") {
  const body = document.getElementById("studentTableBody");
  const pageInfo = document.getElementById("studentPageInfo");
  const prevBtn = document.getElementById("prevStudentsBtn");
  const nextBtn = document.getElementById("nextStudentsBtn");

  if (!body) return;

  body.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;

  try {
    let q = query(
      collection(db, "StudentsDetails"),
      orderBy("DateofAdmission", "desc"),
      limit(PAGE_SIZE)
    );

    if (direction === "next" && lastVisibleDoc) {
      pageStack.push(firstVisibleDoc);
      q = query(q, startAfter(lastVisibleDoc));
      currentPage++;
    }

    if (direction === "prev") {
      const prevCursor = pageStack.pop();
      if (prevCursor) {
        q = query(
          collection(db, "StudentsDetails"),
          orderBy("DateofAdmission", "desc"),
          startAfter(prevCursor),
          limit(PAGE_SIZE)
        );
        currentPage--;
      }
    }

    const snap = await getDocs(q);
    body.innerHTML = "";

    if (snap.empty) {
      body.innerHTML = `<tr><td colspan="5">No students found</td></tr>`;
      nextBtn.disabled = true;
      return;
    }

    firstVisibleDoc = snap.docs[0];
    lastVisibleDoc = snap.docs[snap.docs.length - 1];

    snap.forEach(docItem => {
      const d = docItem.data();

      body.innerHTML += `
<tr>
  <td data-label="Name">${d.name || d.Name || "-"}</td>
  <td data-label="Course">${d.department || d.Course || "-"}</td>
  <td data-label="Year">${d.CourseYear || "-"}</td>
  <td data-label="DOB">${d.DOB || "-"}</td>

  <td data-label="Action" style="text-align:center;">
    <button class="ucl-view-btn" title="View" onclick="viewStudent('${docItem.id}')">
      <i class="fa-solid fa-eye"></i>
    </button>

    <button class="ucl-view-btn" title="Edit" onclick="editStudent('${docItem.id}')">
      <i class="fa-solid fa-pen"></i>
    </button>

    <button class="ucl-view-btn" title="Delete" onclick="deleteStudent('${docItem.id}')">
      <i class="fa-solid fa-trash"></i>
    </button>
  </td>
</tr>
`;
    });

    pageInfo.textContent = `Page ${currentPage}`;
    prevBtn.disabled = pageStack.length === 0;
    nextBtn.disabled = snap.size < PAGE_SIZE;

  } catch (err) {
    console.error(err);
    notify("Failed to load students", "error");
  }
}

/* ============================================================
   MODAL OPEN / CLOSE
============================================================ */
window.openStudentModal = async function () {
  const modal = document.getElementById("studentModal");
  if (!modal) return;

  modal.style.display = "flex";

  lastVisibleDoc = null;
  firstVisibleDoc = null;
  pageStack = [];
  currentPage = 1;

  await loadStudentsPage("init");
};

window.closeStudentModal = function () {
  const modal = document.getElementById("studentModal");
  if (modal) modal.style.display = "none";
};

/* ============================================================
   PAGINATION EVENTS
============================================================ */
document.getElementById("nextStudentsBtn")
  ?.addEventListener("click", () => loadStudentsPage("next"));

document.getElementById("prevStudentsBtn")
  ?.addEventListener("click", () => loadStudentsPage("prev"));

/* ============================================================
   VIEW STUDENT (FULL DETAILS)
============================================================ */
window.viewStudent = async function (id) {
  const modal = document.getElementById("studentViewModal");
  const body = document.getElementById("studentViewBody");

  modal.style.display = "flex";
  body.innerHTML = "Loading…";

  const snap = await getDoc(doc(db, "StudentsDetails", id));
  if (!snap.exists()) {
    body.innerHTML = "Student not found";
    return;
  }

  const d = snap.data();

  body.innerHTML = `

<!-- ================= BASIC INFO ================= -->
<h4 class="sv-title">Basic Information</h4>
<table class="sv-table">
<tr><td>Name</td><td>${d.name}</td></tr>
<tr><td>Gender</td><td>${d.gender}</td></tr>
<tr><td>DOB</td><td>${d.DOB}</td></tr>
<tr><td>Blood Group</td><td>${d.bloodGroup}</td></tr>
<tr><td>Religion</td><td>${d.religion}</td></tr>
<tr><td>Caste</td><td>${d.caste}</td></tr>
<tr><td>Nationality</td><td>${d.Nationality}</td></tr>
<tr><td>Relationship</td><td>${d.relationship}</td></tr>
</table>

<!-- ================= CONTACT ================= -->
<h4 class="sv-title">Contact Details</h4>
<table class="sv-table">
<tr><td>Phone</td><td>${d.phone}</td></tr>
<tr><td>Email</td><td>${d.email}</td></tr>
<tr><td>Aadhaar</td><td>${d.aadhaar}</td></tr>
</table>

<!-- ================= ADMISSION ================= -->
<h4 class="sv-title">Admission Details</h4>
<table class="sv-table">
<tr><td>Course</td><td>${d.department}</td></tr>
<tr><td>Course Session</td><td>${d.CourseSession}</td></tr>
<tr><td>Course Year</td><td>${d.CourseYear}</td></tr>
<tr><td>Date of Admission</td><td>${d.DateofAdmission}</td></tr>
<tr><td>Campus</td><td>${d.campus}</td></tr>
<tr><td>Quota</td><td>${d.Quota}</td></tr>
<tr><td>Course Quota</td><td>${d.courseQuota}</td></tr>
<tr><td>Financial Year</td><td>${d.FinancialYear}</td></tr>
</table>

<!-- ================= FEES ================= -->
<h4 class="sv-title">Fee Structure</h4>
<table class="sv-table">
<tr><td>Admission Fees</td><td>₹${d.AdmissionFees || 14000}</td></tr>
<tr><td>Total Fees</td><td>₹${d.TotalFees}</td></tr>
<tr><td>Semester 1</td><td>₹${d.SemesterFee1}</td></tr>
<tr><td>Semester 2</td><td>₹${d.SemesterFee2}</td></tr>
<tr><td>Semester 3</td><td>₹${d.SemesterFee3}</td></tr>
<tr><td>Semester 4</td><td>₹${d.SemesterFee4}</td></tr>
<tr><td>Semester 5</td><td>₹${d.SemesterFee5}</td></tr>
<tr><td>Semester 6</td><td>₹${d.SemesterFee6}</td></tr>
</table>

<!-- ================= FAMILY ================= -->
<h4 class="sv-title">Family Details</h4>
<table class="sv-table">
<tr><td>Father</td><td>${d.father} (${d.FatherContact})</td></tr>
<tr><td>Mother</td><td>${d.mother}</td></tr>
<tr><td>Guardian</td><td>${d.Guardian} (${d.GuardianContact})</td></tr>
</table>

<!-- ================= AGENT ================= -->
<h4 class="sv-title">Agent Details</h4>
<table class="sv-table">
<tr><td>Agent Name</td><td>${d.AgentName}</td></tr>
<tr><td>Agent Type</td><td>${d.AgentType}</td></tr>
<tr><td>Agent Contact</td><td>${d.AgentContact}</td></tr>
<tr><td>Agent Amount</td><td>₹${d.AgentAmount}</td></tr>
</table>

<!-- ================= ADDRESS ================= -->
<h4 class="sv-title">Permanent Address</h4>
<table class="sv-table">
<tr><td>Address</td><td>
${d.PermanentCity}, ${d.PermanentPost}, ${d.PermanentPolice},
${d.PermanentDistrict}, ${d.PermanentState} - ${d.PermanentPin}
</td></tr>
</table>

<h4 class="sv-title">Present Address</h4>
<table class="sv-table">
<tr><td>Address</td><td>
${d.PresentCity}, ${d.PresentPost}, ${d.PresentPolice},
${d.PresentDistrict}, ${d.PresentState} - ${d.PresentPin}
</td></tr>
</table>

<!-- ================= EDUCATION ================= -->
<h4 class="sv-title">Academic Details</h4>
<table class="sv-table">
<tr><td>Secondary Board</td><td>${d.SecondaryBoard}</td></tr>
<tr><td>Secondary Year</td><td>${d.SecondaryPassingYear}</td></tr>
<tr><td>Secondary %</td><td>${d.SecondaryPercentage}</td></tr>
<tr><td>HS Board</td><td>${d.HigherSecondaryBoard}</td></tr>
<tr><td>HS Year</td><td>${d.HigherSecondaryPassinhYear}</td></tr>
<tr><td>Last Institute</td><td>${d.LastInstitute}</td></tr>
</table>

<!-- ================= OTHER ================= -->
<h4 class="sv-title">Other Information</h4>
<table class="sv-table">
<tr><td>Remarks</td><td>${d.Remarks}</td></tr>
<tr><td>Added On</td><td>${d.addedOn}</td></tr>
</table>
`;

};

window.closeStudentView = function () {
  document.getElementById("studentViewModal").style.display = "none";
};

/* ============================================================
   EDIT STUDENT (READY HOOK)
============================================================ */
window.editStudent = function (id) {
  alert("Edit module ready.\nStudent ID: " + id);
};

/* ============================================================
   DELETE STUDENT (ADVANCED → TRASH)
============================================================ */
window.deleteStudent = async function (id) {
  const ok = confirm(
    "This will move the student to TRASH.\nYou can restore later.\n\nContinue?"
  );
  if (!ok) return;

  try {
    const ref = doc(db, "StudentsDetails", id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("Student not found");
      return;
    }

    const data = snap.data();

    // 🔥 MOVE TO TRASH
    await setDoc(doc(db, "StudentsTrash", id), {
      ...data,
      originalId: id,
      deletedAt: Date.now(),
      deletedBy: "admin"
    });

    // ❌ REMOVE FROM MAIN
    await deleteDoc(ref);

    notify("Student moved to trash", "success");

    // Refresh page
    await loadStudentsPage("init");

  } catch (err) {
    console.error(err);
    notify("Failed to delete student", "error");
  }
};
