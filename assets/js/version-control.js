import {
  db,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "./firebase-config.js";

/* -------------------------------------------------- */
const versionRef = doc(db, "system", "version");

/* -------------------------------------------------- */
function nextVersion(version) {
  const [a = 0, b = 0, c = 0] = String(version || "0.0.0")
    .split(".")
    .map(n => parseInt(n, 10));
  return `${a}.${b}.${c + 1}`;
}

/* -------------------------------------------------- */
/* UPDATE VERSION */
export async function autoUpdateVersion() {
  const snap = await getDoc(versionRef);

  let version = "1.0.0";
  let build = 0;
  let env = "PROD";

  if (snap.exists()) {
    const d = snap.data();
    version = d.version || version;
    build = d.buildNumber || 0;
    env = d.env || env;
  }

  const newVersion = nextVersion(version);

  await setDoc(
    versionRef,
    {
      version: newVersion,
      buildNumber: build + 1,
      buildTime: Date.now(),
      env
    },
    { merge: true }
  );

  alert(`Dashboard updated to v${newVersion}`);
}

/* -------------------------------------------------- */
/* BIND CARD */
export function bindVersionCard() {
  const cur = document.getElementById("currentVersion");
  const next = document.getElementById("nextVersion");

  if (!cur || !next) return;

  onSnapshot(versionRef, snap => {
    if (!snap.exists()) {
      cur.textContent = "v1.0.0";
      next.textContent = "v1.0.1";
      return;
    }

    const v = snap.data();
    cur.textContent = `v${v.version}`;
    next.textContent = `v${nextVersion(v.version)}`;
  });
}

/* -------------------------------------------------- */
/* VIEW MODAL */
export function openVersionView() {
  const modal = document.getElementById("versionViewModal");
  if (!modal) return;

  onSnapshot(versionRef, snap => {
    if (!snap.exists()) return;

    const v = snap.data();
    const date = v.buildTime
      ? new Date(v.buildTime).toLocaleString("en-GB")
      : "—";

    document.getElementById("viewCurrentVersion").textContent = `v${v.version}`;
    document.getElementById("viewBuildNumber").textContent = `#${v.buildNumber}`;
    document.getElementById("viewBuildDate").textContent = date;
    document.getElementById("viewNextVersion").textContent = `v${nextVersion(v.version)}`;
    document.getElementById("viewNextBuild").textContent = `#${v.buildNumber + 1}`;
  });

  modal.style.display = "flex";
}

export function closeVersionView() {
  document.getElementById("versionViewModal").style.display = "none";
}
