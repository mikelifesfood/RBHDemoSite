// RBH Safety Language V1 - Supabase Edge Function
// Purpose: authenticated, server-side translation for report reading/PDF presentation.
// Original incident data is never changed by this function.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

function outputText(data: any): string {
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

function cleanJsonText(text: string): string {
  return String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) return json({ error: "AUTH_REQUIRED" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "SUPABASE_ENV_MISSING" }, 503);
  if (!openaiKey) return json({ error: "TRANSLATION_NOT_CONFIGURED" }, 503);

  // Validate the caller's current Supabase Auth session.
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData?.user) return json({ error: "INVALID_SESSION" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const targetLanguage = String(body?.targetLanguage || "").trim();
  const fields = body?.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields : null;
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(targetLanguage) || !fields) {
    return json({ error: "INVALID_REQUEST" }, 400);
  }

  const normalized: Record<string, string> = {};
  let charCount = 0;
  for (const [key, value] of Object.entries(fields).slice(0, 100)) {
    if (typeof value !== "string") continue;
    charCount += value.length;
    if (charCount > 40000) return json({ error: "TRANSLATION_TOO_LARGE" }, 413);
    normalized[String(key)] = value;
  }
  if (!Object.keys(normalized).length) return json({ translations: {} });

  const aiResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_TRANSLATION_MODEL") || "gpt-5-mini",
      instructions: [
        "You are a safety-report translation service.",
        `Translate every value into ${targetLanguage}. Detect the language of each value independently because a record may contain mixed languages.`,
        "Return ONLY one JSON object with exactly the same keys and string values.",
        "Do not summarize, interpret, soften, add, or omit facts.",
        "Preserve proper names, addresses, email addresses, phone numbers, identifiers, dates, measurements, model numbers, regulatory citations, and file names unless ordinary words within them clearly require translation.",
        "For safety, medical, legal, and regulatory wording, translate faithfully without adding advice or conclusions.",
      ].join(" "),
      input: JSON.stringify(normalized),
    }),
  });

  const aiData = await aiResp.json();
  if (!aiResp.ok) {
    console.error("Translation provider error", aiData);
    return json({ error: "TRANSLATION_PROVIDER_ERROR" }, 502);
  }

  let translations: any;
  try {
    translations = JSON.parse(cleanJsonText(outputText(aiData)));
  } catch (err) {
    console.error("Translation JSON parse error", err);
    return json({ error: "INVALID_TRANSLATION_RESPONSE" }, 502);
  }

  if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
    return json({ error: "INVALID_TRANSLATION_RESPONSE" }, 502);
  }

  const safe: Record<string, string> = {};
  for (const key of Object.keys(normalized)) {
    safe[key] = typeof translations[key] === "string" ? translations[key] : normalized[key];
  }

  return json({ translations: safe });
});
