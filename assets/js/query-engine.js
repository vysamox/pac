/* ============================================================
   QUERY ENGINE — ENTERPRISE FIRESTORE SEARCH
   Indexed • Fast • Deep Link Safe • UCL Active + Deactive
============================================================ */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "./firebase-config.js";

const BASE_URL = "dm.html";

/* ================= UI ================= */
window.openQueryPanel = () => {
  document.getElementById("queryValue").value = "";
  document.getElementById("queryPanel").style.display = "flex";
};

window.closeQueryPanel = () => {
  document.getElementById("queryPanel").style.display = "none";
};

window.closeQueryResult = () => {
  document.getElementById("queryResultModal").style.display = "none";
  history.replaceState({}, "", BASE_URL);
};

/* ================= ENTRY ================= */
window.runQuery = async () => {

  const type = document.getElementById("queryType").value;
  const raw  = document.getElementById("queryValue").value.trim().toLowerCase();
  if (!raw) return alert("Enter search value");

  closeQueryPanel();

  if (type === "students") return searchStudents(raw);
  if (type === "pac")      return smartSearch("pac_entries", raw, "pac");
  if (type === "temp")     return exactDocSearch("temp_links", raw);
  if (type === "ucl")      return searchUclSmart(raw);
};

/* ================= STUDENT SEARCH ================= */
async function searchStudents(key) {

  // Exact student ID
  const exact = await getDoc(doc(db, "StudentsDetails", key));
  if (exact.exists()) {
    return renderSingleResult("students", key, exact.data());
  }

  // Token search
  const q = query(
    collection(db, "StudentsDetails"),
    where("search.tokens", "array-contains", key)
  );

  const snap = await getDocs(q);
  const results = [];

  snap.forEach(d => {
    const s = d.data();
    results.push({
      id: d.id,
      label: s.name || s.studentName || s.phone || s.studentUID || d.id,
      ...s
    });
  });

  renderListResult("students", results);
}

/* ================= GENERIC SMART SEARCH ================= */
async function smartSearch(col, key, type) {

  const exact = await getDoc(doc(db, col, key));
  if (exact.exists()) {
    return renderSingleResult(type, key, exact.data());
  }

  const q = query(
    collection(db, col),
    where("search.tokens", "array-contains", key)
  );

  const snap = await getDocs(q);
  const results = [];

  snap.forEach(d => {
    const data = d.data();
    results.push({
      id: d.id,
      label: data.name || data.pacNo || data.phone || d.id,
      ...data
    });
  });

  renderListResult(type, results);
}

/* ================= UCL SEARCH ================= */
async function searchUclSmart(key) {

  for (const col of ["ucl_owners", "ucl_owners_deactive"]) {

    const exact = await getDoc(doc(db, col, key));
    if (exact.exists()) {
      return renderSingleResult("ucl", key, {
        status: col === "ucl_owners" ? "ACTIVE" : "DEACTIVE",
        ...exact.data()
      });
    }

    const q = query(
      collection(db, col),
      where("search.tokens", "array-contains", key)
    );

    const snap = await getDocs(q);
    if (!snap.empty) {
      const results = [];
      snap.forEach(d => {
        results.push({
          id: d.id,
          label: d.data().name || d.data().phone || d.id,
          status: col === "ucl_owners" ? "ACTIVE" : "DEACTIVE",
          ...d.data()
        });
      });
      return renderListResult("ucl", results);
    }
  }

  renderNotFound();
}

/* ================= EXACT LOOKUP ================= */
async function exactDocSearch(col, id) {
  const snap = await getDoc(doc(db, col, id));
  if (!snap.exists()) return renderNotFound();
  renderSingleResult(col, id, snap.data());
}

/* ================= RENDER ================= */
function renderSingleResult(type, id, data) {

  history.pushState({ query:true }, "", `${BASE_URL}?query=1&type=${type}&id=${id}`);

  let html = `
    <div class="group"><span class="lbl">Type</span><span class="val">${type}</span></div>
    <div class="group"><span class="lbl">ID</span><span class="val mono">${id}</span></div>
    <hr class="sep">
  `;

  Object.entries(data).forEach(([k,v]) => {
    html += `
      <div class="group">
        <span class="lbl">${k}</span>
        <span class="val mono">${JSON.stringify(v)}</span>
      </div>`;
  });

  showResult(html);
}

function renderListResult(type, list) {
  if (!list.length) return renderNotFound();

  history.pushState({ query:true }, "", `${BASE_URL}?query=1&type=${type}&search=1`);

  let html = `
    <div class="group">
      <span class="lbl">Results</span>
      <span class="val highlight">${list.length}</span>
    </div>
    <hr class="sep">
  `;

  list.forEach(item => {
    html += `
      <div class="group">
        <span class="lbl">${item.label}</span>
        <span class="val mono">${item.id}</span>
      </div>`;
  });

  showResult(html);
}

function renderNotFound() {
  showResult(`<b style="color:#ff6666">No matching records found</b>`);
}

function showResult(html) {
  document.getElementById("queryResultBody").innerHTML = html;
  document.getElementById("queryResultModal").style.display = "flex";
}

/* ================= URL RESTORE ================= */
document.addEventListener("DOMContentLoaded", () => {
  const p = new URLSearchParams(location.search);
  if (p.get("query") !== "1") return;

  const type = p.get("type");
  const id   = p.get("id");

  if (!id) return;

  if (type === "students") exactDocSearch("StudentsDetails", id);
  if (type === "pac") exactDocSearch("pac_entries", id);
  if (type === "temp") exactDocSearch("temp_links", id);
  if (type === "ucl") {
    exactDocSearch("ucl_owners", id);
    exactDocSearch("ucl_owners_deactive", id);
  }
});

/* ================= BACK ================= */
window.addEventListener("popstate", () => {
  document.getElementById("queryResultModal").style.display = "none";
});
