/* ===== Robust start: logs every click, inline + listener handlers, dynamic SDK import ===== */

/* DOM */
const banner   = document.getElementById("banner");
const logEl    = document.getElementById("log");
const video    = document.getElementById("avatarVideo");
const startBtn = document.getElementById("sessionFab");
const stopBtn  = document.getElementById("resetBtn");

/* Click tracer: shows if some overlay eats the click */
document.addEventListener("click", (e)=>{
  const id = e.target && (e.target.id || e.target.closest?.("[id]")?.id) || "(no id)";
  log("click:", id);
});

/* Logging & errors */
function log(...a){ console.log("[avatar]", ...a); if (logEl){ logEl.textContent += a.join(" ") + "\n"; logEl.scrollTop = logEl.scrollHeight; } }
function showError(msg){ console.error(msg); if (banner){ banner.textContent = msg; banner.classList.add("show"); } }
function hideError(){ if (banner){ banner.classList.remove("show"); banner.textContent = ""; } }

/* Helpers */
async function getToken(){
  log("GET /api/token …");
  const r = await fetch("/api/token");
  const j = await r.json().catch(()=>null);
  if (!r.ok || !j?.token) throw new Error("Token error: " + (j?.error || r.status));
  log("Token OK");
  return j.token;
}

async function unlockAudioOnce(){
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const ctx = new AC(); if (ctx.state === "suspended") await ctx.resume(); }
  }catch{}
  try{
    video.muted = false; video.volume = 1.0; await video.play().catch(()=>{});
  }catch{}
}

/* State */
let avatar = null, sid = null, active = false;
let StreamingAvatarClass, StreamingEvents, TaskType, AvatarQuality;

/* Dynamic SDK import (works with default or named exports) */
async function loadSDK(){
  if (StreamingAvatarClass) return;
  const mod = await import("@heygen/streaming-avatar");
  StreamingAvatarClass = mod.StreamingAvatar || mod.default;
  StreamingEvents = mod.StreamingEvents || mod.default?.StreamingEvents || {};
  TaskType = mod.TaskType || mod.default?.TaskType || { REPEAT: "REPEAT" };
  AvatarQuality = mod.AvatarQuality || mod.default?.AvatarQuality || { Medium: "medium", High: "high", Low: "low" };
  if (!StreamingAvatarClass) throw new Error("Could not resolve StreamingAvatar class from SDK");
}

/* Start/Stop */
async function startSession(){
  hideError();
  try{
    log("Start pressed");
    await unlockAudioOnce();
    await loadSDK();
    const token = await getToken();

    log("new StreamingAvatar …");
    avatar = new StreamingAvatarClass({ token });

    // Watchdog if STREAM_READY never fires
    let ready = false;
    const timer = setTimeout(()=>{
      if (!ready) showError("No STREAM_READY within 10s. Check autoplay, credits, or firewall.");
    }, 10000);

    avatar.on?.(StreamingEvents?.STREAM_READY || "STREAM_READY", async (ev)=>{
      ready = true; clearTimeout(timer);
      log("STREAM_READY");
      const stream = ev?.detail?.stream || ev?.detail || ev?.stream;
      if (!stream){ showError("STREAM_READY fired but no MediaStream"); return; }

      // Attach to <video>
      video.srcObject = stream;
      video.muted = false;
      video.volume = 1.0;
      try { await video.play(); } catch {}

      // Hidden audio sink for Chrome
      let sink = document.getElementById("audioSink");
      if (!sink){
        sink = document.createElement("audio");
        sink.id = "audioSink";
        sink.style.display = "none";
        document.body.appendChild(sink);
      }
      try{
        sink.srcObject = stream;
        sink.muted = false;
        sink.volume = 1.0;
        await sink.play().catch(()=>{});
      }catch{}
    });

    avatar.on?.(StreamingEvents?.ERROR || "ERROR", (e)=> showError("SDK ERROR: " + JSON.stringify(e)));
    avatar.on?.(StreamingEvents?.STREAM_DISCONNECTED || "STREAM_DISCONNECTED", ()=>{
      log("STREAM_DISCONNECTED"); active=false; sid=null; startBtn.textContent="▶ Start";
    });

    log("createStartAvatar …");
    const session = await avatar.createStartAvatar({
      avatarName: "default",
      language: "en",
      quality: AvatarQuality.Medium,  // Medium while testing
      activityIdleTimeout: 30,
      knowledgeBase: "Greet once. Be concise. This is a minimal click-safe build."
    }).catch((e)=> {
      showError("createStartAvatar failed: " + (e?.message || e));
      throw e;
    });

    sid = session?.session_id;
    if (!sid) throw new Error("No session_id in response");
    active = true;
    startBtn.textContent = "■ Stop";
    log("Session started:", sid);

    // Audible line to confirm sound
    await avatar.speak({ sessionId: sid, text: "Hello! If you can hear me, streaming is working.", task_type: TaskType.REPEAT });
    log("Initial speak sent.");
  }catch(e){
    showError("Failed to start: " + (e?.message || e));
    console.error(e);
  }
}

async function stopSession(){
  try{
    if (sid){
      await fetch("/api/stop", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ sessionId: sid }) });
    }
  }catch{}
  try{ avatar?.disconnect?.(); }catch{}
  active=false; sid=null; startBtn.textContent="▶ Start";
  log("Stopped.");
}

/* Wire up (redundant on purpose) */
if (startBtn) startBtn.addEventListener("click", startSession);
if (stopBtn)  stopBtn.addEventListener("click",  stopSession);

/* Expose console helpers (so you can run them even if clicks are swallowed) */
window._start = startSession;
window._stop  = stopSession;

/* Boot */
log("Loaded. Click Start once or run window._start().");
