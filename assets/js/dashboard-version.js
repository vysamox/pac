export async function loadDashboardVersion() {
  const el = document.querySelector(".dashboard-version");
  if (!el) return;

  try {
    const res = await fetch("./version.json?cb=" + Date.now(), {
      cache: "no-store"
    });

    if (!res.ok) throw new Error("version.json missing");

    const v = await res.json();
    const d = new Date(v.buildTime);

    const date = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    const time = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    el.textContent =
      `Dashboard v${v.version} • Build #${v.buildNumber} • Updated ${date}, ${time} • ${v.env}`;

  } catch (e) {
    el.textContent = "Dashboard version info unavailable";
  }
}
