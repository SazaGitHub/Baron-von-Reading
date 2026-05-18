import { db } from "../db/schema";

const TTS_SERVICE_URL = process.env["TTS_SERVICE_URL"] ?? "http://localhost:8001";

interface PhoneticRow {
  word: string;
  phonetic: string;
}

function applyPhoneticDict(text: string, dict: PhoneticRow[]): string {
  let result = text;
  for (const { word, phonetic } of dict) {
    // Replace whole-word occurrences (case-insensitive)
    const re = new RegExp(`\b${word.replace(/[.*+?^${}()|[\]\]/g, "\$&")}\b`, "gi");
    result = result.replace(re, phonetic);
  }
  return result;
}

export async function handleTtsProxy(req: Request, userId: number): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/api/tts/synthesize") {
    const body = (await req.json()) as { text: string; speed: number; speaker_wav?: string };

    // Apply user's phonetic dictionary
    const dict = db
      .query<PhoneticRow, [number]>("SELECT word, phonetic FROM phonetic_dict WHERE user_id = ?")
      .all(userId);
    const processedText = applyPhoneticDict(body.text, dict);

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
