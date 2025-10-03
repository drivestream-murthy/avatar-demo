/* ========= Minimal, robust start with dynamic SDK import ========= */

/* DOM */
const banner = document.getElementById("banner");
const logEl  = document.getElementById("log");
const video  = document.getElementById("avatarVideo");
const startBtn = document.getElementById("sessionFab");
const stopBtn  = document.getElementById("resetBtn");

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

/* Dynamically import the SDK and support both export styles */
async function loadSDK(){
  if (StreamingAvatarClass) return;
  const mod = await import("@heygen/streaming-avatar");
  // tolerate both export styles
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
    await unlockAudioOnce();
    await loadSDK();
    const token = await getToken();

    log("new StreamingAvatar …");
    avatar = new StreamingAvatarClass({ token });

    // Watchdog: if STREAM_READY never fires, tell the user
    let ready = false;
    const readyWatch = setTimeout(()=>{
      if (!ready) showError("No STREAM_READY within 10s. Possible causes: network blocks, credits exhausted, or browser autoplay.");
    }, 10000);

    // When media stream arrives
    avatar.on(StreamingEvents?.STREAM_READY || "STREAM_READY", async (ev)=>{
      ready = true; clearTimeout(readyWatch);
      log("STREAM_READY");
      const stream = ev?.detail?.stream || ev?.detail || ev?.stream;
      if (!stream){ showError("STREAM_READY fired but no MediaStream"); return; }

      // Attach to <video>
      video.srcObject = stream;
      video.muted = false;
      video.volume = 1.0;
      try { await video.play(); } catch {}

      // Hidden <audio> sink to guarantee audible speech (Chrome)
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

    // Extra diagnostics
    avatar.on?.(StreamingEvents?.ERROR || "ERROR", (e)=> showError("SDK ERROR: " + JSON.stringify(e)));
    avatar.on?.(StreamingEvents?.STREAM_DISCONNECTED || "STREAM_DISCONNECTED", ()=>{
      log("STREAM_DISCONNECTED"); active = false; sid = null; startBtn.textContent = "▶ Start";
    });

    log("createStartAvatar …");
    const session = await avatar.createStartAvatar({
      avatarName: "default",
      language: "en",
      quality: AvatarQuality.Medium,  // Medium while testing
      activityIdleTimeout: 30,
      knowledgeBase: "Greet once. Be concise. This is a clean diagnostic."
    }).catch(async (e)=> {
      // surface HeyGen backend errors clearly
      const msg = e?.message || String(e);
      showError("createStartAvatar failed: " + msg);
      throw e;
    });

    sid = session?.session_id;
    if (!sid) throw new Error("No session_id in response");
    active = true; startBtn.textContent = "■ Stop";
    log("Session started:", sid);

    // Quick audible line
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

/* UI */
startBtn.addEventListener("click", async ()=>{
  if (!active) await startSession();
  else         await stopSession();
});
stopBtn.addEventListener("click", stopSession);

/* Boot */
log("Loaded. Click Start once.");
