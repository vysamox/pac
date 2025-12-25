/* ============================================================
   SYSTEM UPTIME MODULE
   Tracks dashboard runtime since page load
============================================================ */

// 🔥 Store restart time ONCE per session
if (!sessionStorage.getItem("systemRestartTime")) {
  sessionStorage.setItem("systemRestartTime", Date.now());
}

const systemStartTime = Number(sessionStorage.getItem("systemRestartTime"));

const uptimeEl = document.getElementById("systemUptime");
const restartEl = document.getElementById("lastRestartTime");

// Format restart time
function formatRestartTime(ts) {
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

// Show last restart time once
if (restartEl) {
  restartEl.textContent = formatRestartTime(systemStartTime);
}

function updateSystemUptime() {
  const now = Date.now();
  let diff = Math.floor((now - systemStartTime) / 1000);

  const days = Math.floor(diff / 86400);
  diff %= 86400;

  const hours = Math.floor(diff / 3600);
  diff %= 3600;

  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;

  let uptime = "";

  if (days > 0) uptime += `${days}d `;
  if (hours > 0 || days > 0) uptime += `${hours}h `;
  if (minutes > 0 || hours > 0) uptime += `${minutes}m `;
  uptime += `${seconds}s`;

  if (uptimeEl) uptimeEl.textContent = uptime;
}

// Start updater
setInterval(updateSystemUptime, 1000);
updateSystemUptime();
