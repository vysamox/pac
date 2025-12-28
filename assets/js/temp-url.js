/* =====================================================
   TEMP ACCESS SYSTEM — FIXED + HARDENED (FINAL)
   Firebase v8 + v9 SAFE
===================================================== */

const ROTATION_COOLDOWN = 15 * 1000;
const MAX_ACCESS_COUNT = 20;
const MAX_RELOAD_COUNT = 10;
const IDLE_TIMEOUT = 3 * 60 * 1000;
const HEARTBEAT_INTERVAL = 30 * 1000;
const MAX_SUSPICIOUS_SCORE = 3;

/* =====================================================
   FIREBASE UNIVERSAL HELPERS
===================================================== */

function isV8(db) {
  return typeof db.collection === "function";
}

function fbCollection(db, name) {
  return isV8(db)
    ? db.collection(name)
    : { __v9: true, db, name };
}

function fbDoc(col, id) {
  return col.doc
    ? col.doc(id)
    : { __v9: true, col, id };
}

async function fbGet(ref) {
  if (ref.get) return ref.get();
  const { doc, getDoc } = window.__FIREBASE_V9__;
  return getDoc(doc(ref.col.db, ref.col.name, ref.id));
}

async function fbSet(ref, data) {
  if (ref.set) return ref.set(data);
  const { doc, setDoc } = window.__FIREBASE_V9__;
  return setDoc(doc(ref.col.db, ref.col.name, ref.id), data);
}

async function fbUpdate(ref, data) {
  if (ref.update) return ref.update(data);
  const { doc, updateDoc } = window.__FIREBASE_V9__;
  return updateDoc(doc(ref.col.db, ref.col.name, ref.id), data);
}

async function fbDelete(ref) {
  if (ref.delete) return ref.delete();
  const { doc, deleteDoc } = window.__FIREBASE_V9__;
  return deleteDoc(doc(ref.col.db, ref.col.name, ref.id));
}

/* =====================================================
   TOKEN
===================================================== */

function generateLongToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}

/* =====================================================
   FINGERPRINT (STABLE & SAFE)
===================================================== */

function getTempFingerprint() {
  return btoa(
    [
      navigator.userAgent,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone
    ].join("|")
  ).slice(0, 64);
}

/* =====================================================
   SESSION STATE
===================================================== */

function incrementReloadCount() {
  const key = "__tmp_reload__";
  const c = (Number(sessionStorage.getItem(key)) || 0) + 1;
  sessionStorage.setItem(key, c);
  return c;
}

function setupIdleTracker() {
  const mark = () =>
    sessionStorage.setItem("__tmp_last__", Date.now());

  ["click","mousemove","keydown","scroll","touchstart"]
    .forEach(e => window.addEventListener(e, mark, { passive: true }));

  mark();
}

function isIdleTooLong() {
  const last = Number(sessionStorage.getItem("__tmp_last__") || 0);
  return Date.now() - last > IDLE_TIMEOUT;
}

/* =====================================================
   HEARTBEAT (SAFE)
===================================================== */

let heartbeatTimer = null;

function startHeartbeat(ref) {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    fbUpdate(ref, { lastHeartbeatAt: Date.now() }).catch(()=>{});
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

/* =====================================================
   CLIENT DETAILS
===================================================== */

function getClientDetails() {
  return {
    ua: navigator.userAgent,
    lang: navigator.language,
    platform: navigator.platform,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    at: Date.now()
  };
}

/* =====================================================
   BLOCK
===================================================== */

function blockTemp(msg) {
  stopHeartbeat();
  document.body.innerHTML = `
    <div style="display:flex;height:100vh;align-items:center;justify-content:center;text-align:center;">
      <h2>${msg}</h2>
    </div>`;
  throw new Error(msg);
}

/* =====================================================
   MAIN
===================================================== */

async function secureTempAccess(db) {
  try {
    setupIdleTracker();

    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const now = Date.now();
    const fingerprint = getTempFingerprint();
    const reloadCount = incrementReloadCount();

    if (reloadCount > MAX_RELOAD_COUNT)
      blockTemp("🚨 Too many reloads");

    const col = fbCollection(db, "temp_links");

    /* ---------- CREATE TOKEN ---------- */
    if (!token) {
      const t = generateLongToken();

      await fbSet(fbDoc(col, t), {
        fingerprint,
        createdAt: now,
        expiresAt: now + 10 * 60 * 1000,
        lastTokenRotation: now,
        accessCount: 0,
        reloadCount: 0,
        suspiciousScore: 0,
        locked: false,

        /* 🔥 IMPORTANT FOR MONITOR */
        targetUrl: location.pathname,
        fullUrl: location.href
      });

      location.replace(`${location.pathname}?token=${t}`);
      return;
    }

    /* ---------- VALIDATE ---------- */
    const ref = fbDoc(col, token);
    const snap = await fbGet(ref);

    if (!snap.exists || (snap.exists && !snap.exists()))
      blockTemp("❌ Invalid or expired link");

    const d = snap.data();

    if (d.locked) blockTemp("🔒 Access locked");
    if (now > d.expiresAt) blockTemp("⏰ Link expired");
    if (d.fingerprint !== fingerprint)
      blockTemp("🚫 Token locked to this browser");
    if (isIdleTooLong())
      blockTemp("⏱ Session expired");
    if ((d.accessCount || 0) >= MAX_ACCESS_COUNT)
      blockTemp("🚫 Access limit reached");

    const suspicious =
      reloadCount > MAX_RELOAD_COUNT / 2
        ? (d.suspiciousScore || 0) + 1
        : (d.suspiciousScore || 0);

    if (suspicious >= MAX_SUSPICIOUS_SCORE) {
      await fbUpdate(ref, { locked: true });
      blockTemp("🚫 Suspicious activity detected");
    }

    await fbUpdate(ref, {
      lastAccessAt: now,
      accessCount: (d.accessCount || 0) + 1,
      reloadCount,
      suspiciousScore: suspicious,
      lastClientInfo: getClientDetails()
    });

    startHeartbeat(ref);

    /* ---------- ROTATE TOKEN (SAFE) ---------- */
    if (now - d.lastTokenRotation < ROTATION_COOLDOWN) return;

    stopHeartbeat();

    const newToken = generateLongToken();
    const newRef = fbDoc(col, newToken);

    await fbSet(newRef, {
      ...d,
      lastTokenRotation: now,
      accessCount: d.accessCount || 0,
      reloadCount
    });

    await fbDelete(ref);

    history.replaceState({}, "", `${location.pathname}?token=${newToken}`);
    startHeartbeat(newRef);

  } catch (e) {
    console.error("TempAccess Error:", e.message);
  }
}
