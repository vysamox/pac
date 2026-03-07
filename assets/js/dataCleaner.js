const INVALID_VALUES = ["", "na", "n/a", "null", "none", "-", "--"];


/* ===============================
   EMAIL CLEANER
================================ */
export function cleanEmail(email) {

  if (!email) return "Not Available";

  let value = String(email).trim().toLowerCase();

  if (INVALID_VALUES.includes(value)) {
    return "Not Available";
  }

  // Remove spaces
  value = value.replace(/\s+/g, "");

  // Strong email validation
  const emailPattern =
    /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

  if (!emailPattern.test(value)) {
    return "Not Available";
  }

  // Prevent domains like a@a
  const domain = value.split("@")[1];
  if (!domain.includes(".")) {
    return "Not Available";
  }

  return value;
}


/* ===============================
   PHONE CLEANER
================================ */
export function cleanPhone(phone) {

  if (!phone) return 0;

  let value = phone;

  // Convert Excel numeric value
  if (typeof value === "number") {
    value = value.toString();
  }

  value = String(value).trim().toLowerCase();

  if (INVALID_VALUES.includes(value)) {
    return 0;
  }

  // Handle Excel scientific notation
  if (value.includes("e+") || value.includes("E+")) {
    value = Number(value).toFixed(0);
  }

  // Remove all non-digits
  let digits = value.replace(/\D/g, "");

  // Remove +91
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }

  // Remove 0091
  if (digits.length === 13 && digits.startsWith("0091")) {
    digits = digits.slice(4);
  }

  // Must be exactly 10 digits
  if (digits.length !== 10) {
    return 0;
  }

  return digits;
}