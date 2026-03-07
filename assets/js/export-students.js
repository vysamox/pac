// export-students.js

export function exportStudentsToExcel(students, options = {}) {

  if (!students || !students.length) {
    alert("No data to export.");
    return;
  }

  /* ================= OPTIONS ================= */

  const {
    onlyColumns = null,
    excludeColumns = ["uidGeneratedAt", "dobUpdatedAt"],
    sortBy = null,
    sortDirection = "asc"
  } = options;

  /* ================= SORT ================= */

  let workingData = [...students];

  if (sortBy) {
    workingData.sort((a, b) => {
      const valA = String(a[sortBy] || "").toLowerCase();
      const valB = String(b[sortBy] || "").toLowerCase();

      return sortDirection === "desc"
        ? valB.localeCompare(valA)
        : valA.localeCompare(valB);
    });
  }

  /* ================= UTIL FUNCTIONS ================= */

  function excelSerialToDate(serial) {
    if (typeof serial !== "number") return serial;

    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);

    const day   = String(date_info.getDate()).padStart(2, "0");
    const month = String(date_info.getMonth() + 1).padStart(2, "0");
    const year  = date_info.getFullYear();

    return `${day}-${month}-${year}`;
  }

  function convertValue(value) {

    if (value === null || value === undefined) return "";

    // Firestore Timestamp
    if (value?.toDate) {
      const d = value.toDate();
      return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
    }

    // Excel serial date
    if (typeof value === "number" && value > 20000 && value < 60000) {
      return excelSerialToDate(value);
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function beautifyHeader(key) {
    return key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, c => c.toUpperCase());
  }

  /* ================= PREPARE DATA ================= */

  const exportData = workingData.map((student, index) => {

    const cleanRow = {};
    cleanRow["Sl No"] = index + 1;

    Object.keys(student).forEach(key => {

      if (key === "id") return;
      if (excludeColumns.includes(key)) return;
      if (onlyColumns && !onlyColumns.includes(key)) return;

      cleanRow[beautifyHeader(key)] = convertValue(student[key]);
    });

    return cleanRow;
  });

  if (!exportData.length) {
    alert("No matching data to export.");
    return;
  }

  /* ================= CREATE EXCEL ================= */

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook  = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Students");

  /* ================= AUTO COLUMN WIDTH ================= */

  worksheet["!cols"] = Object.keys(exportData[0]).map(key => ({
    wch: Math.max(
      key.length,
      ...exportData.map(row => String(row[key] ?? "").length)
    )
  }));

  /* ================= FORCE TEXT FORMAT ================= */

  Object.keys(worksheet).forEach(cell => {
    if (cell[0] === "!") return;
    worksheet[cell].t = "s";
  });

  /* ================= DOWNLOAD ================= */

  function generateDownloadName() {

    const now = new Date();

    const day   = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year  = now.getFullYear();

    const hours   = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const ms      = String(now.getMilliseconds()).padStart(3, "0");

    return `Download_${day}-${month}-${year}_${hours}.${minutes}.${seconds}.${ms}.xlsx`;
  }

  const downloadName = generateDownloadName();

  XLSX.writeFile(workbook, downloadName);

} // ✅ FUNCTION CLOSED PROPERLY