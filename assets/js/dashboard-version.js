import { db, doc, onSnapshot } from "./firebase-config.js";

/* -------------------------------------------
   Helpers
-------------------------------------------- */
function timeAgo(ts) {
  if (!ts) return "";

  const diff = Date.now() - ts;
  if (diff < 0) return "just now";

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;

  const mins = Math.floor(sec / 60);
  if (mins < 60) return `${mins} min ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;

  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function envBadge(env) {
  switch ((env || "").toUpperCase()) {
    case "DEV": return "🟡 DEV";
    case "TEST": return "🟠 TEST";
    default: return "🟢 PROD";
  }
}

/* -------------------------------------------
   MAIN
-------------------------------------------- */
export function loadDashboardVersion() {
  const el = document.querySelector(".dashboard-version");
  if (!el) return;

  const ref = doc(db, "system", "version");
  el.textContent = "Dashboard loading version…";

  onSnapshot(ref, snap => {
    if (!snap.exists()) {
      el.textContent = "Dashboard version unavailable";
      return;
    }

    const v = snap.data() || {};

    const version = v.version || "0.0.0";
    const buildNumber = Number.isFinite(v.buildNumber)
      ? v.buildNumber
      : "—";

    // ✅ FIX: support Firestore Timestamp + number
    let buildTime = null;
    if (typeof v.buildTime === "number") {
      buildTime = v.buildTime;
    } else if (v.buildTime?.toMillis) {
      buildTime = v.buildTime.toMillis();
    }

    const buildDate = buildTime ? new Date(buildTime) : null;

    const formattedDate = buildDate
      ? buildDate.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        })
      : "—";

    const relative = buildTime ? timeAgo(buildTime) : "";
    const env = envBadge(v.env);

    el.textContent =
      `Dashboard v${version} ` +
      `• Build #${buildNumber} ` +
      `• Updated ${formattedDate}` +
      (relative ? ` (${relative})` : "") +
      ` • ${env}`;

    el.title = buildDate
      ? `Build Time: ${buildDate.toISOString()}`
      : "";
  });
}
