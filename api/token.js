export default async function handler(req, res) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Missing HEYGEN_API_KEY env var" });
  try {
    const r = await fetch("https://api.heygen.com/v1/streaming.create_token", {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const body = await r.json().catch(()=> ({}));
    if (!r.ok || !body?.data?.token) {
      return res.status(r.status || 500).json({ error: body?.message || "Token create failed", raw: body });
    }
    return res.status(200).json({ token: body.data.token });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}