// Your build log showed the SDK version that needs a DEFAULT import:
import StreamingAvatar, { StreamingEvents, TaskType, AvatarQuality } from "@heygen/streaming-avatar";

/* ---------- DOM ---------- */
const banner = document.getElementById("banner");
const logEl  = document.getElementById("log");
const video  = document.getElementById("avatarVideo");
const sessionFab = document.getElementById("sessionFab");
const resetBtn   = document.getElementById("resetBtn");

/* ---------- Log & error UI ---------- */
function log(...a){ console.log("[avatar]", ...a); if (logEl){ logEl.textContent += a.join(" ") + "\n"; logEl.scrollTop = logEl.scrollHeight; } }
function showError(msg){ console.error(msg); if (banner){ banner.textContent = msg; banner.classList.add("show"); } }
function hideError(){ if (banner){ banner.classList.remove("show"); banner.textContent = ""; } }

/* ---------- Helpers ---------- */
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

/* ---------- State ---------- */
let avatar = null, sid = null, active = false;

/* ---------- Start / Stop ---------- */
async function startSession(){
  hideError();
  try{
    await unlockAudioOnce();
    const token = await getToken();

    log("new StreamingAvatar …");
    avatar = new StreamingAvatar({ token });

    avatar.on(StreamingEvents.STREAM_READY, async (ev)=>{
      log("STREAM_READY");
      const stream = ev?.detail?.stream || ev?.detail || ev?.stream;
      if (!stream){ showError("Stream ready, but no MediaStream"); return; }

      // Attach to <video> and force sound ON
      video.srcObject = stream;
      video.muted = false;
      video.volume = 1.0;
      try { await video.play(); } catch {}

      // Hidden <audio> sink so Chrome always plays sound
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

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, ()=>{
      log("STREAM_DISCONNECTED");
      active = false; sid = null;
      sessionFab.textContent = "▶ Start";
    });

    log("createStartAvatar …");
    const session = await avatar.createStartAvatar({
      avatarName: "default",
      language: "en",
      quality: AvatarQuality.Medium,   // Medium while testing
      activityIdleTimeout: 30,         // 30s idle timeout
      knowledgeBase: "Greet once. Be concise. This is a clean diagnostic."
    });

    sid = session?.session_id;
    if (!sid) throw new Error("No session_id in response");
    active = true;
    sessionFab.textContent = "■ Stop";
    log("Session started:", sid);

    // Say one line so you can confirm audio
    await avatar.speak({ sessionId: sid, text: "Hello! If you can hear me, the stream is working.", task_type: TaskType.REPEAT });
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
  active = false; sid = null;
  sessionFab.textContent = "▶ Start";
  log("Stopped.");
}

/* ---------- Wire UI ---------- */
sessionFab.addEventListener("click", async ()=>{
  if (!active) await startSession();
  else         await stopSession();
});
resetBtn.addEventListener("click", stopSession);

/* ---------- Boot ---------- */
log("Loaded. Click Start once.");
