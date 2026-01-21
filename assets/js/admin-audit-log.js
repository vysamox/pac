import {
  db,
  collection,
  addDoc,
  serverTimestamp
} from "./firebase-config.js";

/* ============================
   SESSION ID (1 per load)
============================ */
const ADMIN_SESSION_ID =
  window.ADMIN_SESSION_ID ||
  (window.ADMIN_SESSION_ID =
    "AS-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

/* ============================
   MAIN LOGGER
============================ */
export async function logAdminAction({
  action,                    // REQUIRED
  module,                    // REQUIRED

  targetId = "-",
  description = "",

  before = null,
  after = null,

  severity = "MEDIUM",        // LOW | MEDIUM | HIGH | CRITICAL
  status = "SUCCESS",         // SUCCESS | FAILED

  durationMs = null           // optional performance metric
}) {
  try {
    await addDoc(collection(db, "admin_logs"), {

      /* CORE INFO */
      action,
      module,
      targetId,
      description,

      /* CHANGE SNAPSHOT */
      before,
      after,

      /* EXECUTION CONTEXT */
      severity,
      status,
      durationMs,

      /* ADMIN INFO */
      performedBy: "admin",          // replace with auth.uid later
      role: "admin",
      sessionId: ADMIN_SESSION_ID,

      /* ENVIRONMENT */
      ip: window.userIP || "unknown",
      device: navigator.userAgent,
      page: location.pathname,

      /* VERSION TRACE */
      appVersion: window.APP_VERSION || "v0.0.0",
      build: window.APP_BUILD || "0",

      /* TIMESTAMPS */
      createdAt: serverTimestamp(),
      createdAtReadable: new Date().toISOString()

    });
  } catch (err) {
    console.error("❌ Admin log failed:", err);

    // 🔴 Fallback local log (optional)
    console.warn("AUDIT LOG DATA LOST:", {
      action,
      module,
      targetId,
      description
    });
  }
}
