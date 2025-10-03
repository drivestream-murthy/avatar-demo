export default async function handler(req, res) {
  try {
    const key = process.env.HEYGEN_API_KEY;
    if (!key) return res.status(500).json({ error: "HEYGEN_API_KEY is missing" });

    const r = await fetch("https://api.heygen.com/v1/streaming.create_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": key },
      body: "{}"
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) return res.status(r.status).json({ error: j?.message || "HeyGen token error", details: j });

    const token = j?.data?.token || j?.token || j?.data;
    if (!token) return res.status(500).json({ error: "No token returned", raw: j });

    res.status(200).json({ token });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
}
