// BEFORE (causes your error with some versions):
// import { StreamingAvatar, StreamingEvents, TaskType, AvatarQuality } from "@heygen/streaming-avatar";

// AFTER (works across versions that default-export the class):
import StreamingAvatar, { StreamingEvents, TaskType, AvatarQuality } from "@heygen/streaming-avatar";




/* DOM */
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const testSpeakBtn = document.getElementById("testSpeakBtn");
const avatarVideo = document.getElementById("avatarVideo");
const avatarCanvas = document.getElementById("avatarCanvas");
const banner = document.getElementById("banner");
const logEl = document.getElementById("log");

/* Logger */
function log(...args){ console.log("[diag]", ...args); logEl.textContent += args.join(" ")+"\n"; logEl.scrollTop = logEl.scrollHeight; }
function showError(msg){ banner.textContent = msg; banner.classList.add("show"); log("ERROR:", msg); }
function clearError(){ banner.classList.remove("show"); banner.textContent=""; }

/* Small helpers */
async function getToken(){
  log("Fetching /api/token …");
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
  try{ avatarVideo.muted = false; avatarVideo.volume = 1.0; await avatarVideo.play().catch(()=>{}); }catch{}
}

/* Minimal green-screen render (optional) */
function startCanvasLoop(){
  const ctx = avatarCanvas.getContext("2d");
  function draw(){
    try{
      const vw = avatarVideo.videoWidth||0, vh = avatarVideo.videoHeight||0;
      const cw = avatarCanvas.width = avatarCanvas.clientWidth;
      const ch = avatarCanvas.height = avatarCanvas.clientHeight;
      if (vw && vh){
        // cover-fit
        const cr=cw/ch, vr=vw/vh; let sx=0,sy=0,sw=vw,sh=vh;
        if (vr>cr){ sw=Math.round(vh*cr); sx=Math.round((vw-sw)/2); } else { sh=Math.round(vw/cr); sy=Math.round((vh-sh)/2); }
        ctx.drawImage(avatarVideo, sx, sy, sw, sh, 0, 0, cw, ch);
        // simple chroma (transparent green)
        const img=ctx.getImageData(0,0,cw,ch),d=img.data;
        for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2]; if(g>80&&g>r+20&&g>b+20&&r<160&&b<160) d[i+3]=0;}
        ctx.putImageData(img,0,0);
      }
    }catch{}
    requestAnimationFrame(draw);
  }
  draw();
}

/* App state */
let avatar=null, sid=null, sessionActive=false;

/* Start session */
async function startSession(){
  clearError();
  try{
    log("Unlocking audio …");
    await unlockAudioOnce();

    const token = await getToken();

    log("Instantiating StreamingAvatar …");
    avatar = new StreamingAvatar({ token });

    // When media stream arrives, attach and make sure it is audible
    avatar.on(StreamingEvents.STREAM_READY, async (event)=>{
      log("STREAM_READY");
      const stream = event?.detail?.stream || event?.detail || event?.stream;
      if (!stream){ showError("Stream ready, but no MediaStream"); return; }

      // Attach to <video>
      avatarVideo.srcObject = stream;
      avatarVideo.muted = false;
      avatarVideo.volume = 1.0;
      try{ await avatarVideo.play(); }catch{}

      // Hidden <audio> sink so Chrome ALWAYS plays the sound
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

      startCanvasLoop();
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, ()=>{
      log("STREAM_DISCONNECTED");
      sessionActive = false; sid = null;
    });

    log("createStartAvatar …");
    const session = await avatar.createStartAvatar({
      avatarName: "default",
      language: "en",
      quality: AvatarQuality.Medium,      // Medium to save credits while testing
      activityIdleTimeout: 30,            // 30s idle timeout
      knowledgeBase: "Greet once. Be concise. If asked to test, say hello."
    });

    sid = session?.session_id;
    if (!sid) throw new Error("No session_id in response");
    sessionActive = true;
    log("Session started:", sid);

    // Say hi right away
    await avatar.speak({ sessionId: sid, text: "Hello! Audio test. If you can hear me, things are working.", task_type: TaskType.REPEAT });
    log("Initial speak sent.");

  }catch(e){
    const msg = e?.message || String(e);
    showError("Failed to start: " + msg);
    console.error(e);
  }
}

/* Stop session */
async function stopSession(){
  try{
    if (sid) {
      await fetch("/api/stop", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ sessionId: sid }) });
    }
  }catch{}
  try{ avatar?.disconnect?.(); }catch{}
  sessionActive=false; sid=null;
  log("Stopped.");
}

/* Wire buttons */
startBtn.addEventListener("click", async ()=>{
  log("Start clicked");
  if (sessionActive) { log("Already active"); return; }
  await startSession();
});
stopBtn.addEventListener("click", async ()=>{ log("Stop clicked"); await stopSession(); });
testSpeakBtn.addEventListener("click", async ()=>{
  if (!sessionActive){ showError("Start the session first."); return; }
  try{
    await avatar.speak({ sessionId: sid, text: "This is a test sentence.", task_type: TaskType.REPEAT });
    log("Test speak sent.");
  }catch(e){ showError("Speak failed: " + (e?.message||e)); }
});

/* On load */
log("Diagnostic script loaded. Click Start once.");
