export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Missing HEYGEN_API_KEY env var" });
  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body||"{}") : (req.body || {});
    const sessionId = payload.sessionId;
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });
    const r = await fetch("https://api.heygen.com/v1/streaming.stop", {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId })
    });
    const body = await r.json().catch(()=> ({}));
    if (!r.ok) return res.status(r.status).json(body);
    return res.status(200).json({ ok: true, data: body });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}