
import StreamingAvatar, { StreamingEvents, TaskType, AvatarQuality } from "@heygen/streaming-avatar";

const banner = document.getElementById("banner");
const stageEl = document.getElementById("stage");
const avatarVideo = document.getElementById("avatarVideo");
const avatarCanvas = document.getElementById("avatarCanvas");
const overlay = document.getElementById("stageOverlay");
const overlayFrame = document.getElementById("overlayFrame");
const ytContainer = document.getElementById("ytContainer");
const overlayToggle = document.getElementById("overlayToggle");
const closeOverlayBtn = document.getElementById("closeOverlay");
const micChip = document.getElementById("micChip");
const micLabel = document.getElementById("micLabel");
const sessionFab = document.getElementById("sessionFab");
const resetBtn = document.getElementById("resetBtn");
const confirmBar = document.getElementById("confirmBar");
const confirmYes = document.getElementById("confirmYes");
const confirmNo = document.getElementById("confirmNo");
const menuERP = document.getElementById("menuERP");
const menuDS = document.getElementById("menuDS");
const askForm = document.getElementById("ask");
const inputEl = document.getElementById("text");
const spinner = document.getElementById("spinner");
const showSpinner = (on=true)=> spinner.style.display = on ? "flex" : "none";

const showError = (msg)=>{ banner.textContent = msg; banner.classList.add("show"); console.error(msg); };
const hideError = ()=>banner.classList.remove("show");
const sleep = (ms)=>new Promise(r=>setTimeout(r, ms));
const titleCase = (s)=>s.replace(/\b\w/g, ch => ch.toUpperCase());

async function getToken(){
  const r = await fetch("/api/token");
  const j = await r.json().catch(()=>null);
  if (!r.ok || !j?.token) throw new Error("Token error: " + (j?.error || "no token"));
  return j.token;
}

// backgrounds
const BG = {
  DEFAULT: "/assets/default-image.jpg",
  STANFORD: "/assets/stanford-university-title.jpg",
  HARVARD: "/assets/harvard-university-title.jpg",
  OXFORD: "/assets/oxford-university-title.jpg"
};
function applyBg(key="DEFAULT"){ stageEl.style.backgroundImage = `url(${BG[key]||BG.DEFAULT})`; }
function resetToDefault(){ applyBg("DEFAULT"); }
const UNI_MAP = [
  { keys: ["stanford","stanford university"], bg: "STANFORD" },
  { keys: ["harvard","harvard university"],   bg: "HARVARD"  },
  { keys: ["oxford","oxford university","university of oxford"], bg: "OXFORD" }
];
function detectUniversity(text){
  const q = (text||"").toLowerCase();
  for (const {keys,bg} of UNI_MAP) if (keys.some(k => q.includes(k))) return bg;
  return null;
}

// modules (HCM not mapped to Module 2)
const SYNTHESIA_ID = "dd552b45-bf27-48c4-96a6-77a2d59e63e7";
const MODULES = {
  "module 1": { type: "synthesia", url: `https://share.synthesia.io/embeds/videos/${SYNTHESIA_ID}?autoplay=1&mute=1` },
  "module 2": { type: "youtube",   youtubeId: "I2oQuBRNiHs" }
};
const MODULE_SYNONYMS = {
  "module 1": ["erp module 1","module 1","mod 1","m1","one","1","finance","financial","accounting","accounts","ledger","bookkeeping","finance & accounting","finance and accounting","financial accounting","f&a","fa","fin & acc","fin acc","fin/accounting"],
  "module 2": ["erp module 2","module 2","mod 2","m2","two","2","human resources","human resource","hr","human res","people","talent","talent management","people ops","recruitment","onboarding","payroll","hrms"]
};
const normalize = (s)=> (s||"").toLowerCase().replace(/[^a-z0-9\s&]/g," ").replace(/\s+/g," ").trim();
function levenshtein(a,b){a=a||"";b=b||"";const m=a.length,n=b.length;if(!m)return n;if(!n)return m;const dp=Array.from({length:m+1},(_,i)=>Array(n+1).fill(0));for(let i=0;i<=m;i++)dp[i][0]=i;for(let j=0;j<=n;j++)dp[0][j]=j;for(let i=1;i<=m;i++){for(let j=1;j<=n;j++){const c=a[i-1]===b[j-1]?0:1;dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+c)}}return dp[m][n]}
function phraseScore(text,phrase){const t=normalize(text),p=normalize(phrase);if(!t||!p)return 0;if(t.includes(p))return 1;const tks=t.split(" "),pks=p.split(" ");let hits=0;for(const pk of pks){if(tks.includes(pk)){hits++;continue}const th=pk.length>=6?2:(pk.length>=4?1:0);if(tks.some(w=>levenshtein(w,pk)<=th))hits++}const overlap=hits/pks.length;const dist=levenshtein(t,p);const whole=p.length?1-(dist/Math.max(p.length,1)):0;return Math.max(overlap*.8+whole*.2,whole*.7)}
function resolveModuleKey(text){
  const t = normalize(text);
  if (/\b(erp)?\s*(module)?\s*(1|one)\b/.test(t)) return "module 1";
  if (/\b(erp)?\s*(module)?\s*(2|two)\b/.test(t)) return "module 2";
  let best={key:null,score:0};
  for(const key of Object.keys(MODULE_SYNONYMS)){
    const s = MODULE_SYNONYMS[key].reduce((mx,ph)=>Math.max(mx, phraseScore(t, ph)), 0);
    if(s>best.score) best={key,score:s};
  }
  return best.score>=0.36?best.key:null;
}

// DS topics
const DS = {
  home:     { keys:["drivestream","website","home"], summary:"Drivestream delivers Oracle Cloud consulting and enterprise transformation.", url:"http://www.drivestream.com/" },
  about:    { keys:["about","company","the company"], summary:"Learn about Drivestream’s mission, leadership and story.", url:"https://www.drivestream.com/the-company/" },
  partners: { keys:["partners","partnerships"], summary:"Explore Drivestream’s partner ecosystem.", url:"https://www.drivestream.com/partners/" },
  team:     { keys:["team","meet the team","leadership","management","ceo","cto","cfo","coo","board","director","vp"], summary:"Meet the leadership and team (names & titles).", url:"https://www.drivestream.com/meet-the-team/" },
  consulting:{ keys:["consulting","oracle cloud consulting"], summary:"Consulting services for Oracle Cloud across ERP and HCM.", url:"https://www.drivestream.com/oracle-cloud-consulting/" },
  subscription:{ keys:["subscription","services subscription","subscr"], summary:"Oracle Cloud Services Subscription options and bundles.", url:"https://www.drivestream.com/oracle-cloud-services-subscription/" },
  erp:      { keys:["oracle cloud erp","erp"], summary:"Oracle Cloud ERP implementations and best practices.", url:"https://www.drivestream.com/oracle-cloud-erp/" },
  hcm:      { keys:["oracle cloud hcm","hcm","human capital"], summary:"Oracle Cloud HCM solutions for the full employee lifecycle.", url:"https://www.drivestream.com/oracle-cloud-hcm/" },
  payroll:  { keys:["payroll","hcm payroll"], summary:"Payroll with Oracle Cloud HCM.", url:"https://www.drivestream.com/oracle-cloud-hcm-payroll/" },
  advisory: { keys:["strategy","advisory","strategy and advisory"], summary:"Strategy & Advisory for your cloud journey.", url:"https://www.drivestream.com/strategy-and-advisory/" },
  ams:      { keys:["ams","managed services","application management","support"], summary:"Application Managed Services (AMS) for Oracle Cloud.", url:"https://www.drivestream.com/ams/" },
  industries:{ keys:["industries","verticals","sectors"], summary:"Industries served: financial services, professional services, retail, high tech, utilities, healthcare, manufacturing.", url:"https://www.drivestream.com/industries/" },
  customers:{ keys:["customers","clients","case studies"], summary:"Customer stories and outcomes.", url:"https://www.drivestream.com/customers/" },
  finserv:  { keys:["financial services","fs","banking"], summary:"Oracle Cloud solutions for Financial Services.", url:"https://www.drivestream.com/financial-services/" },
  profserv: { keys:["professional services","ps"], summary:"Oracle Cloud solutions for Professional Services.", url:"https://www.drivestream.com/professional-services/" },
  retail:   { keys:["retail"], summary:"Oracle Cloud for Retail.", url:"https://www.drivestream.com/retail/" },
  hightech: { keys:["high tech","high-tech","tech"], summary:"Oracle Cloud for High Tech.", url:"https://www.drivestream.com/high-tech/" },
  utilities:{ keys:["utilities","utility"], summary:"Oracle Cloud for Utilities.", url:"https://www.drivestream.com/utilities/" },
  healthcare:{ keys:["healthcare","health care","hc"], summary:"Oracle Cloud for Healthcare.", url:"https://www.drivestream.com/healthcare/" },
  manufacturing:{ keys:["manufacturing","mfg"], summary:"Oracle Cloud for Manufacturing.", url:"https://www.drivestream.com/manufacturing/" }
};
function resolveDSTopic(text){
  const q = normalize(text);
  for (const [k,{keys}] of Object.entries(DS)) if (keys.some(term=>q.includes(normalize(term)))) return k;
  if (q.includes("drivestream")) return "home";
  return null;
}

// YouTube ready
let youTubeReady; {
  let _resolve; youTubeReady = new Promise(res => { _resolve = res; });
  const wait = () => { if (window.YT && window.YT.Player) return _resolve(); setTimeout(wait, 50); };
  window.onYouTubeIframeAPIReady = () => _resolve(); wait();
}

// overlay
let ytPlayer = null;
function hideOverlay({resetBg=false}={}) {
  overlayFrame.src = "about:blank";
  if (ytPlayer) { try { ytPlayer.destroy(); } catch {} ytPlayer = null; }
  ytContainer.innerHTML = "";
  showSpinner(false);
  overlay.style.display = "none"; overlayToggle.style.display = "none"; stageEl.classList.remove("min");
  if (resetBg) resetToDefault();
}

// voice
let rec, recSupported, listening=false, autoRestart=true;
(function detectSR(){ const SR = window.SpeechRecognition || window.webkitSpeechRecognition; recSupported = !!SR; })();
function setMicUI(on, label){ micChip.classList.toggle("listening", !!on); micLabel.textContent = label || (on ? "listening…" : "voice off"); }
export function startMic() {
  if (!recSupported) { setMicUI(false, "voice not supported (Chrome)"); return; }
  if (rec) return; const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  rec = new SR(); rec.lang = "en-US"; rec.interimResults = false; rec.continuous = true; rec.maxAlternatives = 1;
  rec.onstart = ()=> setMicUI(true, "listening…");
  rec.onresult = (ev) => { const t = ev.results?.[ev.results.length - 1]?.[0]?.transcript; if (t) { inputEl.value = t; askForm.requestSubmit(); } };
  rec.onerror = ()=> setMicUI(false, "voice paused");
  rec.onend = () => { setMicUI(false, "restarting…"); listening=false; if (autoRestart) { try { rec.start(); listening=true; setMicUI(true,"listening…"); } catch{} } };
  try { rec.start(); listening=true; setMicUI(true,"listening…"); } catch {}
}

// unlock audio
async function unlockAudioOnce(){
  try{ const AC = window.AudioContext || window.webkitAudioContext; if (AC) { const ctx = new AC(); if (ctx.state === 'suspended') await ctx.resume(); } }catch(e){}
  try{ avatarVideo.muted = false; avatarVideo.volume = 1.0; await avatarVideo.play().catch(()=>{}); }catch(e){}
  try{ startMic(); }catch(e){}
  window.removeEventListener('pointerdown', unlockAudioOnce);
  window.removeEventListener('keydown', unlockAudioOnce);
  window.removeEventListener('touchstart', unlockAudioOnce);
}
window.addEventListener('pointerdown', unlockAudioOnce, { once:true });
window.addEventListener('keydown', unlockAudioOnce,   { once:true });
window.addEventListener('touchstart', unlockAudioOnce,{ once:true });

// chroma key
function startChromaKeyRendering() {
  const ctx = avatarCanvas.getContext("2d");
  let cw = stageEl.clientWidth, ch = stageEl.clientHeight;
  avatarCanvas.width = cw; avatarCanvas.height = ch;
  function draw() {
    try {
      const vw = avatarVideo.videoWidth || 640, vh = avatarVideo.videoHeight || 360;
      if (vw && vh) {
        const cr = cw / ch, vr = vw / vh;
        let sx=0, sy=0, sw=vw, sh=vh;
        if (vr > cr) { sw = Math.round(vh * cr); sx = Math.round((vw - sw) / 2); }
        else { sh = Math.round(vw / cr); sy = Math.round((vh - sh) / 2); }
        ctx.drawImage(avatarVideo, sx, sy, sw, sh, 0, 0, cw, ch);
        const img = ctx.getImageData(0, 0, cw, ch), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i+1], b = d[i+2];
          if (g > 80 && g > r + 20 && g > b + 20 && r < 160 && b < 160) d[i+3] = 0;
        }
        ctx.putImageData(img, 0, 0);
      }
    } catch {}
    requestAnimationFrame(draw);
  }
  draw();
  new ResizeObserver(() => { cw = stageEl.clientWidth; ch = stageEl.clientHeight; avatarCanvas.width = cw; avatarCanvas.height = ch; }).observe(stageEl);
}

// state
const state = { userName:null, universityBg:"DEFAULT", queue:[], autoplay:false, greeted:false, currentModule:null };
let awaitingConsent=false, consentForMod=null;

// session
let avatar, sid=null, sessionActive=false;

async function startSession() {
  try {
    const token = await getToken();
    avatar = new StreamingAvatar({ token });

    avatar.on(StreamingEvents.STREAM_READY, (event) => {
      const stream = event?.detail?.stream || event?.detail || event?.stream;
      if (!stream) { showError("Stream ready, but no MediaStream."); return; }
      avatarVideo.srcObject = stream;
      avatarVideo.muted = true; avatarVideo.play().catch(()=>{});
      avatarVideo.onloadedmetadata = () => startChromaKeyRendering();
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => { sessionActive=false; sid=null; sessionFab.textContent="▶ Start"; });

    const session = await avatar.createStartAvatar({
      avatarName: "default",
      quality: AvatarQuality.High,
      language: "en",
      activityIdleTimeout: 30,
      knowledgeBase: [
        "You are a friendly assistant for Drivestream and ERP training. Keep replies under 3 sentences.",
        "Greet only once at the beginning.",
        "Interpret short forms automatically: e.g., F&A, FA, M1, M2, HR, HCM, AMS, FS, PS.",
        "If asked about Drivestream, answer briefly and include a helpful page link when possible.",
        "If the question is out of scope, say: 'There isn’t enough information for that. Try asking about Drivestream or ERP Module 1/2.'"
      ].join(" ")
    });
    sid = session?.session_id;
    sessionActive = true;
    sessionFab.textContent = "■ Stop";

    if (!state.greeted) {
      await speakNext("Hi there! How are you? I hope you're doing good.");
      await sleep(400);
      await speakNext("What is your name, and where are you studying?");
      state.greeted = true;
    } else {
      const uniText = (state.universityBg && state.universityBg !== "DEFAULT")
        ? ` from ${state.universityBg.replace(/_/g,' ').toLowerCase()}` : "";
      await speakNext(`Welcome back${uniText}.`);
    }
  } catch (e) {
    showError("Failed to start avatar session. " + (e?.message || e));
    sessionActive = false; sid = null; sessionFab.textContent = "▶ Start";
  }
}
async function stopSession(reason="manual") {
  try { if (sid) await fetch("/api/stop", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ sessionId: sid }) }); } catch {}
  try { avatar?.disconnect?.(); } catch {}
  sessionActive = false; sid = null; sessionFab.textContent = "▶ Start";
}
function speak(text, task=TaskType.REPEAT){ return avatar.speak({ sessionId: sid, text, task_type: task }); }
async function speakNext(text){ try { await speak(text, TaskType.REPEAT); } catch(e){ showError("Speak failed: "+(e?.message||e)); } }
async function ensureSession() { if (!sessionActive) await startSession(); }

// flows
function showMenus(){ menuERP.classList.remove("hidden"); menuDS.classList.remove("hidden"); }
function hideMenus(){ menuERP.classList.add("hidden"); menuDS.classList.add("hidden"); }
function askOrQueueModulesFromUtterance(text) {
  const t = (text||"").toLowerCase();
  const wantsBoth = /\bboth\b|\b1\s*(and|&)\s*2\b|\b2\s*(and|&)\s*1\b/.test(t);
  const m1 = resolveModuleKey(t) === "module 1" || /\bmodule\s*1|finance|accounting\b/.test(t);
  const m2 = resolveModuleKey(t) === "module 2" || /\bmodule\s*2|human\s*resources|hr\b/.test(t);
  const q = [];
  if (wantsBoth) { q.push("module 1","module 2"); state.autoplay = true; }
  else { if (m1) q.push("module 1"); if (m2) q.push("module 2"); if (/\bplay\b/.test(t)) state.autoplay = true; }
  if (q.length) { state.queue = [...new Set(q)]; return true; }
  return false;
}
async function playNextInQueue() {
  const next = state.queue.shift();
  if (!next) { showMenus(); await speakNext("What would you like to do next?"); return; }
  await moduleFlow(next, { skipConsent: state.autoplay });
}
async function moduleFlow(modKey, { skipConsent=false } = {}) {
  hideMenus(); hideOverlay({resetBg:false});
  const notes = modKey==="module 1"
    ? "ERP Module 1 covers Finance and Accounting: recording transactions, summarizing them, and reporting via financial statements."
    : "ERP Module 2 covers Human Resources: hiring, onboarding, payroll, performance, and the overall employee lifecycle.";
  await speakNext(notes);
  if (skipConsent) { showModuleInFrame(modKey, { noAwaitStop: true }); return; }
  awaitingConsent = true; consentForMod = modKey; confirmBar.classList.remove("hidden");
  confirmYes.onclick = () => { awaitingConsent=false; confirmBar.classList.add("hidden"); showModuleInFrame(modKey, { noAwaitStop: true }); };
  confirmNo.onclick  = async () => { awaitingConsent=false; confirmBar.classList.add("hidden"); await speakNext("Okay, I’ll skip the video. What would you like next?"); showMenus(); };
}

const VIDEO_TIMEOUT_MS = { "module 1": 120000 };
async function showModuleInFrame(modKey, { noAwaitStop = true } = {}) {
  const m = MODULES[modKey]; if (!m) return false; state.currentModule = modKey;
  overlay.style.display = "block"; stageEl.classList.add("min"); showSpinner(true);

  if (sessionActive) {
    if (noAwaitStop) { stopSession("video"); } else { await stopSession("video"); }
  }

  if (m.type === "synthesia") {
    overlayFrame.classList.add("show"); ytContainer.classList.remove("show"); overlayToggle.style.display = "none";
    overlayFrame.onload = () => showSpinner(false);
    overlayFrame.src = m.url;
    const ms = VIDEO_TIMEOUT_MS[state.currentModule] ?? 120000;
    setTimeout(async () => {
      if (overlay.style.display !== "none") {
        hideOverlay();
        await ensureSession();
        await speakNext("The video has finished. Let's continue.");
        await playNextInQueue();
      }
    }, ms);
  } else if (m.type === "youtube") {
    await youTubeReady;
    overlayFrame.classList.remove("show");
    const div = document.createElement("div"); div.id = "ytInner";
    ytContainer.innerHTML = ""; ytContainer.appendChild(div); ytContainer.classList.add("show");
    ytPlayer = new YT.Player("ytInner", {
      videoId: m.youtubeId,
      playerVars: { autoplay: 1, mute: 1, rel: 0, modestbranding: 1, controls: 1 },
      events: {
        onReady: () => { try { ytPlayer.playVideo(); } catch {} showSpinner(false); },
        onStateChange: async (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            hideOverlay();
            await ensureSession();
            await speakNext("The video has finished. Let's continue.");
            await playNextInQueue();
          }
        }
      }
    });
    overlayToggle.style.display = "inline-block";
    overlayToggle.textContent = "⏸ Pause";
    overlayToggle.onclick = ()=>{
      if (!ytPlayer) return;
      const st = ytPlayer.getPlayerState();
      if (st === YT.PlayerState.PLAYING) { ytPlayer.pauseVideo(); overlayToggle.textContent = "▶ Play"; }
      else { ytPlayer.playVideo(); overlayToggle.textContent = "⏸ Pause"; }
    };
  }
  return true;
}
closeOverlayBtn.addEventListener("click", async ()=>{
  hideOverlay();
  await ensureSession();
  await speakNext("Closed the video. Let's continue.");
  await playNextInQueue();
});

async function handleDSTopic(dsKey){
  hideMenus(); hideOverlay();
  const t = DS[dsKey];
  if (!t) { await speakNext("There isn’t enough information for that."); return; }
  await speakNext(`${t.summary} You can learn more here: ${t.url}`);
  await speakNext("Would you like to hear about ERP training as well, or explore another Drivestream topic?");
  showMenus();
}

// RAG fallback
async function askRAG(query){
  try {
    const r = await fetch("/api/qa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const j = await r.json().catch(()=>null);
    if (!r.ok || !j?.answer) return null;
    return j;
  } catch { return null; }
}

askForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const txt = inputEl.value.trim(); inputEl.value = ""; if (!txt) return;
  hideError(); confirmBar.classList.add("hidden");

  if (awaitingConsent) {
    const t = (txt||"").toLowerCase();
    if (/\b(yes|yeah|sure|ok|okay|play|start)\b/.test(t)) {
      awaitingConsent = false; confirmBar.classList.add("hidden");
      showModuleInFrame(consentForMod, { noAwaitStop: true });
      return;
    }
    if (/\b(no|later|skip|not now)\b/.test(t)) {
      awaitingConsent = false; confirmBar.classList.add("hidden");
      await speakNext("Okay, I’ll skip the video. What would you like next?");
      showMenus(); return;
    }
  }

  const uniBg = detectUniversity(txt);
  if (uniBg) {
    state.universityBg = uniBg; applyBg(uniBg);
    await ensureSession();
    await speakNext(`Glad to hear from the great ${titleCase(uniBg.toLowerCase().replace(/_/g,' '))}.`);
    await speakNext("What would you like to know: Drivestream topics or ERP training?");
    showMenus(); return;
  }

  if (askOrQueueModulesFromUtterance(txt)) { await playNextInQueue(); return; }
  const modKey = resolveModuleKey(txt);
  if (modKey) { state.queue = [modKey]; await playNextInQueue(); return; }

  const dsKey = resolveDSTopic(txt);
  if (dsKey) { await handleDSTopic(dsKey); return; }

  const rag = await askRAG(txt);
  if (rag?.answer) {
    await ensureSession();
    await speakNext(rag.answer);
    if (rag?.citations?.length) {
      await speakNext(`You can read more here: ${rag.citations[0]}`);
    }
    showMenus();
    return;
  }

  await ensureSession();
  try { await avatar.speak({ sessionId: sid, text: txt, task_type: TaskType.TALK }); }
  catch { await speakNext("There isn’t enough information for that. Try asking about Drivestream, the leadership team, or ERP Module 1/2."); }
});

sessionFab.addEventListener("click", async ()=>{
  hideError();
  if (!sessionActive) { await startSession(); }
  else { await stopSession("manual"); }
});
resetBtn.addEventListener("click", async ()=>{
  await stopSession("reset");
  state.queue = []; state.autoplay=false; state.greeted=false; state.userName=null; state.currentModule=null; state.universityBg="DEFAULT";
  applyBg("DEFAULT"); hideOverlay({resetBg:false}); menuERP.classList.add("hidden"); menuDS.classList.add("hidden");
  await startSession();
});

resetToDefault();
