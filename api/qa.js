const PAGES = [
  "http://www.drivestream.com/",
  "https://www.drivestream.com/partners/",
  "https://www.drivestream.com/the-company/",
  "https://www.drivestream.com/meet-the-team/",
  "https://www.drivestream.com/oracle-cloud-consulting/",
  "https://www.drivestream.com/oracle-cloud-services-subscription/",
  "https://www.drivestream.com/oracle-cloud-erp/",
  "https://www.drivestream.com/oracle-cloud-hcm/",
  "https://www.drivestream.com/oracle-cloud-hcm-payroll/",
  "https://www.drivestream.com/strategy-and-advisory/",
  "https://www.drivestream.com/ams/",
  "https://www.drivestream.com/financial-services/",
  "https://www.drivestream.com/professional-services/",
  "https://www.drivestream.com/retail/",
  "https://www.drivestream.com/high-tech/",
  "https://www.drivestream.com/utilities/",
  "https://www.drivestream.com/healthcare/",
  "https://www.drivestream.com/manufacturing/",
  "https://www.drivestream.com/customers/"
];

const cache = new Map();
const TTL_MS = 10 * 60 * 1000;

function strip(html) {
  if (!html) return { title: "", text: "" };
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
  html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  html = html.replace(/<br\s*\/?>/gi, "\n");
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g," ").trim() : "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { title, text };
}

function tokenize(s){ return (s||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean); }
function uniq(a){ return Array.from(new Set(a)); }
function scoreChunk(qtoks, chunk){
  const toks = tokenize(chunk);
  if (!toks.length) return 0;
  let hits = 0;
  for (const q of uniq(qtoks)) { if (toks.includes(q)) hits += 1.5; }
  const qstr = qtoks.join(" ");
  if (qstr && chunk.toLowerCase().includes(qstr)) hits += 2;
  return hits / Math.sqrt(toks.length);
}
function splitIntoSentences(text){
  const parts = text.split(/(?<=[\.\?\!])\s+/);
  return parts.filter(Boolean);
}
function windows(sentences, maxChars=360){
  const out = [];
  let cur = "";
  for (const s of sentences){
    if ((cur + " " + s).length > maxChars) { if (cur) out.push(cur.trim()); cur = s; }
    else { cur += " " + s; }
  }
  if (cur) out.push(cur.trim());
  return out;
}
async function fetchPage(url){
  const now = Date.now();
  const ent = cache.get(url);
  if (ent && (now - ent.ts) < TTL_MS) return ent;
  const resp = await fetch(url, { method:"GET", headers: { "User-Agent": "Mozilla/5.0 (compatible; avatar-rag/1.0)" } });
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const html = await resp.text();
  const { title, text } = strip(html);
  const doc = { ts: now, title, text };
  cache.set(url, doc);
  return doc;
}
function chooseBestSnippet(query, corpus){
  const qtoks = tokenize(query);
  let best = null;
  for (const doc of corpus){
    const sents = splitIntoSentences(doc.text);
    const chunks = windows(sents, 360);
    for (const ch of chunks){
      const sc = scoreChunk(qtoks, ch);
      if (!best || sc > best.score) best = { score: sc, chunk: ch, url: doc.url, title: doc.title };
    }
  }
  return best;
}
function tryLeadershipShortcut(query, corpus){
  const q = query.toLowerCase();
  const interest = ["ceo","cto","cfo","coo","chief","president","vice president","svp","evp","director","board","founder"];
  if (!interest.some(k=>q.includes(k))) return null;
  const team = corpus.find(d => /meet the team/i.test(d.title) || /meet-the-team/.test(d.url));
  if (!team) return null;
  const lines = splitIntoSentences(team.text);
  const cand = lines.filter(s => interest.some(k => s.toLowerCase().includes(k)));
  if (cand.length){
    const snip = cand[0].replace(/\s+/g," ").trim();
    return { answer: `${snip}`, citations: [team.url] };
  }
  return null;
}

export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try{
    const body = typeof req.body === "string" ? JSON.parse(req.body||"{}") : (req.body||{});
    const query = (body.query || "").toString().trim();
    if (!query) return res.status(400).json({ error: "Missing query" });

    const corpus = [];
    for (const url of PAGES){
      try {
        const doc = await fetchPage(url);
        corpus.push({ url, title: doc.title || url, text: doc.text || "" });
      } catch {}
    }
    if (!corpus.length) return res.status(500).json({ error: "No pages available" });

    const shortc = tryLeadershipShortcut(query, corpus);
    if (shortc) return res.status(200).json({ answer: shortc.answer, citations: shortc.citations, source: "leadership" });

    const best = chooseBestSnippet(query, corpus);
    if (!best || best.score < 0.15){
      return res.status(200).json({ answer: "There isn’t enough information for that. Try asking about Drivestream services, industries, the leadership team, or ERP Module 1/2.", citations: [] });
    }
    const twoSentences = best.chunk.split(/(?<=[\.\?\!])\s+/).slice(0,2).join(" ");
    const answer = twoSentences.length > 20 ? twoSentences : `Here’s a useful detail: ${twoSentences}`;
    return res.status(200).json({ answer, citations: [best.url], source: "snippet" });
  }catch(e){
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}