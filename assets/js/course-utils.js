/* ============================================================
   COURSE UTILS
============================================================ */

export const COURSE_MAP = [
  { match: ["electronics", "telecommunication"], code: "ETC" },
  { match: ["electronics", "communication"], code: "ECE" },

  { match: ["computer", "science", "technology"], code: "CST" },
  { match: ["computer", "science"], code: "CSE" },

  { match: ["civil"], code: "CE" },
  { match: ["mechanical"], code: "ME" },
  { match: ["electrical"], code: "EE" },
  { match: ["information", "technology"], code: "IT" },

  { match: ["artificial", "intelligence"], code: "AI" },
  { match: ["data", "science"], code: "DS" },

  { match: ["polytechnic"], code: "POLY" }
];

export function getCourseShortName(course = "") {
  if (!course) return "-";

  const c = course.toLowerCase().replace(/&/g, "and");

  for (const rule of COURSE_MAP) {
    if (rule.match.every(w => c.includes(w))) {
      return rule.code;
    }
  }

  return course
    .replace(/&/g, "")
    .split(/\s+/)
    .map(w => w[0])
    .join("")
    .substring(0, 4)
    .toUpperCase();
}
