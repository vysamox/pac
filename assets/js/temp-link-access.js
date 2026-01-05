import {
  db,
  doc,
  updateDoc,
  serverTimestamp
} from "./firebase-config.js";

function getTokenFromURL() {
  const url = window.location.href;

  const params = new URLSearchParams(window.location.search);
  if (params.get("token")) return params.get("token");
  if (params.get("key")) return params.get("key");
  if (params.get("code")) return params.get("code");
  if (params.get("id")) return params.get("id");

  if (window.location.hash.length > 1) {
    return window.location.hash.substring(1);
  }

  const parts = window.location.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && last.length >= 6) return last;

  return null;
}

function getDeviceDetails() {
  const ua = navigator.userAgent;

  let device = "Desktop";
  if (/tablet|ipad/i.test(ua)) device = "Tablet";
  else if (/mobile/i.test(ua)) device = "Mobile";

  let os = "Unknown OS";
  if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/windows nt/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "Unknown Browser";
  if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";

  return { device, os, browser, ua };
}

(async () => {
  const token = getTokenFromURL();

  if (!token) {
    console.warn("❌ No token found in URL");
    return;
  }

  try {
    await updateDoc(doc(db, "temp_links", token), {
      lastAccessAt: serverTimestamp(),
      lastDevice: getDeviceDetails(),
      lastHeartbeatAt: serverTimestamp()
    });

    console.log("✅ Device logged for token:", token);
  } catch (e) {
    console.error("❌ Firestore update failed", e);
  }
})();
