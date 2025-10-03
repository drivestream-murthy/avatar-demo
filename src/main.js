import StreamingAvatar, { StreamingEvents, TaskType, AvatarQuality } from "@heygen/streaming-avatar";

const video   = document.getElementById("avatarVideo");
const start   = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const banner  = document.getElementById("banner");
const logEl   = document.getElementById("log");

const log = (...a)=>{ console.log("[avatar]", ...a); logEl.textContent += a.join(" ")+"\n"; logEl.scrollTop = logEl.scrollHeight; };
const errorBox = (m)=>{ console.error(m); banner.textContent = m; banner.classList.add("show"); };

async function getToken(){
  const r = await fetch("/api/token"); const j = await r.json().catch(()=>null);
  if (!r.ok || !j?.token) throw new Error("Token error: " + (j?.error || r.status));
  return j.token;
}
async function unlockAudio(){
  try{ const AC = window.AudioContext||window.webkitAudioContext; if (AC){ const ctx=new AC(); if (ctx.state==="suspended") await ctx.resume(); } }catch{}
  try{ video.muted=false; video.volume=1.0; await video.play().catch(()=>{}); }catch{}
}

let avatar=null, sid=null, active=false;

async function startSession(){
  banner.classList.remove("show");
  try{
    await unlockAudio();
    const token = await getToken();

    avatar = new StreamingAvatar({ token });

    avatar.on(StreamingEvents.STREAM_READY, async (ev)=>{
      const stream = ev?.detail?.stream || ev?.detail || ev?.stream;
      if (!stream) return errorBox("STREAM_READY but no MediaStream");

      video.srcObject = stream;
      video.muted = false; video.volume = 1.0;
      try { await video.play(); } catch {}

      // hidden audio sink so Chrome always plays sound
      let sink = document.getElementById("audioSink");
      if (!sink){ sink = document.createElement("audio"); sink.id="audioSink"; sink.style.display="none"; document.body.appendChild(sink); }
      sink.srcObject = stream; sink.muted = false; sink.volume = 1.0;
      try { await sink.play().catch(()=>{}); } catch {}
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, ()=>{ active=false; sid=null; start.textContent="▶ Start"; });

    const session = await avatar.createStartAvatar({
      avatarName: "default",
      language: "en",
      quality: AvatarQuality.Medium,
      activityIdleTimeout: 30,
      knowledgeBase: "Greet once, then ask for the user's name and university. Answer general questions briefly."
    });

    sid = session?.session_id;
    if (!sid) throw new Error("No session_id");
    active = true; start.textContent="■ Stop";

    await avatar.speak({
      sessionId: sid,
      text: "Hi there! How are you? I hope you're doing good. What is your name, and where are you studying?",
      task_type: TaskType.REPEAT
    });

    log("Session started:", sid);
  }catch(e){ errorBox("Failed to start: " + (e?.message || e)); }
}

async function stopSession(){
  try{ if (sid) await fetch("/api/stop",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:sid})}); }catch{}
  try{ avatar?.disconnect?.(); }catch{}
  active=false; sid=null; start.textContent="▶ Start"; log("Stopped.");
}

start.addEventListener("click", ()=> active ? stopSession() : startSession());
stopBtn.addEventListener("click", stopSession);

log("Ready. Click Start once.");
