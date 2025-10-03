/* Ultra-simple: one tap starts, CDN SDK import, direct <video> audio */

// DOM
const video   = document.getElementById("avatarVideo");
const overlay = document.getElementById("tapOverlay");
const banner  = document.getElementById("banner");
const logEl   = document.getElementById("log");

// Logs / errors
function log(...a){ console.log("[avatar]", ...a); if (logEl){ logEl.textContent += a.join(" ")+"\n"; logEl.scrollTop = logEl.scrollHeight; } }
function err(msg){ console.error(msg); if (banner){ banner.textContent = msg; banner.classList.add("show"); } }

// Helpers
async function getToken(){
  log("GET /api/token …");
  const r = await fetch("/api/token");
  const j = await r.json().catch(()=>null);
  if (!r.ok || !j?.token) throw new Error("Token error: " + (j?.error || r.status));
  log("Token OK");
  return j.token;
}

async function unlockAudio(){
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const ctx = new AC(); if (ctx.state === "suspended") await ctx.resume(); }
  } catch {}
  try {
    video.muted = false; video.volume = 1.0;
    await video.play().catch(()=>{ /* ignore */ });
  } catch {}
}

// State
let avatar = null, sid = null;

// Start once (idempotent)
let started = false;
async function startOnce(){
  if (started) return; started = true;
  overlay.classList.add("hidden");

  try{
    await unlockAudio();

    // Load SDK from CDN to avoid bundling/export mismatches
    log("Importing SDK from CDN …");
    const mod = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@heygen/streaming-avatar@2/+esm");
    const StreamingAvatar  = mod.StreamingAvatar || mod.default;
    const StreamingEvents  = mod.StreamingEvents || mod.default?.StreamingEvents || {};
    const TaskType         = mod.TaskType || mod.default?.TaskType || { REPEAT: "REPEAT" };
    const AvatarQuality    = mod.AvatarQuality || mod.default?.AvatarQuality || { Medium: "medium" };
    if (!StreamingAvatar) throw new Error("Could not resolve StreamingAvatar class");

    const token = await getToken();

    log("new StreamingAvatar …");
    avatar = new StreamingAvatar({ token });

    // If STREAM_READY never arrives, warn
    let ready = false;
    const watchdog = setTimeout(()=>{ if (!ready) err("No STREAM_READY in 10s. Check firewall/credits/autoplay."); }, 10000);

    const onReady = StreamingEvents?.STREAM_READY || "STREAM_READY";
    avatar.on?.(onReady, async (ev)=>{
      ready = true; clearTimeout(watchdog);
      log("STREAM_READY");

      const stream = ev?.detail?.stream || ev?.detail || ev?.stream;
      if (!stream){ err("STREAM_READY fired but no MediaStream"); return; }

      // Attach to <video>
      video.srcObject = stream;
      video.muted = false; video.volume = 1.0;
      try { await video.play(); } catch {}

      // Hidden <audio> to satisfy Chrome autoplay
      let sink = document.getElementById("audioSink");
      if (!sink){
        sink = document.createElement("audio");
        sink.id = "audioSink";
        sink.style.display = "none";
        document.body.appendChild(sink);
      }
      try{
        sink.srcObject = stream;
        sink.muted = false; sink.volume = 1.0;
        await sink.play().catch(()=>{});
      }catch{}
    });

    avatar.on?.(StreamingEvents?.ERROR || "ERROR", (e)=> err("SDK ERROR: " + JSON.stringify(e)));
    avatar.on?.(StreamingEvents?.STREAM_DISCONNECTED || "STREAM_DISCONNECTED", ()=> log("STREAM_DISCONNECTED"));

    log("createStartAvatar …");
    const session = await avatar.createStartAvatar({
      avatarName: "default",
      language: "en",
      quality: AvatarQuality.Medium,     // keep credits low while testing
      activityIdleTimeout: 30,           // your idle policy
      knowledgeBase: "Greet once. Be concise. Diagnostic start."
    }).catch((e)=>{ err("createStartAvatar failed: " + (e?.message || e)); throw e; });

    sid = session?.session_id;
    if (!sid) throw new Error("No session_id");
    log("Session started:", sid);

    // Say one line so you can hear it
    await avatar.speak({
      sessionId: sid,
      text: "Hello! If you can hear me, everything is working.",
      task_type: TaskType.REPEAT
    });
    log("Initial speak sent.");
  }catch(e){
    err("Failed to start: " + (e?.message || e));
    started = false; // allow retry if something failed
    overlay.classList.remove("hidden");
  }
}

// Bind: any tap inside the stage starts it
overlay.addEventListener("click", startOnce);

// Also: first pointerdown anywhere on the page (backup)
document.addEventListener("pointerdown", ()=> startOnce(), { once:true, capture:true });

// Debug helper
log("Loaded. Tap the stage once to start.");
