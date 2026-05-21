import { db } from "../db/schema";

const TTS_SERVICE_URL = process.env["TTS_SERVICE_URL"] ?? "http://localhost:8001";

interface PhoneticRow {
  word: string;
  phonetic: string;
}

function escapeRegex(str: string): string {
  const specials = [
    ".",
    "*",
    "+",
    "?",
    "^",
    "$",
    "{",
    "}",
    "(",
    ")",
    "|",
    "[",
    "]",
    "\\",
  ];
  let result = str;
  for (const char of specials) {
    result = result.split(char).join("\\" + char);
  }
  return result;
}

function applyPhoneticDict(text: string, dict: PhoneticRow[]): string {
  let result = text;
  // Sort by length descending to match longer phrases first
  const sortedDict = [...dict].sort((a, b) => b.word.length - a.word.length);
  
  for (const { word, phonetic } of sortedDict) {
    if (!word.trim()) continue;
    const escaped = escapeRegex(word);
    const re = new RegExp(`(?<![a-zA-Z0-9'])${escaped}(?![a-zA-Z0-9'])`, "gi");
    const nextResult = result.replace(re, phonetic);
    if (nextResult !== result) {
      console.log(`[Phonetic] Replaced "${word}" with "${phonetic}"`);
    }
    result = nextResult;
  }
  return result;
}

export async function handleTtsProxy(req: Request, userId: number): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/api/tts/status") {
    const upstream = await fetch(`${TTS_SERVICE_URL}/status`);
    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tts/synthesize") {
    const body = (await req.json()) as { text: string; speed: number; speaker_wav?: string };

    // Apply user's phonetic dictionary (Backend fallback)
    const dict = db
      .query<PhoneticRow, [number]>("SELECT word, phonetic FROM phonetic_dict WHERE user_id = ?")
      .all(userId);
    
    const processedText = applyPhoneticDict(body.text, dict);
    console.log(`[TTS Proxy] Processing request: "${body.text.substring(0, 30)}..." -> "${processedText.substring(0, 30)}..."`);

    const upstream = await fetch(`${TTS_SERVICE_URL}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, text: processedText }),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "audio/wav",
      },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
