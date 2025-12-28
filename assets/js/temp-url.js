/* =====================================================
   TEMP ACCESS SYSTEM — BEST + ADVANCED (FINAL)
   Firebase v8 + v9 SAFE
===================================================== */

const ROTATION_COOLDOWN = 15 * 1000;
const MAX_ACCESS_COUNT = 20;
const MAX_RELOAD_COUNT = 10;
const IDLE_TIMEOUT = 3 * 60 * 1000;
const HEARTBEAT_INTERVAL = 30 * 1000;
const MAX_SUSPICIOUS_SCORE = 3;

/* =====================================================
   FIREBASE UNIVERSAL HELPERS (NO IMPORTS)
===================================================== */

function isV8(db) {
  return typeof db.collection === "function";
}

function fbCollection(db, name) {
  if (isV8(db)) return db.collection(name);
  return { __v9: true, db, name };
}

function fbDoc(col, id) {
  if (col.doc) return col.doc(id);
  return { __v9: true, col, id };
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
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* =====================================================
   FINGERPRINT (STABLE)
===================================================== */

function getTempFingerprint() {
  const w = Math.min(screen.width, screen.height);
  const h = Math.max(screen.width, screen.height);

  return btoa(
    [
      navigator.userAgent,
      navigator.language,
      `${w}x${h}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone
    ].join("|")
  ).slice(0, 64);
}

/* =====================================================
   SESSION STATE
===================================================== */

function incrementReloadCount() {
  const k = "reload_count";
  const c = (Number(sessionStorage.getItem(k)) || 0) + 1;
  sessionStorage.setItem(k, c);
  return c;
}

function setupIdleTracker() {
  const mark = () =>
    sessionStorage.setItem("last_activity", Date.now());

  ["click","mousemove","keydown","scroll","touchstart"]
    .forEach(e => window.addEventListener(e, mark, { passive:true }));

  mark();
}

function isIdleTooLong() {
  const last = Number(sessionStorage.getItem("last_activity") || 0);
  return Date.now() - last > IDLE_TIMEOUT;
}

/* =====================================================
   HEARTBEAT
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
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    fetchedAt: Date.now()
  };
}

/* =====================================================
   BLOCK
===================================================== */

function blockTemp(msg) {
  stopHeartbeat();
  document.body.innerHTML = `
    <div style="display:flex;height:100vh;align-items:center;justify-content:center;">
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
        suspiciousScore: 0,
        locked: false
      });
      location.replace(`${location.pathname}?token=${t}`);
      return;
    }

    /* ---------- VALIDATE ---------- */
    const ref = fbDoc(col, token);
    const snap = await fbGet(ref);
    if (!snap.exists) blockTemp("❌ Invalid or expired link");

    const d = snap.data();

    if (d.locked) blockTemp("🔒 Access locked");
    if (now > d.expiresAt) blockTemp("⏰ Link expired");
    if (d.fingerprint !== fingerprint)
      blockTemp("🚫 Token locked to another browser");
    if (isIdleTooLong())
      blockTemp("⏱ Session expired");
    if ((d.accessCount || 0) >= MAX_ACCESS_COUNT)
      blockTemp("🚫 Access limit reached");

    const suspicious =
      reloadCount > MAX_RELOAD_COUNT / 2
        ? (d.suspiciousScore || 0) + 1
        : d.suspiciousScore || 0;

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

    /* ---------- ROTATE ---------- */
    if (now - d.lastTokenRotation < ROTATION_COOLDOWN) return;

    stopHeartbeat();

    const newToken = generateLongToken();
    const newRef = fbDoc(col, newToken);

    await fbSet(newRef, { ...d, lastTokenRotation: now });
    await fbDelete(ref);

    history.replaceState({}, "", `${location.pathname}?token=${newToken}`);
    startHeartbeat(newRef);

  } catch (e) {
    console.error("TempAccess Error:", e.message);
  }
}
