// ===== Minimal: auto-start on load (muted), CDN SDK, direct <video> attach =====

// DOM
const video    = document.getElementById("avatarVideo");
const unmute   = document.getElementById("unmuteBtn");
const stopBtn  = document.getElementById("stopBtn");
const banner   = document.getElementById("banner");
const logEl    = document.getElementById("log");

// Log helpers
function log(...a){ console.log("[avatar]", ...a); if (logEl){ logEl.textContent += a.join(" ")+"\n"; logEl.scrollTop = logEl.scrollHeight; } }
function errorBox(msg){ console.error(msg); if (banner){ banner.textContent = msg; banner.classList.add("show"); } }

// API token
async function getToken(){
  log("1) GET /api/token …");
  const r = await fetch("/api/token");
  let j = null; try { j = await r.json(); } catch { /* ignore */ }
  if (!r.ok || !j?.token) throw new Error(`Token error: ${j?.error || r.status}`);
  log("2) Token OK");
  return j.token;
}

// SDK from CDN only (avoid bundler/export issues)
async function loadSDK(){
  log("3) Import SDK from CDN …");
  const mod = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@heygen/streaming-avatar@2/+esm")
    .catch(e => { throw new Error("CDN import failed: "+(e?.message||e)); });
  const StreamingAvatar = mod.StreamingAvatar || mod.default;
  const StreamingEvents = mod.StreamingEvents || mod.default?.StreamingEvents || {};
  const TaskType        = mod.TaskType || mod.default?.TaskType || { REPEAT: "REPEAT" };
  const AvatarQuality   = mod.AvatarQuality || mod.default?.AvatarQuality || { Medium: "medium" };
  if (!StreamingAvatar) throw new Error("Could not resolve StreamingAvatar from SDK");
  log("4) SDK loaded");
  return { StreamingAvatar, StreamingEvents, TaskType, AvatarQuality };
}

// State
let avatar = null, sid = null, started = false;

// Attach stream to <video>
async function attachStream(stream){
  video.srcObject = stream;
  video.muted = true;           // keep muted until user clicks Unmute
  video.volume = 1.0;
  try { await video.play().catch(()=>{}); } catch {}
  log("7) Stream attached to <video> (muted)");
}

// Start once (auto-run on load)
async function startOnce(){
  if (started) return; started = true;
  try{
    const { StreamingAvatar, StreamingEvents, TaskType, AvatarQuality } = await loadSDK();
    const token = await getToken();

    log("5) new StreamingAvatar …");
    avatar = new StreamingAvatar({ token });

    // If STREAM_READY never arrives, tell the user why it *usually* happens.
    let ready = false;
    const guard = setTimeout(()=>{
      if (!ready) errorBox("No STREAM_READY in 12s. Common causes:\n• Corporate firewall blocks WebRTC\n• Credits exhausted\n• Browser extension blocks media");
    }, 12000);

    avatar.on?.(StreamingEvents?.STREAM_READY || "STREAM_READY", async (ev)=>{
      ready = true; clearTimeout(guard);
      log("6) STREAM_READY");
      const stream = ev?.detail?.stream || ev?.detail || ev?.stream;
      if (!stream){ errorBox("STREAM_READY fired but no MediaStream"); return; }
      await attachStream(stream);

      // Quick inaudible line (until unmuted)
      try {
        await avatar.speak({ sessionId: sid, text: "Hello! Click Unmute to hear me.", task_type: TaskType.REPEAT });
        log("8) Speak request sent (muted)");
      } catch {}
    });

    avatar.on?.(StreamingEvents?.ERROR || "ERROR", (e)=> errorBox("SDK ERROR: " + JSON.stringify(e)));
    avatar.on?.(StreamingEvents?.STREAM_DISCONNECTED || "STREAM_DISCONNECTED", ()=> log("STREAM_DISCONNECTED"));

    log("6a) createStartAvatar …");
    const session = await avatar.createStartAvatar({
      avatarName: "default",
      language: "en",
      quality: AvatarQuality.Medium,
      activityIdleTimeout: 30,
      knowledgeBase: "Greet once. Minimal auto-start build."
    }).catch((e)=> { errorBox("createStartAvatar failed: " + (e?.message || e)); throw e; });

    sid = session?.session_id;
    if (!sid) throw new Error("No session_id");
    log("6b) Session started:", sid);

  }catch(e){
    errorBox("Failed to start: " + (e?.message || e));
    started = false; // allow retry on refresh
  }
}

// Unmute
async function unmuteAudio(){
  try{
    video.muted = false; video.volume = 1.0;
    await video.play().catch(()=>{});
    // Hidden <audio> sink to satisfy Chrome edge-cases
    let sink = document.getElementById("audioSink");
    if (!sink){
      sink = document.createElement("audio");
      sink.id = "audioSink"; sink.style.display = "none";
      document.body.appendChild(sink);
    }
    sink.srcObject = video.srcObject;
    sink.muted = false; sink.volume = 1.0;
    await sink.play().catch(()=>{});
    log("9) Unmuted.");
  }catch(err){ errorBox("Unmute failed: " + (err?.message || err)); }
}

// Stop
async function stopSession(){
  try{
    if (sid){
      await fetch("/api/stop", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ sessionId: sid }) });
    }
  }catch{}
  try{ avatar?.disconnect?.(); }catch{}
  sid=null; avatar=null; started=false;
  try{ video.pause(); video.srcObject=null; }catch{}
  log("Stopped.");
}

// Wire buttons
unmute.addEventListener("click", unmuteAudio);
stopBtn.addEventListener("click", stopSession);

// Auto-start on page load
window.addEventListener("load", startOnce);

// Extra: if a click happens before load, also try starting
document.addEventListener("pointerdown", ()=>{ if (!started) startOnce(); }, { once:true, capture:true });

// Boot log
log("0) Loaded. Auto-start muted. Then click Unmute to hear audio.");
