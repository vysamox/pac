/* ============================================================
   VERSION CONTROL SYSTEM — ENTERPRISE++ EDITION v3.0
   ES Module | Atomic | Audited | Restore-Safe
   NEW v3.0: Auto GitHub commit watcher
     - Polls GitHub API every 60s
     - Detects new pushes by comparing SHA
     - Saves to Firestore → all open tabs update via onSnapshot
     - Shows live commit banner in dashboard
     - Logs auto-detected deploys to version history
============================================================ */

import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  runTransaction,
  serverTimestamp
} from "./firebase-config.js";


/* ============================================================
   GITHUB CONFIG
============================================================ */
const GITHUB_OWNER    = "vysamox";
const GITHUB_REPO     = "pac";
const GITHUB_BRANCH   = "main";
const GITHUB_POLL_MS  = 60_000; // poll every 60 seconds

let _lastKnownSHA     = null;
let _gitWatcherTimer  = null;
let _gitWatcherActive = false;
let _lastSyncTime     = null;
let _githubStatusUnsub = null;


/* ============================================================
   FETCH LATEST COMMIT FROM GITHUB API
============================================================ */
async function fetchGitHubCommit() {
  const token = window.GITHUB_TOKEN;
  if (!token) {
    return { hash: "no-token", fullHash: null, message: "Set window.GITHUB_TOKEN to enable", author: "—", date: null, url: "#" };
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    if (res.status === 403 || res.status === 429) {
      const reset = res.headers.get("X-RateLimit-Reset");
      const wait  = reset ? new Date(+reset * 1000).toLocaleTimeString() : "soon";
      return { hash: "rate-limited", fullHash: null, message: `Rate limited — resets at ${wait}`, author: "—", date: null, url: "#" };
    }

    if (!res.ok) throw new Error(`GitHub API ${res.status}`);

    const data = await res.json();
    return {
      hash:     data.sha.substring(0, 7),
      fullHash: data.sha,
      message:  (data.commit.message || "").split("\n")[0],
      author:   data.commit.author.name,
      date:     data.commit.author.date,
      url:      data.html_url
    };

  } catch (e) {
    console.warn("[GitHub] Commit fetch failed:", e.message);
    return { hash: "error", fullHash: null, message: e.message, author: "—", date: null, url: "#" };
  }
}


/* ============================================================
   SAVE COMMIT TO FIRESTORE system/github_status
   Other open tabs receive this via onSnapshot automatically
============================================================ */
async function saveCommitToFirestore(commit) {
  try {
    await setDoc(doc(db, "system", "github_status"), {
      hash:      commit.hash,
      fullHash:  commit.fullHash,
      message:   commit.message,
      author:    commit.author,
      date:      commit.date,
      url:       commit.url,
      updatedAt: Date.now(),
      branch:    GITHUB_BRANCH,
      repo:      `${GITHUB_OWNER}/${GITHUB_REPO}`
    }, { merge: true });
  } catch (e) {
    console.warn("[GitHub] Firestore save failed:", e.message);
  }
}


/* ============================================================
   RENDER GITHUB COMMIT BANNER in dashboard
============================================================ */
function renderGitHubWidget(commit, isNew = false) {
  let widget = document.getElementById("githubCommitWidget");

  if (!widget) {
    widget = document.createElement("div");
    widget.id = "githubCommitWidget";
    widget.style.cssText = [
      "padding:9px 48px",
      "background:rgba(2,4,12,0.65)",
      "border-bottom:1px solid rgba(0,240,255,0.08)",
      "display:flex",
      "align-items:center",
      "gap:14px",
      "flex-wrap:wrap",
      "font-family:'Fira Code',monospace",
      "font-size:11.5px",
      "color:rgba(180,210,250,0.5)",
      "transition:background .6s ease,border-color .6s ease",
      "position:relative",
      "overflow:hidden"
    ].join(";");

    const hero = document.querySelector(".page-hero");
    if (hero) hero.insertAdjacentElement("afterend", widget);
    else {
      const wrap = document.querySelector(".main-wrap");
      if (wrap) wrap.insertAdjacentElement("beforebegin", widget);
    }
  }

  // Flash on new commit
  if (isNew) {
    widget.style.background    = "rgba(6,255,165,0.06)";
    widget.style.borderBottom  = "1px solid rgba(6,255,165,0.25)";
    setTimeout(() => {
      widget.style.background   = "rgba(2,4,12,0.65)";
      widget.style.borderBottom = "1px solid rgba(0,240,255,0.08)";
    }, 4000);
  }

  const isError = ["no-token","error","rate-limited","unknown"].includes(commit.hash);
  const hashColor = isError ? "rgba(255,45,120,0.7)" : "#00f0ff";

  const dateStr = commit.date
    ? new Date(commit.date).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })
    : "";

  const newBadge = isNew
    ? `<span style="background:rgba(6,255,165,0.15);color:#06ffa5;border:1px solid rgba(6,255,165,0.3);padding:2px 9px;border-radius:99px;font-size:9px;font-weight:700;letter-spacing:1px;animation:pulse-s 2s ease-in-out infinite;flex-shrink:0;">NEW PUSH</span>`
    : "";

  widget.innerHTML = `
    <span style="display:flex;align-items:center;gap:7px;flex-shrink:0;">
      <i class="fa-brands fa-github" style="font-size:14px;color:#fff;"></i>
      <span style="color:rgba(255,255,255,0.8);letter-spacing:.5px;">${GITHUB_OWNER}/${GITHUB_REPO}</span>
      <span style="color:rgba(180,210,250,0.25);">·</span>
      <span style="color:rgba(180,210,250,0.4);">${GITHUB_BRANCH}</span>
    </span>
    ${newBadge}
    ${!isError
      ? `<a href="${commit.url}" target="_blank" rel="noopener"
           style="color:${hashColor};font-weight:700;letter-spacing:1.5px;text-decoration:none;border-bottom:1px solid ${hashColor}44;flex-shrink:0;"
           title="${commit.message}">#${commit.hash}</a>`
      : `<span style="color:${hashColor};">${commit.hash}</span>`
    }
    <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:480px;color:rgba(180,210,250,0.6);"
          title="${commit.message}">${commit.message}</span>
    ${commit.author !== "—"
      ? `<span style="color:rgba(180,210,250,0.35);flex-shrink:0;"><i class="fa-solid fa-user" style="font-size:9px;margin-right:4px;"></i>${commit.author}</span>`
      : ""
    }
    ${dateStr
      ? `<span style="color:rgba(180,210,250,0.3);flex-shrink:0;"><i class="fa-regular fa-clock" style="font-size:9px;margin-right:3px;"></i>${dateStr}</span>`
      : ""
    }
    <span id="gitSyncStatus" style="color:rgba(180,210,250,0.22);font-size:10px;margin-left:auto;flex-shrink:0;">synced just now</span>
  `;
}


/* ============================================================
   UPDATE "synced Xs ago" TEXT
============================================================ */
setInterval(() => {
  const el = document.getElementById("gitSyncStatus");
  if (!el || !_lastSyncTime) return;
  const s = Math.floor((Date.now() - _lastSyncTime) / 1000);
  el.textContent = s < 60 ? `synced ${s}s ago` : s < 3600 ? `synced ${Math.floor(s/60)}m ago` : `synced ${Math.floor(s/3600)}h ago`;
}, 15_000);


/* ============================================================
   NOTIFY OTHER SYSTEMS (bell, terminal, alert)
============================================================ */
function notifyNewCommit(commit) {
  const msg = `🔀 New push by <b>${commit.author}</b>: ${commit.message}`;

  if (typeof window.addNotif  === "function") window.addNotif("pac", msg);
  if (typeof window.termLog   === "function") window.termLog(`GitHub push — #${commit.hash} by ${commit.author}: ${commit.message}`, "ok");
  if (typeof window.showAlert === "function") window.showAlert(`New GitHub push: ${commit.message}`, "info");
}


/* ============================================================
   RECORD GITHUB DEPLOY IN VERSION HISTORY
============================================================ */
async function recordGitHubDeploy(commit) {
  try {
    const ip   = await getClientIP();
    const snap = await getDoc(versionRef);
    if (!snap.exists()) return;
    const v = snap.data();

    // Write a GITHUB_PUSH entry to history
    await setDoc(
      doc(db, "system_version_history", `github__${commit.hash}__${Date.now()}`),
      {
        version:      v.version,
        buildNumber:  v.buildNumber,
        buildTime:    Date.now(),
        env:          ENV,
        action:       "GITHUB_PUSH",
        changelog:    [commit.message],
        git:          commit,
        savedAt:      Date.now(),
        savedBy:      "github-watcher",
        ip,
        deleted:      false,
        lockRestore:  false,
        autoDetected: true
      }
    );

    // Update version doc with last push info
    await updateDoc(versionRef, {
      lastGitPush: {
        hash:    commit.hash,
        message: commit.message,
        author:  commit.author,
        date:    commit.date,
        at:      Date.now()
      }
    });

  } catch (e) {
    console.warn("[GitHub] recordGitHubDeploy failed:", e.message);
  }
}


/* ============================================================
   CORE POLL — called every GITHUB_POLL_MS
============================================================ */
async function checkForNewCommit() {
  const commit  = await fetchGitHubCommit();
  _lastSyncTime = Date.now();

  if (!commit.fullHash) {
    renderGitHubWidget(commit, false);
    return;
  }

  const isNew = _lastKnownSHA !== null && _lastKnownSHA !== commit.fullHash;

  if (isNew) {
    console.log(`[GitHub] New commit: #${commit.hash} — "${commit.message}" by ${commit.author}`);
    notifyNewCommit(commit);
    await saveCommitToFirestore(commit);   // triggers onSnapshot in other tabs
    await recordGitHubDeploy(commit);     // saves to version history
  }

  _lastKnownSHA = commit.fullHash;
  renderGitHubWidget(commit, isNew);
}


/* ============================================================
   FIRESTORE LISTENER — receives updates from OTHER tabs
   When tab A detects a new commit and saves to Firestore,
   tab B/C/D get this via onSnapshot without needing to poll
============================================================ */
function listenGitHubStatus() {
  if (_githubStatusUnsub) return; // already listening

  _githubStatusUnsub = onSnapshot(
    doc(db, "system", "github_status"),
    snap => {
      if (!snap.exists()) return;
      const d = snap.data();

      const commit = {
        hash:     d.hash     || "—",
        fullHash: d.fullHash || null,
        message:  d.message  || "—",
        author:   d.author   || "—",
        date:     d.date     || null,
        url:      d.url      || "#"
      };

      // New if our local SHA doesn't match Firestore
      const isNew = _lastKnownSHA !== null
        && d.fullHash
        && _lastKnownSHA !== d.fullHash;

      if (isNew) {
        notifyNewCommit(commit);
        _lastKnownSHA = d.fullHash;
      }

      _lastSyncTime = Date.now();
      renderGitHubWidget(commit, isNew);
    },
    err => console.warn("[GitHub] Status listener error:", err.message)
  );
}


/* ============================================================
   START / STOP WATCHER (exported)
============================================================ */
export function startGitHubWatcher() {
  if (_gitWatcherActive) return;
  _gitWatcherActive = true;

  listenGitHubStatus();       // Real-time Firestore (cross-tab)
  checkForNewCommit();        // Immediate first poll
  _gitWatcherTimer = setInterval(checkForNewCommit, GITHUB_POLL_MS);

  console.log(`[GitHub] Watcher started — polling every ${GITHUB_POLL_MS / 1000}s + Firestore real-time`);
}

export function stopGitHubWatcher() {
  clearInterval(_gitWatcherTimer);
  if (_githubStatusUnsub) { _githubStatusUnsub(); _githubStatusUnsub = null; }
  _gitWatcherActive = false;
  console.log("[GitHub] Watcher stopped");
}


/* ============================================================
   SYSTEM CONFIG
============================================================ */
const versionRef = doc(db, "system", "version");
const ENABLE_SOFT_DELETE = true;
const CURRENT_ROLE       = "admin";
const ENV                = "PROD";


/* ============================================================
   NOTIFY HELPER
============================================================ */
const notify = (msg, type = "info") => {
  if (typeof window.showAlert === "function") { window.showAlert(msg, type); return; }
  if (typeof window.notify    === "function") { window.notify(msg, type);    return; }
  console.log(`[VC] [${type.toUpperCase()}]`, msg);
};


/* ============================================================
   UTILITIES
============================================================ */
const nextVersion = (v = "1.0.0") => {
  const [a=1,b=0,c=0] = v.replace(/^v/,"").split(".").map(n => parseInt(n,10)||0);
  return `${a}.${b}.${c+1}`;
};
const historyId  = (v,b) => `v${v}__build_${b}__${Date.now()}`;
const canRestore = ()    => ["admin","superadmin"].includes(CURRENT_ROLE);
const canDelete  = ()    => ["admin","superadmin"].includes(CURRENT_ROLE);


/* ============================================================
   CLIENT IP (CACHED)
============================================================ */
let _cachedIP = null;
async function getClientIP() {
  if (_cachedIP) return _cachedIP;
  try { const r=await fetch("https://api.ipify.org?format=json"); const j=await r.json(); _cachedIP=j.ip||"unknown"; }
  catch { _cachedIP="unknown"; }
  return _cachedIP;
}


/* ============================================================
   AUDIT LOGGER
============================================================ */
async function audit(action, payload={}) {
  try {
    await setDoc(doc(db,"system_version_audit",`${action}__${Date.now()}`),{
      action, role:CURRENT_ROLE, env:ENV,
      at:serverTimestamp(), ip:await getClientIP(), ...payload
    });
  } catch(e) { console.warn("Audit failed:",e.message); }
}


/* ============================================================
   ENSURE VERSION DOC EXISTS
============================================================ */
async function ensureVersionDoc() {
  const snap = await getDoc(versionRef);
  if (!snap.exists()) {
    await setDoc(versionRef,{version:"1.0.0",buildNumber:1,buildTime:Date.now(),env:ENV,createdAt:serverTimestamp()});
  }
}


/* ============================================================
   SHARED HISTORY PAYLOAD
============================================================ */
function buildHistoryPayload({version,buildNumber,buildTime,env},{ip,git,changelog=[],action="UPDATE"}) {
  return {version,buildNumber,buildTime,env:env||ENV,action,changelog,
    git:git||{hash:"unknown"},savedAt:Date.now(),savedBy:CURRENT_ROLE,
    ip:ip||"unknown",deleted:false,lockRestore:false};
}


/* ============================================================
   ATOMIC VERSION UPDATE
============================================================ */
export async function autoUpdateVersion(changelog=[]) {
  await ensureVersionDoc();
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(versionRef);
      if (!snap.exists()) throw new Error("Version doc missing");
      const live = snap.data();
      const [ip, git] = await Promise.all([getClientIP(), fetchGitHubCommit()]);
      tx.set(doc(db,"system_version_history",historyId(live.version,live.buildNumber)),
        buildHistoryPayload(live,{ip,git,changelog,action:"UPDATE"}));
      tx.update(versionRef,{
        version:nextVersion(live.version), buildNumber:live.buildNumber+1,
        buildTime:Date.now(), lastUpdate:{by:CURRENT_ROLE,at:Date.now(),ip}
      });
    });
    await audit("UPDATE");
    notify("✓ Version updated successfully","success");
  } catch(e) {
    console.error("autoUpdateVersion failed:",e);
    notify("Update failed: "+e.message,"error");
  }
}


/* ============================================================
   LIVE VERSION CARD BINDING
   Starts GitHub watcher automatically once Firestore is ready
============================================================ */
let versionUnsub = null;

export function bindVersionCard() {
  if (versionUnsub) versionUnsub();

  versionUnsub = onSnapshot(versionRef, snap => {
    if (!snap.exists()) return;
    const v = snap.data();
    const set = (id,val) => { const el=document.getElementById(id); if(el) el.textContent=val; };

    set("currentVersion",        `v${v.version}`);
    set("currentVersionDisplay", `v${v.version}`);
    set("currentBuild",          `#${v.buildNumber}`);
    set("currentDate",           new Date(v.buildTime).toLocaleString("en-GB"));
    set("nextVersion",           `v${nextVersion(v.version)}`);
    set("chipVersion",           `v${v.version}`);

    const footer = document.querySelector(".dashboard-version");
    if (footer) footer.textContent = `v${v.version} #${v.buildNumber}`;

    // Auto-start GitHub watcher when card is ready
    startGitHubWatcher();

  }, err => console.error("bindVersionCard error:",err));
}


/* ============================================================
   VERSION VIEW MODAL — also shows latest git commit
============================================================ */
export async function openVersionView() {
  const modal = document.getElementById("versionViewModal");
  if (!modal) return;
  try {
    const snap = await getDoc(versionRef);
    if (!snap.exists()) return;
    const v   = snap.data();
    const set = (id,val) => { const el=document.getElementById(id); if(el) el.textContent=val; };

    set("viewCurrentVersion", `v${v.version}`);
    set("viewBuildNumber",    `#${v.buildNumber}`);
    set("viewBuildDate",      new Date(v.buildTime).toLocaleString("en-GB"));
    set("viewNextVersion",    `v${nextVersion(v.version)}`);
    set("viewNextBuild",      `#${v.buildNumber+1}`);

    // Show latest git commit from Firestore cache
    const gitSnap = await getDoc(doc(db,"system","github_status"));
    const gitEl   = document.getElementById("viewGitCommit");
    if (gitEl && gitSnap.exists()) {
      const g = gitSnap.data();
      gitEl.innerHTML = `<a href="${g.url||'#'}" target="_blank"
        style="color:var(--neon);font-family:'Fira Code',monospace;font-size:12px;">#${g.hash}</a>
        <span style="color:var(--sub);font-size:12px;margin-left:8px;">${g.message||"—"}</span>
        <span style="color:var(--dim);font-size:11px;margin-left:8px;">by ${g.author||"—"}</span>`;
    }

    modal.classList.add("show");
    modal.style.display = "flex";
  } catch(e) {
    console.error("openVersionView failed:",e);
    notify("Failed to load version details","error");
  }
}

export function closeVersionView() {
  const m = document.getElementById("versionViewModal");
  if (m) { m.classList.remove("show"); m.style.display="none"; }
}


/* ============================================================
   VERSION HISTORY MODAL
============================================================ */
let historyUnsub = null;

export async function openVersionHistory() {
  const modal = document.getElementById("versionHistoryModal");
  const body  = document.getElementById("versionHistoryBody");
  if (!modal||!body) return;

  modal.classList.add("show");
  modal.style.display = "flex";
  body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--dim);font-family:'Fira Code',monospace;font-size:12px;padding:20px;">Loading…</td></tr>`;

  if (historyUnsub) historyUnsub();

  try {
    const liveSnap = await getDoc(versionRef);
    if (!liveSnap.exists()) return;
    const live = liveSnap.data();

    historyUnsub = onSnapshot(
      query(collection(db,"system_version_history"), orderBy("savedAt","desc")),
      snap => {
        const frag = document.createDocumentFragment();
        body.innerHTML = "";

        if (snap.empty) {
          body.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--dim);padding:20px;">No history yet</td></tr>`;
          return;
        }

        snap.forEach(s => {
          const d      = s.data();
          if (ENABLE_SOFT_DELETE && d.deleted) return;

          const isLive = d.version===live.version && d.buildNumber===live.buildNumber;

          const actionColor = {
            UPDATE:"var(--neon)", RESTORE:"var(--amber)",
            GITHUB_PUSH:"var(--green)", PRE_RESTORE_SNAPSHOT:"var(--violet)"
          }[d.action] || "var(--sub)";

          const gitInfo = d.git?.hash && !["unknown","no-token","error"].includes(d.git.hash)
            ? `<a href="${d.git.url||'#'}" target="_blank"
                style="color:var(--neon);font-family:'Fira Code',monospace;font-size:10px;text-decoration:none;"
                title="${d.git.message||''}">#${d.git.hash}</a>`
            : `<span style="color:var(--dim);font-size:10px;">—</span>`;

          const autoBadge = d.autoDetected
            ? `<span style="background:rgba(6,255,165,0.1);color:var(--green);border:1px solid rgba(6,255,165,0.2);padding:1px 6px;border-radius:99px;font-size:9px;margin-left:4px;">AUTO</span>`
            : "";

          const statusBadge = isLive
            ? `<span class="badge live" style="font-size:9px;padding:2px 8px;">LIVE</span>`
            : d.action==="RESTORE"
              ? `<span class="badge pending" style="font-size:9px;padding:2px 8px;">RESTORE</span>`
              : d.action==="GITHUB_PUSH"
                ? `<span class="badge active" style="font-size:9px;padding:2px 8px;">GIT PUSH</span>`
                : "";

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td style="font-size:11px;font-family:'Fira Code',monospace;white-space:nowrap;">${new Date(d.savedAt).toLocaleString("en-GB")}</td>
            <td style="color:var(--neon);font-weight:700;font-family:'Fira Code',monospace;">v${d.version}</td>
            <td style="color:var(--sub);font-family:'Fira Code',monospace;">#${d.buildNumber}</td>
            <td style="color:${actionColor};font-size:11px;font-family:'Fira Code',monospace;white-space:nowrap;">${d.action||"—"}${autoBadge}</td>
            <td>${gitInfo}</td>
            <td style="font-family:'Fira Code',monospace;font-size:10px;color:var(--dim);">${d.ip||"—"}</td>
            <td>
              <div style="display:flex;gap:5px;align-items:center;flex-wrap:nowrap;">
                <button class="btn-sm restore" title="Restore"
                  ${!canRestore()||isLive||d.lockRestore?"disabled":""}
                  onclick="restoreVersion('${s.id}')">
                  <i class="fa-solid fa-rotate-left"></i>
                </button>
                <button class="btn-sm del" title="Delete"
                  ${!canDelete()||isLive?"disabled":""}
                  onclick="deleteVersionHistory('${s.id}','v${d.version}')">
                  <i class="fa-solid fa-trash"></i>
                </button>
                ${statusBadge}
              </div>
            </td>`;
          frag.appendChild(tr);
        });

        body.appendChild(frag);
      },
      err => {
        console.error("History snapshot error:",err);
        body.innerHTML=`<tr><td colspan="7" style="color:var(--rose);padding:16px;">${err.message}</td></tr>`;
      }
    );
  } catch(e) {
    console.error("openVersionHistory failed:",e);
    body.innerHTML=`<tr><td colspan="7" style="color:var(--rose);padding:16px;">${e.message}</td></tr>`;
  }
}

export function closeVersionHistory() {
  const m = document.getElementById("versionHistoryModal");
  if (m) { m.classList.remove("show"); m.style.display="none"; }
  if (historyUnsub) { historyUnsub(); historyUnsub=null; }
}


/* ============================================================
   RESTORE VERSION
============================================================ */
window.restoreVersion = async id => {
  if (!canRestore()) { notify("Permission denied","error"); return; }
  if (!confirm("Restore this version? Current state will be saved to history first.")) return;
  try {
    await runTransaction(db, async tx => {
      const histSnap = await tx.get(doc(db,"system_version_history",id));
      if (!histSnap.exists()) throw new Error("History record not found");
      const target   = histSnap.data();
      const liveSnap = await tx.get(versionRef);
      if (!liveSnap.exists()) throw new Error("Current version missing");
      const live = liveSnap.data();
      const [ip,git] = await Promise.all([getClientIP(),fetchGitHubCommit()]);
      tx.set(doc(db,"system_version_history",historyId(live.version,live.buildNumber)),
        buildHistoryPayload(live,{ip,git,changelog:[],action:"PRE_RESTORE_SNAPSHOT"}));
      tx.update(versionRef,{
        version:target.version, buildNumber:target.buildNumber,
        buildTime:Date.now(), restoredFrom:id,
        lastUpdate:{by:CURRENT_ROLE,at:Date.now(),ip,action:"RESTORE"}
      });
    });
    await audit("RESTORE",{id});
    notify("✓ Version restored successfully","success");
  } catch(e) {
    console.error("restoreVersion failed:",e);
    notify("Restore failed: "+e.message,"error");
  }
};


/* ============================================================
   DELETE VERSION HISTORY
============================================================ */
window.deleteVersionHistory = async (id, label) => {
  if (!canDelete()) { notify("Permission denied","error"); return; }
  const typed = prompt(`Type "${label}" to confirm deletion`);
  if (typed!==label) { notify("Cancelled","warn"); return; }
  try {
    const ref = doc(db,"system_version_history",id);
    if (ENABLE_SOFT_DELETE) {
      await updateDoc(ref,{deleted:true,deletedAt:Date.now(),deletedBy:CURRENT_ROLE});
      await audit("SOFT_DELETE",{id,label});
    } else {
      await deleteDoc(ref);
      await audit("HARD_DELETE",{id,label});
    }
    notify("✓ History entry deleted","success");
  } catch(e) {
    console.error("deleteVersionHistory failed:",e);
    notify("Delete failed: "+e.message,"error");
  }
};