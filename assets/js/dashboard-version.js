import { db, doc, onSnapshot } from "./firebase-config.js";

/* -------------------------------------------
   Helpers
-------------------------------------------- */
function timeAgo(ts) {
  const diff = Date.now() - ts;
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
  switch (env) {
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

  // Fallback if offline
  el.textContent = "Dashboard loading version…";

  onSnapshot(ref, snap => {
    if (!snap.exists()) {
      el.textContent = "Dashboard version unavailable";
      return;
    }

    const v = snap.data();

    const buildDate = v.buildTime
      ? new Date(v.buildTime)
      : null;

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

    const relative = buildDate
      ? timeAgo(v.buildTime)
      : "";

    const env = envBadge(v.env || "PROD");

    el.textContent =
      `Dashboard v${v.version} ` +
      `• Build #${v.buildNumber} ` +
      `• Updated ${formattedDate} (${relative}) ` +
      `• ${env}`;

    // Tooltip with raw timestamp
    if (buildDate) {
      el.title = `Build Time: ${buildDate.toISOString()}`;
    }
  });
}
