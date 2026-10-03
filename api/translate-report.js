// RBH Safety Language V1 - server-side translation endpoint for Vercel.
// OPENAI_API_KEY stays server-side. The Supabase anon key below is publishable and is
// used only to validate the signed-in user's access token with Supabase Auth.

const DEFAULT_SUPABASE_URL = 'https://owhkxguiavgxzwvbxevj.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93aGt4Z3VpYXZneHp3dmJ4ZXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Nzk4ODcsImV4cCI6MjEwNTE1NTg4N30.rBwR7sKelzzyTd6XpFrMIjg5W42TpEO_QefnOxzftrc';

function outputText(data) {
  if (data && typeof data.output_text === "string") return data.output_text;
  const out = data && Array.isArray(data.output) ? data.output : [];
  for (const item of out) {
    const content = item && Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (part && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

function cleanJsonText(text) {
  return String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

  const auth = req.headers.authorization || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return res.status(401).json({ error: "AUTH_REQUIRED" });

  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: "TRANSLATION_NOT_CONFIGURED" });

  // Validate the caller with Supabase Auth so the translation endpoint is not public.
  const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: supabaseAnonKey }
  });
  if (!userResp.ok) return res.status(401).json({ error: "INVALID_SESSION" });

  const body = req.body || {};
  const targetLanguage = String(body.targetLanguage || "").trim();
  const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields : null;
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(targetLanguage) || !fields) {
    return res.status(400).json({ error: "INVALID_REQUEST" });
  }

  const normalized = {};
  let charCount = 0;
  for (const [key, value] of Object.entries(fields).slice(0, 100)) {
    if (typeof value !== "string") continue;
    charCount += value.length;
    if (charCount > 40000) return res.status(413).json({ error: "TRANSLATION_TOO_LARGE" });
    normalized[String(key)] = value;
  }
  if (!Object.keys(normalized).length) return res.status(200).json({ translations: {} });

  const aiResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TRANSLATION_MODEL || "gpt-5.6-luna",
      instructions: [
        "You are a safety-report translation service.",
        `Translate every value into ${targetLanguage}. Detect the language of each value independently because a record may contain mixed languages.`,
        "Return ONLY one JSON object with exactly the same keys and string values.",
        "Do not summarize, interpret, soften, add, or omit facts.",
        "Preserve proper names, addresses, email addresses, phone numbers, identifiers, dates, measurements, model numbers, regulatory citations, and file names unless ordinary words within them clearly require translation.",
        "For safety, medical, legal, and regulatory wording, translate faithfully without adding advice or conclusions."
      ].join(" "),
      input: JSON.stringify(normalized)
    })
  });

  const aiData = await aiResp.json();
  if (!aiResp.ok) {
    console.error("OpenAI translation error", aiData);
    return res.status(502).json({ error: "TRANSLATION_PROVIDER_ERROR" });
  }

  let translations;
  try { translations = JSON.parse(cleanJsonText(outputText(aiData))); }
  catch (err) {
    console.error("Translation JSON parse error", err);
    return res.status(502).json({ error: "INVALID_TRANSLATION_RESPONSE" });
  }
  if (!translations || typeof translations !== "object" || Array.isArray(translations)) return res.status(502).json({ error: "INVALID_TRANSLATION_RESPONSE" });

  const safe = {};
  for (const key of Object.keys(normalized)) safe[key] = typeof translations[key] === "string" ? translations[key] : normalized[key];
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ translations: safe });
}
