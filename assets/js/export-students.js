// export-students.js

export function exportStudentsToExcel(students, options = {}) {

  if (!students || !students.length) {
    alert("No data to export.");
    return;
  }

  /* ================= OPTIONS ================= */

  const {
    onlyColumns = null,
    excludeColumns = ["uidGeneratedAt","dobUpdatedAt"],
    sortBy = null,
    sortDirection = "asc",
    fileNamePrefix = "Students_Export"
  } = options;

  let workingData = [...students];

  /* ================= SORT ================= */

  if (sortBy) {
    workingData.sort((a,b) => {

      const valA = String(a[sortBy] || "").toLowerCase();
      const valB = String(b[sortBy] || "").toLowerCase();

      if (sortDirection === "desc") {
        return valB.localeCompare(valA);
      }

      return valA.localeCompare(valB);

    });
  }

  /* ================= UTIL FUNCTIONS ================= */

  function formatDate(d){

    const day = String(d.getDate()).padStart(2,"0");
    const month = String(d.getMonth()+1).padStart(2,"0");
    const year = d.getFullYear();

    return `${day}-${month}-${year}`;

  }

  function excelSerialToDate(serial){

    if(typeof serial !== "number") return serial;

    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;

    const date_info = new Date(utc_value * 1000);

    return formatDate(date_info);

  }

  function convertValue(value){

  if(value === null || value === undefined) return "";

  // Firestore Timestamp
  if(value?.toDate){
    const d = value.toDate();
    const day = String(d.getDate()).padStart(2,"0");
    const month = String(d.getMonth()+1).padStart(2,"0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  // Keep numbers safe (fees, phone numbers, ids)
  if(typeof value === "number"){
    return value;
  }

  if(typeof value === "object"){
    return "";
  }

  return String(value);
}

  function beautifyHeader(key){

    return key
      .replace(/_/g," ")
      .replace(/([A-Z])/g," $1")
      .replace(/\s+/g," ")
      .trim()
      .replace(/^./,c => c.toUpperCase());

  }

  /* ================= PREPARE DATA ================= */

  const exportData = workingData.map((student,index) => {

    const cleanRow = {};

    cleanRow["Sl No"] = index + 1;

    Object.keys(student).forEach(key => {

      if(key === "id") return;
      if(excludeColumns.includes(key)) return;
      if(onlyColumns && !onlyColumns.includes(key)) return;

      const header = beautifyHeader(key);

      cleanRow[header] = convertValue(student[key]);

    });

    return cleanRow;

  });

  if(!exportData.length){
    alert("No matching data to export.");
    return;
  }

  /* ================= CREATE SHEET ================= */

  const worksheet = XLSX.utils.json_to_sheet(exportData);

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook,worksheet,"Students");

  /* ================= AUTO COLUMN WIDTH ================= */

  const columnWidths = Object.keys(exportData[0]).map(key => {

    const maxLength = Math.max(
      key.length,
      ...exportData.map(row => String(row[key] || "").length)
    );

    return { wch: maxLength + 2 };

  });

  worksheet["!cols"] = columnWidths;

  /* ================= FREEZE HEADER ================= */

  worksheet["!freeze"] = { xSplit:0, ySplit:1 };

  /* ================= FILTER ENABLE ================= */

  const range = XLSX.utils.decode_range(worksheet["!ref"]);

  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range(range)
  };

  /* ================= GENERATE FILE NAME ================= */

  function generateFileName(){

    const now = new Date();

    const day = String(now.getDate()).padStart(2,"0");
    const month = String(now.getMonth()+1).padStart(2,"0");
    const year = now.getFullYear();

    const hour = String(now.getHours()).padStart(2,"0");
    const minute = String(now.getMinutes()).padStart(2,"0");

    return `${fileNamePrefix}_${day}-${month}-${year}_${hour}-${minute}.xlsx`;

  }

  const fileName = generateFileName();

  /* ================= DOWNLOAD ================= */

  XLSX.writeFile(workbook,fileName);

}