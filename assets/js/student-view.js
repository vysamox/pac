// ================= STUDENT VIEW MODULE =================
import { db, doc, getDoc } from "./firebase-config.js";

const modal = document.createElement("div");
modal.className = "view-modal";
modal.innerHTML = `
  <div class="view-card">
    <div class="view-header">
      <div class="avatar">🎓</div>
      <div>
        <h2 id="viewName">Student</h2>
        <div class="view-sub" id="viewUID">UID</div>
      </div>
    </div>

    <div class="view-grid" id="viewBody"></div>

    <button id="closeView">Close</button>
  </div>
`;

document.body.appendChild(modal);

document.getElementById("closeView").onclick = () => {
  modal.style.display = "none";
};

export async function openStudentView(studentId) {
  const snap = await getDoc(doc(db, "StudentsDetails", studentId));
  if (!snap.exists()) return alert("Student not found");

  const s = snap.data();

  document.getElementById("viewName").textContent =
    s.name || s.studentName || "Student";

  document.getElementById("viewUID").textContent =
    "ID: " + (s.studentUID || "Not Assigned");

  document.getElementById("viewBody").innerHTML = `
    <div><span>Phone</span>${s.phone || "-"}</div>
    <div><span>DOB</span>${s.DOB_DMY || "-"}</div>
    <div><span>Course</span>${s.department || s.course || "-"}</div>
    <div><span>Year</span>${s.CourseYear || s.year || "-"}</div>
    <div><span>Admission</span>${s.DateofAdmission || "-"}</div>
    <div><span>Email</span>${s.email || "-"}</div>
    <div><span>Gender</span>${s.gender || "-"}</div>
    <div><span>Address</span>${s.address || "-"}</div>
    <div><span>Doc ID</span>${studentId}</div>
  `;

  modal.style.display = "flex";
}
