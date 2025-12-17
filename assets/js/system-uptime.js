/* ============================================================
   SYSTEM UPTIME MODULE
   Tracks dashboard runtime since page load
============================================================ */

const systemStartTime = Date.now();

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

  const el = document.getElementById("systemUptime");
  if (el) el.textContent = uptime;
}

// Start updater
setInterval(updateSystemUptime, 1000);
updateSystemUptime();
